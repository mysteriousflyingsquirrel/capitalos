const HYPERLIQUID_BASE_URL = 'https://api.hyperliquid.xyz'

function extractSymbol(universeEntry: any): string | null {
  if (typeof universeEntry === 'string') return universeEntry
  if (typeof universeEntry === 'object' && universeEntry !== null) {
    return universeEntry.name || universeEntry.coin || universeEntry.token || universeEntry.symbol || null
  }
  return null
}

async function fetchMeta(dex: string = ''): Promise<{ universe: any[] } | null> {
  try {
    const requestBody: any = { type: 'meta' }
    if (dex) requestBody.dex = dex

    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
    if (!response.ok) return null

    const data = await response.json()
    let universe: any[] = []
    if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0])) {
        universe = data[0]
      } else if (data.length > 0 && data[0]?.universe && Array.isArray(data[0].universe)) {
        universe = data[0].universe
      }
    } else if (data?.universe && Array.isArray(data.universe)) {
      universe = data.universe
    }
    return { universe }
  } catch {
    return null
  }
}

async function fetchAllPerpDexs(): Promise<string[]> {
  try {
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'perpDexs' }),
    })
    if (!response.ok) return ['']

    const data = await response.json()
    const dexNames: string[] = []

    if (Array.isArray(data)) {
      if (data.length > 0 && data[0] === null && data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          const dex = data[i]
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') dexNames.push(dex.name)
        }
      } else if (data.length > 1 && Array.isArray(data[1])) {
        for (const dex of data[1]) {
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') dexNames.push(dex.name)
        }
      } else if (data.every((item: any) => item && typeof item === 'object' && typeof item.name === 'string')) {
        for (const dex of data) {
          if (dex && typeof dex.name === 'string') dexNames.push(dex.name)
        }
      }
    }

    return ['', ...new Set(dexNames)]
  } catch {
    return ['']
  }
}

async function dexContainsSilver(dex: string): Promise<boolean> {
  try {
    const meta = await fetchMeta(dex)
    if (!meta) return false
    for (const entry of meta.universe) {
      const symbol = extractSymbol(entry)
      if (symbol && symbol.toUpperCase().includes('SILVER')) return true
    }
    return false
  } catch {
    return false
  }
}

async function fetchUserState(walletAddress: string, dex: string = ''): Promise<any> {
  const requestBody: any = { type: 'clearinghouseState', user: walletAddress }
  if (dex) requestBody.dex = dex

  const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
  }

  return await response.json()
}

async function getDexsToQuery(): Promise<string[]> {
  const allDexs = await fetchAllPerpDexs()
  let dexWithSilver: string | null = null
  for (const dex of allDexs) {
    if (dex) {
      const hasSilver = await dexContainsSilver(dex)
      if (hasSilver) { dexWithSilver = dex; break }
    }
  }
  const dexs = ['']
  if (dexWithSilver) dexs.push(dexWithSilver)
  return dexs
}

export interface ExchangeBalance {
  id: string
  item: string
  holdings: number
  platform: string
}

/**
 * Fetch total account equity from Hyperliquid across all DEXs.
 * Returns exchange balance entries suitable for perpetualsData.
 */
export async function fetchHyperliquidAccountEquity(walletAddress: string): Promise<ExchangeBalance[]> {
  try {
    const dexsToQuery = await getDexsToQuery()
    let totalAccountValue = 0

    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        let accountValue = 0

        const marginSummary = userState?.clearinghouseState?.marginSummary ?? userState?.marginSummary
        if (marginSummary?.accountValue !== undefined) {
          const value = marginSummary.accountValue
          accountValue = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : 0
        }

        totalAccountValue += accountValue
      } catch {
        continue
      }
    }

    if (totalAccountValue > 0) {
      return [{
        id: 'hyperliquid-account-equity',
        item: 'Hyperliquid',
        holdings: totalAccountValue,
        platform: 'Hyperliquid',
      }]
    }

    return []
  } catch {
    return []
  }
}
