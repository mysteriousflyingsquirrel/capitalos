import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import { initializeAdmin, verifyAuth } from '../lib/firebaseAdmin'
import type { NetWorthSummary, NetWorthItem, NetWorthCategory, NetWorthTransaction } from '../../lib/types.js'
import { NetWorthCalculationService } from '../../lib/netWorthCalculation.js'
import { fetchCryptoData } from '../../lib/cryptoCompare.js'

// Export config for Vercel (increase timeout if needed)
export const config = {
  maxDuration: 60,
}

// Snapshot format for Firestore storage
interface NetWorthSnapshot {
  date: string
  timestamp: number
  categories: Record<string, number>
  total: number
}

type ApiKeys = {
  rapidApiKey?: string | null
  hyperliquidWalletAddress?: string | null
  mexcApiKey?: string | null
  mexcSecretKey?: string | null
}

type ExchangeRates = {
  base: string
  rates: Record<string, number>
}

const SNAPSHOT_CATEGORIES: NetWorthCategory[] = [
  'Cash',
  'Bank Accounts',
  'Retirement Funds',
  'Index Funds',
  'Stocks',
  'Commodities',
  'Crypto',
  'Perpetuals',
  'Real Estate',
  'Depreciating Assets',
]

function getBaseUrl(req: VercelRequest): string {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'https'
  if (!host) {
    // Best-effort fallback (Vercel usually provides Host)
    return ''
  }
  return `${proto}://${host}`
}

async function fetchExchangeRatesChf(): Promise<ExchangeRates> {
  // Same upstream as the client (but without localStorage / window dependency)
  const resp = await fetch('https://api.exchangerate-api.com/v4/latest/CHF')
  if (!resp.ok) {
    throw new Error(`Exchange rate API returned ${resp.status}`)
  }
  const json = (await resp.json()) as any
  const rates = (json?.rates && typeof json.rates === 'object') ? (json.rates as Record<string, number>) : {}
  return {
    base: 'CHF',
    rates: {
      CHF: 1,
      ...rates,
    },
  }
}

function makeConvertToChf(exchangeRates: ExchangeRates) {
  return (amount: number, from: string): number => {
    if (!Number.isFinite(amount)) return 0
    if (from === 'CHF') return amount
    const rate = exchangeRates.rates[from]
    if (!rate || !Number.isFinite(rate) || rate === 0) return amount
    // rates[USD] = how many USD for 1 CHF. So amount in CHF = amount / rates[from]
    return amount / rate
  }
}

async function fetchYahooPricesUsd(args: { tickers: string[]; rapidApiKey: string }): Promise<Record<string, number>> {
  const tickers = [...new Set(args.tickers.map(t => t.trim().toUpperCase()).filter(Boolean))]
  if (tickers.length === 0) return {}

  const url = `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${encodeURIComponent(tickers.join(','))}`
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': args.rapidApiKey,
      'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
      Accept: 'application/json',
    },
  })

  if (!resp.ok) {
    return {}
  }

  const data = (await resp.json()) as any
  const out: Record<string, number> = {}

  const results = data?.quoteResponse?.result
  if (Array.isArray(results)) {
    for (const q of results) {
      const symbol = typeof q?.symbol === 'string' ? q.symbol.trim().toUpperCase() : ''
      const price = q?.regularMarketPrice
      if (symbol && typeof price === 'number' && Number.isFinite(price) && price > 0) {
        out[symbol] = price
      }
    }
  }

  return out
}

function getUtcDateParts(now: Date): { year: number; monthIndex: number; day: number } {
  return {
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth(), // 0-11
    day: now.getUTCDate(),
  }
}

