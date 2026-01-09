/**
 * Net Worth Summary Service
 * 
 * Converts calculation results to NetWorthSummary format
 * and provides utilities for saving/loading summaries.
 */

import type { NetWorthCalculationResult } from '../../services/netWorthCalculationService'
import type { NetWorthSummary, NetWorthCategorySummary } from './types'
import { CATEGORY_NAMES } from './types'
import type { NetWorthCategory } from '../../pages/NetWorth'

/**
 * Convert NetWorthCalculationResult to NetWorthSummary
 * 
 * @param calculationResult - Result from NetWorthCalculationService
 * @param uid - User ID
 * @param baseCurrency - Base currency (default: CHF)
 * @returns NetWorthSummary ready to save
 */
export function calculationResultToSummary(
  calculationResult: NetWorthCalculationResult,
  uid: string,
  baseCurrency: string = 'CHF'
): NetWorthSummary {
  // Convert categoryTotals to NetWorthCategorySummary array
  const categories: NetWorthCategorySummary[] = Object.entries(calculationResult.categoryTotals)
    .map(([categoryKey, total]) => {
      // Ensure total is a valid number
      const validTotal = isNaN(total) || !isFinite(total) ? 0 : total
      
      return {
        categoryKey: categoryKey as NetWorthCategory,
        categoryName: CATEGORY_NAMES[categoryKey as NetWorthCategory] || categoryKey,
        total: validTotal,
        currency: baseCurrency,
      }
    })
    .filter(cat => cat.total !== 0 || true) // Include all categories, even if 0

  // Ensure totalNetWorth is valid
  const validTotal = isNaN(calculationResult.totalNetWorthChf) || !isFinite(calculationResult.totalNetWorthChf) 
    ? 0 
    : calculationResult.totalNetWorthChf

  return {
    uid,
    asOf: new Date().toISOString(),
    baseCurrency,
    totalNetWorth: validTotal,
    categories,
  }
}
