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

// Yahoo-style exchange suffix → Twelve Data exchange code
const EXCHANGE_MAP: Record<string, string> = {
  '.DE': ':XETR',
  '.SW': ':SIX',
  '.L': ':LSE',
  '.PA': ':EPA',
  '.AS': ':AMS',
  '.MI': ':MIL',
  '.TO': ':TSX',
  '.HK': ':HKEX',
  '.T': ':TSE',
  '.AX': ':ASX',
}

// Yahoo commodity futures → Twelve Data symbol
const COMMODITY_MAP: Record<string, string> = {
  'GC=F': 'XAU/USD',
  'SI=F': 'XAG/USD',
  'CL=F': 'WTI/USD',
  'BZ=F': 'BRENT/USD',
  'NG=F': 'NG/USD',
  'PL=F': 'XPT/USD',
  'PA=F': 'XPD/USD',
  'HG=F': 'COPPER/USD',
}

function normalizeSymbolKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ')
}

function toTwelveDataSymbol(symbolKey: string): string {
  if (COMMODITY_MAP[symbolKey]) return COMMODITY_MAP[symbolKey]

  for (const [suffix, exchange] of Object.entries(EXCHANGE_MAP)) {
    if (symbolKey.endsWith(suffix.toUpperCase())) {
      return symbolKey.slice(0, -suffix.length) + exchange
    }
  }

  return symbolKey
}

function fromTwelveDataSymbol(tdSymbol: string, originalKeys: Map<string, string>): string {
  return originalKeys.get(tdSymbol) ?? tdSymbol
}

interface TwelveDataQuote {
  symbol: string
  close: string
  currency: string
  datetime: string
  timestamp: number
}

async function fetchTwelveDataQuotes(
  symbols: string[],
  apiKey: string
): Promise<Map<string, { price: number; currency: string | null; marketTime: number | null }>> {
  const result = new Map<string, { price: number; currency: string | null; marketTime: number | null }>()
  if (symbols.length === 0) return result

  const symbolParam = symbols.join(',')
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolParam)}&apikey=${apiKey}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  })

  if (!response.ok) {
    console.error(`[TwelveData] API returned ${response.status}`)
    return result
  }

  const data = await response.json()

  // Single symbol: response is a flat object; multiple symbols: keyed by symbol
  if (symbols.length === 1) {
    const quote = data as TwelveDataQuote & { code?: number; status?: string }
    if (quote.code || quote.status === 'error') {
      console.warn(`[TwelveData] Error for ${symbols[0]}:`, quote)
      return result
    }
    const price = parseFloat(quote.close)
    if (!isNaN(price) && price > 0) {
      result.set(symbols[0], {
        price,
        currency: quote.currency || null,
        marketTime: quote.timestamp ? quote.timestamp * 1000 : null,
      })
    }
  } else {
    const quotes = data as Record<string, TwelveDataQuote & { code?: number; status?: string }>
    for (const [sym, quote] of Object.entries(quotes)) {
      if (quote.code || quote.status === 'error') {
        console.warn(`[TwelveData] Error for ${sym}:`, quote)
        continue
      }
      const price = parseFloat(quote.close)
      if (!isNaN(price) && price > 0) {
        result.set(sym, {
          price,
          currency: quote.currency || null,
          marketTime: quote.timestamp ? quote.timestamp * 1000 : null,
        })
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

    // Read user's Twelve Data API key from Firestore
    const db = admin.firestore()
    const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
    const twelveDataApiKey = settingsSnap.data()?.apiKeys?.twelveDataApiKey

    if (!twelveDataApiKey) {
      return res.status(200).json({
        success: true,
        prices: {},
        missing: symbolKeys,
        warning: 'No Twelve Data API key configured',
      })
    }

    // Map original symbols to Twelve Data format
    const tdToOriginal = new Map<string, string>()
    const tdSymbols: string[] = []
    for (const key of symbolKeys) {
      const td = toTwelveDataSymbol(key)
      tdToOriginal.set(td, key)
      tdSymbols.push(td)
    }

    // Twelve Data supports up to 120 symbols per batch, chunk at 50 for safety
    const CHUNK_SIZE = 50
    const prices: Record<string, { price: number; currency: string | null; marketTime: number | null }> = {}
    const fetched: string[] = []

    for (let i = 0; i < tdSymbols.length; i += CHUNK_SIZE) {
      const chunk = tdSymbols.slice(i, i + CHUNK_SIZE)
      const chunkResult = await fetchTwelveDataQuotes(chunk, twelveDataApiKey)

      for (const [tdSym, priceData] of chunkResult) {
        const originalKey = fromTwelveDataSymbol(tdSym, tdToOriginal)
        prices[originalKey] = priceData
        fetched.push(originalKey)
      }
    }

    const missing = symbolKeys.filter(k => !prices[k])

    return res.status(200).json({
      success: true,
      prices,
      fetched,
      missing: missing.length > 0 ? missing : undefined,
      source: 'twelve-data',
    })
  } catch (error) {
    console.error('[UpdatePrices] Error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    })
  }
}
