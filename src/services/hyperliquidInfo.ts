type HyperliquidInfoRequestBody =
  | { type: 'metaAndAssetCtxs'; dex?: string }
  | { type: 'l2Book'; coin: string }
  | { type: 'recentTrades'; coin: string }

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function extractSymbol(universeEntry: unknown): string | null {
  if (typeof universeEntry === 'string') return universeEntry
  if (universeEntry && typeof universeEntry === 'object') {
    const anyEntry = universeEntry as any
    return (
      (typeof anyEntry.name === 'string' && anyEntry.name) ||
      (typeof anyEntry.coin === 'string' && anyEntry.coin) ||
      (typeof anyEntry.token === 'string' && anyEntry.token) ||
      (typeof anyEntry.symbol === 'string' && anyEntry.symbol) ||
      null
    )
  }
  return null
}

export type HyperliquidAssetCtx = {
  coin: string
  markPx: number | null
  oraclePx: number | null
  funding: number | null
  openInterest: number | null
  premium: number | null
  dayNtlVlm: number | null
  /**
   * Impact prices vary by HL version. We keep it permissive and compute impact cost defensively.
   * Known shapes:
   * - { bidPx, askPx }
   * - { bid, ask }
   * - [bid, ask]
   */
  impactPxsRaw: unknown
}

export type HyperliquidMetaAndAssetCtxsResult = {
  universe: unknown[]
  assetCtxsRaw: unknown[]
  byCoin: Record<string, HyperliquidAssetCtx>
}

export async function fetchHyperliquidInfo<T>(body: HyperliquidInfoRequestBody, signal?: AbortSignal): Promise<T> {
  const resp = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Hyperliquid info error (${resp.status}): ${text || resp.statusText}`)
  }
  return (await resp.json()) as T
}

export async function fetchMetaAndAssetCtxs(args?: { dex?: string; signal?: AbortSignal }): Promise<HyperliquidMetaAndAssetCtxsResult> {
  const includeDex = args && Object.prototype.hasOwnProperty.call(args, 'dex')
  const data = await fetchHyperliquidInfo<any>(
    { type: 'metaAndAssetCtxs', ...(includeDex ? { dex: args?.dex } : {}) },
    args?.signal
  )
  if (!Array.isArray(data) || data.length < 2) {
    return { universe: [], assetCtxsRaw: [], byCoin: {} }
  }

  const meta = data[0]
  const assetCtxsRaw = Array.isArray(data[1]) ? data[1] : []
  const universe: unknown[] = Array.isArray(meta?.universe) ? meta.universe : []

  const byCoin: Record<string, HyperliquidAssetCtx> = {}
  const n = Math.min(universe.length, assetCtxsRaw.length)
  for (let i = 0; i < n; i++) {
    const coin = extractSymbol(universe[i])
    if (!coin) continue
    const ctx = assetCtxsRaw[i] as any

    const entry: HyperliquidAssetCtx = {
      coin,
      markPx: toFiniteNumber(ctx?.markPx),
      oraclePx: toFiniteNumber(ctx?.oraclePx),
      funding: toFiniteNumber(ctx?.funding),
      openInterest: toFiniteNumber(ctx?.openInterest),
      premium: toFiniteNumber(ctx?.premium),
      dayNtlVlm: toFiniteNumber(ctx?.dayNtlVlm),
      impactPxsRaw: ctx?.impactPxs,
    }

    byCoin[coin] = entry
    byCoin[coin.toUpperCase()] = entry
  }

  return { universe, assetCtxsRaw, byCoin }
}

export type HyperliquidL2BookSnapshot = {
  bestBid: number | null
  bestAsk: number | null
  midPx: number | null
  spreadPct: number | null
  /** Notional depth within ±0.2% around mid (bid+ask, USD notional). */
  depthNotionalNearMid: number | null
}

function parsePxSzLevel(level: unknown): { px: number | null; sz: number | null } {
  if (!level) return { px: null, sz: null }
  if (Array.isArray(level) && level.length >= 2) {
    return { px: toFiniteNumber(level[0]), sz: toFiniteNumber(level[1]) }
  }
  if (typeof level === 'object') {
    const anyL = level as any
    return {
      px: toFiniteNumber(anyL.px ?? anyL.price ?? anyL[0]),
      sz: toFiniteNumber(anyL.sz ?? anyL.size ?? anyL[1]),
    }
  }
  return { px: null, sz: null }
}

function parseL2BookLevels(raw: any): { bids: unknown[]; asks: unknown[] } {
  // Common HL shape: { levels: [bids, asks] }
  if (raw && typeof raw === 'object' && Array.isArray(raw.levels) && raw.levels.length >= 2) {
    return { bids: Array.isArray(raw.levels[0]) ? raw.levels[0] : [], asks: Array.isArray(raw.levels[1]) ? raw.levels[1] : [] }
  }
  // Sometimes: [bids, asks]
  if (Array.isArray(raw) && raw.length >= 2 && Array.isArray(raw[0]) && Array.isArray(raw[1])) {
    return { bids: raw[0], asks: raw[1] }
  }
  return { bids: [], asks: [] }
}

export async function fetchL2BookSnapshot(args: { coin: string; signal?: AbortSignal }): Promise<HyperliquidL2BookSnapshot> {
  const raw = await fetchHyperliquidInfo<any>({ type: 'l2Book', coin: args.coin }, args.signal)
  const { bids, asks } = parseL2BookLevels(raw)

  const bestBid = bids.length > 0 ? parsePxSzLevel(bids[0]).px : null
  const bestAsk = asks.length > 0 ? parsePxSzLevel(asks[0]).px : null
  const midPx = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null
  const spreadPct = midPx != null && bestBid != null && bestAsk != null ? (bestAsk - bestBid) / midPx : null

  if (midPx == null) {
    return { bestBid, bestAsk, midPx, spreadPct, depthNotionalNearMid: null }
  }

  const bidMin = midPx * (1 - 0.002)
  const askMax = midPx * (1 + 0.002)

  let depthBid = 0
  for (const lvl of bids) {
    const { px, sz } = parsePxSzLevel(lvl)
    if (px == null || sz == null) continue
    if (px < bidMin) break
    depthBid += px * sz
  }

  let depthAsk = 0
  for (const lvl of asks) {
    const { px, sz } = parsePxSzLevel(lvl)
    if (px == null || sz == null) continue
    if (px > askMax) break
    depthAsk += px * sz
  }

  return { bestBid, bestAsk, midPx, spreadPct, depthNotionalNearMid: depthBid + depthAsk }
}

export function computeImpactCostPct(args: { impactPxsRaw: unknown; markPx: number | null }): number | null {
  const { impactPxsRaw, markPx } = args
  if (markPx == null || markPx <= 0) return null

  let bid: number | null = null
  let ask: number | null = null

  if (Array.isArray(impactPxsRaw) && impactPxsRaw.length >= 2) {
    bid = toFiniteNumber(impactPxsRaw[0])
    ask = toFiniteNumber(impactPxsRaw[1])
  } else if (impactPxsRaw && typeof impactPxsRaw === 'object') {
    const anyI = impactPxsRaw as any
    bid = toFiniteNumber(anyI.bidPx ?? anyI.bid ?? anyI.b)
    ask = toFiniteNumber(anyI.askPx ?? anyI.ask ?? anyI.a)
  }

  if (bid == null || ask == null) return null
  const cost = Math.abs(ask - bid) / markPx
  return Number.isFinite(cost) ? cost : null
}

