import React, { useEffect, useMemo, useState } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useIncognito } from '../contexts/IncognitoContext'
import { useData } from '../contexts/DataContext'
import { useApiKeys } from '../contexts/ApiKeysContext'
import { formatMoney, formatNumber } from '../lib/currency'
import type { PerpetualsOpenPosition, PerpetualsOpenOrder } from './NetWorth'
import { useHyperliquidAssetCtx } from '../hooks/valuation/useHyperliquidAssetCtx'
import { useHyperliquidWsPositions } from '../hooks/valuation/useHyperliquidWsPositions'
import { useHyperliquidCrashRisk, type RiskState } from '../hooks/valuation/useHyperliquidCrashRisk'
import RiskIndicatorPopup from '../components/RiskIndicatorPopup'

// Helper component: SectionCard
interface SectionCardProps {
  title: string
  titleRight?: React.ReactNode
  children: React.ReactNode
}

function SectionCard({ title, titleRight, children }: SectionCardProps) {
  return (
    <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <div className="flex items-center justify-between gap-3">
          <Heading level={2}>{title}</Heading>
          {titleRight ? <div className="text-xs text-text-muted whitespace-nowrap">{titleRight}</div> : null}
        </div>
      </div>
      {children}
    </div>
  )
}

// PnL Box Component
interface PnLBoxProps {
  title: string
  value: number | null
}

function PnLBox({ title, value }: PnLBoxProps) {
  const { isIncognito } = useIncognito()
  const formatCurrency = (val: number) => formatMoney(val, 'USD', 'us', { incognito: isIncognito })
  
  if (value === null) {
    return (
      <div className="bg-bg-surface-2 border border-border-subtle rounded-card p-4">
        <div className="text-text-muted text-xs md:text-sm mb-2">{title}</div>
        <div className="text-text-muted text-lg font-medium">N/A</div>
      </div>
    )
  }
  
  const isPositive = value >= 0

  return (
    <div className="bg-bg-surface-2 border border-border-subtle rounded-card p-4">
      <div className="text-text-muted text-xs md:text-sm mb-2">{title}</div>
      <TotalText variant={isPositive ? 'inflow' : 'outflow'} className="block">
        {formatCurrency(value)}
      </TotalText>
    </div>
  )
}

// Position row data interface
interface PositionRow {
  id: string
  token: string
  side: 'Long' | 'Short'
  sideRaw: 'LONG' | 'SHORT' | null
  leverage: string
  pnl: number
  pnlPercent: number | null
  size: number
  markPx: number | null
  amount: string // Token amount (e.g., "0.0335 ETH")
  entryPrice: number | null // Entry price
  liqPrice: number | null // Liquidation price
  fundingFee: number | null // Funding fee in USD
  fundingRate: number | null // raw funding rate from metaAndAssetCtxs (fraction)
  openInterest: number | null // open interest from metaAndAssetCtxs
}

// Open Order row data interface
interface OpenOrderRow {
  token: string
  type: string
  side: 'Buy' | 'Sell'
  price: number // limit/execution price
  triggerPx: number | null // trigger price for stop/TP orders
  size: number
  amount: string
}

