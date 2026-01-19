import React, { useMemo } from 'react'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useIncognito } from '../contexts/IncognitoContext'
import { useData } from '../contexts/DataContext'
import { formatMoney, formatNumber } from '../lib/currency'
import type { PerpetualsOpenPosition } from './NetWorth'

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
  value: number
}

function PnLBox({ title, value }: PnLBoxProps) {
  const { isIncognito } = useIncognito()
  const formatCurrency = (val: number) => formatMoney(val, 'USD', 'us', { incognito: isIncognito })
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
  price: number
  size: number
  amount: string
}

function Investing() {
  const { isIncognito } = useIncognito()
  const { data } = useData()
  const formatCurrency = (val: number) => formatMoney(val, 'USD', 'us', { incognito: isIncognito })

  // Example values for PnL boxes
  const pnl24h = -39.21
  const pnl7d = 245.67
  const pnl30d = 892.15
  const pnl90d = 1250.45

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
        amountStr = `${formatted} ${pos.ticker}`
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

  // Example open orders data
  const openOrders: OpenOrderRow[] = [
    {
      token: 'BTC',
      activity: 'Limit',
      side: 'Buy',
      price: 87000,
      size: 3200,
      amount: '0.02 BTC',
    },
    {
      token: 'ETH',
      activity: 'Market',
      side: 'Sell',
      price: 3750,
      size: 1500,
      amount: '0.4 ETH',
    },
    {
      token: 'SOL',
      activity: 'Limit',
      side: 'Buy',
      price: 140,
      size: 2100,
      amount: '15 SOL',
    },
  ]

  return (
    <div className="min-h-screen px-2 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Investing</Heading>

        {/* Performance Frame */}
        <SectionCard title="Performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PnLBox title="24-Hour PnL" value={pnl24h} />
            <PnLBox title="7-Day PnL" value={pnl7d} />
            <PnLBox title="30-Day PnL" value={pnl30d} />
            <PnLBox title="90-Day PnL" value={pnl90d} />
          </div>
        </SectionCard>

        {/* Positions Frame */}
        <SectionCard title="Positions">
          <div className="overflow-x-auto -mx-3 px-3 lg:-mx-6 lg:px-6">
            <table className="w-full" style={{ minWidth: '1070px', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '70px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '120px' }} />
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
                <col style={{ width: '70px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border-strong">
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Token</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Activity</Heading>
                  </th>
                  <th className="text-left pb-3 pr-4 whitespace-nowrap">
                    <Heading level={4}>Side</Heading>
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
                {openOrders.map((order, index) => {
                  const isBuy = order.side === 'Buy'

                  return (
                    <tr key={index} className="border-b border-border-subtle last:border-b-0">
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="text2 text-text-primary font-medium">{order.token}</div>
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="text2 text-text-primary">{order.activity}</div>
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
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">{formatCurrency(order.price)}</div>
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">{formatCurrency(order.size)}</div>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="text2 text-text-primary">{order.amount}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

export default Investing
