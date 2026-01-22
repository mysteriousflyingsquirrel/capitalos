/**
 * Market Price Service (SSOT)
 * Uses Yahoo Finance via RapidAPI exclusively for stocks, ETFs, and commodities
 */

import type { MarketPrice } from './types'
import { marketDataCache } from './MarketDataCache'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const REQUEST_TIMEOUT_MS = 10000 // 10 seconds
const MIN_REQUEST_INTERVAL = 1000 // 1 second between requests (rate limiting)

let lastRequestTime = 0

/**
 * Normalize ticker symbol
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

/**
 * Rate limiting helper
 */
async function rateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    await new Promise((resolve) => setTimeout(resolve, waitTime))
  }
  lastRequestTime = Date.now()
}

/**
 * Fetch stock/ETF/commodity prices from Yahoo Finance via RapidAPI
 */
async function fetchFromYahooFinance(
  symbols: string[],
  apiKey: string
): Promise<Record<string, number>> {
  if (symbols.length === 0) {
    return {}
  }

  await rateLimit()

  const normalizedSymbols = [...new Set(symbols.map(normalizeTicker))]
  const symbolsParam = normalizedSymbols.join(',')

  const url = `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${symbolsParam}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
        Accept: 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.')
      }
      const errorText = await response.text()
      throw new Error(`Yahoo Finance API returned ${response.status}: ${errorText}`)
    }

    const data = await response.json()

    // Parse response
    const prices: Record<string, number> = {}

    // Standard Yahoo Finance format from /market/v2/get-quotes
    if (data.quoteResponse && Array.isArray(data.quoteResponse.result)) {
      data.quoteResponse.result.forEach((quote: any) => {
        const symbol = quote.symbol
        const price = quote.regularMarketPrice
        if (symbol && typeof price === 'number' && price > 0) {
          prices[normalizeTicker(symbol)] = price
        }
      })
    }

    return prices
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Get market price for a single symbol
 */
export async function getPrice(symbol: string, apiKey: string): Promise<MarketPrice> {
  const normalized = normalizeTicker(symbol)
  const cacheKey = `market:${normalized}`

  return marketDataCache.getOrFetch(
    cacheKey,
    async () => {
      const prices = await fetchFromYahooFinance([normalized], apiKey)
      const priceUsd = prices[normalized]

      if (typeof priceUsd !== 'number' || priceUsd <= 0) {
        throw new Error(`No valid price found for ${normalized}`)
      }

      const marketPrice: MarketPrice = {
        symbol: normalized,
        priceUsd,
        timestamp: Date.now(),
        source: 'yahoo-rapidapi',
      }

      return marketPrice
    },
    CACHE_TTL_MS
  )
}

/**
 * Get market prices for multiple symbols (batch request)
 */
export async function getPrices(
  symbols: string[],
  apiKey: string
): Promise<MarketPrice[]> {
  if (symbols.length === 0) {
    return []
  }

  if (!apiKey) {
    console.error('[MarketPriceService] RapidAPI key is required')
    return []
  }

  const normalized = [...new Set(symbols.map(normalizeTicker))]

  // Check cache first for each symbol
  const results: MarketPrice[] = []
  const uncachedSymbols: string[] = []

  for (const symbol of normalized) {
    const cacheKey = `market:${symbol}`
    const cached = marketDataCache.get<MarketPrice>(cacheKey)
    if (cached) {
      results.push(cached)
    } else {
      uncachedSymbols.push(symbol)
    }
  }

  // Fetch uncached symbols in a single batch request
  if (uncachedSymbols.length > 0) {
    try {
      const prices = await fetchFromYahooFinance(uncachedSymbols, apiKey)
      const timestamp = Date.now()

      for (const symbol of uncachedSymbols) {
        const priceUsd = prices[symbol]

        if (typeof priceUsd === 'number' && priceUsd > 0) {
          const marketPrice: MarketPrice = {
            symbol,
            priceUsd,
            timestamp,
            source: 'yahoo-rapidapi',
          }

          // Cache it
          const cacheKey = `market:${symbol}`
          marketDataCache.set(cacheKey, marketPrice, CACHE_TTL_MS)

          results.push(marketPrice)
        } else {
          console.warn(`[MarketPriceService] No valid price for ${symbol}`)
        }
      }
    } catch (error) {
      console.error('[MarketPriceService] Failed to fetch prices:', error)
    }
  }

  return results
}

/**
 * Get prices as a simple map (symbol -> price in USD)
 */
export async function getPricesMap(
  symbols: string[],
  apiKey: string
): Promise<Record<string, number>> {
  const prices = await getPrices(symbols, apiKey)
  const map: Record<string, number> = {}

  for (const price of prices) {
    map[price.symbol] = price.priceUsd
  }

  return map
}
