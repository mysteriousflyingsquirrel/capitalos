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
  lockedMargin: PerpetualsLockedMargin[] // Asset-based locked margin from /accounts (in USD/USDT)
}

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com'
const KRAKEN_FUTURES_API_PATH = '/derivatives/api/v3'
const KRAKEN_AUTH_BASE_URL = 'https://futures.kraken.com'
const KRAKEN_AUTH_API_PATH = '/api/auth/v1'

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
    
    // Unwrap Kraken response - handle different response structures
    const returnData = unwrapKrakenResponse<T>(data, endpoint)
    
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
 * Unwraps Kraken API response to extract the actual payload
 * Handles different response wrapper structures
 * Based on Kraken Futures API v3 documentation
 */
function unwrapKrakenResponse<T>(json: any, endpoint: string): T {
  // Log the raw response for debugging
  console.log(`[Kraken API] Unwrapping response for endpoint: ${endpoint}`)
  console.log(`[Kraken API] Response has result field: ${!!json.result}`)
  console.log(`[Kraken API] Result value: ${json.result}`)
  
  // Handle endpoint-specific response structures
  if (endpoint === '/openpositions' || endpoint === '/open_positions') {
    // For /openpositions, the response structure is: { result: "success", openPositions: [...] }
    if (json.result === 'success') {
      // Check for openPositions field (camelCase)
      if (Array.isArray(json.openPositions)) {
        console.log(`[Kraken API] Found openPositions array with ${json.openPositions.length} items`)
        return json.openPositions as T
      }
      // Check for open_positions field (snake_case)
      if (Array.isArray(json.open_positions)) {
        console.log(`[Kraken API] Found open_positions array with ${json.open_positions.length} items`)
        return json.open_positions as T
      }
      // Check for positions field
      if (Array.isArray(json.positions)) {
        console.log(`[Kraken API] Found positions array with ${json.positions.length} items`)
        return json.positions as T
      }
      // Check for data field
      if (Array.isArray(json.data)) {
        console.log(`[Kraken API] Found data array with ${json.data.length} items`)
        return json.data as T
      }
      // If result is success but no array found, return empty array
      console.warn(`[Kraken API] Result is success but no positions array found. Available keys: ${Object.keys(json).join(', ')}`)
      return [] as T
    }
    // If result is not "success", check if it's already an array (direct response)
    if (Array.isArray(json)) {
      console.log(`[Kraken API] Response is already an array with ${json.length} items`)
      return json as T
    }
    // If result is error, log and return empty array
    if (json.result === 'error' || json.error) {
      console.error(`[Kraken API] Error in response:`, json.error || json)
      return [] as T
    }
  }
  
  // For other endpoints, use general unwrapping
  if (json.result === 'success') {
    const possibleKeys = ['data', 'accounts', 'openPositions', 'open_positions', 'positions', 'orders', 'openOrders', 'open_orders']
    
    for (const key of possibleKeys) {
      if (json[key] !== undefined) {
        console.log(`[Kraken API] Unwrapped response using key: ${key}`)
        return json[key] as T
      }
    }
    
    // If no known key found, return the whole object (minus result field)
    const { result, ...rest } = json
    console.log('[Kraken API] Unwrapped response by removing result field')
    return rest as T
  }
  
  // If result is not "success", return as-is (might be direct data or error)
  console.log('[Kraken API] Response does not have result="success", returning as-is')
  return json as T
}

/**
 * Verifies Kraken Futures API key and permissions
 * Calls /api-keys/v3/check endpoint
 */
