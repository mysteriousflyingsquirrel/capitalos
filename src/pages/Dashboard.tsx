import { useState, useMemo, useEffect } from 'react'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import Heading from '../components/Heading'
import TotalText from '../components/TotalText'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { formatMoney } from '../lib/currency'
import type { CurrencyCode } from '../lib/currency'
import {
  loadNetWorthItems,
  loadNetWorthTransactions,
  loadCashflowInflowItems,
  loadCashflowOutflowItems,
} from '../services/storageService'
import {
  loadSnapshots,
} from '../services/snapshotService'
import type { NetWorthItem, NetWorthTransaction } from './NetWorth'
import type { NetWorthCategory } from './NetWorth'
import { calculateBalanceChf } from './NetWorth'
import type { InflowItem, OutflowItem } from './Cashflow'

// TypeScript interfaces
interface NetWorthDataPoint {
  month: string
  'Total Net Worth': number
  'Cash': number
  'Bank Accounts': number
  'Funds': number
  'Stocks': number
  'Commodities': number
  'Crypto': number
  'Real Estate': number
  'Inventory': number
}

interface AssetAllocationItem {
  name: string
  value: number
}

interface CashflowDataPoint {
  month: string
  inflow: number
  outflow: number
  spare: number
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
}


// Empty data - user will add their own data
const netWorthDataYTD: NetWorthDataPoint[] = []
const netWorthData1Year: NetWorthDataPoint[] = []
const netWorthData5Year: NetWorthDataPoint[] = []
const netWorthDataMax: NetWorthDataPoint[] = []

const assetAllocationData: AssetAllocationItem[] = []
const inflowBreakdownData: AssetAllocationItem[] = []
const outflowBreakdownData: AssetAllocationItem[] = []
const cashflowData: CashflowDataPoint[] = []

// KPI values
const totalNetWorth = 0
const monthlyInflow = 0
const monthlyOutflow = 0
const monthlySpareChange = 0

// Color palette for charts (muted, premium colors)
const CHART_COLORS = {
  gold: '#DAA520',
  bronze: '#B87333',
  accent1: '#4A90E2',
  accent2: '#3CC8C0',
  accent3: '#A45CFF',
  success: '#2ECC71',
  danger: '#E74C3C',
  muted1: '#8B8F99',
  muted2: '#5D6168',
}

const PIE_CHART_COLORS = [
  CHART_COLORS.gold,
  CHART_COLORS.accent1,
  CHART_COLORS.accent2,
  CHART_COLORS.accent3,
  CHART_COLORS.success,
]

// Helper component: KPI Card
function KpiCard({ title, value, subtitle }: KpiCardProps) {
  return (
    <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
      <Heading level={3} className="mb-2">
        {title}
      </Heading>
      <TotalText variant={title.toLowerCase().includes('outflow') ? 'outflow' : 'inflow'} className="block mb-1">
        {value}
      </TotalText>
      {subtitle && (
        <p className="text-text-muted text-xs">{subtitle}</p>
      )}
    </div>
  )
}

// Helper function: Format currency (will be used with currency context)
function formatCurrency(value: number, currency: CurrencyCode): string {
  return formatMoney(value, currency, 'ch')
}

// Helper function: Format CHF for chart ticks
function formatCHFTick(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}'k`
  }
  return value.toString()
}

