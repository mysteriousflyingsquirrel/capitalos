import React from 'react'
import Heading from './Heading'
import type { RiskDotDebug, RiskState } from '../hooks/valuation/useHyperliquidCrashRisk'

interface RiskIndicatorPopupProps {
  token: string
  debug: RiskDotDebug
  dotColor: string
  onClose: () => void
}

// Human-readable indicator status
interface IndicatorStatus {
  name: string
  active: boolean
  description: string
  details: string
}

function getIndicatorStatuses(debug: RiskDotDebug): IndicatorStatus[] {
  const indicators: IndicatorStatus[] = []

  // Funding Weirdness
  const fundingActive = debug.decisionTrace.activeIndicators.fundingWeirdness
  let fundingDetails = ''
  if (debug.fundingWeirdness.skipped) {
    fundingDetails = 'Skipped (insufficient data)'
  } else if (debug.fundingWeirdness.funding_z !== null) {
    const zScore = Math.abs(debug.fundingWeirdness.funding_z).toFixed(2)
    const threshold = debug.fundingWeirdness.funding_z_th
    fundingDetails = fundingActive
      ? `Funding rate is ${zScore}σ from normal (threshold: ${threshold}σ)`
      : `Funding rate is ${zScore}σ from normal (within ${threshold}σ threshold)`
  } else {
    fundingDetails = 'Unable to calculate (not enough historical data)'
  }

  indicators.push({
    name: 'Leverage Imbalance',
    active: fundingActive,
    description: 'Detects when too many traders are positioned on the same side of the market.',
    details: fundingDetails,
  })

  // OI Cap Hit
  const oiCapActive = debug.decisionTrace.activeIndicators.oiCapHit
  let oiCapDetails = ''
  if (debug.oiCapHit.skipped) {
    oiCapDetails = 'Skipped (insufficient data)'
  } else if (!debug.oiCapHit.oiCapAvailable) {
    oiCapDetails = 'OI cap data unavailable'
  } else {
    oiCapDetails = oiCapActive
      ? 'Market has reached maximum open interest - no new positions can be opened'
      : 'Market is below open interest cap - positions can be opened normally'
  }

  indicators.push({
    name: 'Position Limit Reached',
    active: oiCapActive,
    description: 'Detects when the market hits its maximum leverage capacity.',
    details: oiCapDetails,
  })

  // Liquidity Stress
  const liquidityActive = debug.decisionTrace.activeIndicators.liquidityStress
  let liquidityDetails = ''
  if (debug.liquidityStress.skipped) {
    liquidityDetails = 'Skipped (insufficient data)'
  } else if (debug.liquidityStress.source === 'impactPxs') {
    const impactBps = debug.liquidityStress.impactCostBps?.toFixed(1) ?? '–'
    const threshold = debug.liquidityStress.impactCostBps_th
    liquidityDetails = liquidityActive
      ? `Trade impact cost is ${impactBps} bps (exceeds ${threshold} bps threshold)`
      : `Trade impact cost is ${impactBps} bps (within ${threshold} bps threshold)`
  } else if (debug.liquidityStress.source === 'l2Book') {
    const spreadBps = debug.liquidityStress.spreadBps?.toFixed(1) ?? '–'
    const depthK = debug.liquidityStress.depthNotional
      ? `$${(debug.liquidityStress.depthNotional / 1000).toFixed(0)}K`
      : '–'
    liquidityDetails = liquidityActive
      ? `Order book is thin: spread ${spreadBps} bps, depth ${depthK}`
      : `Order book is healthy: spread ${spreadBps} bps, depth ${depthK}`
  } else {
    liquidityDetails = 'Liquidity data unavailable'
  }

  indicators.push({
    name: 'Low Liquidity',
    active: liquidityActive,
    description: 'Detects when the order book is thin and trades may cause significant slippage.',
    details: liquidityDetails,
  })

  return indicators
}

function getRiskStateInfo(state: RiskState, activeCount: number): { title: string; description: string; bgClass: string } {
  switch (state) {
    case 'GREEN':
      return {
        title: 'All Clear',
        description: 'Market conditions are normal. No warning signs detected.',
        bgClass: 'bg-success/10 border-success/30',
      }
    case 'ORANGE':
      return {
        title: 'Caution Advised',
        description: `${activeCount} risk signal${activeCount > 1 ? 's' : ''} active. Consider tightening stops or reducing position size.`,
        bgClass: 'bg-warning/10 border-warning/30',
      }
    case 'RED':
      return {
        title: 'High Risk',
        description: 'All risk signals are active. Consider exiting or using very tight stop losses.',
        bgClass: 'bg-danger/10 border-danger/30',
      }
    case 'UNSUPPORTED':
    default:
      return {
        title: 'Insufficient Data',
        description: 'This market has insufficient volume or data for reliable risk analysis.',
        bgClass: 'bg-text-muted/10 border-text-muted/30',
      }
  }
}

function RiskIndicatorPopup({ token, debug, dotColor, onClose }: RiskIndicatorPopupProps) {
  const indicators = getIndicatorStatuses(debug)
  const stateInfo = getRiskStateInfo(debug.state, debug.decisionTrace.activeCount)

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-bg-surface-1 border border-border-strong rounded-card shadow-card p-5 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            <Heading level={3}>{token} Risk Analysis</Heading>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-bg-surface-2 rounded-input transition-colors text-text-secondary hover:text-text-primary"
            title="Close"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Overall Status */}
        <div className={`rounded-card border p-4 mb-4 ${stateInfo.bgClass}`}>
          <div className="font-semibold text-text-primary mb-1">{stateInfo.title}</div>
          <div className="text-sm text-text-secondary">{stateInfo.description}</div>
        </div>

        {/* Indicators */}
        <div className="space-y-3">
          <div className="text-xs text-text-muted uppercase tracking-wide font-medium">Risk Indicators</div>
          {indicators.map((indicator) => (
            <div
              key={indicator.name}
              className="bg-bg-surface-2 border border-border-subtle rounded-card p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    indicator.active ? 'bg-danger' : 'bg-success'
                  }`}
                />
                <span className="font-medium text-sm text-text-primary">{indicator.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    indicator.active
                      ? 'bg-danger/20 text-danger'
                      : 'bg-success/20 text-success'
                  }`}
                >
                  {indicator.active ? 'Active' : 'Normal'}
                </span>
              </div>
              <div className="text-xs text-text-muted mb-1">{indicator.description}</div>
              <div className="text-xs text-text-secondary">{indicator.details}</div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-4 pt-3 border-t border-border-subtle">
          <div className="text-xs text-text-muted">
            Risk signals require 2 consecutive readings to activate and have cooldown periods to prevent false alarms.
          </div>
        </div>
      </div>
    </div>
  )
}

export default RiskIndicatorPopup