async function verifyKrakenApiKey(
  apiKey: string,
  apiSecret: string
): Promise<{ valid: boolean; hasDerivatives: boolean; error?: string }> {
  try {
    // Note: /api-keys/v3/check uses different base path (/api/auth/v1 instead of /derivatives/api/v3)
    const endpointPath = `${KRAKEN_AUTH_API_PATH}/api-keys/v3/check`
    const nonce = Date.now().toString()
    const postData = ''
    
    const message = postData + nonce + endpointPath
    const sha256 = crypto.createHash('sha256').update(message).digest()
    const secretDecoded = Buffer.from(apiSecret, 'base64')
    const hmac = crypto.createHmac('sha512', secretDecoded).update(sha256).digest()
    const signature = hmac.toString('base64')
    
    const url = `${KRAKEN_AUTH_BASE_URL}${endpointPath}`
    
    console.log('[Kraken Key Check] Verifying API key...')
    console.log('[Kraken Key Check] URL:', url)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'APIKey': apiKey,
        'Authent': signature,
        'Nonce': nonce,
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Kraken Key Check] Key verification failed:', {
        status: response.status,
        error: errorText,
      })
      return {
        valid: false,
        hasDerivatives: false,
        error: `Key verification failed (${response.status}): ${errorText.substring(0, 200)}`,
      }
    }
    
    const data = await response.json()
    console.log('[Kraken Key Check] Key check response:', {
      keys: Object.keys(data),
      result: data.result,
      hasDerivatives: data.derivatives || data.hasDerivatives || false,
    })
    
    // Check if key has derivatives permissions
    const hasDerivatives = !!(data.derivatives || data.hasDerivatives || data.permissions?.derivatives)
    
    return {
      valid: data.result === 'success' || data.valid === true,
      hasDerivatives,
    }
  } catch (error) {
    console.error('[Kraken Key Check] Error verifying key:', error)
    return {
      valid: false,
      hasDerivatives: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Runs diagnostics mode - calls all endpoints and logs structure
 * DEV-ONLY: Only runs when ?diagnostics=true is in query
 */
async function runKrakenDiagnostics(
  apiKey: string,
  apiSecret: string
): Promise<void> {
  console.log('[Kraken Diagnostics] ========== STARTING DIAGNOSTICS ==========')
  
  // 1. Check API key
  try {
    console.log('[Kraken Diagnostics] 1. Checking API key...')
    const keyCheck = await verifyKrakenApiKey(apiKey, apiSecret)
    console.log('[Kraken Diagnostics] Key check result:', keyCheck)
  } catch (error) {
    console.error('[Kraken Diagnostics] Key check failed:', error)
  }
  
  // 2. Call /openpositions
  try {
    console.log('[Kraken Diagnostics] 2. Calling /openpositions...')
    const openPositionsData = await krakenFuturesRequest<any>(
      '/openpositions',
      apiKey,
      apiSecret
    )
    console.log('[Kraken Diagnostics] /openpositions response:')
    console.log('[Kraken Diagnostics]   - Type:', typeof openPositionsData)
    console.log('[Kraken Diagnostics]   - Is Array:', Array.isArray(openPositionsData))
    console.log('[Kraken Diagnostics]   - Keys:', openPositionsData ? Object.keys(openPositionsData) : [])
    if (Array.isArray(openPositionsData) && openPositionsData.length > 0) {
      console.log('[Kraken Diagnostics]   - First item keys:', Object.keys(openPositionsData[0]))
      console.log('[Kraken Diagnostics]   - First item (redacted):', redactSensitiveValues(openPositionsData[0]))
    }
  } catch (error) {
    console.error('[Kraken Diagnostics] /openpositions failed:', error)
  }
  
  // 3. Call /accounts
  try {
    console.log('[Kraken Diagnostics] 3. Calling /accounts...')
    const accountsData = await krakenFuturesRequest<any>(
      '/accounts',
      apiKey,
      apiSecret
    )
    console.log('[Kraken Diagnostics] /accounts response:')
    console.log('[Kraken Diagnostics]   - Type:', typeof accountsData)
    console.log('[Kraken Diagnostics]   - Is Array:', Array.isArray(accountsData))
    console.log('[Kraken Diagnostics]   - Keys:', accountsData ? Object.keys(accountsData) : [])
    if (Array.isArray(accountsData) && accountsData.length > 0) {
      console.log('[Kraken Diagnostics]   - First item keys:', Object.keys(accountsData[0]))
      console.log('[Kraken Diagnostics]   - First item (redacted):', redactSensitiveValues(accountsData[0]))
    } else if (accountsData && typeof accountsData === 'object') {
      console.log('[Kraken Diagnostics]   - Top-level keys:', Object.keys(accountsData))
      if (accountsData.accounts && Array.isArray(accountsData.accounts) && accountsData.accounts.length > 0) {
        console.log('[Kraken Diagnostics]   - accounts[0] keys:', Object.keys(accountsData.accounts[0]))
      }
    }
  } catch (error) {
    console.error('[Kraken Diagnostics] /accounts failed:', error)
  }
  
  console.log('[Kraken Diagnostics] ========== DIAGNOSTICS COMPLETE ==========')
}

/**
 * Redacts sensitive values from objects for logging
 */
function redactSensitiveValues(obj: any, depth = 0): any {
  if (depth > 5) return '[MAX_DEPTH]'
  if (typeof obj === 'string' && obj.length > 50) {
    return obj.substring(0, 20) + '...[REDACTED]'
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 2).map(item => redactSensitiveValues(item, depth + 1))
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        result[key] = value
      } else {
        result[key] = redactSensitiveValues(value, depth + 1)
      }
    }
    return result
  }
  return obj
}

