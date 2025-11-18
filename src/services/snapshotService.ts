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

// Historical data provided by user (last day of each month)
const HISTORICAL_DATA: Array<{
  date: string
  categories: Record<NetWorthCategory, number>
}> = [
  { date: '2021-12-31', categories: { 'Cash': 0, 'Bank Accounts': 9121.11, 'Funds': 5878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 280000, 'Real Estate': 0, 'Inventory': 16000 } },
  { date: '2022-01-31', categories: { 'Cash': 0, 'Bank Accounts': 5871.11, 'Funds': 6128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 230000, 'Real Estate': 0, 'Inventory': 16000 } },
  { date: '2022-02-28', categories: { 'Cash': 0, 'Bank Accounts': 4621.11, 'Funds': 6378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 180000, 'Real Estate': 0, 'Inventory': 16000 } },
  { date: '2022-03-31', categories: { 'Cash': 0, 'Bank Accounts': 5371.11, 'Funds': 6628.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 230000, 'Real Estate': 0, 'Inventory': 16000 } },
  { date: '2022-04-30', categories: { 'Cash': 0, 'Bank Accounts': 4121.11, 'Funds': 6878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 130000, 'Real Estate': 0, 'Inventory': 16000 } },
  { date: '2022-05-31', categories: { 'Cash': 0, 'Bank Accounts': 4143.42, 'Funds': 7128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 60000, 'Real Estate': 0, 'Inventory': 16000 } },
  { date: '2022-06-30', categories: { 'Cash': 0, 'Bank Accounts': 3621.11, 'Funds': 7378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 45000, 'Real Estate': 0, 'Inventory': 15000 } },
  { date: '2022-07-31', categories: { 'Cash': 0, 'Bank Accounts': 4371.11, 'Funds': 7628.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 55000, 'Real Estate': 0, 'Inventory': 15000 } },
  { date: '2022-08-31', categories: { 'Cash': 0, 'Bank Accounts': 5121.11, 'Funds': 7878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 65000, 'Real Estate': 0, 'Inventory': 15000 } },
  { date: '2022-09-30', categories: { 'Cash': 0, 'Bank Accounts': 1243.42, 'Funds': 8128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 54000, 'Real Estate': 0, 'Inventory': 15000 } },
  { date: '2022-10-31', categories: { 'Cash': 0, 'Bank Accounts': 1753.45, 'Funds': 8378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 57000, 'Real Estate': 0, 'Inventory': 15000 } },
  { date: '2022-11-30', categories: { 'Cash': 0, 'Bank Accounts': 2154.54, 'Funds': 8628.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 45000, 'Real Estate': 0, 'Inventory': 15000 } },
  { date: '2022-12-31', categories: { 'Cash': 0, 'Bank Accounts': 1875.34, 'Funds': 8878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 39000, 'Real Estate': 0, 'Inventory': 14000 } },
  { date: '2023-01-31', categories: { 'Cash': 0, 'Bank Accounts': 895.14, 'Funds': 9128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 55500, 'Real Estate': 0, 'Inventory': 14000 } },
  { date: '2023-02-28', categories: { 'Cash': 0, 'Bank Accounts': 762.54, 'Funds': 9378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 60000, 'Real Estate': 0, 'Inventory': 14000 } },
  { date: '2023-03-31', categories: { 'Cash': 0, 'Bank Accounts': 4763.41, 'Funds': 9628.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 67771.90, 'Real Estate': 0, 'Inventory': 14000 } },
  { date: '2023-04-30', categories: { 'Cash': 0, 'Bank Accounts': 5442.72, 'Funds': 9878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 68399.14, 'Real Estate': 0, 'Inventory': 14000 } },
  { date: '2023-05-31', categories: { 'Cash': 0, 'Bank Accounts': 6415.76, 'Funds': 10128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 67684.38, 'Real Estate': 0, 'Inventory': 14000 } },
  { date: '2023-06-30', categories: { 'Cash': 0, 'Bank Accounts': 5348.13, 'Funds': 10378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 63946.75, 'Real Estate': 0, 'Inventory': 13000 } },
  { date: '2023-07-31', categories: { 'Cash': 0, 'Bank Accounts': 4538.42, 'Funds': 10628.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 63222.85, 'Real Estate': 0, 'Inventory': 13000 } },
  { date: '2023-08-31', categories: { 'Cash': 0, 'Bank Accounts': 2270.43, 'Funds': 10878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 55857.53, 'Real Estate': 0, 'Inventory': 13000 } },
  { date: '2023-09-30', categories: { 'Cash': 0, 'Bank Accounts': 3446.93, 'Funds': 11128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 69233.59, 'Real Estate': 0, 'Inventory': 13000 } },
  { date: '2023-10-31', categories: { 'Cash': 0, 'Bank Accounts': 4249.92, 'Funds': 11378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 68849.19, 'Real Estate': 0, 'Inventory': 13000 } },
  { date: '2023-11-30', categories: { 'Cash': 0, 'Bank Accounts': 8208.61, 'Funds': 11628.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 82253.65, 'Real Estate': 0, 'Inventory': 13000 } },
  { date: '2023-12-31', categories: { 'Cash': 0, 'Bank Accounts': 9202.31, 'Funds': 11878.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 92334.76, 'Real Estate': 0, 'Inventory': 12500 } },
  { date: '2024-01-31', categories: { 'Cash': 0, 'Bank Accounts': 10272.31, 'Funds': 12128.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 99379.55, 'Real Estate': 0, 'Inventory': 12500 } },
  { date: '2024-02-29', categories: { 'Cash': 0, 'Bank Accounts': 12299.43, 'Funds': 12378.89, 'Stocks': 0, 'Commodities': 0, 'Crypto': 129636.50, 'Real Estate': 0, 'Inventory': 12500 } },
  { date: '2024-03-31', categories: { 'Cash': 250, 'Bank Accounts': 13293.04, 'Funds': 13473.68, 'Stocks': 0, 'Commodities': 0, 'Crypto': 129874.29, 'Real Estate': 0, 'Inventory': 12500 } },
  { date: '2024-04-30', categories: { 'Cash': 50, 'Bank Accounts': 7459.24, 'Funds': 13539.27, 'Stocks': 0, 'Commodities': 0, 'Crypto': 98435.46, 'Real Estate': 0, 'Inventory': 12500 } },
  { date: '2024-05-31', categories: { 'Cash': 0, 'Bank Accounts': 10019.74, 'Funds': 14029.35, 'Stocks': 0, 'Commodities': 0, 'Crypto': 118424.29, 'Real Estate': 0, 'Inventory': 12500 } },
  { date: '2024-06-30', categories: { 'Cash': 0, 'Bank Accounts': 10451.57, 'Funds': 14446.11, 'Stocks': 0, 'Commodities': 0, 'Crypto': 99609.61, 'Real Estate': 0, 'Inventory': 12000 } },
  { date: '2024-07-31', categories: { 'Cash': 0, 'Bank Accounts': 11212.62, 'Funds': 14806.48, 'Stocks': 0, 'Commodities': 0, 'Crypto': 68698.11, 'Real Estate': 0, 'Inventory': 12000 } },
  { date: '2024-08-31', categories: { 'Cash': 0, 'Bank Accounts': 8305.52, 'Funds': 15079.75, 'Stocks': 0, 'Commodities': 0, 'Crypto': 44092.67, 'Real Estate': 0, 'Inventory': 12000 } },
  { date: '2024-09-30', categories: { 'Cash': 0, 'Bank Accounts': 9189.12, 'Funds': 15416.80, 'Stocks': 0, 'Commodities': 0, 'Crypto': 56071.13, 'Real Estate': 0, 'Inventory': 12000 } },
  { date: '2024-10-31', categories: { 'Cash': 0, 'Bank Accounts': 9189.12, 'Funds': 15666.80, 'Stocks': 0, 'Commodities': 0, 'Crypto': 52387.74, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2024-11-30', categories: { 'Cash': 0, 'Bank Accounts': 13072.53, 'Funds': 15691.88, 'Stocks': 0, 'Commodities': 0, 'Crypto': 103401.22, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2024-12-31', categories: { 'Cash': 0, 'Bank Accounts': 14253.08, 'Funds': 15863.65, 'Stocks': 0, 'Commodities': 0, 'Crypto': 88903.96, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2025-01-31', categories: { 'Cash': 0, 'Bank Accounts': 14253.08, 'Funds': 16113.65, 'Stocks': 0, 'Commodities': 0, 'Crypto': 80025.16, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2025-02-28', categories: { 'Cash': 0, 'Bank Accounts': 14253.08, 'Funds': 16363.65, 'Stocks': 0, 'Commodities': 0, 'Crypto': 54631.60, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2025-03-31', categories: { 'Cash': 0, 'Bank Accounts': 5455.98, 'Funds': 17025.43, 'Stocks': 0, 'Commodities': 0, 'Crypto': 44362.89, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2025-04-30', categories: { 'Cash': 0, 'Bank Accounts': 14460.00, 'Funds': 17275.43, 'Stocks': 0, 'Commodities': 0, 'Crypto': 46864.48, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2025-05-31', categories: { 'Cash': 0, 'Bank Accounts': 10196.00, 'Funds': 17289.00, 'Stocks': 0, 'Commodities': 0, 'Crypto': 53120.67, 'Real Estate': 0, 'Inventory': 11000 } },
  { date: '2025-06-30', categories: { 'Cash': 0, 'Bank Accounts': 8562.70, 'Funds': 17539.22, 'Stocks': 0, 'Commodities': 0, 'Crypto': 46317.81, 'Real Estate': 0, 'Inventory': 10000 } },
  { date: '2025-07-31', categories: { 'Cash': 0, 'Bank Accounts': 11185.16, 'Funds': 17945.75, 'Stocks': 0, 'Commodities': 0, 'Crypto': 65864.08, 'Real Estate': 0, 'Inventory': 10000 } },
  { date: '2025-08-31', categories: { 'Cash': 0, 'Bank Accounts': 11185.16, 'Funds': 18195.75, 'Stocks': 0, 'Commodities': 0, 'Crypto': 72735.38, 'Real Estate': 0, 'Inventory': 10000 } },
  { date: '2025-09-30', categories: { 'Cash': 0, 'Bank Accounts': 11528.00, 'Funds': 18472.70, 'Stocks': 0, 'Commodities': 0, 'Crypto': 60980.10, 'Real Estate': 0, 'Inventory': 10000 } },
  { date: '2025-10-31', categories: { 'Cash': 100, 'Bank Accounts': 13298.00, 'Funds': 18892.00, 'Stocks': 0, 'Commodities': 0, 'Crypto': 60980.10, 'Real Estate': 0, 'Inventory': 10000 } },
]

// Convert historical data to snapshots
function getHistoricalSnapshots(): NetWorthSnapshot[] {
  return HISTORICAL_DATA.map(item => {
    const total = Object.values(item.categories).reduce((sum, val) => sum + val, 0)
    const date = new Date(item.date)
    return {
      date: item.date,
      timestamp: date.getTime(),
      categories: item.categories,
      total,
    }
  })
}

// Load snapshots from localStorage
export function loadSnapshots(): NetWorthSnapshot[] {
  try {
    // Always start with historical data (it takes precedence)
    const historical = getHistoricalSnapshots()
    const historicalDates = new Set(historical.map(s => s.date))
    
    // Load stored snapshots
    const stored = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as NetWorthSnapshot[]
      
      // Combine: historical first (always), then stored snapshots that aren't in historical
      const combined: NetWorthSnapshot[] = [...historical]
      const seenDates = new Set<string>(historicalDates)
      
      // Add stored snapshots that aren't in historical data
      parsed.forEach(s => {
        // Only add if date doesn't exist in historical data
        if (!seenDates.has(s.date)) {
          combined.push(s)
          seenDates.add(s.date)
        }
      })
      
      // Sort by date
      combined.sort((a, b) => a.timestamp - b.timestamp)
      return combined
    }
    
    // If no stored snapshots, return historical data only
    return historical
  } catch (error) {
    console.error('Failed to load snapshots:', error)
    return getHistoricalSnapshots()
  }
}

// Save snapshots to localStorage
export function saveSnapshots(snapshots: NetWorthSnapshot[]): void {
  try {
    // Only save snapshots that are not in historical data
    // This ensures historical data always takes precedence
    const historicalDates = new Set(HISTORICAL_DATA.map(d => d.date))
    const snapshotsToSave = snapshots.filter(s => {
      // Don't save if it's in historical data
      if (historicalDates.has(s.date)) {
        return false
      }
      // Only save future snapshots (after the last historical date)
      const lastHistoricalDate = HISTORICAL_DATA[HISTORICAL_DATA.length - 1]?.date
      if (lastHistoricalDate && s.date <= lastHistoricalDate) {
        return false
      }
      return true
    })
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshotsToSave))
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
export function takeSnapshotForCurrentMonthIfNeeded(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[]
): NetWorthSnapshot | null {
  const snapshots = loadSnapshots()
  
  // Check if we should take a snapshot for the current month
  if (!shouldTakeSnapshotForCurrentMonth(snapshots)) {
    return null
  }
  
  // Create snapshot with the date of the first day of current month
  const currentMonthDate = getCurrentMonthSnapshotDate()
  
  // Don't create snapshot if this date is in historical data
  const historicalDates = new Set(HISTORICAL_DATA.map(d => d.date))
  if (historicalDates.has(currentMonthDate)) {
    return null
  }
  
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
  saveSnapshots(updatedSnapshots)
  return snapshot
}

