import React, { useMemo } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useIncognito } from '../contexts/IncognitoContext'
import { useData } from '../contexts/DataContext'
import { formatMoney, formatNumber } from '../lib/currency'
import type { PerpetualsOpenPosition, PerpetualsOpenOrder } from './NetWorth'

// Helper component: SectionCard
interface SectionCardProps {
  title: string
  children: React.ReactNode
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
      <div className="mb-6 pb-4 border-b border-border-strong">
        <Heading level={2}>{title}</Heading>
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
  token: string
  side: 'Long' | 'Short'
  leverage: string
  pnl: number
  pnlPercent: number
  size: number
  amount: string // Token amount (e.g., "0.0335 ETH")
  entryPrice: number | null // Entry price
  liqPrice: number | null // Liquidation price
  fundingFee: number | null // Funding fee in USD
}

// Open Order row data interface
interface OpenOrderRow {
  token: string
  activity: string
  side: 'Buy' | 'Sell'
  price: number // numeric price for calculations
  priceDisplay: string // formatted price (e.g., "87000" or "85000 → 87000")
  size: number
  amount: string
}

function Investing() {
  const { isIncognito } = useIncognito()
  const { data } = useData()
  const formatCurrency = (val: number) => formatMoney(val, 'USD', 'us', { incognito: isIncognito })

  // Extract PnL values from Hyperliquid portfolio data
  const portfolioPnL = useMemo(() => {
    // Find the first Hyperliquid perpetuals item with portfolioPnL data
    const hyperliquidItem = data.netWorthItems.find(
      item => item.category === 'Perpetuals' && 
      item.perpetualsData?.portfolioPnL
    )
    
    return hyperliquidItem?.perpetualsData?.portfolioPnL || {
      pnl24hUsd: null,
      pnl7dUsd: null,
      pnl30dUsd: null,
      pnl90dUsd: null,
    }
  }, [data.netWorthItems])

  // Extract open positions from all perpetuals items
  const positions: PositionRow[] = useMemo(() => {
    const allOpenPositions: PerpetualsOpenPosition[] = []
    
    // Collect all open positions from all perpetuals items
    data.netWorthItems
      .filter(item => item.category === 'Perpetuals' && item.perpetualsData)
      .forEach(item => {
        if (item.perpetualsData?.openPositions) {
          allOpenPositions.push(...item.perpetualsData.openPositions)
        }
      })

    // Map to PositionRow format
    return allOpenPositions.map((pos) => {
      const side = pos.positionSide === 'LONG' ? 'Long' : pos.positionSide === 'SHORT' ? 'Short' : 'Long'
      const leverageStr = pos.leverage !== null && pos.leverage !== undefined 
        ? `${Math.round(pos.leverage)}x` 
        : '1x'
      
      const size = pos.margin + pos.pnl
      const pnlPercent = pos.margin !== 0 ? (pos.pnl / pos.margin) * 100 : 0

      // Format token amount
      let amountStr = '-'
      if (pos.amountToken !== null && pos.amountToken !== undefined && pos.amountToken > 0) {
        // Format with appropriate decimals (up to 8 for crypto, but remove trailing zeros)
        const formatted = pos.amountToken.toFixed(8).replace(/\.?0+$/, '')
        amountStr = formatted
      }

      return {
        token: pos.ticker,
        side: side,
        leverage: leverageStr,
        pnl: pos.pnl,
        pnlPercent: pnlPercent,
        size: size,
        amount: amountStr,
        entryPrice: pos.entryPrice ?? null,
        liqPrice: pos.liquidationPrice ?? null,
        fundingFee: pos.fundingFeeUsd ?? null,
      }
    })
  }, [data.netWorthItems])

  // Extract open orders from all perpetuals items
  const openOrders: OpenOrderRow[] = useMemo(() => {
    const allOpenOrders: PerpetualsOpenOrder[] = []
    
    // Collect all open orders from all perpetuals items
    data.netWorthItems
      .filter(item => item.category === 'Perpetuals' && item.perpetualsData)
      .forEach(item => {
        if (item.perpetualsData?.openOrders) {
          allOpenOrders.push(...item.perpetualsData.openOrders)
        }
      })

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
        activity: order.activity,
        side: order.side,
        price: order.price,
        priceDisplay: order.priceDisplay,
        size: order.size,
        amount: amountStr,
      }
    })
  }, [data.netWorthItems])

  return (
    <div className="min-h-screen px-2 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Investing</Heading>

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
        <SectionCard title="Positions">
          <div className="overflow-x-auto -mx-3 px-3 lg:-mx-6 lg:px-6">
            <table className="w-full" style={{ minWidth: '1070px', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '120px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '50px' }} />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
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
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>PnL</Heading>
                  </th>
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Size</Heading>
                  </th>
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Amount</Heading>
                  </th>
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Entry Price</Heading>
                  </th>
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Liq. Price</Heading>
                  </th>
                  <th className="text-right pb-3 whitespace-nowrap">
                    <Heading level={4}>Funding Fee</Heading>
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position, index) => {
                  const isLong = position.side === 'Long'
                  const pnlIsPositive = position.pnl >= 0

                  return (
                    <tr key={index} className="border-b border-border-subtle last:border-b-0">
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
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <div className="text2" style={{ color: pnlIsPositive ? '#2ECC71' : '#E74C3C' }}>
                            {formatCurrency(position.pnl)}
                          </div>
                          <div className="text2 mt-0.5" style={{ color: pnlIsPositive ? '#2ECC71' : '#E74C3C' }}>
                            {pnlIsPositive ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">{formatCurrency(position.size)}</div>
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">{position.amount || '-'}</div>
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.entryPrice !== null && position.entryPrice > 0 
                            ? `$${formatNumber(position.entryPrice, 'us', { incognito: isIncognito })}` 
                            : '-'}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">
                          {position.liqPrice !== null && position.liqPrice > 0 
                            ? `$${formatNumber(position.liqPrice, 'us', { incognito: isIncognito })}` 
                            : '-'}
                        </div>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* Open Orders Frame */}
        <SectionCard title="Open Orders">
          <div className="overflow-x-auto -mx-3 px-3 lg:-mx-6 lg:px-6">
            <table className="w-full" style={{ minWidth: '700px', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '120px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '50px' }} />
                <col />
                <col />
                <col />
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
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Price</Heading>
                  </th>
                  <th className="text-right pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Size</Heading>
                  </th>
                  <th className="text-right pb-3 whitespace-nowrap">
                    <Heading level={4}>Amount</Heading>
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
                          <div className="text2 text-text-primary">{order.activity}</div>
                        </td>
                        <td className="py-3 pr-4 text-right whitespace-nowrap">
                          <div className="text2 text-text-primary">
                            {order.priceDisplay && order.priceDisplay.includes('→') 
                              ? order.priceDisplay.split('→').map((p, i) => {
                                  const num = parseFloat(p.trim())
                                  if (isNaN(num)) return null
                                  return (
                                    <span key={i}>
                                      {i > 0 && ' → '}
                                      ${formatNumber(num, 'us', { incognito: isIncognito })}
                                    </span>
                                  )
                                })
                              : `$${formatNumber(order.price, 'us', { incognito: isIncognito })}`
                            }
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right whitespace-nowrap">
                          <div className="text2 text-text-primary">{formatCurrency(order.size)}</div>
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <div className="text2 text-text-primary">{order.amount || '-'}</div>
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

export default Investing
