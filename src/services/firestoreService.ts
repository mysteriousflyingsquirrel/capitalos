import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  deleteField,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import type { NetWorthSummary } from '../lib/networth/types'
import { safeWrite, safeDelete } from '../lib/dataSafety/repository'
import { safeUpsertDoc, safeUpdateDoc, safeDeleteDoc } from '../lib/firestoreSafeWrite'

// Helper to get user-scoped collection path
function getUserCollectionPath(uid: string, collectionName: string): string {
  return `users/${uid}/${collectionName}`
}

/**
 * ⚠️ DEPRECATED: saveDocuments performs bulk overwrites
 * 
 * This function is kept only for Import/Reset flows where bulk overwrite is intentional.
 * For normal operations, use per-document upserts via safeUpsertDoc.
 * 
 * @deprecated Use per-document upserts instead
 */
export async function saveDocuments<T extends { id: string }>(
  uid: string,
  collectionName: string,
  items: T[],
  options: {
    allowBulkOverwrite?: boolean // Must be explicitly true to use this function
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[FirestoreService] saveDocuments is deprecated and performs bulk overwrites. ` +
      `Use per-document upserts instead. If you need bulk overwrite (e.g., Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  if (import.meta.env.DEV) {
    console.warn('[FirestoreService] Using deprecated saveDocuments with bulk overwrite:', {
      collectionName,
      itemCount: items.length,
    })
  }

  const collectionPath = getUserCollectionPath(uid, collectionName)
  const BATCH_SIZE = 500

  // If items array is empty, delete all documents in the collection
  if (items.length === 0) {
    const q = query(collection(db, collectionPath))
    const querySnapshot = await getDocs(q)
    
    if (querySnapshot.empty) {
      return
    }
    
    const docs = querySnapshot.docs
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE)
      const batch = writeBatch(db)
      
      chunk.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref)
      })
      
      await batch.commit()
    }
    return
  }

  // Get existing documents to find ones to delete
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  const existingIds = new Set(querySnapshot.docs.map(d => d.id))
  const newIds = new Set(items.map(item => item.id))
  
  // Find IDs to delete (exist in Firestore but not in new items)
  const idsToDelete = Array.from(existingIds).filter(id => !newIds.has(id))

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)

    chunk.forEach((item) => {
      const docRef = doc(db, collectionPath, item.id)
      // Note: batch.set doesn't support merge option
      // This is intentional for bulk overwrite mode (Import/Reset only)
      batch.set(docRef, item)
    })

    await batch.commit()
  }

  if (idsToDelete.length > 0) {
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const chunk = idsToDelete.slice(i, i + BATCH_SIZE)
      const batch = writeBatch(db)
      
      chunk.forEach((id) => {
        const docRef = doc(db, collectionPath, id)
        batch.delete(docRef)
      })
      
      await batch.commit()
    }
  }
}

/**
 * Loads all documents from a Firestore collection.
 */
export async function loadDocuments<T>(
  uid: string,
  collectionName: string
): Promise<T[]> {
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  
  const items = querySnapshot.docs.map((doc) => doc.data() as T)
  return items
}

/**
 * Deletes all documents in a Firestore collection.
 * Firestore has a limit of 500 operations per batch, so large deletions are chunked.
 * 
 * ⚠️ Only use for explicit reset/clear operations, not for normal sync.
 */
export async function deleteAllDocuments(
  uid: string,
  collectionName: string
): Promise<void> {
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  
  if (querySnapshot.empty) return
  
  const BATCH_SIZE = 500
  const docs = querySnapshot.docs
  
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    
    chunk.forEach((docSnapshot) => {
      batch.delete(docSnapshot.ref)
    })
    
    await batch.commit()
  }
}

/**
 * Saves a single net worth item (per-document upsert with conflict detection)
 * 
 * Use this for individual item updates (add, edit).
 * Never use for bulk saves - that causes "last write wins" conflicts.
 */
