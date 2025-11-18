import type { CurrencyCode } from '../lib/currency'
import { supportedCurrencies } from '../lib/currency'

export interface ExchangeRates {
  base: CurrencyCode
  rates: Record<CurrencyCode, number> // e.g. { CHF: 1, USD: 1.08, EUR: 0.95 }
  fetchedAt: number // timestamp (ms since epoch)
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const EXCHANGE_RATES_CACHE_KEY = 'capitalos_exchange_rates_v1'

export async function getExchangeRates(base: CurrencyCode): Promise<ExchangeRates> {
  // 1) Try to read from localStorage
  try {
    const cached = localStorage.getItem(EXCHANGE_RATES_CACHE_KEY)
    if (cached) {
      const cachedData: ExchangeRates = JSON.parse(cached)
      const now = Date.now()
      const age = now - cachedData.fetchedAt

      // If same base, not older than 24h, return cached
      if (cachedData.base === base && age < ONE_DAY_MS) {
        return cachedData
      }
    }
  } catch (error) {
    console.warn('Failed to read cached exchange rates:', error)
  }

  // 2) Fetch from API
  try {
    // Use exchangerate-api.com which works without API key
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${base}`
    )

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()

    // exchangerate-api.com returns { base: "CHF", date: "2024-...", rates: { USD: 1.08, EUR: 0.95, ... } }
    if (!data.rates || typeof data.rates !== 'object') {
      throw new Error('API returned invalid data structure')
    }

    // Build rates object with all supported currencies
    const rates: Record<CurrencyCode, number> = {
      [base]: 1, // Base currency is always 1
    }

    // Add rates from API response
    for (const [currency, rate] of Object.entries(data.rates)) {
      if (supportedCurrencies.includes(currency as CurrencyCode)) {
        rates[currency as CurrencyCode] = rate as number
      }
    }

    // Ensure all supported currencies are present (fallback to 1 if missing)
    for (const currency of supportedCurrencies) {
      if (!(currency in rates)) {
        rates[currency] = currency === base ? 1 : 1 // Fallback
      }
    }

    const exchangeRates: ExchangeRates = {
      base,
      rates,
      fetchedAt: Date.now(),
    }

    // 3) Store in localStorage
    try {
      localStorage.setItem(EXCHANGE_RATES_CACHE_KEY, JSON.stringify(exchangeRates))
    } catch (error) {
      console.warn('Failed to cache exchange rates:', error)
    }

    return exchangeRates
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)

    // On API failure, try to return cached data (even if old)
    try {
      const cached = localStorage.getItem(EXCHANGE_RATES_CACHE_KEY)
      if (cached) {
        const cachedData: ExchangeRates = JSON.parse(cached)
        // If same base, return it even if old
        if (cachedData.base === base) {
          return cachedData
        }
      }
    } catch (cacheError) {
      console.warn('Failed to read cached exchange rates as fallback:', cacheError)
    }

    // If no cache and fetch fails, return a sensible fallback
    const fallbackRates: Record<CurrencyCode, number> = {
      CHF: 1,
      EUR: 1,
      USD: 1,
    }
    fallbackRates[base] = 1

    return {
      base,
      rates: fallbackRates,
      fetchedAt: Date.now(),
    }
  }
}

