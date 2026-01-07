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

// Types matching the frontend
interface PerpetualsOpenPosition {
  id: string
  ticker: string
  margin: number // in USD/USDT
  pnl: number // in USD/USDT
  platform: string
  fundingRate?: number | null // funding rate as decimal (e.g., 0.00002 for 0.002%)
  leverage?: number | null // leverage (e.g., 1 for 1x)
  positionSide?: 'LONG' | 'SHORT' | null // position direction
}

interface PerpetualsOpenOrder {
  id: string
  name: string
  margin: number | null // in USD/USDT, null when not available from API
  platform: string
}

interface PerpetualsAvailableMargin {
  id: string
  asset: string
  margin: number // in USD/USDT
  platform: string
}

interface PerpetualsLockedMargin {
  id: string
  asset: string
  margin: number
  platform: string
}

interface PerpetualsData {
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
  availableMargin: PerpetualsAvailableMargin[]
  lockedMargin: PerpetualsLockedMargin[]
}

const HYPERLIQUID_BASE_URL = 'https://api.hyperliquid.xyz'

/**
 * Fetches user state from Hyperliquid API
 * Uses POST /info endpoint with user address
 */
async function fetchUserState(walletAddress: string): Promise<any> {
  try {
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: walletAddress,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching Hyperliquid user state:', error)
    throw error
  }
}

/**
 * Fetches funding rate for a symbol from Hyperliquid API
 */
