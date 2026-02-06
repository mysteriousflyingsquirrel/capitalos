/**
 * Valuation Engine (SSOT)
 * Central service for all net worth calculations
 * Uses Market Data SSOT services for prices and FX rates
 */

import type { CurrencyCode } from '../../lib/currency'
import type { NetWorthItem, NetWorthTransaction } from '../../pages/NetWorth'
import type {
  ValuationResult,
  FxSnapshot,
  PriceQuotesSnapshot,
  ItemValuation,
  CategoryTotals,
} from './types'
import { preloadExchangeRates, createConverter } from '../market-data/CurrencyConversion'
import { getPricesMap as getCryptoPricesMap } from '../market-data/CryptoPriceService'
import { getPricesMap as getMarketPricesMap } from '../market-data/MarketPriceService'
import {
  calculateBalanceChf,
  calculateCoinAmount,
  calculateHoldings,
} from '../balanceCalculationService'

/**
 * Valuation Engine Configuration
 */
export interface ValuationConfig {
  /** Base currency (typically CHF) */
  baseCurrency: CurrencyCode

  /** Display currency (what the user wants to see) */
  displayCurrency: CurrencyCode

  /** @deprecated RapidAPI key no longer needed - market prices come from daily Firestore cache */
  rapidApiKey?: string | null
}

/**
 * Compute a complete valuation for all net worth items
 */
