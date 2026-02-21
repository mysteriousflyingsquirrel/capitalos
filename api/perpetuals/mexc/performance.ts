import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import { mexcPrivateGet, mexcPrivatePost, toNumber } from './shared.js'

let _adminInitialized = false
function initializeAdmin(): void {
  if (_adminInitialized || admin.apps.length > 0) { _adminInitialized = true; return }
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (sa) { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }) }
    else { admin.initializeApp() }
    _adminInitialized = true
  } catch (e) {
    if (e instanceof Error && e.message.includes('already exists')) { _adminInitialized = true; return }
    throw e
  }
}

async function verifyAuth(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing or invalid Authorization header.' }); return null }
  try { return (await admin.auth().verifyIdToken(h.slice(7))).uid }
  catch { res.status(401).json({ error: 'Invalid or expired authentication token.' }); return null }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()
    const uid = await verifyAuth(req, res)
    if (!uid) return

    const db = admin.firestore()
    const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
    const apiKeys = (settingsSnap.data()?.apiKeys || {}) as any
    const apiKey = apiKeys.mexcApiKey as string | undefined
    const secretKey = apiKeys.mexcSecretKey as string | undefined
    if (!apiKey || !secretKey) {
      return res.status(400).json({ success: false, error: 'MEXC API keys not configured' })
    }

    const now = Date.now()
    const startTime = now - 365 * 24 * 60 * 60 * 1000

    // Use MEXC's PnL analysis endpoints with includeUnrealisedPnl=1 (unrealized included).
    // Note: "24-Hour" in UI will be mapped to "todayPnl" per user approval.
    const [todayJson, analysisJson, recentJson] = await Promise.all([
      mexcPrivateGet<any>({
        path: '/api/v1/private/account/asset/analysis/today_pnl',
        query: { reverse: 1, includeUnrealisedPnl: 1 },
        apiKey,
        secretKey,
      }),
      mexcPrivatePost<any>({
        path: '/api/v1/private/account/asset/analysis/v3',
        body: { startTime, endTime: now, reverse: 1, includeUnrealisedPnl: 1 },
        apiKey,
        secretKey,
      }),
      mexcPrivatePost<any>({
        path: '/api/v1/private/account/asset/analysis/recent/v3',
        body: { reverse: 1, includeUnrealisedPnl: 1 },
        apiKey,
        secretKey,
      }),
    ])

    const todayPnl = toNumber(todayJson?.data?.todayPnl)
    const pnl7d = toNumber(analysisJson?.data?.recentPnl)
    const pnl30d = toNumber(analysisJson?.data?.recentPnl30)
    const pnl90d = toNumber(recentJson?.data?.recentPnl90)

    const data = {
      pnl24hUsd: todayPnl === null ? null : todayPnl,
      pnl7dUsd: pnl7d === null ? null : pnl7d,
      pnl30dUsd: pnl30d === null ? null : pnl30d,
      pnl90dUsd: pnl90d === null ? null : pnl90d,
    }

    return res.status(200).json({ success: true, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

