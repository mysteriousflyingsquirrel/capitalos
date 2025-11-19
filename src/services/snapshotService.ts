import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import { calculateBalanceChf } from '../pages/NetWorth'
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
  transactions: NetWorthTransaction[]
): NetWorthSnapshot {
  const categories: Record<NetWorthCategory, number> = {
    'Cash': 0,
    'Bank Accounts': 0,
    'Funds': 0,
    'Stocks': 0,
    'Commodities': 0,
    'Crypto': 0,
    'Real Estate': 0,
    'Inventory': 0,
  }

  items.forEach(item => {
    const balance = calculateBalanceChf(item.id, transactions)
    categories[item.category] += balance
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

// Get the date string for the first day of the current month (for snapshot key)
export function getCurrentMonthSnapshotDate(): string {
  const now = new Date()
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return firstDayOfCurrentMonth.toISOString().split('T')[0]
}

// Get the date string for the first day of the previous month
export function getPreviousMonthSnapshotDate(): string {
  const now = new Date()
  const firstDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return firstDayOfPreviousMonth.toISOString().split('T')[0]
}

// Check if we should take a snapshot for the current month
// This is called on app load - if we're on or past the first day of the current month
// and don't have a snapshot for it, we should create one
export function shouldTakeSnapshotForCurrentMonth(snapshots: NetWorthSnapshot[]): boolean {
  const currentMonthDate = getCurrentMonthSnapshotDate()
  
  // Check if we already have a snapshot for current month
  if (hasSnapshotForDate(snapshots, currentMonthDate)) {
    return false // Already have snapshot
  }
  
  // Check if we're on or past the first day of the current month
  const now = new Date()
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  // If today is on or after the first day of current month, we should take a snapshot
  return today >= firstDayOfCurrentMonth
}

// Check if snapshot already exists for a given date
export function hasSnapshotForDate(snapshots: NetWorthSnapshot[], date: string): boolean {
  return snapshots.some(s => s.date === date)
}

// Take a snapshot for the current month if needed (called on app load)
// This creates a snapshot dated as the first day of the current month
export async function takeSnapshotForCurrentMonthIfNeeded(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  uid?: string
): Promise<NetWorthSnapshot | null> {
  const snapshots = await loadSnapshots(uid)
  
  // Check if we should take a snapshot for the current month
  if (!shouldTakeSnapshotForCurrentMonth(snapshots)) {
    return null
  }
  
  // Create snapshot with the date of the first day of current month
  const currentMonthDate = getCurrentMonthSnapshotDate()
  const firstDayOfMonth = new Date(currentMonthDate)
  
  const categories: Record<NetWorthCategory, number> = {
    'Cash': 0,
    'Bank Accounts': 0,
    'Funds': 0,
    'Stocks': 0,
    'Commodities': 0,
    'Crypto': 0,
    'Real Estate': 0,
    'Inventory': 0,
  }

  items.forEach(item => {
    const balance = calculateBalanceChf(item.id, transactions)
    categories[item.category] += balance
  })

  const total = Object.values(categories).reduce((sum, val) => sum + val, 0)

  const snapshot: NetWorthSnapshot = {
    date: currentMonthDate,
    timestamp: firstDayOfMonth.getTime(),
    categories,
    total,
  }
  
  const updatedSnapshots = [...snapshots, snapshot].sort((a, b) => a.timestamp - b.timestamp)
  await saveSnapshots(updatedSnapshots, uid)
  return snapshot
}

