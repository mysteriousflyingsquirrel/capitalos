/**
 * Kraken Futures WebSocket Client
 * 
 * Implements WebSocket connection to wss://futures.kraken.com/ws/v1
 * with authentication flow and subscriptions for:
 * - open_positions (private)
 * - balances (private)
 * - ticker (public, optional)
 */

// WebSocket state types
export type KrakenWsConnectionStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'authenticated' 
  | 'subscribed' 
  | 'error'

export interface KrakenWsPosition {
  instrument: string
  balance: number
  entryPrice?: number
  markPrice?: number
  pnl?: number
  initialMargin?: number
  maintenanceMargin?: number
  initialMarginWithOrders?: number
}

export interface KrakenWsBalances {
  portfolioValue?: number
  initialMargin?: number
  maintenanceMargin?: number
  available?: number
  pnl?: number
  unrealizedFunding?: number
  unit?: string
}

export interface KrakenWsState {
  balances: KrakenWsBalances | null
  positions: KrakenWsPosition[]
  lastUpdateTs: number
  connectionStatus: KrakenWsConnectionStatus
  error?: string
}

// WebSocket message types
interface WsMessage {
  event?: string
  feed?: string
  message?: string
  [key: string]: any
}

interface ChallengeResponse extends WsMessage {
  event: 'challenge'
  message: string // UUID challenge
}

interface SubscribeResponse extends WsMessage {
  event: 'subscribed'
  feed: string
}

interface OpenPositionsMessage extends WsMessage {
  feed: 'open_positions'
  data?: Array<{
    instrument: string
    balance: number
    entry_price?: number
    mark_price?: number
    pnl?: number
    initial_margin?: number
    maintenance_margin?: number
    initial_margin_with_orders?: number
  }>
}

interface BalancesMessage extends WsMessage {
  feed: 'balances'
  data?: {
    portfolio_value?: number
    initial_margin?: number
    maintenance_margin?: number
    available?: number
    pnl?: number
    unrealized_funding?: number
    unit?: string
  }
}

interface TickerMessage extends WsMessage {
  feed: 'ticker'
  product_id?: string
  price?: number
  [key: string]: any
}

/**
 * Signs a WebSocket challenge using HMAC-SHA512
 * Algorithm: sha256(challenge) → bytes, base64-decode api_secret → bytes,
 * hmac_sha512(secretBytes, sha256Bytes) → bytes, base64-encode output → string
 */
