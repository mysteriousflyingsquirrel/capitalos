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
  console.log('[Kraken API] makeAuthenticatedRequest called', { endpoint, method, hasPostData: !!postData })
  
  const nonce = Date.now().toString()
  const signature = signKrakenRequest(apiSecret, nonce, endpoint, postData)
  console.log('[Kraken API] Request signed', { nonce, signatureLength: signature.length })

  const url = `${KRAKEN_FUTURES_BASE_URL}${endpoint}`
  console.log('[Kraken API] Request URL:', url)
  
  const headers: Record<string, string> = {
    'APIKey': apiKey,
    'Nonce': nonce,
    'Authent': signature,
    'Content-Type': 'application/json',
  }
  console.log('[Kraken API] Request headers:', { 
    APIKey: apiKey ? `${apiKey.substring(0, 4)}...` : 'missing',
    Nonce: nonce,
    Authent: signature ? `${signature.substring(0, 10)}...` : 'missing',
  })

  try {
    console.log('[Kraken API] Sending request...')
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' && postData ? postData : undefined,
    })
    
    console.log('[Kraken API] Response received', { 
      status: response.status, 
      statusText: response.statusText,
      ok: response.ok,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Kraken API] Response error:', { status: response.status, errorText })
      throw new Error(`Kraken Futures API error (${response.status}): ${errorText}`)
    }

    const jsonData = await response.json()
    console.log('[Kraken API] Response JSON:', JSON.stringify(jsonData).substring(0, 500))
    return jsonData
  } catch (error) {
    console.error('[Kraken API] Request failed:', error)
    if (error instanceof Error) {
      console.error('[Kraken API] Error details:', { message: error.message, stack: error.stack })
    }
    throw error
  }
}

/**
 * Fetches open positions from Kraken Futures API
 */
