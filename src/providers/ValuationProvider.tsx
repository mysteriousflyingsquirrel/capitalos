/**
 * Valuation Provider
 * Provides valuation results to all pages (SSOT for net worth calculations)
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { ValuationResult } from '../services/valuation/types'
import { computeValuation } from '../services/valuation/ValuationEngine'
import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import type { CurrencyCode } from '../lib/currency'
import { useData } from '../contexts/DataContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useMarketData } from './MarketDataProvider'

interface ValuationContextValue {
  /** Current valuation result (null if not yet computed) */
  valuation: ValuationResult | null
  /** Whether valuation is being computed */
  isLoading: boolean
  /** Error if valuation computation failed */
  error: Error | null
  /** Manually trigger a recomputation */
  recompute: () => void
}

const ValuationContext = createContext<ValuationContextValue | undefined>(undefined)

interface ValuationProviderProps {
  children: React.ReactNode
}

export function ValuationProvider({ children }: ValuationProviderProps) {
  const [valuation, setValuation] = useState<ValuationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const { data } = useData()
  const { baseCurrency } = useCurrency()
  const { lastRefresh } = useMarketData()

  const netWorthItems = data.netWorthItems
  const transactions = data.transactions

  // Compute valuation
  const compute = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await computeValuation(netWorthItems, transactions, {
        baseCurrency: 'CHF',
        displayCurrency: baseCurrency,
      })

      setValuation(result)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      console.error('[ValuationProvider] Failed to compute valuation:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Recompute when dependencies change
  useEffect(() => {
    compute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    netWorthItems,
    transactions,
    baseCurrency,
    lastRefresh,
  ])

  const value: ValuationContextValue = {
    valuation,
    isLoading,
    error,
    recompute: compute,
  }

  return <ValuationContext.Provider value={value}>{children}</ValuationContext.Provider>
}

export function useValuation(): ValuationContextValue {
  const context = useContext(ValuationContext)
  if (!context) {
    throw new Error('useValuation must be used within a ValuationProvider')
  }
  return context
}
