import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  writeBatch,
  query,
} from 'firebase/firestore'
import { db } from '../config/firebase'

// Helper to get user-scoped collection path
function getUserCollectionPath(uid: string, collectionName: string): string {
  return `users/${uid}/${collectionName}`
}

/**
 * Saves multiple documents to Firestore in batches.
 * Firestore has a limit of 500 operations per batch, so large arrays are chunked.
 */
export async function saveDocuments<T extends { id: string }>(
  uid: string,
  collectionName: string,
  items: T[]
): Promise<void> {
  console.log(`[saveDocuments] Saving ${items.length} items to ${collectionName} for uid: ${uid}`)
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const BATCH_SIZE = 500

  // If items array is empty, delete all documents in the collection
  if (items.length === 0) {
    const q = query(collection(db, collectionPath))
    const querySnapshot = await getDocs(q)
    
    if (querySnapshot.empty) {
      console.log(`[saveDocuments] Collection ${collectionName} is already empty`)
      return
    }
    
    const docs = querySnapshot.docs
    console.log(`[saveDocuments] Deleting ${docs.length} existing documents from ${collectionName}`)
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE)
      const batch = writeBatch(db)
      
      chunk.forEach((docSnapshot) => {
        batch.delete(docSnapshot.ref)
      })
      
      await batch.commit()
    }
    console.log(`[saveDocuments] Successfully deleted all documents from ${collectionName}`)
    return
  }

  // Get existing documents to find ones to delete
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  const existingIds = new Set(querySnapshot.docs.map(d => d.id))
  const newIds = new Set(items.map(item => item.id))
  
  console.log(`[saveDocuments] Existing IDs: ${existingIds.size}, New IDs: ${newIds.size}`)
  
  // Find IDs to delete (exist in Firestore but not in new items)
  const idsToDelete = Array.from(existingIds).filter(id => !newIds.has(id))
  console.log(`[saveDocuments] IDs to delete: ${idsToDelete.length}`)

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)

    chunk.forEach((item) => {
      const docRef = doc(db, collectionPath, item.id)
      batch.set(docRef, item)
    })

    await batch.commit()
    console.log(`[saveDocuments] Saved chunk ${i / BATCH_SIZE + 1} (${chunk.length} items) to ${collectionName}`)
  }

  if (idsToDelete.length > 0) {
    console.log(`[saveDocuments] Deleting ${idsToDelete.length} removed documents from ${collectionName}`)
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const chunk = idsToDelete.slice(i, i + BATCH_SIZE)
      const batch = writeBatch(db)
      
      chunk.forEach((id) => {
        const docRef = doc(db, collectionPath, id)
        batch.delete(docRef)
      })
      
      await batch.commit()
    }
    console.log(`[saveDocuments] Successfully deleted removed documents from ${collectionName}`)
  }
  
  console.log(`[saveDocuments] Successfully saved all ${items.length} items to ${collectionName}`)
}

/**
 * Loads all documents from a Firestore collection.
 */
export async function loadDocuments<T>(
  uid: string,
  collectionName: string
): Promise<T[]> {
  console.log(`[loadDocuments] Loading from ${collectionName} for uid: ${uid}`)
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  
  const items = querySnapshot.docs.map((doc) => doc.data() as T)
  console.log(`[loadDocuments] Loaded ${items.length} items from ${collectionName}`)
  if (items.length > 0) {
    console.log(`[loadDocuments] Sample item from ${collectionName}:`, items[0])
  }
  return items
}

/**
 * Deletes all documents in a Firestore collection.
 * Firestore has a limit of 500 operations per batch, so large deletions are chunked.
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

export async function saveNetWorthItems<T extends { id: string }>(
  uid: string,
  items: T[]
): Promise<void> {
  await saveDocuments(uid, 'netWorthItems', items)
}

export async function loadNetWorthItems<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'netWorthItems')
}

export async function saveNetWorthTransactions<T extends { id: string }>(
  uid: string,
  transactions: T[]
): Promise<void> {
  await saveDocuments(uid, 'netWorthTransactions', transactions)
}

export async function loadNetWorthTransactions<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'netWorthTransactions')
}

export async function saveCashflowInflowItems<T extends { id: string }>(
  uid: string,
  items: T[]
): Promise<void> {
  await saveDocuments(uid, 'cashflowInflowItems', items)
}

export async function loadCashflowInflowItems<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'cashflowInflowItems')
}

export async function saveCashflowOutflowItems<T extends { id: string }>(
  uid: string,
  items: T[]
): Promise<void> {
  await saveDocuments(uid, 'cashflowOutflowItems', items)
}

export async function loadCashflowOutflowItems<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'cashflowOutflowItems')
}

export async function saveCashflowAccountflowMappings<T extends { id: string }>(
  uid: string,
  mappings: T[]
): Promise<void> {
  await saveDocuments(uid, 'cashflowAccountflowMappings', mappings)
}

export async function loadCashflowAccountflowMappings<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'cashflowAccountflowMappings')
}

export interface Platform {
  id: string
  name: string
  order: number
}

export async function savePlatforms(uid: string, platforms: Platform[]): Promise<void> {
  await saveDocuments(uid, 'platforms', platforms)
}

export async function loadPlatforms(uid: string): Promise<Platform[]> {
  return loadDocuments<Platform>(uid, 'platforms')
}

export interface UserSettings {
  baseCurrency?: string
  apiKeys?: {
    rapidApiKey?: string
  }
}

export async function saveUserSettings(
  uid: string,
  settings: UserSettings
): Promise<void> {
  const docRef = doc(db, `users/${uid}/settings/user`)
  await setDoc(docRef, settings)
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
      batch.set(docRef, snapshot)
    })

    await batch.commit()
  }
}

export async function loadSnapshotsFirestore<T>(uid: string): Promise<T[]> {
  return loadDocuments<T>(uid, 'snapshots')
}

/**
 * Deletes all user data from Firestore, including collections and settings document.
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
        await deleteDoc(settingsDocRef)
      } catch (error) {
        // Ignore if document doesn't exist
        console.warn('Settings document does not exist or already deleted:', error)
      }
    })(),
  ])
}

