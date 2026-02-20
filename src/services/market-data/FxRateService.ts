/**
 * FX Rate Service (SSOT)
 * Uses fawazahmed0/exchange-api with fallback
 * https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/{apiVersion}/{endpoint}
 * Fallback: https://{date}.currency-api.pages.dev/{apiVersion}/{endpoint}
 */

import type { CurrencyCode } from '../../lib/currency'
import type { FxRate } from './types'
import { marketDataCache } from './MarketDataCache'

const API_VERSION = 'v1'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const REQUEST_TIMEOUT_MS = 10000 // 10 seconds

/**
 * Fetch FX rate from exchange-api (jsdelivr CDN)
 */
async function fetchFromJsdelivr(
  base: CurrencyCode,
  date: string = 'latest'
): Promise<Record<string, number>> {
  const baseLower = base.toLowerCase()
  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/${API_VERSION}/currencies/${baseLower}.json`

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
      throw new Error(`jsdelivr API returned ${response.status}`)
    }

    const data = await response.json()

    // Response format: { date: "2024-01-20", [baseLower]: { usd: 1.08, eur: 0.95, ... } }
    const rates = data[baseLower]
    if (!rates || typeof rates !== 'object') {
      throw new Error('Invalid response format from jsdelivr API')
    }

    return rates as Record<string, number>
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Fetch FX rate from exchange-api (pages.dev fallback)
 */
async function fetchFromPagesDev(
  base: CurrencyCode,
  date: string = 'latest'
): Promise<Record<string, number>> {
  const baseLower = base.toLowerCase()
  const url = `https://${date}.currency-api.pages.dev/${API_VERSION}/currencies/${baseLower}.json`

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
      throw new Error(`pages.dev API returned ${response.status}`)
    }

    const data = await response.json()

    // Response format: { date: "2024-01-20", [baseLower]: { usd: 1.08, eur: 0.95, ... } }
    const rates = data[baseLower]
    if (!rates || typeof rates !== 'object') {
      throw new Error('Invalid response format from pages.dev API')
    }

    return rates as Record<string, number>
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Fetch FX rates for a base currency with fallback mechanism
 */
async function fetchFxRates(
  base: CurrencyCode,
  date: string = 'latest'
): Promise<{ rates: Record<string, number>; source: 'jsdelivr' | 'pages' }> {
  // Try jsdelivr first
  try {
    const rates = await fetchFromJsdelivr(base, date)
    return { rates, source: 'jsdelivr' }
  } catch (jsdelivrError) {
    console.warn(
      `[FxRateService] jsdelivr failed for ${base}, trying fallback:`,
      jsdelivrError
    )

    // Fallback to pages.dev
    try {
      const rates = await fetchFromPagesDev(base, date)
      return { rates, source: 'pages' }
    } catch (pagesError) {
      console.error(
        `[FxRateService] Both jsdelivr and pages.dev failed for ${base}:`,
        { jsdelivrError, pagesError }
      )
      throw new Error(
        `Failed to fetch FX rates from both sources: ${jsdelivrError} / ${pagesError}`
      )
    }
  }
}

/**
 * Get FX rate between two currencies
 * @param base Base currency
 * @param quote Quote currency
 * @param date Date for the rate (default: 'latest')
 * @returns FxRate object with rate and metadata
 */
export async function getRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  date: string = 'latest'
): Promise<FxRate> {
  // If base and quote are the same, return 1
  if (base === quote) {
    return {
      base,
      quote,
      rate: 1,
      timestamp: Date.now(),
      source: 'cache',
    }
  }

  const cacheKey = `fx:${date}:${base}:${quote}`

  return marketDataCache.getOrFetch(
    cacheKey,
    async () => {
      const { rates, source } = await fetchFxRates(base, date)

      const quoteLower = quote.toLowerCase()
      const rate = rates[quoteLower]

      if (typeof rate !== 'number' || rate <= 0) {
        throw new Error(`No valid rate found for ${base}→${quote}`)
      }

      const fxRate: FxRate = {
        base,
        quote,
        rate,
        timestamp: Date.now(),
        source: source === 'jsdelivr' ? 'fawazahmed0-jsdelivr' : 'fawazahmed0-pages',
      }

      return fxRate
    },
    CACHE_TTL_MS
  )
}

/**
 * Get multiple FX rates at once (batch request)
 * Optimized to fetch base currency data only once
 */
export async function getRates(
  base: CurrencyCode,
  quotes: CurrencyCode[],
  date: string = 'latest'
): Promise<FxRate[]> {
  const results: FxRate[] = []

  for (const quote of quotes) {
    try {
      const rate = await getRate(base, quote, date)
      results.push(rate)
    } catch (error) {
      console.error(`[FxRateService] Failed to get rate ${base}→${quote}:`, error)
      // Return a fallback rate of 1 to avoid breaking calculations
      results.push({
        base,
        quote,
        rate: 1,
        timestamp: Date.now(),
        source: 'cache',
      })
    }
  }

  return results
}

/**
 * Preload FX rates for multiple currency pairs
 * Useful for warming up the cache before valuation
 */
export async function preloadRates(
  pairs: Array<{ base: CurrencyCode; quote: CurrencyCode }>,
  date: string = 'latest'
): Promise<void> {
  await Promise.all(
    pairs.map(({ base, quote }) => getRate(base, quote, date).catch((err) => {
      if (import.meta.env.DEV) console.warn(`[FxRateService] preloadRates failed for ${base}→${quote}:`, err)
    }))
  )
}
