/**
 * usePricesBatch Hook
 * 
 * Hook for fetching multiple prices in a batch (recommended approach).
 * Market prices come from daily Firestore cache - no API key required.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CurrencyCode } from '../../lib/currency'
import { getCryptoPrices, getMarketPrices, getFxRates } from '../../services/market-data'
import type { FxRateSnapshot } from '../../services/market-data/types'

interface UsePricesBatchOptions {
  /** Crypto tickers to fetch */
  cryptoSymbols?: string[]
  /** Market tickers to fetch (stocks, ETFs, commodities) */
  marketSymbols?: string[]
  /** Base currency for FX rates */
  baseCurrency?: CurrencyCode
  /** Whether to auto-fetch on mount */
  autoFetch?: boolean
  /** Refresh interval in ms (0 to disable) */
  refreshIntervalMs?: number
}

interface UsePricesBatchResult {
  /** Crypto prices (symbol -> USD price) */
  cryptoPrices: Record<string, number>
  /** Market prices (symbol -> USD price) */
  marketPrices: Record<string, number>
  /** FX rates snapshot */
  fxRates: FxRateSnapshot | null
  /** USD to CHF rate (convenience) */
  usdToChfRate: number | null
  /** Loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
  /** Last fetch timestamp */
  lastFetchTimestamp: number | null
  /** Fetch all prices */
  fetch: () => Promise<void>
  /** Refresh (invalidate cache and fetch) */
  refresh: () => Promise<void>
}

/**
 * Hook for fetching multiple prices in a batch
 * This is the recommended hook for pages that need multiple prices.
 * Market prices come from daily Firestore cache - no API key required.
 */
export function usePricesBatch({
  cryptoSymbols = [],
  marketSymbols = [],
  baseCurrency = 'CHF',
  autoFetch = true,
  refreshIntervalMs = 0,
}: UsePricesBatchOptions = {}): UsePricesBatchResult {
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({})
  const [fxRates, setFxRates] = useState<FxRateSnapshot | null>(null)
  const [usdToChfRate, setUsdToChfRate] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState<number | null>(null)
  
  // Track previous symbols to detect changes
  const prevCryptoSymbolsRef = useRef<string[]>([])
  const prevMarketSymbolsRef = useRef<string[]>([])
  
  const fetch = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Deduplicate and normalize symbols
      const uniqueCrypto = [...new Set(cryptoSymbols.map(s => s.toUpperCase()))]
      const uniqueMarket = [...new Set(marketSymbols.map(s => s.toUpperCase()))]
      
      // Fetch all in parallel - market prices come from daily Firestore cache
      const [cryptoResult, marketResult, fxSnapshot] = await Promise.all([
        uniqueCrypto.length > 0 
          ? getCryptoPrices(uniqueCrypto) 
          : Promise.resolve({ prices: {}, timestamp: Date.now(), source: 'cache' as const }),
        uniqueMarket.length > 0 
          ? getMarketPrices(uniqueMarket) 
          : Promise.resolve({ prices: {}, timestamp: Date.now(), source: 'cache' as const }),
        getFxRates(baseCurrency),
      ])
      
      // Calculate USD to CHF rate
      const usdRate = fxSnapshot.rates['USD']
      const calculatedUsdToChfRate = usdRate ? 1 / usdRate : null
      
      setCryptoPrices(prev => ({ ...prev, ...cryptoResult.prices }))
      setMarketPrices(prev => ({ ...prev, ...marketResult.prices }))
      setFxRates(fxSnapshot)
      setUsdToChfRate(calculatedUsdToChfRate)
      setLastFetchTimestamp(Date.now())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch prices'
      setError(message)
      console.error('[usePricesBatch] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [cryptoSymbols, marketSymbols, baseCurrency])
  
  const refresh = useCallback(async (): Promise<void> => {
    // For refresh, we could invalidate cache first
    // But the cache handles TTL automatically, so just fetch
    await fetch()
  }, [fetch])
  
  // Auto-fetch on mount and when symbols change
  useEffect(() => {
    if (!autoFetch) return
    
    // Check if symbols actually changed (not just reference)
    const cryptoChanged = JSON.stringify(cryptoSymbols.sort()) !== JSON.stringify(prevCryptoSymbolsRef.current.sort())
    const marketChanged = JSON.stringify(marketSymbols.sort()) !== JSON.stringify(prevMarketSymbolsRef.current.sort())
    
    if (cryptoChanged || marketChanged || lastFetchTimestamp === null) {
      prevCryptoSymbolsRef.current = [...cryptoSymbols]
      prevMarketSymbolsRef.current = [...marketSymbols]
      fetch()
    }
  }, [cryptoSymbols, marketSymbols, autoFetch, fetch, lastFetchTimestamp])
  
  // Auto-refresh interval
  useEffect(() => {
    if (refreshIntervalMs <= 0) return
    
    const intervalId = setInterval(() => {
      refresh()
    }, refreshIntervalMs)
    
    return () => clearInterval(intervalId)
  }, [refresh, refreshIntervalMs])
  
  return {
    cryptoPrices,
    marketPrices,
    fxRates,
    usdToChfRate,
    isLoading,
    error,
    lastFetchTimestamp,
    fetch,
    refresh,
  }
}
