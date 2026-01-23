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
  private onStatus?: (status: HyperliquidWsStatus, error?: string) => void
  private isIntentionallyDisconnected = false

  constructor(args: {
    walletAddress: string
    dex?: string | null
    onPositions: (positions: PerpetualsOpenPosition[]) => void
    onStatus?: (status: HyperliquidWsStatus, error?: string) => void
  }) {
    this.walletAddress = args.walletAddress
    this.dex = args.dex ?? null
    this.onPositions = args.onPositions
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
        const message: ClearinghouseStateMessage = JSON.parse(event.data)
        if (message.channel !== 'clearinghouseState') return

        const assetPositions = message.data?.assetPositions
        if (!Array.isArray(assetPositions)) return

        const positions: PerpetualsOpenPosition[] = []

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

          positions.push({
            id: `hyperliquid-pos-${coin.toUpperCase()}-${this.dex || 'default'}`,
            ticker: coin.toUpperCase(),
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

        this.onStatus?.('subscribed')
        this.onPositions(positions)
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
}

