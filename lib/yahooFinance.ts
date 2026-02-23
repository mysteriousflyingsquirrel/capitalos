const YAHOO_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

async function fetchYahooQuote(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': YAHOO_USER_AGENT,
    },
  })

  if (!response.ok) return null

  const data = await response.json() as any
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
  if (typeof price !== 'number' || !isFinite(price) || price <= 0) return null

  return price
}

/**
 * Fetch stock prices directly from Yahoo Finance.
 * Returns a map of symbol -> price.
 */
export async function fetchStockPrices(symbols: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))]
  if (unique.length === 0) return {}

  const out: Record<string, number> = {}
  const CONCURRENCY = 10

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map(async (sym) => {
        const price = await fetchYahooQuote(sym)
        return { sym, price }
      })
    )

    for (const entry of settled) {
      if (entry.status === 'fulfilled' && entry.value.price !== null) {
        out[entry.value.sym] = entry.value.price
      }
    }
  }

  return out
}
