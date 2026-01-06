import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { CurrencyCode } from '../../src/lib/currency'
import { NetWorthCalculationService } from '../../src/services/netWorthCalculationService'

// Initialize Firebase Admin SDK
let adminInitialized = false

function initializeAdmin() {
  if (adminInitialized) {
    return
  }

  try {
    // Try to initialize with service account from environment variable
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      // Fallback: try to use default credentials (for local development)
      admin.initializeApp()
    }
    adminInitialized = true
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error)
    throw new Error('Firebase Admin initialization failed')
  }
}

// Types matching the frontend
interface PerpetualsOpenPosition {
  id: string
  ticker: string
  margin: number
  pnl: number
  platform: string
}

interface PerpetualsOpenOrder {
  id: string
  name: string
  margin: number
  platform: string
}

interface PerpetualsAvailableMargin {
  id: string
  asset: string
  margin: number
  platform: string
}

interface PerpetualsLockedMargin {
  id: string
  asset: string
  margin: number
  platform: string
}

interface PerpetualsData {
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
  lockedMargin: PerpetualsLockedMargin[]
  availableMargin: PerpetualsAvailableMargin[]
}

interface NetWorthItem {
  id: string
  category: 'Cash' | 'Bank Accounts' | 'Retirement Funds' | 'Index Funds' | 'Stocks' | 'Commodities' | 'Crypto' | 'Perpetuals' | 'Real Estate' | 'Depreciating Assets'
  name: string
  platform: string
  currency: string
  monthlyDepreciationChf?: number
  perpetualsData?: PerpetualsData
}

interface NetWorthTransaction {
  id: string
  itemId: string
  side: 'buy' | 'sell'
  currency: string
  amount: number
  pricePerItemChf: number
  pricePerItem?: number
  date: string
  cryptoType?: 'BUY' | 'SELL' | 'ADJUSTMENT'
}

interface NetWorthSnapshot {
  date: string
  timestamp: number
  categories: Record<string, number>
  total: number
}

interface UserSettings {
  baseCurrency?: string
  apiKeys?: {
    rapidApiKey?: string
  }
}

// Note: Calculation logic is now handled by NetWorthCalculationService
// which uses balanceCalculationService internally
// This ensures consistency with the frontend (Dashboard, NetWorth, DataContext)

// Fetch crypto prices from CryptoCompare
async function fetchCryptoPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) {
    return {}
  }

  try {
    const normalizedTickers = [...new Set(tickers.map(t => t.trim().toUpperCase()))]
    const tickerString = normalizedTickers.join(',')

    const response = await fetch(
      `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${tickerString}&tsyms=USD`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()
    const prices: Record<string, number> = {}
    
    for (const ticker of normalizedTickers) {
      if (data[ticker] && typeof data[ticker].USD === 'number') {
        prices[ticker] = data[ticker].USD
      }
    }

    return prices
  } catch (error) {
    console.error('Error fetching crypto prices:', error)
    return {}
  }
}

// Fetch USD to CHF rate from CryptoCompare
async function fetchUsdToChfRate(): Promise<number | null> {
  try {
    const response = await fetch(
      `https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=CHF`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()
    if (data.CHF && typeof data.CHF === 'number') {
      return data.CHF
    }

    return null
  } catch (error) {
    console.error('Error fetching USD to CHF rate:', error)
    return null
  }
}

// Fetch stock prices from Yahoo Finance via RapidAPI
async function fetchStockPrices(tickers: string[], apiKey: string): Promise<Record<string, number>> {
  if (tickers.length === 0 || !apiKey) {
    return {}
  }

  try {
    const normalizedTickers = [...new Set(tickers.map(t => t.trim().toUpperCase()))]
    const tickerString = normalizedTickers.join(',')

    const response = await fetch(
      `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${tickerString}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Yahoo Finance API returned ${response.status}`)
    }

    const data = await response.json()
    const prices: Record<string, number> = {}

    if (data.quoteResponse && Array.isArray(data.quoteResponse.result)) {
      data.quoteResponse.result.forEach((quote: any) => {
        const symbol = quote.symbol
        const price = quote.regularMarketPrice
        if (symbol && typeof price === 'number' && price > 0) {
          prices[symbol.toUpperCase()] = price
        }
      })
    }

    return prices
  } catch (error) {
    console.error('Error fetching stock prices:', error)
    return {}
  }
}

