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

function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function roundTo5Min(tsMs: number): number {
  const bucket = 5 * 60 * 1000
  return Math.floor(tsMs / bucket) * bucket
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

    // Fetch current total unrealized PnL from account assets
    const assetsJson: any = await mexcPrivateGet({
      path: '/api/v1/private/account/assets',
      apiKey,
      secretKey,
    })

    // Try common locations for unrealized field
    const currentUnrealized =
      toNumber(assetsJson?.data?.unrealized) ??
      toNumber(assetsJson?.data?.unRealized) ??
      toNumber(assetsJson?.unrealized) ??
      0

    const now = Date.now()
    const nowBucket = roundTo5Min(now)

    // Store snapshot as document keyed by bucket timestamp (no indexes needed)
    const snapDoc = db.collection('users').doc(uid).collection('mexcUnrealizedPnlSnapshots').doc(String(nowBucket))
    await snapDoc.set({ ts: nowBucket, totalUnrealizedPnl: currentUnrealized }, { merge: true })

    const readBucket = async (deltaMs: number): Promise<number | null> => {
      const targetBucket = roundTo5Min(now - deltaMs)
      const doc = await db.collection('users').doc(uid).collection('mexcUnrealizedPnlSnapshots').doc(String(targetBucket)).get()
      if (!doc.exists) return null
      const v = toNumber(doc.data()?.totalUnrealizedPnl)
      return v === null ? null : v
    }

    const [p24, p7, p30, p90] = await Promise.all([
      readBucket(24 * 60 * 60 * 1000),
      readBucket(7 * 24 * 60 * 60 * 1000),
      readBucket(30 * 24 * 60 * 60 * 1000),
      readBucket(90 * 24 * 60 * 60 * 1000),
    ])

    const data = {
      pnl24hUsd: p24 === null ? null : currentUnrealized - p24,
      pnl7dUsd: p7 === null ? null : currentUnrealized - p7,
      pnl30dUsd: p30 === null ? null : currentUnrealized - p30,
      pnl90dUsd: p90 === null ? null : currentUnrealized - p90,
    }

    return res.status(200).json({ success: true, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

