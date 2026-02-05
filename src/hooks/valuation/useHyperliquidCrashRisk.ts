import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeImpactCostPct,
  extractSymbol,
  fetchCandleSnapshot,
  fetchFundingHistory,
  fetchL2BookSnapshot,
  fetchMetaAndAssetCtxs,
  fetchPerpsAtOpenInterestCap,
  type HyperliquidAssetCtx,
} from '../../services/hyperliquidInfo'

export type RiskState = 'GREEN' | 'ORANGE' | 'RED' | 'UNSUPPORTED'

export type RiskDotDebug = {
  state: RiskState
  reason: string
  updatedAt: number
  request: {
    requestedTicker: string
    parsedDex: string
    parsedCoin: string
    metaAndAssetCtxsPayload: { type: 'metaAndAssetCtxs'; dex: string }
    assetCtxFound: boolean
    assetCtxIndex: number | null
  }
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
    funding: number | null
    funding_z: number | null
    funding_z_th: number
    fundingHistorySamples: number
    fundingHistoryLookback: string
    isAtOiCap: boolean
    oiCapAvailable: boolean
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
    return15m_th_weakening: number
    return15m_th_broken: number
    return1h_th_broken: number
    candlesAvailable: boolean
    directionUsed: 'LONG_CROWDED' | 'SHORT_CROWDED' | 'NEUTRAL'
    structureState: 'N/A' | 'INTACT' | 'WEAKENING' | 'BROKEN'
    ruleUsed: string
    reason: string
  }
  pillar3: {
    skipped: boolean
    source: 'impactPxs' | 'l2Book' | 'none'
    impactCostBps: number | null
    impactCostBps_th: number
    spreadBps: number | null
    spreadBps_th: number
    depthNotional: number | null
    depthNotional_th: number
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
  funding: number | null
  openInterest: number | null
  dayNtlVlm: number | null
  markPx: number | null
  debug: RiskDotDebug
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STABILITY_DAY_NTL_VLM_MIN = 25_000_000
const STABILITY_OPEN_INTEREST_MIN = 10_000_000

// Pillar 1: Crowding
const FUNDING_Z_THRESHOLD = 1.5
const FUNDING_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000 // 24h

// Pillar 2: Structure thresholds
const STRUCTURE_WEAKENING_THRESHOLD = 0.002 // 0.2%
const STRUCTURE_BROKEN_15M_THRESHOLD = 0.006 // 0.6%
const STRUCTURE_BROKEN_1H_THRESHOLD = 0.012 // 1.2%

// Pillar 3: Liquidity absolute thresholds
const IMPACT_BPS_THRESHOLD = 25
const SPREAD_BPS_THRESHOLD = 8
const DEPTH_MIN_NOTIONAL = 500_000 // $500k (middle ground for metals/majors)

// Anti-flip cooldowns
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeNow(): number {
  return Date.now()
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

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state for confirmations and cooldowns (per coin)
// ─────────────────────────────────────────────────────────────────────────────

type CoinMemoryState = {
  crowdingConfirmCount: number
  liquidityConfirmCount: number
  lastCrowdingRaw: boolean
  lastLiquidityRaw: boolean
  lastState: { state: RiskState; enteredAt: number } | null
}

function getDefaultMemoryState(): CoinMemoryState {
  return {
    crowdingConfirmCount: 0,
    liquidityConfirmCount: 0,
    lastCrowdingRaw: false,
    lastLiquidityRaw: false,
    lastState: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure computation (Pillar 2)
// ─────────────────────────────────────────────────────────────────────────────

function computeStructure(args: {
  crowdingDirection: 'LONG' | 'SHORT'
  return15m: number | null
  return1h: number | null
}): {
  state: 'INTACT' | 'WEAKENING' | 'BROKEN' | null
  ruleUsed: string
  reason: string
} {
  const { crowdingDirection, return15m, return1h } = args

  if (return15m == null || return1h == null) {
    return { state: null, ruleUsed: 'N/A', reason: 'Missing candle data for returns' }
  }

  if (crowdingDirection === 'LONG') {
    // For LONG crowding: price should be rising; negative returns are bad
    if (return15m > 0 && return1h > 0) {
      return { state: 'INTACT', ruleUsed: 'LONG: r15>0 && r1h>0', reason: 'Price rising (15m and 1h positive)' }
    }
    if (return15m <= -STRUCTURE_BROKEN_15M_THRESHOLD || return1h <= -STRUCTURE_BROKEN_1H_THRESHOLD) {
      return { state: 'BROKEN', ruleUsed: `LONG: r15<=-${STRUCTURE_BROKEN_15M_THRESHOLD * 100}% OR r1h<=-${STRUCTURE_BROKEN_1H_THRESHOLD * 100}%`, reason: 'Structure broken (significant negative move)' }
    }
    if (return15m <= -STRUCTURE_WEAKENING_THRESHOLD) {
      return { state: 'WEAKENING', ruleUsed: `LONG: r15<=-${STRUCTURE_WEAKENING_THRESHOLD * 100}%`, reason: 'Structure weakening (15m return negative)' }
    }
    return { state: 'INTACT', ruleUsed: 'LONG: default', reason: 'Structure intact (no significant negative)' }
  }

  // SHORT crowding: price should be falling; positive returns are bad
  if (return15m < 0 && return1h < 0) {
    return { state: 'INTACT', ruleUsed: 'SHORT: r15<0 && r1h<0', reason: 'Price falling (15m and 1h negative)' }
  }
  if (return15m >= STRUCTURE_BROKEN_15M_THRESHOLD || return1h >= STRUCTURE_BROKEN_1H_THRESHOLD) {
    return { state: 'BROKEN', ruleUsed: `SHORT: r15>=${STRUCTURE_BROKEN_15M_THRESHOLD * 100}% OR r1h>=${STRUCTURE_BROKEN_1H_THRESHOLD * 100}%`, reason: 'Structure broken (significant positive move)' }
  }
  if (return15m >= STRUCTURE_WEAKENING_THRESHOLD) {
    return { state: 'WEAKENING', ruleUsed: `SHORT: r15>=${STRUCTURE_WEAKENING_THRESHOLD * 100}%`, reason: 'Structure weakening (15m return positive)' }
  }
  return { state: 'INTACT', ruleUsed: 'SHORT: default', reason: 'Structure intact (no significant positive)' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown logic
// ─────────────────────────────────────────────────────────────────────────────

function canDowngradeState(args: { current: { state: RiskState; enteredAt: number } | null; next: RiskState; now: number }): boolean {
  const { current, next, now } = args
  if (!current) return true
  if (current.state === next) return true

  const rank: Record<RiskState, number> = { RED: 3, ORANGE: 2, GREEN: 1, UNSUPPORTED: 0 }
  if (rank[next] >= rank[current.state]) return true

  const elapsed = now - current.enteredAt
  if (current.state === 'RED') return elapsed >= COOL_DOWN_RED_MS
  if (current.state === 'ORANGE') return elapsed >= COOL_DOWN_ORANGE_MS
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug tooltip builder
// ─────────────────────────────────────────────────────────────────────────────

function buildTooltipText(args: { coin: string; debug: Omit<RiskDotDebug, 'tooltipText'> }): string {
  const d = args.debug
  const now = safeNow()
  const ageMs = now - d.updatedAt

  const lines: string[] = []
  lines.push(`Risk Dot Debug — ${args.coin}`)
  lines.push('')
  lines.push('REQUEST / MAPPING')
  lines.push(`requestedTicker: ${d.request.requestedTicker}`)
  lines.push(`parsedDex: ${d.request.parsedDex || '(default)'}`)
  lines.push(`parsedCoin: ${d.request.parsedCoin}`)
  lines.push(`metaAndAssetCtxs payload: ${JSON.stringify(d.request.metaAndAssetCtxsPayload)}`)
  lines.push(`assetCtx found: ${String(d.request.assetCtxFound)}${d.request.assetCtxIndex != null ? ` (index ${d.request.assetCtxIndex})` : ''}`)
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
  lines.push(`- funding (now): ${formatNumber(d.pillar1.funding, 6)}`)
  lines.push(`- funding_z: ${formatNumber(d.pillar1.funding_z, 3)}  threshold: ±${d.pillar1.funding_z_th}`)
  lines.push(`- fundingHistory: ${d.pillar1.fundingHistorySamples} samples (${d.pillar1.fundingHistoryLookback})`)
  lines.push(`- isAtOiCap: ${String(d.pillar1.isAtOiCap)}  (oiCapAvailable: ${String(d.pillar1.oiCapAvailable)})`)
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
  lines.push(`- candlesAvailable: ${String(d.pillar2.candlesAvailable)}`)
  lines.push('Thresholds:')
  lines.push(`- weakening: ${(d.pillar2.return15m_th_weakening * 100).toFixed(1)}%`)
  lines.push(`- broken: r15>=${(d.pillar2.return15m_th_broken * 100).toFixed(1)}% OR r1h>=${(d.pillar2.return1h_th_broken * 100).toFixed(1)}%`)
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
    lines.push(`- impactCost: ${d.pillar3.impactCostBps == null ? '–' : `${d.pillar3.impactCostBps.toFixed(1)} bps`}  threshold: ${d.pillar3.impactCostBps_th} bps`)
  } else if (d.pillar3.source === 'l2Book') {
    lines.push('Inputs (l2Book path):')
    lines.push(`- spread: ${d.pillar3.spreadBps == null ? '–' : `${d.pillar3.spreadBps.toFixed(1)} bps`}  threshold: ${d.pillar3.spreadBps_th} bps`)
    lines.push(`- depth(0.2%): ${formatUsdCompact(d.pillar3.depthNotional)}  threshold: ${formatUsdCompact(d.pillar3.depthNotional_th)}`)
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useHyperliquidCrashRisk(args: { coins: string[] }) {
  const coins = useMemo(() => args.coins.filter(Boolean), [args.coins.join(',')])

  const [riskByCoin, setRiskByCoin] = useState<Record<string, RiskPerCoin>>({})

  // In-memory state for confirmations and cooldowns (resets on page refresh)
  const memoryStateRef = useRef<Record<string, CoinMemoryState>>({})
  const lastSuccessAtRef = useRef<number>(0)

  useEffect(() => {
    let isMounted = true
    const abort = new AbortController()

    const tick = async () => {
      const now = safeNow()
      try {
        // Parse tickers
        const parseTicker = (ticker: string): { requestedTicker: string; parsedDex: string; parsedCoin: string } => {
          const i = ticker.indexOf(':')
          if (i <= 0) return { requestedTicker: ticker, parsedDex: '', parsedCoin: ticker }
          return { requestedTicker: ticker, parsedDex: ticker.slice(0, i), parsedCoin: ticker.slice(i + 1) }
        }

        const parsed = coins.map(parseTicker)
        const dexSet = new Set(parsed.map((p) => p.parsedDex))
        const dexList = Array.from(dexSet)

        // Fetch metaAndAssetCtxs per dex
        const ctxByDex: Record<string, Awaited<ReturnType<typeof fetchMetaAndAssetCtxs>>> = {}
        await Promise.all(
          dexList.map(async (dex) => {
            try {
              ctxByDex[dex] = await fetchMetaAndAssetCtxs({ dex, signal: abort.signal })
            } catch {
              ctxByDex[dex] = { universe: [], assetCtxsRaw: [], byCoin: {} }
            }
          })
        )

        // Build universe index maps per dex
        const indexByDex: Record<string, Record<string, number>> = {}
        for (const dex of dexList) {
          const resp = ctxByDex[dex]
          const idx: Record<string, number> = {}
          for (let i = 0; i < resp.universe.length; i++) {
            const sym = extractSymbol(resp.universe[i])
            if (!sym) continue
            idx[sym.toUpperCase()] = i
          }
          indexByDex[dex] = idx
        }

        // Fetch perpsAtOpenInterestCap per dex
        const oiCapByDex: Record<string, Set<string>> = {}
        await Promise.all(
          dexList.map(async (dex) => {
            try {
              const caps = await fetchPerpsAtOpenInterestCap({ dex: dex || undefined, signal: abort.signal })
              oiCapByDex[dex] = new Set(caps.map((c) => c.toUpperCase()))
            } catch {
              oiCapByDex[dex] = new Set()
            }
          })
        )

        const nextRisk: Record<string, RiskPerCoin> = {}

        for (const { requestedTicker, parsedDex, parsedCoin } of parsed) {
          const dexResp = ctxByDex[parsedDex] ?? { universe: [], assetCtxsRaw: [], byCoin: {} }
          const idxMap = indexByDex[parsedDex] ?? {}
          const assetIndex = idxMap[parsedCoin.toUpperCase()] ?? idxMap[requestedTicker.toUpperCase()]
          const assetFound = typeof assetIndex === 'number'

          const ctx: HyperliquidAssetCtx | undefined =
            dexResp.byCoin[parsedCoin] ??
            dexResp.byCoin[parsedCoin.toUpperCase()] ??
            dexResp.byCoin[requestedTicker] ??
            dexResp.byCoin[requestedTicker.toUpperCase()]

          const markPx = ctx?.markPx ?? null
          const funding = ctx?.funding ?? null
          const openInterest = ctx?.openInterest ?? null
          const dayNtlVlm = ctx?.dayNtlVlm ?? null

          // Get or create memory state for this coin
          if (!memoryStateRef.current[requestedTicker]) {
            memoryStateRef.current[requestedTicker] = getDefaultMemoryState()
          }
          const mem = memoryStateRef.current[requestedTicker]

          // Check if at OI cap
          const oiCapSet = oiCapByDex[parsedDex] ?? new Set()
          const oiCapAvailable = oiCapSet.size > 0 || oiCapByDex[parsedDex] !== undefined
          const isAtOiCap = oiCapSet.has(parsedCoin.toUpperCase()) || oiCapSet.has(requestedTicker.toUpperCase())

          // Data availability check
          const dataUnavailable = !assetFound || ctx == null || dayNtlVlm == null || openInterest == null

          // Universe filter
          const failedChecks: string[] = []
          const passDayNtlVlm = dayNtlVlm != null && dayNtlVlm > STABILITY_DAY_NTL_VLM_MIN
          const passOpenInterest = openInterest != null && openInterest > STABILITY_OPEN_INTEREST_MIN
          if (!passDayNtlVlm) failedChecks.push('dayNtlVlm below min')
          if (!passOpenInterest) failedChecks.push('openInterest below min')
          const stabilityOk = passDayNtlVlm && passOpenInterest

          const confirmRequired = 2

          // ─────────────────────────────────────────────────────────────────
          // Pillar 1: Crowding (funding_z from fundingHistory + isAtOiCap)
          // ─────────────────────────────────────────────────────────────────
          let funding_z: number | null = null
          let fundingHistorySamples = 0
          let crowdingRaw = false
          let crowdingDirection: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL'
          let pillar1Reason = ''

          if (!dataUnavailable && stabilityOk) {
            try {
              const startTime = now - FUNDING_HISTORY_LOOKBACK_MS
              const history = await fetchFundingHistory({ coin: requestedTicker, startTime, signal: abort.signal })
              fundingHistorySamples = history.length

              if (history.length >= 2 && funding != null) {
                const rates = history.map((h) => h.fundingRate)
                funding_z = zscore(funding, rates)
              }
            } catch {
              // fundingHistory unavailable - treat as crowding=false
              pillar1Reason = 'fundingHistory unavailable'
            }

            if (funding_z != null && Math.abs(funding_z) >= FUNDING_Z_THRESHOLD && isAtOiCap) {
              crowdingRaw = true
              crowdingDirection = funding_z > 0 ? 'LONG' : 'SHORT'
              pillar1Reason = `crowdingRaw=true (|funding_z|>=${FUNDING_Z_THRESHOLD} AND isAtOiCap=true)`
            } else if (!pillar1Reason) {
              const reasons: string[] = []
              if (funding_z == null) reasons.push('funding_z unavailable')
              else if (Math.abs(funding_z) < FUNDING_Z_THRESHOLD) reasons.push(`|funding_z|<${FUNDING_Z_THRESHOLD}`)
              if (!isAtOiCap) reasons.push('not at OI cap')
              pillar1Reason = `crowdingRaw=false (${reasons.join(', ')})`
            }
          } else {
            pillar1Reason = dataUnavailable ? 'data unavailable' : 'universe filter failed'
          }

          // Crowding confirmation (2 consecutive)
          if (crowdingRaw) {
            if (mem.lastCrowdingRaw) {
              mem.crowdingConfirmCount = Math.min(mem.crowdingConfirmCount + 1, confirmRequired)
            } else {
              mem.crowdingConfirmCount = 1
            }
          } else {
            mem.crowdingConfirmCount = 0
          }
          mem.lastCrowdingRaw = crowdingRaw
          const crowdingConfirmed = mem.crowdingConfirmCount >= confirmRequired

          // ─────────────────────────────────────────────────────────────────
          // Pillar 2: Structure (from candleSnapshot)
          // ─────────────────────────────────────────────────────────────────
          let return15m: number | null = null
          let return1h: number | null = null
          let candlesAvailable = false
          let structure: 'INTACT' | 'WEAKENING' | 'BROKEN' | null = null
          let structureRuleUsed = 'N/A'
          let structureReason = 'Not evaluated'

          if (crowdingConfirmed && crowdingDirection !== 'NEUTRAL' && !dataUnavailable && stabilityOk) {
            try {
              // Fetch 15m candles (last 2 for close-to-close return)
              const candleCoin = parsedCoin

              const candles15m = await fetchCandleSnapshot({
                coin: candleCoin,
                interval: '15m',
                startTime: now - 90 * 60 * 1000, // 90 min
                endTime: now,
                signal: abort.signal,
              })
              
              const candles1h = await fetchCandleSnapshot({
                coin: candleCoin,
                interval: '1h',
                startTime: now - 4 * 60 * 60 * 1000, // 4 hours
                endTime: now,
                signal: abort.signal,
              })

              if (candles15m.length >= 2) {
                const prev = candles15m[candles15m.length - 2]
                const curr = candles15m[candles15m.length - 1]
                if (prev.close > 0) {
                  return15m = (curr.close - prev.close) / prev.close
                }
              }

              if (candles1h.length >= 2) {
                const prev = candles1h[candles1h.length - 2]
                const curr = candles1h[candles1h.length - 1]
                if (prev.close > 0) {
                  return1h = (curr.close - prev.close) / prev.close
                }
              }

              candlesAvailable = return15m != null || return1h != null

              if (candlesAvailable) {
                const s = computeStructure({
                  crowdingDirection: crowdingDirection as 'LONG' | 'SHORT',
                  return15m,
                  return1h,
                })
                structure = s.state
                structureRuleUsed = s.ruleUsed
                structureReason = s.reason
              } else {
                structureReason = 'No candle data available'
              }
            } catch {
              structureReason = 'candleSnapshot unavailable'
            }
          } else if (!crowdingConfirmed) {
            structureReason = 'Not crowded (structure not evaluated)'
          }

          // ─────────────────────────────────────────────────────────────────
          // Pillar 3: Liquidity (absolute thresholds)
          // ─────────────────────────────────────────────────────────────────
          let liquidityRaw = false
          let liquiditySource: 'impactPxs' | 'l2Book' | 'none' = 'none'
          let impactCostBps: number | null = null
          let spreadBps: number | null = null
          let depthNotional: number | null = null
          let pillar3Reason = ''

          if (!dataUnavailable && stabilityOk) {
            // Try impact cost first
            const impactCostPct = computeImpactCostPct({ impactPxsRaw: ctx?.impactPxsRaw, markPx })
            if (impactCostPct != null) {
              liquiditySource = 'impactPxs'
              impactCostBps = impactCostPct * 10_000
              liquidityRaw = impactCostBps >= IMPACT_BPS_THRESHOLD
              pillar3Reason = liquidityRaw
                ? `fragile (impactCost ${impactCostBps.toFixed(1)} bps >= ${IMPACT_BPS_THRESHOLD} bps)`
                : `ok (impactCost ${impactCostBps.toFixed(1)} bps < ${IMPACT_BPS_THRESHOLD} bps)`
            } else {
              // Fallback to l2Book
              try {
                const l2 = await fetchL2BookSnapshot({ coin: requestedTicker, signal: abort.signal })
                if (l2.spreadPct != null) {
                  liquiditySource = 'l2Book'
                  spreadBps = l2.spreadPct * 10_000
                  depthNotional = l2.depthNotionalNearMid

                  const spreadFragile = spreadBps >= SPREAD_BPS_THRESHOLD
                  const depthFragile = depthNotional != null && depthNotional < DEPTH_MIN_NOTIONAL
                  liquidityRaw = spreadFragile && depthFragile

                  pillar3Reason = liquidityRaw
                    ? `fragile (spread ${spreadBps.toFixed(1)} bps >= ${SPREAD_BPS_THRESHOLD} AND depth ${formatUsdCompact(depthNotional)} < ${formatUsdCompact(DEPTH_MIN_NOTIONAL)})`
                    : `ok (spread=${spreadBps.toFixed(1)} bps, depth=${formatUsdCompact(depthNotional)})`
                } else {
                  pillar3Reason = 'l2Book missing spread data'
                }
              } catch {
                pillar3Reason = 'l2Book unavailable'
              }
            }
          } else {
            pillar3Reason = dataUnavailable ? 'data unavailable' : 'universe filter failed'
          }

          // Liquidity confirmation (2 consecutive)
          if (liquidityRaw) {
            if (mem.lastLiquidityRaw) {
              mem.liquidityConfirmCount = Math.min(mem.liquidityConfirmCount + 1, confirmRequired)
            } else {
              mem.liquidityConfirmCount = 1
            }
          } else {
            mem.liquidityConfirmCount = 0
          }
          mem.lastLiquidityRaw = liquidityRaw
          const liquidityConfirmed = mem.liquidityConfirmCount >= confirmRequired

          // ─────────────────────────────────────────────────────────────────
          // Final state logic
          // ─────────────────────────────────────────────────────────────────
          let computed: RiskState = 'GREEN'
          let finalRuleMatched = ''

          if (dataUnavailable) {
            computed = 'UNSUPPORTED'
            finalRuleMatched = 'GRAY: data unavailable'
          } else if (!stabilityOk) {
            computed = 'UNSUPPORTED'
            finalRuleMatched = 'GRAY: universeEligible=false'
          } else if (!crowdingConfirmed) {
            computed = 'GREEN'
            finalRuleMatched = 'GREEN: crowdingConfirmed=false'
          } else if (structure === 'INTACT') {
            computed = 'GREEN'
            finalRuleMatched = 'GREEN: structure=INTACT'
          } else if (structure === 'WEAKENING' && !liquidityConfirmed) {
            computed = 'ORANGE'
            finalRuleMatched = 'ORANGE: crowdingConfirmed=true & structure=WEAKENING & liquidityFragile=false'
          } else if (structure === 'BROKEN' && liquidityConfirmed) {
            computed = 'RED'
            finalRuleMatched = 'RED: crowdingConfirmed=true & structure=BROKEN & liquidityFragileConfirmed=true'
          } else if (structure === 'WEAKENING' && liquidityConfirmed) {
            computed = 'ORANGE'
            finalRuleMatched = 'ORANGE: crowdingConfirmed=true & structure=WEAKENING & liquidityFragile=true'
          } else if (structure === 'BROKEN' && !liquidityConfirmed) {
            computed = 'ORANGE'
            finalRuleMatched = 'ORANGE: crowdingConfirmed=true & structure=BROKEN & liquidityFragile=false'
          } else if (structure == null && crowdingConfirmed) {
            // Structure unavailable but crowding confirmed - stay GREEN (fail safe)
            computed = 'GREEN'
            finalRuleMatched = 'GREEN: structure unavailable (fail safe)'
          } else {
            computed = 'GREEN'
            finalRuleMatched = 'GREEN: default'
          }

          // Cooldowns
          const cooldownBase = mem.lastState
          const elapsed = cooldownBase ? now - cooldownBase.enteredAt : 0
          const orangeRemaining = cooldownBase?.state === 'ORANGE' ? Math.max(0, COOL_DOWN_ORANGE_MS - elapsed) : 0
          const redRemaining = cooldownBase?.state === 'RED' ? Math.max(0, COOL_DOWN_RED_MS - elapsed) : 0

          const effective = canDowngradeState({ current: cooldownBase, next: computed, now }) ? computed : cooldownBase?.state ?? computed
          const stateBlocked = effective !== computed
          const blockedReason = stateBlocked ? 'cooldown active (downgrade blocked)' : null

          if (!mem.lastState || mem.lastState.state !== effective) {
            mem.lastState = { state: effective, enteredAt: now }
          }

          // Debug reason
          const debugReason =
            effective === 'UNSUPPORTED'
              ? dataUnavailable ? 'Data unavailable' : 'Universe filter failed'
              : effective === 'GREEN'
                ? 'Crowding=false OR structure intact'
                : effective === 'ORANGE'
                  ? 'Crowding=true + structure weakening/broken + liquidity ok/fragile'
                  : effective === 'RED'
                    ? 'Crowding=true + structure broken + liquidity fragile (confirmed)'
                    : 'Unknown'

          // Build debug object
          const dbgBase: Omit<RiskDotDebug, 'tooltipText'> = {
            state: effective,
            reason: debugReason,
            updatedAt: now,
            request: {
              requestedTicker,
              parsedDex,
              parsedCoin,
              metaAndAssetCtxsPayload: { type: 'metaAndAssetCtxs', dex: parsedDex },
              assetCtxFound: assetFound,
              assetCtxIndex: assetFound ? assetIndex : null,
            },
            universe: {
              dayNtlVlm,
              minVolume: STABILITY_DAY_NTL_VLM_MIN,
              openInterest,
              minOI: STABILITY_OPEN_INTEREST_MIN,
              passDayNtlVlm,
              passOpenInterest,
              eligible: stabilityOk && !dataUnavailable,
              failedChecks,
              disabledBecause: dataUnavailable ? 'data unavailable' : (failedChecks.join(', ') || null),
            },
            pillar1: {
              skipped: dataUnavailable || !stabilityOk,
              funding,
              funding_z,
              funding_z_th: FUNDING_Z_THRESHOLD,
              fundingHistorySamples,
              fundingHistoryLookback: '24h',
              isAtOiCap,
              oiCapAvailable,
              direction: crowdingDirection === 'LONG' ? 'LONG_CROWDED' : crowdingDirection === 'SHORT' ? 'SHORT_CROWDED' : 'NEUTRAL',
              crowdingRaw,
              crowdingConfirmed,
              confirmCounter: mem.crowdingConfirmCount,
              confirmRequired,
              reason: pillar1Reason,
            },
            pillar2: {
              skipped: !crowdingConfirmed || dataUnavailable || !stabilityOk,
              markNow: markPx,
              return15m,
              return1h,
              return15m_th_weakening: STRUCTURE_WEAKENING_THRESHOLD,
              return15m_th_broken: STRUCTURE_BROKEN_15M_THRESHOLD,
              return1h_th_broken: STRUCTURE_BROKEN_1H_THRESHOLD,
              candlesAvailable,
              directionUsed: crowdingDirection === 'LONG' ? 'LONG_CROWDED' : crowdingDirection === 'SHORT' ? 'SHORT_CROWDED' : 'NEUTRAL',
              structureState: structure ?? 'N/A',
              ruleUsed: structureRuleUsed,
              reason: structureReason,
            },
            pillar3: {
              skipped: dataUnavailable || !stabilityOk,
              source: liquiditySource,
              impactCostBps,
              impactCostBps_th: IMPACT_BPS_THRESHOLD,
              spreadBps,
              spreadBps_th: SPREAD_BPS_THRESHOLD,
              depthNotional,
              depthNotional_th: DEPTH_MIN_NOTIONAL,
              liquidityFragileRaw: liquidityRaw,
              liquidityFragileConfirmed: liquidityConfirmed,
              confirmCounter: mem.liquidityConfirmCount,
              confirmRequired,
              reason: pillar3Reason,
            },
            antiFlip: {
              confirmationRequired: confirmRequired,
              crowdingConfirm: { n: mem.crowdingConfirmCount, required: confirmRequired },
              liquidityConfirm: { n: mem.liquidityConfirmCount, required: confirmRequired },
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
              universeEligible: stabilityOk && !dataUnavailable,
              crowdingConfirmed,
              structureState: structure ?? 'N/A',
              liquidityFragileConfirmed: liquidityConfirmed,
              computedState: computed,
              effectiveState: effective,
              ruleMatched: finalRuleMatched,
            },
          }

          const debug: RiskDotDebug = { ...dbgBase, tooltipText: buildTooltipText({ coin: requestedTicker, debug: dbgBase }) }

          nextRisk[requestedTicker] = {
            coin: requestedTicker,
            state: effective,
            message: MSG[effective],
            dotColor: DOT_COLORS[effective],
            funding,
            openInterest,
            dayNtlVlm,
            markPx,
            debug,
          }
        }

        if (isMounted) {
          setRiskByCoin(nextRisk)
        }
        lastSuccessAtRef.current = now
      } catch {
        // fail silently - keep previous state
      }
    }

    // Immediate + interval (15s)
    void tick()
    const id = window.setInterval(() => void tick(), 15_000)

    // Stale data check (60s)
    const staleId = window.setInterval(() => {
      const now = safeNow()
      const lastOk = lastSuccessAtRef.current
      if (lastOk > 0 && now - lastOk > 60_000) {
        setRiskByCoin((prev) => {
          const next: Record<string, RiskPerCoin> = { ...prev }
          for (const coin of coins) {
            const i = coin.indexOf(':')
            const parsedDex = i > 0 ? coin.slice(0, i) : ''
            const parsedCoin = i > 0 ? coin.slice(i + 1) : coin
            const dbgBase: Omit<RiskDotDebug, 'tooltipText'> = {
              state: 'UNSUPPORTED',
              reason: 'Risk data stale (>60s)',
              updatedAt: lastOk,
              request: {
                requestedTicker: coin,
                parsedDex,
                parsedCoin,
                metaAndAssetCtxsPayload: { type: 'metaAndAssetCtxs', dex: parsedDex },
                assetCtxFound: false,
                assetCtxIndex: null,
              },
              universe: {
                dayNtlVlm: null,
                minVolume: STABILITY_DAY_NTL_VLM_MIN,
                openInterest: null,
                minOI: STABILITY_OPEN_INTEREST_MIN,
                passDayNtlVlm: false,
                passOpenInterest: false,
                eligible: false,
                failedChecks: ['data stale'],
                disabledBecause: 'data stale (>60s)',
              },
              pillar1: {
                skipped: true,
                funding: null,
                funding_z: null,
                funding_z_th: FUNDING_Z_THRESHOLD,
                fundingHistorySamples: 0,
                fundingHistoryLookback: '24h',
                isAtOiCap: false,
                oiCapAvailable: false,
                direction: 'NEUTRAL',
                crowdingRaw: false,
                crowdingConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data stale)',
              },
              pillar2: {
                skipped: true,
                markNow: null,
                return15m: null,
                return1h: null,
                return15m_th_weakening: STRUCTURE_WEAKENING_THRESHOLD,
                return15m_th_broken: STRUCTURE_BROKEN_15M_THRESHOLD,
                return1h_th_broken: STRUCTURE_BROKEN_1H_THRESHOLD,
                candlesAvailable: false,
                directionUsed: 'NEUTRAL',
                structureState: 'N/A',
                ruleUsed: 'N/A',
                reason: 'SKIPPED (data stale)',
              },
              pillar3: {
                skipped: true,
                source: 'none',
                impactCostBps: null,
                impactCostBps_th: IMPACT_BPS_THRESHOLD,
                spreadBps: null,
                spreadBps_th: SPREAD_BPS_THRESHOLD,
                depthNotional: null,
                depthNotional_th: DEPTH_MIN_NOTIONAL,
                liquidityFragileRaw: false,
                liquidityFragileConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data stale)',
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
                ruleMatched: 'GRAY: data stale',
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