// Fetch exchange rates
async function fetchExchangeRates(): Promise<Record<CurrencyCode, number>> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CHF')
    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`)
    }

    const data = await response.json()
    const rates: Record<CurrencyCode, number> = {
      CHF: 1,
      USD: data.rates?.USD || 1,
      EUR: data.rates?.EUR || 1,
    }

    return rates
  } catch (error) {
    console.error('Error fetching exchange rates:', error)
    // Return fallback rates
    return {
      CHF: 1,
      USD: 1,
      EUR: 1,
    }
  }
}


// Create snapshot function
// Uses the same calculation logic as the frontend via NetWorthCalculationService
function createSnapshot(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  cryptoPrices: Record<string, number>,
  stockPrices: Record<string, number>,
  exchangeRates: Record<CurrencyCode, number>,
  usdToChfRate: number | null
): NetWorthSnapshot {
  // Create a convert function that matches the frontend's convert function signature
  // The frontend uses exchange rates where 1 CHF = rates[currency], so to convert FROM currency TO CHF:
  // amountInChf = amountInCurrency / rates[currency]
  const convert = (amount: number, from: CurrencyCode): number => {
    if (from === 'CHF') return amount
    const rate = exchangeRates[from]
    return rate ? amount / rate : amount
  }

  // Debug logging
  console.log('[Snapshot] Creating snapshot with:', {
    itemsCount: items.length,
    transactionsCount: transactions.length,
    cryptoPricesCount: Object.keys(cryptoPrices).length,
    stockPricesCount: Object.keys(stockPrices).length,
    hasUsdToChfRate: !!usdToChfRate,
    usdToChfRate,
    exchangeRates,
  })

  // Use the same service as the frontend (Dashboard, NetWorth, DataContext)
  let result
  try {
    result = NetWorthCalculationService.calculateTotals(
      items as any, // Type assertion needed due to slight type differences
      transactions as any,
      cryptoPrices,
      stockPrices,
      usdToChfRate,
      convert
    )
    console.log('[Snapshot] Calculation result:', {
      categoryTotals: result.categoryTotals,
      totalNetWorthChf: result.totalNetWorthChf,
    })
  } catch (error) {
    console.error('[Snapshot] Error calculating totals:', error)
    throw error
  }

  // Convert the categoryTotals to the snapshot format
  const categories: Record<string, number> = {
    'Cash': result.categoryTotals['Cash'] || 0,
    'Bank Accounts': result.categoryTotals['Bank Accounts'] || 0,
    'Retirement Funds': result.categoryTotals['Retirement Funds'] || 0,
    'Index Funds': result.categoryTotals['Index Funds'] || 0,
    'Stocks': result.categoryTotals['Stocks'] || 0,
    'Commodities': result.categoryTotals['Commodities'] || 0,
    'Crypto': result.categoryTotals['Crypto'] || 0,
    'Perpetuals': result.categoryTotals['Perpetuals'] || 0,
    'Real Estate': result.categoryTotals['Real Estate'] || 0,
    'Depreciating Assets': result.categoryTotals['Depreciating Assets'] || 0,
  }

  const total = result.totalNetWorthChf
  
  console.log('[Snapshot] Final snapshot:', {
    date: new Date().toISOString().split('T')[0],
    categories,
    total,
  })
  
  // Use UTC explicitly to avoid timezone issues
  // When cron runs at 00:00 UTC, we want to create snapshot for yesterday at 23:59:59 UTC
  const now = new Date()
  const nowUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  ))
  
  // Calculate date in UTC (YYYY-MM-DD format)
  const year = nowUTC.getUTCFullYear()
  const month = String(nowUTC.getUTCMonth() + 1).padStart(2, '0')
  const day = String(nowUTC.getUTCDate()).padStart(2, '0')
  const date = `${year}-${month}-${day}`

  return {
    date,
    timestamp: nowUTC.getTime(),
    categories,
    total,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    // Initialize Firebase Admin
    initializeAdmin()

    // Get user ID from request body or query
    const uid = req.body?.uid || req.query?.uid

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: 'User ID (uid) is required. Provide it in the request body as { "uid": "your-user-id" } or as a query parameter ?uid=your-user-id' })
    }

    const db = admin.firestore()

    // Load user data from Firestore
    const [itemsSnapshot, transactionsSnapshot, settingsSnapshot] = await Promise.all([
      db.collection(`users/${uid}/netWorthItems`).get(),
      db.collection(`users/${uid}/netWorthTransactions`).get(),
      db.collection(`users/${uid}/settings`).doc('user').get(),
    ])

    const items = itemsSnapshot.docs.map(doc => doc.data() as NetWorthItem)
    const transactions = transactionsSnapshot.docs.map(doc => doc.data() as NetWorthTransaction)
    const settings = settingsSnapshot.exists ? (settingsSnapshot.data() as UserSettings) : null

    // Get RapidAPI key from settings
    const rapidApiKey = settings?.apiKeys?.rapidApiKey || process.env.VITE_RAPIDAPI_KEY || ''

    // Fetch prices and exchange rates
    const cryptoItems = items.filter(item => item.category === 'Crypto')
    const stockItems = items.filter(item => 
      item.category === 'Index Funds' || 
      item.category === 'Stocks' || 
      item.category === 'Commodities'
    )

    const cryptoTickers = [...new Set(cryptoItems.map(item => item.name.trim().toUpperCase()))]
    const stockTickers = [...new Set(stockItems.map(item => item.name.trim().toUpperCase()))]

    // Note: We don't fetch Perpetuals API data here because:
    // 1. It doesn't work on localhost
    // 2. The snapshot should use the same calculation logic as the frontend
    // 3. If perpetualsData is not in the item, it will be calculated as 0
    // The frontend will have already populated perpetualsData if available

    const [cryptoPrices, stockPrices, exchangeRates, usdToChfRate] = await Promise.all([
      fetchCryptoPrices(cryptoTickers),
      rapidApiKey ? fetchStockPrices(stockTickers, rapidApiKey) : Promise.resolve({}),
      fetchExchangeRates(),
      fetchUsdToChfRate(),
    ])

    // Debug: Log what we're working with
    console.log('[Snapshot] Data loaded:', {
      itemsCount: items.length,
      transactionsCount: transactions.length,
      itemsByCategory: items.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      hasPerpetualsItem: items.some(item => item.category === 'Perpetuals'),
      perpetualsItemHasData: items.find(item => item.category === 'Perpetuals')?.perpetualsData ? 'yes' : 'no',
      cryptoPricesCount: Object.keys(cryptoPrices).length,
      stockPricesCount: Object.keys(stockPrices).length,
      usdToChfRate,
      exchangeRates,
    })

    // Create snapshot
    // Note: Items may already have perpetualsData if they were loaded with it from the frontend
    // We use the same calculation logic as the frontend, which uses item.perpetualsData if available
    let snapshot
    try {
      snapshot = createSnapshot(
        items,
        transactions,
        cryptoPrices,
        stockPrices,
        exchangeRates,
        usdToChfRate
      )
      console.log('[Snapshot] Snapshot created successfully:', {
        date: snapshot.date,
        total: snapshot.total,
        categories: snapshot.categories,
      })
    } catch (error) {
      console.error('[Snapshot] Error creating snapshot:', error)
      throw error
    }

    // If called around 00:00 UTC (cron job), create snapshot for yesterday at 23:59:59 UTC
    // This ensures the snapshot represents the end of the previous day, not the start of the new day
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinutes = now.getUTCMinutes()
    
    // If between 00:00 and 00:05 UTC, assume this is the daily cron and use yesterday's date
    if (utcHour === 0 && utcMinutes < 5) {
      const yesterday = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1
      ))
      const yesterdayYear = yesterday.getUTCFullYear()
      const yesterdayMonth = yesterday.getUTCMonth()
      const yesterdayDay = yesterday.getUTCDate()
      
      // Override snapshot date and timestamp to be yesterday at 23:59:59 UTC
      snapshot.date = `${yesterdayYear}-${String(yesterdayMonth + 1).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`
      snapshot.timestamp = new Date(Date.UTC(yesterdayYear, yesterdayMonth, yesterdayDay, 23, 59, 59)).getTime()
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
    console.error('Error creating snapshot:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    // Ensure we always return a JSON response
    try {
      return res.status(500).json({
        success: false,
        error: errorMessage,
      })
    } catch (jsonError) {
      // If JSON serialization fails, try to send a plain text response
      console.error('Failed to send JSON error response:', jsonError)
      return res.status(500).send(`Error: ${errorMessage}`)
    }
  }
}

