import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'

let _adminInitialized = false
function initializeAdmin(): void {
  if (_adminInitialized || admin.apps.length > 0) { _adminInitialized = true; return }
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (sa) { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) }) }
    else { admin.initializeApp() }
    _adminInitialized = true
  } catch (e) {
    if (e instanceof Error && e.message.includes('already exists')) { _adminInitialized = true; return }
    throw e
  }
}

async function verifyAuth(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing or invalid Authorization header.' }); return null }
  try { return (await admin.auth().verifyIdToken(h.slice(7))).uid }
  catch { res.status(401).json({ error: 'Invalid or expired authentication token.' }); return null }
}

interface PerpetualsOpenPosition {
  id: string
  ticker: string
  margin: number
  pnl: number
  platform: string
  leverage?: number | null
  positionSide?: 'LONG' | 'SHORT' | null
  // Additional fields for Hyperliquid positions
  amountToken?: number | null // token amount (absolute value of szi)
  entryPrice?: number | null // entry price
  liquidationPrice?: number | null // liquidation price
  fundingFeeUsd?: number | null // total funding fee in USD (cumFunding.sinceOpen)
  returnOnEquity?: number | null // official Hyperliquid ROE (decimal, e.g. 0.15 = 15%)
  positionValue?: number | null // full notional position size in USD (from Hyperliquid positionValue)
}

interface ExchangeBalance {
  id: string
  item: string
  holdings: number
  platform: string
}

interface PerpetualsOpenOrder {
  id: string
  token: string // coin symbol
  type: string // Limit, Stop Market, Stop Limit, Take Profit (Market), Take Profit (Limit), etc.
  side: 'Buy' | 'Sell' // normalized from "B"/"A"
  price: number // limit/execution price (numeric)
  triggerPx: number | null // trigger price for stop/TP orders
  size: number // USD notional
  amount: number // token amount
  platform: string // "Hyperliquid"
}

/**
 * Derive order type from Hyperliquid's frontendOpenOrders response.
 *
 * frontendOpenOrders returns:
 *   orderType: string — "Limit", "Stop Market", "Stop Limit", "Take Profit Market", "Take Profit Limit", etc.
 *   isTrigger: boolean
 *   isPositionTpsl: boolean
 *
 * openOrders (fallback) returns:
 *   orderType: { limit?: {...}, trigger?: { isMarket, tpsl, triggerPx } }
 */
function getOrderType(order: any): string {
  const ot = order?.orderType

  // frontendOpenOrders: orderType is a string
  if (typeof ot === 'string' && ot.length > 0) {
    // Normalize known Hyperliquid strings to our display format
    const normalized = ot.trim()
    if (normalized === 'Limit') return 'Limit'
    if (normalized === 'Stop Market') return 'Stop Market'
    if (normalized === 'Stop Limit') return 'Stop Limit'
    if (normalized === 'Take Profit Market') return 'Take Profit Market'
    if (normalized === 'Take Profit Limit') return 'Take Profit Market'
    // Return as-is for any other string (e.g. "Market")
    return normalized
  }

  // openOrders fallback: orderType is an object
  if (ot && typeof ot === 'object') {
    if (ot.limit) return 'Limit'

    if (ot.trigger) {
      const { isMarket, tpsl } = ot.trigger
      if (tpsl === 'tp') return isMarket ? 'Take Profit (Market)' : 'Take Profit (Limit)'
      if (tpsl === 'sl') return isMarket ? 'Stop Market' : 'Stop Limit'
      return isMarket ? 'Trigger Market' : 'Trigger Limit'
    }
  }

  return 'Unknown'
}

interface PortfolioPnL {
  pnl24hUsd: number | null
  pnl7dUsd: number | null
  pnl30dUsd: number | null
  pnl90dUsd: number | null
}

interface PerpetualsData {
  exchangeBalance: ExchangeBalance[]
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
  portfolioPnL?: PortfolioPnL
}

const HYPERLIQUID_BASE_URL = 'https://api.hyperliquid.xyz'

