/**
 * Yahoo Finance API service via RapidAPI for fetching stock, index fund, and commodity prices
 * API: https://rapidapi.com/apidojo/api/yahoo-finance1
 */

// Rate limiting: track last request time to avoid 429 errors
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1000 // Minimum 1 second between requests

/**
 * Normalize ticker symbol (uppercase, trim)
 */
function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase()
}

/**
 * Get RapidAPI key - now accepts key as parameter
 * Falls back to environment variable if key not provided
 */
function getApiKey(providedKey?: string | null): string {
  // Use provided key if available
  if (providedKey) {
    return providedKey
  }
  
  // Fallback to environment variable
  const envKey = import.meta.env.VITE_RAPIDAPI_KEY
  if (envKey) {
    return envKey
  }
  
  return ''
}

/**
 * Rate limiting helper - ensures minimum time between requests
 */
async function rateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  lastRequestTime = Date.now()
}

/**
 * Fetch current prices for multiple stocks/index funds/commodities
 * @param tickers - Array of ticker symbols (e.g., ['AAPL', 'MSFT', 'SPY'])
 * @param apiKey - Optional RapidAPI key. If not provided, will try environment variable
 * @returns Record mapping ticker to price in USD, or empty object on error
 */
export async function fetchYahooFinancePrices(tickers: string[], apiKey?: string | null): Promise<Record<string, number>> {
  if (tickers.length === 0) {
    return {}
  }

  const key = getApiKey(apiKey)
  if (!key) {
    console.error('RapidAPI key is required to fetch Yahoo Finance prices. Please set it in Settings.')
    return {}
  }

  try {
    // Rate limiting to avoid 429 errors
    await rateLimit()
    
    // Normalize and deduplicate tickers
    const normalizedTickers = [...new Set(tickers.map(normalizeTicker))]
    
    // Yahoo Finance API via RapidAPI endpoint (apidojo/yahoo-finance1)
    // Correct endpoint: /market/v2/get-quotes?region=US&symbols=AAPL,MSFT,SPY
    const tickerString = normalizedTickers.join(',')
    
    const response = await fetch(
      `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${tickerString}`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': key,
          'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
          'Accept': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Yahoo Finance API error (${response.status}):`, errorText)
      
      // If 429, provide helpful error message
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.')
      }
      
      throw new Error(`Yahoo Finance API returned ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    
    // Parse response - apidojo Yahoo Finance API returns quoteResponse.result format
    const prices: Record<string, number> = {}
    
    // Standard Yahoo Finance format from /market/v2/get-quotes
    if (data.quoteResponse && Array.isArray(data.quoteResponse.result)) {
      data.quoteResponse.result.forEach((quote: any) => {
        const symbol = quote.symbol
        // Use regularMarketPrice as the primary price field
        const price = quote.regularMarketPrice
        if (symbol && typeof price === 'number' && price > 0) {
          prices[normalizeTicker(symbol)] = price
        }
      })
    }
    
    // Fallback: Try data.body (some RapidAPI wrappers use this)
    if (Object.keys(prices).length === 0 && data.body) {
      if (Array.isArray(data.body)) {
        data.body.forEach((quote: any) => {
          const symbol = quote.symbol || quote.ticker || quote.shortName
          // Use regularMarketPrice as the primary price field
          const price = quote.regularMarketPrice
          if (symbol && typeof price === 'number' && price > 0) {
            prices[normalizeTicker(symbol)] = price
          }
        })
      } else if (typeof data.body === 'object' && data.body.quoteResponse) {
        // Nested quoteResponse in body
        if (Array.isArray(data.body.quoteResponse.result)) {
          data.body.quoteResponse.result.forEach((quote: any) => {
            const symbol = quote.symbol
            // Use regularMarketPrice as the primary price field
            const price = quote.regularMarketPrice
            if (symbol && typeof price === 'number' && price > 0) {
              prices[normalizeTicker(symbol)] = price
            }
          })
        }
      }
    }
    
    // Log response structure for debugging if no prices found
    if (Object.keys(prices).length === 0) {
      console.warn('Yahoo Finance API response structure (no prices found):', JSON.stringify(data).substring(0, 500))
      console.warn('Requested tickers:', normalizedTickers)
    }

    return prices
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error fetching prices from Yahoo Finance API:', errorMessage)
    
    // Don't throw - return empty object so UI can handle gracefully
    return {}
  }
}


/**
 * Fetch prices using the apidojo Yahoo Finance API
 * @param tickers - Array of ticker symbols
 * @param apiKey - Optional RapidAPI key. If not provided, will try environment variable
 * @returns Record mapping ticker to price in USD
 */
export async function fetchStockPrices(tickers: string[], apiKey?: string | null): Promise<Record<string, number>> {
  // Use the main quotes endpoint
  return await fetchYahooFinancePrices(tickers, apiKey)
}

