/**
 * Crypto Price Provider Abstraction
 * Supports multiple price sources for cryptocurrency price fetching
 */

export type CryptoPriceSource = 
  | 'KRAKEN_SPOT'
  | 'MEXC'

export type QuoteCurrency = 'USD' | 'USDT' | 'USDC'

export interface PriceResult {
  price: number | null
  timestamp: number
  error?: string
  source: CryptoPriceSource
  quoteCurrency?: QuoteCurrency
}

export interface PriceProvider {
  fetchPrice(symbol: string, quoteCurrency?: QuoteCurrency): Promise<PriceResult>
  fetchPrices(symbols: string[], quoteCurrency?: QuoteCurrency): Promise<Record<string, PriceResult>>
  isAvailable(): boolean
}

/**
 * Base asset mapping for Kraken Spot
 * Maps user-facing symbols to Kraken base asset codes
 */
const KRAKEN_BASE_ASSET_MAP: Record<string, string> = {
  'BTC': 'XBT',
  'ETH': 'ETH',
  'SOL': 'SOL',
  'USDT': 'USDT',
  // Add more mappings as needed
}

/**
 * Supported quote currencies for Kraken Spot
 */
const KRAKEN_QUOTE_CURRENCIES: QuoteCurrency[] = ['USD', 'USDT', 'USDC']

/**
 * Get Kraken base asset code for a symbol
 */
function getKrakenBaseAsset(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase()
  return KRAKEN_BASE_ASSET_MAP[normalized] || null
}

/**
 * Get Kraken pair code for a symbol and quote currency
 * Examples: BTC + USD → XBTUSD, BTC + USDT → XBTUSDT, BTC + USDC → XBTUSDC
 */
function getKrakenPair(symbol: string, quoteCurrency: QuoteCurrency = 'USD'): string | null {
  const baseAsset = getKrakenBaseAsset(symbol)
  if (!baseAsset) return null
  
  // Special case: if symbol is the same as quote currency (e.g., USDT/USDT), return null
  const normalized = symbol.trim().toUpperCase()
  if (normalized === quoteCurrency) return null
  
  return `${baseAsset}${quoteCurrency}`
}

/**
 * Check if a symbol and quote currency combination is supported by Kraken Spot
 */
export function isKrakenSpotSupported(symbol: string, quoteCurrency: QuoteCurrency = 'USD'): boolean {
  return getKrakenPair(symbol, quoteCurrency) !== null
}

/**
 * Kraken Spot Price Provider
 * Fetches prices from Kraken's public market data API
 */
class KrakenSpotProvider implements PriceProvider {
  private cache: Map<string, { result: PriceResult; expires: number }> = new Map()
  private readonly CACHE_TTL = 60 * 1000 // 60 seconds

  isAvailable(): boolean {
    return true
  }

  async fetchPrice(symbol: string, quoteCurrency: QuoteCurrency = 'USD'): Promise<PriceResult> {
    const normalized = symbol.trim().toUpperCase()
    const cacheKey = `${normalized}_${quoteCurrency}`
    
    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return cached.result
    }

    const pair = getKrakenPair(normalized, quoteCurrency)
    if (!pair) {
      const error = `Kraken Spot does not support this asset with the selected quote currency: ${symbol}/${quoteCurrency}`
      const result: PriceResult = {
        price: null,
        timestamp: Date.now(),
        error,
        source: 'KRAKEN_SPOT',
        quoteCurrency,
      }
      return result
    }

    try {
      // Kraken public API endpoint: /0/public/Ticker
      // Format: https://api.kraken.com/0/public/Ticker?pair=XBTUSD
      const response = await fetch(
        `https://api.kraken.com/0/public/Ticker?pair=${pair}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Kraken API returned ${response.status}`)
      }

      const data = await response.json()

      if (data.error && data.error.length > 0) {
        throw new Error(`Kraken API error: ${data.error.join(', ')}`)
      }

