/**
 * Get uid-scoped localStorage key
 * Format: capitalos:${uid}:${collectionName}
 */
function getStorageKey(uid: string | undefined, collectionName: string): string {
  if (uid) {
    return `capitalos:${uid}:${collectionName}`
  }
  // Fallback for backwards compatibility (will be cleared on next user switch)
  return `capitalos_${collectionName}_v1`
}

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
    saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
  } else {
    saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
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
        saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
        return items
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'netWorthItems'), defaultValue)
}

export async function saveNetWorthTransactions<T extends { id: string }>(
  transactions: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveNetWorthTransactionsFirestore(uid, transactions)
    saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
  } else {
    saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
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
        saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
        return transactions
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'netWorthTransactions'), defaultValue)
}

export async function saveCashflowInflowItems<T extends { id: string }>(
  items: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveCashflowInflowItemsFirestore(uid, items)
    saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
  } else {
    saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
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
        saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
        return items
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'cashflowInflowItems'), defaultValue)
}

export async function saveCashflowOutflowItems<T extends { id: string }>(
  items: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveCashflowOutflowItemsFirestore(uid, items)
    saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
  } else {
    saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
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
        saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
        return items
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'cashflowOutflowItems'), defaultValue)
}

export async function saveCashflowAccountflowMappings<T extends { id: string }>(
  mappings: T[],
  uid?: string
): Promise<void> {
  if (uid) {
    await saveCashflowAccountflowMappingsFirestore(uid, mappings)
    saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
  } else {
    saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
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
        saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
        return mappings
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), defaultValue)
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
    saveToStorage(getStorageKey(uid, 'platforms'), platforms)
  } else {
    saveToStorage(getStorageKey(uid, 'platforms'), platforms)
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
        saveToStorage(getStorageKey(uid, 'platforms'), platforms)
        return platforms
      }
    } catch (error) {
      console.error('Failed to load from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'platforms'), defaultValue)
}
