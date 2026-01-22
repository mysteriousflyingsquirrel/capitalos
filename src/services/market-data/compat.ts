/**
 * Backward Compatibility Layer
 * Provides old API signatures using new SSOT services
 * This allows gradual migration of existing code
 */

import { getPricesMap as getCryptoPricesMap } from './CryptoPriceService'
import { getPricesMap as getMarketPricesMap } from './MarketPriceService'
import { getRate } from './FxRateService'

/**
 * Fetch crypto prices and USD to CHF rate (backward compatible)
 * @deprecated Use CryptoPriceService and FxRateService directly
 */
export async function fetchCryptoData(
  tickers: string[]
): Promise<{ prices: Record<string, number>; usdToChfRate: number | null }> {
  const [prices, usdToChfRate] = await Promise.all([
    getCryptoPricesMap(tickers),
    getRate('USD', 'CHF', 'latest')
      .then((rate) => rate.rate)
      .catch(() => null),
  ])

  return { prices, usdToChfRate }
}

/**
 * Fetch crypto prices only (backward compatible)
 * @deprecated Use CryptoPriceService directly
 */
export async function fetchCryptoPrices(tickers: string[]): Promise<Record<string, number>> {
  return getCryptoPricesMap(tickers)
}

/**
 * Fetch stock/ETF/commodity prices (backward compatible)
 * @deprecated Use MarketPriceService directly
 */
export async function fetchStockPrices(
  tickers: string[],
  apiKey?: string | null
): Promise<Record<string, number>> {
  if (!apiKey) {
    console.warn('[fetchStockPrices] No API key provided, returning empty prices')
    return {}
  }
  return getMarketPricesMap(tickers, apiKey)
}

/**
 * Fetch USD to CHF rate (backward compatible)
 * @deprecated Use FxRateService directly
 */
export async function fetchUsdToChfRate(): Promise<number | null> {
  try {
    const rate = await getRate('USD', 'CHF', 'latest')
    return rate.rate
  } catch (error) {
    console.error('[fetchUsdToChfRate] Error fetching rate:', error)
    return null
  }
}
