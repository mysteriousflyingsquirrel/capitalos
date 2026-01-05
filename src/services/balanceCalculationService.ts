import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import type { CurrencyCode } from '../lib/currency'

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
  
  // For Perpetuals items, calculate from subcategories (returns USD, caller must convert to CHF)
  if (item?.category === 'Perpetuals' && item.perpetualsData) {
    const { openPositions, availableMargin, lockedMargin } = item.perpetualsData
    
    // Open Positions: balance = margin + pnl (in USD)
    const openPositionsTotal = openPositions.reduce((posSum, pos) => {
      return posSum + (pos.margin + pos.pnl)
    }, 0)
    
    // Open Orders: use account-level lockedMargin if available, otherwise 0
    // (per-order margin is not reliable from API)
    const openOrdersTotal = lockedMargin !== null ? lockedMargin : 0
    
    // Available Margin: balance = margin (in USD)
    const availableMarginTotal = availableMargin.reduce((marginSum, margin) => {
      return marginSum + margin.margin
    }, 0)
    
    // Total in USD - returns USD value, caller must convert to CHF
    return openPositionsTotal + openOrdersTotal + availableMarginTotal
  }
  
  // For Depreciating Assets, calculate depreciation based on time since purchase
  if (item?.category === 'Depreciating Assets' && item.monthlyDepreciationChf && item.monthlyDepreciationChf > 0) {
    // Get all transactions, but exclude any old depreciation transactions (IDs starting with "depr-")
    const itemTransactions = transactions.filter(tx => 
      tx.itemId === itemId && !tx.id.startsWith('depr-')
    )
    
    // Calculate base balance from buy/sell/adjustment transactions
    let baseBalance = itemTransactions.reduce((sum, tx) => {
      // Handle ADJUSTMENT transactions
      if (tx.cryptoType === 'ADJUSTMENT') {
        // For ADJUSTMENT, the amount is already the delta in holdings
        // We need to calculate the value change based on current price or average price
        // For simplicity, we'll use the average price of buy transactions
        const buyTransactions = itemTransactions.filter(t => 
          (t.cryptoType === 'BUY' || (!t.cryptoType && t.side === 'buy')) && 
          t.pricePerItemChf > 0
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
        const priceInOriginalCurrency = tx.pricePerItem
        const totalInOriginalCurrency = txValue * priceInOriginalCurrency
        // Convert to CHF
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }
      // Fallback: use pricePerItemChf (already in CHF)
      return sum + txValue * tx.pricePerItemChf
    }, 0)
    
    // Find the first buy transaction to determine purchase date
    const buyTransactions = itemTransactions
      .filter(tx => tx.side === 'buy')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    
    if (buyTransactions.length > 0) {
      const firstBuyDate = new Date(buyTransactions[0].date)
      const now = new Date()
      
      // Calculate number of full months since purchase
      const monthsDiff = (now.getFullYear() - firstBuyDate.getFullYear()) * 12 + 
                        (now.getMonth() - firstBuyDate.getMonth())
      
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
  // All categories now use price per item
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => {
      // Handle ADJUSTMENT transactions
      if (tx.cryptoType === 'ADJUSTMENT') {
        // For ADJUSTMENT, the amount is already the delta in holdings
        // We need to calculate the value change based on average price of buy transactions
        const buyTransactions = transactions.filter(t => 
          t.itemId === itemId && 
          (t.cryptoType === 'BUY' || (!t.cryptoType && t.side === 'buy')) && 
          t.pricePerItemChf > 0
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
        const priceInOriginalCurrency = tx.pricePerItem
        const totalInOriginalCurrency = txValue * priceInOriginalCurrency
        // Convert to CHF
        return sum + convert(totalInOriginalCurrency, tx.currency as CurrencyCode)
      }
      // Fallback: use pricePerItemChf (already in CHF)
      return sum + txValue * tx.pricePerItemChf
    }, 0)
}

/**
 * Calculate coin amount for a crypto asset, handling all transaction types.
 * @param itemId - The item ID to calculate balance for
 * @param transactions - Array of transactions
 * @returns Total amount of coins
 */
export function calculateCoinAmount(itemId: string, transactions: NetWorthTransaction[]): number {
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => {
      // Handle Crypto-specific transaction types
      if (tx.cryptoType) {
        switch (tx.cryptoType) {
          case 'BUY':
            // BUY increases balance
            return sum + tx.amount
          case 'SELL':
            // SELL decreases balance
            return sum - tx.amount
          case 'ADJUSTMENT':
            // ADJUSTMENT applies signed delta (can be positive or negative)
            return sum + tx.amount // amount can be negative
          default:
            // Fallback to side-based logic
            return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
        }
      }
      // Legacy BUY/SELL using 'side' field (backward compatibility)
      return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
    }, 0)
}

/**
 * Calculate holdings (quantity) for all categories
 * Handles ADJUSTMENT transactions for all supported categories
 */
export function calculateHoldings(itemId: string, transactions: NetWorthTransaction[]): number {
  return transactions
    .filter(tx => tx.itemId === itemId)
    .reduce((sum, tx) => {
      // Handle ADJUSTMENT transactions for all supported categories
      if (tx.cryptoType === 'ADJUSTMENT') {
        // ADJUSTMENT applies signed delta (can be positive or negative)
        return sum + tx.amount // amount can be negative
      }
      // BUY/SELL transactions
      if (tx.cryptoType === 'BUY') {
        return sum + tx.amount
      }
      if (tx.cryptoType === 'SELL') {
        return sum - tx.amount
      }
      // Legacy BUY/SELL using 'side' field (backward compatibility)
      return sum + (tx.side === 'buy' ? 1 : -1) * tx.amount
    }, 0)
}

/**
 * Calculate average price per item for Index Funds, Commodities, and Stocks
 */
export function calculateAveragePricePerItem(
  itemId: string,
  transactions: NetWorthTransaction[],
  convert?: (amount: number, from: CurrencyCode) => number
): number {
  const itemTransactions = transactions.filter(tx => tx.itemId === itemId)
  if (itemTransactions.length === 0) return 0

  let totalValue = 0
  let totalQuantity = 0

  itemTransactions.forEach(tx => {
    if (tx.side === 'buy') {
      const quantity = tx.amount
      let pricePerItem: number
      
      // Use pricePerItem if available, otherwise calculate from pricePerItemChf
      if (tx.pricePerItem !== undefined && tx.currency && convert) {
        // Convert from original currency to CHF
        pricePerItem = convert(tx.pricePerItem, tx.currency as CurrencyCode)
      } else {
        // Use pricePerItemChf (already in CHF)
        pricePerItem = tx.pricePerItemChf
      }
      
      totalValue += quantity * pricePerItem
      totalQuantity += quantity
    }
  })

  return totalQuantity > 0 ? totalValue / totalQuantity : 0
}

