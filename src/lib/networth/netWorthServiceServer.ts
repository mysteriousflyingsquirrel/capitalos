/**
 * Server-side Net Worth Service
 * Uses Firebase Admin SDK for serverless functions
 * Implements 5-minute TTL caching
 */

import admin from 'firebase-admin'
import type { CurrencyCode } from '../currency'
import { computeNetWorthSummary, type ComputeOptions } from './netWorthCompute'
import type { NetWorthSummary } from './types'
import type { NetWorthItem, NetWorthTransaction } from '../../pages/NetWorth'

/**
 * Cache entry with TTL
 */
type CacheEntry = {
  summary: NetWorthSummary
  fetchedAtMs: number
}

/**
 * In-memory cache keyed by uid + baseCurrency
 */
const cache = new Map<string, CacheEntry>()

/**
 * Cache TTL: 5 minutes in milliseconds
 */
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Generate cache key from uid and baseCurrency
 */
function getCacheKey(uid: string, baseCurrency: string): string {
  return `${uid}:${baseCurrency}`
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  const ageMs = Date.now() - entry.fetchedAtMs
  return ageMs < CACHE_TTL_MS
}

/**
 * Fetch transactions for a user from Firestore using Admin SDK
 */
async function fetchTransactionsForUid(uid: string): Promise<NetWorthTransaction[]> {
  const db = admin.firestore()
  const snapshot = await db.collection(`users/${uid}/netWorthTransactions`).get()
  return snapshot.docs.map(doc => doc.data() as NetWorthTransaction)
}

/**
 * Fetch items for a user from Firestore using Admin SDK
 * Note: Server-side version does NOT fetch perpetuals data (API calls don't work in serverless)
 * Perpetuals will be calculated as 0 if perpetualsData is not in the item
 */
async function fetchItemsForUid(uid: string): Promise<NetWorthItem[]> {
  const db = admin.firestore()
  const snapshot = await db.collection(`users/${uid}/netWorthItems`).get()
  const items = snapshot.docs.map(doc => doc.data() as NetWorthItem)
  
  // Strip perpetualsData if present (it shouldn't be saved, but handle it)
  return items.map(item => {
    if (item.category === 'Perpetuals' && (item as any).perpetualsData) {
      const { perpetualsData, ...itemWithoutPerpetualsData } = item as any
      return itemWithoutPerpetualsData as NetWorthItem
    }
    return item
  })
}

/**
 * Get user settings (for base currency)
 */
async function getUserSettings(uid: string): Promise<{ baseCurrency?: string } | null> {
  const db = admin.firestore()
  const docRef = db.collection(`users/${uid}/settings`).doc('user')
  const docSnap = await docRef.get()
  if (docSnap.exists) {
    return docSnap.data() as { baseCurrency?: string }
  }
  return null
}

/**
 * Get net worth summary for a user (server-side)
 * 
 * @param uid - User ID
 * @param baseCurrency - Base currency (default: CHF)
 * @param options - Optional compute options
 * @returns Net worth summary
 */
export async function getNetWorthSummary(
  uid: string,
  baseCurrency: CurrencyCode = 'CHF',
  options?: Partial<ComputeOptions>
): Promise<NetWorthSummary> {
  // Check cache first
  const cacheKey = getCacheKey(uid, baseCurrency)
  const cached = cache.get(cacheKey)
  
  if (cached && isCacheValid(cached)) {
    return cached.summary
  }

  // Cache miss or expired - fetch and compute
  console.log(`[NetWorthServiceServer] Cache miss for ${uid}, fetching fresh data...`)

  // Fetch transactions and items in parallel
  const [transactions, items] = await Promise.all([
    fetchTransactionsForUid(uid),
    fetchItemsForUid(uid),
  ])

  // Merge options with defaults
  // Server-side: use transaction-based calculations (no external prices)
  const computeOptions: ComputeOptions = {
    baseCurrency,
    cryptoPrices: options?.cryptoPrices || {},
    stockPrices: options?.stockPrices || {},
    usdToChfRate: options?.usdToChfRate ?? null,
    convert: options?.convert || ((amount: number, from: CurrencyCode) => {
      // Default: assume transactions already have pricePerItemChf in CHF
      return from === baseCurrency ? amount : amount
    }),
  }

  // Compute summary using pure function
  const summary = computeNetWorthSummary(items, transactions, computeOptions)
  
  // Set uid in summary
  summary.uid = uid

  // Store in cache
  cache.set(cacheKey, {
    summary,
    fetchedAtMs: Date.now(),
  })

  return summary
}

/**
 * Invalidate cache for a user
 */
export function invalidateNetWorthCache(uid: string, baseCurrency: CurrencyCode = 'CHF'): void {
  const cacheKey = getCacheKey(uid, baseCurrency)
  cache.delete(cacheKey)
  console.log(`[NetWorthServiceServer] Cache invalidated for ${uid}`)
}
