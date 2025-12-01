export interface CashflowSnapshot {
  date: string // ISO date string (YYYY-MM-DD)
  timestamp: number // Unix timestamp in ms
  inflow: number // Total inflow in CHF
  outflow: number // Total outflow in CHF
  spare: number // Spare change in CHF
}

const CASHFLOW_SNAPSHOTS_STORAGE_KEY = 'capitalos_cashflow_snapshots_v1'

// Load cashflow snapshots from Firestore (if uid provided) or localStorage
export async function loadCashflowSnapshots(uid?: string): Promise<CashflowSnapshot[]> {
  try {
    let storedSnapshots: CashflowSnapshot[] = []
    
    // Try to load from Firestore first if uid is provided
    if (uid) {
      try {
        const { loadCashflowSnapshotsFirestore } = await import('./firestoreService')
        storedSnapshots = await loadCashflowSnapshotsFirestore<CashflowSnapshot>(uid)
      } catch (error) {
        console.error('Failed to load cashflow snapshots from Firestore, falling back to localStorage:', error)
        // Fall back to localStorage
        const stored = localStorage.getItem(CASHFLOW_SNAPSHOTS_STORAGE_KEY)
        if (stored) {
          storedSnapshots = JSON.parse(stored) as CashflowSnapshot[]
        }
      }
    } else {
      // Load from localStorage
      const stored = localStorage.getItem(CASHFLOW_SNAPSHOTS_STORAGE_KEY)
      if (stored) {
        storedSnapshots = JSON.parse(stored) as CashflowSnapshot[]
      }
    }
    
    // Sort by date
    storedSnapshots.sort((a, b) => a.timestamp - b.timestamp)
    return storedSnapshots
  } catch (error) {
    console.error('Failed to load cashflow snapshots:', error)
    return []
  }
}

// Save cashflow snapshots to Firestore (if uid provided) or localStorage
export async function saveCashflowSnapshots(snapshots: CashflowSnapshot[], uid?: string): Promise<void> {
  try {
    // Save to Firestore if uid is provided
    if (uid) {
      try {
        const { saveCashflowSnapshotsFirestore } = await import('./firestoreService')
        await saveCashflowSnapshotsFirestore(uid, snapshots)
        // Also save to localStorage as backup
        localStorage.setItem(CASHFLOW_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
      } catch (error) {
        console.error('Failed to save cashflow snapshots to Firestore:', error)
        // Fall back to localStorage
        localStorage.setItem(CASHFLOW_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
      }
    } else {
      // Save to localStorage only
      localStorage.setItem(CASHFLOW_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
    }
  } catch (error) {
    console.error('Failed to save cashflow snapshots:', error)
  }
}

// Create a cashflow snapshot from current cashflow data
export function createCashflowSnapshot(
  inflowChf: number,
  outflowChf: number,
  spareChf: number
): CashflowSnapshot {
  const now = new Date()
  const date = now.toISOString().split('T')[0] // YYYY-MM-DD

  return {
    date,
    timestamp: now.getTime(),
    inflow: inflowChf,
    outflow: outflowChf,
    spare: spareChf,
  }
}

// Get the date string for the last day of the current month (for snapshot key)
export function getCurrentMonthCashflowSnapshotDate(): string {
  const now = new Date()
  const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return lastDayOfCurrentMonth.toISOString().split('T')[0]
}

// Get the date string for the last day of the previous month
export function getPreviousMonthCashflowSnapshotDate(): string {
  const now = new Date()
  const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  return lastDayOfPreviousMonth.toISOString().split('T')[0]
}

// Check if we should take a cashflow snapshot for the previous month
// This is called on app load - if we're on the last day of the current month OR
// if we're on the 1st or later of a new month and don't have a snapshot for the previous month
export function shouldTakeCashflowSnapshotForPreviousMonth(snapshots: CashflowSnapshot[]): boolean {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  // Determine which month we need to snapshot
  let targetMonthDate: string
  if (today.getTime() === lastDayOfCurrentMonth.getTime()) {
    // We're on the last day of the current month - snapshot current month
    targetMonthDate = getCurrentMonthCashflowSnapshotDate()
  } else if (today >= firstDayOfCurrentMonth) {
    // We're on the 1st or later of the current month - snapshot previous month
    targetMonthDate = getPreviousMonthCashflowSnapshotDate()
  } else {
    // Shouldn't happen, but default to previous month
    targetMonthDate = getPreviousMonthCashflowSnapshotDate()
  }
  
  // Check if we already have a snapshot for the target month
  if (hasCashflowSnapshotForDate(snapshots, targetMonthDate)) {
    return false // Already have snapshot
  }
  
  // We should take a snapshot if:
  // 1. We're on the last day of the current month, OR
  // 2. We're on the 1st or later of the current month and don't have a snapshot for previous month
  return true
}

// Check if cashflow snapshot already exists for a given date
export function hasCashflowSnapshotForDate(snapshots: CashflowSnapshot[], date: string): boolean {
  return snapshots.some(s => s.date === date)
}

// Take a cashflow snapshot for the previous month if needed (called on app load)
// This creates a snapshot dated as the last day of the target month (current month if on last day, previous month if on 1st or later)
export async function takeCashflowSnapshotForCurrentMonthIfNeeded(
  inflowChf: number,
  outflowChf: number,
  spareChf: number,
  uid?: string
): Promise<CashflowSnapshot | null> {
  const snapshots = await loadCashflowSnapshots(uid)
  
  // Check if we should take a snapshot
  if (!shouldTakeCashflowSnapshotForPreviousMonth(snapshots)) {
    return null
  }
  
  // Determine which month to snapshot
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  let targetMonthDate: string
  let targetTimestamp: number
  
  if (today.getTime() === lastDayOfCurrentMonth.getTime()) {
    // We're on the last day of the current month - snapshot current month
    targetMonthDate = getCurrentMonthCashflowSnapshotDate()
    targetTimestamp = lastDayOfCurrentMonth.getTime()
  } else {
    // We're on the 1st or later of the current month - snapshot previous month
    targetMonthDate = getPreviousMonthCashflowSnapshotDate()
    const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    targetTimestamp = lastDayOfPreviousMonth.getTime()
  }

  const snapshot: CashflowSnapshot = {
    date: targetMonthDate,
    timestamp: targetTimestamp,
    inflow: inflowChf,
    outflow: outflowChf,
    spare: spareChf,
  }
  
  const updatedSnapshots = [...snapshots, snapshot].sort((a, b) => a.timestamp - b.timestamp)
  await saveCashflowSnapshots(updatedSnapshots, uid)
  return snapshot
}