function formatUtcDateYmd(parts: { year: number; monthIndex: number; day: number }): string {
  const month = String(parts.monthIndex + 1).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

function endOfUtcDayTimestamp(parts: { year: number; monthIndex: number; day: number }): number {
  return new Date(Date.UTC(parts.year, parts.monthIndex, parts.day, 23, 59, 59)).getTime()
}


// Note: Calculation logic is handled by NetWorthCalculationService
// which uses balanceCalculationService internally and falls back to transaction-based calculations
// when prices are not provided. This ensures consistency with the frontend.
// 
// All calculations use pricePerItemChf already stored in transactions - no external API calls needed.


/**
 * Convert NetWorthSummary to NetWorthSnapshot format
 * Uses the summary from the global service - ensures consistency
 */
function summaryToSnapshot(summary: NetWorthSummary): NetWorthSnapshot {
  // Convert categories array to record format, but keep EXACTLY the same keys
  // as the client "Create Snapshot" button (prevents legacy keys like "Funds"/"Inventory").
  const byKey = new Map<string, number>()
  for (const cat of summary.categories || []) {
    if (cat && typeof (cat as any).categoryKey === 'string') {
      const k = (cat as any).categoryKey as string
      const v = (cat as any).total
      byKey.set(k, typeof v === 'number' && Number.isFinite(v) ? v : 0)
    }
  }

  const categories: Record<string, number> = {}
  for (const k of SNAPSHOT_CATEGORIES) {
    categories[k] = byKey.get(k) ?? 0
  }

  // Date/timestamp will be overridden by caller to end-of-day UTC.
  return {
    date: '',
    timestamp: 0,
    categories,
    total: typeof summary.totalNetWorth === 'number' && Number.isFinite(summary.totalNetWorth) ? summary.totalNetWorth : 0,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()

    // Accept either Bearer token auth or CRON_SECRET + uid in body (for GitHub Actions)
    let uid: string | null = null
    const cronSecret = req.headers['x-cron-secret'] as string | undefined
    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      uid = (req.body?.uid || req.query?.uid) as string | null
      if (!uid) {
        return res.status(400).json({ error: 'uid is required for cron requests' })
      }
    } else {
      uid = await verifyAuth(req, res)
      if (!uid) return
    }

    // Read pre-computed summary from Firestore (computed by client on every data change)
    // NEW: compute snapshot directly (same engine as Settings → Create Snapshot),
    // so the GitHub Action does not depend on netWorthSummary/current.
    if (process.env.NODE_ENV === 'development') console.log('[Snapshot] Computing snapshot server-side...')
    const db = admin.firestore()

    // Load settings for API keys (RapidAPI + Perpetuals)
    const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
    const apiKeys = (settingsSnap.data()?.apiKeys || {}) as ApiKeys

    // Load net worth items and transactions (same sources as the client)
    const [itemsSnap, txSnap] = await Promise.all([
      db.collection(`users/${uid}/netWorthItems`).get(),
      db.collection(`users/${uid}/netWorthTransactions`).get(),
    ])

    const rawItems = itemsSnap.docs.map(d => d.data() as NetWorthItem)
    const transactions = txSnap.docs.map(d => d.data() as NetWorthTransaction)

    // Remove any existing Perpetuals items (client generates them dynamically)
    const itemsWithoutPerpetuals = rawItems.filter(i => (i as any)?.category !== 'Perpetuals')

    // Fetch exchange rates (CHF base) and create a convert function identical to CurrencyContext's behavior.
    const exchangeRates = await fetchExchangeRatesChf()
    const convert = makeConvertToChf(exchangeRates)

    // Prices (match client logic as closely as possible)
    const cryptoTickers = itemsWithoutPerpetuals
      .filter(i => (i as any)?.category === 'Crypto' && typeof (i as any)?.name === 'string')
      .map(i => String((i as any).name).trim().toUpperCase())
      .filter(Boolean)
    const uniqueCryptoTickers = [...new Set(cryptoTickers)]

    const stockTickers = itemsWithoutPerpetuals
      .filter(i => {
        const c = (i as any)?.category
        return c === 'Index Funds' || c === 'Stocks' || c === 'Commodities'
      })
      .map(i => String((i as any).name || '').trim().toUpperCase())
      .filter(Boolean)
    const uniqueStockTickers = [...new Set(stockTickers)]

    // Fetch crypto prices + USD->CHF rate (CryptoCompare). If unavailable, fallback to FX-derived rate.
    const { prices: cryptoPrices, usdToChfRate } = await fetchCryptoData(uniqueCryptoTickers).catch(() => ({
      prices: {} as Record<string, number>,
      usdToChfRate: null as number | null,
    }))
    const fxUsdPerChf = exchangeRates.rates['USD']
    const fallbackUsdToChf = (typeof fxUsdPerChf === 'number' && Number.isFinite(fxUsdPerChf) && fxUsdPerChf > 0)
      ? (1 / fxUsdPerChf)
      : null
    const effectiveUsdToChf = (usdToChfRate && usdToChfRate > 0) ? usdToChfRate : fallbackUsdToChf

    // Fetch stock prices via RapidAPI (if configured)
    const rapidApiKey = apiKeys?.rapidApiKey || ''
    const stockPrices = rapidApiKey
      ? await fetchYahooPricesUsd({ tickers: uniqueStockTickers, rapidApiKey }).catch(() => ({}))
      : {}

    // Add Perpetuals items per exchange (same as DataContext) if configured.
    const baseUrl = getBaseUrl(req)
    const perpItems: NetWorthItem[] = []

    const authHeader = req.headers.authorization || ''

    // Hyperliquid
    if (apiKeys?.hyperliquidWalletAddress) {
      const walletAddress = apiKeys.hyperliquidWalletAddress || ''
      if (walletAddress && baseUrl) {
        const hlResp = await fetch(`${baseUrl}/api/perpetuals/hyperliquid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify({ walletAddress }),
        }).catch(() => null)

        const hlJson = hlResp && hlResp.ok ? await hlResp.json().catch(() => null) : null
        const hlData = (hlJson?.success && hlJson?.data) ? hlJson.data : { exchangeBalance: [], openPositions: [], openOrders: [] }
        perpItems.push({
          id: 'perpetuals-hyperliquid',
          category: 'Perpetuals',
          name: 'Hyperliquid',
          platform: 'Hyperliquid',
          currency: 'USD',
          perpetualsData: hlData,
        } as any)
      }
    }

    // MEXC (equity only is enough for totals)
    if (apiKeys?.mexcApiKey && apiKeys?.mexcSecretKey && baseUrl) {
      const mexcEquityResp = await fetch(`${baseUrl}/api/perpetuals/mexc/equity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({}),
      }).catch(() => null)
      const mexcEquityJson = mexcEquityResp && mexcEquityResp.ok ? await mexcEquityResp.json().catch(() => null) : null
      const mexcEquityUsd = typeof mexcEquityJson?.data?.equityUsd === 'number' ? mexcEquityJson.data.equityUsd : null

      const mexcExchangeBalance = mexcEquityUsd !== null
        ? [{ id: 'mexc-account-equity', item: 'MEXC', holdings: mexcEquityUsd, platform: 'MEXC' }]
        : []

      perpItems.push({
        id: 'perpetuals-mexc',
        category: 'Perpetuals',
        name: 'MEXC',
        platform: 'MEXC',
        currency: 'USD',
        perpetualsData: {
          exchangeBalance: mexcExchangeBalance,
          openPositions: [],
          openOrders: [],
        },
      } as any)
    }

    const items = perpItems.length > 0 ? [...itemsWithoutPerpetuals, ...perpItems] : itemsWithoutPerpetuals

    const result = NetWorthCalculationService.calculateTotals(
      items,
      transactions,
      cryptoPrices,
      stockPrices,
      effectiveUsdToChf,
      convert as any
    )

    // Build NetWorthSummary-like object (only for reuse of summaryToSnapshot formatting)
    const summary: NetWorthSummary = {
      uid,
      asOf: new Date().toISOString(),
      baseCurrency: 'CHF',
      totalNetWorth: result.totalNetWorthChf,
      categories: SNAPSHOT_CATEGORIES.map((k) => ({
        categoryKey: k as any,
        categoryName: k,
        total: result.categoryTotals[k] || 0,
        currency: 'CHF',
      })),
    }

    // Convert summary to snapshot format (fixed 10 categories)
    const snapshot = summaryToSnapshot(summary)

    // Determine snapshot date (UTC) and set timestamp to 23:59:59 UTC for that date,
    // matching Settings → Create Snapshot behavior.
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinutes = now.getUTCMinutes()
    const target = getUtcDateParts(now)

    // If between 00:00 and 00:05 UTC, create snapshot for "yesterday" (end of previous day).
    if (utcHour === 0 && utcMinutes < 5) {
      const yesterday = new Date(Date.UTC(target.year, target.monthIndex, target.day - 1, 0, 0, 0))
      const y = getUtcDateParts(yesterday)
      snapshot.date = formatUtcDateYmd(y)
      snapshot.timestamp = endOfUtcDayTimestamp(y)
    } else {
      snapshot.date = formatUtcDateYmd(target)
      snapshot.timestamp = endOfUtcDayTimestamp(target)
    }

    // Check if snapshot already exists for this date
    const existingSnapshotRef = db.collection(`users/${uid}/snapshots`).doc(snapshot.date)
    const existingSnapshot = await existingSnapshotRef.get()
    
    if (existingSnapshot.exists) {
      return res.status(200).json({
        success: true,
        message: `Snapshot already exists for ${snapshot.date}, skipping creation`,
        snapshot: {
          date: snapshot.date,
          timestamp: existingSnapshot.data()?.timestamp,
          total: existingSnapshot.data()?.total,
          categories: existingSnapshot.data()?.categories,
        },
      })
    }

    // Save snapshot to Firestore
    const snapshotRef = db.collection(`users/${uid}/snapshots`).doc(snapshot.date)
    await snapshotRef.set(snapshot)

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Snapshot created successfully',
      snapshot: {
        date: snapshot.date,
        timestamp: snapshot.timestamp,
        total: snapshot.total,
        categories: snapshot.categories,
      },
    })
  } catch (error) {
    console.error('[Snapshot] Error creating snapshot:', error)
    
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('[Snapshot] Error name:', error.name)
      console.error('[Snapshot] Error message:', error.message)
      console.error('[Snapshot] Error stack:', error.stack)
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