export async function saveNetWorthItem<T extends { id: string }>(
  uid: string,
  item: T,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  // Filter out Perpetuals items - they're created dynamically, not stored in Firebase
  if ((item as any).category === 'Perpetuals') {
    return { success: true } // Skip Perpetuals items
  }

  const docRef = doc(db, `users/${uid}/netWorthItems/${item.id}`)
  return await safeUpsertDoc(docRef, item, options)
}

/**
 * Deletes a single net worth item (with conflict detection)
 */
export async function deleteNetWorthItem(
  uid: string,
  itemId: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/netWorthItems/${itemId}`)
  return await safeDeleteDoc(docRef, options)
}

/**
 * Saves a single transaction (per-document upsert with conflict detection)
 * 
 * Use this for individual transaction updates (add, edit).
 * Never use for bulk saves - that causes "last write wins" conflicts.
 */
export async function saveNetWorthTransaction<T extends { id: string }>(
  uid: string,
  transaction: T,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/netWorthTransactions/${transaction.id}`)
  return await safeUpsertDoc(docRef, transaction, options)
}

/**
 * Deletes a single transaction (with conflict detection)
 */
export async function deleteNetWorthTransaction(
  uid: string,
  transactionId: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/netWorthTransactions/${transactionId}`)
  return await safeDeleteDoc(docRef, options)
}

/**
 * ⚠️ DEPRECATED: saveNetWorthItems performs bulk overwrites
 * 
 * This function is kept only for Import/Reset flows.
 * For normal operations, use saveNetWorthItem for individual items.
 * 
 * @deprecated Use per-document upserts instead
 */
export async function saveNetWorthItems<T extends { id: string }>(
  uid: string,
  items: T[],
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    if (import.meta.env.DEV) {
      console.error('[FirestoreService] saveNetWorthItems called without allowBulkOverwrite. This causes "last write wins" conflicts!', {
        itemCount: items.length,
        stack: new Error().stack,
      })
    }
    throw new Error(
      `[FirestoreService] saveNetWorthItems performs bulk overwrites and causes conflicts. ` +
      `Use saveNetWorthItem for individual items. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  // Filter out Perpetuals items - they're created dynamically, not stored in Firebase
  const itemsToSave = items.filter(item => (item as any).category !== 'Perpetuals')
  await saveDocuments(uid, 'netWorthItems', itemsToSave, { allowBulkOverwrite: true })
}

export async function loadNetWorthItems<T>(uid: string): Promise<T[]> {
  const items = await loadDocuments<T>(uid, 'netWorthItems')
  return items
}

/**
 * ⚠️ DEPRECATED: saveNetWorthTransactions performs bulk overwrites
 * 
 * This function is kept only for Import/Reset flows.
 * For normal operations, use saveNetWorthTransaction for individual transactions.
 * 
 * @deprecated Use per-document upserts instead
 */
export async function saveNetWorthTransactions<T extends { id: string }>(
  uid: string,
  transactions: T[],
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    if (import.meta.env.DEV) {
      console.error('[FirestoreService] saveNetWorthTransactions called without allowBulkOverwrite. This causes "last write wins" conflicts!', {
        transactionCount: transactions.length,
        stack: new Error().stack,
      })
    }
    throw new Error(
      `[FirestoreService] saveNetWorthTransactions performs bulk overwrites and causes conflicts. ` +
      `Use saveNetWorthTransaction for individual transactions. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }

  await saveDocuments(uid, 'netWorthTransactions', transactions, { allowBulkOverwrite: true })
}

export async function loadNetWorthTransactions<T>(uid: string): Promise<T[]> {
  const transactions = await loadDocuments<T>(uid, 'netWorthTransactions')
  return transactions
}

// Similar functions for cashflow items (per-document upserts)
export async function saveCashflowInflowItem<T extends { id: string }>(
  uid: string,
  item: T,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/cashflowInflowItems/${item.id}`)
  return await safeUpsertDoc(docRef, item, options)
}

