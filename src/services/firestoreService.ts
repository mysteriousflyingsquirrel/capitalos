import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc,
  writeBatch,
  query,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore'
import { db } from '../config/firebase'

// Helper to get user-scoped collection path
function getUserCollectionPath(uid: string, collectionName: string): string {
  return `users/${uid}/${collectionName}`
}

// Generic function to save a single document
export async function saveDocument<T extends { id: string }>(
  uid: string,
  collectionName: string,
  item: T
): Promise<void> {
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const docRef = doc(db, collectionPath, item.id)
  await setDoc(docRef, item)
}

// Generic function to save multiple documents in a batch
export async function saveDocuments<T extends { id: string }>(
  uid: string,
  collectionName: string,
  items: T[]
): Promise<void> {
  if (items.length === 0) return

  const batch = writeBatch(db)
  const collectionPath = getUserCollectionPath(uid, collectionName)

  items.forEach((item) => {
    const docRef = doc(db, collectionPath, item.id)
    batch.set(docRef, item)
  })

  await batch.commit()
}

// Generic function to load all documents from a collection
export async function loadDocuments<T>(
  uid: string,
  collectionName: string
): Promise<T[]> {
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  
  return querySnapshot.docs.map((doc) => doc.data() as T)
}

// Generic function to delete all documents in a collection
export async function deleteAllDocuments(
  uid: string,
  collectionName: string
): Promise<void> {
  const collectionPath = getUserCollectionPath(uid, collectionName)
  const q = query(collection(db, collectionPath))
  const querySnapshot = await getDocs(q)
  
  const batch = writeBatch(db)
  querySnapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref)
  })
  
  await batch.commit()
}

// Specific functions for each data type
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

// Clear all user data
export async function clearAllUserData(uid: string): Promise<void> {
  const collections = [
    'netWorthItems',
    'netWorthTransactions',
    'cashflowInflowItems',
    'cashflowOutflowItems',
    'cashflowAccountflowMappings',
  ]

  await Promise.all(
    collections.map((collectionName) => deleteAllDocuments(uid, collectionName))
  )
}

