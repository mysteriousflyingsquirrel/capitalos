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
  margin: number | null // in USD/USDT, null when not available from API
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
  lockedMargin: number | null // Account-level locked margin from /accounts (in USD/USDT)
}

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com'
const KRAKEN_FUTURES_API_PATH = '/derivatives/api/v3'

/**
 * Generates Kraken Futures v3 signature
 * Reference: https://docs.kraken.com/api/docs/guides/futures-rest/
 * 
 * Steps:
 * 1. Build postData as URL-encoded query string (for GET: query params without "?")
 * 2. nonce = current time in ms as string
 * 3. message = postData + nonce + endpointPath
 * 4. sha256 = SHA256(message) (binary digest)
 * 5. secretDecoded = Base64Decode(apiSecret)
 * 6. hmac = HMAC_SHA512(secretDecoded, sha256) (binary digest)
 * 7. authent = Base64Encode(hmac)
 */
function generateKrakenSignature(
  apiSecret: string,
  nonce: string,
  endpointPath: string,
  postData: string = ''
): string {
  // Step 3: message = postData + nonce + endpointPath
  const message = postData + nonce + endpointPath
  
  console.log('[Kraken Signature] Generating signature:', {
    postData: postData.substring(0, 100), // Log first 100 chars
    postDataLength: postData.length,
    nonce,
    endpointPath,
    messageLength: message.length,
    messagePreview: message.substring(0, 150), // Log first 150 chars
  })
  
  // Step 4: sha256 = SHA256(message)
  const sha256 = crypto.createHash('sha256').update(message).digest()
  console.log('[Kraken Signature] SHA256 computed:', {
    sha256Length: sha256.length,
    sha256Hex: sha256.toString('hex').substring(0, 32) + '...',
  })
  
  // Step 5: secretDecoded = Base64Decode(apiSecret)
  const secretDecoded = Buffer.from(apiSecret, 'base64')
  console.log('[Kraken Signature] Secret decoded:', {
    apiSecretLength: apiSecret.length,
    secretDecodedLength: secretDecoded.length,
    secretDecodedPreview: secretDecoded.toString('hex').substring(0, 32) + '...',
  })
  
  // Step 6: hmac = HMAC_SHA512(secretDecoded, sha256)
  const hmac = crypto.createHmac('sha512', secretDecoded).update(sha256).digest()
  console.log('[Kraken Signature] HMAC computed:', {
    hmacLength: hmac.length,
    hmacHex: hmac.toString('hex').substring(0, 32) + '...',
  })
  
  // Step 7: authent = Base64Encode(hmac)
  const authent = hmac.toString('base64')
  console.log('[Kraken Signature] Final signature (Base64):', {
    authentLength: authent.length,
    authentPreview: authent.substring(0, 32) + '...',
  })
  
  return authent
}

/**
 * Makes an authenticated request to Kraken Futures API
 * @param endpoint - The endpoint path (e.g., "/accounts", "/openpositions")
 * @param apiKey - Public API key
 * @param apiSecret - Base64-encoded secret key
 * @param method - HTTP method (GET or POST)
 * @param queryParams - Query parameters for GET requests (will be URL-encoded)
 */