async function fetchAllPerpDexs(): Promise<string[]> {
  try {
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'perpDexs',
      }),
    })

    if (!response.ok) {
      return [''] // Return default dex if we can't fetch the list
    }

    const data = await response.json()
    
    const dexNames: string[] = []
    
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0] === null && data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          const dex = data[i]
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      } else if (data.length > 1 && Array.isArray(data[1])) {
        const nestedArray = data[1]
        for (const dex of nestedArray) {
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      } else if (data.every((item: any) => item && typeof item === 'object' && typeof item.name === 'string')) {
        for (const dex of data) {
          if (dex && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      }
    }
    
    const uniqueDexNames = [...new Set(dexNames)]
    return ['', ...uniqueDexNames]
  } catch (error) {
    console.error('[Hyperliquid] Failed to fetch perp dexs:', error)
    return ['']
  }
}

function extractSymbol(universeEntry: any): string | null {
  if (typeof universeEntry === 'string') {
    return universeEntry
  }
  if (typeof universeEntry === 'object' && universeEntry !== null) {
    return universeEntry.name || universeEntry.coin || universeEntry.token || universeEntry.symbol || null
  }
  return null
}

async function dexContainsSilver(dex: string): Promise<boolean> {
  try {
    const requestBody: any = {
      type: 'meta',
    }
    
    // Include dex parameter if not empty
    if (dex) {
      requestBody.dex = dex
    }
    
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      return false
    }

    const meta = await fetchMeta(dex)
    if (!meta) {
      return false
    }
    
    const universe = meta.universe
    
    for (const entry of universe) {
      const symbol = extractSymbol(entry)
      if (symbol && symbol.toUpperCase().includes('SILVER')) {
        return true
      }
    }
    
    return false
  } catch (error) {
    return false
  }
}

async function fetchUserState(walletAddress: string, dex: string = ''): Promise<any> {
  try {
    const requestBody: any = {
      type: 'clearinghouseState',
      user: walletAddress,
    }
    
    if (dex) {
      requestBody.dex = dex
    }
    
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data
    }
    
    return data
  } catch (error) {
    throw error
  }
}


