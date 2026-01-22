import { useEffect, useMemo, useRef, useState } from 'react'
import type { PerpetualsOpenPosition } from '../../pages/NetWorth'
import { MexcFuturesPositionsWs, type MexcWsStatus } from '../../services/mexcFuturesPositionsWs'

type UseMexcWsPositionsResult = {
  positions: PerpetualsOpenPosition[]
  status: MexcWsStatus
  error: string | null
}

/**
 * Browser-only: streams MEXC USDT-M futures open positions via WebSocket.
 * Intentionally scoped to positions only (performance/orders are REST-driven).
 */
export function useMexcWsPositions(args: {
  apiKey: string | null
  secretKey: string | null
}): UseMexcWsPositionsResult {
  const { apiKey, secretKey } = args
  const [positions, setPositions] = useState<PerpetualsOpenPosition[]>([])
  const [status, setStatus] = useState<MexcWsStatus>('disconnected')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<MexcFuturesPositionsWs | null>(null)
  const normalizedApiKey = useMemo(() => (apiKey || '').trim(), [apiKey])
  const normalizedSecretKey = useMemo(() => (secretKey || '').trim(), [secretKey])

  useEffect(() => {
    setPositions([])
    setError(null)
    setStatus('disconnected')

    wsRef.current?.disconnect()
    wsRef.current = null

    if (!normalizedApiKey || !normalizedSecretKey) {
      return
    }

    // MEXC pushes one position per message; keep a map by id to avoid flicker
    const positionsById = new Map<string, PerpetualsOpenPosition>()

    const ws = new MexcFuturesPositionsWs({
      apiKey: normalizedApiKey,
      secretKey: normalizedSecretKey,
      onPositions: (incoming) => {
        for (const p of incoming) {
          positionsById.set(p.id, p)
        }
        setPositions(Array.from(positionsById.values()))
      },
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
  }, [normalizedApiKey, normalizedSecretKey])

  return { positions, status, error }
}

