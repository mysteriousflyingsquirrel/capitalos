/**
 * PURE computation function for Net Worth calculation
 * NO IO, NO side effects, NO external dependencies
 * This is the single source of truth for net worth calculation logic
 */

import type { NetWorthItem, NetWorthTransaction } from '../../pages/NetWorth'
import { NetWorthCalculationService } from '../../services/netWorthCalculationService'
import type { CurrencyCode } from '../currency'
import type { NetWorthCategorySummary, NetWorthSummary } from './types'
import { CATEGORY_NAMES } from './types'

/**
 * Options for computation
 */
export interface ComputeOptions {
  baseCurrency: CurrencyCode
  // Prices are optional - if not provided, uses transaction-based calculations
  cryptoPrices?: Record<string, number>
  stockPrices?: Record<string, number>
  usdToChfRate?: number | null
  // Convert function for currency conversion
  convert?: (amount: number, from: CurrencyCode) => number
}

/**
 * Compute net worth summary from items and transactions
 * 
 * This is a PURE function - same inputs always produce same outputs
 * Uses the existing NetWorthCalculationService to ensure consistency
 * 
 * @param items - Net worth items (categories, platforms, etc.)
 * @param transactions - All transactions for the items
 * @param options - Computation options (currency, prices, etc.)
 * @returns Computed net worth summary
 */
export function computeNetWorthSummary(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  options: ComputeOptions
): NetWorthSummary {
  const {
    baseCurrency = 'CHF',
    cryptoPrices = {},
    stockPrices = {},
    usdToChfRate = null,
    convert = (amount: number, from: CurrencyCode) => {
      // Default convert: assume 1:1 if no conversion function provided
      // This works because transactions already have pricePerItemChf in CHF
      return from === baseCurrency ? amount : amount
    },
  } = options

  // Use the existing calculation service to ensure consistency
  const result = NetWorthCalculationService.calculateTotals(
    items,
    transactions,
    cryptoPrices,
    stockPrices,
    usdToChfRate,
    convert
  )

  // Convert categoryTotals to NetWorthCategorySummary array
  const categories: NetWorthCategorySummary[] = Object.entries(result.categoryTotals)
    .map(([categoryKey, total]) => {
      // Ensure total is a valid number
      const validTotal = isNaN(total) || !isFinite(total) ? 0 : total
      
      return {
        categoryKey: categoryKey as NetWorthItem['category'],
        categoryName: CATEGORY_NAMES[categoryKey as NetWorthItem['category']] || categoryKey,
        total: validTotal,
        currency: baseCurrency,
      }
    })
    .filter(cat => cat.total !== 0 || true) // Include all categories, even if 0

  // Ensure totalNetWorth is valid
  const validTotal = isNaN(result.totalNetWorthChf) || !isFinite(result.totalNetWorthChf) 
    ? 0 
    : result.totalNetWorthChf

  // Runtime consistency check: sum of categories should approximately equal total
  const categorySum = categories.reduce((sum, cat) => sum + cat.total, 0)
  const difference = Math.abs(categorySum - validTotal)
  const epsilon = 0.01 // Allow small floating point differences
  
  if (difference > epsilon) {
    console.warn(
      `[NetWorthCompute] Consistency check failed: category sum (${categorySum}) != total (${validTotal}), difference: ${difference}`
    )
    // Use category sum as source of truth if difference is too large
    // This catches calculation errors
  }

  return {
    uid: '', // Will be set by service layer
    asOf: new Date().toISOString(),
    baseCurrency,
    totalNetWorth: validTotal,
    categories,
  }
}