export async function signWsChallenge(challenge: string, apiSecretBase64: string): Promise<string> {
  // Step 1: SHA256 of challenge
  const challengeBytes = new TextEncoder().encode(challenge)
  const sha256HashBuffer = await crypto.subtle.digest('SHA-256', challengeBytes)
  
  // Step 2: Base64-decode API secret
  const secretKeyBuffer = Uint8Array.from(atob(apiSecretBase64), c => c.charCodeAt(0))
  
  // Step 3: HMAC-SHA512
  const key = await crypto.subtle.importKey(
    'raw',
    secretKeyBuffer,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  
  const hmacBuffer = await crypto.subtle.sign('HMAC', key, sha256HashBuffer)
  
  // Step 4: Base64-encode output
  const hmacArray = new Uint8Array(hmacBuffer)
  const base64String = btoa(String.fromCharCode(...hmacArray))
  
  return base64String
}

/**
 * Kraken Futures WebSocket Client
 */
export class KrakenFuturesWsClient {
  private ws: WebSocket | null = null
  private apiKey: string = ''
  private apiSecret: string = ''
  private state: KrakenWsState = {
    balances: null,
    positions: [],
    lastUpdateTs: 0,
    connectionStatus: 'disconnected',
  }
  private listeners: Set<(state: KrakenWsState) => void> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000 // Start with 1 second
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null
  private challenge: string | null = null
  private subscribedFeeds: Set<string> = new Set()
  private isIntentionallyDisconnected = false

  constructor() {
    // Constructor is intentionally minimal
  }

  /**
   * Connect to Kraken Futures WebSocket
   */
  async connect(apiKey: string, apiSecret: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[KrakenWS] Already connected')
      return
    }

    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.isIntentionallyDisconnected = false
    this.updateState({ connectionStatus: 'connecting' })

    try {
      await this.connectInternal()
    } catch (error) {
      console.error('[KrakenWS] Connection failed:', error)
      this.updateState({
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Connection failed',
      })
      this.scheduleReconnect()
    }
  }

  private async connectInternal(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = 'wss://futures.kraken.com/ws/v1'
      console.log('[KrakenWS] Connecting to', wsUrl)

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = async () => {
        console.log('[KrakenWS] WebSocket opened')
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000

        try {
          // Step A: Request challenge
          await this.requestChallenge()
          resolve()
        } catch (error) {
          reject(error)
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('[KrakenWS] Failed to parse message:', error, event.data)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[KrakenWS] WebSocket error:', error)
        this.updateState({
          connectionStatus: 'error',
          error: 'WebSocket error occurred',
        })
        reject(error)
      }

      this.ws.onclose = (event) => {
        console.log('[KrakenWS] WebSocket closed', { code: event.code, reason: event.reason })
        this.ws = null
        this.challenge = null
        this.subscribedFeeds.clear()

        if (!this.isIntentionallyDisconnected) {
          this.updateState({ connectionStatus: 'disconnected' })
          this.scheduleReconnect()
        } else {
          this.updateState({ connectionStatus: 'disconnected' })
        }
      }
    })
  }

  private async requestChallenge(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open')
    }

    const challengeRequest = {
      event: 'challenge',
      api_key: this.apiKey,
    }

    console.log('[KrakenWS] Requesting challenge...')
    this.ws.send(JSON.stringify(challengeRequest))
  }

  private async handleMessage(message: WsMessage): Promise<void> {
    console.log('[KrakenWS] Received message:', message)

    // Handle challenge response
    if (message.event === 'challenge' && message.message) {
      const challengeResponse = message as ChallengeResponse
      this.challenge = challengeResponse.message
      console.log('[KrakenWS] Challenge received:', this.challenge)

      try {
        // Step B: Sign challenge
        const signedChallenge = await signWsChallenge(this.challenge, this.apiSecret)
        console.log('[KrakenWS] Challenge signed')

        // Step C: Subscribe to feeds
        this.updateState({ connectionStatus: 'authenticated' })
        await this.subscribeToFeeds(signedChallenge)
      } catch (error) {
        console.error('[KrakenWS] Failed to sign challenge or subscribe:', error)
        this.updateState({
          connectionStatus: 'error',
          error: error instanceof Error ? error.message : 'Authentication failed',
        })
      }
      return
    }

    // Handle subscription confirmation
    if (message.event === 'subscribed') {
      const subscribeResponse = message as SubscribeResponse
      console.log('[KrakenWS] Subscribed to feed:', subscribeResponse.feed)
      this.subscribedFeeds.add(subscribeResponse.feed)
      
      if (this.subscribedFeeds.size >= 2) {
        // Both open_positions and balances are subscribed
        this.updateState({ connectionStatus: 'subscribed' })
        this.startKeepAlive()
      }
      return
    }

    // Handle open_positions feed
    if (message.feed === 'open_positions') {
      const positionsMessage = message as OpenPositionsMessage
      if (positionsMessage.data) {
        const positions: KrakenWsPosition[] = positionsMessage.data.map((pos) => ({
          instrument: pos.instrument,
          balance: pos.balance,
          entryPrice: pos.entry_price,
          markPrice: pos.mark_price,
          pnl: pos.pnl,
          initialMargin: pos.initial_margin,
          maintenanceMargin: pos.maintenance_margin,
          initialMarginWithOrders: pos.initial_margin_with_orders,
        }))
        this.updateState({
          positions,
          lastUpdateTs: Date.now(),
        })
      }
      return
    }

    // Handle balances feed
    if (message.feed === 'balances') {
      const balancesMessage = message as BalancesMessage
      if (balancesMessage.data) {
        const balances: KrakenWsBalances = {
          portfolioValue: balancesMessage.data.portfolio_value,
          initialMargin: balancesMessage.data.initial_margin,
          maintenanceMargin: balancesMessage.data.maintenance_margin,
          available: balancesMessage.data.available,
          pnl: balancesMessage.data.pnl,
          unrealizedFunding: balancesMessage.data.unrealized_funding,
          unit: balancesMessage.data.unit,
        }
        this.updateState({
          balances,
          lastUpdateTs: Date.now(),
        })
      }
      return
    }

    // Handle ticker feed (optional)
    if (message.feed === 'ticker') {
      // Ticker updates can be used for real-time price updates
      // For now, we'll just log them
      console.log('[KrakenWS] Ticker update:', message)
      return
    }

    // Handle error messages
    if (message.event === 'error' || message.error) {
      console.error('[KrakenWS] Error message:', message)
      this.updateState({
        connectionStatus: 'error',
        error: message.error || message.message || 'Unknown error',
      })
      return
    }
  }

  private async subscribeToFeeds(signedChallenge: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.challenge) {
      throw new Error('WebSocket not ready for subscription')
    }

    // Subscribe to open_positions
    const openPositionsSubscribe = {
      event: 'subscribe',
      feed: 'open_positions',
      api_key: this.apiKey,
      original_challenge: this.challenge,
      signed_challenge: signedChallenge,
    }
    console.log('[KrakenWS] Subscribing to open_positions...')
    this.ws.send(JSON.stringify(openPositionsSubscribe))

    // Subscribe to balances
    const balancesSubscribe = {
      event: 'subscribe',
      feed: 'balances',
      api_key: this.apiKey,
      original_challenge: this.challenge,
      signed_challenge: signedChallenge,
    }
    console.log('[KrakenWS] Subscribing to balances...')
    this.ws.send(JSON.stringify(balancesSubscribe))

    // Optionally subscribe to ticker for open positions
    // We'll do this after we receive positions
  }

  /**
   * Subscribe to ticker feed for specific product IDs (public, no auth needed)
   */
  subscribeToTicker(productIds: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[KrakenWS] Cannot subscribe to ticker: WebSocket not open')
      return
    }

    const tickerSubscribe = {
      event: 'subscribe',
      feed: 'ticker',
      product_ids: productIds,
    }
    console.log('[KrakenWS] Subscribing to ticker for:', productIds)
    this.ws.send(JSON.stringify(tickerSubscribe))
  }

  private startKeepAlive(): void {
    // Clear any existing keep-alive timer
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
    }

    // Send a ping every 50 seconds (less than 60s requirement)
    this.keepAliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // WebSocket ping frame (if supported by browser)
        // Some browsers don't expose ping, so we'll rely on the connection staying alive
        // and reconnect on close
        console.log('[KrakenWS] Keep-alive check')
      }
    }, 50000)
  }

  private scheduleReconnect(): void {
    if (this.isIntentionallyDisconnected) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[KrakenWS] Max reconnect attempts reached')
      this.updateState({
        connectionStatus: 'error',
        error: 'Max reconnect attempts reached',
      })
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000) // Max 60s
    console.log(`[KrakenWS] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)

    this.reconnectTimer = setTimeout(() => {
      if (!this.isIntentionallyDisconnected) {
        console.log(`[KrakenWS] Reconnecting (attempt ${this.reconnectAttempts})...`)
        this.connectInternal().catch((error) => {
          console.error('[KrakenWS] Reconnect failed:', error)
          this.scheduleReconnect()
        })
      }
    }, delay)
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.isIntentionallyDisconnected = true

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.challenge = null
    this.subscribedFeeds.clear()
    this.updateState({ connectionStatus: 'disconnected' })
  }

  /**
   * Get current state
   */
  getState(): KrakenWsState {
    return { ...this.state }
  }

  /**
   * Subscribe to state updates
   */
  onUpdate(callback: (state: KrakenWsState) => void): () => void {
    this.listeners.add(callback)
    // Immediately call with current state
    callback(this.getState())
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback)
    }
  }

  private updateState(updates: Partial<KrakenWsState>): void {
    this.state = { ...this.state, ...updates }
    
    // Notify all listeners
    const state = this.getState()
    this.listeners.forEach((callback) => {
      try {
        callback(state)
      } catch (error) {
        console.error('[KrakenWS] Error in state update callback:', error)
      }
    })
  }

  /**
   * Convert WebSocket state to PerpetualsData format
   */
  toPerpetualsData(): import('../pages/NetWorth').PerpetualsData {
    const positions: import('../pages/NetWorth').PerpetualsOpenPosition[] = this.state.positions.map((pos, index) => ({
      id: `kraken-${pos.instrument}-${index}`,
      ticker: pos.instrument,
      margin: pos.initialMargin || 0,
      pnl: pos.pnl || 0,
      platform: 'Kraken',
    }))

    // Map balances to available/locked margin
    const availableMargin: import('../pages/NetWorth').PerpetualsAvailableMargin[] = []
    const lockedMargin: import('../pages/NetWorth').PerpetualsLockedMargin[] = []

    if (this.state.balances) {
      const balances = this.state.balances
      const unit = balances.unit || 'USD'
      
      // Available margin
      if (balances.available !== undefined && balances.available !== null) {
        availableMargin.push({
          id: 'kraken-available',
          asset: unit,
          margin: balances.available,
          platform: 'Kraken',
        })
      }

      // Locked margin (initial margin)
      if (balances.initialMargin !== undefined && balances.initialMargin !== null) {
        lockedMargin.push({
          id: 'kraken-locked',
          asset: unit,
          margin: balances.initialMargin,
          platform: 'Kraken',
        })
      }
    }

    return {
      openPositions: positions,
      availableMargin,
      lockedMargin,
    }
  }
}

// Singleton instance
let wsClientInstance: KrakenFuturesWsClient | null = null

/**
 * Get or create the singleton WebSocket client instance
 */
export function getKrakenFuturesWsClient(): KrakenFuturesWsClient {
  if (!wsClientInstance) {
    wsClientInstance = new KrakenFuturesWsClient()
  }
  return wsClientInstance
}
