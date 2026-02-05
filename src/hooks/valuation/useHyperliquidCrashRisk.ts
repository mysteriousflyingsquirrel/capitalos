import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeImpactCostPct,
  fetchL2BookSnapshot,
  fetchMetaAndAssetCtxs,
  type HyperliquidAssetCtx,
  type HyperliquidL2BookSnapshot,
} from '../../services/hyperliquidInfo'

export type RiskState = 'GREEN' | 'ORANGE' | 'RED' | 'UNSUPPORTED'

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

function computeStructureState(args: { crowdingDirection: 'LONG' | 'SHORT'; markPxPoints: Array<{ ts: number; px: number }>; now: number }): 'INTACT' | 'WEAKENING' | 'BROKEN' | null {
  const { crowdingDirection, markPxPoints, now } = args
  const nowPx = markPxPoints.length > 0 ? markPxPoints[markPxPoints.length - 1].px : null
  if (nowPx == null) return null

  const px15m = closestPoint(markPxPoints, now - 15 * 60 * 1000)
  const px1h = closestPoint(markPxPoints, now - 60 * 60 * 1000)
  if (px15m == null || px1h == null) return null

  const r15 = computeReturn(nowPx, px15m)
  const r1h = computeReturn(nowPx, px1h)
  if (r15 == null || r1h == null) return null

  const r1hApproxZero = Math.abs(r1h) < STRUCTURE_ZERO_THRESHOLD

  if (crowdingDirection === 'LONG') {
    if (r15 > 0 && r1h > 0) return 'INTACT'
    if (r15 < 0 && r1h < 0) return 'BROKEN'
    if (r15 <= 0 || r1hApproxZero) return 'WEAKENING'
    return 'WEAKENING'
  }

  // SHORT crowding
  if (r15 < 0 && r1h < 0) return 'INTACT'
  if (r15 > 0 && r1h > 0) return 'BROKEN'
  if (r15 >= 0 || r1hApproxZero) return 'WEAKENING'
  return 'WEAKENING'
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
          const stabilityOk =
            dayNtlVlm != null &&
            openInterest != null &&
            dayNtlVlm > STABILITY_DAY_NTL_VLM_MIN &&
            openInterest > STABILITY_OPEN_INTEREST_MIN

          if (!stabilityOk) {
            const state: RiskState = 'UNSUPPORTED'
            // Track state entry for cooldown consistency
            if (!hist.lastState || hist.lastState.state !== state) {
              hist.lastState = { state, enteredAt: now }
            }

            nextRisk[coin] = {
              coin,
              state,
              message: MSG[state],
              dotColor: DOT_COLORS[state],
              funding,
              openInterest,
              dayNtlVlm,
              markPx,
            }
            nextHistAll[coin] = hist
            continue
          }

          // ---------------- Pillar 1: Crowding ----------------
          const currentOiBucket = hist.oi.length > 0 ? hist.oi[hist.oi.length - 1] : null
          const currentFundingBucket = hist.funding.length > 0 ? hist.funding[hist.funding.length - 1] : null

          // Require full 7d lookback coverage (spec). We use bucketStart cutoff.
          const oldestBucketStart = now - LOOKBACK_MS_7D
          const has7dOi = hist.oi.length > 0 && hist.oi[0].bucketStartMs <= oldestBucketStart
          const has7dFunding = hist.funding.length > 0 && hist.funding[0].bucketStartMs <= oldestBucketStart

          let crowding = false
          let crowdingDirection: 'LONG' | 'SHORT' | null = null

          if (currentOiBucket && currentFundingBucket && has7dOi && has7dFunding) {
            // zscores computed against prior buckets (exclude current bucket)
            const oiHist = hist.oi.slice(0, -1).map((b) => b.avg)
            const fHist = hist.funding.slice(0, -1).map((b) => b.avg)
            const oiZ = oiHist.length >= 2 ? zscore(currentOiBucket.avg, oiHist) : null
            const fZ = fHist.length >= 2 ? zscore(currentFundingBucket.avg, fHist) : null

            const candidate = oiZ != null && fZ != null && oiZ >= CROWDING_OI_Z_THRESHOLD && Math.abs(fZ) >= CROWDING_F_Z_THRESHOLD
            hist.crowdingCandidateByBucketStart[currentOiBucket.bucketStartMs] = candidate

            const prevBucketStart = currentOiBucket.bucketStartMs - BUCKET_MS_15M
            const prevCandidate = hist.crowdingCandidateByBucketStart[prevBucketStart] === true
            if (candidate && prevCandidate) {
              crowding = true
              crowdingDirection = fZ! > 0 ? 'LONG' : 'SHORT'
            }
          }

          // ---------------- Pillar 2: Structure ----------------
          let structure: 'INTACT' | 'WEAKENING' | 'BROKEN' | null = null
          if (crowding && crowdingDirection) {
            structure = computeStructureState({ crowdingDirection, markPxPoints: hist.markPxPoints, now })
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
          if (!currentState || currentState.state !== effective) {
            hist.lastState = { state: effective, enteredAt: now }
          }

          nextRisk[coin] = {
            coin,
            state: effective,
            message: MSG[effective],
            dotColor: DOT_COLORS[effective],
            funding,
            openInterest,
            dayNtlVlm,
            markPx,
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
            next[coin] = {
              coin,
              state: 'UNSUPPORTED',
              message: 'Risk data unavailable.',
              dotColor: DOT_COLORS.UNSUPPORTED,
              funding: null,
              openInterest: null,
              dayNtlVlm: null,
              markPx: null,
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

