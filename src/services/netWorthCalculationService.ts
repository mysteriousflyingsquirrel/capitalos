import type { NetWorthItem, NetWorthTransaction, NetWorthCategory } from '../pages/NetWorth'
import { calculateBalanceChf, calculateCoinAmount, calculateHoldings } from './balanceCalculationService'
import type { CurrencyCode } from '../lib/currency'

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
    const categoryTotals: Record<NetWorthCategory, number> = {
      'Cash': 0,
      'Bank Accounts': 0,
      'Retirement Funds': 0,
      'Index Funds': 0,
      'Stocks': 0,
      'Commodities': 0,
      'Crypto': 0,
      'Perpetuals': 0,
      'Real Estate': 0,
      'Depreciating Assets': 0,
    }

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number
      
      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount, convert USD to CHF using CryptoCompare rate
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
          const valueUsd = coinAmount * currentPriceUsd
          balance = valueUsd * usdToChfRate
        } else {
          // Fallback: calculateBalanceChf returns USD for crypto, need to convert to CHF
          const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
          // Convert USD to CHF
          if (usdToChfRate && usdToChfRate > 0) {
            balance = balanceUsd * usdToChfRate
          } else {
            // Use convert function to convert USD to CHF (baseCurrency)
            balance = convert(balanceUsd, 'USD')
          }
        }
      } else if (item.category === 'Perpetuals') {
        // For Perpetuals: calculate from subcategories
        if (!item.perpetualsData) {
          balance = 0
        } else {
          const { openPositions, lockedMargin, availableMargin } = item.perpetualsData
          
          // Ensure arrays exist and are actually arrays
          const safeOpenPositions = Array.isArray(openPositions) ? openPositions : []
          const safeLockedMargin = Array.isArray(lockedMargin) ? lockedMargin : []
          const safeAvailableMargin = Array.isArray(availableMargin) ? availableMargin : []
          
          // Sum all CHF balances directly
          let totalChf = 0
          
          // Open Positions: convert each balance to CHF and sum
          safeOpenPositions.forEach(pos => {
            const balanceUsd = pos.margin + pos.pnl
            const balanceChf = usdToChfRate && usdToChfRate > 0 
              ? balanceUsd * usdToChfRate 
              : convert(balanceUsd, 'USD')
            totalChf += balanceChf
          })
          
          // Locked Margin: convert each balance to CHF and sum
          safeLockedMargin.forEach(margin => {
            const balanceUsd = margin.margin
            const balanceChf = usdToChfRate && usdToChfRate > 0 
              ? balanceUsd * usdToChfRate 
              : convert(balanceUsd, 'USD')
            totalChf += balanceChf
          })
          
          // Available Margin: convert each balance to CHF and sum
          safeAvailableMargin.forEach(margin => {
            const balanceUsd = margin.margin
            const balanceChf = usdToChfRate && usdToChfRate > 0 
              ? balanceUsd * usdToChfRate 
              : convert(balanceUsd, 'USD')
            totalChf += balanceChf
          })
          
          balance = totalChf
        }
      } else if (item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities') {
        // For Index Funds, Stocks, and Commodities: use current price from Yahoo Finance
        const holdings = calculateHoldings(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = stockPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
          const valueUsd = holdings * currentPriceUsd
          balance = valueUsd * usdToChfRate
        } else {
          // Fallback: calculateBalanceChf returns CHF
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        // For all other items, calculateBalanceChf returns CHF
        balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }
      
      // Ensure balance is a valid number
      const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
      categoryTotals[item.category] += validBalance
    })

    // Sum all category totals
    const totalNetWorthChf = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)

    return {
      categoryTotals,
      totalNetWorthChf,
    }
  }
}

