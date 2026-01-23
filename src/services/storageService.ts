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
  saveNetWorthItem as saveNetWorthItemFirestore,
  deleteNetWorthItem as deleteNetWorthItemFirestore,
  loadNetWorthItems as loadNetWorthItemsFirestore,
  saveNetWorthTransaction as saveNetWorthTransactionFirestore,
  deleteNetWorthTransaction as deleteNetWorthTransactionFirestore,
  loadNetWorthTransactions as loadNetWorthTransactionsFirestore,
  saveCashflowInflowItem as saveCashflowInflowItemFirestore,
  deleteCashflowInflowItem as deleteCashflowInflowItemFirestore,
  loadCashflowInflowItems as loadCashflowInflowItemsFirestore,
  saveCashflowOutflowItem as saveCashflowOutflowItemFirestore,
  deleteCashflowOutflowItem as deleteCashflowOutflowItemFirestore,
  loadCashflowOutflowItems as loadCashflowOutflowItemsFirestore,
  saveCashflowAccountflowMappings as saveCashflowAccountflowMappingsFirestore,
  loadCashflowAccountflowMappings as loadCashflowAccountflowMappingsFirestore,
  saveCashflowAccountflowMapping as saveCashflowAccountflowMappingFirestore,
  deleteCashflowAccountflowMapping as deleteCashflowAccountflowMappingFirestore,
  savePlatforms as savePlatformsFirestore,
  loadPlatforms as loadPlatformsFirestore,
  savePlatform as savePlatformFirestore,
  deletePlatform as deletePlatformFirestore,
  saveForecastEntry as saveForecastEntryFirestore,
  deleteForecastEntry as deleteForecastEntryFirestore,
  loadForecastEntries as loadForecastEntriesFirestore,
  // Deprecated bulk functions (only for Import/Reset)
  saveNetWorthItems as saveNetWorthItemsBulk,
  saveNetWorthTransactions as saveNetWorthTransactionsBulk,
} from './firestoreService'

/**
 * Saves a single net worth item to Firestore (per-document upsert with conflict detection).
 * Also syncs to localStorage as backup.
 * 
 * Use this for individual item updates (add, edit).
 * Never use for bulk saves - that causes "last write wins" conflicts.
 */
export async function saveNetWorthItem<T extends { id: string }>(
  item: T,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    // No uid, save to localStorage only
    saveToStorage(getStorageKey(uid, 'netWorthItems'), [item])
    return { success: true }
  }

  try {
    const result = await saveNetWorthItemFirestore(uid, item, options)
    
    // Sync to localStorage as backup
    if (result.success) {
      const items = await loadNetWorthItemsFirestore<T>(uid)
      saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
    }
    
    return result
  } catch (error) {
    console.error('Failed to save net worth item to Firestore:', error)
    // Fallback to localStorage
    saveToStorage(getStorageKey(uid, 'netWorthItems'), [item])
    return { success: false, reason: 'firestore_error' }
  }
}

/**
 * Deletes a single net worth item (with conflict detection)
 */
export async function deleteNetWorthItem(
  itemId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    // No uid, delete from localStorage only
    const items = loadFromStorage<{ id: string }[]>(getStorageKey(uid, 'netWorthItems'), [])
    const filtered = items.filter(item => item.id !== itemId)
    saveToStorage(getStorageKey(uid, 'netWorthItems'), filtered)
    return { success: true }
  }

  try {
    const result = await deleteNetWorthItemFirestore(uid, itemId, options)
    
    // Sync to localStorage as backup
    if (result.success) {
      const items = await loadNetWorthItemsFirestore<{ id: string }>(uid)
      saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
    }
    
    return result
  } catch (error) {
    console.error('Failed to delete net worth item from Firestore:', error)
    return { success: false, reason: 'firestore_error' }
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

/**
 * Saves a single transaction (per-document upsert with conflict detection).
 * Also syncs to localStorage as backup.
 * 
 * Use this for individual transaction updates (add, edit).
 * Never use for bulk saves - that causes "last write wins" conflicts.
 */
export async function saveNetWorthTransaction<T extends { id: string }>(
  transaction: T,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    // No uid, save to localStorage only
    saveToStorage(getStorageKey(uid, 'netWorthTransactions'), [transaction])
    return { success: true }
  }

  try {
    const result = await saveNetWorthTransactionFirestore(uid, transaction, options)
    
    // Sync to localStorage as backup
    if (result.success) {
      const transactions = await loadNetWorthTransactionsFirestore<T>(uid)
      saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
    }
    
    return result
  } catch (error) {
    console.error('Failed to save transaction to Firestore:', error)
    // Fallback to localStorage
    saveToStorage(getStorageKey(uid, 'netWorthTransactions'), [transaction])
    return { success: false, reason: 'firestore_error' }
  }
}

