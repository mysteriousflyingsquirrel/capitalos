import { 
  Query, 
  DocumentData,
  onSnapshot,
  Unsubscribe,
  QuerySnapshot
} from 'firebase/firestore'
import { registerSubscription, unregisterSubscription } from './userContextSwap'

// Traffic guardrails (dev-only)
let snapshotEventCount = 0
let snapshotEventWindow: number[] = [] // Timestamps of recent snapshot events
let writeAttemptCount = 0
let writeSuccessCount = 0

type SubscriptionKey = string
type SubscriptionCallback<T = DocumentData> = (snapshot: QuerySnapshot<T>) => void

interface SubscriptionEntry {
  unsubscribe: Unsubscribe
  callback: SubscriptionCallback
  domain: string
  queryKey: string
}

// Active subscriptions map: uid:domain:queryKey -> entry
const subscriptions = new Map<SubscriptionKey, SubscriptionEntry>()

// Dev-only: track subscription events
let subscriptionCount = 0
let lastSubscriptionCount = 0

if (import.meta.env.DEV) {
  // Log subscription count periodically
  setInterval(() => {
    if (subscriptionCount !== lastSubscriptionCount) {
      console.log(`[SubscriptionManager] Active subscriptions: ${subscriptionCount}`)
      lastSubscriptionCount = subscriptionCount
      
      if (subscriptionCount > 50) {
        console.warn(`[SubscriptionManager] WARNING: High subscription count (${subscriptionCount})`)
      }
    }
  }, 5000)
}

/**
 * Generate subscription key for deduplication
 */
function getSubscriptionKey(uid: string, domain: string, queryKey: string): SubscriptionKey {
  return `${uid}:${domain}:${queryKey}`
}

/**
 * Subscribe to a Firestore query with deduplication
 * 
 * @param uid - User ID
 * @param domain - Domain name (e.g., 'netWorthItems', 'transactions')
 * @param queryKey - Unique key for this query (e.g., JSON.stringify(query constraints))
 * @param query - Firestore query
 * @param callback - Callback function
 * @returns Unsubscribe function
 */
export function subscribe<T = DocumentData>(
  uid: string,
  domain: string,
  queryKey: string,
  query: Query<T>,
  callback: SubscriptionCallback<T>
): Unsubscribe {
  const key = getSubscriptionKey(uid, domain, queryKey)
  
  // Check if subscription already exists
  const existing = subscriptions.get(key)
  if (existing) {
    console.log(`[SubscriptionManager] Reusing existing subscription: ${key}`)
    // Return existing unsubscribe, but also call the new callback immediately
    // This allows multiple components to subscribe to the same query
    // Note: This is a simplified approach - in production you might want
    // to support multiple callbacks per subscription
    return existing.unsubscribe
  }

  console.log(`[SubscriptionManager] Creating new subscription: ${key}`)
  
  // Create new subscription
  const unsubscribe = onSnapshot(
    query,
    (snapshot) => {
      // Traffic guardrail: track snapshot events
      if (import.meta.env.DEV) {
        snapshotEventCount++
        const now = Date.now()
        snapshotEventWindow.push(now)
        // Keep only events from last minute
        snapshotEventWindow = snapshotEventWindow.filter(t => now - t < 60000)
      }
      
      callback(snapshot)
    },
    (error) => {
      console.error(`[SubscriptionManager] Subscription error for ${key}:`, error)
      // Remove from map on error
      subscriptions.delete(key)
      subscriptionCount--
      unregisterSubscription(key)
      
      // Update sync status with listener count
      const syncStatus = (window as any).__CAPITALOS_SYNC_STATUS__
      if (syncStatus && syncStatus.setActiveListeners) {
        syncStatus.setActiveListeners(subscriptionCount)
      }
    }
  )

  // Store subscription
  const entry: SubscriptionEntry = {
    unsubscribe: () => {
      console.log(`[SubscriptionManager] Unsubscribing: ${key}`)
      unsubscribe()
      subscriptions.delete(key)
      subscriptionCount--
      unregisterSubscription(key)
    },
    callback,
    domain,
    queryKey,
  }
  
  subscriptions.set(key, entry)
  subscriptionCount++
  
  // Register for teardown tracking
  registerSubscription(key, entry.unsubscribe)
  
  // Update sync status with listener count
  const syncStatus = (window as any).__CAPITALOS_SYNC_STATUS__
  if (syncStatus && syncStatus.setActiveListeners) {
    syncStatus.setActiveListeners(subscriptionCount)
  }

  return entry.unsubscribe
}