function Dashboard() {
  const [timeFrame, setTimeFrame] = useState<'YTD' | '1Year' | '5Year' | 'Max'>('Max')
  const { baseCurrency, convert } = useCurrency()

  // Load data from Firestore
  const { uid } = useAuth()
  const [netWorthItems, setNetWorthItems] = useState([])
  const [transactions, setTransactions] = useState([])
  const [inflowItems, setInflowItems] = useState([])
  const [outflowItems, setOutflowItems] = useState([])
  
  useEffect(() => {
    if (uid) {
      Promise.all([
        loadNetWorthItems([], uid),
        loadNetWorthTransactions([], uid),
        loadCashflowInflowItems([], uid),
        loadCashflowOutflowItems([], uid),
      ]).then(([items, txs, inflow, outflow]) => {
        setNetWorthItems(items)
        setTransactions(txs)
        setInflowItems(inflow)
        setOutflowItems(outflow)
      })
    }
  }, [uid])

  // Load historical snapshots only (no new snapshots created)
  const snapshots = useMemo(() => {
    return loadSnapshots()
  }, [])

  // Calculate total net worth from actual data
  const totalNetWorthChf = useMemo(() => {
    return netWorthItems.reduce((sum, item) => sum + calculateBalanceChf(item.id, transactions), 0)
  }, [netWorthItems, transactions])

  // Calculate monthly inflow/outflow from cashflow items
  const monthlyInflowChf = useMemo(() => {
    return inflowItems.reduce((sum, item) => sum + item.amountChf, 0)
  }, [inflowItems])

  const monthlyOutflowChf = useMemo(() => {
    return outflowItems.reduce((sum, item) => sum + item.amountChf, 0)
  }, [outflowItems])

  const monthlySpareChangeChf = monthlyInflowChf - monthlyOutflowChf

  // Calculate monthly PnL (difference between current net worth and last snapshot)
  const monthlyPnLChf = useMemo(() => {
    if (snapshots.length === 0) return 0
    const lastSnapshot = snapshots[snapshots.length - 1]
    return totalNetWorthChf - lastSnapshot.total
  }, [snapshots, totalNetWorthChf])

  // Calculate monthly PnL percentage
  const monthlyPnLPercentage = useMemo(() => {
    if (snapshots.length === 0) return 0
    const lastSnapshot = snapshots[snapshots.length - 1]
    if (lastSnapshot.total === 0) return 0
    return ((totalNetWorthChf - lastSnapshot.total) / lastSnapshot.total) * 100
  }, [snapshots, totalNetWorthChf])

  // Calculate Year-to-Date (YTD) PnL
  const ytdPnLChf = useMemo(() => {
    if (snapshots.length === 0) return 0
    const currentYear = new Date().getFullYear()
    // Find the first snapshot of the current year (or the last snapshot before the year started)
    const firstSnapshotOfYear = snapshots.find(snapshot => {
      const snapshotDate = new Date(snapshot.date)
      return snapshotDate.getFullYear() === currentYear
    })
    
    // If no snapshot found for current year, use the last snapshot before the year
    if (!firstSnapshotOfYear) {
      const snapshotsBeforeYear = snapshots.filter(snapshot => {
        const snapshotDate = new Date(snapshot.date)
        return snapshotDate.getFullYear() < currentYear
      })
      if (snapshotsBeforeYear.length === 0) return 0
      const lastSnapshotBeforeYear = snapshotsBeforeYear[snapshotsBeforeYear.length - 1]
      return totalNetWorthChf - lastSnapshotBeforeYear.total
    }
    
    return totalNetWorthChf - firstSnapshotOfYear.total
  }, [snapshots, totalNetWorthChf])

  // Calculate YTD PnL percentage
  const ytdPnLPercentage = useMemo(() => {
    if (snapshots.length === 0) return 0
    const currentYear = new Date().getFullYear()
    const firstSnapshotOfYear = snapshots.find(snapshot => {
      const snapshotDate = new Date(snapshot.date)
      return snapshotDate.getFullYear() === currentYear
    })
    
    let baseTotal = 0
    if (!firstSnapshotOfYear) {
      const snapshotsBeforeYear = snapshots.filter(snapshot => {
        const snapshotDate = new Date(snapshot.date)
        return snapshotDate.getFullYear() < currentYear
      })
      if (snapshotsBeforeYear.length === 0) return 0
      const lastSnapshotBeforeYear = snapshotsBeforeYear[snapshotsBeforeYear.length - 1]
      baseTotal = lastSnapshotBeforeYear.total
    } else {
      baseTotal = firstSnapshotOfYear.total
    }
    
    if (baseTotal === 0) return 0
    return ((totalNetWorthChf - baseTotal) / baseTotal) * 100
  }, [snapshots, totalNetWorthChf])

  // Convert values from CHF to baseCurrency
  const totalNetWorthConverted = convert(totalNetWorthChf, 'CHF')
  const monthlyInflowConverted = convert(monthlyInflowChf, 'CHF')
  const monthlyOutflowConverted = convert(monthlyOutflowChf, 'CHF')
  const monthlyPnLConverted = convert(monthlyPnLChf, 'CHF')
  const ytdPnLConverted = convert(ytdPnLChf, 'CHF')

  // Format currency helper
  const formatCurrencyValue = (value: number) => formatMoney(value, baseCurrency, 'ch')

  // Format for chart ticks
  const formatCurrencyTick = (value: number) => {
    const converted = convert(value, 'CHF')
    if (converted >= 1000) {
      return `${(converted / 1000).toFixed(0)}'k`
    }
    return converted.toString()
  }

  // Calculate asset allocation from net worth items
  const assetAllocationData = useMemo(() => {
    const categoryTotals: Record<NetWorthCategory, number> = {
      'Cash': 0,
      'Bank Accounts': 0,
      'Funds': 0,
      'Stocks': 0,
      'Commodities': 0,
      'Crypto': 0,
      'Real Estate': 0,
      'Inventory': 0,
    }

    netWorthItems.forEach(item => {
      const balance = calculateBalanceChf(item.id, transactions)
      categoryTotals[item.category] += balance
    })

    const total = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0)
    if (total === 0) return []

    return Object.entries(categoryTotals)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value: Math.round((value / total) * 100),
      }))
  }, [netWorthItems, transactions])

  // Calculate inflow breakdown
  const inflowBreakdownData = useMemo(() => {
    const groupTotals: Record<string, number> = {}
    inflowItems.forEach(item => {
      groupTotals[item.group] = (groupTotals[item.group] || 0) + item.amountChf
    })

    const total = Object.values(groupTotals).reduce((sum, val) => sum + val, 0)
    if (total === 0) return []

    return Object.entries(groupTotals).map(([name, value]) => ({
      name,
      value: Math.round((value / total) * 100),
    }))
  }, [inflowItems])

  // Calculate outflow breakdown
  const outflowBreakdownData = useMemo(() => {
    const groupTotals: Record<string, number> = {}
    outflowItems.forEach(item => {
      groupTotals[item.group] = (groupTotals[item.group] || 0) + item.amountChf
    })

    const total = Object.values(groupTotals).reduce((sum, val) => sum + val, 0)
    if (total === 0) return []

    return Object.entries(groupTotals).map(([name, value]) => ({
      name,
      value: Math.round((value / total) * 100),
    }))
  }, [outflowItems])

  // Generate net worth evolution data from historical snapshots + current value
  const netWorthData = useMemo(() => {
    // Calculate cutoff date based on timeframe
    const now = new Date()
    let cutoffDate: Date | null = null

    switch (timeFrame) {
      case 'YTD':
        // Year to date: from January 1st of current year
        cutoffDate = new Date(now.getFullYear(), 0, 1)
        break
      case '1Year':
        // Last 12 months
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
        break
      case '5Year':
        // Last 5 years
        cutoffDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
        break
      case 'Max':
      default:
        // All data (no cutoff)
        cutoffDate = null
        break
    }

    // Filter snapshots based on timeframe
    const filteredSnapshots = cutoffDate
      ? snapshots.filter(snapshot => new Date(snapshot.date) >= cutoffDate)
      : snapshots

    // Convert snapshots to chart data format
    const chartData = filteredSnapshots.map(snapshot => {
      const date = new Date(snapshot.date)
      const month = date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
      
      return {
        month,
        'Total Net Worth': convert(snapshot.total, 'CHF'),
        'Cash': convert(snapshot.categories['Cash'], 'CHF'),
        'Bank Accounts': convert(snapshot.categories['Bank Accounts'], 'CHF'),
        'Funds': convert(snapshot.categories['Funds'], 'CHF'),
        'Stocks': convert(snapshot.categories['Stocks'], 'CHF'),
        'Commodities': convert(snapshot.categories['Commodities'], 'CHF'),
        'Crypto': convert(snapshot.categories['Crypto'], 'CHF'),
        'Real Estate': convert(snapshot.categories['Real Estate'], 'CHF'),
        'Inventory': convert(snapshot.categories['Inventory'], 'CHF'),
      }
    })

    // Add current state as the next month after the last snapshot
    if (filteredSnapshots.length > 0) {
      const lastSnapshot = filteredSnapshots[filteredSnapshots.length - 1]
      const lastDate = new Date(lastSnapshot.date)
      
      // Calculate the next month after the last snapshot
      const nextMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1)
      const nextMonthLabel = nextMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' })
      
      // Calculate current values by category
      const categoryTotals: Record<NetWorthCategory, number> = {
        'Cash': 0,
        'Bank Accounts': 0,
        'Funds': 0,
        'Stocks': 0,
        'Commodities': 0,
        'Crypto': 0,
        'Real Estate': 0,
        'Inventory': 0,
      }

      netWorthItems.forEach(item => {
        const balance = calculateBalanceChf(item.id, transactions)
        categoryTotals[item.category] += balance
      })

      const currentTotal = totalNetWorthChf

      // Add current state as the next month
      chartData.push({
        month: nextMonthLabel,
        'Total Net Worth': convert(currentTotal, 'CHF'),
        'Cash': convert(categoryTotals['Cash'], 'CHF'),
        'Bank Accounts': convert(categoryTotals['Bank Accounts'], 'CHF'),
        'Funds': convert(categoryTotals['Funds'], 'CHF'),
        'Stocks': convert(categoryTotals['Stocks'], 'CHF'),
        'Commodities': convert(categoryTotals['Commodities'], 'CHF'),
        'Crypto': convert(categoryTotals['Crypto'], 'CHF'),
        'Real Estate': convert(categoryTotals['Real Estate'], 'CHF'),
        'Inventory': convert(categoryTotals['Inventory'], 'CHF'),
      })
    }

    return chartData
  }, [snapshots, netWorthItems, transactions, totalNetWorthChf, convert, timeFrame])

  // Generate cashflow data (currently just current month)
  const cashflowData = useMemo(() => {
    return [{
      month: new Date().toLocaleString('en-US', { month: 'short' }),
      inflow: monthlyInflowConverted,
      outflow: monthlyOutflowConverted,
      spare: convert(monthlySpareChangeChf, 'CHF'),
    }]
  }, [monthlyInflowConverted, monthlyOutflowConverted, monthlySpareChangeChf, convert])

  return (
    <div className="min-h-screen bg-[#050A1A] px-2 py-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Dashboard</Heading>
        
        {/* First Row: Total Net Worth (with PnL) + Monthly Cashflow (Inflow/Outflow) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Total Net Worth KPI with Monthly PnL */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <div className="flex flex-col">
                <Heading level={2}>Total Net Worth</Heading>
                <TotalText variant={totalNetWorthConverted >= 0 ? 'inflow' : 'outflow'} className="mt-1">
                  {formatCurrencyValue(totalNetWorthConverted)}
                </TotalText>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">Monthly PnL</div>
                <div className="flex items-baseline gap-2">
                  <TotalText variant={monthlyPnLConverted >= 0 ? 'inflow' : 'outflow'}>
                    {formatCurrencyValue(monthlyPnLConverted)}
                  </TotalText>
                  <span className={`text-xs md:text-sm ${monthlyPnLPercentage >= 0 ? 'text-success' : 'text-danger'}`}>
                    ({monthlyPnLPercentage >= 0 ? '+' : ''}{monthlyPnLPercentage.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">YTD PnL</div>
                <div className="flex items-baseline gap-2">
                  <TotalText variant={ytdPnLConverted >= 0 ? 'inflow' : 'outflow'}>
                    {formatCurrencyValue(ytdPnLConverted)}
                  </TotalText>
                  <span className={`text-xs md:text-sm ${ytdPnLPercentage >= 0 ? 'text-success' : 'text-danger'}`}>
                    ({ytdPnLPercentage >= 0 ? '+' : ''}{ytdPnLPercentage.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Monthly Cashflow KPI with Inflow, Outflow, and Spare Change */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <Heading level={2} className="mb-2">Monthly Cashflow</Heading>
            <div className="space-y-2">
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">Inflow</div>
                <TotalText variant="inflow">{formatCurrencyValue(monthlyInflowConverted)}</TotalText>
              </div>
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">Outflow</div>
                <TotalText variant="outflow">{formatCurrencyValue(monthlyOutflowConverted)}</TotalText>
              </div>
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">Spare Change</div>
                <TotalText variant="spare">{formatCurrencyValue(convert(monthlySpareChangeChf, 'CHF'))}</TotalText>
              </div>
            </div>
          </div>
        </div>

        {/* Second Row: Net Worth Evolution (Full Width) */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <div className="flex items-center justify-between">
              <Heading level={2}>Net Worth Evolution</Heading>
              <select
                value={timeFrame}
                onChange={(e) => setTimeFrame(e.target.value as 'YTD' | '1Year' | '5Year' | 'Max')}
                className="bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text2 focus:outline-none focus:border-accent-blue"
              >
                <option value="YTD">YTD</option>
                <option value="1Year">1Year</option>
                <option value="5Year">5Year</option>
                <option value="Max">Max</option>
              </select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={netWorthData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_COLORS.muted1}
                opacity={0.2}
              />
              <XAxis
                dataKey="month"
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                tickFormatter={formatCurrencyTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  color: '#111827',
                  fontSize: '0.648rem',
                  fontWeight: '400',
                }}
                formatter={(value: number) => formatCurrencyValue(value)}
              />
              <Legend
                wrapperStyle={{ color: '#8B8F99', fontSize: '0.72rem', fontWeight: '400' }}
                iconType="line"
                className="text2"
              />
              <Line
                type="monotone"
                dataKey="Total Net Worth"
                stroke={CHART_COLORS.gold}
                strokeWidth={3}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Cash"
                stroke={CHART_COLORS.accent1}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Bank Accounts"
                stroke={CHART_COLORS.accent2}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Funds"
                stroke={CHART_COLORS.accent3}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Stocks"
                stroke={CHART_COLORS.success}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Commodities"
                stroke={CHART_COLORS.bronze}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Crypto"
                stroke="#F8C445"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Real Estate"
                stroke="#4A56FF"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="Inventory"
                stroke={CHART_COLORS.muted1}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Third Row: Asset Allocation + Inflow Breakdown + Outflow Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Asset Allocation Pie Chart */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <Heading level={2}>Asset Allocation</Heading>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={assetAllocationData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {assetAllocationData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    color: '#111827',
                    fontSize: '0.648rem',
                    fontWeight: '400',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.648rem', fontWeight: '400' }}
                  iconType="circle"
                  className="text2"
                  formatter={(value, entry) => {
                    const total = assetAllocationData.reduce((sum, item) => sum + item.value, 0)
                    const item = assetAllocationData.find(item => item.name === value)
                    const percent = item ? ((item.value / total) * 100).toFixed(0) : '0'
                    return `${percent}% in ${value}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Inflow Breakdown Pie Chart */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <Heading level={2}>Inflow Breakdown</Heading>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={inflowBreakdownData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {inflowBreakdownData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    color: '#111827',
                    fontSize: '0.648rem',
                    fontWeight: '400',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.648rem', fontWeight: '400' }}
                  iconType="circle"
                  className="text2"
                  formatter={(value, entry) => {
                    const total = inflowBreakdownData.reduce((sum, item) => sum + item.value, 0)
                    const item = inflowBreakdownData.find(item => item.name === value)
                    const percent = item ? ((item.value / total) * 100).toFixed(0) : '0'
                    return `${percent}% in ${value}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Outflow Breakdown Pie Chart */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <Heading level={2}>Outflow Breakdown</Heading>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={outflowBreakdownData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {outflowBreakdownData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    color: '#111827',
                    fontSize: '0.648rem',
                    fontWeight: '400',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.648rem', fontWeight: '400' }}
                  iconType="circle"
                  className="text2"
                  formatter={(value, entry) => {
                    const total = outflowBreakdownData.reduce((sum, item) => sum + item.value, 0)
                    const item = outflowBreakdownData.find(item => item.name === value)
                    const percent = item ? ((item.value / total) * 100).toFixed(0) : '0'
                    return `${percent}% in ${value}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fourth Row: Monthly Cashflow (Full Width) */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <Heading level={2}>Monthly Cashflow</Heading>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={cashflowData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_COLORS.muted1}
                opacity={0.2}
              />
              <XAxis
                dataKey="month"
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                tickFormatter={formatCurrencyTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  color: '#111827',
                  fontSize: '0.648rem',
                  fontWeight: '400',
                }}
                formatter={(value: number) => formatCurrencyValue(value)}
              />
              <Legend
                wrapperStyle={{ color: '#8B8F99', fontSize: '0.72rem', fontWeight: '400' }}
                iconType="square"
                className="text2"
              />
              <Bar
                dataKey="inflow"
                fill={CHART_COLORS.success}
                name="Inflow"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="outflow"
                fill={CHART_COLORS.danger}
                name="Outflow"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="spare"
                fill={CHART_COLORS.gold}
                name="Spare Change"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>
    </div>
  )
}

export default Dashboard