/**
 * Deletes a single transaction (with conflict detection)
 */
export async function deleteNetWorthTransaction(
  transactionId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    // No uid, delete from localStorage only
    const transactions = loadFromStorage<{ id: string }[]>(getStorageKey(uid, 'netWorthTransactions'), [])
    const filtered = transactions.filter(tx => tx.id !== transactionId)
    saveToStorage(getStorageKey(uid, 'netWorthTransactions'), filtered)
    return { success: true }
  }

  try {
    const result = await deleteNetWorthTransactionFirestore(uid, transactionId, options)
    
    // Sync to localStorage as backup
    if (result.success) {
      const transactions = await loadNetWorthTransactionsFirestore<{ id: string }>(uid)
      saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
    }
    
    return result
  } catch (error) {
    console.error('Failed to delete transaction from Firestore:', error)
    return { success: false, reason: 'firestore_error' }
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

/**
 * ⚠️ DEPRECATED: saveNetWorthItems performs bulk overwrites
 * 
 * Only use for Import/Reset flows with allowBulkOverwrite: true
 * 
 * @deprecated Use saveNetWorthItem for individual items
 */
export async function saveNetWorthItems<T extends { id: string }>(
  items: T[],
  uid?: string,
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
    return
  }

  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[StorageService] saveNetWorthItems performs bulk overwrites. ` +
      `Use saveNetWorthItem for individual items. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  await saveNetWorthItemsBulk(uid, items, { allowBulkOverwrite: true })
  // Sync to localStorage
  saveToStorage(getStorageKey(uid, 'netWorthItems'), items)
}

/**
 * ⚠️ DEPRECATED: saveNetWorthTransactions performs bulk overwrites
 * 
 * Only use for Import/Reset flows with allowBulkOverwrite: true
 * 
 * @deprecated Use saveNetWorthTransaction for individual transactions
 */
export async function saveNetWorthTransactions<T extends { id: string }>(
  transactions: T[],
  uid?: string,
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
    return
  }

  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[StorageService] saveNetWorthTransactions performs bulk overwrites. ` +
      `Use saveNetWorthTransaction for individual transactions. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  await saveNetWorthTransactionsBulk(uid, transactions, { allowBulkOverwrite: true })
  // Sync to localStorage
  saveToStorage(getStorageKey(uid, 'netWorthTransactions'), transactions)
}

// Cashflow items (per-document upserts)
export async function saveCashflowInflowItem<T extends { id: string }>(
  item: T,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), [item])
    return { success: true }
  }

  try {
    const result = await saveCashflowInflowItemFirestore(uid, item, options)
    if (result.success) {
      const items = await loadCashflowInflowItemsFirestore<T>(uid)
      saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
    }
    return result
  } catch (error) {
    console.error('Failed to save cashflow inflow item:', error)
    saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), [item])
    return { success: false, reason: 'firestore_error' }
  }
}

export async function deleteCashflowInflowItem(
  itemId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const items = loadFromStorage<{ id: string }[]>(getStorageKey(uid, 'cashflowInflowItems'), [])
    const filtered = items.filter(item => item.id !== itemId)
    saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), filtered)
    return { success: true }
  }

  try {
    const result = await deleteCashflowInflowItemFirestore(uid, itemId, options)
    if (result.success) {
      const items = await loadCashflowInflowItemsFirestore<{ id: string }>(uid)
      saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
    }
    return result
  } catch (error) {
    console.error('Failed to delete cashflow inflow item:', error)
    return { success: false, reason: 'firestore_error' }
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

export async function saveCashflowOutflowItem<T extends { id: string }>(
  item: T,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), [item])
    return { success: true }
  }

  try {
    const result = await saveCashflowOutflowItemFirestore(uid, item, options)
    if (result.success) {
      const items = await loadCashflowOutflowItemsFirestore<T>(uid)
      saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
    }
    return result
  } catch (error) {
    console.error('Failed to save cashflow outflow item:', error)
    saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), [item])
    return { success: false, reason: 'firestore_error' }
  }
}

