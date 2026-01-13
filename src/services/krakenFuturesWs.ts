/**
 * Kraken Futures WebSocket Service
 * 
 * Client-side WebSocket service for streaming positions, margin, and PnL.
 * Runs in the browser (React app), not in Vercel serverless.
 * 
 * WebSocket endpoint: wss://futures.kraken.com/ws/v1
 */

// Normalized types for positions and balances
export type KrakenOpenPosition = {
  instrument: string
  balance: number
  entryPrice?: number
  markPrice?: number
  pnl?: number
  initialMargin?: number
  maintenanceMargin?: number
  initialMarginWithOrders?: number
  effectiveLeverage?: number
}

export type KrakenBalances = {
  currency?: string
  balance?: number
  portfolioValue?: number
  collateralValue?: number
  availableMargin?: number
  initialMargin?: number
  maintenanceMargin?: number
  pnl?: number
  unrealizedFunding?: number
  totalUnrealized?: number
  marginEquity?: number
}

export type KrakenWsState = {
  status: 'disconnected' | 'connecting' | 'challenged' | 'subscribed' | 'error'
  lastUpdateTs?: number
  balances?: KrakenBalances
  positions?: KrakenOpenPosition[]
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
  positions?: Array<{
    instrument: string
    balance: number
    entry_price?: number
    mark_price?: number
    pnl?: number
    initial_margin?: number
    maintenance_margin?: number
    initial_margin_with_orders?: number
    effective_leverage?: number
  }>
}


interface BalancesMessage extends WsMessage {
  feed: 'balances'
  data?: {
    currency?: string
    balance?: number
    portfolio_value?: number
    collateral_value?: number
    available?: number
    initial_margin?: number
    maintenance_margin?: number
    pnl?: number
    unrealized_funding?: number
    total_unrealized?: number
    margin_equity?: number
  }
}

/**
 * Signs a WebSocket challenge using HMAC-SHA512
 * Algorithm: sha256(challenge) → bytes, base64-decode api_secret → bytes,
 * hmac_sha512(secretBytes, sha256Bytes) → bytes, base64-encode output → string
 */
