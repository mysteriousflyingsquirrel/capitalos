/**
 * Core types for Net Worth calculation system
 * Single source of truth for net worth data structures
 */

import type { NetWorthCategory } from '../../pages/NetWorth'

/**
 * Category summary with calculated total
 */
export interface NetWorthCategorySummary {
  categoryKey: NetWorthCategory
  categoryName: string
  total: number
  currency: string
}

/**
 * Complete net worth summary
 * This is the single source of truth for calculated net worth values
 */
export interface NetWorthSummary {
  uid: string
  asOf: string // ISO timestamp
  baseCurrency: string
  totalNetWorth: number
  categories: NetWorthCategorySummary[]
}

/**
 * Category name mapping for display
 */
export const CATEGORY_NAMES: Record<NetWorthCategory, string> = {
  'Cash': 'Cash',
  'Bank Accounts': 'Bank Accounts',
  'Retirement Funds': 'Retirement Funds',
  'Index Funds': 'Index Funds',
  'Stocks': 'Stocks',
  'Commodities': 'Commodities',
  'Crypto': 'Crypto',
  'Perpetuals': 'Perpetuals',
  'Real Estate': 'Real Estate',
  'Depreciating Assets': 'Depreciating Assets',
}

/**
 * Default category order
 */
export const CATEGORY_ORDER: NetWorthCategory[] = [
  'Cash',
  'Bank Accounts',
  'Retirement Funds',
  'Index Funds',
  'Stocks',
  'Commodities',
  'Crypto',
  'Perpetuals',
  'Real Estate',
  'Depreciating Assets',
]
