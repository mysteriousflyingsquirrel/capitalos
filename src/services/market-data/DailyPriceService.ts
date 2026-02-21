/**
 * Daily Price Service (SSOT)
 *
 * Fetches stock/ETF/commodity prices from Yahoo Finance via a Vercel API proxy.
 * Prices are fetched on every app open/refresh — no Firestore caching.
 */

import { apiPost } from '../../lib/apiClient'

// ============================================================================
// Types
// ============================================================================

export interface DailyPriceResult {
  price: number
  currency: string | null
  marketTime: number | null
  isStale: boolean
  asOfDate: string
}

// ============================================================================
// Utility Functions
// ============================================================================

function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Normalize symbol key — trim, uppercase, collapse spaces.
 * Keeps exchange suffixes (VWCE.DE, ZSIL.SW, BRK-B).
 */
export function normalizeSymbolKey(symbolRaw: string): string {
  return symbolRaw.trim().toUpperCase().replace(/\s+/g, ' ')
}

// ============================================================================
// API
// ============================================================================

interface ApiUpdateResponse {
  success: boolean
  prices: Record<string, { price: number; currency: string | null; marketTime: number | null }>
  fetched?: string[]
  missing?: string[]
  source: string
  warning?: string
  error?: string
}

async function fetchPricesFromApi(
  symbols: string[]
): Promise<ApiUpdateResponse | null> {
  if (symbols.length === 0) return null

  try {
    const response = await apiPost('/api/market/update-daily-prices', { symbols })

    if (!response.ok) {
      console.error(`[DailyPriceService] API returned ${response.status}`)
      return null
    }

    const data: ApiUpdateResponse = await response.json()

    if (import.meta.env.DEV) {
      console.log('[DailyPriceService] API response:', {
        fetched: data.fetched?.length || 0,
        missing: data.missing?.length || 0,
        source: data.source,
        warning: data.warning,
      })
    }

    return data
  } catch (err) {
    console.error('[DailyPriceService] Error calling API:', err)
    return null
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get daily prices for a list of symbols.
 * Calls the Yahoo Finance proxy API directly — no caching.
 */
export async function getDailyPrices(
  symbolsRaw: string[],
  _opts?: { forceRefresh?: boolean; uid?: string }
): Promise<Record<string, DailyPriceResult>> {
  if (symbolsRaw.length === 0) return {}

  const today = getUtcDateKey()
  const symbolKeys = [...new Set(symbolsRaw.map(normalizeSymbolKey))]

  const apiResponse = await fetchPricesFromApi(symbolKeys)

  const result: Record<string, DailyPriceResult> = {}

  if (apiResponse?.success && apiResponse.prices) {
    for (const [symbolKey, priceData] of Object.entries(apiResponse.prices)) {
      result[symbolKey] = {
        price: priceData.price,
        currency: priceData.currency,
        marketTime: priceData.marketTime,
        isStale: false,
        asOfDate: today,
      }
    }
  }

  if (import.meta.env.DEV) {
    const found = Object.keys(result).length
    const missing = symbolKeys.length - found
    if (missing > 0) {
      console.warn(`[DailyPriceService] No prices found for ${missing} of ${symbolKeys.length} symbols`)
    }
  }

  return result
}

/**
 * Get a simple price map (symbol -> price) for backward compatibility.
 */
export async function getDailyPricesMap(
  symbolsRaw: string[],
  _uid?: string
): Promise<Record<string, number>> {
  const prices = await getDailyPrices(symbolsRaw)
  const result: Record<string, number> = {}

  for (const [symbol, data] of Object.entries(prices)) {
    result[symbol] = data.price
  }

  return result
}

// ============================================================================
// Asset Class Detection
// ============================================================================

export function deriveAssetClass(
  category: string
): 'stock' | 'etf' | 'commodity' | 'unknown' {
  switch (category) {
    case 'Stocks': return 'stock'
    case 'Index Funds': return 'etf'
    case 'Commodities': return 'commodity'
    default: return 'unknown'
  }
}

/**
 * Check if a category uses market API prices (Yahoo Finance)
 */
export function categoryUsesMarketApi(category: string): boolean {
  return ['Index Funds', 'Stocks', 'Commodities'].includes(category)
}

/** @deprecated Use categoryUsesMarketApi */
export const categoryUsesTwelveData = categoryUsesMarketApi
/** @deprecated Use categoryUsesMarketApi */
export const categoryUsesYahoo = categoryUsesMarketApi
