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
    console.log('[Hyperliquid] Fetching user state for address:', walletAddress)
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
      console.error('[Hyperliquid] API error response:', response.status, errorText)
      throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    console.log('[Hyperliquid] User state response keys:', Object.keys(data))
    console.log('[Hyperliquid] User state response (first 1000 chars):', JSON.stringify(data).substring(0, 1000))
    
    return data
  } catch (error) {
    console.error('[Hyperliquid] Error fetching user state:', error)
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
    
    console.log('[Hyperliquid] User state structure:', {
      hasAssetPositions: !!userState.assetPositions,
      assetPositionsType: typeof userState.assetPositions,
      isArray: Array.isArray(userState.assetPositions),
      topLevelKeys: Object.keys(userState),
    })
    
    // Extract positions from user state
    // Note: Structure may vary - adjust based on actual API response
    const positions: PerpetualsOpenPosition[] = []
    
    // Try different possible response structures
    let assetPositions: any[] = []
    
    if (userState.assetPositions && Array.isArray(userState.assetPositions)) {
      assetPositions = userState.assetPositions
      console.log('[Hyperliquid] Found assetPositions array with', assetPositions.length, 'items')
    } else if (userState.positions && Array.isArray(userState.positions)) {
      assetPositions = userState.positions
      console.log('[Hyperliquid] Found positions array with', assetPositions.length, 'items')
    } else if (userState.clearinghouseState?.assetPositions && Array.isArray(userState.clearinghouseState.assetPositions)) {
      assetPositions = userState.clearinghouseState.assetPositions
      console.log('[Hyperliquid] Found clearinghouseState.assetPositions array with', assetPositions.length, 'items')
    } else if (userState.clearinghouseState?.userState?.assetPositions && Array.isArray(userState.clearinghouseState.userState.assetPositions)) {
      assetPositions = userState.clearinghouseState.userState.assetPositions
      console.log('[Hyperliquid] Found clearinghouseState.userState.assetPositions array with', assetPositions.length, 'items')
    } else {
      console.warn('[Hyperliquid] No positions array found. Full response structure:', JSON.stringify(userState).substring(0, 2000))
    }
    
    if (assetPositions.length > 0) {
      // Collect unique symbols for funding rate fetching
      const symbols = new Set<string>()
      
      for (const pos of assetPositions) {
        const position = pos.position || pos
        console.log('[Hyperliquid] Processing position:', JSON.stringify(position).substring(0, 500))
        const size = parseFloat(position.szi || position.size || position.position?.szi || position.position?.size || '0')
        
        // Filter out zero-size positions
        if (Math.abs(size) < 0.0001) {
          console.log('[Hyperliquid] Skipping zero-size position')
          continue
        }

        const symbol = position.coin || position.symbol || position.position?.coin || position.position?.symbol || ''
        if (symbol) {
          symbols.add(symbol)
          console.log('[Hyperliquid] Added symbol:', symbol)
        } else {
          console.warn('[Hyperliquid] Position has no symbol:', position)
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
      for (const pos of assetPositions) {
        const position = pos.position || pos
        const size = parseFloat(position.szi || position.size || position.position?.szi || position.position?.size || '0')
        
        if (Math.abs(size) < 0.0001) {
          continue
        }

        const symbol = position.coin || position.symbol || position.position?.coin || position.position?.symbol || ''
        const entryPx = parseFloat(position.entryPx || position.entryPrice || position.position?.entryPx || position.position?.entryPrice || '0')
        
        // Try to get leverage from various possible fields
        const leverage = position.leverage || position.position?.leverage 
          ? parseFloat(position.leverage || position.position?.leverage || '0')
          : null
        
        // Calculate margin and PnL - try multiple field names
        const margin = parseFloat(
          position.marginUsed || 
          position.margin || 
          position.position?.marginUsed || 
          position.position?.margin ||
          position.collateral || 
          position.position?.collateral ||
          '0'
        )
        
        // PnL - try multiple field names
        const unrealizedPnl = parseFloat(
          position.unrealizedPnl || 
          position.unrealizedPnl || 
          position.position?.unrealizedPnl ||
          position.pnl ||
          position.position?.pnl ||
          position.unrealizedPnl ||
          position.position?.unrealizedPnl ||
          '0'
        )
        
        console.log('[Hyperliquid] Position parsed:', {
          symbol,
          size,
          margin,
          pnl: unrealizedPnl,
          leverage,
          entryPx,
        })
        
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
    
    console.log('[Hyperliquid] Total positions found:', positions.length)

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
    
    console.log('[Hyperliquid] Fetching available margin, userState keys:', Object.keys(userState))
    
    const margins: PerpetualsAvailableMargin[] = []
    
    // Extract available balance from user state - try multiple structures
    let availableBalance = 0
    let asset = 'USDC'
    
    // Try clearinghouseState.userState.marginSummary
    if (userState.clearinghouseState?.userState?.marginSummary) {
      const summary = userState.clearinghouseState.userState.marginSummary
      availableBalance = parseFloat(summary.accountValue || summary.availableBalance || summary.accountEquity || '0')
      console.log('[Hyperliquid] Found marginSummary in clearinghouseState.userState:', availableBalance)
    }
    // Try clearinghouseState.marginSummary
    else if (userState.clearinghouseState?.marginSummary) {
      const summary = userState.clearinghouseState.marginSummary
      availableBalance = parseFloat(summary.accountValue || summary.availableBalance || summary.accountEquity || '0')
      console.log('[Hyperliquid] Found marginSummary in clearinghouseState:', availableBalance)
    }
    // Try marginSummary at top level
    else if (userState.marginSummary) {
      availableBalance = parseFloat(userState.marginSummary.accountValue || userState.marginSummary.availableBalance || userState.marginSummary.accountEquity || '0')
      console.log('[Hyperliquid] Found marginSummary at top level:', availableBalance)
    }
    // Try balances array
    else if (userState.balances && Array.isArray(userState.balances)) {
      console.log('[Hyperliquid] Found balances array with', userState.balances.length, 'items')
      for (const balance of userState.balances) {
        const balanceAsset = balance.coin || balance.asset || 'USDC'
        const available = parseFloat(balance.available || balance.availableBalance || '0')
        
        if (available > 0) {
          margins.push({
            id: `hyperliquid-margin-${balanceAsset}`,
            asset: balanceAsset,
            margin: available,
            platform: 'Hyperliquid',
          })
        }
      }
      return margins
    }
    // Try userState.balances
    else if (userState.userState?.balances && Array.isArray(userState.userState.balances)) {
      console.log('[Hyperliquid] Found userState.balances array')
      for (const balance of userState.userState.balances) {
        const balanceAsset = balance.coin || balance.asset || 'USDC'
        const available = parseFloat(balance.available || balance.availableBalance || '0')
        
        if (available > 0) {
          margins.push({
            id: `hyperliquid-margin-${balanceAsset}`,
            asset: balanceAsset,
            margin: available,
            platform: 'Hyperliquid',
          })
        }
      }
      return margins
    }
    
    if (availableBalance > 0) {
      margins.push({
        id: 'hyperliquid-margin-USDC',
        asset: 'USDC',
        margin: availableBalance,
        platform: 'Hyperliquid',
      })
    }
    
    console.log('[Hyperliquid] Available margin found:', margins.length, 'items')
    return margins
  } catch (error) {
    console.error('[Hyperliquid] Error fetching available margin:', error)
    return []
  }
}

/**
 * Fetches locked margin from Hyperliquid API
 */
async function fetchLockedMargin(walletAddress: string): Promise<PerpetualsLockedMargin[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    console.log('[Hyperliquid] Fetching locked margin')
    
    const lockedMargins: PerpetualsLockedMargin[] = []
    
    // Extract locked margin from user state - try multiple structures
    let marginUsed = 0
    
    // Try clearinghouseState.userState.marginSummary
    if (userState.clearinghouseState?.userState?.marginSummary) {
      const summary = userState.clearinghouseState.userState.marginSummary
      marginUsed = parseFloat(summary.marginUsed || summary.totalMarginUsed || summary.marginUsed || '0')
      console.log('[Hyperliquid] Found locked margin in clearinghouseState.userState:', marginUsed)
    }
    // Try clearinghouseState.marginSummary
    else if (userState.clearinghouseState?.marginSummary) {
      const summary = userState.clearinghouseState.marginSummary
      marginUsed = parseFloat(summary.marginUsed || summary.totalMarginUsed || summary.marginUsed || '0')
      console.log('[Hyperliquid] Found locked margin in clearinghouseState:', marginUsed)
    }
    // Try marginSummary at top level
    else if (userState.marginSummary) {
      marginUsed = parseFloat(userState.marginSummary.marginUsed || userState.marginSummary.totalMarginUsed || '0')
      console.log('[Hyperliquid] Found locked margin at top level:', marginUsed)
    }
    
    if (marginUsed > 0) {
      lockedMargins.push({
        id: 'hyperliquid-locked-margin-USDC',
        asset: 'USDC',
        margin: marginUsed,
        platform: 'Hyperliquid',
      })
    }
    
    console.log('[Hyperliquid] Locked margin found:', lockedMargins.length, 'items')
    return lockedMargins
  } catch (error) {
    console.error('[Hyperliquid] Error fetching locked margin:', error)
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

