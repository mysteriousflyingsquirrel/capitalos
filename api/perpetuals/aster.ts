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

interface PerpetualsOpenPosition {
  id: string
  ticker: string
  margin: number
  pnl: number
  platform: string
  leverage?: number | null
  positionSide?: 'LONG' | 'SHORT' | null
}

interface PerpetualsOpenOrder {
  id: string
  name: string
  margin: number | null
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

function signAsterRequest(apiSecret: string, queryString: string): string {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex')
}

function buildSignedQueryString(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const timestamp = Date.now()
  const allParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
    timestamp: String(timestamp),
  }

  const sortedKeys = Object.keys(allParams).sort()
  const queryString = sortedKeys
    .map(key => `${key}=${encodeURIComponent(allParams[key])}`)
    .join('&')

  const signature = signAsterRequest(apiSecret, queryString)

  return `${queryString}&signature=${signature}`
}


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

  const positions: PerpetualsOpenPosition[] = []
  
  if (Array.isArray(data)) {
    for (const pos of data) {
      const positionAmt = parseFloat(pos.positionAmt || '0')
      if (Math.abs(positionAmt) < 0.0001) {
        continue
      }

      const symbol = pos.symbol || ''
      const margin = parseFloat(pos.isolatedMargin || pos.initialMargin || '0')
      const unrealizedPnl = parseFloat(pos.unRealizedProfit || '0')
      
      const leverage = pos.leverage !== undefined && pos.leverage !== null
        ? parseFloat(pos.leverage || '0')
        : null
      
      let positionSide: 'LONG' | 'SHORT' | null = null
      if (pos.positionSide) {
        const side = String(pos.positionSide).toUpperCase()
        if (side === 'LONG' || side === 'SHORT') {
          positionSide = side as 'LONG' | 'SHORT'
        }
      }
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
      const stopPrice = parseFloat(order.stopPrice || '0')
      
      const effectivePrice = price > 0 ? price : (stopPrice > 0 ? stopPrice : 0)
      const priceDisplay = effectivePrice > 0 ? ` @ ${effectivePrice}` : ''
      const name = `${symbol} ${side} ${type}${priceDisplay}`

      orders.push({
        id: `aster-order-${order.orderId || Date.now()}`,
        name,
        margin: null,
        platform: 'Aster',
      })
    }
  }

  return orders
}


async function fetchAccountEquity(
  apiKey: string,
  apiSecret: string
): Promise<ExchangeBalance[]> {
  try {
    const queryString = buildSignedQueryString({}, apiSecret)
    const url = `${ASTER_BASE_URL}/fapi/v2/account?${queryString}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      return []
    }

    const accountData = await response.json()
    
    let accountValue = 0
    
    if (accountData.totalWalletBalance !== undefined) {
      accountValue = parseFloat(accountData.totalWalletBalance || '0')
    } else if (accountData.totalMarginBalance !== undefined) {
      accountValue = parseFloat(accountData.totalMarginBalance || '0')
    } else if (accountData.availableBalance !== undefined) {
      accountValue = parseFloat(accountData.availableBalance || '0')
    }
    
    if (accountValue > 0) {
      return [{
        id: 'aster-account-equity',
        item: 'Aster',
        holdings: accountValue,
        platform: 'Aster',
      }]
    }
    
    return []
  } catch (error) {
    return []
  }
}

async function fetchAsterPerpetualsData(
  apiKey: string,
  apiSecret: string
): Promise<PerpetualsData> {
  const [openPositions, openOrders, exchangeBalance] = await Promise.all([
    fetchOpenPositions(apiKey, apiSecret),
    fetchOpenOrders(apiKey, apiSecret),
    fetchAccountEquity(apiKey, apiSecret),
  ])

  return {
    exchangeBalance,
    openPositions,
    openOrders,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()

    // Get keys from request body (passed from client)
    const { uid, apiKey, apiSecret } = req.body as {
      uid?: string
      apiKey?: string
      apiSecret?: string
    }

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ 
        error: 'User ID (uid) is required in request body' 
      })
    }

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ 
        error: 'Aster API credentials (apiKey and apiSecret) are required in request body' 
      })
    }

    const perpetualsData = await fetchAsterPerpetualsData(apiKey, apiSecret)

    return res.status(200).json({
      success: true,
      data: perpetualsData,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
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