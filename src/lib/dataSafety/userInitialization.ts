import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { safeWrite } from './repository'

/**
 * Ensure user is initialized in Firestore (idempotent, minimal writes)
 * 
 * Creates if missing:
 * - users/{uid} (with createdAt, lastLoginAt, schemaVersion)
 * - users/{uid}/settings/baseCurrency (default "CHF")
 * - users/{uid}/settings/apiKeys (default {})
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

    // Ensure settings/baseCurrency exists
    const baseCurrencyRef = doc(db, `users/${uid}/settings/baseCurrency`)
    const baseCurrencySnap = await getDoc(baseCurrencyRef)
    
    if (!baseCurrencySnap.exists()) {
      console.log(`[UserInitialization] Creating baseCurrency setting: ${uid}`)
      await safeWrite(baseCurrencyRef, {
        value: 'CHF',
      }, { origin: 'system', domain: 'settings', merge: true })
    }

    // Ensure settings/apiKeys exists
    const apiKeysRef = doc(db, `users/${uid}/settings/apiKeys`)
    const apiKeysSnap = await getDoc(apiKeysRef)
    
    if (!apiKeysSnap.exists()) {
      console.log(`[UserInitialization] Creating apiKeys setting: ${uid}`)
      await safeWrite(apiKeysRef, {
        value: {},
      }, { origin: 'system', domain: 'settings', merge: true })
    }

    console.log(`[UserInitialization] User initialization complete: ${uid}`)
  } catch (error) {
    console.error(`[UserInitialization] Error initializing user ${uid}:`, error)
    throw error
  }
}

