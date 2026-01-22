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
  } catch (error) {
    // tolerate already-initialized
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

    // Open orders endpoint (as of 2025-12-02): /api/v1/private/order/list/open_orders
    const json: any = await mexcPrivateGet({
      path: '/api/v1/private/order/list/open_orders',
      apiKey,
      secretKey,
    })

    const ordersRaw: any[] =
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.data?.orders) ? json.data.orders :
      Array.isArray(json?.orders) ? json.orders :
      []

    const mapped = ordersRaw.map((o: any, idx: number) => {
      const symbol = (o.symbol || o.contractCode || o.contract || o.market) as string | undefined
      const sideRaw = (o.side ?? o.direction ?? o.tradeType ?? o.orderSide) as any
      const side = sideRaw === 1 || sideRaw === '1' || sideRaw === 'BUY' || sideRaw === 'Buy' ? 'Buy'
        : sideRaw === 2 || sideRaw === '2' || sideRaw === 'SELL' || sideRaw === 'Sell' ? 'Sell'
        : null

      const price = toNumber(o.price ?? o.limitPrice ?? o.orderPrice) ?? 0
      const vol = toNumber(o.vol ?? o.volume ?? o.quantity ?? o.qty) ?? 0
      const notional = toNumber(o.amount ?? o.dealAmount ?? o.orderAmount ?? o.quoteVol) ?? null

      return {
        id: `mexc-order-${o.orderId ?? o.id ?? idx}`,
        token: symbol || 'UNKNOWN',
        activity: String(o.orderType ?? o.type ?? o.category ?? 'Limit'),
        side: side || 'Buy',
        price,
        priceDisplay: String(price),
        size: notional !== null ? notional : price * vol,
        amount: vol,
        platform: 'MEXC',
      }
    })

    return res.status(200).json({ success: true, data: mapped })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

