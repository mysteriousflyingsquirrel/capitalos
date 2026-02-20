import type { CurrencyCode, NetWorthCategory, NetWorthItem, NetWorthTransaction } from './types.js'
import { calculateBalanceChf, calculateCoinAmount, calculateHoldings } from './balanceCalculation.js'

export interface CategoryTotals {
  [category: string]: number
}

export interface NetWorthCalculationResult {
  categoryTotals: Record<NetWorthCategory, number>
  totalNetWorthChf: number
}

/**
 * Global service for calculating net worth totals
 */
export class NetWorthCalculationService {
  /**
   * Calculate category totals and total net worth
   */
  static calculateTotals(
    netWorthItems: NetWorthItem[],
    transactions: NetWorthTransaction[],
    cryptoPrices: Record<string, number>,
    stockPrices: Record<string, number>,
    usdToChfRate: number | null,
    convert: (value: number, from: CurrencyCode) => number
  ): NetWorthCalculationResult {
    if (!netWorthItems) netWorthItems = []
    if (!transactions) transactions = []
    if (!cryptoPrices) cryptoPrices = {}
    if (!stockPrices) stockPrices = {}

    const categoryTotals: Record<NetWorthCategory, number> = {
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

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number

      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount, convert USD to CHF using CryptoCompare rate
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = (item.name || '').trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          const valueUsd = coinAmount * currentPriceUsd
          balance = valueUsd * usdToChfRate
        } else {
          // Fallback: calculateBalanceChf returns USD for crypto, need to convert to CHF
          const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
          if (usdToChfRate && usdToChfRate > 0) {
            balance = balanceUsd * usdToChfRate
          } else {
            balance = convert(balanceUsd, 'USD')
          }
        }
      } else if (item.category === 'Perpetuals') {
        // For Perpetuals: calculate only from Exchange Balance (Open Positions are displayed but not included in total)
        try {
          if (!item.perpetualsData) {
            balance = 0
          } else {
            const { exchangeBalance } = item.perpetualsData || {}
            const safeExchangeBalance = Array.isArray(exchangeBalance) ? exchangeBalance : []

            let totalChf = 0
            safeExchangeBalance.forEach((b) => {
              if (b && typeof b === 'object') {
                const holdings = typeof (b as any).holdings === 'number' && isFinite((b as any).holdings) ? (b as any).holdings : 0
                if (isFinite(holdings)) {
                  const balanceChf = usdToChfRate && usdToChfRate > 0 ? holdings * usdToChfRate : convert(holdings, 'USD')
                  if (isFinite(balanceChf)) totalChf += balanceChf
                }
              }
            })

            balance = totalChf
          }
        } catch (error) {
          console.warn(`[NetWorthCalculation] Error calculating Perpetuals balance for item ${item.id}:`, error)
          balance = 0
        }
      } else if (item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities') {
        // Index Funds, Stocks, Commodities: price is already in item.currency (CHF, USD, or EUR). No conversion to USD.
        const holdings = calculateHoldings(item.id, transactions)
        const ticker = (item.name || '').trim().toUpperCase()
        const currentPrice = stockPrices[ticker] || 0
        if (currentPrice > 0) {
          const valueInItemCurrency = holdings * currentPrice
          balance = convert(valueInItemCurrency, (item.currency as CurrencyCode))
        } else {
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }

      const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
      categoryTotals[item.category] += validBalance
    })

    const totalNetWorthChf = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)

    return {
      categoryTotals,
      totalNetWorthChf,
    }
  }
}

