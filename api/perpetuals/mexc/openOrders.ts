import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import crypto from 'crypto'

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

function mapMexcOrderType(orderType: any): string {
  // orderType	int	1 limit, 2 Post Only, 3 IOC, 4 FOK, 5 market
  const n =
    typeof orderType === 'number'
      ? orderType
      : typeof orderType === 'string'
        ? parseInt(orderType, 10)
        : NaN

  switch (n) {
    case 1: return 'Limit'
    case 2: return 'Post Only'
    case 3: return 'IOC'
    case 4: return 'FOK'
    case 5: return 'Market'
    default:
      return orderType === null || orderType === undefined ? 'Limit' : String(orderType)
  }
}

function normalizeMexcVol(rawVol: any): number {
  // Some MEXC payloads encode vol as fixed-point integer scaled by 10,000.
  // But other payloads (e.g. WS `push.personal.order`) can legitimately use small integers like `10`.
  // So only normalize when it *clearly* looks like fixed-point: integer, large, and divisible by 10,000.
  const v = toNumber(rawVol) ?? 0
  if (!Number.isFinite(v) || v === 0) return 0

  const isIntegerEncoding =
    (typeof rawVol === 'number' && Number.isInteger(rawVol)) ||
    (typeof rawVol === 'string' &&
      rawVol.trim() !== '' &&
      !rawVol.includes('.') &&
      !rawVol.includes('e') &&
      !rawVol.includes('E'))

  if (!isIntegerEncoding) return v

  const abs = Math.abs(v)
  if (abs >= 10000 && abs % 10000 === 0) {
    return v / 10000
  }

  return v
}

async function fetchMexcContractSize(symbol: string): Promise<number | null> {
  // Public endpoint: https://contract.mexc.com/api/v1/contract/detail?symbol=BTC_USDT
  try {
    const url = new URL('https://contract.mexc.com/api/v1/contract/detail')
    url.searchParams.set('symbol', symbol)
    const resp = await fetch(url.toString(), { method: 'GET' })
    if (!resp.ok) return null
    const json: any = await resp.json().catch(() => null)
    const cs = toNumber(json?.data?.contractSize)
    return cs !== null && cs > 0 ? cs : null
  } catch {
    return null
  }
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

    // Fetch contractSize per symbol once (needed because vol is in contracts, not base-coin amount).
    const symbols = Array.from(new Set(ordersRaw.map((o: any) => (o.symbol || o.contractCode || o.contract || o.market)).filter(Boolean)))
    const contractSizeBySymbol = new Map<string, number>()
    await Promise.all(symbols.map(async (s) => {
      const sym = String(s)
      const cs = await fetchMexcContractSize(sym)
      if (cs !== null) contractSizeBySymbol.set(sym, cs)
    }))

    const mapped = ordersRaw.map((o: any, idx: number) => {
      const symbol = (o.symbol || o.contractCode || o.contract || o.market) as string | undefined
      const sideRaw = (o.side ?? o.direction ?? o.tradeType ?? o.orderSide) as any
      const side = sideRaw === 1 || sideRaw === '1' || sideRaw === 'BUY' || sideRaw === 'Buy' ? 'Buy'
        : sideRaw === 2 || sideRaw === '2' || sideRaw === 'SELL' || sideRaw === 'Sell' ? 'Sell'
        : null

      const price = toNumber(o.price ?? o.limitPrice ?? o.orderPrice) ?? 0
      const volContractsRaw = o.remainVol ?? o.vol ?? o.volume ?? o.quantity ?? o.qty
      const volContracts = normalizeMexcVol(volContractsRaw) // contracts count
      const contractSize = symbol ? (contractSizeBySymbol.get(symbol) ?? null) : null
      const baseAmount = contractSize !== null ? volContracts * contractSize : volContracts
      const notional = toNumber(o.amount ?? o.dealAmount ?? o.orderAmount ?? o.quoteVol) ?? null
      const computedNotional = price * baseAmount

      return {
        id: `mexc-order-${o.orderId ?? o.id ?? idx}`,
        token: symbol || 'UNKNOWN',
        type: mapMexcOrderType(o.orderType ?? o.type ?? o.category),
        side: side || 'Buy',
        price,
        // Prefer computed notional (price * (contracts * contractSize)) to avoid 10,000x scaling issues.
        // Fall back to notional field if computation isn't possible.
        size: Number.isFinite(computedNotional) && computedNotional > 0 ? computedNotional : (notional ?? 0),
        // amount should represent base-coin amount (e.g. BTC), not contract count
        amount: baseAmount,
        platform: 'MEXC',
      }
    })

    return res.status(200).json({ success: true, data: mapped })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ success: false, error: msg })
  }
}

