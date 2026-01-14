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
  leverage?: number | null // leverage (e.g., 1 for 1x)
  positionSide?: 'LONG' | 'SHORT' | null // position direction
}

interface ExchangeBalance {
  id: string
  item: string
  holdings: number
  platform: string
}

interface PerpetualsOpenOrder {
  id: string
  name: string
  margin: number | null
  platform: string
}

interface PerpetualsData {
  exchangeBalance: ExchangeBalance[]
  openPositions: PerpetualsOpenPosition[]
  openOrders: PerpetualsOpenOrder[]
}

const HYPERLIQUID_BASE_URL = 'https://api.hyperliquid.xyz'

// Step 1: Discover the perp DEX name for XYZ perps
// According to docs: perpDexs returns [null, {name: "..."}, {name: "..."}] format
// First element is null (default DEX), subsequent elements are objects describing a DEX
async function fetchAllPerpDexs(): Promise<string[]> {
  try {
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'perpDexs',
      }),
    })

    if (!response.ok) {
      return [''] // Return default dex if we can't fetch the list
    }

    const data = await response.json()
    
    const dexNames: string[] = []
    
    // Handle documented format: [null, {name: "..."}, {name: "..."}]
    if (Array.isArray(data)) {
      // Check if first element is null and subsequent are objects
      if (data.length > 0 && data[0] === null && data.length > 1) {
        // Format: [null, {name: "..."}, {name: "..."}]
        for (let i = 1; i < data.length; i++) {
          const dex = data[i]
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      }
      // Defensive: handle nested array format [null, [{name: "..."}, ...]]
      else if (data.length > 1 && Array.isArray(data[1])) {
        const nestedArray = data[1]
        for (const dex of nestedArray) {
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      }
      // Defensive: handle direct array of objects [{name: "..."}, ...]
      else if (data.every((item: any) => item && typeof item === 'object' && typeof item.name === 'string')) {
        for (const dex of data) {
          if (dex && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      }
    }
    
    // Deduplicate names
    const uniqueDexNames = [...new Set(dexNames)]
    
    // Always include default dex (empty string) first
    return ['', ...uniqueDexNames]
  } catch (error) {
    console.error('[Hyperliquid] Error fetching perpDexs:', error)
    return [''] // Fallback to default dex
  }
}

// Helper: Extract symbol from universe entry (handles various formats)
function extractSymbol(universeEntry: any): string | null {
  if (typeof universeEntry === 'string') {
    return universeEntry
  }
  if (typeof universeEntry === 'object' && universeEntry !== null) {
    // Try common field names
    return universeEntry.name || universeEntry.coin || universeEntry.token || universeEntry.symbol || null
  }
  return null
}

// Helper: Check if a DEX contains SILVER in its universe
// Uses meta endpoint which returns the perp universe (available perps)
async function dexContainsSilver(dex: string): Promise<boolean> {
  try {
    const requestBody: any = {
      type: 'meta',
    }
    
    // Include dex parameter if not empty
    if (dex) {
      requestBody.dex = dex
    }
    
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      return false
    }

    const meta = await fetchMeta(dex)
    if (!meta) {
      return false
    }
    
    const universe = meta.universe
    
    // Check if any universe entry contains "SILVER" (case-insensitive)
    for (const entry of universe) {
      const symbol = extractSymbol(entry)
      if (symbol && symbol.toUpperCase().includes('SILVER')) {
        return true
      }
    }
    
    return false
  } catch (error) {
    return false
  }
}

// Step 2: Fetch open positions from the perp DEX
// According to docs: clearinghouseState returns a direct object with assetPositions at top level
// Request body: { type: 'clearinghouseState', user: walletAddress, dex?: string }
async function fetchUserState(walletAddress: string, dex: string = ''): Promise<any> {
  try {
    const requestBody: any = {
      type: 'clearinghouseState',
      user: walletAddress,
    }
    
    // Include dex field if provided (the dex name found from perpDexs)
    if (dex) {
      requestBody.dex = dex
    }
    
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    
    // According to docs: clearinghouseState returns a direct object (not array)
    // with assetPositions at top level
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data
    }
    
    return data
  } catch (error) {
    throw error
  }
}