async function fetchOpenPositions(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsOpenPosition[]> {
  console.log('[Kraken API] fetchOpenPositions called')
  try {
    // Try POST first (Kraken Futures v3 typically uses POST for authenticated endpoints)
    let data
    try {
      console.log('[Kraken API] Trying POST request for /openpositions')
      data = await makeAuthenticatedRequest(apiKey, apiSecret, '/openpositions', 'POST', '{}')
    } catch (postError) {
      console.log('[Kraken API] POST failed, trying GET:', postError)
      data = await makeAuthenticatedRequest(apiKey, apiSecret, '/openpositions', 'GET')
    }
    console.log('[Kraken API] Open positions raw data (full):', JSON.stringify(data, null, 2))
    console.log('[Kraken API] Open positions data keys:', data ? Object.keys(data) : 'null')
    console.log('[Kraken API] Open positions data.result:', data?.result)
    console.log('[Kraken API] Open positions data.result type:', typeof data?.result)
    console.log('[Kraken API] Open positions data.result isArray:', Array.isArray(data?.result))

    const positions: PerpetualsOpenPosition[] = []

    // Check multiple possible response structures
    let positionsArray = null
    if (data.result && Array.isArray(data.result)) {
      positionsArray = data.result
    } else if (Array.isArray(data)) {
      positionsArray = data
    } else if (data.positions && Array.isArray(data.positions)) {
      positionsArray = data.positions
    } else if (data.openPositions && Array.isArray(data.openPositions)) {
      positionsArray = data.openPositions
    } else {
      console.log('[Kraken API] Could not find positions array in response. Full data structure:', {
        hasResult: !!data.result,
        resultType: typeof data.result,
        resultIsArray: Array.isArray(data.result),
        dataKeys: data ? Object.keys(data) : [],
        fullData: data,
      })
    }

    if (positionsArray) {
      console.log('[Kraken API] Processing', positionsArray.length, 'positions')
      for (const pos of positionsArray) {
        console.log('[Kraken API] Processing position (raw):', JSON.stringify(pos, null, 2))
        console.log('[Kraken API] Position keys:', Object.keys(pos))
        
        const size = parseFloat(pos.size || pos.qty || pos.quantity || pos.volume || pos.positionSize || '0')
        console.log('[Kraken API] Processing position:', { 
          symbol: pos.symbol || pos.instrument || pos.ticker,
          size,
          rawSize: pos.size || pos.qty || pos.quantity || pos.volume || pos.positionSize,
        })
        
        // Filter out positions with zero size
        if (Math.abs(size) < 0.0001) {
          console.log('[Kraken API] Skipping position with zero size')
          continue
        }

        const symbol = pos.symbol || pos.instrument || pos.ticker || pos.contract || ''
        const averagePrice = parseFloat(pos.averagePrice || pos.entryPrice || pos.price || pos.averageEntryPrice || '0')
        const markPrice = parseFloat(pos.markPrice || pos.lastPrice || pos.currentPrice || pos.marketPrice || '0')
        const margin = parseFloat(pos.margin || pos.collateral || pos.initialMargin || pos.marginUsed || '0')
        
        // Calculate unrealized PnL: (markPrice - averagePrice) * size
        // For short positions (negative size), PnL is inverted
        // Try to get PnL from API first, otherwise calculate it
        const unrealizedPnl = parseFloat(
          pos.unrealizedPnl || 
          pos.unrealizedPnL || 
          pos.pnl || 
          pos.profitLoss || 
          pos.unrealizedProfit || 
          (size !== 0 && markPrice > 0 && averagePrice > 0 ? String((markPrice - averagePrice) * size) : '0')
        )
        
        // Determine position side
        const positionSide: 'LONG' | 'SHORT' | null = size > 0 ? 'LONG' : size < 0 ? 'SHORT' : null

        const position = {
          id: `kraken-pos-${symbol}-${pos.fillId || Date.now()}`,
          ticker: symbol,
          margin,
          pnl: unrealizedPnl,
          platform: 'Kraken Futures',
          fundingRate: null, // Will be fetched separately if needed
          leverage: pos.leverage ? parseFloat(pos.leverage) : null,
          positionSide,
        }
        console.log('[Kraken API] Created position:', position)
        positions.push(position)
      }
    } else {
      console.log('[Kraken API] No positions found or invalid data structure:', { 
        hasResult: !!data.result, 
        isArray: Array.isArray(data.result),
        dataKeys: data ? Object.keys(data) : 'no data',
      })
    }

    console.log('[Kraken API] Returning', positions.length, 'positions')
    return positions
  } catch (error) {
    console.error('[Kraken API] Error fetching open positions:', error)
    if (error instanceof Error) {
      console.error('[Kraken API] Error details:', { message: error.message, stack: error.stack })
    }
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
  console.log('[Kraken API] fetchOpenOrders called')
  try {
    // Try POST first (Kraken Futures v3 typically uses POST for authenticated endpoints)
    let data
    try {
      console.log('[Kraken API] Trying POST request for /openorders')
      data = await makeAuthenticatedRequest(apiKey, apiSecret, '/openorders', 'POST', '{}')
    } catch (postError) {
      console.log('[Kraken API] POST failed, trying GET:', postError)
      data = await makeAuthenticatedRequest(apiKey, apiSecret, '/openorders', 'GET')
    }
    console.log('[Kraken API] Open orders raw data (full):', JSON.stringify(data, null, 2))
    console.log('[Kraken API] Open orders data keys:', data ? Object.keys(data) : 'null')

    const orders: PerpetualsOpenOrder[] = []

    // Check multiple possible response structures
    let ordersArray = null
    if (data.result && Array.isArray(data.result)) {
      ordersArray = data.result
    } else if (Array.isArray(data)) {
      ordersArray = data
    } else if (data.orders && Array.isArray(data.orders)) {
      ordersArray = data.orders
    } else if (data.openOrders && Array.isArray(data.openOrders)) {
      ordersArray = data.openOrders
    } else {
      console.log('[Kraken API] Could not find orders array in response. Full data structure:', {
        hasResult: !!data.result,
        resultType: typeof data.result,
        resultIsArray: Array.isArray(data.result),
        dataKeys: data ? Object.keys(data) : [],
        fullData: data,
      })
    }

    if (ordersArray) {
      console.log('[Kraken API] Processing', ordersArray.length, 'orders')
      for (const order of ordersArray) {
        const symbol = order.symbol || order.instrument || ''
        const side = order.side || 'UNKNOWN'
        const type = order.type || order.orderType || 'UNKNOWN'
        const price = parseFloat(order.limitPrice || order.price || '0')
        const priceDisplay = price > 0 ? ` @ ${price}` : ''
        const name = `${symbol} ${side} ${type}${priceDisplay}`

        const orderObj = {
          id: `kraken-order-${order.orderId || order.id || Date.now()}`,
          name,
          margin: null, // Per-order margin not available from API
          platform: 'Kraken Futures',
        }
        console.log('[Kraken API] Created order:', orderObj)
        orders.push(orderObj)
      }
    } else {
      console.log('[Kraken API] No orders found or invalid data structure:', { 
        hasResult: !!data.result, 
        isArray: Array.isArray(data.result),
        dataKeys: data ? Object.keys(data) : 'no data',
      })
    }

    console.log('[Kraken API] Returning', orders.length, 'orders')
    return orders
  } catch (error) {
    console.error('[Kraken API] Error fetching open orders:', error)
    if (error instanceof Error) {
      console.error('[Kraken API] Error details:', { message: error.message, stack: error.stack })
    }
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
  console.log('[Kraken API] fetchAvailableMargin called')
  try {
    // Try to get account information from portfolio margin parameters
    console.log('[Kraken API] Fetching portfolio margin parameters...')
    let portfolioData
    try {
      console.log('[Kraken API] Trying POST request for /portfolio-margining/parameters')
      portfolioData = await makeAuthenticatedRequest(
        apiKey,
        apiSecret,
        '/portfolio-margining/parameters',
        'POST',
        '{}'
      )
    } catch (postError) {
      console.log('[Kraken API] POST failed, trying GET:', postError)
      portfolioData = await makeAuthenticatedRequest(
        apiKey,
        apiSecret,
        '/portfolio-margining/parameters',
        'GET'
      )
    }
    console.log('[Kraken API] Portfolio data:', JSON.stringify(portfolioData).substring(0, 1000))

    const margins: PerpetualsAvailableMargin[] = []

    // Try to extract available balance from portfolio data
    if (portfolioData.result) {
      console.log('[Kraken API] Processing portfolio data result')
      const accountValue = parseFloat(portfolioData.result.accountValue || portfolioData.result.equity || '0')
      const marginUsed = parseFloat(portfolioData.result.marginUsed || portfolioData.result.margin || '0')
      const availableBalance = accountValue - marginUsed
      console.log('[Kraken API] Calculated values:', { accountValue, marginUsed, availableBalance })

      if (availableBalance > 0) {
        const margin = {
          id: 'kraken-margin-USD',
          asset: 'USD',
          margin: availableBalance,
          platform: 'Kraken Futures',
        }
        console.log('[Kraken API] Adding available margin:', margin)
        margins.push(margin)
      }
    } else {
      console.log('[Kraken API] No portfolio data result found')
    }

    // If portfolio data doesn't have the info, try wallets endpoint
    if (margins.length === 0) {
      console.log('[Kraken API] No margins from portfolio, trying wallets endpoint...')
      try {
        let walletsData
        try {
          console.log('[Kraken API] Trying POST request for /wallets')
          walletsData = await makeAuthenticatedRequest(apiKey, apiSecret, '/wallets', 'POST', '{}')
        } catch (postError) {
          console.log('[Kraken API] POST failed, trying GET:', postError)
          walletsData = await makeAuthenticatedRequest(apiKey, apiSecret, '/wallets', 'GET')
        }
        console.log('[Kraken API] Wallets data (full):', JSON.stringify(walletsData, null, 2))
        
        if (walletsData.result && Array.isArray(walletsData.result)) {
          console.log('[Kraken API] Processing', walletsData.result.length, 'wallets')
          for (const wallet of walletsData.result) {
            const asset = wallet.currency || 'USD'
            const available = parseFloat(wallet.available || wallet.balance || '0')
            console.log('[Kraken API] Wallet:', { asset, available })
            
            if (available > 0 && (asset === 'USD' || asset === 'USDT' || asset === 'USDC')) {
              const margin = {
                id: `kraken-margin-${asset}`,
                asset,
                margin: available,
                platform: 'Kraken Futures',
              }
              console.log('[Kraken API] Adding wallet margin:', margin)
              margins.push(margin)
            }
          }
        } else {
          console.log('[Kraken API] No wallets result or invalid structure')
        }
      } catch (walletError) {
        console.warn('[Kraken API] Failed to fetch wallets data:', walletError)
        if (walletError instanceof Error) {
          console.warn('[Kraken API] Wallet error details:', { message: walletError.message })
        }
      }
    }

    console.log('[Kraken API] Returning', margins.length, 'available margins')
    return margins
  } catch (error) {
    console.error('[Kraken API] Error fetching available margin:', error)
    if (error instanceof Error) {
      console.error('[Kraken API] Error details:', { message: error.message, stack: error.stack })
    }
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
  console.log('[Kraken API] fetchLockedMargin called')
  try {
    console.log('[Kraken API] Fetching portfolio margin parameters for locked margin...')
    let portfolioData
    try {
      console.log('[Kraken API] Trying POST request for /portfolio-margining/parameters')
      portfolioData = await makeAuthenticatedRequest(
        apiKey,
        apiSecret,
        '/portfolio-margining/parameters',
        'POST',
        '{}'
      )
    } catch (postError) {
      console.log('[Kraken API] POST failed, trying GET:', postError)
      portfolioData = await makeAuthenticatedRequest(
        apiKey,
        apiSecret,
        '/portfolio-margining/parameters',
        'GET'
      )
    }
    console.log('[Kraken API] Portfolio data for locked margin:', JSON.stringify(portfolioData).substring(0, 1000))

    const lockedMargins: PerpetualsLockedMargin[] = []

    if (portfolioData.result) {
      console.log('[Kraken API] Processing portfolio result for locked margin')
      const marginUsed = parseFloat(portfolioData.result.marginUsed || portfolioData.result.margin || '0')
      console.log('[Kraken API] Margin used:', marginUsed)
      
      if (marginUsed > 0) {
        const lockedMargin = {
          id: 'kraken-locked-margin-USD',
          asset: 'USD',
          margin: marginUsed,
          platform: 'Kraken Futures',
        }
        console.log('[Kraken API] Adding locked margin:', lockedMargin)
        lockedMargins.push(lockedMargin)
      } else {
        console.log('[Kraken API] No locked margin (marginUsed <= 0)')
      }
    } else {
      console.log('[Kraken API] No portfolio result found for locked margin')
    }

    console.log('[Kraken API] Returning', lockedMargins.length, 'locked margins')
    return lockedMargins
  } catch (error) {
    console.error('[Kraken API] Error fetching locked margin:', error)
    if (error instanceof Error) {
      console.error('[Kraken API] Error details:', { message: error.message, stack: error.stack })
    }
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
  console.log('[Kraken API] fetchKrakenPerpetualsData called, fetching all data in parallel...')
  
  try {
    // Fetch positions, orders, and margin in parallel
    const [openPositions, openOrders, availableMargin, lockedMargin] = await Promise.all([
      fetchOpenPositions(apiKey, apiSecret).catch(err => {
        console.error('[Kraken API] Error fetching open positions:', err)
        return []
      }),
      fetchOpenOrders(apiKey, apiSecret).catch(err => {
        console.error('[Kraken API] Error fetching open orders:', err)
        return []
      }),
      fetchAvailableMargin(apiKey, apiSecret).catch(err => {
        console.error('[Kraken API] Error fetching available margin:', err)
        return []
      }),
      fetchLockedMargin(apiKey, apiSecret).catch(err => {
        console.error('[Kraken API] Error fetching locked margin:', err)
        return []
      }),
    ])

    console.log('[Kraken API] All data fetched:', {
      positionsCount: openPositions.length,
      ordersCount: openOrders.length,
      availableMarginCount: availableMargin.length,
      lockedMarginCount: lockedMargin.length,
    })

    const result = {
      openPositions,
      openOrders,
      availableMargin,
      lockedMargin,
    }
    
    console.log('[Kraken API] Returning perpetuals data')
    return result
  } catch (error) {
    console.error('[Kraken API] Error in fetchKrakenPerpetualsData:', error)
    throw error
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[Kraken API] Handler called', { method: req.method, query: req.query })
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    console.log('[Kraken API] Method not allowed:', req.method)
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
    console.log('[Kraken API] Initializing Firebase Admin...')
    // Initialize Firebase Admin
    initializeAdmin()
    console.log('[Kraken API] Firebase Admin initialized')

    // Get user ID from query
    const uid = req.query?.uid as string
    console.log('[Kraken API] UID from query:', uid)

    if (!uid || typeof uid !== 'string') {
      console.log('[Kraken API] Invalid UID')
      return res.status(400).json({ 
        error: 'User ID (uid) is required. Provide it as a query parameter ?uid=your-user-id' 
      })
    }

    const db = admin.firestore()
    console.log('[Kraken API] Loading user settings...')

    // Load user settings to get API keys
    const settingsDoc = await db.collection(`users/${uid}/settings`).doc('user').get()
    console.log('[Kraken API] Settings doc exists:', settingsDoc.exists)
    
    if (!settingsDoc.exists) {
      console.log('[Kraken API] User settings not found')
      return res.status(404).json({ error: 'User settings not found' })
    }

    const settings = settingsDoc.data()
    console.log('[Kraken API] Settings loaded, checking for API keys...')
    console.log('[Kraken API] Settings keys:', settings?.apiKeys ? Object.keys(settings.apiKeys) : 'no apiKeys object')
    
    const apiKey = settings?.apiKeys?.krakenApiKey
    const apiSecret = settings?.apiKeys?.krakenApiSecretKey

    console.log('[Kraken API] API Key present:', !!apiKey, 'Length:', apiKey?.length || 0)
    console.log('[Kraken API] API Secret present:', !!apiSecret, 'Length:', apiSecret?.length || 0)

    if (!apiKey || !apiSecret) {
      console.log('[Kraken API] Credentials not configured')
      return res.status(400).json({ 
        error: 'Kraken Futures API credentials not configured. Please configure API Key and Secret Key in Settings.' 
      })
    }

    console.log('[Kraken API] Credentials found, fetching data from Kraken Futures API...')
    // Fetch data from Kraken Futures API
    const perpetualsData = await fetchKrakenPerpetualsData(apiKey, apiSecret)
    console.log('[Kraken API] Data fetched:', {
      hasData: !!perpetualsData,
      positionsCount: perpetualsData?.openPositions?.length || 0,
      ordersCount: perpetualsData?.openOrders?.length || 0,
      availableMarginCount: perpetualsData?.availableMargin?.length || 0,
      lockedMarginCount: perpetualsData?.lockedMargin?.length || 0,
    })

    // Return the data
    console.log('[Kraken API] Returning success response')
    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    console.error('[Kraken API] Error caught:', error)
    if (error instanceof Error) {
      console.error('[Kraken API] Error message:', error.message)
      console.error('[Kraken API] Error stack:', error.stack)
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

