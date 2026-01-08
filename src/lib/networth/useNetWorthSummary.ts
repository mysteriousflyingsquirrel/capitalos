/**
 * React hook for Net Worth Summary
 * Uses the global service directly (client-side) with automatic refresh every 5 minutes
 * Implements deduplication and caching behavior
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { NetWorthSummary } from './types'
import { getNetWorthSummary, invalidateNetWorthCacheForUser } from './netWorthService'
import type { CurrencyCode } from '../currency'

interface UseNetWorthSummaryOptions {
  uid: string | null
  baseCurrency?: CurrencyCode
  refreshInterval?: number // Default: 5 minutes
  dedupingInterval?: number // Default: 1 minute
  enabled?: boolean // Default: true
  // Optional: provide prices/rates for real-time calculations
  cryptoPrices?: Record<string, number>
  stockPrices?: Record<string, number>
  usdToChfRate?: number | null
  convert?: (amount: number, from: CurrencyCode) => number
}

interface UseNetWorthSummaryResult {
  summary: NetWorthSummary | null
  isLoading: boolean
  error: Error | null
  mutate: () => Promise<void> // Manual refresh
}

/**
 * Custom hook for fetching net worth summary
 * 
 * Uses the global service directly (client-side) which:
 * - Fetches transactions and items from Firestore
 * - Fetches perpetuals data if available
 * - Uses 5-minute cache
 * - Supports optional prices/rates for real-time calculations
 * 
 * Features:
 * - Automatic refresh every 5 minutes
 * - Deduplication (prevents multiple simultaneous requests)
 * - Loading and error states
 * - Manual refresh via mutate()
 */
export function useNetWorthSummary(options: UseNetWorthSummaryOptions): UseNetWorthSummaryResult {
  const {
    uid,
    baseCurrency = 'CHF',
    refreshInterval = 5 * 60 * 1000, // 5 minutes
    dedupingInterval = 60 * 1000, // 1 minute
    enabled = true,
    cryptoPrices,
    stockPrices,
    usdToChfRate,
    convert,
  } = options

  const [summary, setSummary] = useState<NetWorthSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Track last fetch time for deduplication
  const lastFetchTimeRef = useRef<number>(0)
  // Track ongoing request to prevent duplicates
  const ongoingRequestRef = useRef<Promise<void> | null>(null)

  /**
   * Fetch summary from service
   */
  const fetchSummary = useCallback(async (force = false): Promise<void> => {
    if (!uid || !enabled) {
      setIsLoading(false)
      return
    }

    // Deduplication: skip if recently fetched
    const now = Date.now()
    const timeSinceLastFetch = now - lastFetchTimeRef.current
    if (!force && timeSinceLastFetch < dedupingInterval) {
      return
    }

    // If there's an ongoing request, wait for it
    if (ongoingRequestRef.current) {
      await ongoingRequestRef.current
      return
    }

    // Create fetch promise
    const fetchPromise = (async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Use the global service - it handles caching internally
        // Pass optional prices/rates if provided
        const data = await getNetWorthSummary(uid, baseCurrency, {
          cryptoPrices,
          stockPrices,
          usdToChfRate,
          convert,
        })

        setSummary(data)
        lastFetchTimeRef.current = Date.now()
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        console.error('[useNetWorthSummary] Error fetching summary:', error)
      } finally {
        setIsLoading(false)
        ongoingRequestRef.current = null
      }
    })()

    ongoingRequestRef.current = fetchPromise
    await fetchPromise
  }, [uid, baseCurrency, dedupingInterval, enabled, cryptoPrices, stockPrices, usdToChfRate, convert])

  /**
   * Manual refresh function
   */
  const mutate = useCallback(async (): Promise<void> => {
    await fetchSummary(true)
  }, [fetchSummary])

  // Initial fetch
  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Set up auto-refresh interval
  useEffect(() => {
    if (!uid || !enabled) return

    const intervalId = setInterval(() => {
      fetchSummary()
    }, refreshInterval)

    return () => clearInterval(intervalId)
  }, [uid, enabled, refreshInterval, fetchSummary])

  return {
    summary,
    isLoading,
    error,
    mutate,
  }
}