export async function deleteCashflowInflowItem(
  uid: string,
  itemId: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/cashflowInflowItems/${itemId}`)
  return await safeDeleteDoc(docRef, options)
}

/**
 * ⚠️ DEPRECATED: saveCashflowInflowItems performs bulk overwrites
 */
export async function saveCashflowInflowItems<T extends { id: string }>(
  uid: string,
  items: T[],
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    if (import.meta.env.DEV) {
      console.error('[FirestoreService] saveCashflowInflowItems called without allowBulkOverwrite. This causes "last write wins" conflicts!', {
        itemCount: items.length,
        stack: new Error().stack,
      })
    }
    throw new Error(
      `[FirestoreService] saveCashflowInflowItems performs bulk overwrites and causes conflicts. ` +
      `Use saveCashflowInflowItem for individual items. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }
  await saveDocuments(uid, 'cashflowInflowItems', items, { allowBulkOverwrite: true })
}

export async function loadCashflowInflowItems<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'cashflowInflowItems')
}

export async function saveCashflowOutflowItem<T extends { id: string }>(
  uid: string,
  item: T,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/cashflowOutflowItems/${item.id}`)
  return await safeUpsertDoc(docRef, item, options)
}

export async function deleteCashflowOutflowItem(
  uid: string,
  itemId: string,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const docRef = doc(db, `users/${uid}/cashflowOutflowItems/${itemId}`)
  return await safeDeleteDoc(docRef, options)
}

/**
 * ⚠️ DEPRECATED: saveCashflowOutflowItems performs bulk overwrites
 */
export async function saveCashflowOutflowItems<T extends { id: string }>(
  uid: string,
  items: T[],
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    if (import.meta.env.DEV) {
      console.error('[FirestoreService] saveCashflowOutflowItems called without allowBulkOverwrite. This causes "last write wins" conflicts!', {
        itemCount: items.length,
        stack: new Error().stack,
      })
    }
    throw new Error(
      `[FirestoreService] saveCashflowOutflowItems performs bulk overwrites and causes conflicts. ` +
      `Use saveCashflowOutflowItem for individual items. If you need bulk overwrite (Import/Reset), ` +
      `set allowBulkOverwrite: true.`
    )
  }
  await saveDocuments(uid, 'cashflowOutflowItems', items, { allowBulkOverwrite: true })
}

export async function loadCashflowOutflowItems<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'cashflowOutflowItems')
}

export async function saveCashflowAccountflowMappings<T extends { id: string }>(
  uid: string,
  mappings: T[],
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[FirestoreService] saveCashflowAccountflowMappings performs bulk overwrites. ` +
      `If you need bulk overwrite (Import/Reset), set allowBulkOverwrite: true.`
    )
  }
  await saveDocuments(uid, 'cashflowAccountflowMappings', mappings, { allowBulkOverwrite: true })
}

export async function loadCashflowAccountflowMappings<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'cashflowAccountflowMappings')
}

export interface Platform {
  id: string
  name: string
  order: number
  isDefault?: boolean
}

export async function loadPlatforms(uid: string): Promise<Platform[]> {
  return loadDocuments<Platform>(uid, 'platforms')
}

export async function savePlatforms(
  uid: string,
  platforms: Platform[],
  options: {
    allowBulkOverwrite?: boolean
  } = {}
): Promise<void> {
  if (!options.allowBulkOverwrite) {
    throw new Error(
      `[FirestoreService] savePlatforms performs bulk overwrites. ` +
      `If you need bulk overwrite (Import/Reset), set allowBulkOverwrite: true.`
    )
  }
  await saveDocuments(uid, 'platforms', platforms, { allowBulkOverwrite: true })
}

export interface UserSettings {
  baseCurrency?: string
  apiKeys?: {
    rapidApiKey?: string
    asterApiKey?: string
    asterApiSecretKey?: string
    hyperliquidWalletAddress?: string
  }
  analyticsSafetyBuffer?: number
}

