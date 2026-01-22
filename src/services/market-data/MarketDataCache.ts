/**
 * Market Data Cache with TTL and Inflight Request Deduplication
 */

import type { CacheEntry, InflightRequest } from './types'

class MarketDataCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private inflightRequests: Map<string, InflightRequest<any>> = new Map()
  private defaultTtlMs: number = 10 * 60 * 1000 // 10 minutes default

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now >= entry.expiresAt) {
      // Expired, remove from cache
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs
    const expiresAt = Date.now() + ttl

    this.cache.set(key, {
      data,
      expiresAt,
    })

    // Log cache set for debugging
    if (import.meta.env.DEV) {
      console.log(`[MarketDataCache] SET ${key} (TTL: ${ttl}ms)`)
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    const now = Date.now()
    if (now >= entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.inflightRequests.clear()
  }

  /**
   * Get or create an inflight request
   * Ensures only one network request is made for concurrent calls with the same key
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    // 1. Check cache first
    const cached = this.get<T>(key)
    if (cached !== null) {
      if (import.meta.env.DEV) {
        console.log(`[MarketDataCache] CACHE HIT: ${key}`)
      }
      return cached
    }

    // 2. Check if there's an inflight request for this key
    const inflight = this.inflightRequests.get(key)
    if (inflight) {
      if (import.meta.env.DEV) {
        console.log(`[MarketDataCache] INFLIGHT DEDUP: ${key}`)
      }
      return inflight.promise as Promise<T>
    }

    // 3. Create new inflight request
    if (import.meta.env.DEV) {
      console.log(`[MarketDataCache] NETWORK CALL: ${key}`)
    }

    const promise = fetcher().then(
      (data) => {
        // Success: cache the result
        this.set(key, data, ttlMs)
        this.inflightRequests.delete(key)
        return data
      },
      (error) => {
        // Error: remove inflight tracker
        this.inflightRequests.delete(key)
        throw error
      }
    )

    this.inflightRequests.set(key, {
      promise,
      timestamp: Date.now(),
    })

    return promise
  }

  /**
   * Clear expired entries (cleanup)
   */
  clearExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      inflightRequests: this.inflightRequests.size,
    }
  }
}

// Export singleton instance
export const marketDataCache = new MarketDataCache()
