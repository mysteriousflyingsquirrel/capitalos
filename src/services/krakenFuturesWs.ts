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
  flexFuturesBalanceValue?: number // Account Equity: flex_futures.balance_value
  totalBalance?: number // Canonical total balance for Kraken Futures
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
    flex_futures?: {
      portfolio_value?: number
      margin_equity?: number
      balance_value?: number
      total_unrealized?: number
      pnl?: number
      unrealized_funding?: number
    }
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
  private debug = false // Enable debug logging

  constructor(args: {
    apiKey: string
    apiSecret: string // base64
    onState: (s: KrakenWsState) => void
    debug?: boolean
  }) {
    this.apiKey = args.apiKey
    this.apiSecret = args.apiSecret
    this.onState = args.onState
    this.debug = args.debug || false
  }

  /**
   * Helper: Safely parse number from string, number, null, or undefined
   * Returns a finite number or undefined
   */
  private toNumber(value: number | string | null | undefined): number | undefined {
    if (value === null || value === undefined) {
      return undefined
    }
    if (typeof value === 'number') {
      return isFinite(value) ? value : undefined
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  /**
   * Normalize balances payload: handle both message.data and top-level fields
   */
  private normalizeBalancesPayload(message: WsMessage): any {
    // If message.data exists and is an object, use that
    if (message.data && typeof message.data === 'object' && !Array.isArray(message.data)) {
      return message.data
    }
    
    // Otherwise, treat message itself as payload (minus meta fields)
    const metaFields = new Set(['feed', 'seq', 'timestamp', 'account', 'event', 'message', 'data'])
    const payload: any = {}
    
    for (const [key, value] of Object.entries(message)) {
      if (!metaFields.has(key)) {
        payload[key] = value
      }
    }
    
    return payload
  }

  /**
   * Normalize positions payload: handle different structures
   */
  private normalizePositionsPayload(message: WsMessage): any[] | null {
    // If message.positions exists and is an array
    if (message.positions && Array.isArray(message.positions)) {
      return message.positions
    }
    
    // If message.data?.positions exists and is an array
    if (message.data && typeof message.data === 'object' && !Array.isArray(message.data)) {
      if (Array.isArray((message.data as any).positions)) {
        return (message.data as any).positions
      }
    }
    
    // If message.data is an array and looks like positions
    if (Array.isArray(message.data)) {
      // Check if it looks like positions (has instrument or similar fields)
      if (message.data.length > 0 && message.data[0] && typeof message.data[0] === 'object') {
        const firstItem = message.data[0] as any
        if (firstItem.instrument || firstItem.symbol || firstItem.product_id) {
          return message.data
        }
      }
    }
    
    return null
  }

  /**
   * Check if a message is a balances feed (snapshot, update, or legacy)
   */
  private isBalancesFeed(feed: string | undefined): boolean {
    return feed === 'balances' || feed === 'balances_snapshot' || feed === 'balances_update'
  }

  /**
   * Check if a message is a positions feed (snapshot, update, or legacy)
   */
  private isPositionsFeed(feed: string | undefined): boolean {
    return feed === 'open_positions' || feed === 'open_positions_snapshot' || feed === 'open_positions_update'
  }

  /**
   * Connect to WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    this.isIntentionallyDisconnected = false
    this.updateState({ status: 'connecting' })

    this.connectInternal().catch((error) => {
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

      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = async () => {
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
          // Silently handle parse errors
        }
      }

      this.ws.onerror = (error) => {
        this.updateState({
          status: 'error',
          error: 'WebSocket error occurred',
        })
        reject(error)
      }

      this.ws.onclose = (event) => {
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

    this.ws.send(JSON.stringify(challengeRequest))
  }

  private async handleMessage(message: WsMessage): Promise<void> {
    // Handle challenge response
    if (message.event === 'challenge' && message.message) {
      const challengeResponse = message as ChallengeResponse
      this.challenge = challengeResponse.message

      this.updateState({ status: 'challenged' })

      try {
        // Step B: Sign challenge
        const signedChallenge = await signWsChallenge(this.challenge, this.apiSecret)

        // Step C: Subscribe to feeds
        await this.subscribeToFeeds(signedChallenge)
      } catch (error) {
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
      this.subscribedFeeds.add(subscribeResponse.feed)
      
      if (this.subscribedFeeds.size >= 2) {
        // Both open_positions and balances are subscribed
        this.updateState({ status: 'subscribed' })
        this.startKeepAlive()
      }
      return
    }

    // Handle open_positions feed (snapshot, update, or legacy)
    if (this.isPositionsFeed(message.feed)) {
      const positionsArray = this.normalizePositionsPayload(message)
      
      if (this.debug) {
        console.log('[KrakenFuturesWs] Positions feed:', {
          feed: message.feed,
          hasPositions: !!positionsArray,
          positionsCount: positionsArray?.length || 0,
          messageKeys: Object.keys(message),
        })
      }
      
      if (positionsArray && Array.isArray(positionsArray)) {
        const positions: KrakenOpenPosition[] = positionsArray.map((pos: any) => ({
          instrument: pos.instrument || pos.symbol || pos.product_id || '',
          balance: this.toNumber(pos.balance) || 0,
          entryPrice: this.toNumber(pos.entry_price || pos.entryPrice),
          markPrice: this.toNumber(pos.mark_price || pos.markPrice),
          pnl: this.toNumber(pos.pnl),
          initialMargin: this.toNumber(pos.initial_margin || pos.initialMargin),
          maintenanceMargin: this.toNumber(pos.maintenance_margin || pos.maintenanceMargin),
          initialMarginWithOrders: this.toNumber(pos.initial_margin_with_orders || pos.initialMarginWithOrders),
          effectiveLeverage: this.toNumber(pos.effective_leverage || pos.effectiveLeverage),
        }))
        
        this.updateState({
          positions,
          lastUpdateTs: Date.now(),
        })
      }
      return
    }

    // Handle balances feed (snapshot, update, or legacy)
    if (this.isBalancesFeed(message.feed)) {
      const payload = this.normalizeBalancesPayload(message)
      
      if (this.debug) {
        console.log('[KrakenFuturesWs] Balances feed:', {
          feed: message.feed,
          payloadKeys: Object.keys(payload),
          hasFlexFutures: !!payload.flex_futures,
          flexFutures: payload.flex_futures,
          rawMarginEquity: payload.margin_equity,
          rawPortfolioValue: payload.portfolio_value,
          rawBalance: payload.balance,
        })
      }
      
      if (payload && typeof payload === 'object') {
        // Get previous balances to merge with
        const prevBalances = this.state.balances ?? {}
        
        // Parse flex_futures fields (unified/multi-collateral account)
        const flexPortfolio = this.toNumber(payload.flex_futures?.portfolio_value)
        const flexMarginEquity = this.toNumber(payload.flex_futures?.margin_equity)
        const flexBalanceValue = this.toNumber(payload.flex_futures?.balance_value)
        const flexTotalUnrealized = this.toNumber(payload.flex_futures?.total_unrealized)
        const flexPnl = this.toNumber(payload.flex_futures?.pnl)
        const flexUnrealizedFunding = this.toNumber(payload.flex_futures?.unrealized_funding)
        
        // Parse top-level fields (legacy/single-collateral account)
        const marginEq = this.toNumber(payload.margin_equity)
        const portfolio = this.toNumber(payload.portfolio_value)
        const balance = this.toNumber(payload.balance)
        const available = this.toNumber(payload.available)
        const initialMargin = this.toNumber(payload.initial_margin)
        const maintenanceMargin = this.toNumber(payload.maintenance_margin)
        const pnl = this.toNumber(payload.pnl)
        const unrealizedFunding = this.toNumber(payload.unrealized_funding)
        const totalUnrealized = this.toNumber(payload.total_unrealized)
        const collateralValue = this.toNumber(payload.collateral_value)
        
        // Compute totalBalance with priority (includes unrealized PnL when available)
        // Priority 1: flex_futures.portfolio_value (includes unrealized value)
        // Priority 2: flex_futures.margin_equity
        // Priority 3: flex_futures.balance_value + flex_futures.total_unrealized (if both present)
        // Fallback: top-level fields (portfolio_value > margin_equity > balance)
        let totalBalance: number | undefined
        let totalBalanceSource: string
        
        if (flexPortfolio !== undefined && isFinite(flexPortfolio)) {
          totalBalance = flexPortfolio
          totalBalanceSource = 'flex_futures.portfolio_value'
        } else if (flexMarginEquity !== undefined) {
          totalBalance = flexMarginEquity
          totalBalanceSource = 'flex_futures.margin_equity'
        } else if (flexBalanceValue !== undefined && flexTotalUnrealized !== undefined) {
          totalBalance = flexBalanceValue + flexTotalUnrealized
          totalBalanceSource = 'flex_futures.balance_value + flex_futures.total_unrealized'
        } else if (portfolio !== undefined) {
          totalBalance = portfolio
          totalBalanceSource = 'portfolio_value'
        } else if (marginEq !== undefined) {
          totalBalance = marginEq
          totalBalanceSource = 'margin_equity'
        } else if (balance !== undefined) {
          totalBalance = balance
          totalBalanceSource = 'balance'
        } else {
          totalBalanceSource = 'none (preserved)'
        }
        
        // If totalBalance is undefined, preserve previous value
        if (totalBalance === undefined && prevBalances.totalBalance !== undefined) {
          totalBalance = prevBalances.totalBalance
        }
        
        if (this.debug) {
          console.log('[KrakenFuturesWs] Parsed balances:', {
            flexPortfolio,
            flexMarginEquity,
            flexBalanceValue,
            flexTotalUnrealized,
            marginEq,
            portfolio,
            balance,
            totalBalance,
            totalBalanceSource,
            changed: totalBalance !== prevBalances.totalBalance,
            previous: prevBalances.totalBalance,
          })
        }
        
        // Merge: only overwrite fields if new parsed value is not undefined
        const balances: KrakenBalances = {
          // Preserve previous values if new ones are undefined
          currency: payload.currency ?? prevBalances.currency,
          balance: balance ?? prevBalances.balance,
          portfolioValue: portfolio ?? prevBalances.portfolioValue,
          collateralValue: collateralValue ?? prevBalances.collateralValue,
          availableMargin: available ?? prevBalances.availableMargin,
          initialMargin: initialMargin ?? prevBalances.initialMargin,
          maintenanceMargin: maintenanceMargin ?? prevBalances.maintenanceMargin,
          pnl: pnl ?? prevBalances.pnl,
          unrealizedFunding: unrealizedFunding ?? prevBalances.unrealizedFunding,
          totalUnrealized: totalUnrealized ?? prevBalances.totalUnrealized,
          marginEquity: marginEq ?? prevBalances.marginEquity,
          flexFuturesBalanceValue: flexBalanceValue ?? prevBalances.flexFuturesBalanceValue,
          totalBalance: totalBalance,
        }
        
        // Store source in a debug-friendly way (could be added to state if needed)
        if (this.debug && totalBalance !== undefined) {
          console.log(`[KrakenFuturesWs] totalBalance computed: ${totalBalance} (source: ${totalBalanceSource})`)
        }
        
        this.updateState({
          balances,
          lastUpdateTs: Date.now(),
        })
      } else {
        if (this.debug) {
          console.warn('[KrakenFuturesWs] Balances message received but payload is invalid:', message)
        }
      }
      return
    }

    // Handle error messages
    if (message.event === 'error' || message.error) {
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
    this.ws.send(JSON.stringify(openPositionsSubscribe))

    // Subscribe to balances
    const balancesSubscribe = {
      event: 'subscribe',
      feed: 'balances',
      api_key: this.apiKey,
      original_challenge: this.challenge,
      signed_challenge: signedChallenge,
    }
    this.ws.send(JSON.stringify(balancesSubscribe))
  }

  /**
   * Subscribe to ticker feed for a specific product_id (public feed, no auth required)
   */
  private subscribeToTicker(productId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const tickerSubscribe = {
      event: 'subscribe',
      feed: 'ticker',
      product_ids: [productId],
    }
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
      }
    }, 50000)
  }

  private scheduleReconnect(): void {
    if (this.isIntentionallyDisconnected) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.updateState({
        status: 'error',
        error: 'Max reconnect attempts reached',
      })
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 60000) // Max 60s

    this.reconnectTimer = setTimeout(() => {
      if (!this.isIntentionallyDisconnected) {
        this.connectInternal().catch((error) => {
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
      // Silently handle callback errors
    }
  }

  /**
   * Get current state (for external access)
   */
  getState(): KrakenWsState {
    return { ...this.state }
  }
}