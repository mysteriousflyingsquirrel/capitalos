/**
 * CoinGecko API service for fetching cryptocurrency prices
 */

/**
 * Normalize ticker symbol (uppercase, trim)
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

/**
 * Search for a coin by ticker symbol using CoinGecko search API
 * @param ticker - Cryptocurrency ticker symbol (e.g., 'BTC', 'ETH')
 * @returns CoinGecko ID or null if not found
 */
async function findCoinIdByTicker(ticker: string): Promise<string | null> {
  const normalized = normalizeTicker(ticker)
  
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(normalized)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`CoinGecko search API returned ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.coins || !Array.isArray(data.coins)) {
      return null
    }

    // Find the first coin that matches the ticker symbol exactly
    const matchingCoin = data.coins.find((coin: any) => 
      coin.symbol && normalizeTicker(coin.symbol) === normalized
    )

    return matchingCoin ? matchingCoin.id : null
  } catch (error) {
    console.error('Error searching for coin:', error)
    return null
  }
}

/**
 * Fetch price for a cryptocurrency ticker symbol
 * @param ticker - Cryptocurrency ticker symbol (e.g., 'BTC', 'ETH')
 * @returns Price in USD or null if not found/error
 */
export async function fetchCoinPrice(ticker: string): Promise<number | null> {
  try {
    // First, search for the coin ID by ticker symbol
    const coinGeckoId = await findCoinIdByTicker(ticker)
    
    if (!coinGeckoId) {
      console.warn(`No CoinGecko ID found for ticker: ${ticker}`)
      return null
    }

    // Then, fetch the price using the coin ID
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=usd`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`CoinGecko API returned ${response.status}`)
    }

    const data = await response.json()
    
    if (!data[coinGeckoId] || typeof data[coinGeckoId].usd !== 'number') {
      throw new Error('Invalid response format from CoinGecko API')
    }

    return data[coinGeckoId].usd
  } catch (error) {
    console.error('Error fetching coin price from CoinGecko:', error)
    return null
  }
}

/**
 * Check if a ticker symbol is supported (always returns true now, as we search dynamically)
 * @deprecated This function is kept for backward compatibility but always returns true
 */
export function isTickerSupported(ticker: string): boolean {
  return true // We now support any ticker via search
}