export async function deleteCashflowOutflowItem(
  itemId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const items = loadFromStorage<{ id: string }[]>(getStorageKey(uid, 'cashflowOutflowItems'), [])
    const filtered = items.filter(item => item.id !== itemId)
    saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), filtered)
    return { success: true }
  }

  try {
    const result = await deleteCashflowOutflowItemFirestore(uid, itemId, options)
    if (result.success) {
      const items = await loadCashflowOutflowItemsFirestore<{ id: string }>(uid)
      saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
    }
    return result
  } catch (error) {
    console.error('Failed to delete cashflow outflow item:', error)
    return { success: false, reason: 'firestore_error' }
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

/**
 * ⚠️ DEPRECATED: saveCashflowInflowItems performs bulk overwrites
 * 
 * Only use for Import/Reset flows with allowBulkOverwrite: true
 * 
 * @deprecated Use saveCashflowInflowItem for individual items
 */
export async function saveCashflowInflowItems<T extends { id: string }>(
  items: T[],
  uid?: string,
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
    return
  }

  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[StorageService] saveCashflowInflowItems performs bulk overwrites. ` +
      `Use saveCashflowInflowItem for individual items. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  const { saveCashflowInflowItems: saveCashflowInflowItemsBulk } = await import('./firestoreService')
  await saveCashflowInflowItemsBulk(uid, items, { allowBulkOverwrite: true })
  saveToStorage(getStorageKey(uid, 'cashflowInflowItems'), items)
}

/**
 * ⚠️ DEPRECATED: saveCashflowOutflowItems performs bulk overwrites
 * 
 * Only use for Import/Reset flows with allowBulkOverwrite: true
 * 
 * @deprecated Use saveCashflowOutflowItem for individual items
 */
export async function saveCashflowOutflowItems<T extends { id: string }>(
  items: T[],
  uid?: string,
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
    return
  }

  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[StorageService] saveCashflowOutflowItems performs bulk overwrites. ` +
      `Use saveCashflowOutflowItem for individual items. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  const { saveCashflowOutflowItems: saveCashflowOutflowItemsBulk } = await import('./firestoreService')
  await saveCashflowOutflowItemsBulk(uid, items, { allowBulkOverwrite: true })
  saveToStorage(getStorageKey(uid, 'cashflowOutflowItems'), items)
}

// Cashflow accountflow mappings (per-document upserts)
export async function saveCashflowAccountflowMapping<T extends { id: string }>(
  mapping: T,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    // No uid, save to localStorage only (best-effort)
    const existing = loadFromStorage<T[]>(getStorageKey(uid, 'cashflowAccountflowMappings'), [])
    const next = [...existing.filter(m => m.id !== mapping.id), mapping]
    saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), next)
    return { success: true }
  }

  try {
    const result = await saveCashflowAccountflowMappingFirestore(uid, mapping, options)
    if (result.success) {
      const mappings = await loadCashflowAccountflowMappingsFirestore<T>(uid)
      saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
    }
    return result
  } catch (error) {
    console.error('Failed to save cashflow accountflow mapping:', error)
    return { success: false, reason: 'firestore_error' }
  }
}

export async function deleteCashflowAccountflowMapping(
  mappingId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const existing = loadFromStorage<{ id: string }[]>(getStorageKey(uid, 'cashflowAccountflowMappings'), [])
    const next = existing.filter(m => m.id !== mappingId)
    saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), next)
    return { success: true }
  }

  try {
    const result = await deleteCashflowAccountflowMappingFirestore(uid, mappingId, options)
    if (result.success) {
      const mappings = await loadCashflowAccountflowMappingsFirestore<{ id: string }>(uid)
      saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
    }
    return result
  } catch (error) {
    console.error('Failed to delete cashflow accountflow mapping:', error)
    return { success: false, reason: 'firestore_error' }
  }
}

