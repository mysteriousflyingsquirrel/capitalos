import { useEffect, useMemo, useRef, useState } from 'react'
import { HyperliquidAssetCtxWs, type MarkPriceMap } from '../../services/hyperliquidAssetCtxWs'
import { type HyperliquidWsStatus } from '../../services/hyperliquidPositionsWs'

type UseHyperliquidAssetCtxResult = {
  markPrices: MarkPriceMap
  status: HyperliquidWsStatus
  error: string | null
}

/**
 * Browser-only: streams Hyperliquid active asset contexts via WebSocket to get mark prices.
 * Subscribes to activeAssetCtx for each coin in the provided list.
 */
export function useHyperliquidAssetCtx(args: {
  walletAddress: string | null
  coins: string[]
}): UseHyperliquidAssetCtxResult {
  const { walletAddress, coins } = args
  const [markPrices, setMarkPrices] = useState<MarkPriceMap>({})
  const [status, setStatus] = useState<HyperliquidWsStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<HyperliquidAssetCtxWs | null>(null)

  const normalizedWallet = useMemo(() => (walletAddress || '').trim(), [walletAddress])
  const normalizedCoins = useMemo(() => coins.filter(Boolean), [coins])

  useEffect(() => {
    // Reset when wallet changes
    setMarkPrices({})
    setError(null)
    setStatus('disconnected')

    // Disconnect previous
    wsRef.current?.disconnect()
    wsRef.current = null

    if (!normalizedWallet || normalizedCoins.length === 0) {
      return
    }

    const ws = new HyperliquidAssetCtxWs({
      walletAddress: normalizedWallet,
      coins: normalizedCoins,
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
  }, [normalizedWallet, normalizedCoins.join(',')])

  // Update subscriptions when coins change
  useEffect(() => {
    if (wsRef.current && normalizedCoins.length > 0) {
      wsRef.current.updateCoins(normalizedCoins)
    }
  }, [normalizedCoins.join(',')])

  return { markPrices, status, error }
}
