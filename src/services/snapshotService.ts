import type { NetWorthItem, NetWorthTransaction, NetWorthCategory } from '../pages/NetWorth'
import { NetWorthCalculationService } from './netWorthCalculationService'
import type { CurrencyCode } from '../lib/currency'

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
 * Uses NetWorthCalculationService for consistent calculation logic with frontend.
 */
export function createSnapshot(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  cryptoPrices: Record<string, number>,
  stockPrices: Record<string, number>,
  convert: (amount: number, from: CurrencyCode) => number,
  usdToChfRate: number | null
): NetWorthSnapshot {
  // Use the same service as the frontend
  const result = NetWorthCalculationService.calculateTotals(
    items,
    transactions,
    cryptoPrices,
    stockPrices,
    usdToChfRate,
    convert
  )

  const categories: Record<NetWorthCategory, number> = {
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


