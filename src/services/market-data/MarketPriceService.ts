/**
 * Market Price Service (SSOT)
 *
 * Delegates to DailyPriceService which fetches from Yahoo Finance via API proxy.
 * This service maintains backward compatibility with the old API.
 */

import type { MarketPrice } from './types'
import { getDailyPrices, getDailyPricesMap, normalizeSymbolKey } from './DailyPriceService'

function normalizeTicker(ticker: string): string {
  return normalizeSymbolKey(ticker)
}

/**
 * @deprecated Use DailyPriceService.getDailyPrices directly
 */
export async function getPrice(symbol: string, _apiKey?: string): Promise<MarketPrice> {
  const normalized = normalizeTicker(symbol)
  const prices = await getDailyPrices([normalized])
  const priceData = prices[normalized]

  if (!priceData) {
    throw new Error(`No price found for ${normalized}`)
  }

  return {
    symbol: normalized,
    priceUsd: priceData.price,
    timestamp: priceData.marketTime || Date.now(),
    source: priceData.isStale ? 'cache' : 'yahoo',
  }
}

/**
 * @deprecated Use DailyPriceService.getDailyPrices directly
 */
export async function getPrices(
  symbols: string[],
  _apiKey?: string
): Promise<MarketPrice[]> {
  if (symbols.length === 0) return []

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
        source: priceData.isStale ? 'cache' : 'yahoo',
      })
    } else {
      console.warn(`[MarketPriceService] No price for ${symbol}`)
    }
  }

  return results
}

/**
 * @deprecated Use DailyPriceService.getDailyPricesMap directly
 */
export async function getPricesMap(
  symbols: string[],
  _apiKey?: string,
  uid?: string
): Promise<Record<string, number>> {
  return getDailyPricesMap(symbols, uid)
}

/**
 * @deprecated Use DailyPriceService.getDailyPricesMap directly
 */
export async function getMarketPrices(
  symbols: string[],
  _apiKey?: string,
  uid?: string
): Promise<{ prices: Record<string, number>; timestamp: number; source: string }> {
  const prices = await getDailyPricesMap(symbols, uid)
  return {
    prices,
    timestamp: Date.now(),
    source: 'yahoo',
  }
}
