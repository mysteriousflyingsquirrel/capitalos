/**
 * Market Data Provider
 * Provides market data services and refresh mechanism
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { marketDataCache } from '../services/market-data/MarketDataCache'

interface MarketDataContextValue {
  /** Trigger a manual refresh of market data */
  refresh: () => void
  /** Timestamp of last refresh */
  lastRefresh: number
  /** Whether a refresh is in progress */
  isRefreshing: boolean
}

const MarketDataContext = createContext<MarketDataContextValue | undefined>(undefined)

interface MarketDataProviderProps {
  children: React.ReactNode
  /** Auto-refresh interval in milliseconds (default: 5 minutes) */
  refreshIntervalMs?: number
}

export function MarketDataProvider({
  children,
  refreshIntervalMs = 5 * 60 * 1000, // 5 minutes
}: MarketDataProviderProps) {
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refresh = () => {
    setIsRefreshing(true)
    // Clear expired entries from cache
    marketDataCache.clearExpired()
    setLastRefresh(Date.now())
    setIsRefreshing(false)
  }

  // Auto-refresh on interval
  useEffect(() => {
    const interval = setInterval(() => {
      refresh()
    }, refreshIntervalMs)

    return () => clearInterval(interval)
  }, [refreshIntervalMs])

  const value: MarketDataContextValue = {
    refresh,
    lastRefresh,
    isRefreshing,
  }

  return <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>
}

export function useMarketData(): MarketDataContextValue {
  const context = useContext(MarketDataContext)
  if (!context) {
    throw new Error('useMarketData must be used within a MarketDataProvider')
  }
  return context
}
