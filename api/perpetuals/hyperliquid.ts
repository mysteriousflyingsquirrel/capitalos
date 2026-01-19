import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'

// Initialize Firebase Admin SDK
let adminInitialized = false

function initializeAdmin() {
  if (adminInitialized) {
    return
  }

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      admin.initializeApp()
    }
    adminInitialized = true
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error)
    throw new Error('Firebase Admin initialization failed')
  }
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
  activity: string // Limit, Stop, Limit Stop, etc.
  side: 'Buy' | 'Sell' // normalized from "B"/"A"
  price: number // display price (numeric)
  priceDisplay: string // formatted price (e.g., "87000" or "85000 → 87000")
  size: number // USD notional
  amount: number // token amount
  platform: string // "Hyperliquid"
}

interface PerpetualsData {
  exchangeBalance: ExchangeBalance[]
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
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
            if (isNaN(entryPrice) || !isFinite(entryPrice)) {
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
            if (isNaN(liquidationPrice) || !isFinite(liquidationPrice)) {
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
            id: `hyperliquid-pos-${symbol}-${dex || 'default'}-${Date.now()}`,
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
    return null
  }
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
          
          const token = order.coin
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
          
          if (amount <= 0) {
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
            if (isNaN(limitPx) || !isFinite(limitPx)) {
              limitPx = null
            }
          }
          
          if (order.triggerPx !== undefined && order.triggerPx !== null) {
            if (typeof order.triggerPx === 'string') {
              triggerPx = parseFloat(order.triggerPx)
            } else if (typeof order.triggerPx === 'number') {
              triggerPx = order.triggerPx
            }
            if (isNaN(triggerPx) || !isFinite(triggerPx)) {
              triggerPx = null
            }
          }
          
          const isTrigger = order.isTrigger === true || order.isTrigger === 'true' || !!triggerPx
          
          // Determine activity
          let activity = 'Limit'
          if (isTrigger) {
            const orderType = order.orderType || ''
            // Check if orderType indicates a limit order
            if (orderType.toLowerCase().includes('limit') || (limitPx !== null && triggerPx !== null)) {
              activity = 'Limit Stop'
            } else {
              activity = 'Stop'
            }
            
            // Optionally append trigger condition
            if (order.triggerCondition) {
              const condition = order.triggerCondition
              if (condition === 'Above' || condition === 'above') {
                activity += ' Above'
              } else if (condition === 'Below' || condition === 'below') {
                activity += ' Below'
              }
            }
          }
          
          // Determine price display
          let price: number
          let priceDisplay: string
          
          if (!isTrigger) {
            // Regular limit order
            price = limitPx || 0
            priceDisplay = limitPx !== null ? limitPx.toString() : '0'
          } else {
            // Trigger order
            if (limitPx !== null && triggerPx !== null) {
              // Stop-limit: show both
              price = limitPx // Use limit price as the main price
              priceDisplay = `${triggerPx} → ${limitPx}`
            } else if (triggerPx !== null) {
              // Stop order with only trigger
              price = triggerPx
              priceDisplay = triggerPx.toString()
            } else {
              // Fallback
              price = limitPx || 0
              priceDisplay = limitPx !== null ? limitPx.toString() : '0'
            }
          }
          
          // Calculate size (USD notional)
          // For stop-limit, use limitPx; otherwise use triggerPx if available, else limitPx
          const priceForNotional = isTrigger && limitPx !== null
            ? limitPx  // Use limit for stop-limit
            : (triggerPx !== null ? triggerPx : (limitPx !== null ? limitPx : 0))
          
          const sizeUsd = amount * priceForNotional
          
          allOrders.push({
            id: `hyperliquid-order-${token}-${dex || 'default'}-${Date.now()}-${Math.random()}`,
            token,
            activity,
            side,
            price,
            priceDisplay,
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
    
    return allOrders
  } catch (error) {
    return []
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
  const [openPositions, exchangeBalance, openOrders] = await Promise.all([
    fetchOpenPositions(walletAddress),
    fetchAccountEquity(walletAddress),
    fetchOpenOrders(walletAddress),
  ])

  return {
    exchangeBalance,
    openPositions,
    openOrders,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()

    // Get wallet address from request body (passed from client)
    const { uid, walletAddress } = req.body as {
      uid?: string
      walletAddress?: string
    }

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ 
        error: 'User ID (uid) is required in request body' 
      })
    }

    if (!walletAddress) {
      return res.status(400).json({ 
        error: 'Hyperliquid wallet address is required in request body' 
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