async function fetchOpenPositions(walletAddress: string): Promise<PerpetualsOpenPosition[]> {
  try {
    const allDexs = await fetchAllPerpDexs()
    const dexDefault = ''
    let dexWithSilver: string | null = null
    
    for (const dex of allDexs) {
      if (dex && dex !== dexDefault) {
        const containsSilver = await dexContainsSilver(dex)
        if (containsSilver) {
          dexWithSilver = dex
          break
        }
      }
    }
    
    const dexsToQuery = [dexDefault]
    if (dexWithSilver) {
      dexsToQuery.push(dexWithSilver)
    }
    
    const allPositions: PerpetualsOpenPosition[] = []
    
    for (const dex of dexsToQuery) {
      try {
        // Fetch meta data to get szDecimals for formatting
        const meta = await fetchMeta(dex)
        const szDecimalsMap: Record<string, number> = {}
        
        if (meta?.universe) {
          for (const entry of meta.universe) {
            const coin = extractSymbol(entry)
            if (coin) {
              // Extract szDecimals from universe entry
              let szDecimals = 2 // default
              if (typeof entry === 'object' && entry !== null) {
                if (typeof entry.szDecimals === 'number') {
                  szDecimals = entry.szDecimals
                } else if (typeof entry.szDecimals === 'string') {
                  szDecimals = parseInt(entry.szDecimals, 10) || 2
                }
              }
              szDecimalsMap[coin.toUpperCase()] = szDecimals
            }
          }
        }
        
        const userState = await fetchUserState(walletAddress, dex)
        const assetPositions = userState?.assetPositions
        
        if (!assetPositions || !Array.isArray(assetPositions)) {
          continue
        }
        
        for (const pos of assetPositions) {
          const position = pos.position || pos
          
          let size = 0
          let sziRaw: string | number | null = null
          if (typeof position.szi === 'string') {
            size = parseFloat(position.szi)
            sziRaw = position.szi
          } else if (typeof position.szi === 'number') {
            size = position.szi
            sziRaw = position.szi
          } else if (typeof position.size === 'string') {
            size = parseFloat(position.size)
          } else if (typeof position.size === 'number') {
            size = position.size
          }
          
          if (Math.abs(size) < 0.0001) {
            continue
          }

          const symbol = position.coin || position.name || ''
          
          if (!symbol) {
            continue
          }
          
          let leverage: number | null = null
          if (position.leverage && typeof position.leverage === 'object' && position.leverage.value !== undefined) {
            leverage = typeof position.leverage.value === 'string' 
              ? parseFloat(position.leverage.value) 
              : position.leverage.value
          }
          
          let margin = 0
          if (typeof position.marginUsed === 'string') {
            margin = parseFloat(position.marginUsed)
          } else if (typeof position.marginUsed === 'number') {
            margin = position.marginUsed
          }
          
          let unrealizedPnl = 0
          if (typeof position.unrealizedPnl === 'string') {
            unrealizedPnl = parseFloat(position.unrealizedPnl)
          } else if (typeof position.unrealizedPnl === 'number') {
            unrealizedPnl = position.unrealizedPnl
          }

          // Parse returnOnEquity (official Hyperliquid ROE, decimal e.g. 0.15 = 15%)
          let returnOnEquity: number | null = null
          if (position.returnOnEquity !== undefined && position.returnOnEquity !== null) {
            const roe = typeof position.returnOnEquity === 'string'
              ? parseFloat(position.returnOnEquity)
              : typeof position.returnOnEquity === 'number'
                ? position.returnOnEquity
                : NaN
            if (!isNaN(roe) && isFinite(roe)) {
              returnOnEquity = roe
            }
          }

          // Parse positionValue (full notional size in USD)
          let positionValue: number | null = null
          if (position.positionValue !== undefined && position.positionValue !== null) {
            const pv = typeof position.positionValue === 'string'
              ? parseFloat(position.positionValue)
              : typeof position.positionValue === 'number'
                ? position.positionValue
                : NaN
            if (!isNaN(pv) && isFinite(pv)) {
              positionValue = pv
            }
          }
          
          const positionSide: 'LONG' | 'SHORT' | null = size > 0 ? 'LONG' : size < 0 ? 'SHORT' : null

          // Extract new fields
          // Amount: absolute value of szi
          let amountToken: number | null = null
          if (sziRaw !== null) {
            amountToken = Math.abs(size)
          }
          
          // Entry Price: entryPx
          let entryPrice: number | null = null
          if (position.entryPx !== undefined && position.entryPx !== null) {
            if (typeof position.entryPx === 'string') {
              entryPrice = parseFloat(position.entryPx)
            } else if (typeof position.entryPx === 'number') {
              entryPrice = position.entryPx
            }
            if (entryPrice === null || isNaN(entryPrice) || !isFinite(entryPrice)) {
              entryPrice = null
            }
          }
          
          // Liquidation Price: liquidationPx
          let liquidationPrice: number | null = null
          if (position.liquidationPx !== undefined && position.liquidationPx !== null) {
            if (typeof position.liquidationPx === 'string') {
              liquidationPrice = parseFloat(position.liquidationPx)
            } else if (typeof position.liquidationPx === 'number') {
              liquidationPrice = position.liquidationPx
            }
            if (liquidationPrice === null || isNaN(liquidationPrice) || !isFinite(liquidationPrice)) {
              liquidationPrice = null
            }
          }
          
          // Funding Fee: cumFunding.sinceOpen (in USD)
          // Note: Hyperliquid returns funding from the exchange's perspective, so we invert the sign
          // Negative means you paid funding (cost), positive means you received funding (income)
          let fundingFeeUsd: number | null = null
          if (position.cumFunding && typeof position.cumFunding === 'object') {
            const sinceOpen = position.cumFunding.sinceOpen
            if (sinceOpen !== undefined && sinceOpen !== null) {
              let rawValue: number
              if (typeof sinceOpen === 'string') {
                rawValue = parseFloat(sinceOpen)
              } else if (typeof sinceOpen === 'number') {
                rawValue = sinceOpen
              } else {
                rawValue = NaN
              }
              if (!isNaN(rawValue) && isFinite(rawValue)) {
                // Invert sign: Hyperliquid's negative = you paid (should be negative for us)
                // Hyperliquid's positive = you received (should be positive for us)
                fundingFeeUsd = -rawValue
              }
            }
          }

          allPositions.push({
            // Keep id stable so UI can overlay WS positions onto REST (WS uses: hyperliquid-pos-${coin}-${dex||default})
            id: `hyperliquid-pos-${symbol}-${dex || 'default'}`,
            ticker: symbol,
            margin,
            pnl: unrealizedPnl,
            platform: 'Hyperliquid',
            leverage,
            positionSide,
            amountToken,
            entryPrice,
            liquidationPrice,
            fundingFeeUsd,
            returnOnEquity,
            positionValue,
          })
        }
      } catch (error) {
        continue
      }
    }
    
    return allPositions
  } catch (error) {
    throw error
  }
}

