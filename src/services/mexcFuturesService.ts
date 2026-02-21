import type { PerpetualsOpenOrder, PortfolioPnL } from '../pages/NetWorth'
import { apiPost } from '../lib/apiClient'

export async function fetchMexcOpenOrders(args: { uid: string }): Promise<PerpetualsOpenOrder[]> {
  const resp = await apiPost('/api/perpetuals/mexc/openOrders')
  if (!resp.ok) return []
  const json = await resp.json().catch(() => null)
  return (json?.success && Array.isArray(json.data)) ? (json.data as PerpetualsOpenOrder[]) : []
}

export async function fetchMexcUnrealizedPnlWindows(args: { uid: string }): Promise<PortfolioPnL> {
  const resp = await apiPost('/api/perpetuals/mexc/performance')
  if (!resp.ok) {
    return { pnl24hUsd: null, pnl7dUsd: null, pnl30dUsd: null, pnl90dUsd: null }
  }
  const json = await resp.json().catch(() => null)
  if (json?.success && json.data) return json.data as PortfolioPnL
  return { pnl24hUsd: null, pnl7dUsd: null, pnl30dUsd: null, pnl90dUsd: null }
}

export async function fetchMexcEquityUsd(args: { uid: string }): Promise<number | null> {
  const resp = await apiPost('/api/perpetuals/mexc/equity')
  if (!resp.ok) return null
  const json = await resp.json().catch(() => null)
  const equity = json?.data?.equityUsd
  if (typeof equity === 'number') return equity
  if (typeof equity === 'string') {
    const n = parseFloat(equity)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export async function fetchMexcOpenPositions(args: { uid: string }) {
  const resp = await apiPost('/api/perpetuals/mexc/positions')
  if (!resp.ok) return []
  const json = await resp.json().catch(() => null)
  return (json?.success && Array.isArray(json.data)) ? json.data : []
}
