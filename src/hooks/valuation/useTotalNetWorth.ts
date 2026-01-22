/**
 * Hook for getting total net worth from valuation
 */

import { useMemo } from 'react'
import { useValuation } from '../../providers/ValuationProvider'

export function useTotalNetWorth(): {
  total: number
  totalInBaseCurrency: number
  isLoading: boolean
  error: Error | null
} {
  const { valuation, isLoading, error } = useValuation()

  const total = useMemo(() => {
    return valuation?.total || 0
  }, [valuation])

  const totalInBaseCurrency = useMemo(() => {
    return valuation?.totalInBaseCurrency || 0
  }, [valuation])

  return { total, totalInBaseCurrency, isLoading, error }
}
