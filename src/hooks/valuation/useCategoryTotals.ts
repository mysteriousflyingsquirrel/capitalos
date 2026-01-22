/**
 * Hook for getting category totals from valuation
 */

import { useMemo } from 'react'
import { useValuation } from '../../providers/ValuationProvider'
import type { CategoryTotals } from '../../services/valuation/types'

export function useCategoryTotals(): {
  categoryTotals: CategoryTotals | null
  isLoading: boolean
  error: Error | null
} {
  const { valuation, isLoading, error } = useValuation()

  const categoryTotals = useMemo(() => {
    return valuation?.categoryTotals || null
  }, [valuation])

  return { categoryTotals, isLoading, error }
}
