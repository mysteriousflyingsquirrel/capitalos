import type { CurrencyCode, NetWorthItem, NetWorthTransaction } from './types.js'

/**
 * Calculate balance in CHF for a net worth item based on transactions.
 * NOTE: For Crypto items with current prices, this returns USD value (not CHF)
 * Callers must convert USD to CHF using the convert function
 * For Crypto items without current prices, falls back to transaction-based calculation (returns CHF)
 */
export function calculateBalanceChf(
  itemId: string,
  transactions: NetWorthTransaction[],
  item?: NetWorthItem,
  currentCryptoPrices?: Record<string, number>,
  convert?: (amount: number, from: CurrencyCode) => number
): number {
  // For Crypto items, use current price * coin amount
  if (item?.category === 'Crypto' && currentCryptoPrices && item.name) {
    const coinAmount = calculateCoinAmount(itemId, transactions)
    const ticker = item.name.trim().toUpperCase()
    const currentPrice = currentCryptoPrices[ticker]
    if (currentPrice !== undefined && currentPrice > 0) {
      // Price is in USD - returns USD value, caller must convert to CHF
      return coinAmount * currentPrice
    }
  }

  // For Perpetuals items, calculate only from Exchange Balance (Open Positions are displayed but not included in total)
  if (item?.category === 'Perpetuals' && item.perpetualsData) {
    const { exchangeBalance } = item.perpetualsData

    // Exchange Balance: sum of all holdings (in USD)
    const exchangeBalanceTotal = (exchangeBalance || []).reduce((sum, balance) => {
      return sum + (balance.holdings || 0)
    }, 0)

    // Total in USD - returns USD value, caller must convert to CHF
    // Note: Open Positions are displayed but NOT included in the total perpetuals value
    return exchangeBalanceTotal
  }

  // For Depreciating Assets, calculate depreciation based on time since purchase
  if (item?.category === 'Depreciating Assets' && item.monthlyDepreciationChf && item.monthlyDepreciationChf > 0) {
    // Get all transactions, but exclude any old depreciation transactions (IDs starting with "depr-")
    const itemTransactions = transactions.filter((tx) => tx.itemId === itemId && !tx.id.startsWith('depr-'))

    // Calculate base balance from buy/sell/adjustment transactions
    const baseBalance = itemTransactions.reduce((sum, tx) => {
      // Handle ADJUSTMENT transactions
      if (tx.cryptoType === 'ADJUSTMENT') {
        // For ADJUSTMENT, the amount is already the delta in holdings
        // For simplicity, we'll use the average price of buy transactions
        const buyTransactions = itemTransactions.filter(
          (t) => (t.cryptoType === 'BUY' || (!t.cryptoType && t.side === 'buy')) && t.pricePerItemChf > 0
        )
        if (buyTransactions.length > 0) {
          const totalValue = buyTransactions.reduce((s, t) => {
            if (t.pricePerItem !== undefined && t.currency && convert) {
              return s + convert(t.amount * t.pricePerItem, t.currency as CurrencyCode)
            }
            return s + t.amount * t.pricePerItemChf
          }, 0)
          const totalAmount = buyTransactions.reduce((s, t) => s + t.amount, 0)
          const avgPrice = totalAmount > 0 ? totalValue / totalAmount : 0
          return sum + tx.amount * avgPrice
        }
        // If no buy transactions, adjustment has no value impact
        return sum
      }

      // Handle BUY/SELL transactions
      let txValue: number
      if (tx.cryptoType === 'BUY') {
        txValue = tx.amount
      } else if (tx.cryptoType === 'SELL') {
        txValue = -tx.amount
      } else {
        // Legacy: use side field
        txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      }

      // For all categories, use pricePerItem and currency if available
      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        const totalInOriginalCurrency = txValue * tx.pricePerItem
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }

      // Fallback: use pricePerItemChf (already in CHF)
      return sum + txValue * tx.pricePerItemChf
    }, 0)

    // Find the first buy transaction to determine purchase date
    const buyTransactions = itemTransactions
      .filter((tx) => tx.side === 'buy')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    if (buyTransactions.length > 0) {
      const firstBuyDate = new Date(buyTransactions[0].date)
      const now = new Date()

      // Calculate number of full months since purchase
      const monthsDiff = (now.getFullYear() - firstBuyDate.getFullYear()) * 12 + (now.getMonth() - firstBuyDate.getMonth())

      // Only apply depreciation if at least one month has passed
      if (monthsDiff > 0) {
        const totalDepreciation = item.monthlyDepreciationChf * monthsDiff
        return Math.max(0, baseBalance - totalDepreciation) // Don't go below 0
      }
    }

    return baseBalance
  }

  // For non-Crypto items or Crypto without current prices, use transaction-based calculation
  // Returns CHF (converts from original currency if available)
  return transactions
    .filter((tx) => tx.itemId === itemId)
    .reduce((sum, tx) => {
      // Handle ADJUSTMENT transactions
      if (tx.cryptoType === 'ADJUSTMENT') {
        const buyTransactions = transactions.filter(
          (t) =>
            t.itemId === itemId && (t.cryptoType === 'BUY' || (!t.cryptoType && t.side === 'buy')) && t.pricePerItemChf > 0
        )
        if (buyTransactions.length > 0) {
          const totalValue = buyTransactions.reduce((s, t) => {
            if (t.pricePerItem !== undefined && t.currency && convert) {
              return s + convert(t.amount * t.pricePerItem, t.currency as CurrencyCode)
            }
            return s + t.amount * t.pricePerItemChf
          }, 0)
          const totalAmount = buyTransactions.reduce((s, t) => s + t.amount, 0)
          const avgPrice = totalAmount > 0 ? totalValue / totalAmount : 0
          return sum + tx.amount * avgPrice
        }
        return sum
      }

      // Handle BUY/SELL transactions
      let txValue: number
      if (tx.cryptoType === 'BUY') {
        txValue = tx.amount
      } else if (tx.cryptoType === 'SELL') {
        txValue = -tx.amount
      } else {
        txValue = tx.amount * (tx.side === 'buy' ? 1 : -1)
      }

      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        const totalInOriginalCurrency = txValue * tx.pricePerItem
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }

      return sum + txValue * tx.pricePerItemChf
    }, 0)
}

