import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { CurrencyCode } from '../../src/lib/currency'

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
interface NetWorthItem {
  id: string
  category: 'Cash' | 'Bank Accounts' | 'Retirement Funds' | 'Index Funds' | 'Stocks' | 'Commodities' | 'Crypto' | 'Real Estate' | 'Depreciating Assets'
  name: string
  platform: string
  currency: string
  monthlyDepreciationChf?: number
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

// Helper function to calculate coin amount (for Crypto)
function calculateCoinAmount(itemId: string, transactions: NetWorthTransaction[]): number {
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => sum + (tx.side === 'buy' ? 1 : -1) * tx.amount, 0)
}

// Helper function to calculate balance in CHF
function calculateBalanceChf(
  itemId: string,
  transactions: NetWorthTransaction[],
  item?: NetWorthItem,
  cryptoPrices?: Record<string, number>,
  exchangeRates?: Record<CurrencyCode, number>,
  usdToChfRate?: number | null
): number {
  // For Crypto with current prices
  if (item?.category === 'Crypto' && cryptoPrices && item.name) {
    const coinAmount = calculateCoinAmount(itemId, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPrice = cryptoPrices[ticker]
    if (currentPrice !== undefined && currentPrice > 0) {
      // Price is in USD - convert to CHF
      const valueUsd = coinAmount * currentPrice
      if (usdToChfRate && usdToChfRate > 0) {
        return valueUsd * usdToChfRate
      } else if (exchangeRates && exchangeRates.USD) {
        // Convert using exchange rates: 1 USD = 1 / rates.USD CHF
        return valueUsd / exchangeRates.USD
      } else {
        // Fallback: assume 1:1 (shouldn't happen)
        return valueUsd
      }
    }
  }

  // For Depreciating Assets
  if (item?.category === 'Depreciating Assets' && item.monthlyDepreciationChf && item.monthlyDepreciationChf > 0) {
    const itemTransactions = transactions.filter(tx => 
      tx.itemId === itemId && !tx.id.startsWith('depr-')
    )
    
    let baseBalance = itemTransactions.reduce((sum, tx) => {
      const txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      
      if (tx.pricePerItem !== undefined && tx.currency && exchangeRates) {
        const priceInOriginalCurrency = tx.pricePerItem
        const totalInOriginalCurrency = txValue * priceInOriginalCurrency
        // Convert to CHF
        if (tx.currency === 'CHF') {
          return sum + totalInOriginalCurrency
        } else if (exchangeRates[tx.currency as CurrencyCode]) {
          return sum + totalInOriginalCurrency / exchangeRates[tx.currency as CurrencyCode]
        }
      }
      return sum + txValue * tx.pricePerItemChf
    }, 0)
    
    const buyTransactions = itemTransactions
      .filter(tx => tx.side === 'buy')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    if (buyTransactions.length > 0) {
      const firstBuyDate = new Date(buyTransactions[0].date)
      const now = new Date()
      const monthsDiff = (now.getFullYear() - firstBuyDate.getFullYear()) * 12 + 
                         (now.getMonth() - firstBuyDate.getMonth())
      const depreciationAmount = monthsDiff * item.monthlyDepreciationChf
      baseBalance = Math.max(0, baseBalance - depreciationAmount)
    }
    
    return baseBalance
  }

  // For all other categories
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => {
      const txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      
      if (tx.pricePerItem !== undefined && tx.currency && exchangeRates) {
        const priceInOriginalCurrency = tx.pricePerItem
        const totalInOriginalCurrency = txValue * priceInOriginalCurrency
        // Convert to CHF
        if (tx.currency === 'CHF') {
          return sum + totalInOriginalCurrency
        } else if (exchangeRates[tx.currency as CurrencyCode]) {
          return sum + totalInOriginalCurrency / exchangeRates[tx.currency as CurrencyCode]
        }
      }
      return sum + txValue * tx.pricePerItemChf
    }, 0)
}

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
function createSnapshot(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  cryptoPrices: Record<string, number>,
  stockPrices: Record<string, number>,
  exchangeRates: Record<CurrencyCode, number>,
  usdToChfRate: number | null
): NetWorthSnapshot {
  const categories: Record<string, number> = {
    'Cash': 0,
    'Bank Accounts': 0,
    'Retirement Funds': 0,
    'Index Funds': 0,
    'Stocks': 0,
    'Commodities': 0,
    'Crypto': 0,
    'Real Estate': 0,
    'Depreciating Assets': 0,
  }

  items.forEach(item => {
    if (item.category === 'Crypto') {
      const coinAmount = calculateCoinAmount(item.id, transactions)
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = cryptoPrices[ticker] || 0
      
      if (currentPriceUsd > 0) {
        const valueUsd = coinAmount * currentPriceUsd
        if (usdToChfRate && usdToChfRate > 0) {
          categories[item.category] += valueUsd * usdToChfRate
        } else if (exchangeRates.USD) {
          categories[item.category] += valueUsd / exchangeRates.USD
        } else {
          categories[item.category] += valueUsd
        }
      } else {
        const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, exchangeRates, usdToChfRate)
        if (usdToChfRate && usdToChfRate > 0) {
          categories[item.category] += balanceUsd * usdToChfRate
        } else if (exchangeRates.USD) {
          categories[item.category] += balanceUsd / exchangeRates.USD
        } else {
          categories[item.category] += balanceUsd
        }
      }
    } else if (item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities') {
      // For stocks/index funds/commodities, use current prices if available
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = stockPrices[ticker]
      
      if (currentPriceUsd && currentPriceUsd > 0) {
        // Calculate holdings (quantity)
        const holdings = transactions
          .filter(tx => tx.itemId === item.id)
          .reduce((sum, tx) => sum + (tx.side === 'buy' ? 1 : -1) * tx.amount, 0)
        
        // Value in USD
        const valueUsd = holdings * currentPriceUsd
        
        // Convert to CHF
        if (usdToChfRate && usdToChfRate > 0) {
          categories[item.category] += valueUsd * usdToChfRate
        } else if (exchangeRates.USD && exchangeRates.USD > 0) {
          categories[item.category] += valueUsd / exchangeRates.USD
        } else {
          // Fallback: assume 1 USD = 1 CHF (shouldn't happen)
          categories[item.category] += valueUsd
        }
      } else {
        // Fallback to transaction-based calculation
        categories[item.category] += calculateBalanceChf(item.id, transactions, item, cryptoPrices, exchangeRates, usdToChfRate)
      }
    } else {
      categories[item.category] += calculateBalanceChf(item.id, transactions, item, cryptoPrices, exchangeRates, usdToChfRate)
    }
  })

  const total = Object.values(categories).reduce((sum, val) => sum + val, 0)
  
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

    const [cryptoPrices, stockPrices, exchangeRates, usdToChfRate] = await Promise.all([
      fetchCryptoPrices(cryptoTickers),
      rapidApiKey ? fetchStockPrices(stockTickers, rapidApiKey) : Promise.resolve({}),
      fetchExchangeRates(),
      fetchUsdToChfRate(),
    ])

    // Create snapshot
    const snapshot = createSnapshot(
      items,
      transactions,
      cryptoPrices,
      stockPrices,
      exchangeRates,
      usdToChfRate
    )

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
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