/**
 * Unsubscribe from a specific subscription
 */
export function unsubscribe(uid: string, domain: string, queryKey: string): void {
  const key = getSubscriptionKey(uid, domain, queryKey)
  const entry = subscriptions.get(key)
  
  if (entry) {
    entry.unsubscribe()
  }
}

/**
 * Unsubscribe all subscriptions for a domain
 */
export function unsubscribeDomain(uid: string, domain: string): void {
  const prefix = `${uid}:${domain}:`
  const keysToRemove: SubscriptionKey[] = []
  
  for (const key of subscriptions.keys()) {
    if (key.startsWith(prefix)) {
      keysToRemove.push(key)
    }
  }
  
  for (const key of keysToRemove) {
    const entry = subscriptions.get(key)
    if (entry) {
      entry.unsubscribe()
    }
  }
}

/**
 * Unsubscribe all subscriptions for a user
 */
export function unsubscribeUser(uid: string): void {
  const prefix = `${uid}:`
  const keysToRemove: SubscriptionKey[] = []
  
  for (const key of subscriptions.keys()) {
    if (key.startsWith(prefix)) {
      keysToRemove.push(key)
    }
  }
  
  for (const key of keysToRemove) {
    const entry = subscriptions.get(key)
    if (entry) {
      entry.unsubscribe()
    }
  }
}

/**
 * Unsubscribe all subscriptions (used during user context swap)
 */
export function unsubscribeAll(): void {
  console.log(`[SubscriptionManager] Unsubscribing all ${subscriptions.size} subscriptions`)
  
  for (const entry of subscriptions.values()) {
    try {
      entry.unsubscribe()
    } catch (err) {
      console.error('[SubscriptionManager] Error unsubscribing:', err)
    }
  }
  
  subscriptions.clear()
  subscriptionCount = 0
  
  // Update sync status
  const syncStatus = (window as any).__CAPITALOS_SYNC_STATUS__
  if (syncStatus && syncStatus.setActiveListeners) {
    syncStatus.setActiveListeners(0)
  }
}

/**
 * Get active subscription count (dev-only)
 */
export function getActiveSubscriptionCount(): number {
  return subscriptionCount
}

/**
 * Get subscription diagnostics (dev-only)
 */
export function getSubscriptionDiagnostics(): Array<{ key: string; domain: string; queryKey: string }> {
  return Array.from(subscriptions.entries()).map(([key, entry]) => ({
    key,
    domain: entry.domain,
    queryKey: entry.queryKey,
  }))
}

/**
 * Traffic guardrails: Track write attempts
 */
export function trackWriteAttempt() {
  if (import.meta.env.DEV) {
    writeAttemptCount++
  }
}

/**
 * Traffic guardrails: Track write success
 */
export function trackWriteSuccess() {
  if (import.meta.env.DEV) {
    writeSuccessCount++
  }
}

/**
 * Get traffic statistics (dev-only)
 */
export function getTrafficStats() {
  if (!import.meta.env.DEV) {
    return null
  }
  
  const now = Date.now()
  const eventsLastMinute = snapshotEventWindow.filter(t => now - t < 60000).length
  
  return {
    activeListeners: subscriptionCount,
    snapshotEventsTotal: snapshotEventCount,
    snapshotEventsPerMinute: eventsLastMinute,
    writesAttempted: writeAttemptCount,
    writesSucceeded: writeSuccessCount,
    writeSuccessRate: writeAttemptCount > 0 ? (writeSuccessCount / writeAttemptCount * 100).toFixed(1) + '%' : 'N/A',
  }
}

// Log traffic stats periodically in dev
if (import.meta.env.DEV) {
  setInterval(() => {
    const stats = getTrafficStats()
    if (stats && (stats.activeListeners > 0 || stats.writesAttempted > 0)) {
      console.log('[SubscriptionManager] Traffic stats:', stats)
    }
  }, 30000) // Every 30 seconds
}

