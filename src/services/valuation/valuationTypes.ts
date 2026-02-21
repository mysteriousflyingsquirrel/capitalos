/**
 * Valuation Engine Types
 * Canonical types for portfolio valuation
 */

import type { CurrencyCode } from '../../lib/currency'
import type { FxSnapshot } from './types'

// ============================================================================
// Net Worth Category Types (from existing codebase)
// ============================================================================

export type NetWorthCategory =
  | 'Cash'
  | 'Bank Accounts'
  | 'Retirement Funds'
  | 'Index Funds'
  | 'Stocks'
  | 'Commodities'
  | 'Crypto'
  | 'Perpetuals'
  | 'Real Estate'
  | 'Depreciating Assets'

// All supported categories
export const ALL_CATEGORIES: NetWorthCategory[] = [
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

// ============================================================================
// Item Valuation Types
// ============================================================================

export interface ItemValuation {
  /** Item ID */
  itemId: string
  /** Item name (ticker or descriptive name) */
  name: string
  /** Category */
  category: NetWorthCategory
  /** Quantity/Holdings */
  quantity: number
  /** Price per unit in USD (for priced assets) */
  priceUsd?: number
  /** Value in base currency (CHF) */
  valueBaseCurrency: number
  /** Value in display currency */
  valueDisplayCurrency: number
  /** Currency of original value (before conversion) */
  originalCurrency: CurrencyCode
  /** Cost basis in base currency (if available) */
  costBasis?: number
  /** Unrealized P&L (if available) */
  unrealizedPnl?: number
  /** Price source */
  priceSource?: 'cryptocompare' | 'yahoo' | 'transaction' | 'manual'
}

// ============================================================================
// Category Total Types
// ============================================================================

export interface CategoryTotal {
  /** Category name */
  category: NetWorthCategory
  /** Total value in base currency (CHF) */
  totalBaseCurrency: number
  /** Total value in display currency */
  totalDisplayCurrency: number
  /** Number of items in category */
  itemCount: number
  /** Percentage of total net worth */
  percentageOfTotal: number
}

// ============================================================================
// Quote Snapshot Types
// ============================================================================

export interface QuotesUsed {
  /** Crypto prices used (ticker -> USD price) */
  cryptoPrices: Record<string, number>
  /** Market prices used (ticker -> USD price) */
  marketPrices: Record<string, number>
  /** USD to CHF rate used */
  usdToChfRate: number | null
  /** Timestamp when quotes were fetched */
  timestamp: number
  /** Sources used */
  sources: {
    crypto: 'cryptocompare' | 'cache'
    market: 'yahoo' | 'cache'
    fx: 'exchange-api-jsdelivr' | 'exchange-api-pages-dev' | 'cache' | 'fallback'
  }
}

// ============================================================================
// Valuation Result Types
// ============================================================================

export interface ValuationResult {
  /** Timestamp when valuation was computed */
  asOf: number
  /** Base currency (internal calculation currency, always CHF) */
  baseCurrency: CurrencyCode
  /** Display currency (user's preferred currency) */
  displayCurrency: CurrencyCode
  /** FX snapshot used for this valuation */
  fxSnapshotUsed: FxSnapshot
  /** Quotes used for this valuation */
  quotesUsed: QuotesUsed
  /** Individual item valuations */
  itemValuations: ItemValuation[]
  /** Category totals */
  categoryTotals: Record<NetWorthCategory, CategoryTotal>
  /** Total net worth in base currency (CHF) */
  totalBaseCurrency: number
  /** Total net worth in display currency */
  totalDisplayCurrency: number
}

// ============================================================================
// Valuation Input Types
// ============================================================================

/**
 * Input options for valuation computation
 */
export interface ValuationOptions {
  /** Display currency (user's preferred currency) */
  displayCurrency?: CurrencyCode
  /** Pre-fetched crypto prices (optional, will fetch if not provided) */
  cryptoPrices?: Record<string, number>
  /** Pre-fetched market prices (optional, will fetch if not provided) */
  marketPrices?: Record<string, number>
  /** Pre-fetched FX rates (optional, will fetch if not provided) */
  fxRates?: FxSnapshot
  /** USD to CHF rate (optional, will use from fxRates or fetch) */
  usdToChfRate?: number | null
  /** @deprecated Market prices are fetched via Yahoo Finance proxy, no key needed client-side */
  rapidApiKey?: string | null
  /** Convert function (from CurrencyContext) */
  convert?: (amount: number, from: CurrencyCode) => number
}

// ============================================================================
// Snapshot Types (for persistence)
// ============================================================================

export interface ValuationSnapshot {
  /** Date in YYYY-MM-DD format */
  date: string
  /** Unix timestamp in milliseconds */
  timestamp: number
  /** Category totals (category name -> value in CHF) */
  categories: Record<NetWorthCategory, number>
  /** Total net worth in CHF */
  total: number
  /** Display currency at time of snapshot */
  displayCurrency?: CurrencyCode
  /** FX rates used */
  fxRatesUsed?: {
    base: CurrencyCode
    usdRate: number
    eurRate: number
    timestamp: number
    source: string
  }
  /** Price sources used */
  priceSourcesUsed?: {
    crypto: string
    market: string
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Create empty category totals record
 */
export function createEmptyCategoryTotals(): Record<NetWorthCategory, CategoryTotal> {
  const totals: Record<NetWorthCategory, CategoryTotal> = {} as Record<NetWorthCategory, CategoryTotal>
  
  for (const category of ALL_CATEGORIES) {
    totals[category] = {
      category,
      totalBaseCurrency: 0,
      totalDisplayCurrency: 0,
      itemCount: 0,
      percentageOfTotal: 0,
    }
  }
  
  return totals
}

/**
 * Create empty quotes used record
 */
export function createEmptyQuotesUsed(): QuotesUsed {
  return {
    cryptoPrices: {},
    marketPrices: {},
    usdToChfRate: null,
    timestamp: Date.now(),
    sources: {
      crypto: 'cache',
      market: 'cache',
      fx: 'cache',
    },
  }
}
