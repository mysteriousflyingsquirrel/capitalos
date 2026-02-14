/**
 * Backward Compatibility Layer
 * Provides old API signatures using new SSOT services
 * This allows gradual migration of existing code
 */

import { getPricesMap as getCryptoPricesMap } from './CryptoPriceService'
import { getDailyPricesMap } from './DailyPriceService'
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
 * @deprecated Use DailyPriceService directly - reads from daily Firestore cache
 */
export async function fetchStockPrices(
  tickers: string[],
  _apiKey?: string | null, // API key no longer needed - prices come from Firestore cache
  uid?: string
): Promise<Record<string, number>> {
  // Use daily Firestore cache - triggers API fetch if needed
  return getDailyPricesMap(tickers, uid)
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
