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

// Get the date string for the first day of the current month (for snapshot key)
export function getCurrentMonthCashflowSnapshotDate(): string {
  const now = new Date()
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  return firstDayOfCurrentMonth.toISOString().split('T')[0]
}

// Check if we should take a cashflow snapshot for the current month
export function shouldTakeCashflowSnapshotForCurrentMonth(snapshots: CashflowSnapshot[]): boolean {
  const currentMonthDate = getCurrentMonthCashflowSnapshotDate()
  
  // Check if we already have a snapshot for current month
  if (hasCashflowSnapshotForDate(snapshots, currentMonthDate)) {
    return false // Already have snapshot
  }
  
  // Check if we're on or past the first day of the current month
  const now = new Date()
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  // If today is on or after the first day of current month, we should take a snapshot
  return today >= firstDayOfCurrentMonth
}

// Check if cashflow snapshot already exists for a given date
export function hasCashflowSnapshotForDate(snapshots: CashflowSnapshot[], date: string): boolean {
  return snapshots.some(s => s.date === date)
}

// Take a cashflow snapshot for the current month if needed (called on app load)
// This creates a snapshot dated as the first day of the current month
export async function takeCashflowSnapshotForCurrentMonthIfNeeded(
  inflowChf: number,
  outflowChf: number,
  spareChf: number,
  uid?: string
): Promise<CashflowSnapshot | null> {
  const snapshots = await loadCashflowSnapshots(uid)
  
  // Check if we should take a snapshot for the current month
  if (!shouldTakeCashflowSnapshotForCurrentMonth(snapshots)) {
    return null
  }
  
  // Create snapshot with the date of the first day of current month
  const currentMonthDate = getCurrentMonthCashflowSnapshotDate()
  const firstDayOfMonth = new Date(currentMonthDate)

  const snapshot: CashflowSnapshot = {
    date: currentMonthDate,
    timestamp: firstDayOfMonth.getTime(),
    inflow: inflowChf,
    outflow: outflowChf,
    spare: spareChf,
  }
  
  const updatedSnapshots = [...snapshots, snapshot].sort((a, b) => a.timestamp - b.timestamp)
  await saveCashflowSnapshots(updatedSnapshots, uid)
  return snapshot
}

