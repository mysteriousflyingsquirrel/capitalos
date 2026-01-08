import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { CurrencyCode } from '../../src/lib/currency'
import { NetWorthCalculationService } from '../../src/services/netWorthCalculationService'

// Export config for Vercel (increase timeout if needed)
export const config = {
  maxDuration: 60,
}

// Initialize Firebase Admin SDK
function initializeAdmin() {
  // Check if Firebase Admin is already initialized (important for serverless)
  if (admin.apps.length > 0) {
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
  } catch (error) {
    // Handle "already exists" error in serverless environments
    if (error instanceof Error && error.message.includes('already exists')) {
      return
    }
    console.error('Failed to initialize Firebase Admin:', error)
    throw new Error(`Firebase Admin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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


// Note: Calculation logic is handled by NetWorthCalculationService
// which uses balanceCalculationService internally and falls back to transaction-based calculations
// when prices are not provided. This ensures consistency with the frontend.
// 
// All calculations use pricePerItemChf already stored in transactions - no external API calls needed.


// Create snapshot function
// Uses the same calculation logic as the frontend via NetWorthCalculationService
// All values are calculated from stored transactions using pricePerItemChf - no external API calls
function createSnapshot(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  convert: (amount: number, from: CurrencyCode) => number
): NetWorthSnapshot {
  // Use empty price objects - this triggers transaction-based calculations
  // which use pricePerItemChf already stored in each transaction
  const cryptoPrices: Record<string, number> = {}
  const stockPrices: Record<string, number> = {}
  const usdToChfRate: number | null = null

  // Debug logging
  console.log('[Snapshot] Creating snapshot with transaction-based calculations:', {
    itemsCount: items.length,
    transactionsCount: transactions.length,
    usingStoredPrices: true,
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

    // Load user data from Firestore - only items and transactions needed
    // All calculations use pricePerItemChf already stored in transactions
    console.log('[Snapshot] Loading data from Firestore for user:', uid)
    const [itemsSnapshot, transactionsSnapshot] = await Promise.all([
      db.collection(`users/${uid}/netWorthItems`).get(),
      db.collection(`users/${uid}/netWorthTransactions`).get(),
    ])

    const items = itemsSnapshot.docs.map(doc => doc.data() as NetWorthItem)
    const transactions = transactionsSnapshot.docs.map(doc => doc.data() as NetWorthTransaction)

    console.log('[Snapshot] Data loaded:', {
      itemsCount: items.length,
      transactionsCount: transactions.length,
      itemsByCategory: items.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      hasPerpetualsItem: items.some(item => item.category === 'Perpetuals'),
    })

    // Create a simple convert function for currency conversion
    // Uses fallback rates (1:1) - transactions already have pricePerItemChf in CHF
    // This is only used as a fallback if transactions have pricePerItem in other currencies
    const convert = (amount: number, from: CurrencyCode): number => {
      if (from === 'CHF') return amount
      // Fallback: assume 1:1 if no exchange rates available
      // In practice, transactions should have pricePerItemChf which is already in CHF
      return amount
    }

    // Create snapshot using transaction-based calculations (no external API calls)
    console.log('[Snapshot] Creating snapshot with transaction-based calculations...')
    let snapshot
    try {
      snapshot = createSnapshot(
        items,
        transactions,
        convert
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

