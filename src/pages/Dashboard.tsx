import { useState, useMemo } from 'react'
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

  // Load data from localStorage
  const netWorthItems = useMemo(() => loadNetWorthItems([]), [])
  const transactions = useMemo(() => loadNetWorthTransactions([]), [])
  const inflowItems = useMemo(() => loadCashflowInflowItems([]), [])
  const outflowItems = useMemo(() => loadCashflowOutflowItems([]), [])

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

  // Convert values from CHF to baseCurrency
  const totalNetWorthConverted = convert(totalNetWorthChf, 'CHF')
  const monthlyInflowConverted = convert(monthlyInflowChf, 'CHF')
  const monthlyOutflowConverted = convert(monthlyOutflowChf, 'CHF')

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
    // Only show snapshot data, not current state
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

    return chartData
  }, [snapshots, convert, timeFrame])

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
        
        {/* First Row: Total Net Worth + Monthly Inflow + Monthly Outflow */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Net Worth KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <Heading level={2} className="mb-2">
              Total Net Worth
            </Heading>
            <TotalText variant="neutral">{formatCurrencyValue(totalNetWorthConverted)}</TotalText>
          </div>

          {/* Monthly Inflow KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <Heading level={2} className="mb-2">
              Monthly Inflow
            </Heading>
            <TotalText variant="inflow">{formatCurrencyValue(monthlyInflowConverted)}</TotalText>
          </div>

          {/* Monthly Outflow KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <Heading level={2} className="mb-2">
              Monthly Outflow
            </Heading>
            <TotalText variant="outflow">{formatCurrencyValue(monthlyOutflowConverted)}</TotalText>
          </div>
        </div>

        {/* Second Row: Net Worth Evolution (Full Width) */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <Heading level={2}>
              Net Worth Evolution
            </Heading>
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
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.60rem' }}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.60rem' }}
                tickFormatter={formatCurrencyTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  color: '#111827',
                  fontSize: '0.60rem',
                  fontWeight: '400',
                }}
                formatter={(value: number) => formatCurrencyValue(value)}
              />
              <Legend
                wrapperStyle={{ color: '#8B8F99', fontSize: '0.60rem', fontWeight: '400' }}
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
            <Heading level={2} className="mb-4">
              Asset Allocation
            </Heading>
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
                    fontSize: '0.60rem',
                    fontWeight: '400',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.60rem', fontWeight: '400' }}
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
            <Heading level={2} className="mb-4">
              Inflow Breakdown
            </Heading>
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
                    fontSize: '0.60rem',
                    fontWeight: '400',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.60rem', fontWeight: '400' }}
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
            <Heading level={2} className="mb-4">
              Outflow Breakdown
            </Heading>
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
                    fontSize: '0.60rem',
                    fontWeight: '400',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.60rem', fontWeight: '400' }}
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
          <Heading level={2} className="mb-4">
            Monthly Cashflow
          </Heading>
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
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.60rem' }}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.60rem' }}
                tickFormatter={formatCurrencyTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  color: '#111827',
                  fontSize: '0.60rem',
                  fontWeight: '400',
                }}
                formatter={(value: number) => formatCurrencyValue(value)}
              />
              <Legend
                wrapperStyle={{ color: '#8B8F99', fontSize: '0.60rem', fontWeight: '400' }}
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