async function fetchMeta(dex: string = ''): Promise<{ universe: any[] } | null> {
  try {
    const requestBody: any = {
      type: 'meta',
    }
    
    if (dex) {
      requestBody.dex = dex
    }
    
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      return null
    }

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
  } catch (error) {
    console.error('[Hyperliquid] Failed to fetch meta:', error)
    return null
  }
}



/** Fetch spot metadata to build a map from spot index (@N) to pair name (e.g. BTC/USDC) */
async function fetchSpotTokenMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  try {
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'spotMeta' }),
    })
    if (!response.ok) return map

    const data = await response.json()
    const tokens: any[] = Array.isArray(data?.tokens) ? data.tokens : []
    const universe: any[] = Array.isArray(data?.universe) ? data.universe : []

    // Build token-index-to-name lookup (e.g. 0 → "USDC", 1 → "PURR", 150 → "HYPE")
    const tokenNames: Record<number, string> = {}
    for (const t of tokens) {
      if (t && typeof t.name === 'string' && typeof t.index === 'number') {
        tokenNames[t.index] = t.name
      }
    }

    // Build @index → pair name from universe
    for (const pair of universe) {
      if (!pair || typeof pair.index !== 'number') continue

      let pairName: string | null = null

      // If pair.name is a readable name (not @N), use it directly
      if (typeof pair.name === 'string' && pair.name.length > 0 && !pair.name.startsWith('@')) {
        pairName = pair.name
      } else if (Array.isArray(pair.tokens) && pair.tokens.length >= 2) {
        // Construct name from token indices: tokens[0] = base, tokens[1] = quote
        const baseName = tokenNames[pair.tokens[0]]
        const quoteName = tokenNames[pair.tokens[1]]
        if (baseName && quoteName) {
          pairName = `${baseName}/${quoteName}`
        }
      }

      if (pairName) {
        map[`@${pair.index}`] = pairName
      }
    }
  } catch {
    // non-critical — spot names just won't resolve
  }
  return map
}

