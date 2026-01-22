/**
 * Hook for fetching FX rates
 */

import { useState, useEffect } from 'react'
import type { CurrencyCode } from '../../lib/currency'
import type { FxRate } from '../../services/market-data/types'
import { getRate } from '../../services/market-data/FxRateService'

export function useFxRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  date: string = 'latest'
): {
  rate: FxRate | null
  isLoading: boolean
  error: Error | null
} {
  const [rate, setRate] = useState<FxRate | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchRate = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await getRate(base, quote, date)
        if (!cancelled) {
          setRate(result)
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err))
          setError(error)
          console.error('[useFxRate] Error fetching rate:', error)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchRate()

    return () => {
      cancelled = true
    }
  }, [base, quote, date])

  return { rate, isLoading, error }
}