export async function saveCashflowAccountflowMappings<T extends { id: string }>(
  mappings: T[],
  uid?: string,
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
    return
  }

  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[StorageService] saveCashflowAccountflowMappings performs bulk overwrites. ` +
        `Use saveCashflowAccountflowMapping/deleteCashflowAccountflowMapping for individual updates. ` +
        `If you need bulk overwrite (Import/Reset), set allowBulkOverwrite: true.`
    )
  }

  await saveCashflowAccountflowMappingsFirestore(uid, mappings, { allowBulkOverwrite: options.allowBulkOverwrite || false })
  saveToStorage(getStorageKey(uid, 'cashflowAccountflowMappings'), mappings)
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
  order: number
  isDefault?: boolean
  safetyBuffer?: number
}

// Platforms (per-document upserts)
export async function savePlatform<T extends { id: string }>(
  platform: T,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const existing = loadFromStorage<T[]>(getStorageKey(uid, 'platforms'), [])
    const next = [...existing.filter(p => p.id !== platform.id), platform]
    saveToStorage(getStorageKey(uid, 'platforms'), next)
    return { success: true }
  }

  try {
    const result = await savePlatformFirestore(uid, platform, options)
    if (result.success) {
      const platforms = await loadPlatformsFirestore(uid)
      saveToStorage(getStorageKey(uid, 'platforms'), platforms)
    }
    return result
  } catch (error) {
    console.error('Failed to save platform:', error)
    return { success: false, reason: 'firestore_error' }
  }
}

export async function deletePlatform(
  platformId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const existing = loadFromStorage<{ id: string }[]>(getStorageKey(uid, 'platforms'), [])
    const next = existing.filter(p => p.id !== platformId)
    saveToStorage(getStorageKey(uid, 'platforms'), next)
    return { success: true }
  }

  try {
    const result = await deletePlatformFirestore(uid, platformId, options)
    if (result.success) {
      const platforms = await loadPlatformsFirestore(uid)
      saveToStorage(getStorageKey(uid, 'platforms'), platforms)
    }
    return result
  } catch (error) {
    console.error('Failed to delete platform:', error)
    return { success: false, reason: 'firestore_error' }
  }
}

export async function savePlatforms(
  platforms: Platform[],
  uid?: string,
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!uid) {
    saveToStorage(getStorageKey(uid, 'platforms'), platforms)
    return
  }

  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[StorageService] savePlatforms performs bulk overwrites. ` +
        `Use savePlatform/deletePlatform for individual updates. ` +
        `If you need bulk overwrite (Import/Reset), set allowBulkOverwrite: true.`
    )
  }

  await savePlatformsFirestore(uid, platforms, { allowBulkOverwrite: options.allowBulkOverwrite || false })
  saveToStorage(getStorageKey(uid, 'platforms'), platforms)
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

// Forecast entries (per-document upserts)
export interface ForecastEntry {
  id: string
  platformId: string
  type: 'inflow' | 'outflow'
  date: string
  title: string
  amount: number
  createdAt?: string
  updatedAt?: string
}

export async function saveForecastEntry(
  entry: ForecastEntry,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const existing = loadFromStorage<ForecastEntry[]>(getStorageKey(uid, 'forecastEntries'), [])
    const next = [...existing.filter(e => e.id !== entry.id), entry]
    saveToStorage(getStorageKey(uid, 'forecastEntries'), next)
    return { success: true }
  }

  try {
    const result = await saveForecastEntryFirestore(uid, entry, options)
    if (result.success) {
      const entries = await loadForecastEntriesFirestore<ForecastEntry>(uid)
      saveToStorage(getStorageKey(uid, 'forecastEntries'), entries)
    }
    return result
  } catch (error) {
    console.error('Failed to save forecast entry:', error)
    return { success: false, reason: 'firestore_error' }
  }
}

export async function deleteForecastEntry(
  entryId: string,
  uid?: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  if (!uid) {
    const existing = loadFromStorage<ForecastEntry[]>(getStorageKey(uid, 'forecastEntries'), [])
    const next = existing.filter(e => e.id !== entryId)
    saveToStorage(getStorageKey(uid, 'forecastEntries'), next)
    return { success: true }
  }

  try {
    const result = await deleteForecastEntryFirestore(uid, entryId, options)
    if (result.success) {
      const entries = await loadForecastEntriesFirestore<ForecastEntry>(uid)
      saveToStorage(getStorageKey(uid, 'forecastEntries'), entries)
    }
    return result
  } catch (error) {
    console.error('Failed to delete forecast entry:', error)
    return { success: false, reason: 'firestore_error' }
  }
}

export async function loadForecastEntries(
  defaultValue: ForecastEntry[],
  uid?: string
): Promise<ForecastEntry[]> {
  if (uid) {
    try {
      const entries = await loadForecastEntriesFirestore<ForecastEntry>(uid)
      if (entries.length > 0) {
        saveToStorage(getStorageKey(uid, 'forecastEntries'), entries)
        return entries
      }
    } catch (error) {
      console.error('Failed to load forecast entries from Firestore, falling back to localStorage:', error)
    }
  }
  return loadFromStorage(getStorageKey(uid, 'forecastEntries'), defaultValue)
}
