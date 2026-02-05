import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeImpactCostPct,
  fetchL2BookSnapshot,
  fetchMetaAndAssetCtxs,
  type HyperliquidAssetCtx,
  type HyperliquidL2BookSnapshot,
} from '../../services/hyperliquidInfo'

export type RiskState = 'GREEN' | 'ORANGE' | 'RED' | 'UNSUPPORTED'

export type RiskDotDebug = {
  state: RiskState
  reason: string
  updatedAt: number
  universe: {
    dayNtlVlm: number | null
    minVolume: number
    openInterest: number | null
    minOI: number
    passDayNtlVlm: boolean
    passOpenInterest: boolean
    eligible: boolean
    failedChecks: string[]
    disabledBecause: string | null
  }
  pillar1: {
    skipped: boolean
    oi: number | null
    funding: number | null
    oi_z: number | null
    f_z: number | null
    oi_z_th: number
    f_z_th: number
    direction: 'LONG_CROWDED' | 'SHORT_CROWDED' | 'NEUTRAL'
    crowdingRaw: boolean
    crowdingConfirmed: boolean
    confirmCounter: number
    confirmRequired: number
    reason: string
  }
  pillar2: {
    skipped: boolean
    markNow: number | null
    return15m: number | null
    return1h: number | null
    directionUsed: 'LONG_CROWDED' | 'SHORT_CROWDED' | 'NEUTRAL'
    structureState: 'N/A' | 'INTACT' | 'WEAKENING' | 'BROKEN'
    ruleUsed: string
    reason: string
  }
  pillar3: {
    skipped: boolean
    source: 'impactPxs' | 'l2Book' | 'none'
    impactCostPct: number | null
    impactCost_z: number | null
    spreadPct: number | null
    spread_z: number | null
    depthNotional: number | null
    depth_z: number | null
    z_th: number
    liquidityFragileRaw: boolean
    liquidityFragileConfirmed: boolean
    confirmCounter: number
    confirmRequired: number
    reason: string
  }
  antiFlip: {
    confirmationRequired: number
    crowdingConfirm: { n: number; required: number }
    liquidityConfirm: { n: number; required: number }
    stateCooldown: {
      orangeMinHoldMs: number
      orangeRemainingMs: number
      redMinHoldMs: number
      redRemainingMs: number
    }
    stateChangeBlocked: boolean
    blockedReason: string | null
  }
  decisionTrace: {
    universeEligible: boolean
    crowdingConfirmed: boolean
    structureState: string
    liquidityFragileConfirmed: boolean
    computedState: RiskState
    effectiveState: RiskState
    ruleMatched: string
  }
  tooltipText: string
}

export type RiskPerCoin = {
  coin: string
  state: RiskState
  message: string
  dotColor: string | null
  /** Funding as raw HL value (fraction). */
  funding: number | null
  /** Open interest as returned by HL (typically USD notional). */
  openInterest: number | null
  dayNtlVlm: number | null
  markPx: number | null
  debug: RiskDotDebug
}

type FifteenMinBucket = {
  bucketStartMs: number
  avg: number
  n: number
}

type CoinHistory = {
  oi: FifteenMinBucket[]
  funding: FifteenMinBucket[]
  impactCostPct: FifteenMinBucket[]
  spreadPct: FifteenMinBucket[]
  depthNotional: FifteenMinBucket[]
  markPxPoints: Array<{ ts: number; px: number }>
  // For confirmations (tracked per sample/check)
  crowdingCandidateByBucketStart: Record<number, boolean>
  liquidityFragileChecks: Array<{ ts: number; fragile: boolean }>
  lastState: { state: RiskState; enteredAt: number } | null
}

const LS_KEY = 'hl:riskHistory:v1'

const STABILITY_DAY_NTL_VLM_MIN = 25_000_000
const STABILITY_OPEN_INTEREST_MIN = 10_000_000

const LOOKBACK_MS_7D = 7 * 24 * 60 * 60 * 1000
const BUCKET_MS_15M = 15 * 60 * 1000

const CROWDING_OI_Z_THRESHOLD = 1.5
const CROWDING_F_Z_THRESHOLD = 1.5

const LIQUIDITY_Z_THRESHOLD = 1.5

const STRUCTURE_ZERO_THRESHOLD = 0.001 // 0.1%

const COOL_DOWN_ORANGE_MS = 15 * 60 * 1000
const COOL_DOWN_RED_MS = 30 * 60 * 1000

const DOT_COLORS: Record<RiskState, string> = {
  GREEN: '#2ECC71',
  ORANGE: '#F39C12',
  RED: '#E74C3C',
  UNSUPPORTED: '#A0AEC0',
}

const MSG: Record<RiskState, string> = {
  GREEN: 'Market is stable. Trade as planned.',
  ORANGE: 'Risk is rising. Consider reducing size or tightening your stop.',
  RED: 'High crash risk. Protect capital or exit.',
  UNSUPPORTED: 'Market too unstable for reliable risk signals.',
}

function formatNumber(value: number | null, decimals: number = 4): string {
  if (value === null || value === undefined) return '–'
  if (!Number.isFinite(value)) return '–'
  return value.toFixed(decimals)
}

function formatUsdCompact(value: number | null): string {
  if (value === null || value === undefined) return '–'
  if (!Number.isFinite(value)) return '–'
  const abs = Math.abs(value)
  const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
  if (abs >= 1_000_000_000) return `${fmt(value / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${fmt(value / 1_000_000)}M`
  if (abs >= 1_000) return `${fmt(value / 1_000)}K`
  return `${fmt(value)}`
}

