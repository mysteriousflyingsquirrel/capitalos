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
}

interface PerpetualsOpenOrder {
  id: string
  name: string
  margin: number // in USD/USDT
  platform: string
}

interface PerpetualsAvailableMargin {
  id: string
  asset: string
  margin: number // in USD/USDT
  platform: string
}

interface PerpetualsData {
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
  availableMargin: PerpetualsAvailableMargin[]
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

      positions.push({
        id: `aster-pos-${symbol}-${pos.updateTime || Date.now()}`,
        ticker: symbol,
        margin,
        pnl: unrealizedPnl,
        platform: 'Aster',
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

  if (Array.isArray(data)) {
    for (const order of data) {
      const symbol = order.symbol || ''
      const side = order.side || 'UNKNOWN'
      const type = order.type || 'UNKNOWN'
      const price = parseFloat(order.price || '0')
      
      // Build human-readable name
      const name = `${symbol} ${side} ${type}${price > 0 ? ` @ ${price}` : ''}`

      // Note: Aster API doesn't provide per-order margin, so we set to 0
      // The locked margin is accounted for at the account level
      orders.push({
        id: `aster-order-${order.orderId || Date.now()}`,
        name,
        margin: 0, // Per-order margin not available from API
        platform: 'Aster',
      })
    }
  }

  return orders
}

/**
 * Fetches available margin from Aster API
 */
async function fetchAvailableMargin(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsAvailableMargin[]> {
  // Fetch balance first
  const balanceQueryString = buildSignedQueryString({}, apiSecret)
  const balanceUrl = `${ASTER_BASE_URL}/fapi/v2/balance?${balanceQueryString}`

  const balanceResponse = await fetch(balanceUrl, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  })

  if (!balanceResponse.ok) {
    const errorText = await balanceResponse.text()
    throw new Error(`Aster API error (${balanceResponse.status}): ${errorText}`)
  }

  const balanceData = await balanceResponse.json()

  const margins: PerpetualsAvailableMargin[] = []

  if (Array.isArray(balanceData)) {
    for (const asset of balanceData) {
      const assetName = asset.asset || ''
      const availableBalance = parseFloat(asset.availableBalance || '0')
      
      // Only include assets with available balance > 0
      // Focus on common collateral assets (USDT, USDC, etc.)
      if (availableBalance > 0 && (assetName === 'USDT' || assetName === 'USDC' || assetName === 'BUSD')) {
        margins.push({
          id: `aster-margin-${assetName}`,
          asset: assetName,
          margin: availableBalance,
          platform: 'Aster',
        })
      }
    }
  }

  // Optionally fetch account data for validation (but don't use it for display yet)
  try {
    const accountQueryString = buildSignedQueryString({}, apiSecret)
    const accountUrl = `${ASTER_BASE_URL}/fapi/v4/account?${accountQueryString}`
    
    const accountResponse = await fetch(accountUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (accountResponse.ok) {
      const accountData = await accountResponse.json()
      // Account data available for future use/sanity checks
      // availableBalance, marginUsed, walletBalance, etc.
      console.log('Account data fetched for validation:', {
        availableBalance: accountData.availableBalance,
        marginUsed: accountData.totalMarginUsed,
        walletBalance: accountData.totalWalletBalance,
      })
    }
  } catch (error) {
    // Don't fail if account endpoint fails - it's optional for validation
    console.warn('Failed to fetch account data for validation:', error)
  }

  return margins
}

/**
 * Fetches all Perpetuals data from Aster API
 */
async function fetchAsterPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  // Fetch all data in parallel
  const [openPositions, openOrders, availableMargin] = await Promise.all([
    fetchOpenPositions(apiKey, apiSecret),
    fetchOpenOrders(apiKey, apiSecret),
    fetchAvailableMargin(apiKey, apiSecret),
  ])

  return {
    openPositions,
    openOrders,
    availableMargin,
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

