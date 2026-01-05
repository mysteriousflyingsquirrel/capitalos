import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import { calculateBalanceChf, calculateCoinAmount } from './balanceCalculationService'
import type { NetWorthCategory } from '../pages/NetWorth'

export interface NetWorthSnapshot {
  /** ISO date string (YYYY-MM-DD) */
  date: string
  /** Unix timestamp in milliseconds */
  timestamp: number
  categories: Record<NetWorthCategory, number>
  total: number
}

const SNAPSHOTS_STORAGE_KEY = 'capitalos_net_worth_snapshots_v1'

/**
 * Loads snapshots from Firestore (if uid provided) or localStorage.
 * Snapshots are sorted by timestamp in ascending order.
 */
export async function loadSnapshots(uid?: string): Promise<NetWorthSnapshot[]> {
  try {
    let storedSnapshots: NetWorthSnapshot[] = []
    
    if (uid) {
      try {
        const { loadSnapshotsFirestore } = await import('./firestoreService')
        storedSnapshots = await loadSnapshotsFirestore<NetWorthSnapshot>(uid)
      } catch (error) {
        console.error('Failed to load snapshots from Firestore, falling back to localStorage:', error)
        const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)
        if (stored) {
          storedSnapshots = JSON.parse(stored) as NetWorthSnapshot[]
        }
      }
    } else {
      const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)
      if (stored) {
        storedSnapshots = JSON.parse(stored) as NetWorthSnapshot[]
      }
    }
    storedSnapshots.sort((a, b) => a.timestamp - b.timestamp)
    return storedSnapshots
  } catch (error) {
    console.error('Failed to load snapshots:', error)
    return []
  }
}

/**
 * Saves snapshots to Firestore (if uid provided) or localStorage.
 * When Firestore is used, data is also synced to localStorage as backup.
 */
export async function saveSnapshots(snapshots: NetWorthSnapshot[], uid?: string): Promise<void> {
  try {
    if (uid) {
      try {
        const { saveSnapshotsFirestore } = await import('./firestoreService')
        await saveSnapshotsFirestore(uid, snapshots)
        localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
      } catch (error) {
        console.error('Failed to save snapshots to Firestore:', error)
        localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
      }
    } else {
      localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
    }
  } catch (error) {
    console.error('Failed to save snapshots:', error)
  }
}

/**
 * Creates a snapshot of the current net worth state.
 * Calculates total value per category and overall total in CHF.
 */
export function createSnapshot(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  cryptoPrices?: Record<string, number>,
  convert?: (amount: number, from: import('../lib/currency').CurrencyCode) => number,
  usdToChfRate?: number | null
): NetWorthSnapshot {
  const categories: Record<NetWorthCategory, number> = {
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
      const currentPriceUsd = cryptoPrices && cryptoPrices[ticker] ? cryptoPrices[ticker] : 0
      
      if (currentPriceUsd > 0) {
        // Use usdToChfRate (from CryptoCompare) to match Dashboard calculation, fallback to convert if not available
        const valueUsd = coinAmount * currentPriceUsd
        if (usdToChfRate && usdToChfRate > 0) {
          categories[item.category] += valueUsd * usdToChfRate
        } else if (convert) {
          categories[item.category] += convert(valueUsd, 'USD')
        } else {
          // Last resort: treat as CHF (shouldn't happen)
          categories[item.category] += valueUsd
        }
      } else {
        // Fallback: calculateBalanceChf returns USD for crypto, need to convert to CHF
        const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        if (usdToChfRate && usdToChfRate > 0) {
          categories[item.category] += balanceUsd * usdToChfRate
        } else if (convert) {
          categories[item.category] += convert(balanceUsd, 'USD')
        } else {
          categories[item.category] += balanceUsd
        }
      }
    } else {
      categories[item.category] += calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
    }
  })

  const total = Object.values(categories).reduce((sum, val) => sum + val, 0)
  const now = new Date()
  const date = now.toISOString().split('T')[0]

  return {
    date,
    timestamp: now.getTime(),
    categories,
    total,
  }
}

/**
 * Checks if a snapshot exists for the given date.
 */
export function hasSnapshotForDate(snapshots: NetWorthSnapshot[], date: string): boolean {
  return snapshots.some(s => s.date === date)
}

/**
 * Returns today's date in UTC as YYYY-MM-DD format.
 */
export function getTodayUTCDate(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Returns the timestamp for 23:59:59 UTC today.
 * Used for daily snapshots to ensure consistent timing.
 */
export function getToday2359UTCTimestamp(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  const date2359 = new Date(Date.UTC(year, month, day, 23, 59, 59))
  return date2359.getTime()
}


