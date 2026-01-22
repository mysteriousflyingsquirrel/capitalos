import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import crypto from 'crypto'

let adminInitialized = false
function initializeAdmin() {
  if (adminInitialized) return
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
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

/**
 * Returns account equity in USD (USDT) for MEXC futures.
 * Uses a best-effort parse of /api/v1/private/account/assets response.
 */
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

    const assetsJson: any = await mexcPrivateGet({
      path: '/api/v1/private/account/assets',
      apiKey,
      secretKey,
    })

    // Common shapes:
    // - { data: { ...summaryFields } }
    // - { data: [ { currency: 'USDT', ...fields } ] }
    const data = assetsJson?.data

    // Try summary-style fields first
    const summaryEquity =
      toNumber(data?.equity) ??
      toNumber(data?.accountEquity) ??
      toNumber(data?.totalEquity) ??
      toNumber(data?.totalBalance) ??
      toNumber(data?.balance) ??
      null

    if (summaryEquity !== null) {
      return res.status(200).json({ success: true, data: { equityUsd: summaryEquity } })
    }

    // Try list-of-assets style
    if (Array.isArray(data)) {
      const usdt = data.find((a: any) => (a?.currency || a?.asset || a?.symbol) === 'USDT') || data[0]
      if (usdt) {
        const equity =
          toNumber(usdt.equity) ??
          toNumber(usdt.totalBalance) ??
          toNumber(usdt.balance) ??
          // fallback: walletBalance + unrealized
          (() => {
            const wallet = toNumber(usdt.walletBalance) ?? toNumber(usdt.availableBalance) ?? 0
            const unreal = toNumber(usdt.unrealized) ?? toNumber(usdt.unRealized) ?? 0
            return wallet + unreal
          })()

        return res.status(200).json({ success: true, data: { equityUsd: equity } })
      }
    }

    // Last resort: zero
    return res.status(200).json({ success: true, data: { equityUsd: 0 } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

