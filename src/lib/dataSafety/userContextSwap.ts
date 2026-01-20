/**
 * Hard user context swap - ensures complete isolation between users
 */

// Track all active subscriptions for teardown
const activeSubscriptions = new Map<string, () => void>()

// Track all in-memory stores that need reset
const registeredStores: Array<() => void> = []

// Track debounced writes that need cancellation
const debouncedWrites: Array<() => void> = []

/**
 * Global localStorage keys that are safe to keep across user swaps.
 * These do not contain user-specific data.
 */
const GLOBAL_KEYS_TO_PRESERVE = new Set<string>([
  'capitalos_exchange_rates_v1',
  'capitalos_device_id',
])

/**
 * Register a Firestore subscription for teardown tracking
 */
export function registerSubscription(key: string, unsubscribe: () => void) {
  // If subscription already exists, unsubscribe the old one
  const existing = activeSubscriptions.get(key)
  if (existing) {
    console.warn(`[UserContextSwap] Replacing existing subscription: ${key}`)
    existing()
  }
  
  activeSubscriptions.set(key, unsubscribe)
}

/**
 * Unregister a subscription (called when it naturally unsubscribes)
 */
export function unregisterSubscription(key: string) {
  activeSubscriptions.delete(key)
}

/**
 * Teardown all Firestore subscriptions
 */
export function teardownAllFirestoreSubscriptions() {
  console.log(`[UserContextSwap] Tearing down ${activeSubscriptions.size} subscriptions`)
  
  for (const [key, unsubscribe] of activeSubscriptions.entries()) {
    try {
      unsubscribe()
    } catch (err) {
      console.error(`[UserContextSwap] Error unsubscribing ${key}:`, err)
    }
  }
  
  activeSubscriptions.clear()
}

/**
 * Register an in-memory store reset function
 */
export function registerStoreReset(resetFn: () => void) {
  registeredStores.push(resetFn)
}

/**
 * Reset all in-memory stores
 */
export function resetAllInMemoryStores() {
  console.log(`[UserContextSwap] Resetting ${registeredStores.length} in-memory stores`)
  
  for (const resetFn of registeredStores) {
    try {
      resetFn()
    } catch (err) {
      console.error('[UserContextSwap] Error resetting store:', err)
    }
  }
}

/**
 * Register a debounced write for cancellation
 */
export function registerDebouncedWrite(cancelFn: () => void) {
  debouncedWrites.push(cancelFn)
}

/**
 * Cancel all debounced writes
 */
export function cancelAllDebouncedWrites() {
  console.log(`[UserContextSwap] Cancelling ${debouncedWrites.length} debounced writes`)
  
  for (const cancelFn of debouncedWrites) {
    try {
      cancelFn()
    } catch (err) {
      console.error('[UserContextSwap] Error cancelling debounced write:', err)
    }
  }
  
  debouncedWrites.length = 0
}

/**
 * Clear all local persistence for a user
 */
export function resetAllLocalPersistence(prevUid: string | null, nextUid: string | null) {
  console.log('[UserContextSwap] Resetting local persistence:', { prevUid, nextUid })
  
  if (!prevUid) return

  // Clear all localStorage keys that are not uid-scoped
  // Uid-scoped keys will be handled by the new user's context
  const keysToRemove: string[] = []
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('capitalos_') && !key.includes(prevUid)) {
      if (GLOBAL_KEYS_TO_PRESERVE.has(key)) {
        continue
      }
      // Old global keys - remove them
      keysToRemove.push(key)
    }
  }
  
  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key)
    } catch (err) {
      console.error(`[UserContextSwap] Error removing localStorage key ${key}:`, err)
    }
  }
  
  // Also clear uid-scoped keys for previous user if switching users
  if (nextUid && nextUid !== prevUid) {
    const prevUidKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.includes(`:${prevUid}:`)) {
        prevUidKeys.push(key)
      }
    }
    
    for (const key of prevUidKeys) {
      try {
        localStorage.removeItem(key)
      } catch (err) {
        console.error(`[UserContextSwap] Error removing uid-scoped key ${key}:`, err)
      }
    }
  }
}

/**
 * Complete user context swap - call this when switching users
 */
export async function performUserContextSwap(prevUid: string | null, nextUid: string | null) {
  console.log('[UserContextSwap] Performing complete user context swap:', { prevUid, nextUid })
  
  // Unsubscribe all Firestore subscriptions
  const { unsubscribeAll } = await import('./subscriptionManager')
  unsubscribeAll()
  
  teardownAllFirestoreSubscriptions()
  resetAllInMemoryStores()
  cancelAllDebouncedWrites()
  resetAllLocalPersistence(prevUid, nextUid)
  
  console.log('[UserContextSwap] User context swap complete')
}

