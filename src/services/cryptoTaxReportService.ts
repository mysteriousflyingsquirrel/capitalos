import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import { loadNetWorthItems, loadNetWorthTransactions } from './storageService'
import type { CurrencyCode } from '../lib/currency'

export interface CryptoTransaction {
  date: string
  amount: number
  priceChf: number
  totalChf: number
}

export interface CoinReport {
  coin: string
  coinName?: string
  balanceStartOfYear: {
    amount: number
    priceChf: number
    valueChf: number
  }
  buys: CryptoTransaction[]
  sells: CryptoTransaction[]
  balanceEndOfYear: {
    amount: number
    priceChf: number
    valueChf: number
  }
}

export interface CryptoTaxReport {
  year: number
  coins: CoinReport[]
}

/**
 * Get all years with crypto activity
 * Activity = at least one buy/sell transaction (only transactions, not snapshots)
 */
export async function getYearsWithCryptoActivity(uid?: string): Promise<number[]> {
  const [items, transactions] = await Promise.all([
    loadNetWorthItems<NetWorthItem>([], uid),
    loadNetWorthTransactions<NetWorthTransaction>([], uid),
  ])

  const cryptoItems = items.filter(item => item.category === 'Crypto')
  const years = new Set<number>()

  // Get years from transactions only (buy/sell transactions on crypto items)
  transactions.forEach(tx => {
    const item = cryptoItems.find(i => i.id === tx.itemId)
    if (item && (tx.side === 'buy' || tx.side === 'sell')) {
      const date = new Date(tx.date)
      if (!isNaN(date.getTime())) {
        years.add(date.getFullYear())
      }
    }
  })

  return Array.from(years).sort((a, b) => b - a) // Newest first
}

/**
 * Calculate coin balance at a specific timestamp
 */
function calculateBalanceAtTimestamp(
  itemId: string,
  transactions: NetWorthTransaction[],
  timestamp: number
): number {
  return transactions
    .filter(tx => {
      if (tx.itemId !== itemId) return false
      const txDate = new Date(tx.date)
      return !isNaN(txDate.getTime()) && txDate.getTime() <= timestamp
    })
    .reduce((sum, tx) => sum + (tx.side === 'buy' ? 1 : -1) * tx.amount, 0)
}

/**
 * Fetch historical price for a coin (using CoinGecko historical API)
 * Falls back to current price if historical not available
 */
async function fetchHistoricalPrice(
  ticker: string,
  timestamp: number,
  convert: (amount: number, from: CurrencyCode) => number
): Promise<number> {
  try {
    // First try to find coin ID
    const normalized = ticker.trim().toUpperCase()
    const searchResponse = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalized)}`
    )
    
    if (!searchResponse.ok) {
      throw new Error('Search failed')
    }

    const searchData = await searchResponse.json()
    if (!searchData.coins || !Array.isArray(searchData.coins)) {
      throw new Error('Invalid search response')
    }

    const matchingCoin = searchData.coins.find(
      (coin: any) => coin.symbol && coin.symbol.toUpperCase() === normalized
    )

    if (!matchingCoin) {
      throw new Error('Coin not found')
    }

    const coinId = matchingCoin.id
    const date = new Date(timestamp)
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const dateStr = `${day}-${month}-${year}`

    // Try to fetch historical price
    const historyResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${dateStr}`
    )

    if (historyResponse.ok) {
      const historyData = await historyResponse.json()
      if (historyData.market_data?.current_price?.usd) {
        const priceUsd = historyData.market_data.current_price.usd
        return convert(priceUsd, 'USD')
      }
    }

    const normalizedFallback = ticker.trim().toUpperCase()
    const searchResponse2 = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalizedFallback)}`
    )
    
    if (searchResponse2.ok) {
      const searchData2 = await searchResponse2.json()
      if (searchData2.coins && Array.isArray(searchData2.coins)) {
        const matchingCoin2 = searchData2.coins.find(
          (coin: any) => coin.symbol && coin.symbol.toUpperCase() === normalizedFallback
        )
        
        if (matchingCoin2) {
          const priceResponse = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${matchingCoin2.id}&vs_currencies=usd`
          )
          
          if (priceResponse.ok) {
            const priceData = await priceResponse.json()
            if (priceData[matchingCoin2.id]?.usd) {
              return convert(priceData[matchingCoin2.id].usd, 'USD')
            }
          }
        }
      }
    }

    throw new Error('Price not available')
  } catch (error) {
    console.warn(`Failed to fetch historical price for ${ticker} at ${timestamp}:`, error)
    try {
      const normalizedFinal = ticker.trim().toUpperCase()
      const searchResponse = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalizedFinal)}`
      )
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json()
        if (searchData.coins && Array.isArray(searchData.coins)) {
          const matchingCoin = searchData.coins.find(
            (coin: any) => coin.symbol && coin.symbol.toUpperCase() === normalizedFinal
          )
          
          if (matchingCoin) {
            const priceResponse = await fetch(
              `https://api.coingecko.com/api/v3/simple/price?ids=${matchingCoin.id}&vs_currencies=usd`
            )
            
            if (priceResponse.ok) {
              const priceData = await priceResponse.json()
              if (priceData[matchingCoin.id]?.usd) {
                return convert(priceData[matchingCoin.id].usd, 'USD')
              }
            }
          }
        }
      }
    } catch (fallbackError) {
      console.warn('Fallback price fetch also failed:', fallbackError)
    }
    return 0
  }
}

