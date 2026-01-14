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
  leverage?: number | null // leverage (e.g., 1 for 1x)
  positionSide?: 'LONG' | 'SHORT' | null // position direction
}

interface PerpetualsOpenOrder {
  id: string
  name: string
  margin: number | null // in USD/USDT, null when not available from API
  platform: string
}

interface ExchangeBalance {
  id: string
  item: string
  holdings: number
  platform: string
}

interface PerpetualsData {
  exchangeBalance: ExchangeBalance[]
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
}

const ASTER_BASE_URL = 'https://fapi.asterdex.com'

/**
 * Signs a request for Aster API using HMAC SHA256
 */
function signAsterRequest(apiSecret: string, queryString: string): string {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex')
}

/**
 * Builds a signed query string for Aster API requests
 */
function buildSignedQueryString(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  // Add timestamp
  const timestamp = Date.now()
  const allParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
    timestamp: String(timestamp),
  }

  // Sort parameters alphabetically
  const sortedKeys = Object.keys(allParams).sort()
  const queryString = sortedKeys
    .map(key => `${key}=${encodeURIComponent(allParams[key])}`)
    .join('&')

  // Generate signature
  const signature = signAsterRequest(apiSecret, queryString)

  // Return query string with signature
  return `${queryString}&signature=${signature}`
}


/**
 * Fetches open positions from Aster API
 */
async function fetchOpenPositions(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsOpenPosition[]> {
  const queryString = buildSignedQueryString({}, apiSecret)
  const url = `${ASTER_BASE_URL}/fapi/v2/positionRisk?${queryString}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Aster API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  // Filter out positions with zero size and map to our format
  const positions: PerpetualsOpenPosition[] = []
  
  if (Array.isArray(data)) {
    // First, collect all unique symbols
    const symbols = new Set<string>()
    for (const pos of data) {
      const positionAmt = parseFloat(pos.positionAmt || '0')
      if (Math.abs(positionAmt) >= 0.0001) {
        const symbol = pos.symbol || ''
        if (symbol) {
          symbols.add(symbol)
        }
      }
    }

    // Now process positions
    for (const pos of data) {
      // Filter out positions where positionAmt is 0 or very close to 0
      const positionAmt = parseFloat(pos.positionAmt || '0')
      if (Math.abs(positionAmt) < 0.0001) {
        continue
      }

      const symbol = pos.symbol || ''
      // Use isolatedMargin if available, otherwise use initialMargin
      const margin = parseFloat(pos.isolatedMargin || pos.initialMargin || '0')
      const unrealizedPnl = parseFloat(pos.unRealizedProfit || '0')
      
      // Extract leverage
      const leverage = pos.leverage !== undefined && pos.leverage !== null
        ? parseFloat(pos.leverage || '0')
        : null
      
      // Determine position side: if positionAmt is positive = LONG, negative = SHORT
      // Also check positionSide field if available
      let positionSide: 'LONG' | 'SHORT' | null = null
      if (pos.positionSide) {
        // Use positionSide field if available (BOTH, LONG, SHORT)
        const side = String(pos.positionSide).toUpperCase()
        if (side === 'LONG' || side === 'SHORT') {
          positionSide = side as 'LONG' | 'SHORT'
        }
      }
      // Fallback: determine from positionAmt
      if (!positionSide) {
        positionSide = positionAmt > 0 ? 'LONG' : positionAmt < 0 ? 'SHORT' : null
      }

      positions.push({
        id: `aster-pos-${symbol}-${pos.updateTime || Date.now()}`,
        ticker: symbol,
        margin,
        pnl: unrealizedPnl,
        platform: 'Aster',
        leverage,
        positionSide,
      })
    }
  }

  return positions
}

/**
 * Fetches open orders from Aster API
 */
async function fetchOpenOrders(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsOpenOrder[]> {
  const queryString = buildSignedQueryString({}, apiSecret)
  const url = `${ASTER_BASE_URL}/fapi/v1/openOrders?${queryString}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Aster API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  const orders: PerpetualsOpenOrder[] = []
  let ordersWithZeroPrice = 0
  let ordersWithStopPrice = 0

  if (Array.isArray(data)) {
    for (const order of data) {
      const symbol = order.symbol || ''
      const side = order.side || 'UNKNOWN'
      const type = order.type || 'UNKNOWN'
      const price = parseFloat(order.price || '0')
      const stopPrice = parseFloat(order.stopPrice || '0')
      
      // Debug logging: track orders with price == 0 and stopPrice > 0
      if (price === 0) {
        ordersWithZeroPrice++
        if (stopPrice > 0) {
          ordersWithStopPrice++
        }
      }
      
      // Build human-readable name
      // For STOP_MARKET/TAKE_PROFIT_MARKET orders, use stopPrice if price is 0
      const effectivePrice = price > 0 ? price : (stopPrice > 0 ? stopPrice : 0)
      const priceDisplay = effectivePrice > 0 ? ` @ ${effectivePrice}` : ''
      const name = `${symbol} ${side} ${type}${priceDisplay}`

      // Per-order margin is NOT reliably available from /fapi/v1/openOrders
      // Set to null to indicate unknown value (UI will display "—")
      orders.push({
        id: `aster-order-${order.orderId || Date.now()}`,
        name,
        margin: null, // Per-order margin not available from API
        platform: 'Aster',
      })
    }
  }

  // Debug logging (remove before final commit)
  if (ordersWithZeroPrice > 0) {
    console.log(`[DEBUG] Open orders with price == 0: ${ordersWithZeroPrice}, with stopPrice > 0: ${ordersWithStopPrice}`)
  }

  return orders
}


/**
 * Fetches all Perpetuals data from Aster API
 */
async function fetchAsterPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  // Fetch positions and orders in parallel
  const [openPositions, openOrders] = await Promise.all([
    fetchOpenPositions(apiKey, apiSecret),
    fetchOpenOrders(apiKey, apiSecret),
  ])

  return {
    exchangeBalance: [],
    openPositions,
    openOrders,
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
    const apiKey = settings?.apiKeys?.asterApiKey
    const apiSecret = settings?.apiKeys?.asterApiSecretKey

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ 
        error: 'Aster API credentials not configured. Please configure API Key and Secret Key in Settings.' 
      })
    }

    // Fetch data from Aster API
    const perpetualsData = await fetchAsterPerpetualsData(apiKey, apiSecret)

    // Return the data
    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    console.error('Error fetching Aster Perpetuals data:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    // Handle timestamp errors (retry suggestion)
    if (errorMessage.includes('timestamp') || errorMessage.includes('Timestamp')) {
      return res.status(400).json({
        success: false,
        error: 'Timestamp error. Please try again.',
        details: errorMessage,
      })
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

