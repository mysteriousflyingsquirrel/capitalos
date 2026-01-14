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
      console.log('[Hyperliquid] perpDexs response not OK, using default dex only')
      return [''] // Return default dex if we can't fetch the list
    }

    const data = await response.json()
    
    // Debug: log raw response type
    console.log('[Hyperliquid] perpDexs raw response type:', Array.isArray(data) ? 'array' : typeof data)
    console.log('[Hyperliquid] perpDexs raw response:', JSON.stringify(data, null, 2))
    
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
    
    // Debug: log extracted dex names
    console.log('[Hyperliquid] Extracted dex names:', uniqueDexNames)
    
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

    const data = await response.json()
    
    // meta returns [universe, marginTables] or similar structure
    // universe is an array of perp entries
    let universe: any[] = []
    
    if (Array.isArray(data)) {
      // Format: [universe, marginTables] or [{universe: [...]}, ...]
      if (data.length > 0 && Array.isArray(data[0])) {
        universe = data[0]
      } else if (data.length > 0 && data[0]?.universe && Array.isArray(data[0].universe)) {
        universe = data[0].universe
      }
    } else if (data?.universe && Array.isArray(data.universe)) {
      universe = data.universe
    }
    
    // Check if any universe entry contains "SILVER" (case-insensitive)
    for (const entry of universe) {
      const symbol = extractSymbol(entry)
      if (symbol && symbol.toUpperCase().includes('SILVER')) {
        console.log(`[Hyperliquid] DEX "${dex || 'default'}" contains SILVER: true (found symbol: ${symbol})`)
        return true
      }
    }
    
    console.log(`[Hyperliquid] DEX "${dex || 'default'}" contains SILVER: false`)
    return false
  } catch (error) {
    console.error(`[Hyperliquid] Error checking if dex "${dex || 'default'}" contains SILVER:`, error)
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
    
    console.log(`[Hyperliquid] Querying dexs: ${dexsToQuery.map(d => d || 'default').join(', ')}`)
    
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

// Helper: Parse margin summary from userState
function parseMarginSummary(userState: any, debug: boolean = false): { withdrawable: number; totalMarginUsed: number } {
  let withdrawable = 0
  let totalMarginUsed = 0
  
  // Parse withdrawable (free margin) in order:
  // 1. userState.withdrawable
  // 2. userState.marginSummary?.withdrawable
  // 3. userState.clearinghouseState?.marginSummary?.withdrawable (defensive)
  if (typeof userState.withdrawable === 'string') {
    withdrawable = parseFloat(userState.withdrawable)
  } else if (typeof userState.withdrawable === 'number') {
    withdrawable = userState.withdrawable
  } else if (userState.marginSummary) {
    if (typeof userState.marginSummary.withdrawable === 'string') {
      withdrawable = parseFloat(userState.marginSummary.withdrawable)
    } else if (typeof userState.marginSummary.withdrawable === 'number') {
      withdrawable = userState.marginSummary.withdrawable
    }
  } else if (userState.clearinghouseState?.marginSummary) {
    if (typeof userState.clearinghouseState.marginSummary.withdrawable === 'string') {
      withdrawable = parseFloat(userState.clearinghouseState.marginSummary.withdrawable)
    } else if (typeof userState.clearinghouseState.marginSummary.withdrawable === 'number') {
      withdrawable = userState.clearinghouseState.marginSummary.withdrawable
    }
  }
  
  // Parse totalMarginUsed in order:
  // 1. marginSummary.totalMarginUsed (preferred)
  // 2. marginSummary.marginUsed (fallback only)
  let summary: any = null
  if (userState.clearinghouseState?.userState?.marginSummary) {
    summary = userState.clearinghouseState.userState.marginSummary
  } else if (userState.clearinghouseState?.marginSummary) {
    summary = userState.clearinghouseState.marginSummary
  } else if (userState.marginSummary) {
    summary = userState.marginSummary
  }
  
  if (summary) {
    // Prefer totalMarginUsed
    if (typeof summary.totalMarginUsed === 'string') {
      totalMarginUsed = parseFloat(summary.totalMarginUsed)
    } else if (typeof summary.totalMarginUsed === 'number') {
      totalMarginUsed = summary.totalMarginUsed
    } else if (typeof summary.marginUsed === 'string') {
      // Fallback to marginUsed
      totalMarginUsed = parseFloat(summary.marginUsed)
    } else if (typeof summary.marginUsed === 'number') {
      totalMarginUsed = summary.marginUsed
    }
  }
  
  if (debug) {
    console.log('[Hyperliquid] parseMarginSummary:', {
      withdrawable,
      totalMarginUsed,
      userStateKeys: Object.keys(userState || {}),
      hasMarginSummary: !!summary,
    })
  }
  
  return { withdrawable, totalMarginUsed }
}

// Helper: Sum position margins from assetPositions
function sumPositionMargins(assetPositions: any[]): number {
  if (!Array.isArray(assetPositions)) {
    return 0
  }
  
  let sum = 0
  for (const pos of assetPositions) {
    const position = pos.position || pos
    
    // Only include positions where abs(szi) > 0
    let size = 0
    if (typeof position.szi === 'string') {
      size = parseFloat(position.szi)
    } else if (typeof position.szi === 'number') {
      size = position.szi
    }
    
    if (Math.abs(size) < 0.0001) {
      continue
    }
    
    // Extract position.marginUsed (defensive parsing)
    let positionMargin = 0
    if (typeof position.marginUsed === 'string') {
      positionMargin = parseFloat(position.marginUsed)
    } else if (typeof position.marginUsed === 'number') {
      positionMargin = position.marginUsed
    }
    
    sum += positionMargin
  }
  
  return sum
}

async function fetchAvailableMargin(walletAddress: string, debug: boolean = false): Promise<PerpetualsAvailableMargin[]> {
  try {
    // Use the same dexs as positions (default + dexWithSilver)
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
    
    let totalWithdrawable = 0
    
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        const { withdrawable } = parseMarginSummary(userState, debug)
        
        if (debug) {
          console.log(`[Hyperliquid] Dex "${dex || 'default'}" withdrawable:`, withdrawable)
        }
        
        // Sum withdrawable across queried dexs
        totalWithdrawable += withdrawable
      } catch (error) {
        console.error(`[Hyperliquid] Error fetching margin from dex "${dex || 'default'}":`, error)
        // Continue with other dexs even if one fails
      }
    }
    
    if (debug) {
      console.log('[Hyperliquid] Total withdrawable:', totalWithdrawable)
    }
    
    // Always return a single entry (even if margin is 0)
    return [{
      id: 'hyperliquid-available-margin-USDC',
      asset: 'USDC',
      margin: totalWithdrawable,
      platform: 'Hyperliquid',
    }]
  } catch (error) {
    console.error('[Hyperliquid] Error fetching available margin:', error)
    return []
  }
}