/**
 * Fetches accounts data from Kraken Futures API
 * This is the source of truth for margin metrics (but NOT positions)
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
 * Fetches open positions from /openpositions endpoint (source of truth)
 * Then enriches with margin/PnL from /accounts if available
 */
async function fetchOpenPositions(
  apiKey: string,
  apiSecret: string,
  accountsData: any
): Promise<PerpetualsOpenPosition[]> {
  try {
    console.log('[Kraken] Fetching open positions from /openpositions (source of truth)')
    
    // Try both endpoint variations
    let positionsData: any = null
    let endpointUsed = '/openpositions'
    
    try {
      positionsData = await krakenFuturesRequest<any>(
        '/openpositions',
        apiKey,
        apiSecret
      )
      endpointUsed = '/openpositions'
    } catch (error1) {
      console.log('[Kraken] /openpositions failed, trying /open_positions...')
      try {
        positionsData = await krakenFuturesRequest<any>(
          '/open_positions',
          apiKey,
          apiSecret
        )
        endpointUsed = '/open_positions'
      } catch (error2) {
        console.error('[Kraken] Both endpoint variations failed:', { error1, error2 })
        throw error1 // Throw the first error
      }
    }
    
    console.log('[Kraken] Successfully fetched from:', endpointUsed)
    console.log('[Kraken] /openpositions response type:', typeof positionsData)
    console.log('[Kraken] /openpositions is array:', Array.isArray(positionsData))
    console.log('[Kraken] /openpositions full response (first 2000 chars):', JSON.stringify(positionsData, null, 2).substring(0, 2000))
    
    if (positionsData && typeof positionsData === 'object' && !Array.isArray(positionsData)) {
      console.log('[Kraken] Response is object, keys:', Object.keys(positionsData))
      // Log all top-level keys and their types
      for (const [key, value] of Object.entries(positionsData)) {
        console.log(`[Kraken] Response key "${key}":`, {
          type: typeof value,
          isArray: Array.isArray(value),
          valuePreview: Array.isArray(value) 
            ? `Array[${value.length}]` 
            : typeof value === 'object' && value !== null
            ? `Object with keys: ${Object.keys(value as any).join(', ')}`
            : String(value).substring(0, 100)
        })
      }
    }
    
    // Parse positions list from response
    let positionsList: any[] = []
    if (Array.isArray(positionsData)) {
      positionsList = positionsData
      console.log('[Kraken] Using positionsData as array, length:', positionsList.length)
    } else if (positionsData && typeof positionsData === 'object') {
      // Try to find positions array in response - check more possible keys
      const possibleKeys = [
        'positions', 
        'openPositions', 
        'open_positions', 
        'data',
        'result',
        'openpositions', // lowercase
        'openPositionsData',
        'positionsData'
      ]
      
      for (const key of possibleKeys) {
        if (positionsData[key] !== undefined) {
          console.log(`[Kraken] Found key "${key}":`, {
            type: typeof positionsData[key],
            isArray: Array.isArray(positionsData[key]),
            value: Array.isArray(positionsData[key]) 
              ? `Array[${positionsData[key].length}]` 
              : positionsData[key]
          })
          
          if (Array.isArray(positionsData[key])) {
            positionsList = positionsData[key]
            console.log(`[Kraken] Using positions array from key "${key}", length:`, positionsList.length)
            break
          } else if (typeof positionsData[key] === 'object' && positionsData[key] !== null) {
            // Maybe it's nested further
            const nested = positionsData[key]
            if (Array.isArray(nested)) {
              positionsList = nested
              console.log(`[Kraken] Using nested array from key "${key}", length:`, positionsList.length)
              break
            }
            // Check if nested object has positions
            for (const nestedKey of ['positions', 'data', 'openPositions', 'open_positions']) {
              if (Array.isArray(nested[nestedKey])) {
                positionsList = nested[nestedKey]
                console.log(`[Kraken] Using nested array from "${key}.${nestedKey}", length:`, positionsList.length)
                break
              }
            }
            if (positionsList.length > 0) break
          }
        }
      }
      
      // If still no positions found, log the entire structure for debugging
      if (positionsList.length === 0) {
        console.warn('[Kraken] No positions array found in response. Full response structure:')
        console.warn(JSON.stringify(positionsData, null, 2).substring(0, 3000))
      }
    }
    
    console.log('[Kraken] Processing positions list, length:', positionsList.length)
    
    // Build a map of instrument -> margin/PnL from accounts for enrichment
    const accountInstrumentMap = new Map<string, { margin: number; pnl: number }>()
    
    if (accountsData) {
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
      
      // Extract per-instrument margin/PnL from accounts
      for (const account of accountsList) {
        if (account.positions && Array.isArray(account.positions)) {
          for (const pos of account.positions) {
            const instrument = pos.instrument || pos.symbol || ''
            if (instrument) {
              accountInstrumentMap.set(instrument, {
                margin: parseFloat(pos.initial_margin || pos.initialMargin || pos.margin || '0'),
                pnl: parseFloat(pos.unrealized_pnl || pos.unrealizedPnl || pos.pnl || '0'),
              })
            }
          }
        }
        
        // Also check for instrument-level fields directly in account
        if (account.instrument) {
          accountInstrumentMap.set(account.instrument, {
            margin: parseFloat(account.initial_margin || account.initialMargin || account.margin || '0'),
            pnl: parseFloat(account.unrealized_pnl || account.unrealizedPnl || account.pnl || '0'),
          })
        }
      }
      
      console.log('[Kraken] Built account instrument map with', accountInstrumentMap.size, 'instruments')
    }
    
    const positions: PerpetualsOpenPosition[] = []
    
    for (let i = 0; i < positionsList.length; i++) {
      const pos = positionsList[i]
      
      // Get instrument/symbol from /openpositions
      // Try multiple possible field names based on Kraken API docs
      const instrument = pos.instrument || 
                        pos.symbol || 
                        pos.type || 
                        pos.futures || 
                        pos.futuresSymbol ||
                        pos.contract ||
                        pos.contractSymbol ||
                        pos.ticker ||
                        ''
      
      // Get size - try multiple field names
      const size = parseFloat(
        pos.size || 
        pos.qty || 
        pos.quantity || 
        pos.amount || 
        pos.positionSize ||
        pos.volume ||
        '0'
      )
      
      // Log the position structure for debugging
      if (i === 0) {
        console.log('[Kraken] First position object keys:', Object.keys(pos))
        console.log('[Kraken] First position object:', JSON.stringify(pos, null, 2).substring(0, 500))
      }
      
      // Filter out zero-size positions
      if (!instrument || Math.abs(size) < 0.0001) {
        console.log(`[Kraken] Skipping position ${i}: zero size or no instrument`)
        continue
      }
      
      // Try to get margin/PnL from accounts map
      const accountData = accountInstrumentMap.get(instrument)
      let margin = 0
      let pnl = 0
      
      if (accountData) {
        margin = accountData.margin
        pnl = accountData.pnl
        console.log(`[Kraken] Position ${i} (${instrument}) enriched from accounts: margin=${margin}, pnl=${pnl}`)
      } else {
        console.warn(`[Kraken] Position ${i} (${instrument}) not found in accounts - using margin=0, pnl=0`)
        // DEV warning: accounts has no instrument-level fields
        if (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV !== 'production') {
          console.warn('[Kraken] WARNING: accounts has no instrument-level fields for position:', instrument)
        }
      }
      
      positions.push({
        id: `kraken-pos-${instrument}-${Date.now()}-${i}`,
        ticker: instrument,
        margin,
        pnl,
        platform: 'Kraken',
      })
    }
    
    console.log('[Kraken] Total positions extracted from /openpositions:', positions.length)
    
    // If no positions found from /openpositions, try to extract from /accounts as fallback
    if (positions.length === 0 && accountsData) {
      console.log('[Kraken] No positions from /openpositions, trying to extract from /accounts as fallback...')
      const fallbackPositions = extractPositionsFromAccounts(accountsData)
      if (fallbackPositions.length > 0) {
        console.log('[Kraken] Found', fallbackPositions.length, 'positions from /accounts fallback')
        return fallbackPositions
      }
    }
    
    return positions
  } catch (error) {
    console.error('[Kraken] Error fetching open positions:', error)
    // If /openpositions fails, try fallback to /accounts
    if (accountsData) {
      console.log('[Kraken] /openpositions failed, trying /accounts fallback...')
      try {
        const fallbackPositions = extractPositionsFromAccounts(accountsData)
        if (fallbackPositions.length > 0) {
          console.log('[Kraken] Found', fallbackPositions.length, 'positions from /accounts fallback')
          return fallbackPositions
        }
      } catch (fallbackError) {
        console.error('[Kraken] Fallback to /accounts also failed:', fallbackError)
      }
    }
    throw error
  }
}

