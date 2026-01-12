/**
 * localStorage keys used as fallback when Firestore is unavailable.
 * Maintained for backwards compatibility with older versions.
 */
const STORAGE_KEYS = {
  NET_WORTH_ITEMS: 'capitalos_net_worth_items_v1',
  NET_WORTH_TRANSACTIONS: 'capitalos_net_worth_transactions_v1',
  CASHFLOW_INFLOW_ITEMS: 'capitalos_cashflow_inflow_items_v1',
  CASHFLOW_OUTFLOW_ITEMS: 'capitalos_cashflow_outflow_items_v1',
  CASHFLOW_ACCOUNTFLOW_MAPPINGS: 'capitalos_cashflow_accountflow_mappings_v1',
  PLATFORMS: 'capitalos_platforms_v1',
} as const

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error(`Failed to save to localStorage (${key}):`, error)
  }
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
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

import {
  saveNetWorthItems as saveNetWorthItemsFirestore,
  loadNetWorthItems as loadNetWorthItemsFirestore,
  saveNetWorthTransactions as saveNetWorthTransactionsFirestore,
  loadNetWorthTransactions as loadNetWorthTransactionsFirestore,
  saveCashflowInflowItems as saveCashflowInflowItemsFirestore,
  loadCashflowInflowItems as loadCashflowInflowItemsFirestore,
  saveCashflowOutflowItems as saveCashflowOutflowItemsFirestore,
  loadCashflowOutflowItems as loadCashflowOutflowItemsFirestore,
  saveCashflowAccountflowMappings as saveCashflowAccountflowMappingsFirestore,
  loadCashflowAccountflowMappings as loadCashflowAccountflowMappingsFirestore,
  savePlatforms as savePlatformsFirestore,
  loadPlatforms as loadPlatformsFirestore,
} from './firestoreService'

/**
 * Saves net worth items to Firestore (if uid provided) or localStorage.
 * When Firestore is used, data is also synced to localStorage as backup.
 */
export async function saveNetWorthItems<T extends { id: string }>(
  items: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveNetWorthItemsFirestore(uid, items)
    saveToStorage(STORAGE_KEYS.NET_WORTH_ITEMS, items)
  } else {
    saveToStorage(STORAGE_KEYS.NET_WORTH_ITEMS, items)
  }
}

export async function loadNetWorthItems<T>(
  defaultValue: T[],
  uid?: string
): Promise<T[]> {
  if (uid) {
    try {
      const items = await loadNetWorthItemsFirestore<T>(uid)
      if (items.length > 0) {
        saveToStorage(STORAGE_KEYS.NET_WORTH_ITEMS, items)
        return items
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(STORAGE_KEYS.NET_WORTH_ITEMS, defaultValue)
}

export async function saveNetWorthTransactions<T extends { id: string }>(
  transactions: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveNetWorthTransactionsFirestore(uid, transactions)
    saveToStorage(STORAGE_KEYS.NET_WORTH_TRANSACTIONS, transactions)
  } else {
    saveToStorage(STORAGE_KEYS.NET_WORTH_TRANSACTIONS, transactions)
  }
}

export async function loadNetWorthTransactions<T>(
  defaultValue: T[],
  uid?: string
): Promise<T[]> {
  if (uid) {
    try {
      const transactions = await loadNetWorthTransactionsFirestore<T>(uid)
      if (transactions.length > 0) {
        saveToStorage(STORAGE_KEYS.NET_WORTH_TRANSACTIONS, transactions)
        return transactions
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(STORAGE_KEYS.NET_WORTH_TRANSACTIONS, defaultValue)
}

export async function saveCashflowInflowItems<T extends { id: string }>(
  items: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveCashflowInflowItemsFirestore(uid, items)
    saveToStorage(STORAGE_KEYS.CASHFLOW_INFLOW_ITEMS, items)
  } else {
    saveToStorage(STORAGE_KEYS.CASHFLOW_INFLOW_ITEMS, items)
  }
}

export async function loadCashflowInflowItems<T>(
  defaultValue: T[],
  uid?: string
): Promise<T[]> {
  if (uid) {
    try {
      const items = await loadCashflowInflowItemsFirestore<T>(uid)
      if (items.length > 0) {
        saveToStorage(STORAGE_KEYS.CASHFLOW_INFLOW_ITEMS, items)
        return items
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(STORAGE_KEYS.CASHFLOW_INFLOW_ITEMS, defaultValue)
}

export async function saveCashflowOutflowItems<T extends { id: string }>(
  items: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveCashflowOutflowItemsFirestore(uid, items)
    saveToStorage(STORAGE_KEYS.CASHFLOW_OUTFLOW_ITEMS, items)
  } else {
    saveToStorage(STORAGE_KEYS.CASHFLOW_OUTFLOW_ITEMS, items)
  }
}

export async function loadCashflowOutflowItems<T>(
  defaultValue: T[],
  uid?: string
): Promise<T[]> {
  if (uid) {
    try {
      const items = await loadCashflowOutflowItemsFirestore<T>(uid)
      if (items.length > 0) {
        saveToStorage(STORAGE_KEYS.CASHFLOW_OUTFLOW_ITEMS, items)
        return items
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(STORAGE_KEYS.CASHFLOW_OUTFLOW_ITEMS, defaultValue)
}

export async function saveCashflowAccountflowMappings<T extends { id: string }>(
  mappings: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveCashflowAccountflowMappingsFirestore(uid, mappings)
    saveToStorage(STORAGE_KEYS.CASHFLOW_ACCOUNTFLOW_MAPPINGS, mappings)
  } else {
    saveToStorage(STORAGE_KEYS.CASHFLOW_ACCOUNTFLOW_MAPPINGS, mappings)
  }
}

export async function loadCashflowAccountflowMappings<T>(
  defaultValue: T[],
  uid?: string
): Promise<T[]> {
  if (uid) {
    try {
      const mappings = await loadCashflowAccountflowMappingsFirestore<T>(uid)
      if (mappings.length > 0) {
        saveToStorage(STORAGE_KEYS.CASHFLOW_ACCOUNTFLOW_MAPPINGS, mappings)
        return mappings
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(STORAGE_KEYS.CASHFLOW_ACCOUNTFLOW_MAPPINGS, defaultValue)
}

export interface Platform {
  id: string
  name: string
  /** Higher values indicate more frequently used platforms */
  order: number
  /** Whether this platform is the default for Analytics page */
  isDefault?: boolean
}

export async function savePlatforms(
  platforms: Platform[],
  uid?: string
): Promise<void> {
  if (uid) {
    await savePlatformsFirestore(uid, platforms)
    saveToStorage(STORAGE_KEYS.PLATFORMS, platforms)
  } else {
    saveToStorage(STORAGE_KEYS.PLATFORMS, platforms)
  }
}

export async function loadPlatforms(
  defaultValue: Platform[],
  uid?: string
): Promise<Platform[]> {
  if (uid) {
    try {
      const platforms = await loadPlatformsFirestore(uid)
      if (platforms.length > 0) {
        saveToStorage(STORAGE_KEYS.PLATFORMS, platforms)
        return platforms
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(STORAGE_KEYS.PLATFORMS, defaultValue)
}
