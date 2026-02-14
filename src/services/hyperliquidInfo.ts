type HyperliquidInfoRequestBody =
  | { type: 'metaAndAssetCtxs'; dex?: string }
  | { type: 'l2Book'; coin: string }
  | { type: 'recentTrades'; coin: string }
  | { type: 'fundingHistory'; coin: string; startTime: number; endTime?: number }
  | { type: 'candleSnapshot'; req: { coin: string; interval: string; startTime: number; endTime?: number } }
  | { type: 'perpsAtOpenInterestCap'; dex?: string }

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
  /** Open interest in USD notional (token units × markPx) */
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

    // Parse markPx first since we need it for openInterest USD conversion
    const markPx = toFiniteNumber(ctx?.markPx)
    // openInterest from API is in token units; convert to USD notional
    const openInterestTokens = toFiniteNumber(ctx?.openInterest)
    const openInterestUsd = openInterestTokens != null && markPx != null ? openInterestTokens * markPx : null

    const entry: HyperliquidAssetCtx = {
      coin,
      markPx,
      oraclePx: toFiniteNumber(ctx?.oraclePx),
      funding: toFiniteNumber(ctx?.funding),
      openInterest: openInterestUsd,
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

// ─────────────────────────────────────────────────────────────────────────────
// Funding History API
// ─────────────────────────────────────────────────────────────────────────────

export type FundingHistoryRecord = {
  coin: string
  fundingRate: number
  premium: number
  time: number // ms timestamp
}

/**
 * Fetch funding history for a coin over a time range.
 * Returns array sorted by time ascending.
 */
export async function fetchFundingHistory(args: {
  coin: string
  startTime: number
  endTime?: number
  signal?: AbortSignal
}): Promise<FundingHistoryRecord[]> {
  const { coin, startTime, endTime, signal } = args
  const body: HyperliquidInfoRequestBody = {
    type: 'fundingHistory',
    coin,
    startTime,
    ...(endTime != null ? { endTime } : {}),
  }

  const raw = await fetchHyperliquidInfo<any[]>(body, signal)
  if (!Array.isArray(raw)) return []

  const records: FundingHistoryRecord[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const fundingRate = toFiniteNumber(r.fundingRate)
    const premium = toFiniteNumber(r.premium)
    const time = toFiniteNumber(r.time)
    if (fundingRate == null || time == null) continue
    records.push({
      coin: typeof r.coin === 'string' ? r.coin : coin,
      fundingRate,
      premium: premium ?? 0,
      time,
    })
  }

  // Sort by time ascending
  records.sort((a, b) => a.time - b.time)
  return records
}

// ─────────────────────────────────────────────────────────────────────────────
// Candle Snapshot API
// ─────────────────────────────────────────────────────────────────────────────

export type CandleRecord = {
  time: number // ms timestamp (open time)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Fetch candle snapshot for a coin.
 * Supported intervals: "1m","3m","5m","15m","30m","1h","2h","4h","8h","12h","1d","3d","1w","1M"
 * Returns array sorted by time ascending.
 */
export async function fetchCandleSnapshot(args: {
  coin: string
  interval: string
  startTime: number
  endTime?: number
  signal?: AbortSignal
}): Promise<CandleRecord[]> {
  const { coin, interval, startTime, endTime, signal } = args
  const body: HyperliquidInfoRequestBody = {
    type: 'candleSnapshot',
    req: {
      coin,
      interval,
      startTime,
      ...(endTime != null ? { endTime } : {}),
    },
  }

  const raw = await fetchHyperliquidInfo<any[]>(body, signal)
  if (!Array.isArray(raw)) return []

  const candles: CandleRecord[] = []
  for (const c of raw) {
    // HL candle format: { t, T, s, i, o, c, h, l, v, n } or array format
    if (!c) continue

    let time: number | null = null
    let open: number | null = null
    let high: number | null = null
    let low: number | null = null
    let close: number | null = null
    let volume: number | null = null

    if (Array.isArray(c)) {
      // Array format: [openTime, open, high, low, close, volume, closeTime, ...]
      time = toFiniteNumber(c[0])
      open = toFiniteNumber(c[1])
      high = toFiniteNumber(c[2])
      low = toFiniteNumber(c[3])
      close = toFiniteNumber(c[4])
      volume = toFiniteNumber(c[5])
    } else if (typeof c === 'object') {
      time = toFiniteNumber(c.t ?? c.time ?? c.openTime)
      open = toFiniteNumber(c.o ?? c.open)
      high = toFiniteNumber(c.h ?? c.high)
      low = toFiniteNumber(c.l ?? c.low)
      close = toFiniteNumber(c.c ?? c.close)
      volume = toFiniteNumber(c.v ?? c.volume)
    }

    if (time == null || close == null) continue
    candles.push({
      time,
      open: open ?? close,
      high: high ?? close,
      low: low ?? close,
      close,
      volume: volume ?? 0,
    })
  }

  // Sort by time ascending
  candles.sort((a, b) => a.time - b.time)
  return candles
}

// ─────────────────────────────────────────────────────────────────────────────
// Perps At Open Interest Cap API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch list of perps currently at their open interest cap.
 * Returns array of coin names (matching the names from metaAndAssetCtxs for that dex).
 */
export async function fetchPerpsAtOpenInterestCap(args?: {
  dex?: string
  signal?: AbortSignal
}): Promise<string[]> {
  const body: HyperliquidInfoRequestBody = {
    type: 'perpsAtOpenInterestCap',
    ...(args?.dex != null ? { dex: args.dex } : {}),
  }

  const raw = await fetchHyperliquidInfo<any>(body, args?.signal)

  // Response could be array of strings or array of objects with coin field
  if (!Array.isArray(raw)) return []

  const coins: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      coins.push(item)
    } else if (item && typeof item === 'object') {
      const coin = item.coin ?? item.name ?? item.symbol
      if (typeof coin === 'string') coins.push(coin)
    }
  }

  return coins
}

