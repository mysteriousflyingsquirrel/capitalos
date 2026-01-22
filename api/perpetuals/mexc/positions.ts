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

    // Best-known endpoint for current open positions (Contract v1 style).
    const json: any = await mexcPrivateGet({
      path: '/api/v1/private/position/open_positions',
      apiKey,
      secretKey,
    })

    const positionsRaw: any[] =
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.data?.positions) ? json.data.positions :
      Array.isArray(json?.positions) ? json.positions :
      []

    const mapped = positionsRaw.map((p: any, idx: number) => {
      const symbol = (p.symbol || p.contractCode || p.contract || p.market) as string | undefined
      const positionId = p.positionId !== undefined && p.positionId !== null ? String(p.positionId) : String(p.id ?? idx)

      const positionType = toNumber(p.positionType ?? p.posSide ?? p.side) // 1 long, 2 short (best-effort)
      const holdVol = toNumber(p.holdVol ?? p.vol ?? p.positionVol ?? p.size) ?? 0
      const entryPrice = toNumber(p.holdAvgPrice ?? p.openAvgPrice ?? p.avgEntryPrice ?? p.entryPrice)
      const liquidationPrice = toNumber(p.liquidatePrice ?? p.liquidationPrice)
      const marginUsed = toNumber(p.im ?? p.margin ?? p.positionMargin) ?? 0
      const unrealizedPnl = toNumber(p.pnl ?? p.unRealizedPnl ?? p.unrealizedPnl) ?? 0
      const leverage = toNumber(p.leverage)

      return {
        id: `mexc-pos-${positionId}`,
        ticker: symbol || 'UNKNOWN',
        margin: marginUsed,
        pnl: unrealizedPnl,
        platform: 'MEXC',
        leverage,
        positionSide: positionType === 1 ? 'LONG' : positionType === 2 ? 'SHORT' : null,
        amountToken: Math.abs(holdVol),
        entryPrice: entryPrice ?? null,
        liquidationPrice: liquidationPrice ?? null,
        fundingFeeUsd: null,
      }
    })

    return res.status(200).json({ success: true, data: mapped })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

