import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import crypto from 'crypto'

// Initialize Firebase Admin SDK
let adminInitialized = false
function initializeAdmin() {
  if (adminInitialized) return
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      admin.initializeApp()
    }
    adminInitialized = true
  } catch {
    adminInitialized = true
  }
}

function hmacSha256Hex(secret: string, message: string): string {
  return crypto.createHmac('sha256', secret).update(message).digest('hex')
}

function buildSortedQuery(params: Record<string, any>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  entries.sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

async function mexcPrivateGet<T>(args: {
  path: string
  query?: Record<string, any>
  apiKey: string
  secretKey: string
}): Promise<T> {
  const baseUrl = 'https://contract.mexc.com'
  const requestTime = Date.now().toString()
  const queryString = args.query ? buildSortedQuery(args.query) : ''
  const signaturePayload = `${args.apiKey}${requestTime}${queryString}`
  const signature = hmacSha256Hex(args.secretKey, signaturePayload)

  const url = new URL(args.path, baseUrl)
  if (queryString) url.search = queryString

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ApiKey: args.apiKey,
      'Request-Time': requestTime,
      Signature: signature,
      'Recv-Window': '60000',
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`MEXC REST error (${resp.status}): ${text}`)
  }

  return (await resp.json()) as T
}

async function mexcPrivatePost<T>(args: {
  path: string
  body: Record<string, any>
  apiKey: string
  secretKey: string
}): Promise<T> {
  const baseUrl = 'https://contract.mexc.com'
  const requestTime = Date.now().toString()

  // Exclude null/undefined fields (per MEXC docs guidance)
  const cleanedBody: Record<string, any> = {}
  for (const [k, v] of Object.entries(args.body || {})) {
    if (v !== null && v !== undefined) cleanedBody[k] = v
  }

  const bodyString = JSON.stringify(cleanedBody)
  const signaturePayload = `${args.apiKey}${requestTime}${bodyString}`
  const signature = hmacSha256Hex(args.secretKey, signaturePayload)

  const url = new URL(args.path, baseUrl)
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      ApiKey: args.apiKey,
      'Request-Time': requestTime,
      Signature: signature,
      'Recv-Window': '60000',
      'Content-Type': 'application/json',
    },
    body: bodyString,
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`MEXC REST error (${resp.status}): ${text}`)
  }

  return (await resp.json()) as T
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()
    const { uid } = req.body as { uid?: string }
    if (!uid) return res.status(400).json({ success: false, error: 'uid is required' })

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

