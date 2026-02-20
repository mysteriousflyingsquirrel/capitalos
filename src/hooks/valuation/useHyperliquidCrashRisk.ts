import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeImpactCostPct,
  extractSymbol,
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
  fundingWeirdness: {
    skipped: boolean
    funding: number | null
    funding_z: number | null
    funding_z_th: number
    fundingHistorySamples: number
    fundingHistoryLookback: string
    indicatorRaw: boolean
    indicatorConfirmed: boolean
    confirmCounter: number
    confirmRequired: number
    reason: string
  }
  oiCapHit: {
    skipped: boolean
    isAtOiCap: boolean
    oiCapAvailable: boolean
    indicatorRaw: boolean
    indicatorConfirmed: boolean
    confirmCounter: number
    confirmRequired: number
    reason: string
  }
  liquidityStress: {
    skipped: boolean
    source: 'impactPxs' | 'l2Book' | 'none'
    impactCostBps: number | null
    impactCostBps_th: number
    spreadBps: number | null
    spreadBps_th: number
    depthNotional: number | null
    depthNotional_th: number
    indicatorRaw: boolean
    indicatorConfirmed: boolean
    confirmCounter: number
    confirmRequired: number
    reason: string
  }
  antiFlip: {
    confirmationRequired: number
    fundingWeirdnessConfirm: { n: number; required: number }
    oiCapConfirm: { n: number; required: number }
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
    activeIndicators: {
      fundingWeirdness: boolean
      oiCapHit: boolean
      liquidityStress: boolean
    }
    activeCount: number
    computedState: RiskState
    effectiveState: RiskState
    selectedMessage: string
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

// Indicator 1: Funding Weirdness
const FUNDING_Z_THRESHOLD = 1.5
const FUNDING_HISTORY_LOOKBACK_MS = 24 * 60 * 60 * 1000 // 24h

// Indicator 3: Liquidity Stress absolute thresholds
const IMPACT_BPS_THRESHOLD = 25
const SPREAD_BPS_THRESHOLD = 8
const DEPTH_MIN_NOTIONAL = 500_000 // $500k

// Anti-flip cooldowns
const COOL_DOWN_ORANGE_MS = 15 * 60 * 1000
const COOL_DOWN_RED_MS = 30 * 60 * 1000

const DOT_COLORS: Record<RiskState, string> = {
  GREEN: '#2ECC71',
  ORANGE: '#F39C12',
  RED: '#E74C3C',
  UNSUPPORTED: '#A0AEC0',
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Constants
// ─────────────────────────────────────────────────────────────────────────────

const MSG_GREEN = 'Nothing suspicious happening - chill'
const MSG_RED = 'Shit hitting the fan! Leverage is crowded, the market is constrained, and liquidity is thin. Consider exiting with tight SL'
const MSG_UNSUPPORTED = 'Market too unstable for reliable risk signals.'

// Reason fragments for ORANGE message
const REASON_FUNDING_WEIRDNESS = 'leverage positioning is no longer normal. Too many people on one side.'
const REASON_OI_CAP_HIT = 'the market is hitting leverage limits (OI cap). Pressure is building.'
const REASON_LIQUIDITY_STRESS = 'liquidity is thinning. Fast moves can hurt.'

function buildOrangeMessage(reasons: string[]): string {
  if (reasons.length === 0) return MSG_GREEN // fallback
  const combinedReason = reasons.length === 1 ? reasons[0] : `${reasons[0]} and ${reasons[1]}`
  return `Stranger things happening because of ${combinedReason} - Consider De-Risking or SL Adustment`
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
  fundingWeirdnessConfirmCount: number
  oiCapConfirmCount: number
  liquidityConfirmCount: number
  lastFundingWeirdnessRaw: boolean
  lastOiCapRaw: boolean
  lastLiquidityRaw: boolean
  lastState: { state: RiskState; enteredAt: number } | null
}

function getDefaultMemoryState(): CoinMemoryState {
  return {
    fundingWeirdnessConfirmCount: 0,
    oiCapConfirmCount: 0,
    liquidityConfirmCount: 0,
    lastFundingWeirdnessRaw: false,
    lastOiCapRaw: false,
    lastLiquidityRaw: false,
    lastState: null,
  }
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

  lines.push('SECTION 2 — INDICATOR 1: FUNDING WEIRDNESS')
  if (d.fundingWeirdness.skipped) lines.push('SKIPPED (disabled)')
  lines.push('Inputs:')
  lines.push(`- funding (now): ${formatNumber(d.fundingWeirdness.funding, 6)}`)
  lines.push(`- funding_z: ${formatNumber(d.fundingWeirdness.funding_z, 3)}  threshold: ±${d.fundingWeirdness.funding_z_th}`)
  lines.push(`- fundingHistory: ${d.fundingWeirdness.fundingHistorySamples} samples (${d.fundingWeirdness.fundingHistoryLookback})`)
  lines.push('Decision:')
  lines.push(`- indicatorRaw: ${String(d.fundingWeirdness.indicatorRaw)}`)
  lines.push(`- indicatorConfirmed: ${String(d.fundingWeirdness.indicatorConfirmed)}`)
  lines.push(`- confirmCounter: ${d.fundingWeirdness.confirmCounter}/${d.fundingWeirdness.confirmRequired}`)
  lines.push(`Reason: ${d.fundingWeirdness.reason}`)
  lines.push('')

  lines.push('SECTION 3 — INDICATOR 2: OI CAP HIT')
  if (d.oiCapHit.skipped) lines.push('SKIPPED (disabled)')
  lines.push('Inputs:')
  lines.push(`- isAtOiCap: ${String(d.oiCapHit.isAtOiCap)}  (oiCapAvailable: ${String(d.oiCapHit.oiCapAvailable)})`)
  lines.push('Decision:')
  lines.push(`- indicatorRaw: ${String(d.oiCapHit.indicatorRaw)}`)
  lines.push(`- indicatorConfirmed: ${String(d.oiCapHit.indicatorConfirmed)}`)
  lines.push(`- confirmCounter: ${d.oiCapHit.confirmCounter}/${d.oiCapHit.confirmRequired}`)
  lines.push(`Reason: ${d.oiCapHit.reason}`)
  lines.push('')

  lines.push('SECTION 4 — INDICATOR 3: LIQUIDITY STRESS')
  if (d.liquidityStress.skipped) lines.push('SKIPPED (disabled)')
  lines.push(`source: ${d.liquidityStress.source}`)
  if (d.liquidityStress.source === 'impactPxs') {
    lines.push('Inputs (impactPxs path):')
    lines.push(`- impactCost: ${d.liquidityStress.impactCostBps == null ? '–' : `${d.liquidityStress.impactCostBps.toFixed(1)} bps`}  threshold: ${d.liquidityStress.impactCostBps_th} bps`)
  } else if (d.liquidityStress.source === 'l2Book') {
    lines.push('Inputs (l2Book path):')
    lines.push(`- spread: ${d.liquidityStress.spreadBps == null ? '–' : `${d.liquidityStress.spreadBps.toFixed(1)} bps`}  threshold: ${d.liquidityStress.spreadBps_th} bps`)
    lines.push(`- depth(0.2%): ${formatUsdCompact(d.liquidityStress.depthNotional)}  threshold: ${formatUsdCompact(d.liquidityStress.depthNotional_th)}`)
  } else {
    lines.push('Inputs: –')
  }
  lines.push('Decision:')
  lines.push(`- indicatorRaw: ${String(d.liquidityStress.indicatorRaw)}`)
  lines.push(`- indicatorConfirmed: ${String(d.liquidityStress.indicatorConfirmed)}`)
  lines.push(`- confirmCounter: ${d.liquidityStress.confirmCounter}/${d.liquidityStress.confirmRequired}`)
  lines.push(`Reason: ${d.liquidityStress.reason}`)
  lines.push('')

  lines.push('SECTION 5 — CONFIRMATION & COOLDOWN (ANTI-FLIP)')
  lines.push(`- confirmationRequired: ${d.antiFlip.confirmationRequired}`)
  lines.push(`- fundingWeirdnessConfirm: ${d.antiFlip.fundingWeirdnessConfirm.n}/${d.antiFlip.fundingWeirdnessConfirm.required}`)
  lines.push(`- oiCapConfirm: ${d.antiFlip.oiCapConfirm.n}/${d.antiFlip.oiCapConfirm.required}`)
  lines.push(`- liquidityConfirm: ${d.antiFlip.liquidityConfirm.n}/${d.antiFlip.liquidityConfirm.required}`)
  lines.push('- stateCooldown:')
  lines.push(`  - orangeMinHold: 15m, remaining: ${formatMs(d.antiFlip.stateCooldown.orangeRemainingMs)}`)
  lines.push(`  - redMinHold: 30m, remaining: ${formatMs(d.antiFlip.stateCooldown.redRemainingMs)}`)
  lines.push(`- stateChangeBlocked: ${String(d.antiFlip.stateChangeBlocked)}${d.antiFlip.blockedReason ? ` (${d.antiFlip.blockedReason})` : ''}`)
  lines.push('')

  lines.push('SECTION 6 — DECISION TRACE (MAPPING)')
  lines.push(`- universeEligible? ${String(d.decisionTrace.universeEligible)}`)
  lines.push(`- activeIndicators: [fundingWeirdness=${String(d.decisionTrace.activeIndicators.fundingWeirdness)}, oiCapHit=${String(d.decisionTrace.activeIndicators.oiCapHit)}, liquidityStress=${String(d.decisionTrace.activeIndicators.liquidityStress)}]`)
  lines.push(`- activeCount: ${d.decisionTrace.activeCount}`)
  lines.push(`- finalState rule matched: ${d.decisionTrace.ruleMatched}`)
  lines.push(`- selectedMessage: ${d.decisionTrace.selectedMessage}`)

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
          const oiCapAvailable = oiCapByDex[parsedDex] !== undefined
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
          // INDICATOR 1: FUNDING WEIRDNESS (|funding_z| >= threshold)
          // ─────────────────────────────────────────────────────────────────
          let funding_z: number | null = null
          let fundingHistorySamples = 0
          let fundingWeirdnessRaw = false
          let fundingWeirdnessReason = ''

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
              fundingWeirdnessReason = 'fundingHistory unavailable (fail-safe: indicator=false)'
            }

            if (funding_z != null && Math.abs(funding_z) >= FUNDING_Z_THRESHOLD) {
              fundingWeirdnessRaw = true
              fundingWeirdnessReason = `indicator=true (|funding_z|=${Math.abs(funding_z).toFixed(2)} >= ${FUNDING_Z_THRESHOLD})`
            } else if (!fundingWeirdnessReason) {
              if (funding_z == null) {
                fundingWeirdnessReason = 'indicator=false (funding_z unavailable)'
              } else {
                fundingWeirdnessReason = `indicator=false (|funding_z|=${Math.abs(funding_z).toFixed(2)} < ${FUNDING_Z_THRESHOLD})`
              }
            }
          } else {
            fundingWeirdnessReason = dataUnavailable ? 'data unavailable (fail-safe: indicator=false)' : 'universe filter failed (fail-safe: indicator=false)'
          }

          // Funding Weirdness confirmation (2 consecutive)
          if (fundingWeirdnessRaw) {
            if (mem.lastFundingWeirdnessRaw) {
              mem.fundingWeirdnessConfirmCount = Math.min(mem.fundingWeirdnessConfirmCount + 1, confirmRequired)
            } else {
              mem.fundingWeirdnessConfirmCount = 1
            }
          } else {
            mem.fundingWeirdnessConfirmCount = 0
          }
          mem.lastFundingWeirdnessRaw = fundingWeirdnessRaw
          const fundingWeirdnessConfirmed = mem.fundingWeirdnessConfirmCount >= confirmRequired

          // ─────────────────────────────────────────────────────────────────
          // INDICATOR 2: OI CAP HIT (isAtOiCap == true)
          // ─────────────────────────────────────────────────────────────────
          let oiCapRaw = false
          let oiCapReason = ''

          if (!dataUnavailable && stabilityOk) {
            oiCapRaw = isAtOiCap
            oiCapReason = isAtOiCap
              ? 'indicator=true (isAtOiCap=true)'
              : 'indicator=false (isAtOiCap=false)'
          } else {
            oiCapReason = dataUnavailable ? 'data unavailable (fail-safe: indicator=false)' : 'universe filter failed (fail-safe: indicator=false)'
          }

          // OI Cap confirmation (2 consecutive)
          if (oiCapRaw) {
            if (mem.lastOiCapRaw) {
              mem.oiCapConfirmCount = Math.min(mem.oiCapConfirmCount + 1, confirmRequired)
            } else {
              mem.oiCapConfirmCount = 1
            }
          } else {
            mem.oiCapConfirmCount = 0
          }
          mem.lastOiCapRaw = oiCapRaw
          const oiCapConfirmed = mem.oiCapConfirmCount >= confirmRequired

          // ─────────────────────────────────────────────────────────────────
          // INDICATOR 3: LIQUIDITY STRESS (absolute thresholds)
          // ─────────────────────────────────────────────────────────────────
          let liquidityRaw = false
          let liquiditySource: 'impactPxs' | 'l2Book' | 'none' = 'none'
          let impactCostBps: number | null = null
          let spreadBps: number | null = null
          let depthNotional: number | null = null
          let liquidityReason = ''

          if (!dataUnavailable && stabilityOk) {
            // Try impact cost first
            const impactCostPct = computeImpactCostPct({ impactPxsRaw: ctx?.impactPxsRaw, markPx })
            if (impactCostPct != null) {
              liquiditySource = 'impactPxs'
              impactCostBps = impactCostPct * 10_000
              liquidityRaw = impactCostBps >= IMPACT_BPS_THRESHOLD
              liquidityReason = liquidityRaw
                ? `indicator=true (impactCost ${impactCostBps.toFixed(1)} bps >= ${IMPACT_BPS_THRESHOLD} bps)`
                : `indicator=false (impactCost ${impactCostBps.toFixed(1)} bps < ${IMPACT_BPS_THRESHOLD} bps)`
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

                  liquidityReason = liquidityRaw
                    ? `indicator=true (spread ${spreadBps.toFixed(1)} bps >= ${SPREAD_BPS_THRESHOLD} AND depth ${formatUsdCompact(depthNotional)} < ${formatUsdCompact(DEPTH_MIN_NOTIONAL)})`
                    : `indicator=false (spread=${spreadBps.toFixed(1)} bps, depth=${formatUsdCompact(depthNotional)})`
                } else {
                  liquidityReason = 'l2Book missing spread data (fail-safe: indicator=false)'
                }
              } catch {
                liquidityReason = 'l2Book unavailable (fail-safe: indicator=false)'
              }
            }
          } else {
            liquidityReason = dataUnavailable ? 'data unavailable (fail-safe: indicator=false)' : 'universe filter failed (fail-safe: indicator=false)'
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
          // FINAL STATE LOGIC (0/1-2/3 indicators)
          // ─────────────────────────────────────────────────────────────────
          const activeCount = (fundingWeirdnessConfirmed ? 1 : 0) + (oiCapConfirmed ? 1 : 0) + (liquidityConfirmed ? 1 : 0)
          let computed: RiskState = 'GREEN'
          let finalRuleMatched = ''
          let selectedMessage = ''

          if (dataUnavailable) {
            computed = 'UNSUPPORTED'
            finalRuleMatched = 'GRAY: data unavailable'
            selectedMessage = MSG_UNSUPPORTED
          } else if (!stabilityOk) {
            computed = 'UNSUPPORTED'
            finalRuleMatched = 'GRAY: universe filter failed'
            selectedMessage = MSG_UNSUPPORTED
          } else if (activeCount === 0) {
            computed = 'GREEN'
            finalRuleMatched = 'GREEN: no indicators active'
            selectedMessage = MSG_GREEN
          } else if (activeCount === 1 || activeCount === 2) {
            computed = 'ORANGE'
            // Build reasons array in stable order
            const reasons: string[] = []
            if (fundingWeirdnessConfirmed) reasons.push(REASON_FUNDING_WEIRDNESS)
            if (oiCapConfirmed) reasons.push(REASON_OI_CAP_HIT)
            if (liquidityConfirmed) reasons.push(REASON_LIQUIDITY_STRESS)
            selectedMessage = buildOrangeMessage(reasons)
            finalRuleMatched = `ORANGE: ${activeCount} indicator(s) active`
          } else {
            // activeCount === 3
            computed = 'RED'
            finalRuleMatched = 'RED: all 3 indicators active'
            selectedMessage = MSG_RED
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

          // If effective differs from computed due to cooldown, keep the higher-severity message
          let effectiveMessage = selectedMessage
          if (stateBlocked && effective !== computed) {
            // Recompute message for effective state
            if (effective === 'RED') {
              effectiveMessage = MSG_RED
            } else if (effective === 'ORANGE') {
              const reasons: string[] = []
              if (fundingWeirdnessConfirmed) reasons.push(REASON_FUNDING_WEIRDNESS)
              if (oiCapConfirmed) reasons.push(REASON_OI_CAP_HIT)
              if (liquidityConfirmed) reasons.push(REASON_LIQUIDITY_STRESS)
              effectiveMessage = reasons.length > 0 ? buildOrangeMessage(reasons) : selectedMessage
            }
          }

          // Debug reason
          const debugReason =
            effective === 'UNSUPPORTED'
              ? dataUnavailable ? 'Data unavailable' : 'Universe filter failed'
              : effective === 'GREEN'
                ? 'No indicators active'
                : effective === 'ORANGE'
                  ? `${activeCount} indicator(s) active`
                  : effective === 'RED'
                    ? 'All 3 indicators active'
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
            fundingWeirdness: {
              skipped: dataUnavailable || !stabilityOk,
              funding,
              funding_z,
              funding_z_th: FUNDING_Z_THRESHOLD,
              fundingHistorySamples,
              fundingHistoryLookback: '24h',
              indicatorRaw: fundingWeirdnessRaw,
              indicatorConfirmed: fundingWeirdnessConfirmed,
              confirmCounter: mem.fundingWeirdnessConfirmCount,
              confirmRequired,
              reason: fundingWeirdnessReason,
            },
            oiCapHit: {
              skipped: dataUnavailable || !stabilityOk,
              isAtOiCap,
              oiCapAvailable,
              indicatorRaw: oiCapRaw,
              indicatorConfirmed: oiCapConfirmed,
              confirmCounter: mem.oiCapConfirmCount,
              confirmRequired,
              reason: oiCapReason,
            },
            liquidityStress: {
              skipped: dataUnavailable || !stabilityOk,
              source: liquiditySource,
              impactCostBps,
              impactCostBps_th: IMPACT_BPS_THRESHOLD,
              spreadBps,
              spreadBps_th: SPREAD_BPS_THRESHOLD,
              depthNotional,
              depthNotional_th: DEPTH_MIN_NOTIONAL,
              indicatorRaw: liquidityRaw,
              indicatorConfirmed: liquidityConfirmed,
              confirmCounter: mem.liquidityConfirmCount,
              confirmRequired,
              reason: liquidityReason,
            },
            antiFlip: {
              confirmationRequired: confirmRequired,
              fundingWeirdnessConfirm: { n: mem.fundingWeirdnessConfirmCount, required: confirmRequired },
              oiCapConfirm: { n: mem.oiCapConfirmCount, required: confirmRequired },
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
              activeIndicators: {
                fundingWeirdness: fundingWeirdnessConfirmed,
                oiCapHit: oiCapConfirmed,
                liquidityStress: liquidityConfirmed,
              },
              activeCount,
              computedState: computed,
              effectiveState: effective,
              selectedMessage: effectiveMessage,
              ruleMatched: finalRuleMatched,
            },
          }

          const debug: RiskDotDebug = { ...dbgBase, tooltipText: buildTooltipText({ coin: requestedTicker, debug: dbgBase }) }

          nextRisk[requestedTicker] = {
            coin: requestedTicker,
            state: effective,
            message: effectiveMessage,
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
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[useHyperliquidCrashRisk] Update failed:', err)
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
              fundingWeirdness: {
                skipped: true,
                funding: null,
                funding_z: null,
                funding_z_th: FUNDING_Z_THRESHOLD,
                fundingHistorySamples: 0,
                fundingHistoryLookback: '24h',
                indicatorRaw: false,
                indicatorConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data stale)',
              },
              oiCapHit: {
                skipped: true,
                isAtOiCap: false,
                oiCapAvailable: false,
                indicatorRaw: false,
                indicatorConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data stale)',
              },
              liquidityStress: {
                skipped: true,
                source: 'none',
                impactCostBps: null,
                impactCostBps_th: IMPACT_BPS_THRESHOLD,
                spreadBps: null,
                spreadBps_th: SPREAD_BPS_THRESHOLD,
                depthNotional: null,
                depthNotional_th: DEPTH_MIN_NOTIONAL,
                indicatorRaw: false,
                indicatorConfirmed: false,
                confirmCounter: 0,
                confirmRequired: 2,
                reason: 'SKIPPED (data stale)',
              },
              antiFlip: {
                confirmationRequired: 2,
                fundingWeirdnessConfirm: { n: 0, required: 2 },
                oiCapConfirm: { n: 0, required: 2 },
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
                activeIndicators: {
                  fundingWeirdness: false,
                  oiCapHit: false,
                  liquidityStress: false,
                },
                activeCount: 0,
                computedState: 'UNSUPPORTED',
                effectiveState: 'UNSUPPORTED',
                selectedMessage: MSG_UNSUPPORTED,
                ruleMatched: 'GRAY: data stale',
              },
            }
            const debug: RiskDotDebug = { ...dbgBase, tooltipText: buildTooltipText({ coin, debug: dbgBase }) }
            next[coin] = {
              coin,
              state: 'UNSUPPORTED',
              message: MSG_UNSUPPORTED,
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
