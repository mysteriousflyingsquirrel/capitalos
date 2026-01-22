/**
 * Valuation SSOT Types
 */

import type { CurrencyCode } from '../../lib/currency'
import type { NetWorthCategory } from '../../pages/NetWorth'

/**
 * FX snapshot used during valuation
 */
export interface FxSnapshot {
  base: CurrencyCode
  quotes: Record<CurrencyCode, number>
  timestamp: number
}

/**
 * Price quotes snapshot used during valuation
 */
export interface PriceQuotesSnapshot {
  crypto: Record<string, number> // symbol -> USD price
  market: Record<string, number> // symbol -> USD price (stocks/ETFs/commodities)
  timestamp: number
}

/**
 * Individual item valuation
 */
export interface ItemValuation {
  itemId: string
  category: NetWorthCategory
  name: string
  valueInBaseCurrency: number
  valueInDisplayCurrency: number
  holdings?: number // For crypto, stocks, etc.
  currentPrice?: number // In USD or base currency
}

/**
 * Category totals
 */
export type CategoryTotals = Record<NetWorthCategory, number>

/**
 * Valuation result (the SSOT for all net worth calculations)
 */
export interface ValuationResult {
  /** Timestamp when this valuation was computed */
  asOf: number

  /** Base currency (typically CHF, the currency in which items are stored) */
  baseCurrency: CurrencyCode

  /** Display currency (what the user wants to see) */
  displayCurrency: CurrencyCode

  /** FX snapshot used for this valuation */
  fxSnapshot: FxSnapshot

  /** Price quotes snapshot used for this valuation */
  quotesSnapshot: PriceQuotesSnapshot

  /** Individual item valuations */
  itemValuations: ItemValuation[]

  /** Category totals in display currency */
  categoryTotals: CategoryTotals

  /** Total net worth in display currency */
  total: number

  /** Total net worth in base currency (CHF) */
  totalInBaseCurrency: number
}