async function fetchOpenOrders(walletAddress: string): Promise<PerpetualsOpenOrder[]> {
  try {
    const allDexs = await fetchAllPerpDexs()
    const dexDefault = ''
    let dexWithSilver: string | null = null
    
    for (const dex of allDexs) {
      if (dex && dex !== dexDefault) {
        const containsSilver = await dexContainsSilver(dex)
        if (containsSilver) {
          dexWithSilver = dex
          break
        }
      }
    }
    
    const dexsToQuery = [dexDefault]
    if (dexWithSilver) {
      dexsToQuery.push(dexWithSilver)
    }
    
    // Fetch spot metadata to resolve @N indices to pair names (e.g. @142 → BTC/USDC)
    const spotTokenMap = await fetchSpotTokenMap()
    
    const allOrders: PerpetualsOpenOrder[] = []
    
    for (const dex of dexsToQuery) {
      try {
        // Fetch meta data to get szDecimals for formatting
        const meta = await fetchMeta(dex)
        const szDecimalsMap: Record<string, number> = {}
        
        if (meta?.universe) {
          for (const entry of meta.universe) {
            const coin = extractSymbol(entry)
            if (coin) {
              let szDecimals = 2 // default
              if (typeof entry === 'object' && entry !== null) {
                if (typeof entry.szDecimals === 'number') {
                  szDecimals = entry.szDecimals
                } else if (typeof entry.szDecimals === 'string') {
                  szDecimals = parseInt(entry.szDecimals, 10) || 2
                }
              }
              szDecimalsMap[coin.toUpperCase()] = szDecimals
            }
          }
        }
        
        // Fetch frontendOpenOrders from Hyperliquid
        const requestBody: any = {
          type: 'frontendOpenOrders',
          user: walletAddress,
        }
        
        if (dex) {
          requestBody.dex = dex
        }
        
        const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          continue
        }

        const data = await response.json()
        
        // Handle different response formats
        let orders: any[] = []
        if (Array.isArray(data)) {
          orders = data
        } else if (data && typeof data === 'object' && Array.isArray(data.orders)) {
          orders = data.orders
        } else if (data && typeof data === 'object' && Array.isArray(data.openOrders)) {
          orders = data.openOrders
        }
        
        for (const order of orders) {
          if (!order || !order.coin) {
            continue
          }
          
          // Resolve spot token indices (@N) to human-readable pair names
          const rawCoin: string = order.coin
          const token = rawCoin.startsWith('@') ? (spotTokenMap[rawCoin] || rawCoin) : rawCoin
          const side = order.side === 'B' ? 'Buy' : order.side === 'A' ? 'Sell' : null
          if (!side) {
            continue
          }
          
          // Parse amount (token amount)
          let amount = 0
          if (typeof order.sz === 'string') {
            amount = Math.abs(parseFloat(order.sz))
          } else if (typeof order.sz === 'number') {
            amount = Math.abs(order.sz)
          }
          
          // Only skip zero-size orders for regular limit orders;
          // TP/SL orders tied to positions may have sz=0 (they close the full position at trigger)
          const isTriggerOrder = order.isTrigger === true || order.isTrigger === 'true'
            || order.isPositionTpsl === true || order.isPositionTpsl === 'true'
          if (amount <= 0 && !isTriggerOrder) {
            continue
          }
          
          // Parse prices
          let limitPx: number | null = null
          let triggerPx: number | null = null
          
          if (order.limitPx !== undefined && order.limitPx !== null) {
            if (typeof order.limitPx === 'string') {
              limitPx = parseFloat(order.limitPx)
            } else if (typeof order.limitPx === 'number') {
              limitPx = order.limitPx
            }
            if (limitPx === null || isNaN(limitPx) || !isFinite(limitPx)) {
              limitPx = null
            }
          }
          
          if (order.triggerPx !== undefined && order.triggerPx !== null) {
            if (typeof order.triggerPx === 'string') {
              triggerPx = parseFloat(order.triggerPx)
            } else if (typeof order.triggerPx === 'number') {
              triggerPx = order.triggerPx
            }
            // Treat 0 as null (Hyperliquid returns "0.0" for non-trigger orders)
            if (triggerPx === null || isNaN(triggerPx) || !isFinite(triggerPx) || triggerPx === 0) {
              triggerPx = null
            }
          }
          
          // Determine order type from orderType object structure
          const type = getOrderType(order)

          // Also extract triggerPx from the orderType.trigger object if available
          // (more reliable than the top-level triggerPx which may not always be present)
          if (triggerPx === null && order.orderType?.trigger?.triggerPx != null) {
            const tp = typeof order.orderType.trigger.triggerPx === 'string'
              ? parseFloat(order.orderType.trigger.triggerPx)
              : typeof order.orderType.trigger.triggerPx === 'number'
                ? order.orderType.trigger.triggerPx
                : NaN
            if (!isNaN(tp) && isFinite(tp)) {
              triggerPx = tp
            }
          }
          
          // Price is the limit/execution price
          const price = limitPx || 0
          
          // Calculate size (USD notional) using limitPx (execution price)
          const sizeUsd = amount * price
          
          allOrders.push({
            id: `hyperliquid-order-${token}-${dex || 'default'}-${Date.now()}-${Math.random()}`,
            token,
            type,
            side,
            price,
            triggerPx,
            size: sizeUsd,
            amount,
            platform: 'Hyperliquid',
          })
        }
      } catch (error) {
        // Continue to next DEX on error
        continue
      }
    }
    
    // Sort orders by: 1. Token, 2. Side, 3. Price
    allOrders.sort((a, b) => {
      // 1. Sort by Token (alphabetically, case-insensitive)
      const tokenA = a.token.toUpperCase()
      const tokenB = b.token.toUpperCase()
      if (tokenA !== tokenB) {
        return tokenA.localeCompare(tokenB)
      }
      
      // 2. Sort by Side (Buy before Sell)
      const sideOrder = { 'Buy': 0, 'Sell': 1 }
      const sideA = sideOrder[a.side as keyof typeof sideOrder] ?? 2
      const sideB = sideOrder[b.side as keyof typeof sideOrder] ?? 2
      if (sideA !== sideB) {
        return sideA - sideB
      }
      
      // 3. Sort by Price (ascending)
      return a.price - b.price
    })
    
    return allOrders
  } catch (error) {
    console.error('[Hyperliquid] Failed to fetch open orders:', error)
    return []
  }
}