      // Kraken returns: { "result": { "XXBTZUSD": { "c": ["62995.0", "0.0001"] } } }
      // The key may be prefixed (e.g., "XXBTZUSD" instead of "XBTUSD")
      // "c" array: [last trade price, volume]
      // We need to get the first object in result, regardless of key name
      const resultKeys = Object.keys(data.result || {})
      if (resultKeys.length === 0) {
        throw new Error('No ticker data in Kraken API response')
      }

      // Get the first ticker data (Kraken may prefix the pair name)
      const tickerData = data.result[resultKeys[0]]
      if (!tickerData || !tickerData.c || !Array.isArray(tickerData.c) || tickerData.c.length === 0) {
        throw new Error('Invalid response format from Kraken API')
      }

      // Use c[0] as the current price (last traded price)
      const price = parseFloat(tickerData.c[0])
      if (isNaN(price) || price <= 0) {
        throw new Error('Invalid price value from Kraken API')
      }

      const result: PriceResult = {
        price,
        timestamp: Date.now(),
        source: 'KRAKEN_SPOT',
        quoteCurrency,
      }

      // Cache the result
      this.cache.set(cacheKey, {
        result,
        expires: Date.now() + this.CACHE_TTL,
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching price from Kraken Spot'
      const result: PriceResult = {
        price: null,
        timestamp: Date.now(),
        error: errorMessage,
        source: 'KRAKEN_SPOT',
        quoteCurrency,
      }
      return result
    }
  }

  async fetchPrices(symbols: string[], quoteCurrency: QuoteCurrency = 'USD'): Promise<Record<string, PriceResult>> {
    // Fetch prices in parallel
    const promises = symbols.map(symbol => 
      this.fetchPrice(symbol, quoteCurrency).then(result => ({ symbol: symbol.trim().toUpperCase(), result }))
    )
    
    const results = await Promise.all(promises)
    const priceMap: Record<string, PriceResult> = {}
    
    for (const { symbol, result } of results) {
      priceMap[symbol] = result
    }
    
    return priceMap
  }
}

/**
 * Stub providers for future implementation
 */
class MexcProvider implements PriceProvider {
  isAvailable(): boolean {
    return false
  }

  async fetchPrice(symbol: string, quoteCurrency?: QuoteCurrency): Promise<PriceResult> {
    return {
      price: null,
      timestamp: Date.now(),
      error: 'MEXC is not implemented yet',
      source: 'MEXC',
      quoteCurrency,
    }
  }

  async fetchPrices(symbols: string[], quoteCurrency?: QuoteCurrency): Promise<Record<string, PriceResult>> {
    const results: Record<string, PriceResult> = {}
    for (const symbol of symbols) {
      results[symbol.trim().toUpperCase()] = await this.fetchPrice(symbol, quoteCurrency)
    }
    return results
  }
}

/**
 * Get price provider instance for a given source
 */
export function getPriceProvider(source: CryptoPriceSource): PriceProvider {
  switch (source) {
    case 'KRAKEN_SPOT':
      return new KrakenSpotProvider()
    case 'MEXC':
      return new MexcProvider()
    default:
      // Default to Kraken Spot for unknown sources
      return new KrakenSpotProvider()
  }
}

/**
 * Fetch crypto prices using the specified price source and quote currency
 * This is the main entry point for fetching prices
 */
export async function fetchCryptoPricesBySource(
  symbols: string[],
  priceSource: CryptoPriceSource,
  quoteCurrency: QuoteCurrency = 'USD'
): Promise<Record<string, number>> {
  const provider = getPriceProvider(priceSource)
  const results = await provider.fetchPrices(symbols, quoteCurrency)
  
  // Convert PriceResult map to simple price map (filter out errors)
  const prices: Record<string, number> = {}
  for (const [symbol, result] of Object.entries(results)) {
    if (result.price !== null) {
      prices[symbol] = result.price
    }
  }
  
  return prices
}

/**
 * Fetch single crypto price using the specified price source and quote currency
 */
export async function fetchCryptoPriceBySource(
  symbol: string,
  priceSource: CryptoPriceSource,
  quoteCurrency: QuoteCurrency = 'USD'
): Promise<number | null> {
  const provider = getPriceProvider(priceSource)
  const result = await provider.fetchPrice(symbol, quoteCurrency)
  return result.price
}