/**
 * Fallback: Extract positions from /accounts data
 * Used when /openpositions returns empty or fails
 */
function extractPositionsFromAccounts(accountsData: any): PerpetualsOpenPosition[] {
  const positions: PerpetualsOpenPosition[] = []
  
  if (!accountsData) {
    return positions
  }

  console.log('[Kraken] Extracting positions from /accounts (fallback)')
  
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
        
        console.log(`[Kraken] Extracted position from /accounts: ${instrument}, margin: ${margin}, pnl: ${pnl}`)
      }
    }
    
    // Also check for instrument-level fields directly in account
    if (account.instrument) {
      const instrument = account.instrument
      const size = parseFloat(account.size || account.qty || account.quantity || '0')
      
      if (Math.abs(size) < 0.0001) {
        continue
      }
      
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
        
        console.log(`[Kraken] Extracted position from account object: ${instrument}, margin: ${margin}, pnl: ${pnl}`)
      }
    }
  }

  console.log('[Kraken] Total positions extracted from /accounts (fallback):', positions.length)
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
 * Uses /openpositions as source of truth for positions
 * Uses /accounts as source of truth for margin metrics (locked, available)
 */
async function fetchKrakenPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  let accountsData: any = null
  let openPositions: PerpetualsOpenPosition[] = []
  
  try {
    // Fetch accounts first (needed for margin metrics and position enrichment)
    accountsData = await fetchAccounts(apiKey, apiSecret)
  } catch (error) {
    console.error('[Kraken] Failed to fetch accounts:', error)
    // Continue with empty accountsData - we'll return empty data
  }
  
  try {
    // Fetch open positions from /openpositions (source of truth)
    // This will also enrich with margin/PnL from accounts if available
    openPositions = await fetchOpenPositions(apiKey, apiSecret, accountsData)
  } catch (error) {
    console.error('[Kraken] Failed to fetch open positions:', error)
    // Try fallback to extract from accounts
    if (accountsData) {
      try {
        console.log('[Kraken] Attempting fallback: extracting positions from /accounts...')
        openPositions = extractPositionsFromAccounts(accountsData)
        console.log('[Kraken] Fallback extracted', openPositions.length, 'positions')
      } catch (fallbackError) {
        console.error('[Kraken] Fallback also failed:', fallbackError)
        openPositions = []
      }
    } else {
      openPositions = []
    }
  }
  
  // Extract margin metrics from /accounts (handle null accountsData)
  let lockedMargin: number | null = null
  let availableMargin: PerpetualsAvailableMargin[] = []
  
  if (accountsData) {
    try {
      lockedMargin = extractLockedMarginFromAccounts(accountsData)
      availableMargin = extractAvailableMarginFromAccounts(accountsData)
    } catch (error) {
      console.error('[Kraken] Failed to extract margin metrics:', error)
      // Continue with empty values
    }
  }
  
  // Optionally fetch open orders (for display only, not used for margin calculations)
  const openOrders = await fetchOpenOrders(apiKey, apiSecret).catch(() => [])

  // DEV-ONLY: Log computed totals and check for mismatches
  const totalPositionMargin = openPositions.reduce((sum, p) => sum + p.margin, 0)
  const totalPositionPnl = openPositions.reduce((sum, p) => sum + p.pnl, 0)
  const totalAvailable = availableMargin.reduce((sum, m) => sum + m.margin, 0)
  
  // Check for account scope / subaccount mismatch
  if (openPositions.length === 0 && accountsData) {
    let accountsList: any[] = []
    if (Array.isArray(accountsData)) {
      accountsList = accountsData
    } else if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
      accountsList = accountsData.accounts
    } else if (accountsData.data && Array.isArray(accountsData.data)) {
      accountsList = accountsData.data
    }
    
    // Check if accounts shows non-zero margin/equity
    let hasNonZeroMargin = false
    for (const account of accountsList) {
      const margin = parseFloat(account.initial_margin || account.initialMargin || account.margin || '0')
      const equity = parseFloat(account.equity || account.totalEquity || account.balance || '0')
      if (margin > 0 || equity > 0) {
        hasNonZeroMargin = true
        break
      }
    }
    
    if (hasNonZeroMargin) {
      console.warn('[Kraken] WARNING: /openpositions returned empty but /accounts shows non-zero margin/equity')
      console.warn('[Kraken] This may indicate account scope / subaccount mismatch')
    }
  }
  
  console.log('[Kraken] Computed totals:', {
    totalPositionMargin,
    totalPositionPnl,
    totalLockedMargin: lockedMargin,
    totalAvailableMargin: totalAvailable,
    positionsCount: openPositions.length,
    ordersCount: openOrders.length,
    availableMarginCount: availableMargin.length,
  })

  // Convert lockedMargin from number | null to array format to match interface
  const lockedMarginArray: Array<{
    id: string
    asset: string
    margin: number
    platform: string
  }> = []
  
  if (lockedMargin !== null && lockedMargin > 0) {
    // Use the collateral currency from accounts, or default to USD
    let collateralCurrency = 'USD'
    if (accountsData) {
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
      
      if (accountsList.length > 0) {
        const account = accountsList[0]
        collateralCurrency = account.currency || account.asset || account.collateralCurrency || 'USD'
      }
    }
    
    lockedMarginArray.push({
      id: `kraken-locked-margin-${collateralCurrency}`,
      asset: collateralCurrency,
      margin: lockedMargin,
      platform: 'Kraken',
    })
  }

  return {
    openPositions,
    openOrders,
    availableMargin,
    lockedMargin: lockedMarginArray,
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

    // Check if diagnostics mode is requested
    const diagnosticsMode = req.query?.diagnostics === 'true'
    if (diagnosticsMode) {
      await runKrakenDiagnostics(apiKey, apiSecret)
      return res.status(200).json({
        success: true,
        message: 'Diagnostics completed. Check server logs for details.',
      })
    }

    // Verify API key and permissions (graceful - don't block if verification fails)
    let keyVerification: { valid: boolean; hasDerivatives: boolean; error?: string } | null = null
    try {
      keyVerification = await verifyKrakenApiKey(apiKey, apiSecret)
      if (!keyVerification.valid || !keyVerification.hasDerivatives) {
        console.warn('[Kraken] Key verification failed or lacks derivatives permissions:', keyVerification.error)
        // Don't block - try to proceed anyway, but log the warning
        // Some keys might work even if the check endpoint fails
      }
    } catch (verifyError) {
      console.warn('[Kraken] Key verification endpoint failed, proceeding anyway:', verifyError)
      // Continue - the actual API calls will fail if the key is invalid
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