async function fetchFundingRate(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'metaAndAssetCtxs',
      }),
    })

    if (!response.ok) {
      console.warn(`Failed to fetch funding rate for ${symbol}: ${response.status}`)
      return null
    }

    const data = await response.json()
    
    // Find the asset context for this symbol
    if (data.assetContexts && Array.isArray(data.assetContexts)) {
      const asset = data.assetContexts.find((ctx: any) => ctx.name === symbol)
      if (asset && asset.fundingRate !== undefined) {
        return parseFloat(asset.fundingRate)
      }
    }

    return null
  } catch (error) {
    console.warn(`Error fetching funding rate for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetches open positions from Hyperliquid API
 */
async function fetchOpenPositions(walletAddress: string): Promise<PerpetualsOpenPosition[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    // Extract positions from user state
    // Note: Structure may vary - adjust based on actual API response
    const positions: PerpetualsOpenPosition[] = []
    
    if (userState.assetPositions && Array.isArray(userState.assetPositions)) {
      // Collect unique symbols for funding rate fetching
      const symbols = new Set<string>()
      
      for (const pos of userState.assetPositions) {
        const position = pos.position || pos
        const size = parseFloat(position.szi || position.size || '0')
        
        // Filter out zero-size positions
        if (Math.abs(size) < 0.0001) {
          continue
        }

        const symbol = position.coin || position.symbol || ''
        if (symbol) {
          symbols.add(symbol)
        }
      }

      // Fetch funding rates for all symbols in parallel
      const fundingRatePromises = Array.from(symbols).map(async (symbol) => {
        const rate = await fetchFundingRate(symbol)
        return { symbol, rate }
      })
      const fundingRates = await Promise.all(fundingRatePromises)
      const fundingRateMap = new Map<string, number | null>()
      fundingRates.forEach(({ symbol, rate }) => {
        fundingRateMap.set(symbol, rate)
      })

      // Process positions
      for (const pos of userState.assetPositions) {
        const position = pos.position || pos
        const size = parseFloat(position.szi || position.size || '0')
        
        if (Math.abs(size) < 0.0001) {
          continue
        }

        const symbol = position.coin || position.symbol || ''
        const entryPx = parseFloat(position.entryPx || position.entryPrice || '0')
        const leverage = position.leverage ? parseFloat(position.leverage) : null
        
        // Calculate margin and PnL
        // Margin is typically the collateral used
        const margin = parseFloat(position.marginUsed || position.margin || '0')
        
        // PnL calculation: (currentPrice - entryPrice) * size
        // For now, use unrealizedPnl if available, otherwise calculate
        const unrealizedPnl = position.unrealizedPnl !== undefined
          ? parseFloat(position.unrealizedPnl)
          : 0 // Will need mark price to calculate properly
        
        // Determine position side: positive size = LONG, negative = SHORT
        const positionSide: 'LONG' | 'SHORT' | null = size > 0 ? 'LONG' : size < 0 ? 'SHORT' : null
        const fundingRate = fundingRateMap.get(symbol) ?? null

        positions.push({
          id: `hyperliquid-pos-${symbol}-${Date.now()}`,
          ticker: symbol,
          margin,
          pnl: unrealizedPnl,
          platform: 'Hyperliquid',
          fundingRate,
          leverage,
          positionSide,
        })
      }
    }

    return positions
  } catch (error) {
    console.error('Error fetching Hyperliquid open positions:', error)
    throw error
  }
}

/**
 * Fetches available margin from Hyperliquid API
 */
async function fetchAvailableMargin(walletAddress: string): Promise<PerpetualsAvailableMargin[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    const margins: PerpetualsAvailableMargin[] = []
    
    // Extract available balance from user state
    // Structure may vary - adjust based on actual API response
    if (userState.marginSummary) {
      const availableBalance = parseFloat(userState.marginSummary.accountValue || userState.marginSummary.availableBalance || '0')
      
      if (availableBalance > 0) {
        margins.push({
          id: 'hyperliquid-margin-USDC',
          asset: 'USDC', // Hyperliquid typically uses USDC
          margin: availableBalance,
          platform: 'Hyperliquid',
        })
      }
    } else if (userState.balances) {
      // Alternative structure: check balances
      for (const balance of userState.balances) {
        const asset = balance.coin || balance.asset || 'USDC'
        const available = parseFloat(balance.available || balance.availableBalance || '0')
        
        if (available > 0) {
          margins.push({
            id: `hyperliquid-margin-${asset}`,
            asset,
            margin: available,
            platform: 'Hyperliquid',
          })
        }
      }
    }

    return margins
  } catch (error) {
    console.error('Error fetching Hyperliquid available margin:', error)
    return []
  }
}

/**
 * Fetches locked margin from Hyperliquid API
 */
async function fetchLockedMargin(walletAddress: string): Promise<PerpetualsLockedMargin[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    const lockedMargins: PerpetualsLockedMargin[] = []
    
    // Extract locked margin from user state
    // Structure may vary - adjust based on actual API response
    if (userState.marginSummary) {
      const marginUsed = parseFloat(userState.marginSummary.marginUsed || userState.marginSummary.totalMarginUsed || '0')
      
      if (marginUsed > 0) {
        lockedMargins.push({
          id: 'hyperliquid-locked-margin-USDC',
          asset: 'USDC',
          margin: marginUsed,
          platform: 'Hyperliquid',
        })
      }
    }

    return lockedMargins
  } catch (error) {
    console.error('Error fetching Hyperliquid locked margin:', error)
    return []
  }
}

/**
 * Fetches all Perpetuals data from Hyperliquid API
 */
async function fetchHyperliquidPerpetualsData(
  walletAddress: string
): Promise<PerpetualsData> {
  // Fetch positions, margin in parallel
  const [openPositions, availableMargin, lockedMargin] = await Promise.all([
    fetchOpenPositions(walletAddress),
    fetchAvailableMargin(walletAddress),
    fetchLockedMargin(walletAddress),
  ])

  return {
    openPositions,
    openOrders: [], // Hyperliquid may not have open orders endpoint or different structure
    availableMargin,
    lockedMargin,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
    // Initialize Firebase Admin
    initializeAdmin()

    // Get user ID from query
    const uid = req.query?.uid as string

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ 
        error: 'User ID (uid) is required. Provide it as a query parameter ?uid=your-user-id' 
      })
    }

    const db = admin.firestore()

    // Load user settings to get wallet address
    const settingsDoc = await db.collection(`users/${uid}/settings`).doc('user').get()
    
    if (!settingsDoc.exists) {
      return res.status(404).json({ error: 'User settings not found' })
    }

    const settings = settingsDoc.data()
    const walletAddress = settings?.apiKeys?.hyperliquidWalletAddress

    if (!walletAddress) {
      return res.status(400).json({ 
        error: 'Hyperliquid wallet address not configured. Please configure Wallet Address in Settings.' 
      })
    }

    // Fetch data from Hyperliquid API
    const perpetualsData = await fetchHyperliquidPerpetualsData(walletAddress)

    // Return the data
    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    console.error('Error fetching Hyperliquid Perpetuals data:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