// Optimized position fetching:
// 1. Fetch all dexs using perpDexs
// 2. Determine which dex contains SILVER using meta
// 3. Only query clearinghouseState for default dex and dex with SILVER
// 4. Extract positions with robust parsing
async function fetchOpenPositions(walletAddress: string): Promise<PerpetualsOpenPosition[]> {
  try {
    // Step 1: Fetch all perpetual dexs
    const allDexs = await fetchAllPerpDexs()
    
    // Step 2: Determine which dexs to query
    const dexDefault = '' // Always query default for BTC/ETH
    let dexWithSilver: string | null = null
    
    // Check each non-default dex to find which one contains SILVER
    for (const dex of allDexs) {
      if (dex && dex !== dexDefault) {
        const containsSilver = await dexContainsSilver(dex)
        if (containsSilver) {
          dexWithSilver = dex
          break // Found it, no need to check others
        }
      }
    }
    
    // Step 3: Query only the necessary dexs
    const dexsToQuery = [dexDefault]
    if (dexWithSilver) {
      dexsToQuery.push(dexWithSilver)
    }
    
    const allPositions: PerpetualsOpenPosition[] = []
    
    // Step 4: Fetch positions from each relevant dex
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        
        // According to docs: assetPositions is at the top level of the response
        const assetPositions = userState?.assetPositions
        
        if (!assetPositions || !Array.isArray(assetPositions)) {
          continue
        }
        
        // Step 5: Process each position with robust extraction
        for (const pos of assetPositions) {
          // Position data might be in pos.position or directly in pos
          const position = pos.position || pos
          
          // Size parsing: handle both string and number
          let size = 0
          if (typeof position.szi === 'string') {
            size = parseFloat(position.szi)
          } else if (typeof position.szi === 'number') {
            size = position.szi
          } else if (typeof position.size === 'string') {
            size = parseFloat(position.size)
          } else if (typeof position.size === 'number') {
            size = position.size
          }
          
          // Skip positions with zero size (use tiny epsilon)
          if (Math.abs(size) < 0.0001) {
            continue
          }

          // Extract symbol: try coin first, then name as fallback
          const symbol = position.coin || position.name || ''
          
          if (!symbol) {
            continue
          }
          
          // Leverage extraction
          let leverage: number | null = null
          if (position.leverage && typeof position.leverage === 'object' && position.leverage.value !== undefined) {
            leverage = typeof position.leverage.value === 'string' 
              ? parseFloat(position.leverage.value) 
              : position.leverage.value
          }
          
          // Margin parsing: handle string or number
          let margin = 0
          if (typeof position.marginUsed === 'string') {
            margin = parseFloat(position.marginUsed)
          } else if (typeof position.marginUsed === 'number') {
            margin = position.marginUsed
          }
          
          // PnL parsing: handle string or number
          let unrealizedPnl = 0
          if (typeof position.unrealizedPnl === 'string') {
            unrealizedPnl = parseFloat(position.unrealizedPnl)
          } else if (typeof position.unrealizedPnl === 'number') {
            unrealizedPnl = position.unrealizedPnl
          }
          
          // Determine position side from size
          const positionSide: 'LONG' | 'SHORT' | null = size > 0 ? 'LONG' : size < 0 ? 'SHORT' : null

          allPositions.push({
            id: `hyperliquid-pos-${symbol}-${dex || 'default'}-${Date.now()}`,
            ticker: symbol,
            margin,
            pnl: unrealizedPnl,
            platform: 'Hyperliquid',
            leverage,
            positionSide,
          })
        }
      } catch (error) {
        // Silently continue if dex doesn't exist or has no positions
        continue
      }
    }
    
    return allPositions
  } catch (error) {
    console.error('Error fetching Hyperliquid open positions:', error)
    throw error
  }
}

// Fetch meta data (universe) for a dex to check if it contains SILVER
async function fetchMeta(dex: string = ''): Promise<{ universe: any[] } | null> {
  try {
    const requestBody: any = {
      type: 'meta',
    }
    
    if (dex) {
      requestBody.dex = dex
    }
    
    const response = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    
    let universe: any[] = []
    
    if (Array.isArray(data)) {
      if (data.length > 0 && Array.isArray(data[0])) {
        universe = data[0]
      } else if (data.length > 0 && data[0]?.universe && Array.isArray(data[0].universe)) {
        universe = data[0].universe
      }
    } else if (data?.universe && Array.isArray(data.universe)) {
      universe = data.universe
    }
    
    return { universe }
  } catch (error) {
    return null
  }
}



async function fetchAccountEquity(walletAddress: string, debug: boolean = false): Promise<ExchangeBalance[]> {
  try {
    // Use the same DEX discovery logic as fetchOpenPositions
    const allDexs = await fetchAllPerpDexs()
    const dexDefault = ''
    let dexWithSilver: string | null = null
    
    // Check each non-default dex to find which one contains SILVER
    for (const dex of allDexs) {
      if (dex && dex !== dexDefault) {
        const containsSilver = await dexContainsSilver(dex)
        if (containsSilver) {
          dexWithSilver = dex
          break
        }
      }
    }
    
    const dexsToQuery = [dexDefault]
    if (dexWithSilver) {
      dexsToQuery.push(dexWithSilver)
    }
    
    let totalAccountValue = 0
    
    // Fetch account value from each relevant dex
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        
        // Extract accountValue from clearinghouseState.marginSummary.accountValue
        let accountValue = 0
        if (userState?.clearinghouseState?.marginSummary?.accountValue !== undefined) {
          const value = userState.clearinghouseState.marginSummary.accountValue
          if (typeof value === 'string') {
            accountValue = parseFloat(value)
          } else if (typeof value === 'number') {
            accountValue = value
          }
        } else if (userState?.marginSummary?.accountValue !== undefined) {
          // Fallback: check top-level marginSummary
          const value = userState.marginSummary.accountValue
          if (typeof value === 'string') {
            accountValue = parseFloat(value)
          } else if (typeof value === 'number') {
            accountValue = value
          }
        }
        
        totalAccountValue += accountValue
      } catch (error) {
        // Continue with other dexs even if one fails
      }
    }
    
    // Return single entry with total account equity
    if (totalAccountValue > 0) {
      return [{
        id: 'hyperliquid-account-equity',
        item: 'Account Equity',
        holdings: totalAccountValue,
        platform: 'Hyperliquid',
      }]
    }
    
    return []
  } catch (error) {
    return []
  }
}

async function fetchHyperliquidPerpetualsData(
  walletAddress: string,
  debug: boolean = false
): Promise<PerpetualsData> {
  const [openPositions, exchangeBalance] = await Promise.all([
    fetchOpenPositions(walletAddress),
    fetchAccountEquity(walletAddress, debug),
  ])

  return {
    exchangeBalance,
    openPositions,
    openOrders: [],
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
    const debug = req.query?.debug === 'true'

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
    const perpetualsData = await fetchHyperliquidPerpetualsData(walletAddress, debug)

    // Return the data
    const response: any = {
      success: true,
      data: perpetualsData,
    }
    

    return res.status(200).json(response)
  } catch (error) {
    console.error('Error fetching Hyperliquid Perpetuals data:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

