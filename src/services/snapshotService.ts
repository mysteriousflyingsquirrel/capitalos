import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import { calculateBalanceChf, calculateCoinAmount } from '../pages/NetWorth'
import type { NetWorthCategory } from '../pages/NetWorth'

export interface NetWorthSnapshot {
  date: string // ISO date string (YYYY-MM-DD)
  timestamp: number // Unix timestamp in ms
  categories: Record<NetWorthCategory, number>
  total: number
}

const SNAPSHOTS_STORAGE_KEY = 'capitalos_net_worth_snapshots_v1'

// Load snapshots from Firestore (if uid provided) or localStorage
export async function loadSnapshots(uid?: string): Promise<NetWorthSnapshot[]> {
  try {
    let storedSnapshots: NetWorthSnapshot[] = []
    
    // Try to load from Firestore first if uid is provided
    if (uid) {
      try {
        const { loadSnapshotsFirestore } = await import('./firestoreService')
        storedSnapshots = await loadSnapshotsFirestore<NetWorthSnapshot>(uid)
      } catch (error) {
        console.error('Failed to load snapshots from Firestore, falling back to localStorage:', error)
        // Fall back to localStorage
        const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)
        if (stored) {
          storedSnapshots = JSON.parse(stored) as NetWorthSnapshot[]
        }
      }
    } else {
      // Load from localStorage
      const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)
      if (stored) {
        storedSnapshots = JSON.parse(stored) as NetWorthSnapshot[]
      }
    }
    
    // Sort by date
    storedSnapshots.sort((a, b) => a.timestamp - b.timestamp)
    return storedSnapshots
  } catch (error) {
    console.error('Failed to load snapshots:', error)
    return []
  }
}

// Save snapshots to Firestore (if uid provided) or localStorage
export async function saveSnapshots(snapshots: NetWorthSnapshot[], uid?: string): Promise<void> {
  try {
    // Save to Firestore if uid is provided
    if (uid) {
      try {
        const { saveSnapshotsFirestore } = await import('./firestoreService')
        await saveSnapshotsFirestore(uid, snapshots)
        // Also save to localStorage as backup
        localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
      } catch (error) {
        console.error('Failed to save snapshots to Firestore:', error)
        // Fall back to localStorage
        localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
      }
    } else {
      // Save to localStorage only
      localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
    }
  } catch (error) {
    console.error('Failed to save snapshots:', error)
  }
}

// Create a snapshot from current net worth data
export function createSnapshot(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  cryptoPrices?: Record<string, number>,
  convert?: (amount: number, from: import('../lib/currency').CurrencyCode) => number
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
      // For Crypto: match Dashboard logic EXACTLY
      const coinAmount = calculateCoinAmount(item.id, transactions)
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = cryptoPrices && cryptoPrices[ticker] ? cryptoPrices[ticker] : 0
      
      if (currentPriceUsd > 0 && convert) {
        // Match Dashboard: convert USD to CHF
        categories[item.category] += convert(coinAmount * currentPriceUsd, 'USD')
      } else {
        // Match Dashboard: use calculateBalanceChf directly (already in CHF)
        categories[item.category] += calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }
    } else {
      // For non-Crypto items, balance is already in CHF
      categories[item.category] += calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
    }
  })

  const total = Object.values(categories).reduce((sum, val) => sum + val, 0)
  const now = new Date()
  const date = now.toISOString().split('T')[0] // YYYY-MM-DD

  return {
    date,
    timestamp: now.getTime(),
    categories,
    total,
  }
}

// Get the date string for the last day of the current month (for snapshot key)
export function getCurrentMonthSnapshotDate(): string {
  const now = new Date()
  const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return lastDayOfCurrentMonth.toISOString().split('T')[0]
}

// Get the date string for the last day of the previous month
export function getPreviousMonthSnapshotDate(): string {
  const now = new Date()
  const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  return lastDayOfPreviousMonth.toISOString().split('T')[0]
}

// Check if we should take a snapshot for the previous month
// This is called on app load - if we're on the last day of the current month OR
// if we're on the 1st or later of a new month and don't have a snapshot for the previous month
export function shouldTakeSnapshotForPreviousMonth(snapshots: NetWorthSnapshot[]): boolean {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  // Determine which month we need to snapshot
  let targetMonthDate: string
  if (today.getTime() === lastDayOfCurrentMonth.getTime()) {
    // We're on the last day of the current month - snapshot current month
    targetMonthDate = getCurrentMonthSnapshotDate()
  } else if (today >= firstDayOfCurrentMonth) {
    // We're on the 1st or later of the current month - snapshot previous month
    targetMonthDate = getPreviousMonthSnapshotDate()
  } else {
    // Shouldn't happen, but default to previous month
    targetMonthDate = getPreviousMonthSnapshotDate()
  }
  
  // Check if we already have a snapshot for the target month
  if (hasSnapshotForDate(snapshots, targetMonthDate)) {
    return false // Already have snapshot
  }
  
  // We should take a snapshot if:
  // 1. We're on the last day of the current month, OR
  // 2. We're on the 1st or later of the current month and don't have a snapshot for previous month
  return true
}

// Check if snapshot already exists for a given date
export function hasSnapshotForDate(snapshots: NetWorthSnapshot[], date: string): boolean {
  return snapshots.some(s => s.date === date)
}

// Get today's date in UTC (YYYY-MM-DD format)
export function getTodayUTCDate(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Get timestamp for 23:59 UTC today
export function getToday2359UTCTimestamp(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  // Create date for 23:59:59 UTC today
  const date2359 = new Date(Date.UTC(year, month, day, 23, 59, 59))
  return date2359.getTime()
}

// Check if we should take a snapshot for today (at 23:59 UTC)
// Only create snapshot if it's past 23:59 UTC today
export function shouldTakeSnapshotToday(snapshots: NetWorthSnapshot[]): boolean {
  const now = new Date()
  const currentHourUTC = now.getUTCHours()
  const currentMinuteUTC = now.getUTCMinutes()
  
  // Only take snapshot if it's past 23:59 UTC today
  if (currentHourUTC < 23 || (currentHourUTC === 23 && currentMinuteUTC < 59)) {
    return false
  }
  
  const todayDate = getTodayUTCDate()
  // Check if we already have a snapshot for today
  return !hasSnapshotForDate(snapshots, todayDate)
}

// Take a daily snapshot at 23:59 UTC if needed
export async function takeDailySnapshotIfNeeded(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  uid?: string,
  cryptoPrices?: Record<string, number>,
  convert?: (amount: number, from: import('../lib/currency').CurrencyCode) => number
): Promise<NetWorthSnapshot | null> {
  const snapshots = await loadSnapshots(uid)
  
  // Check if we should take a snapshot for today
  if (!shouldTakeSnapshotToday(snapshots)) {
    return null
  }

  const todayDate = getTodayUTCDate()
  const todayTimestamp = getToday2359UTCTimestamp()

  // Create snapshot with current data
  const snapshot = createSnapshot(items, transactions, cryptoPrices, convert)
  
  // Override date and timestamp to be today at 23:59 UTC
  snapshot.date = todayDate
  snapshot.timestamp = todayTimestamp
  
  const updatedSnapshots = [...snapshots, snapshot].sort((a, b) => a.timestamp - b.timestamp)
  await saveSnapshots(updatedSnapshots, uid)
  return snapshot
}

