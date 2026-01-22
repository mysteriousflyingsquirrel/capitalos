import type { PerpetualsOpenOrder, PortfolioPnL } from '../pages/NetWorth'

export async function fetchMexcOpenOrders(args: { uid: string }): Promise<PerpetualsOpenOrder[]> {
  const resp = await fetch('/api/perpetuals/mexc/openOrders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: args.uid }),
  })
  if (!resp.ok) return []
  const json = await resp.json().catch(() => null)
  return (json?.success && Array.isArray(json.data)) ? (json.data as PerpetualsOpenOrder[]) : []
}

export async function fetchMexcUnrealizedPnlWindows(args: { uid: string }): Promise<PortfolioPnL> {
  const resp = await fetch('/api/perpetuals/mexc/performance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: args.uid }),
  })
  if (!resp.ok) {
    return { pnl24hUsd: null, pnl7dUsd: null, pnl30dUsd: null, pnl90dUsd: null }
  }
  const json = await resp.json().catch(() => null)
  if (json?.success && json.data) return json.data as PortfolioPnL
  return { pnl24hUsd: null, pnl7dUsd: null, pnl30dUsd: null, pnl90dUsd: null }
}

export async function fetchMexcEquityUsd(args: { uid: string }): Promise<number | null> {
  const resp = await fetch('/api/perpetuals/mexc/equity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: args.uid }),
  })
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

