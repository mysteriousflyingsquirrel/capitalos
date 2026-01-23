import React, { useMemo } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useIncognito } from '../contexts/IncognitoContext'
import { useData } from '../contexts/DataContext'
import { formatMoney, formatNumber } from '../lib/currency'
import type { PerpetualsOpenOrder, PerpetualsOpenPosition } from './NetWorth'

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
  leverage: string
  pnl: number
  pnlPercent: number
  size: number
  amount: string
  entryPrice: number | null
  liqPrice: number | null
  fundingFee: number | null
}

// Open Order row data interface
interface OpenOrderRow {
  token: string
  activity: string
  side: 'Buy' | 'Sell'
  price: number
  priceDisplay: string
  size: number
  amount: string
}

export default function Mexc() {
  const { isIncognito } = useIncognito()
  const { data, mexcPositionsWs, mexcPositionsWsStatus, mexcPositionsWsError } = useData()
  const formatCurrency = (val: number) => formatMoney(val, 'USD', 'us', { incognito: isIncognito })

  // Column widths - easily adjustable per column
  const positionsColumnWidths = ['100px', '100px', '100px', '100px', '100px', '100px', '100px', '100px', '100px']
  const openOrdersColumnWidths = ['100px', '100px', '100px', '100px', '100px']

  const mexcItem = useMemo(() => {
    return data.netWorthItems.find(item => item.category === 'Perpetuals' && item.platform === 'MEXC') || null
  }, [data.netWorthItems])

  const portfolioPnL = mexcItem?.perpetualsData?.portfolioPnL || {
    pnl24hUsd: null,
    pnl7dUsd: null,
    pnl30dUsd: null,
    pnl90dUsd: null,
  }

  const openOrdersData: PerpetualsOpenOrder[] = Array.isArray(mexcItem?.perpetualsData?.openOrders)
    ? (mexcItem!.perpetualsData!.openOrders as PerpetualsOpenOrder[])
    : []

  const positions: PositionRow[] = useMemo(() => {
    const basePositions: PerpetualsOpenPosition[] = Array.isArray(mexcItem?.perpetualsData?.openPositions)
      ? (mexcItem!.perpetualsData!.openPositions as PerpetualsOpenPosition[])
      : []
    const merged = mexcPositionsWs.length > 0 ? mexcPositionsWs : basePositions

    return merged.map((pos) => {
      const side = pos.positionSide === 'SHORT' ? 'Short' : 'Long'
      const leverageStr = pos.leverage !== null && pos.leverage !== undefined ? `${Math.round(pos.leverage)}x` : '1x'
      const size = pos.margin + pos.pnl
      const pnlPercent = pos.margin !== 0 ? (pos.pnl / pos.margin) * 100 : 0

      // amountToken is contracts/vol for MEXC; render as number
      const amountStr =
        pos.amountToken !== null && pos.amountToken !== undefined && pos.amountToken > 0
          ? pos.amountToken.toFixed(8).replace(/\.?0+$/, '')
          : '-'

      return {
        id: pos.id,
        token: pos.ticker,
        side,
        leverage: leverageStr,
        pnl: pos.pnl,
        pnlPercent,
        size,
        amount: amountStr,
        entryPrice: pos.entryPrice ?? null,
        liqPrice: pos.liquidationPrice ?? null,
        fundingFee: pos.fundingFeeUsd ?? null,
      }
    })
  }, [mexcPositionsWs, mexcItem])

  const openOrders: OpenOrderRow[] = useMemo(() => {
    return openOrdersData.map((order) => {
      const amountStr =
        order.amount !== null && order.amount !== undefined && order.amount > 0
          ? order.amount.toFixed(8).replace(/\.?0+$/, '')
          : '-'

      return {
        token: order.token,
        activity: order.activity,
        side: order.side,
        price: order.price,
        priceDisplay: order.priceDisplay,
        size: order.size,
        amount: amountStr,
      }
    })
  }, [openOrdersData])

  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        <Heading level={1}>MEXC</Heading>

        {/* Performance Frame */}
        <SectionCard title="Performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PnLBox title="24-Hour PnL" value={portfolioPnL.pnl24hUsd} />
            <PnLBox title="7-Day PnL" value={portfolioPnL.pnl7dUsd} />
            <PnLBox title="30-Day PnL" value={portfolioPnL.pnl30dUsd} />
            <PnLBox title="90-Day PnL" value={portfolioPnL.pnl90dUsd} />
          </div>
        </SectionCard>

        {/* Positions Frame */}
        <SectionCard
          title="Positions"
          titleRight={
            mexcPositionsWsStatus === 'error'
              ? `WS: error${mexcPositionsWsError ? ` (${mexcPositionsWsError})` : ''}`
              : `WS: ${mexcPositionsWsStatus}`
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
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center">
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
                              {pnlIsPositive ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-left whitespace-nowrap">
                          <div className="flex flex-col items-start">
                            <div className="text2 text-text-primary">{formatCurrency(position.size)}</div>
                            <div className="text2 mt-0.5 text-text-muted">{position.amount || '-'}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-left whitespace-nowrap">
                          <div className="text2 text-text-primary">-</div>
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
                          <div className="text2">
                            -
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
                    <Heading level={4}>Activity</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Price</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Size</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {openOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
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
                          <div className="text2 text-text-primary">{order.activity}</div>
                        </td>
                        <td className="py-3 pr-4 text-left whitespace-nowrap">
                          <div className="text2 text-text-primary">
                            {`$${formatNumber(order.price, 'us', { incognito: isIncognito })}`}
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

