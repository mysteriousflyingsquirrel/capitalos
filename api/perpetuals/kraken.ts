import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import crypto from 'crypto'

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

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com/derivatives/api/v3'

/**
 * Signs a request for Kraken Futures API using HMAC SHA256
 */
function signKrakenRequest(apiSecret: string, nonce: string, endpoint: string, postData: string): string {
  const message = nonce + endpoint + postData
  return crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('base64')
}

/**
 * Makes an authenticated request to Kraken Futures API
 */
async function makeAuthenticatedRequest(
  apiKey: string,
  apiSecret: string,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  postData: string = ''
): Promise<any> {
  const nonce = Date.now().toString()
  const signature = signKrakenRequest(apiSecret, nonce, endpoint, postData)

  const url = `${KRAKEN_FUTURES_BASE_URL}${endpoint}`
  
  const headers: Record<string, string> = {
    'APIKey': apiKey,
    'Nonce': nonce,
    'Authent': signature,
    'Content-Type': 'application/json',
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' && postData ? postData : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Kraken Futures API error (${response.status}): ${errorText}`)
  }

  return await response.json()
}

/**
 * Fetches open positions from Kraken Futures API
 */
async function fetchOpenPositions(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsOpenPosition[]> {
  try {
    const data = await makeAuthenticatedRequest(apiKey, apiSecret, '/openpositions', 'GET')

    const positions: PerpetualsOpenPosition[] = []

    if (data.result && Array.isArray(data.result)) {
      for (const pos of data.result) {
        const size = parseFloat(pos.size || '0')
        
        // Filter out positions with zero size
        if (Math.abs(size) < 0.0001) {
          continue
        }

        const symbol = pos.symbol || pos.instrument || ''
        const averagePrice = parseFloat(pos.averagePrice || pos.price || '0')
        const markPrice = parseFloat(pos.markPrice || '0')
        const margin = parseFloat(pos.margin || pos.collateral || '0')
        
        // Calculate unrealized PnL: (markPrice - averagePrice) * size
        // For short positions (negative size), PnL is inverted
        const unrealizedPnl = size !== 0 && markPrice > 0 && averagePrice > 0
          ? (markPrice - averagePrice) * size
          : parseFloat(pos.unrealizedPnl || pos.pnl || '0')
        
        // Determine position side
        const positionSide: 'LONG' | 'SHORT' | null = size > 0 ? 'LONG' : size < 0 ? 'SHORT' : null

        positions.push({
          id: `kraken-pos-${symbol}-${pos.fillId || Date.now()}`,
          ticker: symbol,
          margin,
          pnl: unrealizedPnl,
          platform: 'Kraken Futures',
          fundingRate: null, // Will be fetched separately if needed
          leverage: pos.leverage ? parseFloat(pos.leverage) : null,
          positionSide,
        })
      }
    }

    return positions
  } catch (error) {
    console.error('Error fetching Kraken open positions:', error)
    throw error
  }
}

/**
 * Fetches open orders from Kraken Futures API
 */
async function fetchOpenOrders(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsOpenOrder[]> {
  try {
    const data = await makeAuthenticatedRequest(apiKey, apiSecret, '/openorders', 'GET')

    const orders: PerpetualsOpenOrder[] = []

    if (data.result && Array.isArray(data.result)) {
      for (const order of data.result) {
        const symbol = order.symbol || order.instrument || ''
        const side = order.side || 'UNKNOWN'
        const type = order.type || order.orderType || 'UNKNOWN'
        const price = parseFloat(order.limitPrice || order.price || '0')
        const priceDisplay = price > 0 ? ` @ ${price}` : ''
        const name = `${symbol} ${side} ${type}${priceDisplay}`

        orders.push({
          id: `kraken-order-${order.orderId || order.id || Date.now()}`,
          name,
          margin: null, // Per-order margin not available from API
          platform: 'Kraken Futures',
        })
      }
    }

    return orders
  } catch (error) {
    console.error('Error fetching Kraken open orders:', error)
    throw error
  }
}

/**
 * Fetches available margin from Kraken Futures API
 * Uses portfolio margin parameters to get account equity
 */
async function fetchAvailableMargin(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsAvailableMargin[]> {
  try {
    // Try to get account information from portfolio margin parameters
    const portfolioData = await makeAuthenticatedRequest(
      apiKey,
      apiSecret,
      '/portfolio-margining/parameters',
      'GET'
    )

    const margins: PerpetualsAvailableMargin[] = []

    // Try to extract available balance from portfolio data
    if (portfolioData.result) {
      const accountValue = parseFloat(portfolioData.result.accountValue || portfolioData.result.equity || '0')
      const marginUsed = parseFloat(portfolioData.result.marginUsed || portfolioData.result.margin || '0')
      const availableBalance = accountValue - marginUsed

      if (availableBalance > 0) {
        margins.push({
          id: 'kraken-margin-USD',
          asset: 'USD',
          margin: availableBalance,
          platform: 'Kraken Futures',
        })
      }
    }

    // If portfolio data doesn't have the info, try wallets endpoint
    if (margins.length === 0) {
      try {
        const walletsData = await makeAuthenticatedRequest(apiKey, apiSecret, '/wallets', 'GET')
        
        if (walletsData.result && Array.isArray(walletsData.result)) {
          for (const wallet of walletsData.result) {
            const asset = wallet.currency || 'USD'
            const available = parseFloat(wallet.available || wallet.balance || '0')
            
            if (available > 0 && (asset === 'USD' || asset === 'USDT' || asset === 'USDC')) {
              margins.push({
                id: `kraken-margin-${asset}`,
                asset,
                margin: available,
                platform: 'Kraken Futures',
              })
            }
          }
        }
      } catch (walletError) {
        console.warn('Failed to fetch wallets data:', walletError)
      }
    }

    return margins
  } catch (error) {
    console.error('Error fetching Kraken available margin:', error)
    return []
  }
}

/**
 * Fetches locked margin from Kraken Futures API
 */
async function fetchLockedMargin(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsLockedMargin[]> {
  try {
    const portfolioData = await makeAuthenticatedRequest(
      apiKey,
      apiSecret,
      '/portfolio-margining/parameters',
      'GET'
    )

    const lockedMargins: PerpetualsLockedMargin[] = []

    if (portfolioData.result) {
      const marginUsed = parseFloat(portfolioData.result.marginUsed || portfolioData.result.margin || '0')
      
      if (marginUsed > 0) {
        lockedMargins.push({
          id: 'kraken-locked-margin-USD',
          asset: 'USD',
          margin: marginUsed,
          platform: 'Kraken Futures',
        })
      }
    }

    return lockedMargins
  } catch (error) {
    console.error('Error fetching Kraken locked margin:', error)
    return []
  }
}

/**
 * Fetches all Perpetuals data from Kraken Futures API
 */
async function fetchKrakenPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  // Fetch positions, orders, and margin in parallel
  const [openPositions, openOrders, availableMargin, lockedMargin] = await Promise.all([
    fetchOpenPositions(apiKey, apiSecret),
    fetchOpenOrders(apiKey, apiSecret),
    fetchAvailableMargin(apiKey, apiSecret),
    fetchLockedMargin(apiKey, apiSecret),
  ])

  return {
    openPositions,
    openOrders,
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

    // Load user settings to get API keys
    const settingsDoc = await db.collection(`users/${uid}/settings`).doc('user').get()
    
    if (!settingsDoc.exists) {
      return res.status(404).json({ error: 'User settings not found' })
    }

    const settings = settingsDoc.data()
    const apiKey = settings?.apiKeys?.krakenApiKey
    const apiSecret = settings?.apiKeys?.krakenApiSecretKey

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ 
        error: 'Kraken Futures API credentials not configured. Please configure API Key and Secret Key in Settings.' 
      })
    }

    // Fetch data from Kraken Futures API
    const perpetualsData = await fetchKrakenPerpetualsData(apiKey, apiSecret)

    // Return the data
    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    console.error('Error fetching Kraken Futures Perpetuals data:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

