import { type HyperliquidWsStatus } from './hyperliquidPositionsWs'

export type MarkPriceMap = Record<string, number | null>

type ActiveAssetCtxMessage = {
  channel?: string
  data?: {
    coin?: string
    ctx?: { markPx?: string | number; [key: string]: unknown }
    [key: string]: unknown
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
 * Browser-only WebSocket client to stream Hyperliquid active asset contexts (activeAssetCtx).
 * Subscribes to mark prices for multiple coins.
 *
 * WS endpoint (mainnet): wss://api.hyperliquid.xyz/ws
 */
export class HyperliquidAssetCtxWs {
  private ws: WebSocket | null = null
  private walletAddress: string
  private coins: Set<string>
  private onMarkPrices: (markPrices: MarkPriceMap) => void
  private onStatus?: (status: HyperliquidWsStatus, error?: string) => void
  private isIntentionallyDisconnected = false
  private markPrices: MarkPriceMap = {}

  constructor(args: {
    walletAddress: string
    coins: string[]
    onMarkPrices: (markPrices: MarkPriceMap) => void
    onStatus?: (status: HyperliquidWsStatus, error?: string) => void
  }) {
    this.walletAddress = args.walletAddress
    this.coins = new Set(args.coins)
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
        // Subscribe to activeAssetCtx for each coin
        for (const coin of this.coins) {
          const subscription: any = {
            type: 'activeAssetCtx',
            coin: coin,
          }

          this.ws?.send(
            JSON.stringify({
              method: 'subscribe',
              subscription,
            })
          )
        }
      } catch (err) {
        this.onStatus?.('error', err instanceof Error ? err.message : String(err))
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const message: ActiveAssetCtxMessage = JSON.parse(event.data)
        if (message.channel !== 'activeAssetCtx') return

        const data = message.data
        if (!data) return

        const coin = typeof data.coin === 'string' ? data.coin : null
        if (!coin) return

        const markPx = toNumber(data.ctx?.markPx)
        this.markPrices[coin] = markPx

        this.onStatus?.('subscribed')
        this.onMarkPrices({ ...this.markPrices })
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
      this.ws?.close()
    } catch {
      // ignore
    } finally {
      this.ws = null
    }
    this.onStatus?.('disconnected')
  }

  updateCoins(newCoins: string[]): void {
    const newCoinsSet = new Set(newCoins)
    const toSubscribe = newCoins.filter(coin => !this.coins.has(coin))
    const toUnsubscribe = Array.from(this.coins).filter(coin => !newCoinsSet.has(coin))

    this.coins = newCoinsSet

    if (this.ws?.readyState === WebSocket.OPEN) {
      // Subscribe to new coins
      for (const coin of toSubscribe) {
        const subscription: any = {
          type: 'activeAssetCtx',
          coin: coin,
        }

        this.ws.send(
          JSON.stringify({
            method: 'subscribe',
            subscription,
          })
        )
      }

      // Unsubscribe from removed coins (if needed)
      // Note: Hyperliquid may not support unsubscribe, so we just stop updating those
      for (const coin of toUnsubscribe) {
        delete this.markPrices[coin]
      }

      this.onMarkPrices({ ...this.markPrices })
    }
  }
}
