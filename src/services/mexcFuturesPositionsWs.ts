import type { PerpetualsOpenPosition } from '../pages/NetWorth'
import { toNumber } from '../lib/numbers'

export type MexcWsStatus = 'disconnected' | 'connecting' | 'authenticated' | 'subscribed' | 'error'

type MexcMessage = {
  channel?: string
  data?: any
  code?: number
  msg?: string
  ts?: number
}

function toHex(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  let out = ''
  for (const b of u8) out += b.toString(16).padStart(2, '0')
  return out
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return toHex(sig)
}

/**
 * Browser-only MEXC USDT-M futures WebSocket client.
 * Positions only, scoped for MEXC page.
 *
 * WS endpoint: wss://contract.mexc.com/edge
 * Login signature: HMAC-SHA256(secret, apiKey + reqTime) as hex.
 * Keepalive: {"method":"ping"} every ~15s.
 */
export class MexcFuturesPositionsWs {
  private ws: WebSocket | null = null
  private apiKey: string
  private secretKey: string
  private onPositions: (positions: PerpetualsOpenPosition[]) => void
  private onStatus?: (status: MexcWsStatus, error?: string) => void
  private isIntentionallyDisconnected = false
  private pingTimer: ReturnType<typeof setInterval> | null = null

  constructor(args: {
    apiKey: string
    secretKey: string
    onPositions: (positions: PerpetualsOpenPosition[]) => void
    onStatus?: (status: MexcWsStatus, error?: string) => void
  }) {
    this.apiKey = args.apiKey
    this.secretKey = args.secretKey
    this.onPositions = args.onPositions
    this.onStatus = args.onStatus
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }
    this.isIntentionallyDisconnected = false
    this.onStatus?.('connecting')

    const wsUrl = 'wss://contract.mexc.com/edge'
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = async () => {
      try {
        const reqTime = Date.now().toString()
        const signature = await hmacSha256Hex(this.secretKey, `${this.apiKey}${reqTime}`)

        // Disable default personal pushes; we'll explicitly filter to positions only
        this.ws?.send(JSON.stringify({
          subscribe: false,
          method: 'login',
          param: {
            apiKey: this.apiKey,
            signature,
            reqTime,
          },
        }))
      } catch (err) {
        this.onStatus?.('error', err instanceof Error ? err.message : String(err))
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: MexcMessage = JSON.parse(event.data)

        // Login response (best-effort)
        if (msg.channel === 'rs.login') {
          if (msg.code === 0 || msg.data === 'success') {
            this.onStatus?.('authenticated')
            // Filter to positions only
            this.ws?.send(JSON.stringify({
              method: 'personal.filter',
              param: { filters: [{ filter: 'position' }] },
            }))
            this.startPing()
          } else {
            this.onStatus?.('error', msg.msg || 'MEXC login failed')
          }
          return
        }

        // Some servers respond to ping with channel:pong
        if (msg.channel === 'pong') {
          return
        }

        if (msg.channel !== 'push.personal.position') return

        const d = msg.data
        if (!d) return

        const symbol = typeof d.symbol === 'string' ? d.symbol : null
        if (!symbol) return

        const positionId = d.positionId !== undefined && d.positionId !== null ? String(d.positionId) : symbol
        const holdVol = toNumber(d.holdVol) ?? 0
        const positionType = toNumber(d.positionType) // 1 long, 2 short
        const entryPrice = toNumber(d.holdAvgPrice)
        const liquidationPrice = toNumber(d.liquidatePrice)
        const marginUsed = toNumber(d.im) ?? 0
        const unrealizedPnl = toNumber(d.pnl) ?? 0
        const leverage = toNumber(d.leverage)

        // Map to PerpetualsOpenPosition (same shape as Hyperliquid page expects)
        const pos: PerpetualsOpenPosition = {
          id: `mexc-pos-${positionId}`,
          ticker: symbol,
          margin: marginUsed,
          pnl: unrealizedPnl,
          platform: 'MEXC',
          leverage,
          positionSide: positionType === 1 ? 'LONG' : positionType === 2 ? 'SHORT' : null,
          amountToken: Math.abs(holdVol),
          entryPrice,
          liquidationPrice,
          fundingFeeUsd: null,
        }

        this.onStatus?.('subscribed')
        this.onPositions([pos])
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onerror = () => {
      this.onStatus?.('error', 'WebSocket error')
    }

    this.ws.onclose = () => {
      this.stopPing()
      this.ws = null
      this.onStatus?.('disconnected')
    }
  }

  private startPing(): void {
    this.stopPing()
    // MEXC recommends ping every 10-20 seconds
    this.pingTimer = setInterval(() => {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ method: 'ping' }))
        }
      } catch {
        // ignore
      }
    }, 15000)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  disconnect(): void {
    this.isIntentionallyDisconnected = true
    this.stopPing()
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