export async function computeValuation(
  items: NetWorthItem[],
  transactions: NetWorthTransaction[],
  config: ValuationConfig
): Promise<ValuationResult> {
  const { baseCurrency, displayCurrency } = config
  const asOf = Date.now()

  // Step 1: Collect all symbols that need pricing
  const cryptoSymbols: string[] = []
  const marketSymbols: string[] = []

  for (const item of items) {
    const symbol = item.name.trim().toUpperCase()

    if (item.category === 'Crypto') {
      cryptoSymbols.push(symbol)
    } else if (
      item.category === 'Index Funds' ||
      item.category === 'Stocks' ||
      item.category === 'Commodities'
    ) {
      marketSymbols.push(symbol)
    }
  }

  // Step 2: Fetch all prices in parallel
  // Market prices come from daily Firestore cache - no API key needed
  const [cryptoPricesMap, marketPricesMap] = await Promise.all([
    cryptoSymbols.length > 0 ? getCryptoPricesMap(cryptoSymbols) : Promise.resolve({}),
    marketSymbols.length > 0 ? getMarketPricesMap(marketSymbols) : Promise.resolve({}),
  ])

  // Step 3: Preload FX rates (one snapshot for entire valuation)
  const quoteCurrencies: CurrencyCode[] = ['CHF', 'USD', 'EUR']
  const fxRatesMap = await preloadExchangeRates(baseCurrency, quoteCurrencies)

  // Create FX snapshot
  const fxSnapshot: FxSnapshot = {
    base: baseCurrency,
    quotes: {
      CHF: fxRatesMap.get(`${baseCurrency}:CHF`) || 1,
      USD: fxRatesMap.get(`${baseCurrency}:USD`) || 1,
      EUR: fxRatesMap.get(`${baseCurrency}:EUR`) || 1,
    },
    timestamp: asOf,
  }

  // Create quotes snapshot
  const quotesSnapshot: PriceQuotesSnapshot = {
    crypto: cryptoPricesMap,
    market: marketPricesMap,
    timestamp: asOf,
  }

  // Step 4: Create converter function using preloaded FX rates
  const convert = createConverter(baseCurrency, fxRatesMap)

  // USD to CHF rate (for backward compatibility with existing calculation logic)
  const usdToChfRate = fxRatesMap.get('USD:CHF') || null

  // Step 5: Calculate valuation for each item
  const itemValuations: ItemValuation[] = []
  const categoryTotals: CategoryTotals = {
    Cash: 0,
    'Bank Accounts': 0,
    'Retirement Funds': 0,
    'Index Funds': 0,
    Stocks: 0,
    Commodities: 0,
    Crypto: 0,
    Perpetuals: 0,
    'Real Estate': 0,
    'Depreciating Assets': 0,
  }

  for (const item of items) {
    let valueChf: number = 0
    let holdings: number | undefined
    let currentPrice: number | undefined

    if (item.category === 'Crypto') {
      // Crypto: calculate coin amount and multiply by current USD price
      const coinAmount = calculateCoinAmount(item.id, transactions)
      holdings = coinAmount
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = cryptoPricesMap[ticker] || 0
      currentPrice = currentPriceUsd

      if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
        const valueUsd = coinAmount * currentPriceUsd
        valueChf = valueUsd * usdToChfRate
      } else {
        // Fallback: use calculateBalanceChf
        const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPricesMap, convert)
        valueChf = usdToChfRate && usdToChfRate > 0 ? balanceUsd * usdToChfRate : convert(balanceUsd, 'USD')
      }
    } else if (item.category === 'Perpetuals') {
      // Perpetuals: calculate from exchange balance
      try {
        if (!item.perpetualsData) {
          valueChf = 0
        } else {
          const { exchangeBalance } = item.perpetualsData || {}
          const safeExchangeBalance = Array.isArray(exchangeBalance) ? exchangeBalance : []

          let totalChf = 0
          safeExchangeBalance.forEach((balance) => {
            if (balance && typeof balance === 'object') {
              const balanceHoldings =
                typeof balance.holdings === 'number' && isFinite(balance.holdings)
                  ? balance.holdings
                  : 0
              if (isFinite(balanceHoldings)) {
                const balanceChf =
                  usdToChfRate && usdToChfRate > 0
                    ? balanceHoldings * usdToChfRate
                    : convert(balanceHoldings, 'USD')
                if (isFinite(balanceChf)) {
                  totalChf += balanceChf
                }
              }
            }
          })

          valueChf = totalChf
        }
      } catch (error) {
        console.warn(`[ValuationEngine] Error calculating Perpetuals balance for item ${item.id}:`, error)
        valueChf = 0
      }
    } else if (
      item.category === 'Index Funds' ||
      item.category === 'Stocks' ||
      item.category === 'Commodities'
    ) {
      // Market instruments: calculate holdings and multiply by current USD price
      const itemHoldings = calculateHoldings(item.id, transactions)
      holdings = itemHoldings
      const ticker = item.name.trim().toUpperCase()
      const currentPriceUsd = marketPricesMap[ticker] || 0
      currentPrice = currentPriceUsd

      if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
        const valueUsd = itemHoldings * currentPriceUsd
        valueChf = valueUsd * usdToChfRate
      } else {
        // Fallback: use calculateBalanceChf
        valueChf = calculateBalanceChf(item.id, transactions, item, cryptoPricesMap, convert)
      }
    } else {
      // All other categories: use calculateBalanceChf
      valueChf = calculateBalanceChf(item.id, transactions, item, cryptoPricesMap, convert)
    }

    // Ensure valid number
    const validValueChf = isNaN(valueChf) || !isFinite(valueChf) ? 0 : valueChf

    // Convert to display currency
    const valueInDisplayCurrency = convert(validValueChf, 'CHF')

    // Add to item valuations
    itemValuations.push({
      itemId: item.id,
      category: item.category,
      name: item.name,
      valueInBaseCurrency: validValueChf,
      valueInDisplayCurrency,
      holdings,
      currentPrice,
    })

    // Add to category totals (in display currency)
    categoryTotals[item.category] += valueInDisplayCurrency
  }

  // Step 6: Calculate total
  const total = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)
  const totalInBaseCurrency = Object.values(categoryTotals).reduce((sum, val) => {
    const baseValue = convert(val, displayCurrency)
    return sum + (isNaN(baseValue) ? 0 : baseValue)
  }, 0)

  // Step 7: Return complete valuation result
  const result: ValuationResult = {
    asOf,
    baseCurrency,
    displayCurrency,
    fxSnapshot,
    quotesSnapshot,
    itemValuations,
    categoryTotals,
    total,
    totalInBaseCurrency,
  }

  return result
}
