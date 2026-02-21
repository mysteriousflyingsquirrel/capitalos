/**
 * Crypto Price Service (SSOT)
 * Uses CryptoCompare API exclusively
 */

import type { CryptoPrice } from './types'

const REQUEST_TIMEOUT_MS = 10000 // 10 seconds

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

/**
 * Fetch crypto prices from CryptoCompare
 */
async function fetchFromCryptoCompare(
  symbols: string[]
): Promise<Record<string, number>> {
  if (symbols.length === 0) {
    return {}
  }

  const normalizedSymbols = [...new Set(symbols.map(normalizeTicker))]
  const symbolsParam = normalizedSymbols.join(',')

  const url = `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${symbolsParam}&tsyms=USD`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()

    // Response format: { "BTC": { "USD": 50000 }, "ETH": { "USD": 3000 } }
    const prices: Record<string, number> = {}

    for (const symbol of normalizedSymbols) {
      if (data[symbol] && typeof data[symbol].USD === 'number') {
        prices[symbol] = data[symbol].USD
      } else {
        console.warn(`[CryptoPriceService] No USD price found for ${symbol}`)
      }
    }

    return prices
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Get crypto price for a single symbol (always fetches fresh from API)
 */
export async function getPrice(symbol: string): Promise<CryptoPrice> {
  const normalized = normalizeTicker(symbol)
  const prices = await fetchFromCryptoCompare([normalized])
  const priceUsd = prices[normalized]

  if (typeof priceUsd !== 'number' || priceUsd <= 0) {
    throw new Error(`No valid price found for ${normalized}`)
  }

  return {
    symbol: normalized,
    priceUsd,
    timestamp: Date.now(),
    source: 'cryptocompare',
  }
}

/**
 * Get crypto prices for multiple symbols (always fetches fresh from API)
 */
export async function getPrices(symbols: string[]): Promise<CryptoPrice[]> {
  if (symbols.length === 0) {
    return []
  }

  const normalized = [...new Set(symbols.map(normalizeTicker))]
  const results: CryptoPrice[] = []

  try {
    const prices = await fetchFromCryptoCompare(normalized)
    const timestamp = Date.now()

    for (const symbol of normalized) {
      const priceUsd = prices[symbol]

      if (typeof priceUsd === 'number' && priceUsd > 0) {
        results.push({
          symbol,
          priceUsd,
          timestamp,
          source: 'cryptocompare',
        })
      } else {
        console.warn(`[CryptoPriceService] No valid price for ${symbol}`)
      }
    }
  } catch (error) {
    console.error('[CryptoPriceService] Failed to fetch prices:', error)
  }

  return results
}

/**
 * Get prices as a simple map (symbol -> price in USD)
 */
export async function getPricesMap(symbols: string[]): Promise<Record<string, number>> {
  const prices = await getPrices(symbols)
  const map: Record<string, number> = {}

  for (const price of prices) {
    map[price.symbol] = price.priceUsd
  }

  return map
}
