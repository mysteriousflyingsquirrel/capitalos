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
  lockedMargin: PerpetualsLockedMargin[]
  availableMargin: PerpetualsAvailableMargin[]
}

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com/derivatives/api/v3'

/**
 * Generates Kraken Futures v3 signature
 * Format: HMAC-SHA512(nonce + endpoint + postData)
 * Reference: https://docs.kraken.com/api/docs/guides/futures-rest/
 */
function generateKrakenSignature(
  apiSecret: string,
  nonce: string,
  endpoint: string,
  postData: string = ''
): string {
  const message = nonce + endpoint + postData
  return crypto
    .createHmac('sha512', apiSecret)
    .update(message)
    .digest('base64')
}

/**
 * Makes an authenticated request to Kraken Futures API
 */
async function krakenFuturesRequest<T>(
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  method: 'GET' | 'POST' = 'GET',
  postData: string = ''
): Promise<T> {
  const nonce = Date.now().toString()
  const signature = generateKrakenSignature(apiSecret, nonce, endpoint, postData)

  const url = `${KRAKEN_FUTURES_BASE_URL}${endpoint}`
  
  console.log('[Kraken API] Making request:', {
    endpoint,
    method,
    url,
    apiKeyLength: apiKey?.length || 0,
    apiSecretLength: apiSecret?.length || 0,
    nonce,
    signatureLength: signature?.length || 0,
  })
  
  const headers: Record<string, string> = {
    'APIKey': apiKey,
    'Authent': signature,
    'Content-Type': 'application/json',
  }

  // Add Nonce header for POST requests or if required
  if (method === 'POST' || postData) {
    headers['Nonce'] = nonce
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (method === 'POST' && postData) {
    options.body = postData
  }

  try {
    const response = await fetch(url, options)
    
    console.log('[Kraken API] Response received:', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Kraken API] Error response:', {
        endpoint,
        status: response.status,
        errorText,
      })
      throw new Error(
        `Kraken Futures API error (${response.status}): ${errorText}`
      )
    }

    const data = await response.json()
    
    console.log('[Kraken API] Response data structure:', {
      endpoint,
      hasResult: !!data.result,
      hasData: !!data.data,
      dataKeys: data ? Object.keys(data) : [],
      fullResponse: JSON.stringify(data, null, 2).substring(0, 2000), // Log first 2000 chars
    })
    
    // Kraken Futures API may return { result: 'success', serverTime: ..., ... } or direct data
    if (data.result === 'success' && data.data) {
      console.log('[Kraken API] Extracting data from result.success.data')
      return data.data as T
    }
    
    // Some endpoints return data directly
    if (data.data) {
      console.log('[Kraken API] Extracting data from data.data')
      return data.data as T
    }

    // Check if the response itself is the data (for /openpositions)
    if (endpoint === '/openpositions') {
      console.log('[Kraken API] /openpositions endpoint - checking if response is direct array/object')
      // If it's already an array or object with positions, return it
      if (Array.isArray(data) || (data && typeof data === 'object' && !data.result)) {
        console.log('[Kraken API] Returning data directly for /openpositions')
        return data as T
      }
    }

    console.log('[Kraken API] Returning full data object')
    return data as T
  } catch (error) {
    console.error('[Kraken API] Request failed:', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
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
  try {
    const positionsData = await krakenFuturesRequest<any>(
      '/openpositions',
      apiKey,
      apiSecret
    )

    // Detailed logging of the raw response
    console.log('[Kraken] Open positions raw response:', JSON.stringify(positionsData, null, 2).substring(0, 2000))
    console.log('[Kraken] Open positions response type:', typeof positionsData)
    console.log('[Kraken] Open positions response keys:', positionsData ? Object.keys(positionsData) : 'null/undefined')
    
    if (Array.isArray(positionsData)) {
      console.log('[Kraken] Response is array, length:', positionsData.length)
      if (positionsData.length > 0) {
        console.log('[Kraken] First position structure:', JSON.stringify(positionsData[0], null, 2))
        console.log('[Kraken] First position keys:', Object.keys(positionsData[0]))
      }
    } else if (positionsData && typeof positionsData === 'object') {
      console.log('[Kraken] Response is object, checking for nested arrays...')
      if (positionsData.positions) {
        console.log('[Kraken] Found positions array, length:', Array.isArray(positionsData.positions) ? positionsData.positions.length : 'not array')
        if (Array.isArray(positionsData.positions) && positionsData.positions.length > 0) {
          console.log('[Kraken] First position in positions array:', JSON.stringify(positionsData.positions[0], null, 2))
        }
      }
      if (positionsData.data) {
        console.log('[Kraken] Found data array, length:', Array.isArray(positionsData.data) ? positionsData.data.length : 'not array')
        if (Array.isArray(positionsData.data) && positionsData.data.length > 0) {
          console.log('[Kraken] First position in data array:', JSON.stringify(positionsData.data[0], null, 2))
        }
      }
    }

    const positions: PerpetualsOpenPosition[] = []

    // Handle different response structures
    let positionsList: any[] = []
    if (Array.isArray(positionsData)) {
      positionsList = positionsData
      console.log('[Kraken] Using positionsData as array, length:', positionsList.length)
    } else if (positionsData?.positions && Array.isArray(positionsData.positions)) {
      positionsList = positionsData.positions
      console.log('[Kraken] Using positionsData.positions, length:', positionsList.length)
    } else if (positionsData?.data && Array.isArray(positionsData.data)) {
      positionsList = positionsData.data
      console.log('[Kraken] Using positionsData.data, length:', positionsList.length)
    } else {
      console.log('[Kraken] No positions array found in response structure')
      // Try to find any array in the response
      if (positionsData && typeof positionsData === 'object') {
        for (const [key, value] of Object.entries(positionsData)) {
          if (Array.isArray(value) && value.length > 0) {
            console.log(`[Kraken] Found array at key "${key}" with ${value.length} items, checking if it's positions...`)
            // Check if first item looks like a position
            const firstItem = value[0]
            if (firstItem && typeof firstItem === 'object') {
              const hasSymbol = 'symbol' in firstItem || 'instrument' in firstItem || 'futures' in firstItem || 'type' in firstItem
              const hasSize = 'size' in firstItem || 'qty' in firstItem || 'quantity' in firstItem
              if (hasSymbol || hasSize) {
                console.log(`[Kraken] Array at "${key}" looks like positions, using it`)
                positionsList = value
                break
              }
            }
          }
        }
      }
    }

    console.log('[Kraken] Processing positions list, length:', positionsList.length)

    for (let i = 0; i < positionsList.length; i++) {
      const pos = positionsList[i]
      console.log(`[Kraken] Processing position ${i}:`, JSON.stringify(pos, null, 2).substring(0, 500))
      
      // Filter out positions with zero size
      const size = parseFloat(pos.size || pos.qty || pos.quantity || pos.amount || '0')
      console.log(`[Kraken] Position ${i} size:`, size)
      
      if (Math.abs(size) < 0.0001) {
        console.log(`[Kraken] Position ${i} has zero size, skipping`)
        continue
      }

      const symbol = pos.symbol || pos.instrument || pos.futures || pos.type || pos.ticker || pos.pair || ''
      console.log(`[Kraken] Position ${i} symbol:`, symbol)
      
      if (!symbol) {
        console.log(`[Kraken] Position ${i} has no symbol, keys:`, Object.keys(pos))
        continue
      }

      // Extract margin - try multiple possible field names
      const margin = parseFloat(
        pos.initialMargin ||
        pos.margin ||
        pos.initial_margin ||
        pos.marginUsed ||
        pos.collateral ||
        pos.marginBalance ||
        '0'
      )
      console.log(`[Kraken] Position ${i} margin:`, margin, 'from fields:', {
        initialMargin: pos.initialMargin,
        margin: pos.margin,
        initial_margin: pos.initial_margin,
        marginUsed: pos.marginUsed,
        collateral: pos.collateral,
      })

      // Extract PnL - try multiple possible field names
      const pnl = parseFloat(
        pos.unrealizedPnl ||
        pos.unrealized_pnl ||
        pos.pnl ||
        pos.profitLoss ||
        pos.unrealizedProfit ||
        pos.unrealized_profit ||
        pos.profit ||
        '0'
      )
      console.log(`[Kraken] Position ${i} pnl:`, pnl, 'from fields:', {
        unrealizedPnl: pos.unrealizedPnl,
        unrealized_pnl: pos.unrealized_pnl,
        pnl: pos.pnl,
        profitLoss: pos.profitLoss,
        unrealizedProfit: pos.unrealizedProfit,
      })

      positions.push({
        id: `kraken-pos-${symbol}-${Date.now()}-${i}`,
        ticker: symbol,
        margin,
        pnl,
        platform: 'Kraken',
      })
      
      console.log(`[Kraken] Added position ${i}:`, { ticker: symbol, margin, pnl })
    }

    console.log('[Kraken] Total positions extracted:', positions.length)
    return positions
  } catch (error) {
    console.error('[Kraken] Error fetching Kraken open positions:', error)
    throw error
  }
}

/**
 * Fetches accounts data from Kraken Futures API
 * This is used for margin calculations and PnL
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

    if (process.env.NODE_ENV === 'development') {
      console.log('[Kraken] Accounts response keys:', Object.keys(accountsData || {}))
      // Log structure but redact sensitive values
      if (accountsData) {
        const redacted = JSON.parse(JSON.stringify(accountsData))
        // Redact any potential sensitive fields
        if (typeof redacted === 'object') {
          Object.keys(redacted).forEach(key => {
            if (typeof redacted[key] === 'string' && redacted[key].length > 20) {
              redacted[key] = '[REDACTED]'
            }
          })
        }
        console.log('[Kraken] Accounts structure (redacted):', JSON.stringify(redacted, null, 2).substring(0, 500))
      }
    }

    return accountsData
  } catch (error) {
    console.error('Error fetching Kraken accounts:', error)
    throw error
  }
}

/**
 * Fetches open orders from Kraken Futures API
 * Used to determine if there are orders locking margin
 */
async function fetchOpenOrders(
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  try {
    const ordersData = await krakenFuturesRequest<any>(
      '/openorders',
      apiKey,
      apiSecret
    )

    if (process.env.NODE_ENV === 'development') {
      console.log('[Kraken] Open orders response keys:', Object.keys(ordersData || {}))
      const ordersList = Array.isArray(ordersData) ? ordersData : (ordersData?.orders || ordersData?.data || [])
      console.log('[Kraken] Number of open orders:', ordersList.length)
    }

    // Return as array
    if (Array.isArray(ordersData)) {
      return ordersData
    } else if (ordersData?.orders && Array.isArray(ordersData.orders)) {
      return ordersData.orders
    } else if (ordersData?.data && Array.isArray(ordersData.data)) {
      return ordersData.data
    }

    return []
  } catch (error) {
    console.error('Error fetching Kraken open orders:', error)
    // Don't throw - return empty array if orders fetch fails
    return []
  }
}

/**
 * Fetches locked margin from Kraken Futures API
 * Uses /accounts as source of truth for margin reserved by orders
 */
async function fetchLockedMargin(
  apiKey: string,
  apiSecret: string,
  accountsData: any
): Promise<PerpetualsLockedMargin[]> {
  try {
    const lockedMargins: PerpetualsLockedMargin[] = []

    // Try to extract per-asset reserved margin for orders
    // Look for fields like: openOrderInitialMargin, reserved, orderMargin, etc.
    if (accountsData) {
      // Check if accounts has per-asset structure
      if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
        for (const account of accountsData.accounts) {
          const asset = account.currency || account.asset || account.collateralCurrency || 'USD'
          
          // Try multiple field names for locked margin
          const lockedMargin = parseFloat(
            account.openOrderInitialMargin ||
            account.reserved ||
            account.orderMargin ||
            account.marginReserved ||
            account.initialMarginWithOrders ||
            '0'
          )

          if (lockedMargin > 0) {
            lockedMargins.push({
              id: `kraken-locked-${asset}`,
              asset,
              margin: lockedMargin,
              platform: 'Kraken',
            })
          }
        }
      }

      // Check for top-level per-asset fields
      if (accountsData.assets && typeof accountsData.assets === 'object') {
        for (const [asset, assetData] of Object.entries(accountsData.assets)) {
          const assetInfo = assetData as any
          const lockedMargin = parseFloat(
            assetInfo.openOrderInitialMargin ||
            assetInfo.reserved ||
            assetInfo.orderMargin ||
            assetInfo.marginReserved ||
            '0'
          )

          if (lockedMargin > 0) {
            lockedMargins.push({
              id: `kraken-locked-${asset}`,
              asset,
              margin: lockedMargin,
              platform: 'Kraken',
            })
          }
        }
      }

      // Fallback: if per-asset doesn't exist, try per-instrument approach
      if (lockedMargins.length === 0 && accountsData.accounts) {
        let totalOrderLocked = 0
        
        for (const account of accountsData.accounts) {
          const initialMarginWithOrders = parseFloat(
            account.initialMarginWithOrders ||
            account.initial_margin_with_orders ||
            account.marginWithOrders ||
            '0'
          )
          const initialMargin = parseFloat(
            account.initialMargin ||
            account.initial_margin ||
            account.margin ||
            '0'
          )
          
          const orderLocked = Math.max(0, initialMarginWithOrders - initialMargin)
          totalOrderLocked += orderLocked
        }

        if (totalOrderLocked > 0) {
          // Use the account's collateral currency or default to USD
          const collateralCurrency = accountsData.accounts[0]?.currency || 
                                    accountsData.accounts[0]?.asset || 
                                    accountsData.accounts[0]?.collateralCurrency || 
                                    'USD'
          
          lockedMargins.push({
            id: 'kraken-locked-total',
            asset: collateralCurrency,
            margin: totalOrderLocked,
            platform: 'Kraken',
          })

          if (process.env.NODE_ENV === 'development') {
            console.log('[Kraken] Using fallback locked margin calculation:', totalOrderLocked)
          }
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      if (lockedMargins.length === 0) {
        console.warn('[Kraken] No locked margin found. Accounts structure may not match expected format.')
      } else {
        console.log('[Kraken] Locked margin entries:', lockedMargins.length)
      }
    }

    return lockedMargins
  } catch (error) {
    console.warn('Failed to fetch locked margin from Kraken accounts:', error)
    return []
  }
}

/**
 * Fetches available margin from Kraken Futures API
 * Uses /accounts to extract available/free funds
 */
async function fetchAvailableMargin(
  apiKey: string,
  apiSecret: string,
  accountsData: any
): Promise<PerpetualsAvailableMargin[]> {
  try {
    const margins: PerpetualsAvailableMargin[] = []

    if (accountsData) {
      // Check if accounts has per-asset structure
      if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
        for (const account of accountsData.accounts) {
          const asset = account.currency || account.asset || account.collateralCurrency || 'USD'
          
          // Try multiple field names for available margin
          const availableBalance = parseFloat(
            account.available ||
            account.availableBalance ||
            account.freeMargin ||
            account.marginAvailable ||
            account.balance ||
            '0'
          )

          if (availableBalance > 0) {
            margins.push({
              id: `kraken-margin-${asset}`,
              asset,
              margin: availableBalance,
              platform: 'Kraken',
            })
          }
        }
      }

      // Check for top-level per-asset fields
      if (accountsData.assets && typeof accountsData.assets === 'object') {
        for (const [asset, assetData] of Object.entries(accountsData.assets)) {
          const assetInfo = assetData as any
          const availableBalance = parseFloat(
            assetInfo.available ||
            assetInfo.availableBalance ||
            assetInfo.freeMargin ||
            assetInfo.marginAvailable ||
            assetInfo.balance ||
            '0'
          )

          if (availableBalance > 0) {
            margins.push({
              id: `kraken-margin-${asset}`,
              asset,
              margin: availableBalance,
              platform: 'Kraken',
            })
          }
        }
      }

      // Fallback: if per-asset doesn't exist, use single account
      if (margins.length === 0 && accountsData.accounts && accountsData.accounts.length > 0) {
        const account = accountsData.accounts[0]
        const asset = account.currency || account.asset || account.collateralCurrency || 'USD'
        const availableBalance = parseFloat(
          account.available ||
          account.availableBalance ||
          account.freeMargin ||
          account.marginAvailable ||
          account.balance ||
          '0'
        )

        if (availableBalance > 0) {
          margins.push({
            id: 'kraken-margin-single',
            asset,
            margin: availableBalance,
            platform: 'Kraken',
          })
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[Kraken] Available margin entries:', margins.length)
      if (margins.length > 0) {
        console.log('[Kraken] Available margin assets:', margins.map(m => `${m.asset}: ${m.margin}`).join(', '))
      }
    }

    return margins
  } catch (error) {
    console.error('Error fetching available margin from Kraken accounts:', error)
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
  // Fetch accounts first (needed for margin calculations)
  const accountsData = await fetchAccounts(apiKey, apiSecret)
  
  // Fetch positions, orders, and margins in parallel
  const [openPositions, openOrders, lockedMargin, availableMargin] = await Promise.all([
    fetchOpenPositions(apiKey, apiSecret),
    fetchOpenOrders(apiKey, apiSecret),
    fetchLockedMargin(apiKey, apiSecret, accountsData),
    fetchAvailableMargin(apiKey, apiSecret, accountsData),
  ])

  // Enhance positions with account data if needed
  // Try to match positions with account data for better margin/PnL
  const enhancedPositions = openPositions.map(pos => {
    // If position margin or PnL is 0, try to find it in accounts data
    if ((pos.margin === 0 || pos.pnl === 0) && accountsData) {
      // Look for position-specific data in accounts
      // This is a fallback - the positions endpoint should ideally have this
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Kraken] Position ${pos.ticker} has zero margin or PnL, attempting to enhance from accounts`)
      }
    }
    return pos
  })

  if (process.env.NODE_ENV === 'development') {
    // Sanity check: available + used + locked ~= equity (if available)
    if (accountsData) {
      const totalAvailable = availableMargin.reduce((sum, m) => sum + m.margin, 0)
      const totalLocked = lockedMargin.reduce((sum, m) => sum + m.margin, 0)
      const totalPositions = enhancedPositions.reduce((sum, p) => sum + p.margin, 0)
      
      const equity = parseFloat(
        accountsData.equity ||
        accountsData.totalEquity ||
        accountsData.balance ||
        '0'
      )

      if (equity > 0) {
        const calculated = totalAvailable + totalLocked + totalPositions
        const difference = Math.abs(equity - calculated)
        console.log('[Kraken] Margin sanity check:', {
          equity,
          calculated,
          difference,
          totalAvailable,
          totalLocked,
          totalPositions,
        })
      }
    }
  }

  return {
    openPositions: enhancedPositions,
    lockedMargin,
    availableMargin,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[Kraken API] Request received:', {
    method: req.method,
    url: req.url,
    query: req.query,
    hasUid: !!req.query?.uid,
  })
  
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
      console.log('[Kraken API] Missing UID in request')
      return res.status(400).json({ 
        error: 'User ID (uid) is required. Provide it as a query parameter ?uid=your-user-id' 
      })
    }
    
    console.log('[Kraken API] Processing request for UID:', uid)

    const db = admin.firestore()

    // Load user settings to get API keys
    const settingsDoc = await db.collection(`users/${uid}/settings`).doc('user').get()
    
    if (!settingsDoc.exists) {
      return res.status(404).json({ error: 'User settings not found' })
    }

    const settings = settingsDoc.data()
    
    // Debug logging - show full structure (redacted)
    const redactedSettings = settings ? JSON.parse(JSON.stringify(settings)) : null
    if (redactedSettings?.apiKeys) {
      Object.keys(redactedSettings.apiKeys).forEach(key => {
        if (redactedSettings.apiKeys[key] && typeof redactedSettings.apiKeys[key] === 'string') {
          const value = redactedSettings.apiKeys[key]
          redactedSettings.apiKeys[key] = value.length > 0 
            ? `${value.substring(0, 4)}...${value.substring(value.length - 4)} (length: ${value.length})`
            : 'empty'
        }
      })
    }
    
    console.log('[Kraken API] Settings loaded:', {
      hasSettings: !!settings,
      hasApiKeys: !!settings?.apiKeys,
      apiKeysKeys: settings?.apiKeys ? Object.keys(settings.apiKeys) : [],
      hasKrakenApiKey: !!settings?.apiKeys?.krakenApiKey,
      hasKrakenApiSecretKey: !!settings?.apiKeys?.krakenApiSecretKey,
      krakenApiKeyLength: settings?.apiKeys?.krakenApiKey?.length || 0,
      krakenApiSecretKeyLength: settings?.apiKeys?.krakenApiSecretKey?.length || 0,
      redactedSettings: redactedSettings,
    })
    
    // Also check for alternative field names (in case of confusion)
    console.log('[Kraken API] Checking for alternative field names:', {
      hasKrakenPublicKey: !!settings?.apiKeys?.krakenPublicKey,
      hasKrakenSecretKey: !!settings?.apiKeys?.krakenSecretKey,
      allApiKeyFields: settings?.apiKeys ? Object.keys(settings.apiKeys).filter(k => k.toLowerCase().includes('kraken')) : [],
    })
    
    const apiKey = settings?.apiKeys?.krakenApiKey
    const apiSecret = settings?.apiKeys?.krakenApiSecretKey

    if (!apiKey || !apiSecret) {
      console.log('[Kraken API] Missing credentials:', {
        apiKey: !!apiKey,
        apiSecret: !!apiSecret,
        apiKeyValue: apiKey ? `${apiKey.substring(0, 4)}...` : 'missing',
        apiSecretValue: apiSecret ? `${apiSecret.substring(0, 4)}...` : 'missing',
      })
      return res.status(400).json({ 
        error: 'Kraken Futures API credentials not configured. Please configure API Key and Secret Key in Settings.' 
      })
    }

    console.log('[Kraken API] Credentials found, starting fetch...')
    
    // Fetch data from Kraken Futures API
    const perpetualsData = await fetchKrakenPerpetualsData(apiKey, apiSecret)
    
    console.log('[Kraken API] Fetch completed:', {
      positionsCount: perpetualsData.openPositions.length,
      lockedMarginCount: perpetualsData.lockedMargin.length,
      availableMarginCount: perpetualsData.availableMargin.length,
    })

    // Return the data
    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    console.error('Error fetching Kraken Futures Perpetuals data:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    // Handle authentication errors
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
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

