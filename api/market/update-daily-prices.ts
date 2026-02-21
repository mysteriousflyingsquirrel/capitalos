import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'

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

export const config = { maxDuration: 30 }

function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ')
}

const YAHOO_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

interface YahooQuoteResult {
  price: number
  currency: string | null
  marketTime: number | null
}

async function fetchYahooQuote(symbol: string): Promise<YahooQuoteResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': YAHOO_USER_AGENT,
    },
  })

  if (!response.ok) {
    console.warn(`[Yahoo] ${symbol}: HTTP ${response.status}`)
    return null
  }

  const data = await response.json() as any
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) {
    console.warn(`[Yahoo] ${symbol}: no chart meta in response`)
    return null
  }

  const price = meta.regularMarketPrice
  if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
    console.warn(`[Yahoo] ${symbol}: invalid price ${price}`)
    return null
  }

  return {
    price,
    currency: meta.currency || null,
    marketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
  }
}

async function fetchYahooQuotes(
  symbols: string[]
): Promise<Map<string, YahooQuoteResult>> {
  const result = new Map<string, YahooQuoteResult>()
  if (symbols.length === 0) return result

  const CONCURRENCY = 10
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const chunk = symbols.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map(async (sym) => {
        const quote = await fetchYahooQuote(sym)
        return { sym, quote }
      })
    )

    for (const entry of settled) {
      if (entry.status === 'fulfilled' && entry.value.quote) {
        result.set(entry.value.sym, entry.value.quote)
      }
    }
  }

  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()

    const uid = await verifyAuth(req, res)
    if (!uid) return

    const { symbols } = req.body as { symbols?: string[] }

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' })
    }
    if (!symbols.every(s => typeof s === 'string' && s.length > 0)) {
      return res.status(400).json({ error: 'All symbols must be non-empty strings' })
    }

    const symbolKeys = [...new Set(symbols.map(normalizeSymbolKey))]

    const quotesMap = await fetchYahooQuotes(symbolKeys)

    const prices: Record<string, { price: number; currency: string | null; marketTime: number | null }> = {}
    const fetched: string[] = []

    for (const [sym, quoteData] of quotesMap) {
      prices[sym] = quoteData
      fetched.push(sym)
    }

    const missing = symbolKeys.filter(k => !prices[k])

    return res.status(200).json({
      success: true,
      prices,
      fetched,
      missing: missing.length > 0 ? missing : undefined,
      source: 'yahoo',
    })
  } catch (error) {
    console.error('[UpdatePrices] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    })
  }
}
