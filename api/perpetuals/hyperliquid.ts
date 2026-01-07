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
      console.error('[Hyperliquid] API error response:', response.status, errorText)
      throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    
    if (data.clearinghouseState) {
      return data.clearinghouseState
    }
    return data
  } catch (error) {
    console.error('[Hyperliquid] Error fetching user state:', error)
    throw error
  }
}

async function fetchAllFundingRates(): Promise<Map<string, number>> {
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
      console.warn(`Failed to fetch funding rates: ${response.status}`)
      return new Map()
    }

    const data = await response.json()
    
    let universe: any[] = []
    let assetContexts: any[] = []
    
    if (Array.isArray(data) && data.length >= 2) {
      const meta = data[0]
      assetContexts = data[1] || []
      
      if (meta && meta.universe && Array.isArray(meta.universe)) {
        universe = meta.universe
      }
    } else if (data.meta && data.meta.universe) {
      universe = data.meta.universe
      assetContexts = data.assetContexts || []
    }
    
    const fundingRateMap = new Map<string, number>()
    
    for (let i = 0; i < Math.min(universe.length, assetContexts.length); i++) {
      const asset = universe[i]
      const context = assetContexts[i]
      
      if (asset && context) {
        const coin = asset.name || asset.coin || asset.symbol
        const funding = context.funding || context.fundingRate
        
        if (coin && funding !== undefined && funding !== null) {
          const rate = parseFloat(funding)
          fundingRateMap.set(coin, rate)
        }
      }
    }
    
    return fundingRateMap
  } catch (error) {
    console.warn('Error fetching funding rates:', error)
    return new Map()
  }
}

async function fetchOpenPositions(walletAddress: string): Promise<PerpetualsOpenPosition[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    const positions: PerpetualsOpenPosition[] = []
    let assetPositions: any[] = []
    
    if (userState.assetPositions && Array.isArray(userState.assetPositions)) {
      assetPositions = userState.assetPositions
    } else if (userState.positions && Array.isArray(userState.positions)) {
      assetPositions = userState.positions
    } else if (userState.clearinghouseState?.assetPositions && Array.isArray(userState.clearinghouseState.assetPositions)) {
      assetPositions = userState.clearinghouseState.assetPositions
    } else if (userState.clearinghouseState?.userState?.assetPositions && Array.isArray(userState.clearinghouseState.userState.assetPositions)) {
      assetPositions = userState.clearinghouseState.userState.assetPositions
    }
    
    if (assetPositions.length > 0) {
      const symbols = new Set<string>()
      
      for (const pos of assetPositions) {
        const position = pos.position || pos
        const size = parseFloat(position.szi || position.size || position.position?.szi || position.position?.size || '0')
        
        if (Math.abs(size) < 0.0001) {
          continue
        }

        const symbol = position.coin || position.symbol || position.position?.coin || position.position?.symbol || ''
        if (symbol) {
          symbols.add(symbol)
        }
      }

      const fundingRateMap = await fetchAllFundingRates()

      for (const pos of assetPositions) {
        const position = pos.position || pos
        const size = parseFloat(position.szi || position.size || position.position?.szi || position.position?.size || '0')
        
        if (Math.abs(size) < 0.0001) {
          continue
        }

        const symbol = position.coin || position.symbol || position.position?.coin || position.position?.symbol || ''
        
        let leverage: number | null = null
        
        if (position.leverage) {
          if (typeof position.leverage === 'object' && position.leverage.value !== undefined) {
            leverage = parseFloat(position.leverage.value)
          } else if (typeof position.leverage === 'string' || typeof position.leverage === 'number') {
            leverage = parseFloat(position.leverage)
          }
        } else if (pos.leverage) {
          if (typeof pos.leverage === 'object' && pos.leverage.value !== undefined) {
            leverage = parseFloat(pos.leverage.value)
          } else if (typeof pos.leverage === 'string' || typeof pos.leverage === 'number') {
            leverage = parseFloat(pos.leverage)
          }
        }
        
        const margin = parseFloat(
          position.marginUsed || 
          position.margin || 
          position.position?.marginUsed || 
          position.position?.margin ||
          position.collateral || 
          position.position?.collateral ||
          '0'
        )
        
        const unrealizedPnl = parseFloat(
          position.unrealizedPnl || 
          position.position?.unrealizedPnl ||
          position.pnl ||
          position.position?.pnl ||
          '0'
        )
        
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

async function fetchAvailableMargin(walletAddress: string): Promise<PerpetualsAvailableMargin[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    const margins: PerpetualsAvailableMargin[] = []
    let availableBalance = 0
    
    if (userState.clearinghouseState?.userState?.marginSummary) {
      const summary = userState.clearinghouseState.userState.marginSummary
      availableBalance = parseFloat(summary.accountValue || summary.availableBalance || summary.accountEquity || '0')
    } else if (userState.clearinghouseState?.marginSummary) {
      const summary = userState.clearinghouseState.marginSummary
      availableBalance = parseFloat(summary.accountValue || summary.availableBalance || summary.accountEquity || '0')
    } else if (userState.marginSummary) {
      availableBalance = parseFloat(userState.marginSummary.accountValue || userState.marginSummary.availableBalance || userState.marginSummary.accountEquity || '0')
    } else if (userState.balances && Array.isArray(userState.balances)) {
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
    } else if (userState.userState?.balances && Array.isArray(userState.userState.balances)) {
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
    
    return margins
  } catch (error) {
    console.error('[Hyperliquid] Error fetching available margin:', error)
    return []
  }
}

async function fetchLockedMargin(walletAddress: string): Promise<PerpetualsLockedMargin[]> {
  try {
    const userState = await fetchUserState(walletAddress)
    
    const lockedMargins: PerpetualsLockedMargin[] = []
    let marginUsed = 0
    
    if (userState.clearinghouseState?.userState?.marginSummary) {
      const summary = userState.clearinghouseState.userState.marginSummary
      marginUsed = parseFloat(summary.marginUsed || summary.totalMarginUsed || '0')
    } else if (userState.clearinghouseState?.marginSummary) {
      const summary = userState.clearinghouseState.marginSummary
      marginUsed = parseFloat(summary.marginUsed || summary.totalMarginUsed || '0')
    } else if (userState.marginSummary) {
      marginUsed = parseFloat(userState.marginSummary.marginUsed || userState.marginSummary.totalMarginUsed || '0')
    }
    
    if (marginUsed > 0) {
      lockedMargins.push({
        id: 'hyperliquid-locked-margin-USDC',
        asset: 'USDC',
        margin: marginUsed,
        platform: 'Hyperliquid',
      })
    }
    
    return lockedMargins
  } catch (error) {
    console.error('[Hyperliquid] Error fetching locked margin:', error)
    return []
  }
}

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
    openOrders: [],
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