/**
 * Generate crypto tax report for a specific year
 */
export async function generateCryptoTaxReport(
  year: number,
  uid: string | undefined,
  convert: (amount: number, from: CurrencyCode) => number
): Promise<CryptoTaxReport> {
  const [items, transactions] = await Promise.all([
    loadNetWorthItems<NetWorthItem>([], uid),
    loadNetWorthTransactions<NetWorthTransaction>([], uid),
  ])

  const cryptoItems = items.filter(item => item.category === 'Crypto')
  
  const yearStart = new Date(year, 0, 1, 0, 0, 0, 0).getTime()
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime()

  const coinMap = new Map<string, { item: NetWorthItem; transactions: NetWorthTransaction[] }>()

  cryptoItems.forEach(item => {
    const itemTransactions = transactions.filter(tx => tx.itemId === item.id)
    const ticker = item.name.trim().toUpperCase()
    
    if (!coinMap.has(ticker)) {
      coinMap.set(ticker, { item, transactions: [] })
    }
    coinMap.get(ticker)!.transactions.push(...itemTransactions)
  })

  const coinReports: CoinReport[] = []

  for (const [ticker, { item, transactions: coinTransactions }] of coinMap) {
    const yearTransactions = coinTransactions.filter(tx => {
      const txDate = new Date(tx.date)
      return !isNaN(txDate.getTime()) && txDate.getTime() >= yearStart && txDate.getTime() <= yearEnd
    })

    const buySellTransactions = yearTransactions.filter(tx => tx.side === 'buy' || tx.side === 'sell')

    const balanceStart = calculateBalanceAtTimestamp(item.id, coinTransactions, yearStart)
    const balanceEnd = calculateBalanceAtTimestamp(item.id, coinTransactions, yearEnd)

    const hasActivity = balanceStart !== 0 || balanceEnd !== 0 || buySellTransactions.length > 0
    
    if (!hasActivity) continue

    const [priceStart, priceEnd] = await Promise.all([
      fetchHistoricalPrice(ticker, yearStart, convert),
      fetchHistoricalPrice(ticker, yearEnd, convert),
    ])

    const buys: CryptoTransaction[] = []
    const sells: CryptoTransaction[] = []

    for (const tx of buySellTransactions) {
      const txDate = new Date(tx.date)
      const txTimestamp = txDate.getTime()
      
      const txPriceChf = await fetchHistoricalPrice(ticker, txTimestamp, convert)
      
      let totalChf = 0
      if (tx.pricePerItem !== undefined && tx.currency) {
        totalChf = convert(tx.amount * tx.pricePerItem, tx.currency as CurrencyCode)
      } else if (tx.pricePerItemChf !== undefined && tx.pricePerItemChf !== 1) {
        totalChf = tx.amount * tx.pricePerItemChf
      } else {
        totalChf = tx.amount * txPriceChf
      }

      const cryptoTx: CryptoTransaction = {
        date: tx.date,
        amount: tx.amount,
        priceChf: txPriceChf,
        totalChf,
      }

      if (tx.side === 'buy') {
        buys.push(cryptoTx)
      } else if (tx.side === 'sell') {
        sells.push(cryptoTx)
      }
    }

    buys.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    sells.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    coinReports.push({
      coin: ticker,
      coinName: item.name,
      balanceStartOfYear: {
        amount: balanceStart,
        priceChf: priceStart,
        valueChf: balanceStart * priceStart,
      },
      buys,
      sells,
      balanceEndOfYear: {
        amount: balanceEnd,
        priceChf: priceEnd,
        valueChf: balanceEnd * priceEnd,
      },
    })
  }

  coinReports.sort((a, b) => a.coin.localeCompare(b.coin))

  return {
    year,
    coins: coinReports,
  }
}

