/**
 * Currency Conversion Helpers (SSOT)
 * Uses FxRateService for all conversions
 */

import type { CurrencyCode } from '../../lib/currency'
import { getRate, getRates } from './FxRateService'

/**
 * Convert amount from one currency to another
 * @param amount Amount to convert
 * @param from Source currency
 * @param to Target currency
 * @param date Date for the exchange rate (default: 'latest')
 * @returns Converted amount
 */
export async function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  date: string = 'latest'
): Promise<number> {
  if (from === to) {
    return amount
  }

  const fxRate = await getRate(from, to, date)
  return amount * fxRate.rate
}

/**
 * Create a converter function for a specific base currency
 * Useful for creating a consistent converter with a fixed base currency
 */
export function createConverter(
  baseCurrency: CurrencyCode,
  exchangeRates: Map<string, number>
): (amount: number, from: CurrencyCode) => number {
  return (amount: number, from: CurrencyCode): number => {
    if (from === baseCurrency) {
      return amount
    }

    const key = `${from}:${baseCurrency}`
    const rate = exchangeRates.get(key)

    if (typeof rate !== 'number' || rate <= 0) {
      console.warn(
        `[CurrencyConversion] No rate found for ${from}→${baseCurrency}, returning original amount`
      )
      return amount
    }

    return amount * rate
  }
}

/**
 * Preload exchange rates for a base currency and multiple quote currencies
 * Returns a Map of exchange rates for quick conversion
 */
export async function preloadExchangeRates(
  baseCurrency: CurrencyCode,
  quoteCurrencies: CurrencyCode[],
  date: string = 'latest'
): Promise<Map<string, number>> {
  const rates = await getRates(baseCurrency, quoteCurrencies, date)
  const rateMap = new Map<string, number>()

  for (const rate of rates) {
    const key = `${rate.base}:${rate.quote}`
    rateMap.set(key, rate.rate)

    // Also add reverse rate
    const reverseKey = `${rate.quote}:${rate.base}`
    rateMap.set(reverseKey, 1 / rate.rate)
  }

  return rateMap
}
