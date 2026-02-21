/**
 * Backward Compatibility Layer
 * Provides old API signatures using new SSOT services
 */

import { getPricesMap as getCryptoPricesMap } from './CryptoPriceService'
import { getDailyPricesMap } from './DailyPriceService'
import { getRate } from './FxRateService'

/**
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
 * @deprecated Use CryptoPriceService directly
 */
export async function fetchCryptoPrices(tickers: string[]): Promise<Record<string, number>> {
  return getCryptoPricesMap(tickers)
}

/**
 * @deprecated Use DailyPriceService directly — fetches from Yahoo Finance via API proxy
 */
export async function fetchStockPrices(
  tickers: string[],
  _apiKey?: string | null,
  uid?: string
): Promise<Record<string, number>> {
  return getDailyPricesMap(tickers, uid)
}

/**
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
