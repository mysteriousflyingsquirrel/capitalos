/**
 * Global Net Worth Service
 * Single entry point for fetching and computing net worth summaries
 * Implements 5-minute TTL caching to avoid redundant calculations
 */

import type { NetWorthItem, NetWorthTransaction } from '../../pages/NetWorth'
import type { CurrencyCode } from '../currency'
import { computeNetWorthSummary, type ComputeOptions } from './netWorthCompute'
import type { NetWorthSummary } from './types'
import { loadNetWorthItems, loadNetWorthTransactions } from '../../services/storageService'
import { fetchHyperliquidPerpetualsData } from '../../services/hyperliquidService'

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
 * Fetch transactions for a user from Firestore
 * This is the ONLY place that should fetch transactions
 */
async function fetchTransactionsForUid(uid: string): Promise<NetWorthTransaction[]> {
  return await loadNetWorthTransactions<NetWorthTransaction>([], uid)
}

/**
 * Fetch items for a user from Firestore and merge perpetuals data if needed
 * This is the ONLY place that should fetch items
 */
async function fetchItemsForUid(uid: string): Promise<NetWorthItem[]> {
  const items = await loadNetWorthItems<NetWorthItem>([], uid)
  
  // Fetch perpetuals data if there's a Perpetuals item
  const perpetualsItem = items.find(item => item.category === 'Perpetuals')
  if (perpetualsItem) {
    try {
      // Fetch Hyperliquid data (Kraken handled in DataContext via WebSocket)
      const hyperliquidData = await fetchHyperliquidPerpetualsData(uid).catch(() => null)

      // Merge perpetuals data
      if (hyperliquidData) {
        const mergedData = {
          openPositions: [
            ...(hyperliquidData?.openPositions || []),
          ],
          openOrders: [
            ...(hyperliquidData?.openOrders || []),
          ],
        }

        // Update the perpetuals item with merged data
        return items.map(item => {
          if (item.category === 'Perpetuals') {
            return {
              ...item,
              perpetualsData: mergedData,
            }
          }
          return item
        })
      }
    } catch (error) {
      console.error('[NetWorthService] Error fetching perpetuals data:', error)
      // Continue without perpetuals data - will be calculated as 0
    }
  }

  return items
}

/**
 * Get net worth summary for a user
 * 
 * This is the MAIN entry point for getting net worth summaries.
 * It handles:
 * - Caching with 5-minute TTL
 * - Fetching transactions and items
 * - Computing summary using the pure compute function
 * 
 * @param uid - User ID
 * @param baseCurrency - Base currency (default: CHF)
 * @param options - Optional compute options (prices, rates, etc.)
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
    // Return cached summary
    return cached.summary
  }

  // Cache miss or expired - fetch and compute
  console.log(`[NetWorthService] Cache miss for ${uid}, fetching fresh data...`)

  // Fetch transactions and items in parallel
  const [transactions, items] = await Promise.all([
    fetchTransactionsForUid(uid),
    fetchItemsForUid(uid),
  ])

  // Merge options with defaults
  const computeOptions: ComputeOptions = {
    baseCurrency,
    cryptoPrices: options?.cryptoPrices || {},
    stockPrices: options?.stockPrices || {},
    usdToChfRate: options?.usdToChfRate ?? null,
    convert: options?.convert,
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
 * Call this when transactions or items change
 */
export function invalidateNetWorthCache(uid: string, baseCurrency: CurrencyCode = 'CHF'): void {
  const cacheKey = getCacheKey(uid, baseCurrency)
  cache.delete(cacheKey)
  console.log(`[NetWorthService] Cache invalidated for ${uid}`)
}

/**
 * Invalidate cache for all currencies for a user
 */
export function invalidateNetWorthCacheForUser(uid: string): void {
  const keysToDelete: string[] = []
  cache.forEach((_, key) => {
    if (key.startsWith(`${uid}:`)) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach(key => cache.delete(key))
  console.log(`[NetWorthService] Cache invalidated for all currencies for ${uid}`)
}

/**
 * Warm cache for a user (pre-fetch)
 * Useful for pre-loading data
 */
export async function warmNetWorthCache(
  uid: string,
  baseCurrency: CurrencyCode = 'CHF',
  options?: Partial<ComputeOptions>
): Promise<NetWorthSummary> {
  return await getNetWorthSummary(uid, baseCurrency, options)
}

/**
 * Get cache stats (for debugging)
 */
export function getCacheStats(): {
  size: number
  entries: Array<{ key: string; ageMs: number; isValid: boolean }>
} {
  const entries: Array<{ key: string; ageMs: number; isValid: boolean }> = []
  
  cache.forEach((entry, key) => {
    const ageMs = Date.now() - entry.fetchedAtMs
    entries.push({
      key,
      ageMs,
      isValid: isCacheValid(entry),
    })
  })

  return {
    size: cache.size,
    entries,
  }
}
