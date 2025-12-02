/**
 * CryptoCompare API service for fetching cryptocurrency prices and exchange rates
 */

/**
 * Normalize ticker symbol (uppercase, trim)
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

/**
 * Fetch current USD prices for multiple cryptocurrencies
 * @param tickers - Array of cryptocurrency ticker symbols (e.g., ['BTC', 'ETH', 'SOL'])
 * @returns Record mapping ticker to USD price, or empty object on error
 */
export async function fetchCryptoPrices(tickers: string[]): Promise<Record<string, number>> {
  if (tickers.length === 0) {
    return {}
  }

  try {
    // Normalize and deduplicate tickers
    const normalizedTickers = [...new Set(tickers.map(normalizeTicker))]
    const tickerString = normalizedTickers.join(',')

    // CryptoCompare API endpoint for multiple prices
    // Format: /data/pricemulti?fsyms=BTC,ETH,SOL&tsyms=USD
    const response = await fetch(
      `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${tickerString}&tsyms=USD`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()

    // CryptoCompare returns: { "BTC": { "USD": 50000 }, "ETH": { "USD": 3000 } }
    const prices: Record<string, number> = {}
    
    for (const ticker of normalizedTickers) {
      if (data[ticker] && typeof data[ticker].USD === 'number') {
        prices[ticker] = data[ticker].USD
      } else {
        console.warn(`No USD price found for ticker: ${ticker}`)
      }
    }

    return prices
  } catch (error) {
    console.error('Error fetching crypto prices from CryptoCompare:', error)
    return {}
  }
}

/**
 * Fetch current USD to CHF exchange rate
 * @returns USD to CHF rate (e.g., 0.92 means 1 USD = 0.92 CHF), or null on error
 */
export async function fetchUsdToChfRate(): Promise<number | null> {
  try {
    // CryptoCompare API endpoint for exchange rate
    // Format: /data/price?fsym=USD&tsyms=CHF
    const response = await fetch(
      `https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=CHF`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`CryptoCompare API returned ${response.status}`)
    }

    const data = await response.json()

    if (data.CHF && typeof data.CHF === 'number') {
      return data.CHF
    }

    throw new Error('Invalid response format from CryptoCompare API')
  } catch (error) {
    console.error('Error fetching USD to CHF rate from CryptoCompare:', error)
    return null
  }
}

/**
 * Fetch both crypto prices and USD to CHF rate in a single batch
 * @param tickers - Array of cryptocurrency ticker symbols
 * @returns Object with prices and usdToChfRate
 */
export async function fetchCryptoData(
  tickers: string[]
): Promise<{ prices: Record<string, number>; usdToChfRate: number | null }> {
  const [prices, usdToChfRate] = await Promise.all([
    fetchCryptoPrices(tickers),
    fetchUsdToChfRate(),
  ])

  return { prices, usdToChfRate }
}