/**
 * Calculate coin amount for a crypto asset, handling all transaction types.
 */
export function calculateCoinAmount(itemId: string, transactions: NetWorthTransaction[]): number {
  return transactions
    .filter((tx) => tx.itemId === itemId)
    .reduce((sum, tx) => {
      if (tx.cryptoType) {
        switch (tx.cryptoType) {
          case 'BUY':
            return sum + tx.amount
          case 'SELL':
            return sum - tx.amount
          case 'ADJUSTMENT':
            return sum + tx.amount
          default:
            return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
        }
      }
      return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
    }, 0)
}

/**
 * Calculate holdings (quantity) for all categories.
 */
export function calculateHoldings(itemId: string, transactions: NetWorthTransaction[]): number {
  return transactions
    .filter((tx) => tx.itemId === itemId)
    .reduce((sum, tx) => {
      if (tx.cryptoType === 'ADJUSTMENT') return sum + tx.amount
      if (tx.cryptoType === 'BUY') return sum + tx.amount
      if (tx.cryptoType === 'SELL') return sum - tx.amount
      return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
    }, 0)
}

/**
 * Calculate average price per item for Index Funds, Commodities, and Stocks.
 */
export function calculateAveragePricePerItem(
  itemId: string,
  transactions: NetWorthTransaction[],
  convert?: (amount: number, from: CurrencyCode) => number
): number {
  const itemTransactions = transactions.filter((tx) => tx.itemId === itemId)
  if (itemTransactions.length === 0) return 0

  let totalValue = 0
  let totalQuantity = 0

  itemTransactions.forEach((tx) => {
    if (tx.side === 'buy') {
      const quantity = tx.amount
      let pricePerItem: number

      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        pricePerItem = convert(tx.pricePerItem, tx.currency as CurrencyCode)
      } else {
        pricePerItem = tx.pricePerItemChf
      }

      totalValue += quantity * pricePerItem
      totalQuantity += quantity
    }
  })

  return totalQuantity > 0 ? totalValue / totalQuantity : 0
}