function formatPct(value: number | null, decimals: number = 4): string {
  if (value === null || value === undefined) return '–'
  if (!Number.isFinite(value)) return '–'
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)}%`
}

function formatBpsFromPct(valuePct: number | null): string {
  // valuePct is in fraction (e.g. 0.001 = 0.1%). return bps.
  if (valuePct === null || valuePct === undefined) return '–'
  if (!Number.isFinite(valuePct)) return '–'
  const bps = valuePct * 10_000
  return `${bps.toFixed(1).replace(/\.0$/, '')}`
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  const ss = s % 60
  if (h > 0) return `${h}h ${mm}m`
  if (m > 0) return `${m}m ${ss}s`
  return `${s}s`
}

function stateLabelForTooltip(state: RiskState): string {
  return state === 'UNSUPPORTED' ? 'GRAY' : state
}

function buildTooltipText(args: { coin: string; debug: Omit<RiskDotDebug, 'tooltipText'> }): string {
  const d = args.debug
  const now = safeNow()
  const ageMs = now - d.updatedAt

  const lines: string[] = []
  lines.push(`Risk Dot Debug — ${args.coin}`)
  lines.push('')
  lines.push('SECTION 0 — FINAL STATE')
  lines.push(`State: ${stateLabelForTooltip(d.state)}`)
  lines.push(`Reason: ${d.reason}`)
  lines.push(`Last update: ${new Date(d.updatedAt).toLocaleString()} (age ${formatMs(ageMs)})`)
  lines.push('')

  lines.push('SECTION 1 — UNIVERSE FILTER')
  lines.push('UniverseFilter:')
  lines.push(`- dayNtlVlm: ${formatUsdCompact(d.universe.dayNtlVlm)}  threshold: ${formatUsdCompact(d.universe.minVolume)}  pass=${String(d.universe.passDayNtlVlm)}`)
  lines.push(`- openInterest: ${formatUsdCompact(d.universe.openInterest)}  threshold: ${formatUsdCompact(d.universe.minOI)}  pass=${String(d.universe.passOpenInterest)}`)
  lines.push(`- eligible: ${String(d.universe.eligible)}`)
  if (!d.universe.eligible) {
    const because = d.universe.disabledBecause ?? (d.universe.failedChecks.join(', ') || 'unknown')
    lines.push(`Disabled because: ${because}`)
  }
  lines.push('')

  lines.push('SECTION 2 — PILLAR 1: CROWDING')
  if (d.pillar1.skipped) lines.push('SKIPPED (disabled)')
  lines.push('Inputs:')
  lines.push(`- OI: ${formatUsdCompact(d.pillar1.oi)}`)
  lines.push(`- funding: ${formatNumber(d.pillar1.funding, 6)}`)
  lines.push(`- OI_z: ${formatNumber(d.pillar1.oi_z, 3)}  threshold: ${d.pillar1.oi_z_th}`)
  lines.push(`- F_z: ${formatNumber(d.pillar1.f_z, 3)}  threshold: ${d.pillar1.f_z_th}`)
  lines.push('Derived:')
  lines.push(`- direction: ${d.pillar1.direction}`)
  lines.push('Decision:')
  lines.push(`- crowdingRaw: ${String(d.pillar1.crowdingRaw)}`)
  lines.push(`- crowdingConfirmed: ${String(d.pillar1.crowdingConfirmed)}`)
  lines.push(`- confirmCounter: ${d.pillar1.confirmCounter}/${d.pillar1.confirmRequired}`)
  lines.push(`Reason: ${d.pillar1.reason}`)
  lines.push('')

  lines.push('SECTION 3 — PILLAR 2: STRUCTURE')
  if (d.pillar2.skipped) lines.push('SKIPPED (disabled)')
  lines.push('Inputs:')
  lines.push(`- markPx now: ${formatNumber(d.pillar2.markNow, 4)}`)
  lines.push(`- return15m: ${d.pillar2.return15m == null ? '–' : `${(d.pillar2.return15m * 100).toFixed(3)}%`}`)
  lines.push(`- return1h:  ${d.pillar2.return1h == null ? '–' : `${(d.pillar2.return1h * 100).toFixed(3)}%`}`)
  lines.push(`- crowdDirection used: ${d.pillar2.directionUsed}`)
  lines.push('Decision:')
  lines.push(`- structureState: ${d.pillar2.structureState}`)
  lines.push(`- ruleUsed: ${d.pillar2.ruleUsed}`)
  lines.push(`Reason: ${d.pillar2.reason}`)
  lines.push('')

  lines.push('SECTION 4 — PILLAR 3: LIQUIDITY')
  if (d.pillar3.skipped) lines.push('SKIPPED (disabled)')
  lines.push(`source: ${d.pillar3.source}`)
  if (d.pillar3.source === 'impactPxs') {
    lines.push('Inputs (impactPxs path):')
    lines.push(`- impactCostPct: ${d.pillar3.impactCostPct == null ? '–' : `${formatBpsFromPct(d.pillar3.impactCostPct)} bps`}`)
    lines.push(`- impactCost_z: ${formatNumber(d.pillar3.impactCost_z, 3)}  threshold: ${d.pillar3.z_th}`)
  } else if (d.pillar3.source === 'l2Book') {
    lines.push('Inputs (l2Book path):')
    lines.push(`- spread_bps: ${d.pillar3.spreadPct == null ? '–' : `${formatBpsFromPct(d.pillar3.spreadPct)} bps`}  z: ${formatNumber(d.pillar3.spread_z, 3)}  th: ${d.pillar3.z_th}`)
    lines.push(`- depth(0.2%): ${formatUsdCompact(d.pillar3.depthNotional)}  z: ${formatNumber(d.pillar3.depth_z, 3)}  th: -${d.pillar3.z_th}`)
  } else {
    lines.push('Inputs: –')
  }
  lines.push('Decision:')
  lines.push(`- liquidityFragileRaw: ${String(d.pillar3.liquidityFragileRaw)}`)
  lines.push(`- liquidityFragileConfirmed: ${String(d.pillar3.liquidityFragileConfirmed)}`)
  lines.push(`- confirmCounter: ${d.pillar3.confirmCounter}/${d.pillar3.confirmRequired}`)
  lines.push(`Reason: ${d.pillar3.reason}`)
  lines.push('')

  lines.push('SECTION 5 — CONFIRMATION & COOLDOWN (ANTI-FLIP)')
  lines.push(`- confirmationRequired: ${d.antiFlip.confirmationRequired}`)
  lines.push(`- crowdingConfirm: ${d.antiFlip.crowdingConfirm.n}/${d.antiFlip.crowdingConfirm.required}`)
  lines.push(`- liquidityConfirm: ${d.antiFlip.liquidityConfirm.n}/${d.antiFlip.liquidityConfirm.required}`)
  lines.push('- stateCooldown:')
  lines.push(`  - orangeMinHold: 15m, remaining: ${formatMs(d.antiFlip.stateCooldown.orangeRemainingMs)}`)
  lines.push(`  - redMinHold: 30m, remaining: ${formatMs(d.antiFlip.stateCooldown.redRemainingMs)}`)
  lines.push(`- stateChangeBlocked: ${String(d.antiFlip.stateChangeBlocked)}${d.antiFlip.blockedReason ? ` (${d.antiFlip.blockedReason})` : ''}`)
  lines.push('')

  lines.push('SECTION 6 — DECISION TRACE (MAPPING)')
  lines.push(`- universeEligible? ${String(d.decisionTrace.universeEligible)}`)
  lines.push(`- crowdingConfirmed? ${String(d.decisionTrace.crowdingConfirmed)}`)
  lines.push(`- structureState? ${d.decisionTrace.structureState}`)
  lines.push(`- liquidityFragileConfirmed? ${String(d.decisionTrace.liquidityFragileConfirmed)}`)
  lines.push(`- finalState rule matched: ${d.decisionTrace.ruleMatched}`)

  return lines.join('\n')
}

function safeNow(): number {
  return Date.now()
}

function bucketStart(ts: number): number {
  return Math.floor(ts / BUCKET_MS_15M) * BUCKET_MS_15M
}

function upsertBucket(series: FifteenMinBucket[], ts: number, value: number): FifteenMinBucket[] {
  const bs = bucketStart(ts)
  const last = series.length > 0 ? series[series.length - 1] : null
  if (!last || last.bucketStartMs !== bs) {
    return [...series, { bucketStartMs: bs, avg: value, n: 1 }]
  }
  // incremental average
  const n = last.n + 1
  const avg = last.avg + (value - last.avg) / n
  const updated = { ...last, avg, n }
  return [...series.slice(0, -1), updated]
}

function trimBuckets(series: FifteenMinBucket[], now: number): FifteenMinBucket[] {
  const cutoff = now - LOOKBACK_MS_7D
  // keep last 7d buckets + 1 extra bucket as buffer
  return series.filter((b) => b.bucketStartMs >= cutoff - BUCKET_MS_15M)
}

function meanStd(values: number[]): { mean: number; std: number } | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1)
  const std = Math.sqrt(variance)
  if (!Number.isFinite(mean) || !Number.isFinite(std) || std === 0) return null
  return { mean, std }
}

function zscore(current: number, history: number[]): number | null {
  const ms = meanStd(history)
  if (!ms) return null
  return (current - ms.mean) / ms.std
}

function closestPoint(points: Array<{ ts: number; px: number }>, targetTs: number): number | null {
  if (points.length === 0) return null
  // points are appended in time order; scan backwards for nearest older point
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].ts <= targetTs) return points[i].px
  }
  return null
}

function computeReturn(nowPx: number, thenPx: number): number | null {
  if (!Number.isFinite(nowPx) || !Number.isFinite(thenPx) || thenPx === 0) return null
  return (nowPx - thenPx) / thenPx
}

function parsePersisted(): Record<string, CoinHistory> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return {}
    return data as Record<string, CoinHistory>
  } catch {
    return {}
  }
}

function persist(data: Record<string, CoinHistory>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    // ignore (storage full / blocked)
  }
}

function ensureCoinHistory(existing: CoinHistory | undefined): CoinHistory {
  return (
    existing ?? {
      oi: [],
      funding: [],
      impactCostPct: [],
      spreadPct: [],
      depthNotional: [],
      markPxPoints: [],
      crowdingCandidateByBucketStart: {},
      liquidityFragileChecks: [],
      lastState: null,
    }
  )
}

function computeStructureDebug(args: { crowdingDirection: 'LONG' | 'SHORT'; markPxPoints: Array<{ ts: number; px: number }>; now: number }): {
  nowPx: number | null
  r15: number | null
  r1h: number | null
  state: 'INTACT' | 'WEAKENING' | 'BROKEN' | null
  ruleUsed: string
  reason: string
} {
  const { crowdingDirection, markPxPoints, now } = args
  const nowPx = markPxPoints.length > 0 ? markPxPoints[markPxPoints.length - 1].px : null
  if (nowPx == null) {
    return { nowPx: null, r15: null, r1h: null, state: null, ruleUsed: 'N/A', reason: 'Missing markPx history' }
  }

  const px15m = closestPoint(markPxPoints, now - 15 * 60 * 1000)
  const px1h = closestPoint(markPxPoints, now - 60 * 60 * 1000)
  if (px15m == null || px1h == null) {
    return { nowPx, r15: null, r1h: null, state: null, ruleUsed: 'N/A', reason: 'Insufficient history for 15m/1h returns' }
  }

  const r15 = computeReturn(nowPx, px15m)
  const r1h = computeReturn(nowPx, px1h)
  if (r15 == null || r1h == null) {
    return { nowPx, r15, r1h, state: null, ruleUsed: 'N/A', reason: 'Return computation failed' }
  }

  const r1hApproxZero = Math.abs(r1h) < STRUCTURE_ZERO_THRESHOLD

  if (crowdingDirection === 'LONG') {
    if (r15 > 0 && r1h > 0) return { nowPx, r15, r1h, state: 'INTACT', ruleUsed: 'LONG: r15>0 && r1h>0', reason: 'intact because 15m and 1h returns are positive' }
    if (r15 < 0 && r1h < 0) return { nowPx, r15, r1h, state: 'BROKEN', ruleUsed: 'LONG: r15<0 && r1h<0', reason: 'broken because 15m and 1h returns are negative' }
    if (r15 <= 0) return { nowPx, r15, r1h, state: 'WEAKENING', ruleUsed: 'LONG: r15<=0', reason: 'weakening because 15m return <= 0' }
    if (r1hApproxZero) return { nowPx, r15, r1h, state: 'WEAKENING', ruleUsed: 'LONG: |r1h|<0.1%', reason: 'weakening because 1h return is approximately zero' }
    return { nowPx, r15, r1h, state: 'WEAKENING', ruleUsed: 'LONG: fallback', reason: 'weakening by fallback rule' }
  }

  // SHORT crowding
  if (r15 < 0 && r1h < 0) return { nowPx, r15, r1h, state: 'INTACT', ruleUsed: 'SHORT: r15<0 && r1h<0', reason: 'intact because 15m and 1h returns are negative' }
  if (r15 > 0 && r1h > 0) return { nowPx, r15, r1h, state: 'BROKEN', ruleUsed: 'SHORT: r15>0 && r1h>0', reason: 'broken because 15m and 1h returns are positive' }
  if (r15 >= 0) return { nowPx, r15, r1h, state: 'WEAKENING', ruleUsed: 'SHORT: r15>=0', reason: 'weakening because 15m return >= 0' }
  if (r1hApproxZero) return { nowPx, r15, r1h, state: 'WEAKENING', ruleUsed: 'SHORT: |r1h|<0.1%', reason: 'weakening because 1h return is approximately zero' }
  return { nowPx, r15, r1h, state: 'WEAKENING', ruleUsed: 'SHORT: fallback', reason: 'weakening by fallback rule' }
}

function canDowngradeState(args: { current: { state: RiskState; enteredAt: number } | null; next: RiskState; now: number }): boolean {
  const { current, next, now } = args
  if (!current) return true
  if (current.state === next) return true

  // Only enforce cooldown when reducing severity.
  const rank: Record<RiskState, number> = { RED: 3, ORANGE: 2, GREEN: 1, UNSUPPORTED: 0 }
  if (rank[next] >= rank[current.state]) return true

  const elapsed = now - current.enteredAt
  if (current.state === 'RED') return elapsed >= COOL_DOWN_RED_MS
  if (current.state === 'ORANGE') return elapsed >= COOL_DOWN_ORANGE_MS
  return true
}

export function useHyperliquidCrashRisk(args: { coins: string[] }) {
  const coins = useMemo(() => args.coins.filter(Boolean), [args.coins.join(',')])

  const [riskByCoin, setRiskByCoin] = useState<Record<string, RiskPerCoin>>({})

  const historyRef = useRef<Record<string, CoinHistory>>(parsePersisted())
  const lastL2BookRef = useRef<Record<string, { ts: number; snapshot: HyperliquidL2BookSnapshot }>>({})
  const lastSuccessAtRef = useRef<number>(0)

  useEffect(() => {
    let isMounted = true
    const abort = new AbortController()

    const tick = async () => {
      const now = safeNow()
      try {
        const meta = await fetchMetaAndAssetCtxs({ signal: abort.signal })
        const byCoin = meta.byCoin

        const nextRisk: Record<string, RiskPerCoin> = {}
        const nextHistAll = { ...historyRef.current }

        // Evaluate only requested coins (open positions)
        for (const coin of coins) {
          const ctx: HyperliquidAssetCtx | undefined = byCoin[coin] ?? byCoin[coin.toUpperCase()]
          const markPx = ctx?.markPx ?? null
          const funding = ctx?.funding ?? null
          const openInterest = ctx?.openInterest ?? null
          const dayNtlVlm = ctx?.dayNtlVlm ?? null

          const hist = ensureCoinHistory(nextHistAll[coin])

          // Update mark price points (keep last ~2h, enough for 1h return)
          if (markPx != null) {
            hist.markPxPoints.push({ ts: now, px: markPx })
            const cutoff = now - 2 * 60 * 60 * 1000
            hist.markPxPoints = hist.markPxPoints.filter((p) => p.ts >= cutoff)
          }

          // Update 15m buckets for OI & funding
          if (openInterest != null) hist.oi = upsertBucket(hist.oi, now, openInterest)
          if (funding != null) hist.funding = upsertBucket(hist.funding, now, funding)
          hist.oi = trimBuckets(hist.oi, now)
          hist.funding = trimBuckets(hist.funding, now)

          // prune crowding-candidate keys to the same 7d horizon
          {
            const cutoff = now - LOOKBACK_MS_7D - BUCKET_MS_15M
            const nextMap: Record<number, boolean> = {}
            for (const [k, v] of Object.entries(hist.crowdingCandidateByBucketStart)) {
              const ks = Number(k)
              if (Number.isFinite(ks) && ks >= cutoff) nextMap[ks] = v
            }
            hist.crowdingCandidateByBucketStart = nextMap
          }

          // Liquidity preferred: impact cost if impactPxs present
          const impactCostPct = computeImpactCostPct({ impactPxsRaw: ctx?.impactPxsRaw, markPx })
          if (impactCostPct != null) {
            hist.impactCostPct = upsertBucket(hist.impactCostPct, now, impactCostPct)
            hist.impactCostPct = trimBuckets(hist.impactCostPct, now)
          }

          // Fallback liquidity: l2Book when impact cost missing
          if (impactCostPct == null) {
            const cached = lastL2BookRef.current[coin]
            const shouldFetch = !cached || now - cached.ts >= 30 * 1000
            if (shouldFetch) {
              try {
                const snap = await fetchL2BookSnapshot({ coin, signal: abort.signal })
                lastL2BookRef.current[coin] = { ts: now, snapshot: snap }
              } catch {
                // ignore l2 book failure
              }
            }

            const snap = lastL2BookRef.current[coin]?.snapshot
            if (snap?.spreadPct != null) {
              hist.spreadPct = upsertBucket(hist.spreadPct, now, snap.spreadPct)
              hist.spreadPct = trimBuckets(hist.spreadPct, now)
            }
            if (snap?.depthNotionalNearMid != null) {
              hist.depthNotional = upsertBucket(hist.depthNotional, now, snap.depthNotionalNearMid)
              hist.depthNotional = trimBuckets(hist.depthNotional, now)
            }
          }

          // ---------------- Stability gate ----------------
          const failedChecks: string[] = []
          const passDayNtlVlm = dayNtlVlm != null && dayNtlVlm > STABILITY_DAY_NTL_VLM_MIN
          const passOpenInterest = openInterest != null && openInterest > STABILITY_OPEN_INTEREST_MIN
          if (!passDayNtlVlm) failedChecks.push('dayNtlVlm below min')
          if (!passOpenInterest) failedChecks.push('openInterest below min')

          const stabilityOk =
            dayNtlVlm != null &&
            openInterest != null &&
            dayNtlVlm > STABILITY_DAY_NTL_VLM_MIN &&
            openInterest > STABILITY_OPEN_INTEREST_MIN

          // Precompute pillar placeholders (for tooltip even when disabled)
          const crowdingConfirmRequired = 2
          const liquidityConfirmRequired = 2

          // Pillar 1 precompute
          const currentOiBucket = hist.oi.length > 0 ? hist.oi[hist.oi.length - 1] : null
          const currentFundingBucket = hist.funding.length > 0 ? hist.funding[hist.funding.length - 1] : null
          const oldestBucketStart = now - LOOKBACK_MS_7D
          const has7dOi = hist.oi.length > 0 && hist.oi[0].bucketStartMs <= oldestBucketStart
          const has7dFunding = hist.funding.length > 0 && hist.funding[0].bucketStartMs <= oldestBucketStart

          const oiHist = currentOiBucket ? hist.oi.slice(0, -1).map((b) => b.avg) : []
          const fHist = currentFundingBucket ? hist.funding.slice(0, -1).map((b) => b.avg) : []
          const oiZ = currentOiBucket && has7dOi && oiHist.length >= 2 ? zscore(currentOiBucket.avg, oiHist) : null
          const fZ = currentFundingBucket && has7dFunding && fHist.length >= 2 ? zscore(currentFundingBucket.avg, fHist) : null
          const crowdingRaw = oiZ != null && fZ != null && oiZ >= CROWDING_OI_Z_THRESHOLD && Math.abs(fZ) >= CROWDING_F_Z_THRESHOLD

          const crowdingCounter =
            crowdingRaw && currentOiBucket
              ? (hist.crowdingCandidateByBucketStart[currentOiBucket.bucketStartMs - BUCKET_MS_15M] === true ? 2 : 1)
              : 0

          const crowdingConfirmed = crowdingCounter >= crowdingConfirmRequired
          const crowdDir =
            fZ == null
              ? 'NEUTRAL'
              : fZ > 0
                ? 'LONG_CROWDED'
                : 'SHORT_CROWDED'

          // Pillar 2 precompute (only meaningful if crowding direction known)
          const structureDbg =
            crowdingConfirmed && (crowDir === 'LONG_CROWDED' || crowdDir === 'SHORT_CROWDED')
              ? computeStructureDebug({ crowdingDirection: crowdDir === 'LONG_CROWDED' ? 'LONG' : 'SHORT', markPxPoints: hist.markPxPoints, now })
              : { nowPx: markPx, r15: null, r1h: null, state: null as any, ruleUsed: 'N/A', reason: crowdingConfirmed ? 'Missing crowding direction' : 'Not crowded (structure not evaluated)' }

          // Pillar 3 precompute
          const liquidityChecksPruned = hist.liquidityFragileChecks.filter((c) => c.ts >= now - 60 * 60 * 1000)
          hist.liquidityFragileChecks = liquidityChecksPruned

          const snap = lastL2BookRef.current[coin]?.snapshot
          const spreadPctNow = snap?.spreadPct ?? null
          const depthNow = snap?.depthNotionalNearMid ?? null

          const impactCostBucket = hist.impactCostPct.length > 0 ? hist.impactCostPct[hist.impactCostPct.length - 1] : null
          const spreadBucket = hist.spreadPct.length > 0 ? hist.spreadPct[hist.spreadPct.length - 1] : null
          const depthBucket = hist.depthNotional.length > 0 ? hist.depthNotional[hist.depthNotional.length - 1] : null

          const impHist = impactCostBucket ? hist.impactCostPct.slice(0, -1).map((b) => b.avg) : []
          const spreadHist = spreadBucket ? hist.spreadPct.slice(0, -1).map((b) => b.avg) : []
          const depthHist = depthBucket ? hist.depthNotional.slice(0, -1).map((b) => b.avg) : []

          const impactCost_z = impactCostBucket && impHist.length >= 2 ? zscore(impactCostBucket.avg, impHist) : null
          const spread_z = spreadBucket && spreadHist.length >= 2 ? zscore(spreadBucket.avg, spreadHist) : null
          const depth_z = depthBucket && depthHist.length >= 2 ? zscore(depthBucket.avg, depthHist) : null

          const liquidityRaw =
            impactCost_z != null
              ? impactCost_z >= LIQUIDITY_Z_THRESHOLD
              : (spread_z != null && spread_z >= LIQUIDITY_Z_THRESHOLD) || (depth_z != null && depth_z <= -LIQUIDITY_Z_THRESHOLD)

          const liquidityCounter = liquidityRaw ? (hist.liquidityFragileChecks.length > 0 && hist.liquidityFragileChecks[hist.liquidityFragileChecks.length - 1].fragile ? 2 : 1) : 0
          const liquidityConfirmed = liquidityCounter >= liquidityConfirmRequired

          const cooldownBase = hist.lastState
          const elapsed = cooldownBase ? now - cooldownBase.enteredAt : 0
          const orangeRemaining = cooldownBase?.state === 'ORANGE' ? Math.max(0, COOL_DOWN_ORANGE_MS - elapsed) : 0
          const redRemaining = cooldownBase?.state === 'RED' ? Math.max(0, COOL_DOWN_RED_MS - elapsed) : 0

          if (!stabilityOk) {
            const state: RiskState = 'UNSUPPORTED'
            // Track state entry for cooldown consistency
            if (!hist.lastState || hist.lastState.state !== state) {
              hist.lastState = { state, enteredAt: now }
            }

            const reason = 'Universe filter failed'
            const debugBase: Omit<RiskDotDebug, 'tooltipText'> = {
              state,
              reason,
              updatedAt: now,
              universe: {
                dayNtlVlm,
                minVolume: STABILITY_DAY_NTL_VLM_MIN,
                openInterest,
                minOI: STABILITY_OPEN_INTEREST_MIN,
                passDayNtlVlm,
                passOpenInterest,
                eligible: false,
                failedChecks,
                disabledBecause: failedChecks.join(', ') || null,
              },
              pillar1: {
                skipped: true,
                oi: openInterest,
                funding,
                oi_z: oiZ,
                f_z: fZ,
                oi_z_th: CROWDING_OI_Z_THRESHOLD,
                f_z_th: CROWDING_F_Z_THRESHOLD,
                direction: crowdDir as any,
                crowdingRaw,
                crowdingConfirmed,
                confirmCounter: crowdingCounter,
                confirmRequired: crowdingConfirmRequired,
                reason: !crowdingRaw ? 'crowdingRaw=false because thresholds not met or insufficient history' : 'crowdingRaw=true (but disabled by universe filter)',
              },
              pillar2: {
                skipped: true,
                markNow: structureDbg.nowPx ?? markPx,
                return15m: structureDbg.r15 ?? null,
                return1h: structureDbg.r1h ?? null,
                directionUsed: crowdDir as any,
                structureState: structureDbg.state ?? 'N/A',
                ruleUsed: structureDbg.ruleUsed,
                reason: 'SKIPPED (disabled by universe filter)',
              },
              pillar3: {
                skipped: true,
                source: impactCostBucket ? 'impactPxs' : snap ? 'l2Book' : 'none',
                impactCostPct: impactCostBucket?.avg ?? null,
                impactCost_z,
                spreadPct: spreadBucket?.avg ?? spreadPctNow,
                spread_z,
                depthNotional: depthBucket?.avg ?? depthNow,
                depth_z,
                z_th: LIQUIDITY_Z_THRESHOLD,
                liquidityFragileRaw: liquidityRaw,
                liquidityFragileConfirmed: liquidityConfirmed,
                confirmCounter: liquidityCounter,
                confirmRequired: liquidityConfirmRequired,
                reason: 'SKIPPED (disabled by universe filter)',
              },
              antiFlip: {
                confirmationRequired: 2,
                crowdingConfirm: { n: crowdingCounter, required: crowdingConfirmRequired },
                liquidityConfirm: { n: liquidityCounter, required: liquidityConfirmRequired },
                stateCooldown: {
                  orangeMinHoldMs: COOL_DOWN_ORANGE_MS,
                  orangeRemainingMs: orangeRemaining,
                  redMinHoldMs: COOL_DOWN_RED_MS,
                  redRemainingMs: redRemaining,
                },
                stateChangeBlocked: false,
                blockedReason: null,
              },
              decisionTrace: {
                universeEligible: false,
                crowdingConfirmed,
                structureState: structureDbg.state ?? 'N/A',
                liquidityFragileConfirmed: liquidityConfirmed,
                computedState: state,
                effectiveState: state,
                ruleMatched: 'GRAY: universeEligible=false',
              },
            }

            const debug: RiskDotDebug = { ...debugBase, tooltipText: buildTooltipText({ coin, debug: debugBase }) }

            nextRisk[coin] = {
              coin,
              state,
              message: MSG[state],
              dotColor: DOT_COLORS[state],
              funding,
              openInterest,
              dayNtlVlm,
              markPx,
              debug,
            }
            nextHistAll[coin] = hist
            continue
          }

          // ---------------- Pillar 1: Crowding ----------------
          let crowding = false
          let crowdingDirection: 'LONG' | 'SHORT' | null = null

          if (currentOiBucket && currentFundingBucket && has7dOi && has7dFunding) {
            // zscores computed against prior buckets (exclude current bucket)
            hist.crowdingCandidateByBucketStart[currentOiBucket.bucketStartMs] = crowdingRaw

            const prevBucketStart = currentOiBucket.bucketStartMs - BUCKET_MS_15M
            const prevCandidate = hist.crowdingCandidateByBucketStart[prevBucketStart] === true
            if (crowdingRaw && prevCandidate) {
              crowding = true
              crowdingDirection = fZ! > 0 ? 'LONG' : 'SHORT'
            }
          }

          // ---------------- Pillar 2: Structure ----------------
          let structure: 'INTACT' | 'WEAKENING' | 'BROKEN' | null = null
          let structureRuleUsed = 'N/A'
          let structureReason = 'Not evaluated'
          let r15: number | null = null
          let r1h: number | null = null
          let markNow: number | null = markPx
          if (crowding && crowdingDirection) {
            const s = computeStructureDebug({ crowdingDirection, markPxPoints: hist.markPxPoints, now })
            structure = s.state
            structureRuleUsed = s.ruleUsed
            structureReason = s.reason
            r15 = s.r15
            r1h = s.r1h
            markNow = s.nowPx ?? markPx
          }

          // ---------------- Pillar 3: Liquidity ----------------
          let liquidityFragile = false
          let liquidityCandidate = false
          const liquidityChecks = hist.liquidityFragileChecks.filter((c) => c.ts >= now - 60 * 60 * 1000)
          hist.liquidityFragileChecks = liquidityChecks

          // Prefer impact cost zscore, else spread/depth zscores.
          if (impactCostPct != null && hist.impactCostPct.length > 2) {
            const currentImpactBucket = hist.impactCostPct[hist.impactCostPct.length - 1]
            const impHist = hist.impactCostPct.slice(0, -1).map((b) => b.avg)
            const impZ = impHist.length >= 2 ? zscore(currentImpactBucket.avg, impHist) : null
            liquidityCandidate = impZ != null && impZ >= LIQUIDITY_Z_THRESHOLD
          } else if (hist.spreadPct.length > 2 || hist.depthNotional.length > 2) {
            const spreadB = hist.spreadPct.length > 0 ? hist.spreadPct[hist.spreadPct.length - 1] : null
            const depthB = hist.depthNotional.length > 0 ? hist.depthNotional[hist.depthNotional.length - 1] : null
            const spreadHist = hist.spreadPct.slice(0, -1).map((b) => b.avg)
            const depthHist = hist.depthNotional.slice(0, -1).map((b) => b.avg)
            const spreadZ = spreadB && spreadHist.length >= 2 ? zscore(spreadB.avg, spreadHist) : null
            const depthZ = depthB && depthHist.length >= 2 ? zscore(depthB.avg, depthHist) : null
            liquidityCandidate =
              (spreadZ != null && spreadZ >= LIQUIDITY_Z_THRESHOLD) || (depthZ != null && depthZ <= -LIQUIDITY_Z_THRESHOLD)
          }

          // Confirmation: 2 consecutive checks
          hist.liquidityFragileChecks.push({ ts: now, fragile: liquidityCandidate })
          if (hist.liquidityFragileChecks.length >= 2) {
            const a = hist.liquidityFragileChecks[hist.liquidityFragileChecks.length - 1]
            const b = hist.liquidityFragileChecks[hist.liquidityFragileChecks.length - 2]
            liquidityFragile = a.fragile && b.fragile
          }

          const liquidityConfirmCounter =
            liquidityCandidate ? (hist.liquidityFragileChecks.length >= 2 && hist.liquidityFragileChecks[hist.liquidityFragileChecks.length - 2].fragile ? 2 : 1) : 0

          // ---------------- Final state logic ----------------
          let computed: RiskState = 'GREEN'
          if (!crowding) {
            computed = 'GREEN'
          } else if (structure === 'INTACT') {
            computed = 'GREEN'
          } else if (structure === 'WEAKENING' && !liquidityFragile) {
            computed = 'ORANGE'
          } else if (structure === 'BROKEN' && liquidityFragile) {
            computed = 'RED'
          } else {
            computed = 'GREEN'
          }

          // Safety: never show false RED on missing critical data
          const hasStructure = !crowding || structure !== null
          const hasLiquiditySignal = impactCostPct != null || hist.spreadPct.length > 0 || hist.depthNotional.length > 0
          if (computed === 'RED' && (!hasStructure || !hasLiquiditySignal)) {
            computed = 'GREEN'
          }

          // Cooldowns on downgrade
          const currentState = hist.lastState
          const effective = canDowngradeState({ current: currentState, next: computed, now }) ? computed : currentState?.state ?? computed
          const stateBlocked = effective !== computed
          const blockedReason = stateBlocked ? 'cooldown active (downgrade blocked)' : null
          if (!currentState || currentState.state !== effective) {
            hist.lastState = { state: effective, enteredAt: now }
          }

          // Build debug object (rich trace)
          const debugReason =
            !stabilityOk
              ? 'Universe filter failed'
              : effective === 'GREEN'
                ? 'Crowding=false OR structure intact'
                : effective === 'ORANGE'
                  ? 'Crowding=true + structure weakening + liquidity ok'
                  : effective === 'RED'
                    ? 'Crowding=true + structure broken + liquidity fragile (confirmed) + cooldown'
                    : 'Universe filter failed'

          const finalRuleMatched =
            !stabilityOk
              ? 'GRAY: universeEligible=false'
              : effective === 'RED'
                ? 'RED: crowdingConfirmed=true & structure=BROKEN & liquidityFragileConfirmed=true (+ cooldown)'
                : effective === 'ORANGE'
                  ? 'ORANGE: crowdingConfirmed=true & structure=WEAKENING & liquidityFragileConfirmed=false'
                  : 'GREEN: crowdingConfirmed=false OR structure=INTACT'

          const dbgBase: Omit<RiskDotDebug, 'tooltipText'> = {
            state: effective,
            reason: debugReason,
            updatedAt: now,
            universe: {
              dayNtlVlm,
              minVolume: STABILITY_DAY_NTL_VLM_MIN,
              openInterest,
              minOI: STABILITY_OPEN_INTEREST_MIN,
              passDayNtlVlm,
              passOpenInterest,
              eligible: true,
              failedChecks,
              disabledBecause: null,
            },
            pillar1: {
              skipped: false,
              oi: openInterest,
              funding,
              oi_z: oiZ,
              f_z: fZ,
              oi_z_th: CROWDING_OI_Z_THRESHOLD,
              f_z_th: CROWDING_F_Z_THRESHOLD,
              direction: crowdingRaw ? (crowDir as any) : 'NEUTRAL',
              crowdingRaw,
              crowdingConfirmed: crowdingConfirmed,
              confirmCounter: crowdingCounter,
              confirmRequired: crowdingConfirmRequired,
              reason: crowdingRaw
                ? 'crowdingRaw=true because OI_z>=th AND |F_z|>=th'
                : `crowdingRaw=false because ${oiZ == null || fZ == null ? 'missing zscores (insufficient history)' : `${oiZ < CROWDING_OI_Z_THRESHOLD ? 'OI_z<th' : ''}${oiZ < CROWDING_OI_Z_THRESHOLD && Math.abs(fZ) < CROWDING_F_Z_THRESHOLD ? ' and ' : ''}${Math.abs(fZ) < CROWDING_F_Z_THRESHOLD ? '|F_z|<th' : ''}`}`,
            },
            pillar2: {
              skipped: !(crowding && crowdingDirection),
              markNow,
              return15m: r15,
              return1h: r1h,
              directionUsed: crowdingDirection === 'LONG' ? 'LONG_CROWDED' : crowdingDirection === 'SHORT' ? 'SHORT_CROWDED' : 'NEUTRAL',
              structureState: crowding && crowdingDirection ? (structure ?? 'N/A') : 'N/A',
              ruleUsed: structureRuleUsed,
              reason: crowding && crowdingDirection ? structureReason : 'N/A (not crowded)',
            },
            pillar3: {
              skipped: false,
              source: impactCostPct != null ? 'impactPxs' : snap ? 'l2Book' : 'none',
              impactCostPct: impactCostPct,
              impactCost_z,
              spreadPct: spreadBucket?.avg ?? spreadPctNow,
              spread_z,
              depthNotional: depthBucket?.avg ?? depthNow,
              depth_z,
              z_th: LIQUIDITY_Z_THRESHOLD,
              liquidityFragileRaw: liquidityCandidate,
              liquidityFragileConfirmed: liquidityFragile,
              confirmCounter: liquidityConfirmCounter,
              confirmRequired: liquidityConfirmRequired,
              reason: liquidityCandidate ? 'fragile candidate true based on zscore threshold(s)' : 'ok because spread/impact/depth thresholds not met or insufficient history',
            },
            antiFlip: {
              confirmationRequired: 2,
              crowdingConfirm: { n: crowdingCounter, required: crowdingConfirmRequired },
              liquidityConfirm: { n: liquidityConfirmCounter, required: liquidityConfirmRequired },
              stateCooldown: {
                orangeMinHoldMs: COOL_DOWN_ORANGE_MS,
                orangeRemainingMs: orangeRemaining,
                redMinHoldMs: COOL_DOWN_RED_MS,
                redRemainingMs: redRemaining,
              },
              stateChangeBlocked: stateBlocked,
              blockedReason,
            },
            decisionTrace: {
              universeEligible: true,
              crowdingConfirmed,
              structureState: structure ?? 'N/A',
              liquidityFragileConfirmed: liquidityFragile,
              computedState: computed,
              effectiveState: effective,
              ruleMatched: finalRuleMatched,
            },
          }

          const debug: RiskDotDebug = { ...dbgBase, tooltipText: buildTooltipText({ coin, debug: dbgBase }) }

          nextRisk[coin] = {
            coin,
            state: effective,
            message: MSG[effective],
            dotColor: DOT_COLORS[effective],
            funding,
            openInterest,
            dayNtlVlm,
            markPx,
            debug,
          }

          nextHistAll[coin] = hist
        }

        historyRef.current = nextHistAll
        persist(nextHistAll)

        if (isMounted) {
          setRiskByCoin(nextRisk)
        }
        lastSuccessAtRef.current = now
      } catch {
        // fail silently
      }
    }

    // immediate + interval
    void tick()
    const id = window.setInterval(() => void tick(), 15_000)
    const staleId = window.setInterval(() => {
      const now = safeNow()
      const lastOk = lastSuccessAtRef.current
      // If we haven't refreshed for >60s, never keep a stale RED on screen.
      if (lastOk > 0 && now - lastOk > 60_000) {
        setRiskByCoin((prev) => {
          const next: Record<string, RiskPerCoin> = { ...prev }
          for (const coin of coins) {
            const failedChecks = ['metaAndAssetCtxs stale (>60s)']
            const dbgBase: Omit<RiskDotDebug, 'tooltipText'> = {
              state: 'UNSUPPORTED',
              reason: 'Risk data unavailable',
              updatedAt: lastOk,
              universe: {
                dayNtlVlm: null,
                minVolume: STABILITY_DAY_NTL_VLM_MIN,
                openInterest: null,
                minOI: STABILITY_OPEN_INTEREST_MIN,
                passDayNtlVlm: false,
                passOpenInterest: false,
                eligible: false,
                failedChecks,
                disabledBecause: failedChecks.join(', '),
              },
              pillar1: {
                skipped: true,
                oi: null,
                funding: null,
                oi_z: null,
                f_z: null,
                oi_z_th: CROWDING_OI_Z_THRESHOLD,
                f_z_th: CROWDING_F_Z_THRESHOLD,
                direction: 'NEUTRAL',
                crowdingRaw: false,
                crowdingConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data unavailable)',
              },
              pillar2: {
                skipped: true,
                markNow: null,
                return15m: null,
                return1h: null,
                directionUsed: 'NEUTRAL',
                structureState: 'N/A',
                ruleUsed: 'N/A',
                reason: 'SKIPPED (data unavailable)',
              },
              pillar3: {
                skipped: true,
                source: 'none',
                impactCostPct: null,
                impactCost_z: null,
                spreadPct: null,
                spread_z: null,
                depthNotional: null,
                depth_z: null,
                z_th: LIQUIDITY_Z_THRESHOLD,
                liquidityFragileRaw: false,
                liquidityFragileConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data unavailable)',
              },
              antiFlip: {
                confirmationRequired: 2,
                crowdingConfirm: { n: 0, required: 2 },
                liquidityConfirm: { n: 0, required: 2 },
                stateCooldown: {
                  orangeMinHoldMs: COOL_DOWN_ORANGE_MS,
                  orangeRemainingMs: 0,
                  redMinHoldMs: COOL_DOWN_RED_MS,
                  redRemainingMs: 0,
                },
                stateChangeBlocked: false,
                blockedReason: null,
              },
              decisionTrace: {
                universeEligible: false,
                crowdingConfirmed: false,
                structureState: 'N/A',
                liquidityFragileConfirmed: false,
                computedState: 'UNSUPPORTED',
                effectiveState: 'UNSUPPORTED',
                ruleMatched: 'GRAY: risk data unavailable',
              },
            }
            const debug: RiskDotDebug = { ...dbgBase, tooltipText: buildTooltipText({ coin, debug: dbgBase }) }
            next[coin] = {
              coin,
              state: 'UNSUPPORTED',
              message: 'Risk data unavailable.',
              dotColor: DOT_COLORS.UNSUPPORTED,
              funding: null,
              openInterest: null,
              dayNtlVlm: null,
              markPx: null,
              debug,
            }
          }
          return next
        })
      }
    }, 10_000)

    return () => {
      isMounted = false
      abort.abort()
      window.clearInterval(id)
      window.clearInterval(staleId)
    }
  }, [coins.join(',')])

  return { riskByCoin, constants: { STABILITY_DAY_NTL_VLM_MIN, STABILITY_OPEN_INTEREST_MIN } }
}