async function krakenFuturesRequest<T>(
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  method: 'GET' | 'POST' = 'GET',
  queryParams: Record<string, string> = {}
): Promise<T> {
  // Step 2: nonce = current time in ms as string
  const nonce = Date.now().toString()
  
  // Build postData: for GET requests, this is the URL-encoded query string (without "?")
  // Step 1: Build postData as "&" concatenated string of request parameters
  let postData = ''
  if (method === 'GET' && Object.keys(queryParams).length > 0) {
    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    postData = queryString
  } else if (method === 'POST') {
    // For POST, postData would be the request body (URL-encoded)
    postData = Object.entries(queryParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
  }
  
  // endpointPath must be the full path as used in the request
  // Example: "/derivatives/api/v3/accounts"
  const endpointPath = `${KRAKEN_FUTURES_API_PATH}${endpoint}`
  
  // Generate signature
  const signature = generateKrakenSignature(apiSecret, nonce, endpointPath, postData)
  
  // Build URL
  const url = `${KRAKEN_FUTURES_BASE_URL}${endpointPath}${postData ? `?${postData}` : ''}`
  
  const headers: Record<string, string> = {
    'APIKey': apiKey,
    'Authent': signature,
    'Nonce': nonce, // Always include Nonce header
    'Content-Type': 'application/json',
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (method === 'POST' && postData) {
    options.body = postData
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  // Log full request details
  console.log('[Kraken API] ========== REQUEST START ==========')
  console.log('[Kraken API] Endpoint:', endpoint)
  console.log('[Kraken API] Full Endpoint Path:', endpointPath)
  console.log('[Kraken API] Method:', method)
  console.log('[Kraken API] Full URL:', url)
  console.log('[Kraken API] Headers:', {
    APIKey: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING',
    Authent: signature ? `${signature.substring(0, 16)}...${signature.substring(signature.length - 8)}` : 'MISSING',
    Nonce: nonce,
    'Content-Type': headers['Content-Type'],
  })
  console.log('[Kraken API] Post Data:', postData || '(empty)')
  console.log('[Kraken API] Post Data Length:', postData.length)
  console.log('[Kraken API] API Key Length:', apiKey?.length || 0)
  console.log('[Kraken API] API Secret Length:', apiSecret?.length || 0)
  console.log('[Kraken API] Signature Length:', signature?.length || 0)
  console.log('[Kraken API] Request Options:', {
    method: options.method,
    hasBody: !!options.body,
    bodyLength: options.body ? String(options.body).length : 0,
  })

  try {
    const requestStartTime = Date.now()
    const response = await fetch(url, options)
    const requestDuration = Date.now() - requestStartTime
    
    // Log response details
    console.log('[Kraken API] ========== RESPONSE RECEIVED ==========')
    console.log('[Kraken API] Endpoint:', endpoint)
    console.log('[Kraken API] Status:', response.status)
    console.log('[Kraken API] Status Text:', response.statusText)
    console.log('[Kraken API] Request Duration:', `${requestDuration}ms`)
    console.log('[Kraken API] Response Headers:', Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Kraken API] ========== ERROR RESPONSE ==========')
      console.error('[Kraken API] Endpoint:', endpoint)
      console.error('[Kraken API] Status:', response.status)
      console.error('[Kraken API] Status Text:', response.statusText)
      console.error('[Kraken API] Error Text (full):', errorText)
      console.error('[Kraken API] Error Text (first 500 chars):', errorText.substring(0, 500))
      console.error('[Kraken API] ======================================')
      throw new Error(
        `Kraken Futures API error (${response.status}): ${errorText.substring(0, 200)}`
      )
    }

    const responseText = await response.text()
    console.log('[Kraken API] Response Text Length:', responseText.length)
    console.log('[Kraken API] Response Text (first 1000 chars):', responseText.substring(0, 1000))
    
    let data: any
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('[Kraken API] ========== JSON PARSE ERROR ==========')
      console.error('[Kraken API] Failed to parse response as JSON')
      console.error('[Kraken API] Parse Error:', parseError)
      console.error('[Kraken API] Response Text:', responseText)
      console.error('[Kraken API] =======================================')
      throw new Error(`Failed to parse Kraken API response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
    }
    
    console.log('[Kraken API] ========== RESPONSE DATA ==========')
    console.log('[Kraken API] Endpoint:', endpoint)
    console.log('[Kraken API] Data Type:', typeof data)
    console.log('[Kraken API] Is Array:', Array.isArray(data))
    console.log('[Kraken API] Data Keys:', data ? Object.keys(data) : [])
    console.log('[Kraken API] Has Result:', !!data.result)
    console.log('[Kraken API] Has Data:', !!data.data)
    console.log('[Kraken API] Result Value:', data.result)
    console.log('[Kraken API] Full Data (first 2000 chars):', JSON.stringify(data, null, 2).substring(0, 2000))
    console.log('[Kraken API] ===================================')
    
    // Kraken Futures API may return { result: 'success', data: ... } or direct data
    let returnData: T
    if (data.result === 'success' && data.data !== undefined) {
      console.log('[Kraken API] Extracting data from result.success.data')
      returnData = data.data as T
    } else if (data.data !== undefined) {
      console.log('[Kraken API] Extracting data from data.data')
      returnData = data.data as T
    } else {
      console.log('[Kraken API] Returning data as-is')
      returnData = data as T
    }
    
    console.log('[Kraken API] ========== RETURNING DATA ==========')
    console.log('[Kraken API] Endpoint:', endpoint)
    console.log('[Kraken API] Return Data Type:', typeof returnData)
    console.log('[Kraken API] Return Data Is Array:', Array.isArray(returnData))
    if (returnData && typeof returnData === 'object') {
      console.log('[Kraken API] Return Data Keys:', Object.keys(returnData))
    }
    console.log('[Kraken API] Return Data Preview (first 1000 chars):', JSON.stringify(returnData, null, 2).substring(0, 1000))
    console.log('[Kraken API] ========== REQUEST COMPLETE ==========')
    
    return returnData
  } catch (error) {
    console.error('[Kraken API] ========== REQUEST FAILED ==========')
    console.error('[Kraken API] Endpoint:', endpoint)
    console.error('[Kraken API] Error Type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('[Kraken API] Error Message:', error instanceof Error ? error.message : String(error))
    console.error('[Kraken API] Error Stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('[Kraken API] =====================================')
    throw error
  }
}

/**
 * Fetches accounts data from Kraken Futures API
 * This is the source of truth for all margin metrics
 */
async function fetchAccounts(
  apiKey: string,
  apiSecret: string
): Promise<any> {
  try {
    const accountsData = await krakenFuturesRequest<any>(
      '/accounts',
      apiKey,
      apiSecret
    )

    // DEV-ONLY: Log the structure and keys found
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV !== 'production') {
      console.log('[Kraken] /accounts response keys:', Object.keys(accountsData || {}))
      
      // Log full structure (redacted for sensitive values)
      const redacted = JSON.parse(JSON.stringify(accountsData))
      if (typeof redacted === 'object' && redacted !== null) {
        const redactValue = (obj: any, depth = 0): any => {
          if (depth > 5) return '[MAX_DEPTH]'
          if (typeof obj === 'string' && obj.length > 50) {
            return obj.substring(0, 20) + '...[REDACTED]'
          }
          if (Array.isArray(obj)) {
            return obj.slice(0, 3).map(item => redactValue(item, depth + 1))
          }
          if (typeof obj === 'object' && obj !== null) {
            const result: any = {}
            for (const [key, value] of Object.entries(obj)) {
              result[key] = redactValue(value, depth + 1)
            }
            return result
          }
          return obj
        }
        console.log('[Kraken] /accounts structure (redacted):', JSON.stringify(redactValue(redacted), null, 2).substring(0, 2000))
      }
    }

    return accountsData
  } catch (error) {
    console.error('[Kraken] Error fetching accounts:', error)
    throw error
  }
}

/**
 * Extracts open positions from /accounts data
 * Uses /accounts as source of truth for margin and PnL
 */
function extractOpenPositionsFromAccounts(accountsData: any): PerpetualsOpenPosition[] {
  const positions: PerpetualsOpenPosition[] = []
  
  if (!accountsData) {
    console.log('[Kraken] No accounts data provided')
    return positions
  }

  // DEV-ONLY: Log which fields we're looking for
  console.log('[Kraken] Extracting positions from /accounts, looking for instrument-level margin/PnL fields')
  
  // Handle different possible structures
  let accountsList: any[] = []
  
  if (Array.isArray(accountsData)) {
    accountsList = accountsData
  } else if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
    accountsList = accountsData.accounts
  } else if (accountsData.data && Array.isArray(accountsData.data)) {
    accountsList = accountsData.data
  } else if (typeof accountsData === 'object') {
    // Single account object or object with instrument-level data
    accountsList = [accountsData]
  }

  console.log('[Kraken] Processing accounts list, count:', accountsList.length)

  for (let i = 0; i < accountsList.length; i++) {
    const account = accountsList[i]
    
    // Check if account has per-instrument positions
    if (account.positions && Array.isArray(account.positions)) {
      for (const pos of account.positions) {
        const instrument = pos.instrument || pos.symbol || pos.type || ''
        const size = parseFloat(pos.size || pos.qty || pos.quantity || '0')
        
        if (!instrument || Math.abs(size) < 0.0001) {
          continue
        }
        
        // Extract margin and PnL from position data
        const margin = parseFloat(
          pos.initial_margin ||
          pos.initialMargin ||
          pos.margin ||
          '0'
        )
        const pnl = parseFloat(
          pos.unrealized_pnl ||
          pos.unrealizedPnl ||
          pos.pnl ||
          '0'
        )
        
        positions.push({
          id: `kraken-pos-${instrument}-${Date.now()}-${i}`,
          ticker: instrument,
          margin,
          pnl,
          platform: 'Kraken',
        })
        
        console.log(`[Kraken] Extracted position: ${instrument}, margin: ${margin}, pnl: ${pnl}`)
      }
    }
    
    // Also check for instrument-level fields directly in account
    if (account.instrument) {
      const instrument = account.instrument
      const margin = parseFloat(
        account.initial_margin ||
        account.initialMargin ||
        account.margin ||
        '0'
      )
      const pnl = parseFloat(
        account.unrealized_pnl ||
        account.unrealizedPnl ||
        account.pnl ||
        '0'
      )
      
      if (margin > 0 || pnl !== 0) {
        positions.push({
          id: `kraken-pos-${instrument}-${Date.now()}-${i}`,
          ticker: instrument,
          margin,
          pnl,
          platform: 'Kraken',
        })
        
        console.log(`[Kraken] Extracted position from account: ${instrument}, margin: ${margin}, pnl: ${pnl}`)
      }
    }
  }

  console.log('[Kraken] Total positions extracted:', positions.length)
  return positions
}

/**
 * Extracts locked margin from /accounts data
 * Uses initial_margin_with_orders - initial_margin calculation
 */
function extractLockedMarginFromAccounts(accountsData: any): number | null {
  if (!accountsData) {
    return null
  }

  console.log('[Kraken] Extracting locked margin from /accounts')
  
  let totalLockedMargin = 0
  
  // Handle different possible structures
  let accountsList: any[] = []
  
  if (Array.isArray(accountsData)) {
    accountsList = accountsData
  } else if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
    accountsList = accountsData.accounts
  } else if (accountsData.data && Array.isArray(accountsData.data)) {
    accountsList = accountsData.data
  } else if (typeof accountsData === 'object') {
    accountsList = [accountsData]
  }

  // DEV-ONLY: Log which fields we're checking
  if (accountsList.length > 0) {
    const sampleAccount = accountsList[0]
    console.log('[Kraken] Sample account keys:', Object.keys(sampleAccount))
    console.log('[Kraken] Looking for: initial_margin, initial_margin_with_orders, initialMargin, initialMarginWithOrders')
  }

  for (const account of accountsList) {
    // Try to find initial_margin_with_orders and initial_margin
    const initialMarginWithOrders = parseFloat(
      account.initial_margin_with_orders ||
      account.initialMarginWithOrders ||
      account.initialMarginWithOrders ||
      account.marginWithOrders ||
      '0'
    )
    
    const initialMargin = parseFloat(
      account.initial_margin ||
      account.initialMargin ||
      account.margin ||
      '0'
    )
    
    console.log(`[Kraken] Account margin fields:`, {
      initialMargin,
      initialMarginWithOrders,
      calculated: Math.max(0, initialMarginWithOrders - initialMargin),
    })
    
    // locked_margin = max(0, initial_margin_with_orders - initial_margin)
    const lockedMargin = Math.max(0, initialMarginWithOrders - initialMargin)
    totalLockedMargin += lockedMargin
  }

  // DEV-ONLY: Log computed total
  console.log('[Kraken] Total locked margin computed:', totalLockedMargin)
  
  return totalLockedMargin > 0 ? totalLockedMargin : null
}

/**
 * Extracts available margin from /accounts data
 */
function extractAvailableMarginFromAccounts(accountsData: any): PerpetualsAvailableMargin[] {
  const margins: PerpetualsAvailableMargin[] = []
  
  if (!accountsData) {
    return margins
  }

  console.log('[Kraken] Extracting available margin from /accounts')
  
  // Handle different possible structures
  let accountsList: any[] = []
  
  if (Array.isArray(accountsData)) {
    accountsList = accountsData
  } else if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
    accountsList = accountsData.accounts
  } else if (accountsData.data && Array.isArray(accountsData.data)) {
    accountsList = accountsData.data
  } else if (typeof accountsData === 'object') {
    accountsList = [accountsData]
  }

  // DEV-ONLY: Log which fields we're checking
  if (accountsList.length > 0) {
    const sampleAccount = accountsList[0]
    console.log('[Kraken] Sample account keys for available margin:', Object.keys(sampleAccount))
    console.log('[Kraken] Looking for: available, availableBalance, freeMargin, marginAvailable, balance')
  }

  for (const account of accountsList) {
    const asset = account.currency || account.asset || account.collateralCurrency || 'USD'
    
    // Try multiple field names for available margin
    const availableBalance = parseFloat(
      account.available ||
      account.availableBalance ||
      account.freeMargin ||
      account.marginAvailable ||
      account.free ||
      account.balance ||
      '0'
    )

    console.log(`[Kraken] Account ${asset} available balance:`, availableBalance)

    if (availableBalance > 0) {
      margins.push({
        id: `kraken-margin-${asset}`,
        asset,
        margin: availableBalance,
        platform: 'Kraken',
      })
    }
  }

  // DEV-ONLY: Log computed totals
  const totalAvailable = margins.reduce((sum, m) => sum + m.margin, 0)
  console.log('[Kraken] Total available margin computed:', totalAvailable)
  console.log('[Kraken] Available margin entries:', margins.length)
  if (margins.length > 0) {
    console.log('[Kraken] Available margin assets:', margins.map(m => `${m.asset}: ${m.margin}`).join(', '))
  }

  return margins
}

/**
 * Fetches open orders (optional, for display/debug only)
 */
async function fetchOpenOrders(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsOpenOrder[]> {
  try {
    const ordersData = await krakenFuturesRequest<any>(
      '/openorders',
      apiKey,
      apiSecret
    )

    const orders: PerpetualsOpenOrder[] = []

    // Handle different response structures
    let ordersList: any[] = []
    if (Array.isArray(ordersData)) {
      ordersList = ordersData
    } else if (ordersData?.orders && Array.isArray(ordersData.orders)) {
      ordersList = ordersData.orders
    } else if (ordersData?.data && Array.isArray(ordersData.data)) {
      ordersList = ordersData.data
    }

    for (const order of ordersList) {
      const symbol = order.instrument || order.symbol || ''
      const side = order.side || 'UNKNOWN'
      const type = order.type || 'UNKNOWN'
      const price = parseFloat(order.price || '0')
      const stopPrice = parseFloat(order.stopPrice || order.stop_price || '0')
      
      const effectivePrice = price > 0 ? price : (stopPrice > 0 ? stopPrice : 0)
      const priceDisplay = effectivePrice > 0 ? ` @ ${effectivePrice}` : ''
      const name = `${symbol} ${side} ${type}${priceDisplay}`

      // Per-order margin is NOT reliably available from /openorders
      orders.push({
        id: `kraken-order-${order.orderId || order.id || Date.now()}`,
        name,
        margin: null, // Per-order margin not available from API
        platform: 'Kraken',
      })
    }

    return orders
  } catch (error) {
    console.error('[Kraken] Error fetching open orders:', error)
    // Don't throw - return empty array if orders fetch fails
    return []
  }
}

/**
 * Fetches all Perpetuals data from Kraken Futures API
 * Uses /accounts as the source of truth for all margin metrics
 */
async function fetchKrakenPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  // Fetch accounts first (source of truth for all margin data)
  const accountsData = await fetchAccounts(apiKey, apiSecret)
  
  // Extract all data from /accounts
  const openPositions = extractOpenPositionsFromAccounts(accountsData)
  const lockedMargin = extractLockedMarginFromAccounts(accountsData)
  const availableMargin = extractAvailableMarginFromAccounts(accountsData)
  
  // Optionally fetch open orders (for display only, not used for margin calculations)
  const openOrders = await fetchOpenOrders(apiKey, apiSecret).catch(() => [])

  // DEV-ONLY: Log computed totals
  const totalPositionMargin = openPositions.reduce((sum, p) => sum + p.margin, 0)
  const totalPositionPnl = openPositions.reduce((sum, p) => sum + p.pnl, 0)
  const totalAvailable = availableMargin.reduce((sum, m) => sum + m.margin, 0)
  
  console.log('[Kraken] Computed totals:', {
    totalPositionMargin,
    totalPositionPnl,
    totalLockedMargin: lockedMargin,
    totalAvailableMargin: totalAvailable,
    positionsCount: openPositions.length,
    ordersCount: openOrders.length,
    availableMarginCount: availableMargin.length,
  })

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
    
    // Handle authentication errors
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('authentication')) {
      return res.status(401).json({
        success: false,
        error: 'Kraken Futures API authentication failed. Please check your API credentials.',
        details: errorMessage,
      })
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}
