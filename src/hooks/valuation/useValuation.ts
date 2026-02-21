/**
 * useValuation Hook
 * 
 * Re-exports from ValuationProvider for consistency.
 */

import { 
  useValuation as useValuationProvider,
  useTotalNetWorth as useTotalNetWorthProvider,
  useCategoryTotals as useCategoryTotalsProvider,
} from '../../providers/ValuationProvider'

export { 
  useValuationProvider as useValuation,
  useTotalNetWorthProvider as useTotalNetWorth,
  useCategoryTotalsProvider as useCategoryTotals,
}