export async function saveUserSettings(
  uid: string,
  settings: UserSettings
): Promise<void> {
  const docRef = doc(db, `users/${uid}/settings/user`)
  // Check if document exists
  const docSnap = await getDoc(docRef)
  
    // Always use updateDoc with merge to prevent overwrites
    const updateData: any = { ...settings }
    
    // Handle nested apiKeys object - if any key should be deleted, use deleteField()
    if (settings.apiKeys) {
      const apiKeysUpdate: any = {}
      Object.keys(settings.apiKeys).forEach((key) => {
        const value = (settings.apiKeys as any)[key]
        if (value === deleteField()) {
          apiKeysUpdate[key] = deleteField()
        } else if (value !== undefined) {
          apiKeysUpdate[key] = value
        }
      })
      if (Object.keys(apiKeysUpdate).length > 0) {
        updateData.apiKeys = apiKeysUpdate
      }
    }
    
    // Use safe write wrapper
    await safeWrite(docRef, updateData, { 
      origin: 'user', 
      domain: 'settings', 
      merge: true 
    })
}

export async function loadUserSettings(uid: string): Promise<UserSettings | null> {
  const docRef = doc(db, `users/${uid}/settings/user`)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return docSnap.data() as UserSettings
  }
  return null
}

/**
 * Saves snapshots to Firestore.
 * Snapshots use 'date' as their unique document identifier instead of 'id'.
 */
export async function saveSnapshotsFirestore<T extends { date: string }>(
  uid: string,
  snapshots: T[]
): Promise<void> {
  if (snapshots.length === 0) return

  const collectionPath = getUserCollectionPath(uid, 'snapshots')
  const BATCH_SIZE = 500

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const chunk = snapshots.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)

    chunk.forEach((snapshot) => {
      const docRef = doc(db, collectionPath, snapshot.date)
      // Note: batch.set doesn't support merge option
      // For snapshots, we use setDoc which will create or overwrite
      // This is acceptable since snapshots are keyed by date
      batch.set(docRef, snapshot)
    })

    await batch.commit()
  }
}

export async function loadSnapshotsFirestore<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'snapshots')
}

/**
 * Saves NetWorthSummary to Firestore as a single document.
 * This is the computed summary that gets updated on every calculation.
 */
export async function saveNetWorthSummaryFirestore(
  uid: string,
  summary: NetWorthSummary
): Promise<void> {
  const docRef = doc(db, `users/${uid}/netWorthSummary/current`)
  // Use safe write with merge to prevent overwrites
  await safeWrite(docRef, summary, { 
    origin: 'system', 
    domain: 'netWorthSummary', 
    merge: true 
  })
}

/**
 * Loads NetWorthSummary from Firestore.
 */
export async function loadNetWorthSummaryFirestore(uid: string): Promise<NetWorthSummary | null> {
  const docRef = doc(db, `users/${uid}/netWorthSummary/current`)
  const docSnap = await getDoc(docRef)
  if (docSnap.exists()) {
    return docSnap.data() as NetWorthSummary
  }
  return null
}

/**
 * Deletes all user data from Firestore, including collections and settings document.
 * 
 * ⚠️ Only use for explicit reset/clear operations.
 */
export async function clearAllUserData(uid: string): Promise<void> {
  const collections = [
    'netWorthItems',
    'netWorthTransactions',
    'cashflowInflowItems',
    'cashflowOutflowItems',
    'cashflowAccountflowMappings',
    'snapshots',
    'platforms',
  ]

  await Promise.all([
    ...collections.map((collectionName) => deleteAllDocuments(uid, collectionName)),
    (async () => {
      const settingsDocRef = doc(db, `users/${uid}/settings/user`)
      try {
        await safeDelete(settingsDocRef, { 
          origin: 'system', 
          domain: 'settings' 
        })
      } catch (error) {
        // Ignore if document doesn't exist
        console.warn('Settings document does not exist or already deleted:', error)
      }
    })(),
  ])
}