async function fetchLockedMargin(walletAddress: string, debug: boolean = false): Promise<PerpetualsLockedMargin[]> {
  try {
    // Get the dexs we query for positions (same logic as fetchOpenPositions)
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
    
    let totalLocked = 0
    
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        const { totalMarginUsed } = parseMarginSummary(userState, debug)
        
        // Get assetPositions to sum position margins
        const assetPositions = userState?.assetPositions
        const positionMarginSum = sumPositionMargins(assetPositions || [])
        
        if (debug) {
          console.log(`[Hyperliquid] Dex "${dex || 'default'}" totalMarginUsed:`, totalMarginUsed, 'positionMarginSum:', positionMarginSum)
        }
        
        // Calculate lockedMargin = max(0, totalMarginUsed - positionMarginSum)
        const lockedMargin = Math.max(0, totalMarginUsed - positionMarginSum)
        
        if (debug) {
          console.log(`[Hyperliquid] Dex "${dex || 'default'}" calculated lockedMargin:`, lockedMargin)
        }
        
        // Sum across queried dexs
        totalLocked += lockedMargin
      } catch (error) {
        console.error(`[Hyperliquid] Error fetching locked margin from dex "${dex || 'default'}":`, error)
        // Continue with other dexs even if one fails
      }
    }
    
    if (debug) {
      console.log('[Hyperliquid] Total locked margin:', totalLocked)
    }
    
    // Always return a single entry (even if margin is 0)
    return [{
      id: 'hyperliquid-locked-margin-USDC',
      asset: 'USDC',
      margin: totalLocked,
      platform: 'Hyperliquid',
    }]
  } catch (error) {
    console.error('[Hyperliquid] Error fetching locked margin:', error)
    return []
  }
}

async function fetchHyperliquidPerpetualsData(
  walletAddress: string,
  debug: boolean = false
): Promise<PerpetualsData> {
  // Fetch positions, margin in parallel
  const [openPositions, availableMargin, lockedMargin] = await Promise.all([
    fetchOpenPositions(walletAddress),
    fetchAvailableMargin(walletAddress, debug),
    fetchLockedMargin(walletAddress, debug),
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
    
    // Add debug info if requested
    if (debug) {
      const allDexs = await fetchAllPerpDexs()
      const dexsWithSilver: string[] = []
      const metaUniverseSample: Record<string, any[]> = {}
      
      // Check each dex for SILVER
      for (const dex of allDexs) {
        if (await dexContainsSilver(dex)) {
          dexsWithSilver.push(dex || 'default')
          
          // Get universe sample for this dex
          try {
            const requestBody: any = { type: 'meta' }
            if (dex) {
              requestBody.dex = dex
            }
            const metaResponse = await fetch(`${HYPERLIQUID_BASE_URL}/info`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            })
            if (metaResponse.ok) {
              const metaData = await metaResponse.json()
              let universe: any[] = []
              if (Array.isArray(metaData) && metaData.length > 0 && Array.isArray(metaData[0])) {
                universe = metaData[0]
              } else if (metaData?.universe && Array.isArray(metaData.universe)) {
                universe = metaData.universe
              }
              // Get first 10 symbols
              metaUniverseSample[dex || 'default'] = universe.slice(0, 10).map((entry: any) => extractSymbol(entry)).filter((s: string | null) => s !== null)
            }
          } catch (error) {
            // Ignore errors in debug mode
          }
        }
      }
      
      response.debug = {
        dexsDiscovered: allDexs,
        dexsWithSilver,
        metaUniverseSample,
      }
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