function Hyperliquid() {
  const { isIncognito } = useIncognito()
  const { data } = useData()
  const { hyperliquidWalletAddress } = useApiKeys()
  const { positions: hlWsPositions, status: hlWsStatus, error: hlWsError } = useHyperliquidWsPositions({
    walletAddress: hyperliquidWalletAddress,
    dex: null, // default dex (future-proof: allow multiple dex clients later)
  })
  const formatCurrency = (val: number) => formatMoney(val, 'USD', 'us', { incognito: isIncognito })

  // Column widths - easily adjustable per column
  const positionsColumnWidths = ['100px', '100px', '100px', '100px', '100px', '100px', '100px', '100px', '100px', '120px', '140px']
  const openOrdersColumnWidths = ['100px', '100px', '120px', '100px', '100px', '100px']

  // Base positions from net worth snapshot (fallback if WS not connected)
  const basePositions: PerpetualsOpenPosition[] = useMemo(() => {
    const hyperliquidItem = data.netWorthItems.find(
      (item) => item.category === 'Perpetuals' && item.platform === 'Hyperliquid'
    )
    return Array.isArray(hyperliquidItem?.perpetualsData?.openPositions) ? hyperliquidItem!.perpetualsData!.openPositions : []
  }, [data.netWorthItems])

  // Replace Hyperliquid positions with WS stream (positions table only)
  const mergedPositions: PerpetualsOpenPosition[] = useMemo(() => {
    // WS is positions-only. Overlay WS onto REST by id.
    const restById = new Map<string, PerpetualsOpenPosition>()
    for (const p of basePositions) restById.set(p.id, p)

    if (hlWsPositions.length === 0) {
      return basePositions
    }

    const merged: PerpetualsOpenPosition[] = []
    for (const p of hlWsPositions) {
      const rest = restById.get(p.id)
      merged.push({
        ...rest,
        ...p,
      } as PerpetualsOpenPosition)
    }
    return merged
  }, [hlWsPositions, basePositions])

  // Subscribe to active asset contexts for mark prices
  const assetCtxCoins = useMemo(() => {
    const unique = new Set<string>()
    for (const p of mergedPositions) {
      if (p?.ticker) unique.add(p.ticker)
    }
    return Array.from(unique).sort()
  }, [mergedPositions])

  const { markPrices } = useHyperliquidAssetCtx({
    walletAddress: hyperliquidWalletAddress,
    coins: assetCtxCoins,
  })

  // Public market data + 3-pillar risk indicator (metaAndAssetCtxs + l2Book fallback)
  const { riskByCoin } = useHyperliquidCrashRisk({ coins: assetCtxCoins })

  function formatCompactNumber(value: number): string {
    const abs = Math.abs(value)
    const sign = value < 0 ? '-' : ''
    const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')
    if (abs >= 1_000_000_000) return `${sign}${fmt(abs / 1_000_000_000)}B`
    if (abs >= 1_000_000) return `${sign}${fmt(abs / 1_000_000)}M`
    if (abs >= 1_000) return `${sign}${fmt(abs / 1_000)}K`
    return `${sign}${fmt(abs)}`
  }

  function formatFundingPct(fundingRaw: number): string {
    const pct = fundingRaw * 100
    const sign = pct > 0 ? '+' : ''
    return `${sign}${pct.toFixed(4)}%`
  }

  // Extract PnL values from Hyperliquid portfolio data
  const portfolioPnL = useMemo(() => {
    const hyperliquidItem = data.netWorthItems.find(
      item => item.category === 'Perpetuals' && item.platform === 'Hyperliquid'
    )

    const result = hyperliquidItem?.perpetualsData?.portfolioPnL || {
      pnl24hUsd: null,
      pnl7dUsd: null,
      pnl30dUsd: null,
      pnl90dUsd: null,
    }
    return result
  }, [data.netWorthItems])

  // Extract open positions from all perpetuals items
  const positions: PositionRow[] = useMemo(() => {
    // Map to PositionRow format
    return mergedPositions.map((pos) => {
      const sideRaw: 'LONG' | 'SHORT' | null =
        pos.positionSide === 'LONG' ? 'LONG' : pos.positionSide === 'SHORT' ? 'SHORT' : null

      const side = sideRaw === 'LONG' ? 'Long' : sideRaw === 'SHORT' ? 'Short' : 'Long'
      const leverageStr = pos.leverage !== null && pos.leverage !== undefined 
        ? `${Math.round(pos.leverage)}x` 
        : '1x'
      
      // Use official Hyperliquid positionValue for full notional size (USD)
      const sizeUsd =
        pos.positionValue !== null && pos.positionValue !== undefined
          ? Math.abs(Number(pos.positionValue))
          : 0
      // Use official Hyperliquid returnOnEquity instead of manual (pnl/margin) calculation
      const pnlPercent =
        pos.returnOnEquity !== null && pos.returnOnEquity !== undefined
          ? Number(pos.returnOnEquity) * 100
          : null

      const markPx =
        (pos.ticker ? markPrices[pos.ticker] : undefined) ??
        (pos.ticker ? markPrices[pos.ticker.toUpperCase()] : undefined) ??
        (pos.ticker ? markPrices[pos.ticker.toLowerCase()] : undefined) ??
        null

      // Format token amount
      let amountStr = '-'
      if (pos.amountToken !== null && pos.amountToken !== undefined && pos.amountToken > 0) {
        // Format with appropriate decimals (up to 8 for crypto, but remove trailing zeros)
        const formatted = pos.amountToken.toFixed(8).replace(/\.?0+$/, '')
        amountStr = formatted
      }

      return {
        id: pos.id,
        token: pos.ticker,
        side: side,
        sideRaw,
        leverage: leverageStr,
        pnl: pos.pnl,
        pnlPercent: pnlPercent,
        size: sizeUsd,
        markPx,
        amount: amountStr,
        entryPrice: pos.entryPrice ?? null,
        liqPrice: pos.liquidationPrice ?? null,
        fundingFee: pos.fundingFeeUsd ?? null,
        fundingRate: (pos.ticker ? (riskByCoin[pos.ticker]?.funding ?? riskByCoin[pos.ticker.toUpperCase()]?.funding ?? null) : null),
        openInterest: (pos.ticker ? (riskByCoin[pos.ticker]?.openInterest ?? riskByCoin[pos.ticker.toUpperCase()]?.openInterest ?? null) : null),
      }
    })
  }, [mergedPositions, markPrices, riskByCoin])

  // Profit reminder milestones (fire once per position, reset on close)
  const [profitFired, setProfitFired] = useState<Record<string, { m5: boolean; m10: boolean }>>({})
  const [openDebugId, setOpenDebugId] = useState<string | null>(null)

  useEffect(() => {
    const currentIds = new Set(positions.map((p) => p.id))
    setProfitFired((prev) => {
      let changed = false
      const next: Record<string, { m5: boolean; m10: boolean }> = {}

      // prune closed positions
      for (const [id, v] of Object.entries(prev)) {
        if (currentIds.has(id)) next[id] = v
        else changed = true
      }

      for (const p of positions) {
        const existing = next[p.id] ?? { m5: false, m10: false }
        let updated = existing

        if (p.pnlPercent >= 5 && !existing.m5) {
          updated = { ...updated, m5: true }
          changed = true
        }
        if (p.pnlPercent >= 10 && !existing.m10) {
          updated = { ...updated, m10: true }
          changed = true
        }

        next[p.id] = updated
      }

      return changed ? next : prev
    })
  }, [positions])

  const dashboardEntries = useMemo(() => {
    const entries = positions.map((p) => {
      const risk = riskByCoin[p.token] ?? riskByCoin[p.token.toUpperCase()] ?? null
      const riskState: RiskState = risk?.state ?? 'UNSUPPORTED'
      const riskMessage: string = risk?.message ?? 'Market too unstable for reliable risk signals.'
      const dotColor: string | null = risk?.dotColor ?? '#A0AEC0'
      const debug = risk?.debug ?? null

      const fired = profitFired[p.id]
      let profitReminder: string | null = null
      if (fired?.m10) profitReminder = 'You’re up ~10%. Consider trailing your stop to lock in profits.'
      else if (fired?.m5) profitReminder = 'You’re up ~5%. Consider moving your stop to break-even.'

      if (profitReminder && riskState === 'RED') {
        profitReminder = 'You’re in profit, but risk is high. Protect gains now.'
      }

      return {
        id: p.id,
        token: p.token,
        riskState,
        riskMessage,
        dotColor,
        debug,
        profitReminder,
      }
    })

    const rank: Record<RiskState, number> = { RED: 0, ORANGE: 1, GREEN: 2, UNSUPPORTED: 3 }
    entries.sort((a, b) => (rank[a.riskState] ?? 9) - (rank[b.riskState] ?? 9))
    return entries
  }, [positions, riskByCoin, profitFired])

  // Extract open orders from all perpetuals items
  const openOrders: OpenOrderRow[] = useMemo(() => {
    const hyperliquidItem = data.netWorthItems.find(
      item => item.category === 'Perpetuals' && item.platform === 'Hyperliquid'
    )
    const allOpenOrders: PerpetualsOpenOrder[] = Array.isArray(hyperliquidItem?.perpetualsData?.openOrders)
      ? hyperliquidItem!.perpetualsData!.openOrders
      : []

    // Map to OpenOrderRow format
    return allOpenOrders.map((order) => {
      // Format token amount (no token name, just number)
      let amountStr = '-'
      if (order.amount !== null && order.amount !== undefined && order.amount > 0) {
        // Format with appropriate decimals (up to 8 for crypto, but remove trailing zeros)
        const formatted = order.amount.toFixed(8).replace(/\.?0+$/, '')
        amountStr = formatted
      }

      return {
        token: order.token,
        type: order.type,
        side: order.side,
        price: order.price,
        triggerPx: order.triggerPx,
        size: order.size,
        amount: amountStr,
      }
    })
  }, [data.netWorthItems])

  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Hyperliquid</Heading>

        {/* Performance Frame */}
        <SectionCard title="Performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PnLBox title="24-Hour PnL" value={portfolioPnL.pnl24hUsd} />
            <PnLBox title="7-Day PnL" value={portfolioPnL.pnl7dUsd} />
            <PnLBox title="30-Day PnL" value={portfolioPnL.pnl30dUsd} />
            <PnLBox title="90-Day PnL" value={portfolioPnL.pnl90dUsd} />
          </div>
        </SectionCard>

        {/* Dashboard Frame */}
        <SectionCard title="Dashboard">
          {dashboardEntries.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text2 text-text-muted">No positions</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {dashboardEntries.map((e) => (
                <div key={e.id} className="bg-bg-surface-2 border border-border-subtle rounded-card p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      type="button"
                      className="w-5 h-5 rounded-full flex-shrink-0 outline-none ring-0 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-frame focus-visible:ring-border-strong cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: e.dotColor ?? '#A0AEC0' }}
                      aria-label={`Risk: ${e.riskState}. Click for details.`}
                      onClick={() => setOpenDebugId((prev) => (prev === e.id ? null : e.id))}
                    />
                    <Heading level={3}>{e.token}</Heading>
                  </div>
                  <div className="space-y-1 pl-8">
                    <div className="text2 text-text-primary">{e.riskMessage}</div>
                    {e.profitReminder ? <div className="text2 text-text-muted">{e.profitReminder}</div> : null}
                  </div>
                  {openDebugId === e.id && e.debug && (
                    <RiskIndicatorPopup
                      token={e.token}
                      debug={e.debug}
                      dotColor={e.dotColor ?? '#A0AEC0'}
                      onClose={() => setOpenDebugId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Positions Frame */}
        <SectionCard
          title="Positions"
          titleRight={
            hlWsStatus === 'error'
              ? `WS: error${hlWsError ? ` (${hlWsError})` : ''}`
              : `WS: ${hlWsStatus}`
          }
        >
          <div className="overflow-x-auto -mx-3 px-3 lg:-mx-6 lg:px-6">
            <table className="w-full" style={{ minWidth: `${positionsColumnWidths.length * 100}px`, tableLayout: 'fixed' }}>
              <colgroup>
                {positionsColumnWidths.map((width, idx) => (
                  <col key={idx} style={idx === positionsColumnWidths.length - 1 ? {} : { width }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Token</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Side</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Leverage</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>PnL</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Size</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Price</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Entry Price</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Liq. Price</Heading>
                  </th>
                  <th className="text-left pb-3 whitespace-nowrap">
                    <Heading level={4}>Funding Fee</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Funding Rate</Heading>
                  </th>
                  <th className="text-left pb-3 whitespace-nowrap">
                    <Heading level={4}>Open Interest</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center">
                      <div className="text2 text-text-muted">No positions</div>
                    </td>
                  </tr>
                ) : (
                  positions.map((position) => {
                    const isLong = position.side === 'Long'
                    const pnlIsPositive = position.pnl >= 0

                    return (
                      <tr key={position.id} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="text2 text-text-primary font-medium">{position.token}</div>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            isLong
                              ? 'bg-success/20 text-success border border-success/30'
                              : 'bg-danger/20 text-danger border border-danger/30'
                          }`}
                        >
                          {position.side}
                        </span>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="text2 text-text-primary">{position.leverage}</div>
                      </td>
                      <td className="py-3 pr-4 text-left whitespace-nowrap">
                        <div className="flex flex-col items-start">
                          <div className="text2" style={{ color: pnlIsPositive ? '#2ECC71' : '#E74C3C' }}>
                            {formatCurrency(position.pnl)}
                          </div>
                          <div className="text2 mt-0.5" style={{ color: pnlIsPositive ? '#2ECC71' : '#E74C3C' }}>
                            {position.pnlPercent !== null
                              ? `${position.pnlPercent >= 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}%`
                              : '-'}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-left whitespace-nowrap">
                        <div className="text2 text-text-primary">{formatCurrency(position.size)}</div>
                      </td>
                      <td className="py-3 pr-4 text-left whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.markPx !== null && position.markPx !== undefined
                            ? `$${formatNumber(position.markPx, 'us', { incognito: isIncognito })}`
                            : '—'}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-left whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.entryPrice !== null && position.entryPrice > 0 
                            ? `$${formatNumber(position.entryPrice, 'us', { incognito: isIncognito })}` 
                            : '-'}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-left whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.liqPrice !== null && position.liqPrice > 0 
                            ? `$${formatNumber(position.liqPrice, 'us', { incognito: isIncognito })}` 
                            : '-'}
                        </div>
                      </td>
                      <td className="py-3 text-left whitespace-nowrap">
                        <div className="text2" style={{ 
                          color: position.fundingFee !== null && position.fundingFee !== 0 
                            ? (position.fundingFee > 0 ? '#2ECC71' : '#E74C3C') 
                            : undefined 
                        }}>
                          {position.fundingFee !== null && position.fundingFee !== 0
                            ? formatCurrency(position.fundingFee)
                            : '-'}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-left whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.fundingRate !== null && position.fundingRate !== undefined ? formatFundingPct(position.fundingRate) : '-'}
                        </div>
                      </td>
                      <td className="py-3 text-left whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.openInterest !== null && position.openInterest !== undefined ? formatCompactNumber(position.openInterest) : '-'}
                        </div>
                      </td>
                    </tr>
                  )
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Open Orders Frame */}
        <SectionCard title="Open Orders">
          <div className="overflow-x-auto -mx-3 px-3 lg:-mx-6 lg:px-6">
            <table className="w-full" style={{ minWidth: `${openOrdersColumnWidths.length * 100}px`, tableLayout: 'fixed' }}>
              <colgroup>
                {openOrdersColumnWidths.map((width, idx) => (
                  <col key={idx} style={idx === openOrdersColumnWidths.length - 1 ? {} : { width }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Token</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Side</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Type</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Price</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Trigger Price</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Size</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {openOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center">
                      <div className="text2 text-text-muted">No open orders</div>
                    </td>
                  </tr>
                ) : (
                  openOrders.map((order, index) => {
                    const isBuy = order.side === 'Buy'

                    return (
                      <tr key={index} className="border-b border-border-subtle last:border-b-0">
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="text2 text-text-primary font-medium">{order.token}</div>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              isBuy
                                ? 'bg-success/20 text-success border border-success/30'
                                : 'bg-danger/20 text-danger border border-danger/30'
                            }`}
                          >
                            {order.side}
                          </span>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="text2 text-text-primary">{order.type}</div>
                        </td>
                        <td className="py-3 pr-4 text-left whitespace-nowrap">
                          <div className="text2 text-text-primary">
                            {order.price > 0
                              ? `$${formatNumber(order.price, 'us', { incognito: isIncognito })}`
                              : '-'}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-left whitespace-nowrap">
                          <div className="text2 text-text-primary">
                            {order.triggerPx !== null
                              ? `$${formatNumber(order.triggerPx, 'us', { incognito: isIncognito })}`
                              : '-'}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-left whitespace-nowrap">
                          <div className="flex flex-col items-start">
                            <div className="text2 text-text-primary">{formatCurrency(order.size)}</div>
                            <div className="text2 mt-0.5 text-text-muted">{order.amount || '-'}</div>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

export default Hyperliquid