async function signWsChallenge(challenge: string, apiSecretBase64: string): Promise<string> {
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
 * Kraken Futures WebSocket Service
 * 
 * Owns WebSocket lifecycle:
 * - connect → challenge → sign challenge → subscribe → parse → update store
 * - reconnect with backoff
 * - Produces live stream of positions and balances
 */
export class KrakenFuturesWs {
  private ws: WebSocket | null = null
  private apiKey: string
  private apiSecret: string // base64
  private onState: (state: KrakenWsState) => void
  private state: KrakenWsState = {
    status: 'disconnected',
  }
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000 // Start with 1 second
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null
  private challenge: string | null = null
  private subscribedFeeds: Set<string> = new Set()
  private isIntentionallyDisconnected = false

  constructor(args: {
    apiKey: string
    apiSecret: string // base64
    onState: (s: KrakenWsState) => void
  }) {
    this.apiKey = args.apiKey
    this.apiSecret = args.apiSecret
    this.onState = args.onState
  }

  /**
   * Connect to WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[KrakenFuturesWs] Already connected')
      return
    }

    this.isIntentionallyDisconnected = false
    this.updateState({ status: 'connecting' })

    this.connectInternal().catch((error) => {
      console.error('[KrakenFuturesWs] Connection failed:', error)
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Connection failed',
      })
      this.scheduleReconnect()
    })
  }

  private async connectInternal(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = 'wss://futures.kraken.com/ws/v1'
      console.log('[KrakenFuturesWs] Connecting to', wsUrl)

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = async () => {
        console.log('[KrakenFuturesWs] WebSocket opened')
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
          console.error('[KrakenFuturesWs] Failed to parse message:', error, event.data)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[KrakenFuturesWs] WebSocket error:', error)
        this.updateState({
          status: 'error',
          error: 'WebSocket error occurred',
        })
        reject(error)
      }

      this.ws.onclose = (event) => {
        console.log('[KrakenFuturesWs] WebSocket closed', { code: event.code, reason: event.reason })
        this.ws = null
        this.challenge = null
        this.subscribedFeeds.clear()

        if (!this.isIntentionallyDisconnected) {
          this.updateState({ status: 'disconnected' })
          this.scheduleReconnect()
        } else {
          this.updateState({ status: 'disconnected' })
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

    console.log('[KrakenFuturesWs] Requesting challenge...')
    this.ws.send(JSON.stringify(challengeRequest))
  }

  private async handleMessage(message: WsMessage): Promise<void> {
    console.log('[KrakenFuturesWs] Received message:', message)

    // Handle challenge response
    if (message.event === 'challenge' && message.message) {
      const challengeResponse = message as ChallengeResponse
      this.challenge = challengeResponse.message
      console.log('[KrakenFuturesWs] Challenge received:', this.challenge)

      this.updateState({ status: 'challenged' })

      try {
        // Step B: Sign challenge
        const signedChallenge = await signWsChallenge(this.challenge, this.apiSecret)
        console.log('[KrakenFuturesWs] Challenge signed')

        // Step C: Subscribe to feeds
        await this.subscribeToFeeds(signedChallenge)
      } catch (error) {
        console.error('[KrakenFuturesWs] Failed to sign challenge or subscribe:', error)
        this.updateState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Authentication failed',
        })
      }
      return
    }

    // Handle subscription confirmation
    if (message.event === 'subscribed') {
      const subscribeResponse = message as SubscribeResponse
      console.log('[KrakenFuturesWs] Subscribed to feed:', subscribeResponse.feed)
      this.subscribedFeeds.add(subscribeResponse.feed)
      
      if (this.subscribedFeeds.size >= 2) {
        // Both open_positions and balances are subscribed
        this.updateState({ status: 'subscribed' })
        this.startKeepAlive()
      }
      return
    }

    // Handle open_positions feed
    if (message.feed === 'open_positions') {
      const positionsMessage = message as OpenPositionsMessage
      if (positionsMessage.positions) {
        const positions: KrakenOpenPosition[] = positionsMessage.positions.map((pos) => ({
          instrument: pos.instrument,
          balance: pos.balance,
          entryPrice: pos.entry_price,
          markPrice: pos.mark_price,
          pnl: pos.pnl,
          initialMargin: pos.initial_margin,
          maintenanceMargin: pos.maintenance_margin,
          initialMarginWithOrders: pos.initial_margin_with_orders,
          effectiveLeverage: pos.effective_leverage,
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
        const balances: KrakenBalances = {
          currency: balancesMessage.data.currency,
          balance: balancesMessage.data.balance,
          portfolioValue: balancesMessage.data.portfolio_value,
          collateralValue: balancesMessage.data.collateral_value,
          availableMargin: balancesMessage.data.available, // WS sends 'available' field
          initialMargin: balancesMessage.data.initial_margin,
          maintenanceMargin: balancesMessage.data.maintenance_margin,
          pnl: balancesMessage.data.pnl,
          unrealizedFunding: balancesMessage.data.unrealized_funding,
          totalUnrealized: balancesMessage.data.total_unrealized,
          marginEquity: balancesMessage.data.margin_equity,
        }
        this.updateState({
          balances,
          lastUpdateTs: Date.now(),
        })
      }
      return
    }

    // Handle error messages
    if (message.event === 'error' || message.error) {
      console.error('[KrakenFuturesWs] Error message:', message)
      this.updateState({
        status: 'error',
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
    console.log('[KrakenFuturesWs] Subscribing to open_positions...')
    this.ws.send(JSON.stringify(openPositionsSubscribe))

    // Subscribe to balances
    const balancesSubscribe = {
      event: 'subscribe',
      feed: 'balances',
      api_key: this.apiKey,
      original_challenge: this.challenge,
      signed_challenge: signedChallenge,
    }
    console.log('[KrakenFuturesWs] Subscribing to balances...')
    this.ws.send(JSON.stringify(balancesSubscribe))
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
        console.log('[KrakenFuturesWs] Keep-alive check')
      }
    }, 50000)
  }

  private scheduleReconnect(): void {
    if (this.isIntentionallyDisconnected) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[KrakenFuturesWs] Max reconnect attempts reached')
      this.updateState({
        status: 'error',
        error: 'Max reconnect attempts reached',
      })
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000) // Max 60s
    console.log(`[KrakenFuturesWs] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`)

    this.reconnectTimer = setTimeout(() => {
      if (!this.isIntentionallyDisconnected) {
        console.log(`[KrakenFuturesWs] Reconnecting (attempt ${this.reconnectAttempts})...`)
        this.connectInternal().catch((error) => {
          console.error('[KrakenFuturesWs] Reconnect failed:', error)
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
    this.updateState({ status: 'disconnected' })
  }

  private updateState(updates: Partial<KrakenWsState>): void {
    this.state = { ...this.state, ...updates }
    
    // Notify callback
    try {
      this.onState({ ...this.state })
    } catch (error) {
      console.error('[KrakenFuturesWs] Error in state update callback:', error)
    }
  }

  /**
   * Get current state (for external access)
   */
  getState(): KrakenWsState {
    return { ...this.state }
  }
}
