/**
 * Market Price Service (SSOT)
 * 
 * Now uses daily Firestore cache via DailyPriceService.
 * No direct Yahoo API calls from client - prices are fetched by GitHub Action.
 * 
 * This service maintains backward compatibility with the old API.
 */

import type { MarketPrice } from './types'
import { getDailyPrices, getDailyPricesMap, normalizeSymbolKey } from './DailyPriceService'

/**
 * Normalize ticker symbol
 */
function normalizeTicker(ticker: string): string {
  return normalizeSymbolKey(ticker)
}

/**
 * Get market price for a single symbol
 * @deprecated Use DailyPriceService.getDailyPrices directly
 */
export async function getPrice(symbol: string, _apiKey?: string): Promise<MarketPrice> {
  const normalized = normalizeTicker(symbol)
  const prices = await getDailyPrices([normalized])
  const priceData = prices[normalized]

  if (!priceData) {
    throw new Error(`No price found for ${normalized} in daily cache`)
  }

  const marketPrice: MarketPrice = {
    symbol: normalized,
    priceUsd: priceData.price,
    timestamp: priceData.marketTime || Date.now(),
    source: priceData.isStale ? 'cache' : 'yahoo-rapidapi',
  }

  return marketPrice
}

/**
 * Get market prices for multiple symbols (batch request)
 * @deprecated Use DailyPriceService.getDailyPrices directly
 */
export async function getPrices(
  symbols: string[],
  _apiKey?: string
): Promise<MarketPrice[]> {
  if (symbols.length === 0) {
    return []
  }

  const normalized = [...new Set(symbols.map(normalizeTicker))]
  const prices = await getDailyPrices(normalized)
  const results: MarketPrice[] = []

  for (const symbol of normalized) {
    const priceData = prices[symbol]
    if (priceData) {
      results.push({
        symbol,
        priceUsd: priceData.price,
        timestamp: priceData.marketTime || Date.now(),
        source: priceData.isStale ? 'cache' : 'yahoo-rapidapi',
      })
    } else {
      console.warn(`[MarketPriceService] No price in daily cache for ${symbol}`)
    }
  }

  return results
}

/**
 * Get prices as a simple map (symbol -> price in USD)
 * @deprecated Use DailyPriceService.getDailyPricesMap directly
 */
export async function getPricesMap(
  symbols: string[],
  _apiKey?: string
): Promise<Record<string, number>> {
  return getDailyPricesMap(symbols)
}

/**
 * Alias for getPricesMap for backward compatibility with market-data index
 */
export async function getMarketPrices(
  symbols: string[],
  _apiKey?: string
): Promise<{ prices: Record<string, number>; timestamp: number; source: string }> {
  const prices = await getDailyPricesMap(symbols)
  return {
    prices,
    timestamp: Date.now(),
    source: 'daily-cache',
  }
}
