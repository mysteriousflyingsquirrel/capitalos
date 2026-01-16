import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { safeWrite } from './repository'

/**
 * Ensure user is initialized in Firestore (idempotent, minimal writes)
 * 
 * Creates if missing:
 * - users/{uid} (with createdAt, lastLoginAt, schemaVersion)
 * - users/{uid}/settings/user (with baseCurrency and apiKeys fields)
 * 
 * Never overwrites existing documents.
 */
export async function ensureUserInitialized(uid: string): Promise<void> {
  console.log(`[UserInitialization] Ensuring user initialized: ${uid}`)

  try {
    // Check if user document exists
    const userDocRef = doc(db, `users/${uid}`)
    const userDocSnap = await getDoc(userDocRef)

    if (!userDocSnap.exists()) {
      // Create user document with minimal fields
      // Use merge: true to be safe (will create if doesn't exist, won't overwrite if it does)
      console.log(`[UserInitialization] Creating user document: ${uid}`)
      await safeWrite(userDocRef, {
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        schemaVersion: 1,
      }, { origin: 'system', domain: 'user', merge: true })
    } else {
      // Update lastLoginAt only (idempotent)
      console.log(`[UserInitialization] User document exists, updating lastLoginAt: ${uid}`)
      await safeWrite(userDocRef, {
        lastLoginAt: serverTimestamp(),
      }, { origin: 'system', domain: 'user', merge: true })
    }

    // Ensure settings/user document exists with baseCurrency and apiKeys fields
    const settingsRef = doc(db, `users/${uid}/settings/user`)
    const settingsSnap = await getDoc(settingsRef)
    
    if (!settingsSnap.exists()) {
      console.log(`[UserInitialization] Creating settings/user document: ${uid}`)
      await safeWrite(settingsRef, {
        baseCurrency: 'CHF',
        apiKeys: {},
      }, { origin: 'system', domain: 'settings', merge: true })
    } else {
      // Ensure baseCurrency and apiKeys fields exist (idempotent - won't overwrite if they exist)
      const settingsData = settingsSnap.data()
      const updates: any = {}
      
      if (!settingsData?.baseCurrency) {
        updates.baseCurrency = 'CHF'
      }
      
      if (!settingsData?.apiKeys) {
        updates.apiKeys = {}
      }
      
      if (Object.keys(updates).length > 0) {
        console.log(`[UserInitialization] Adding missing fields to settings/user: ${uid}`, updates)
        await safeWrite(settingsRef, updates, { origin: 'system', domain: 'settings', merge: true })
      }
    }

    console.log(`[UserInitialization] User initialization complete: ${uid}`)
  } catch (error) {
    console.error(`[UserInitialization] Error initializing user ${uid}:`, error)
    throw error
  }
}

