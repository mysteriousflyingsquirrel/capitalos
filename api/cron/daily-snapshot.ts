import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { NetWorthItem, NetWorthTransaction, NetWorthCategory } from '../../src/pages/NetWorth'
import { createSnapshot, getTodayUTCDate, getToday2359UTCTimestamp, hasSnapshotForDate } from '../../src/services/snapshotService'
import { calculateBalanceChf, calculateCoinAmount } from '../../src/pages/NetWorth'
import type { CurrencyCode } from '../../src/lib/currency'

// Initialize Firebase Admin SDK
let db: admin.firestore.Firestore
try {
  if (!admin.apps.length) {
    // Try to use service account from environment variable
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
      })
    } else {
      // Fallback: use default credentials (for Vercel, this uses Application Default Credentials)
      admin.initializeApp()
    }
  }
  db = admin.firestore()
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error)
  // db will be undefined, will be caught in handler
}

// Fetch exchange rates (server-side version)
async function getExchangeRates(base: CurrencyCode = 'CHF'): Promise<{ base: CurrencyCode; rates: Record<CurrencyCode, number> }> {
  try {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`)
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }
    const data = await response.json()
    
    // Initialize with all required properties
    const rates: Record<CurrencyCode, number> = {
      CHF: base === 'CHF' ? 1 : (data.rates?.CHF || 1),
      USD: base === 'USD' ? 1 : (data.rates?.USD || (base === 'CHF' ? 0.92 : 1.08)),
      EUR: base === 'EUR' ? 1 : (data.rates?.EUR || (base === 'CHF' ? 0.95 : 1.05)),
    }
    
    // Override with API data if available
    if (data.rates) {
      if (data.rates.USD) rates.USD = data.rates.USD
      if (data.rates.EUR) rates.EUR = data.rates.EUR
      if (data.rates.CHF) rates.CHF = data.rates.CHF
    }
    
    return { base, rates }
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
    // Return fallback rates
    return {
      base: 'CHF',
      rates: {
        CHF: 1,
        USD: 0.92,
        EUR: 0.95,
      },
    }
  }
}

// Convert function (server-side version)
function createConvertFunction(exchangeRates: { base: CurrencyCode; rates: Record<CurrencyCode, number> }): (amount: number, from: CurrencyCode) => number {
  return (amount: number, from: CurrencyCode): number => {
    if (from === exchangeRates.base) {
      return amount
    }
    const rate = exchangeRates.rates[from]
    if (!rate || rate === 0) {
      return amount
    }
    return amount / rate
  }
}

// Fetch crypto prices (server-side version)
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
    console.error('Failed to fetch crypto prices:', error)
    return {}
  }
}

// Fetch USD to CHF rate from CryptoCompare (server-side version)
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

    throw new Error('Invalid response format from CryptoCompare API')
  } catch (error) {
    console.error('Failed to fetch USD to CHF rate:', error)
    return null
  }
}

// Get all user IDs from Firestore
async function getAllUserIds(): Promise<string[]> {
  try {
    const usersSnapshot = await db.collection('users').get()
    return usersSnapshot.docs.map(doc => doc.id)
  } catch (error) {
    console.error('Failed to get user IDs:', error)
    return []
  }
}

// Load user data from Firestore
async function loadUserData(uid: string): Promise<{
  items: NetWorthItem[]
  transactions: NetWorthTransaction[]
}> {
  try {
    const [itemsSnapshot, transactionsSnapshot] = await Promise.all([
      db.collection(`users/${uid}/netWorthItems`).get(),
      db.collection(`users/${uid}/transactions`).get(),
    ])

    const items = itemsSnapshot.docs.map(doc => doc.data() as NetWorthItem)
    const transactions = transactionsSnapshot.docs.map(doc => doc.data() as NetWorthTransaction)

    return { items, transactions }
  } catch (error) {
    console.error(`Failed to load data for user ${uid}:`, error)
    return { items: [], transactions: [] }
  }
}

// Load existing snapshots for a user
async function loadUserSnapshots(uid: string): Promise<any[]> {
  try {
    const snapshotsSnapshot = await db.collection(`users/${uid}/snapshots`).get()
    return snapshotsSnapshot.docs.map(doc => doc.data())
  } catch (error) {
    console.error(`Failed to load snapshots for user ${uid}:`, error)
    return []
  }
}

// Save snapshot to Firestore
async function saveSnapshot(uid: string, snapshot: any): Promise<void> {
  try {
    // Use date as document ID (matching the existing structure)
    const docId = snapshot.date
    await db.collection(`users/${uid}/snapshots`).doc(docId).set(snapshot)
  } catch (error) {
    console.error(`Failed to save snapshot for user ${uid}:`, error)
    throw error
  }
}

// Process snapshot for a single user
async function processUserSnapshot(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Load user data
    const { items, transactions } = await loadUserData(uid)
    
    if (items.length === 0) {
      console.log(`User ${uid} has no net worth items, skipping`)
      return { success: true }
    }

    // When cron runs at 00:00 UTC, create snapshot for yesterday (previous day) at 23:59 UTC
    const now = new Date()
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
    const yesterdayYear = yesterday.getUTCFullYear()
    const yesterdayMonth = yesterday.getUTCMonth()
    const yesterdayDay = yesterday.getUTCDate()
    
    // Get yesterday's date in YYYY-MM-DD format
    const yesterdayDate = `${yesterdayYear}-${String(yesterdayMonth + 1).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`
    
    // Check if snapshot already exists for yesterday
    const existingSnapshots = await loadUserSnapshots(uid)
    
    if (hasSnapshotForDate(existingSnapshots, yesterdayDate)) {
      console.log(`User ${uid} already has a snapshot for yesterday (${yesterdayDate}), skipping`)
      return { success: true }
    }

    // Fetch exchange rates, crypto prices, and USD to CHF rate
    const [exchangeRates, cryptoTickers] = await Promise.all([
      getExchangeRates('CHF'),
      Promise.resolve(
        items
          .filter(item => item.category === 'Crypto' && item.name)
          .map(item => item.name.trim().toUpperCase())
      ),
    ])

    const [cryptoPrices, usdToChfRate] = await Promise.all([
      fetchCryptoPrices(cryptoTickers),
      fetchUsdToChfRate(),
    ])
    const convert = createConvertFunction(exchangeRates)

    // Create snapshot with current data
    const snapshot = createSnapshot(items, transactions, cryptoPrices, convert, usdToChfRate)
    
    // Override date and timestamp to be yesterday at 23:59:59 UTC
    snapshot.date = yesterdayDate
    snapshot.timestamp = new Date(Date.UTC(yesterdayYear, yesterdayMonth, yesterdayDay, 23, 59, 59)).getTime()

    // Save snapshot
    await saveSnapshot(uid, snapshot)

    console.log(`Successfully created snapshot for user ${uid} for ${yesterdayDate} at 23:59:59 UTC`)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Failed to process snapshot for user ${uid}:`, errorMessage)
    return { success: false, error: errorMessage }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check Firebase initialization
  if (!db) {
    console.error('Firebase Admin SDK not initialized')
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'Firebase Admin SDK initialization failed'
    })
  }

  // Check for authorization (cron secret)
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('CRON_SECRET environment variable is not set')
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'CRON_SECRET not configured'
    })
  }

  // Verify the request is from Vercel Cron
  // Check Authorization header (Bearer token) or x-vercel-signature header
  const authHeader = req.headers.authorization
  const vercelSignature = req.headers['x-vercel-signature'] as string | undefined
  
  const isAuthorized = 
    authHeader === `Bearer ${cronSecret}` ||
    vercelSignature === cronSecret ||
    // Allow if no secret is provided in headers (for testing, but warn)
    (!authHeader && !vercelSignature && process.env.NODE_ENV === 'development')

  if (!isAuthorized) {
    console.warn('Unauthorized cron request - missing or invalid secret')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Only allow POST requests (Vercel Cron uses POST)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Starting daily snapshot process...')
    
    // Get all user IDs
    const userIds = await getAllUserIds()
    console.log(`Found ${userIds.length} users to process`)

    if (userIds.length === 0) {
      return res.status(200).json({ 
        message: 'No users found',
        processed: 0,
        successful: 0,
        failed: 0,
      })
    }

    // Process each user
    const results = await Promise.allSettled(
      userIds.map(uid => processUserSnapshot(uid))
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length

    console.log(`Daily snapshot process completed: ${successful} successful, ${failed} failed`)

    return res.status(200).json({
      message: 'Daily snapshot process completed',
      processed: userIds.length,
      successful,
      failed,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Daily snapshot process failed:', errorMessage)
    return res.status(500).json({ 
      error: 'Failed to process snapshots',
      message: errorMessage,
    })
  }
}

