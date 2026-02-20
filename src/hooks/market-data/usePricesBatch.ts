/**
 * usePricesBatch Hook
 * 
 * Hook for fetching multiple prices in a batch (recommended approach).
 * Market prices come from daily Firestore cache - no API key required.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CurrencyCode } from '../../lib/currency'
import { getPricesMap as getCryptoPricesMap, getMarketPrices, getRates } from '../../services/market-data'
import type { FxRate } from '../../services/market-data/types'

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

interface FxRatesResult {
  rates: Record<string, number>
  timestamp: number
}

interface UsePricesBatchResult {
  cryptoPrices: Record<string, number>
  marketPrices: Record<string, number>
  fxRates: FxRatesResult | null
  usdToChfRate: number | null
  isLoading: boolean
  error: string | null
  lastFetchTimestamp: number | null
  fetch: () => Promise<void>
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
  const [fxRates, setFxRates] = useState<FxRatesResult | null>(null)
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
      
      const [cryptoResult, marketResult, fxRatesList] = await Promise.all([
        uniqueCrypto.length > 0
          ? getCryptoPricesMap(uniqueCrypto)
          : Promise.resolve({} as Record<string, number>),
        uniqueMarket.length > 0
          ? getMarketPrices(uniqueMarket)
          : Promise.resolve({ prices: {} as Record<string, number>, timestamp: Date.now(), source: 'cache' }),
        getRates(baseCurrency, ['USD', 'EUR', 'GBP']),
      ])

      const ratesMap: Record<string, number> = {}
      for (const r of fxRatesList) {
        ratesMap[r.quote] = r.rate
      }
      const fxSnapshot: FxRatesResult = { rates: ratesMap, timestamp: Date.now() }

      const usdRate = ratesMap['USD']
      const calculatedUsdToChfRate = usdRate ? 1 / usdRate : null

      setCryptoPrices(prev => ({ ...prev, ...cryptoResult }))
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