async function fetchPortfolioPnL(walletAddress: string): Promise<PortfolioPnL> {
  const empty: PortfolioPnL = { pnl24hUsd: null, pnl7dUsd: null, pnl30dUsd: null, pnl90dUsd: null }

  try {
    const resp = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'portfolio', user: walletAddress }),
    })
    if (!resp.ok) return empty

    let data: any = await resp.json()
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as any).data)) {
      data = (data as any).data
    }

    // Build bucket map from tuple array or flat array
    const buckets: Record<string, any> = {}
    if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0]) && data[0].length >= 2) {
        // [["day", {...}], ...]
        for (const pair of data) {
          if (Array.isArray(pair) && typeof pair[0] === 'string') buckets[pair[0]] = pair[1]
        }
      } else {
        // ["day", {...}, ...] (unlikely for portfolio but supported)
        for (let i = 0; i < data.length - 1; i += 2) {
          if (typeof data[i] === 'string') buckets[data[i]] = data[i + 1]
        }
      }
    } else if (data && typeof data === 'object') {
      Object.assign(buckets, data)
    }

    const pick = (preferred: string, fallback: string) => buckets[preferred] ?? buckets[fallback] ?? null

    const dayB = pick('perpDay', 'day')
    const weekB = pick('perpWeek', 'week')
    const monthB = pick('perpMonth', 'month')
    const allB = pick('perpAllTime', 'allTime')

    // ---- history normalization (THIS is the key fix) ----
    const normalizeSeries = (series: any): { ts: number; v: number }[] => {
      if (!Array.isArray(series) || series.length === 0) return []

      // Case A: tuple format: [[ts, v], [ts, v], ...]
      if (Array.isArray(series[0])) {
        const pts = series
          .filter(p => Array.isArray(p) && p.length >= 2)
          .map(p => ({ ts: Number(p[0]), v: Number(p[1]) }))
          .filter(p => Number.isFinite(p.ts) && Number.isFinite(p.v))
        pts.sort((a, b) => a.ts - b.ts)
        return pts
      }

      // Case B: flat format: [ts, v, ts, v, ...]
      const pts: { ts: number; v: number }[] = []
      for (let i = 0; i < series.length - 1; i += 2) {
        const ts = Number(series[i])
        const v = Number(series[i + 1])
        if (Number.isFinite(ts) && Number.isFinite(v)) pts.push({ ts, v })
      }
      pts.sort((a, b) => a.ts - b.ts)
      return pts
    }

    const getPnlPoints = (b: any) => normalizeSeries(b?.pnlHistory ?? b?.pnl_history ?? [])
    const getEqPoints = (b: any) => normalizeSeries(b?.accountValueHistory ?? b?.account_value_history ?? [])

    const deltaFromBucket = (b: any): number | null => {
      if (!b) return null

      const pnlPts = getPnlPoints(b)
      if (pnlPts.length >= 2) return pnlPts[pnlPts.length - 1].v - pnlPts[0].v
      if (pnlPts.length === 1) return 0

      // fallback to equity curve if pnlHistory missing
      const eqPts = getEqPoints(b)
      if (eqPts.length >= 2) return eqPts[eqPts.length - 1].v - eqPts[0].v
      if (eqPts.length === 1) return 0

      return null
    }

    const pnl24hUsd = deltaFromBucket(dayB)
    const pnl7dUsd = deltaFromBucket(weekB)
    const pnl30dUsd = deltaFromBucket(monthB)

    let pnl90dUsd: number | null = null
    if (allB) {
      // prefer pnl points; fallback to equity
      let pts = getPnlPoints(allB)
      if (pts.length < 2) pts = getEqPoints(allB)

      if (pts.length >= 2) {
        const target = Date.now() - 90 * 24 * 60 * 60 * 1000
        let closest = pts[0]
        let best = Math.abs(closest.ts - target)
        for (const p of pts) {
          const d = Math.abs(p.ts - target)
          if (d < best) { best = d; closest = p }
        }
        const latest = pts[pts.length - 1]
        pnl90dUsd = closest.ts === latest.ts ? null : (latest.v - closest.v)
      }
    }

    return { pnl24hUsd, pnl7dUsd, pnl30dUsd, pnl90dUsd }
  } catch {
    return empty
  }
}


