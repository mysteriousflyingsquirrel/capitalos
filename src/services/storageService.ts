// Storage keys
const STORAGE_KEYS = {
  NET_WORTH_ITEMS: 'capitalos_net_worth_items_v1',
  NET_WORTH_TRANSACTIONS: 'capitalos_net_worth_transactions_v1',
  CASHFLOW_INFLOW_ITEMS: 'capitalos_cashflow_inflow_items_v1',
  CASHFLOW_OUTFLOW_ITEMS: 'capitalos_cashflow_outflow_items_v1',
  CASHFLOW_ACCOUNTFLOW_MAPPINGS: 'capitalos_cashflow_accountflow_mappings_v1',
} as const

// Generic storage functions
export function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error(`Failed to save to localStorage (${key}):`, error)
  }
}

export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key)
    if (item === null) {
      return defaultValue
    }
    return JSON.parse(item) as T
  } catch (error) {
    console.error(`Failed to load from localStorage (${key}):`, error)
    return defaultValue
  }
}

// Net Worth storage
export function saveNetWorthItems<T>(items: T[]): void {
  saveToStorage(STORAGE_KEYS.NET_WORTH_ITEMS, items)
}

export function loadNetWorthItems<T>(defaultValue: T[]): T[] {
  return loadFromStorage(STORAGE_KEYS.NET_WORTH_ITEMS, defaultValue)
}

export function saveNetWorthTransactions<T>(transactions: T[]): void {
  saveToStorage(STORAGE_KEYS.NET_WORTH_TRANSACTIONS, transactions)
}

export function loadNetWorthTransactions<T>(defaultValue: T[]): T[] {
  return loadFromStorage(STORAGE_KEYS.NET_WORTH_TRANSACTIONS, defaultValue)
}

// Cashflow storage
export function saveCashflowInflowItems<T>(items: T[]): void {
  saveToStorage(STORAGE_KEYS.CASHFLOW_INFLOW_ITEMS, items)
}

export function loadCashflowInflowItems<T>(defaultValue: T[]): T[] {
  return loadFromStorage(STORAGE_KEYS.CASHFLOW_INFLOW_ITEMS, defaultValue)
}

export function saveCashflowOutflowItems<T>(items: T[]): void {
  saveToStorage(STORAGE_KEYS.CASHFLOW_OUTFLOW_ITEMS, items)
}

export function loadCashflowOutflowItems<T>(defaultValue: T[]): T[] {
  return loadFromStorage(STORAGE_KEYS.CASHFLOW_OUTFLOW_ITEMS, defaultValue)
}

export function saveCashflowAccountflowMappings<T>(mappings: T[]): void {
  saveToStorage(STORAGE_KEYS.CASHFLOW_ACCOUNTFLOW_MAPPINGS, mappings)
}

export function loadCashflowAccountflowMappings<T>(defaultValue: T[]): T[] {
  return loadFromStorage(STORAGE_KEYS.CASHFLOW_ACCOUNTFLOW_MAPPINGS, defaultValue)
}

// Clear all data (useful for testing or reset)
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error(`Failed to clear localStorage (${key}):`, error)
    }
  })
}

