/**
 * UserSettingsRepository
 * 
 * Single source of truth for user settings in Firestore.
 * 
 * Canonical path: users/{uid}/settings/user (single document)
 * 
 * Structure:
 * {
 *   baseCurrency: string,
 *   apiKeys: {
 *     rapidApiKey?: string,
 *     asterApiKey?: string,
 *     asterApiSecretKey?: string,
 *     hyperliquidWalletAddress?: string,
 *     krakenApiKey?: string,
 *     krakenApiSecretKey?: string
 *   }
 * }
 * 
 * Rules:
 * - Always use merge writes (never overwrite)
 * - Never write {} or null to settings
 * - Never delete fields automatically
 * - Initialize only missing fields, preserve everything else
 */

import { doc, getDoc, updateDoc, setDoc, deleteField } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { safeWrite } from './repository'

/**
 * Canonical Firestore path for user settings
 */
function getUserSettingsDocPath(uid: string) {
  return doc(db, 'users', uid, 'settings', 'user')
}

export interface ApiKeys {
  rapidApiKey?: string | null
  asterApiKey?: string | null
  asterApiSecretKey?: string | null
  hyperliquidWalletAddress?: string | null
  krakenApiKey?: string | null
  krakenApiSecretKey?: string | null
}

export interface UserSettingsData {
  baseCurrency: string | null
  apiKeys: ApiKeys | null
}

/**
 * Load user settings from Firestore
 * 
 * Returns null if document doesn't exist or on error.
 * apiKeys and baseCurrency are null if not present in document.
 */
export async function loadUserSettings(uid: string): Promise<UserSettingsData | null> {
  const docRef = getUserSettingsDocPath(uid)
  
  if (import.meta.env.DEV) {
    console.log('[UserSettingsRepo] Loading settings:', {
      uid,
      path: `users/${uid}/settings/user`,
    })
  }
  
  try {
    const snap = await getDoc(docRef)
    
    if (import.meta.env.DEV) {
      console.log('[UserSettingsRepo] Settings loaded:', {
        exists: snap.exists(),
        hasData: !!snap.data(),
        dataKeys: snap.exists() ? Object.keys(snap.data() || {}) : [],
      })
    }
    
    if (!snap.exists()) {
      return null
    }
    
    const data = snap.data()
    
    return {
      baseCurrency: data?.baseCurrency || null,
      apiKeys: data?.apiKeys || null,
    }
  } catch (error) {
    console.error('[UserSettingsRepo] Error loading settings:', error)
    throw error
  }
}

/**
 * Save base currency to Firestore
 * Uses merge write to preserve other fields
 */
export async function saveBaseCurrency(uid: string, currency: string): Promise<void> {
  const docRef = getUserSettingsDocPath(uid)
  
  if (import.meta.env.DEV) {
    console.log('[UserSettingsRepo] Saving baseCurrency:', {
      uid,
      currency,
      path: `users/${uid}/settings/user`,
    })
  }
  
  try {
    // Use safeWrite with merge to preserve other fields
    await safeWrite(docRef, { baseCurrency: currency }, {
      origin: 'user',
      domain: 'settings',
      merge: true,
    })
    
    if (import.meta.env.DEV) {
      console.log('[UserSettingsRepo] baseCurrency saved successfully')
    }
  } catch (error) {
    console.error('[UserSettingsRepo] Error saving baseCurrency:', error)
    throw error
  }
}

/**
 * Save API keys to Firestore
 * Uses merge write to preserve other fields
 * 
 * @param partialKeys - Partial API keys object. Only provided keys will be updated.
 *                     Use deleteField() to remove a key.
 */
export async function saveApiKeys(uid: string, partialKeys: Partial<ApiKeys>): Promise<void> {
  const docRef = getUserSettingsDocPath(uid)
  
  if (import.meta.env.DEV) {
    console.log('[UserSettingsRepo] Saving API keys:', {
      uid,
      keysToUpdate: Object.keys(partialKeys),
      path: `users/${uid}/settings/user`,
    })
  }
  
  try {
    // Check if document exists
    const snap = await getDoc(docRef)
    
    // Prepare update data
    const updateData: any = {}
    
    // Handle nested apiKeys object
    // If document exists and has apiKeys, merge with existing
    // Otherwise, create new apiKeys object
    if (snap.exists()) {
      const existingData = snap.data()
      const existingApiKeys = existingData?.apiKeys || {}
      
      // Merge partial keys with existing keys
      const mergedApiKeys = { ...existingApiKeys }
      
      // Apply updates (including deleteField() for removals)
      Object.keys(partialKeys).forEach((key) => {
        const value = (partialKeys as any)[key]
        if (value === deleteField()) {
          delete mergedApiKeys[key]
        } else if (value !== undefined) {
          mergedApiKeys[key] = value
        }
      })
      
      updateData.apiKeys = mergedApiKeys
    } else {
      // Document doesn't exist, create new apiKeys object
      const newApiKeys: any = {}
      Object.keys(partialKeys).forEach((key) => {
        const value = (partialKeys as any)[key]
        if (value !== undefined && value !== deleteField()) {
          newApiKeys[key] = value
        }
      })
      updateData.apiKeys = newApiKeys
    }
    
    // Use safeWrite with merge to preserve other fields (like baseCurrency)
    await safeWrite(docRef, updateData, {
      origin: 'user',
      domain: 'settings',
      merge: true,
    })
    
    if (import.meta.env.DEV) {
      console.log('[UserSettingsRepo] API keys saved successfully')
    }
  } catch (error) {
    console.error('[UserSettingsRepo] Error saving API keys:', error)
    throw error
  }
}

/**
 * Initialize user settings if missing
 * Only creates missing fields, preserves existing data
 */
export async function ensureUserSettingsInitialized(uid: string): Promise<void> {
  const docRef = getUserSettingsDocPath(uid)
  
  if (import.meta.env.DEV) {
    console.log('[UserSettingsRepo] Ensuring settings initialized:', {
      uid,
      path: `users/${uid}/settings/user`,
    })
  }
  
  try {
    const snap = await getDoc(docRef)
    
    if (!snap.exists()) {
      // Document doesn't exist, create with defaults
      if (import.meta.env.DEV) {
        console.log('[UserSettingsRepo] Creating new settings document')
      }
      
      await safeWrite(docRef, {
        baseCurrency: 'CHF',
        apiKeys: {},
      }, {
        origin: 'system',
        domain: 'settings',
        merge: true,
      })
    } else {
      // Document exists, ensure baseCurrency and apiKeys fields exist
      const data = snap.data()
      const updates: any = {}
      
      if (!data?.baseCurrency) {
        updates.baseCurrency = 'CHF'
      }
      
      if (!data?.apiKeys) {
        updates.apiKeys = {}
      }
      
      if (Object.keys(updates).length > 0) {
        if (import.meta.env.DEV) {
          console.log('[UserSettingsRepo] Adding missing fields:', Object.keys(updates))
        }
        
        await safeWrite(docRef, updates, {
          origin: 'system',
          domain: 'settings',
          merge: true,
        })
      }
    }
    
    if (import.meta.env.DEV) {
      console.log('[UserSettingsRepo] Settings initialization complete')
    }
  } catch (error) {
    console.error('[UserSettingsRepo] Error initializing settings:', error)
    throw error
  }
}

