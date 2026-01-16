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
  margin: number
  pnl: number
  platform: string
  leverage?: number | null
  positionSide?: 'LONG' | 'SHORT' | null
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
    
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0] === null && data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          const dex = data[i]
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      } else if (data.length > 1 && Array.isArray(data[1])) {
        const nestedArray = data[1]
        for (const dex of nestedArray) {
          if (dex && typeof dex === 'object' && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      } else if (data.every((item: any) => item && typeof item === 'object' && typeof item.name === 'string')) {
        for (const dex of data) {
          if (dex && typeof dex.name === 'string') {
            dexNames.push(dex.name)
          }
        }
      }
    }
    
    const uniqueDexNames = [...new Set(dexNames)]
    return ['', ...uniqueDexNames]
  } catch (error) {
    return ['']
  }
}

function extractSymbol(universeEntry: any): string | null {
  if (typeof universeEntry === 'string') {
    return universeEntry
  }
  if (typeof universeEntry === 'object' && universeEntry !== null) {
    return universeEntry.name || universeEntry.coin || universeEntry.token || universeEntry.symbol || null
  }
  return null
}

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

async function fetchUserState(walletAddress: string, dex: string = ''): Promise<any> {
  try {
    const requestBody: any = {
      type: 'clearinghouseState',
      user: walletAddress,
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
      const errorText = await response.text()
      throw new Error(`Hyperliquid API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data
    }
    
    return data
  } catch (error) {
    throw error
  }
}


async function fetchOpenPositions(walletAddress: string): Promise<PerpetualsOpenPosition[]> {
  try {
    const allDexs = await fetchAllPerpDexs()
    const dexDefault = ''
    let dexWithSilver: string | null = null
    
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
    
    const allPositions: PerpetualsOpenPosition[] = []
    
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        const assetPositions = userState?.assetPositions
        
        if (!assetPositions || !Array.isArray(assetPositions)) {
          continue
        }
        
        for (const pos of assetPositions) {
          const position = pos.position || pos
          
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
          
          if (Math.abs(size) < 0.0001) {
            continue
          }

          const symbol = position.coin || position.name || ''
          
          if (!symbol) {
            continue
          }
          
          let leverage: number | null = null
          if (position.leverage && typeof position.leverage === 'object' && position.leverage.value !== undefined) {
            leverage = typeof position.leverage.value === 'string' 
              ? parseFloat(position.leverage.value) 
              : position.leverage.value
          }
          
          let margin = 0
          if (typeof position.marginUsed === 'string') {
            margin = parseFloat(position.marginUsed)
          } else if (typeof position.marginUsed === 'number') {
            margin = position.marginUsed
          }
          
          let unrealizedPnl = 0
          if (typeof position.unrealizedPnl === 'string') {
            unrealizedPnl = parseFloat(position.unrealizedPnl)
          } else if (typeof position.unrealizedPnl === 'number') {
            unrealizedPnl = position.unrealizedPnl
          }
          
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
        continue
      }
    }
    
    return allPositions
  } catch (error) {
    throw error
  }
}

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



async function fetchAccountEquity(walletAddress: string): Promise<ExchangeBalance[]> {
  try {
    const allDexs = await fetchAllPerpDexs()
    const dexDefault = ''
    let dexWithSilver: string | null = null
    
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
    
    for (const dex of dexsToQuery) {
      try {
        const userState = await fetchUserState(walletAddress, dex)
        
        let accountValue = 0
        if (userState?.clearinghouseState?.marginSummary?.accountValue !== undefined) {
          const value = userState.clearinghouseState.marginSummary.accountValue
          if (typeof value === 'string') {
            accountValue = parseFloat(value)
          } else if (typeof value === 'number') {
            accountValue = value
          }
        } else if (userState?.marginSummary?.accountValue !== undefined) {
          const value = userState.marginSummary.accountValue
          if (typeof value === 'string') {
            accountValue = parseFloat(value)
          } else if (typeof value === 'number') {
            accountValue = value
          }
        }
        
        totalAccountValue += accountValue
      } catch (error) {
        continue
      }
    }
    
    if (totalAccountValue > 0) {
      return [{
        id: 'hyperliquid-account-equity',
        item: 'Hyperliquid',
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
  walletAddress: string
): Promise<PerpetualsData> {
  const [openPositions, exchangeBalance] = await Promise.all([
    fetchOpenPositions(walletAddress),
    fetchAccountEquity(walletAddress),
  ])

  return {
    exchangeBalance,
    openPositions,
    openOrders: [],
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
    initializeAdmin()

    const uid = req.query?.uid as string

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ 
        error: 'User ID (uid) is required. Provide it as a query parameter ?uid=your-user-id' 
      })
    }

    const db = admin.firestore()
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

    const perpetualsData = await fetchHyperliquidPerpetualsData(walletAddress)

    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}