async function fetchAccountEquity(walletAddress: string): Promise<ExchangeBalance[]> {
  try {
    const allDexs = await fetchAllPerpDexs()
    const dexDefault = ''
    let dexWithSilver: string | null = null
    
    for (const dex of allDexs) {
      if (dex && dex !== dexDefault) {
        const containsSilver = await dexContainsSilver(dex)
        if (containsSilver) {
          dexWithSilver = dex
          break
        }
      }
    }
    
    const dexsToQuery = [dexDefault]
    if (dexWithSilver) {
      dexsToQuery.push(dexWithSilver)
    }
    
    let totalAccountValue = 0
    
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        
        let accountValue = 0
        if (userState?.clearinghouseState?.marginSummary?.accountValue !== undefined) {
          const value = userState.clearinghouseState.marginSummary.accountValue
          if (typeof value === 'string') {
            accountValue = parseFloat(value)
          } else if (typeof value === 'number') {
            accountValue = value
          }
        } else if (userState?.marginSummary?.accountValue !== undefined) {
          const value = userState.marginSummary.accountValue
          if (typeof value === 'string') {
            accountValue = parseFloat(value)
          } else if (typeof value === 'number') {
            accountValue = value
          }
        }
        
        totalAccountValue += accountValue
      } catch (error) {
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
  } catch (error) {
    return []
  }
}

async function fetchHyperliquidPerpetualsData(
  walletAddress: string
): Promise<PerpetualsData> {
  const [openPositions, exchangeBalance, openOrders, portfolioPnL] = await Promise.all([
    fetchOpenPositions(walletAddress),
    fetchAccountEquity(walletAddress),
    fetchOpenOrders(walletAddress),
    fetchPortfolioPnL(walletAddress),
  ])

  return {
    exchangeBalance,
    openPositions,
    openOrders,
    portfolioPnL,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()
    const uid = await verifyAuth(req, res)
    if (!uid) return

    const { walletAddress } = req.body as { walletAddress?: string }

    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ 
        error: 'Hyperliquid wallet address is required in request body and must be a string' 
      })
    }

    const perpetualsData = await fetchHyperliquidPerpetualsData(walletAddress)

    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}