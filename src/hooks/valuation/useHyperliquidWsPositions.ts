import { useEffect, useMemo, useRef, useState } from 'react'
import type { PerpetualsOpenPosition } from '../../pages/NetWorth'
import { HyperliquidPositionsWs, type HyperliquidWsStatus } from '../../services/hyperliquidPositionsWs'

type UseHyperliquidWsPositionsResult = {
  positions: PerpetualsOpenPosition[]
  markPrices: Record<string, number> // coin -> markPx
  status: HyperliquidWsStatus
  error: string | null
}

/**
 * Browser-only: streams Hyperliquid open positions via WebSocket.
 * Intentionally scoped to positions only (orders/equity/performance stay on REST).
 */
export function useHyperliquidWsPositions(args: {
  walletAddress: string | null
  dex?: string | null
}): UseHyperliquidWsPositionsResult {
  const { walletAddress, dex = null } = args
  const [positions, setPositions] = useState<PerpetualsOpenPosition[]>([])
  const [markPrices, setMarkPrices] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<HyperliquidWsStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<HyperliquidPositionsWs | null>(null)

  const normalizedWallet = useMemo(() => (walletAddress || '').trim(), [walletAddress])

  useEffect(() => {
    // Reset when wallet changes
    setPositions([])
    setMarkPrices({})
    setError(null)
    setStatus('disconnected')

    // Disconnect previous
    wsRef.current?.disconnect()
    wsRef.current = null

    if (!normalizedWallet) {
      return
    }

    const ws = new HyperliquidPositionsWs({
      walletAddress: normalizedWallet,
      dex,
      onPositions: (p) => setPositions(p),
      onMarkPrices: (prices) => setMarkPrices(prices),
      onStatus: (s, err) => {
        setStatus(s)
        setError(err ?? null)
      },
    })

    wsRef.current = ws
    ws.connect()

    return () => {
      ws.disconnect()
      wsRef.current = null
    }
  }, [normalizedWallet, dex])

  return { positions, markPrices, status, error }
}

