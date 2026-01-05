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

interface PerpetualsLockedMargin {
  id: string
  asset: string
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
  lockedMargin: PerpetualsLockedMargin[] // Asset-based locked margin from /fapi/v4/account
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
 * Fetches asset-based locked margin from Aster account endpoint
 */
async function fetchLockedMargin(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsLockedMargin[]> {
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

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text()
      console.warn(`Failed to fetch account data (${accountResponse.status}): ${errorText}`)
      return []
    }

    const accountData = await accountResponse.json()
    
    const lockedMargins: PerpetualsLockedMargin[] = []
    
    // Try to extract per-asset locked margin from assets array
    if (accountData.assets && Array.isArray(accountData.assets)) {
      let sumPerAsset = 0
      
      for (const asset of accountData.assets) {
        // Check for openOrderInitialMargin field (exact field name may vary)
        // Try multiple possible field names
        const openOrderInitialMargin = parseFloat(
          asset.openOrderInitialMargin || 
          asset.initialMargin || 
          '0'
        )
        
        if (openOrderInitialMargin > 0) {
          const assetName = asset.asset || 'UNKNOWN'
          lockedMargins.push({
            id: `aster-locked-${assetName}`,
            asset: assetName,
            margin: openOrderInitialMargin,
            platform: 'Aster',
          })
          sumPerAsset += openOrderInitialMargin
        }
      }
      
      // Validation: compare sum of per-asset values with total
      const totalOpenOrderInitialMargin = parseFloat(accountData.totalOpenOrderInitialMargin || '0')
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] Locked margin validation:', {
          sumPerAsset,
          totalOpenOrderInitialMargin,
          difference: Math.abs(sumPerAsset - totalOpenOrderInitialMargin),
        })
      }
      
      // If we found per-asset data, return it
      if (lockedMargins.length > 0) {
        return lockedMargins
      }
    }
    
    // Fallback: if per-asset data not available, create single total entry
    const totalOpenOrderInitialMargin = parseFloat(accountData.totalOpenOrderInitialMargin || '0')
    
    if (totalOpenOrderInitialMargin > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[DEBUG] Per-asset openOrderInitialMargin field not found in assets array. Using totalOpenOrderInitialMargin as fallback.')
      }
      
      lockedMargins.push({
        id: 'aster-locked-total',
        asset: 'Open Orders (Total)',
        margin: totalOpenOrderInitialMargin,
        platform: 'Aster',
      })
    }
    
    return lockedMargins
  } catch (error) {
    console.warn('Failed to fetch locked margin from account data:', error)
    return []
  }
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

  return margins
}

/**
 * Fetches all Perpetuals data from Aster API
 */
async function fetchAsterPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  // Fetch positions, locked margin, and available margin in parallel
  const [openPositions, lockedMargin, availableMargin] = await Promise.all([
    fetchOpenPositions(apiKey, apiSecret),
    fetchLockedMargin(apiKey, apiSecret),
    fetchAvailableMargin(apiKey, apiSecret),
  ])

  return {
    openPositions,
    lockedMargin,
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

