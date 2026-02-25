import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { NetWorthSummary, NetWorthItem, NetWorthCategory, NetWorthTransaction } from '../../lib/types.js'
import { NetWorthCalculationService } from '../../lib/netWorthCalculation.js'
import { fetchCryptoData } from '../../lib/cryptoCompare.js'
import { fetchHyperliquidAccountEquity } from '../../lib/hyperliquidApi.js'
import { fetchMexcAccountEquityUsd } from '../../lib/mexcApi.js'
import { fetchStockPrices } from '../../lib/yahooFinance.js'

export const config = {
  maxDuration: 60,
}

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

async function verifyFirebaseAuth(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing or invalid Authorization header.' }); return null }
  try { return (await admin.auth().verifyIdToken(h.slice(7))).uid }
  catch { res.status(401).json({ error: 'Invalid or expired authentication token.' }); return null }
}

function verifyCronSecret(req: VercelRequest): boolean {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return false
  return h.slice(7) === process.env.CRON_SECRET
}

interface NetWorthSnapshot {
  date: string
  timestamp: number
  categories: Record<string, number>
  total: number
}

type ApiKeys = {
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

async function fetchExchangeRatesChf(): Promise<ExchangeRates> {
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
    return amount / rate
  }
}

function getUtcDateParts(now: Date): { year: number; monthIndex: number; day: number } {
  return {
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth(),
    day: now.getUTCDate(),
  }
}

function formatUtcDateYmd(parts: { year: number; monthIndex: number; day: number }): string {
  const month = String(parts.monthIndex + 1).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

function summaryToSnapshot(summary: NetWorthSummary): NetWorthSnapshot {
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

  return {
    date: '',
    timestamp: 0,
    categories,
    total: typeof summary.totalNetWorth === 'number' && Number.isFinite(summary.totalNetWorth) ? summary.totalNetWorth : 0,
  }
}

function getSnapshotDateAndTimestamp(): { date: string; timestamp: number } {
  const now = new Date()
  const target = getUtcDateParts(now)
  return { date: formatUtcDateYmd(target), timestamp: now.getTime() }
}

interface SnapshotResult {
  uid: string
  date: string
  status: 'created' | 'exists' | 'error'
  error?: string
}

async function createSnapshotForUser(
  uid: string,
  db: admin.firestore.Firestore,
): Promise<SnapshotResult> {
  const { date, timestamp } = getSnapshotDateAndTimestamp()

  const existingRef = db.collection(`users/${uid}/snapshots`).doc(date)
  const existing = await existingRef.get()
  if (existing.exists) {
    return { uid, date, status: 'exists' }
  }

  const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
  const apiKeys = (settingsSnap.data()?.apiKeys || {}) as ApiKeys

  const [itemsSnap, txSnap] = await Promise.all([
    db.collection(`users/${uid}/netWorthItems`).get(),
    db.collection(`users/${uid}/netWorthTransactions`).get(),
  ])

  const rawItems = itemsSnap.docs.map(d => d.data() as NetWorthItem)
  const transactions = txSnap.docs.map(d => d.data() as NetWorthTransaction)
  const itemsWithoutPerpetuals = rawItems.filter(i => (i as any)?.category !== 'Perpetuals')

  const exchangeRates = await fetchExchangeRatesChf()
  const convert = makeConvertToChf(exchangeRates)

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

  const { prices: cryptoPrices, usdToChfRate } = await fetchCryptoData(uniqueCryptoTickers).catch(() => ({
    prices: {} as Record<string, number>,
    usdToChfRate: null as number | null,
  }))
  const fxUsdPerChf = exchangeRates.rates['USD']
  const fallbackUsdToChf = (typeof fxUsdPerChf === 'number' && Number.isFinite(fxUsdPerChf) && fxUsdPerChf > 0)
    ? (1 / fxUsdPerChf)
    : null
  const effectiveUsdToChf = (usdToChfRate && usdToChfRate > 0) ? usdToChfRate : fallbackUsdToChf

  const stockPrices = uniqueStockTickers.length > 0
    ? await fetchStockPrices(uniqueStockTickers).catch(() => ({}))
    : {}

  const perpItems: NetWorthItem[] = []

  if (apiKeys?.hyperliquidWalletAddress) {
    const walletAddress = apiKeys.hyperliquidWalletAddress || ''
    if (walletAddress) {
      const exchangeBalance = await fetchHyperliquidAccountEquity(walletAddress).catch(() => [])
      perpItems.push({
        id: 'perpetuals-hyperliquid',
        category: 'Perpetuals',
        name: 'Hyperliquid',
        platform: 'Hyperliquid',
        currency: 'USD',
        perpetualsData: { exchangeBalance, openPositions: [], openOrders: [] },
      } as any)
    }
  }

  if (apiKeys?.mexcApiKey && apiKeys?.mexcSecretKey) {
    const mexcEquityUsd = await fetchMexcAccountEquityUsd(
      apiKeys.mexcApiKey,
      apiKeys.mexcSecretKey,
    ).catch(() => null)

    const mexcExchangeBalance = mexcEquityUsd !== null && mexcEquityUsd > 0
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

  const snapshot = summaryToSnapshot(summary)
  snapshot.date = date
  snapshot.timestamp = timestamp

  const snapshotRef = db.collection(`users/${uid}/snapshots`).doc(snapshot.date)
  await snapshotRef.set(snapshot)

  return { uid, date, status: 'created' }
}

async function getAllUserUids(): Promise<string[]> {
  const uids: string[] = []
  let pageToken: string | undefined
  do {
    const result = await admin.auth().listUsers(1000, pageToken)
    uids.push(...result.users.map(u => u.uid))
    pageToken = result.pageToken
  } while (pageToken)
  return uids
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET (cron) or POST (authenticated).' })
  }

  try {
    initializeAdmin()
    const db = admin.firestore()

    // GET = Vercel cron: create snapshots for all users
    if (req.method === 'GET') {
      if (!verifyCronSecret(req)) {
        return res.status(401).json({ error: 'Invalid cron secret.' })
      }

      const uids = await getAllUserUids()
      if (uids.length === 0) {
        return res.status(200).json({ success: true, message: 'No users found', results: [] })
      }

      const results: SnapshotResult[] = []
      for (const uid of uids) {
        try {
          results.push(await createSnapshotForUser(uid, db))
        } catch (err) {
          results.push({
            uid,
            date: '',
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }

      return res.status(200).json({ success: true, results })
    }

    // POST = authenticated user: create snapshot for the calling user
    const uid = await verifyFirebaseAuth(req, res)
    if (!uid) return

    try {
      const result = await createSnapshotForUser(uid, db)
      return res.status(200).json({
        success: true,
        message: result.status === 'created'
          ? 'Snapshot created successfully'
          : `Snapshot already exists for ${result.date}, skipping creation`,
        snapshot: { date: result.date },
      })
    } catch (err) {
      throw err
    }
  } catch (error) {
    console.error('[Snapshot] Error creating snapshot:', error)

    if (error instanceof Error) {
      console.error('[Snapshot] Error name:', error.name)
      console.error('[Snapshot] Error message:', error.message)
      console.error('[Snapshot] Error stack:', error.stack)
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return res.status(500).json({ success: false, error: errorMessage })
  }
}
