import type { PerpetualsOpenPosition } from '../pages/NetWorth'

export type HyperliquidWsStatus = 'disconnected' | 'connecting' | 'subscribed' | 'error'

type ClearinghouseStateMessage = {
  channel?: string
  data?: {
    assetPositions?: Array<{
      type?: string
      position?: any
    }>
  }
}

type ActiveAssetCtxMessage = {
  channel?: string
  coin?: string
  data?: {
    ctx?: {
      markPx?: number | string
    }
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Browser-only WebSocket client to stream Hyperliquid positions (clearinghouseState).
 * Keeps scope intentionally small: positions only, no orders/balance/performance.
 *
 * WS endpoint (mainnet): wss://api.hyperliquid.xyz/ws
 */
export class HyperliquidPositionsWs {
  private ws: WebSocket | null = null
  private walletAddress: string
  private dex: string | null
  private onPositions: (positions: PerpetualsOpenPosition[]) => void
  private onMarkPrices?: (markPrices: Record<string, number>) => void
  private onStatus?: (status: HyperliquidWsStatus, error?: string) => void
  private isIntentionallyDisconnected = false
  private subscribedCoins = new Set<string>()
  private markPrices = new Map<string, number>()

  constructor(args: {
    walletAddress: string
    dex?: string | null
    onPositions: (positions: PerpetualsOpenPosition[]) => void
    onMarkPrices?: (markPrices: Record<string, number>) => void
    onStatus?: (status: HyperliquidWsStatus, error?: string) => void
  }) {
    this.walletAddress = args.walletAddress
    this.dex = args.dex ?? null
    this.onPositions = args.onPositions
    this.onMarkPrices = args.onMarkPrices
    this.onStatus = args.onStatus
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }
    this.isIntentionallyDisconnected = false
    this.onStatus?.('connecting')

    const wsUrl = 'wss://api.hyperliquid.xyz/ws'
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      try {
        const subscription: any = {
          type: 'clearinghouseState',
          user: this.walletAddress,
        }
        // dex is optional per HL docs
        if (this.dex) {
          subscription.dex = this.dex
        }

        this.ws?.send(
          JSON.stringify({
            method: 'subscribe',
            subscription,
          })
        )
      } catch (err) {
        this.onStatus?.('error', err instanceof Error ? err.message : String(err))
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Handle clearinghouseState messages (positions)
        if (data.channel === 'clearinghouseState') {
          const message: ClearinghouseStateMessage = data
          const assetPositions = message.data?.assetPositions
          if (!Array.isArray(assetPositions)) return

          const positions: PerpetualsOpenPosition[] = []
          const currentCoins = new Set<string>()

          for (const ap of assetPositions) {
            const p = ap?.position
            if (!p) continue

            const coin = typeof p.coin === 'string' ? p.coin : null
            if (!coin) continue

            const szi = toNumber(p.szi)
            if (szi === null || szi === 0) continue

            const entryPx = toNumber(p.entryPx)
            const liquidationPx = toNumber(p.liquidationPx)
            const marginUsed = toNumber(p.marginUsed) ?? 0
            const unrealizedPnl = toNumber(p.unrealizedPnl) ?? 0

            // Leverage is usually an object with a numeric `value`
            const leverage = toNumber(p.leverage?.value)

            // Funding: match existing REST behavior (invert HL sign)
            const sinceOpenFunding = toNumber(p.cumFunding?.sinceOpen)
            const fundingFeeUsd = sinceOpenFunding === null ? null : -sinceOpenFunding

            const coinUpper = coin.toUpperCase()
            currentCoins.add(coinUpper)

            positions.push({
              id: `hyperliquid-pos-${coinUpper}-${this.dex || 'default'}`,
              ticker: coinUpper,
              margin: marginUsed,
              pnl: unrealizedPnl,
              platform: 'Hyperliquid',
              leverage,
              positionSide: szi > 0 ? 'LONG' : 'SHORT',
              amountToken: Math.abs(szi),
              entryPrice: entryPx,
              liquidationPrice: liquidationPx,
              fundingFeeUsd,
            })
          }

          // Subscribe to activeAssetCtx for new coins
          for (const coin of currentCoins) {
            if (!this.subscribedCoins.has(coin) && this.ws?.readyState === WebSocket.OPEN) {
              try {
                this.ws.send(
                  JSON.stringify({
                    method: 'subscribe',
                    subscription: {
                      type: 'activeAssetCtx',
                      coin: coin,
                    },
                  })
                )
                this.subscribedCoins.add(coin)
              } catch (err) {
                // ignore subscription errors
              }
            }
          }

          // Unsubscribe from coins that no longer have positions
          for (const coin of this.subscribedCoins) {
            if (!currentCoins.has(coin) && this.ws?.readyState === WebSocket.OPEN) {
              try {
                this.ws.send(
                  JSON.stringify({
                    method: 'unsubscribe',
                    subscription: {
                      type: 'activeAssetCtx',
                      coin: coin,
                    },
                  })
                )
                this.subscribedCoins.delete(coin)
                this.markPrices.delete(coin)
              } catch (err) {
                // ignore unsubscribe errors
              }
            }
          }

          this.onStatus?.('subscribed')
          this.onPositions(positions)
          
          // Emit current mark prices
          if (this.onMarkPrices && this.markPrices.size > 0) {
            const pricesObj: Record<string, number> = {}
            this.markPrices.forEach((price, coin) => {
              pricesObj[coin] = price
            })
            this.onMarkPrices(pricesObj)
          }
          return
        }

        // Handle activeAssetCtx messages (mark prices)
        if (data.channel === 'activeAssetCtx') {
          const message: ActiveAssetCtxMessage = data
          const coin = message.coin
          if (!coin) return

          const coinUpper = coin.toUpperCase()
          const markPx = toNumber(message.data?.ctx?.markPx)
          
          if (markPx !== null && markPx > 0) {
            this.markPrices.set(coinUpper, markPx)
            
            // Emit updated mark prices
            if (this.onMarkPrices) {
              const pricesObj: Record<string, number> = {}
              this.markPrices.forEach((price, c) => {
                pricesObj[c] = price
              })
              this.onMarkPrices(pricesObj)
            }
          }
          return
        }
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onerror = () => {
      this.onStatus?.('error', 'WebSocket error')
    }

    this.ws.onclose = () => {
      this.ws = null
      if (!this.isIntentionallyDisconnected) {
        this.onStatus?.('disconnected')
      } else {
        this.onStatus?.('disconnected')
      }
    }
  }

  disconnect(): void {
    this.isIntentionallyDisconnected = true
    try {
      // Unsubscribe from all activeAssetCtx subscriptions
      if (this.ws?.readyState === WebSocket.OPEN) {
        for (const coin of this.subscribedCoins) {
          try {
            this.ws.send(
              JSON.stringify({
                method: 'unsubscribe',
                subscription: {
                  type: 'activeAssetCtx',
                  coin: coin,
                },
              })
            )
          } catch {
            // ignore unsubscribe errors
          }
        }
      }
      this.ws?.close()
    } catch {
      // ignore
    } finally {
      this.ws = null
      this.subscribedCoins.clear()
      this.markPrices.clear()
    }
    this.onStatus?.('disconnected')
  }
}

