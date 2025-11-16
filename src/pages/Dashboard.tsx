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

// TypeScript interfaces
interface NetWorthDataPoint {
  month: string
  value: number
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

// Mock data configuration
const netWorthData: NetWorthDataPoint[] = [
  { month: 'Jan', value: 140000 },
  { month: 'Feb', value: 145000 },
  { month: 'Mar', value: 150000 },
  { month: 'Apr', value: 160000 },
  { month: 'May', value: 170000 },
  { month: 'Jun', value: 180000 },
]

const assetAllocationData: AssetAllocationItem[] = [
  { name: 'Crypto', value: 70 },
  { name: 'Cash', value: 10 },
  { name: 'Funds', value: 20 },
]

const inflowBreakdownData: AssetAllocationItem[] = [
  { name: 'Time', value: 80 },
  { name: 'Service', value: 10 },
  { name: 'Worker Bees', value: 10 },
]

const outflowBreakdownData: AssetAllocationItem[] = [
  { name: 'Fix', value: 70 },
  { name: 'Variables', value: 10 },
  { name: 'Shared Variables', value: 5 },
  { name: 'Investments', value: 15 },
]

const cashflowData: CashflowDataPoint[] = [
  { month: 'Jan', inflow: 8000, outflow: 4500, spare: 3500 },
  { month: 'Feb', inflow: 8200, outflow: 4600, spare: 3600 },
  { month: 'Mar', inflow: 7900, outflow: 4300, spare: 3600 },
  { month: 'Apr', inflow: 8500, outflow: 4800, spare: 3700 },
  { month: 'May', inflow: 8800, outflow: 4900, spare: 3900 },
  { month: 'Jun', inflow: 9000, outflow: 5000, spare: 4000 },
]

// KPI values
const totalNetWorth = 180000
const monthlyInflow = 8000
const monthlyOutflow = 4500
const monthlySpareChange = 3500

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
    <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
      <p className="text-text-secondary text-sm font-medium mb-2">{title}</p>
      <p className="text-text-primary text-3xl font-bold mb-1">{value}</p>
      {subtitle && (
        <p className="text-text-muted text-xs">{subtitle}</p>
      )}
    </div>
  )
}

// Helper function: Format CHF currency
function formatCHF(value: number): string {
  return `CHF ${value.toLocaleString('de-CH').replace(/\./g, "'")}`
}

// Helper function: Format CHF for chart ticks
function formatCHFTick(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}'k`
  }
  return value.toString()
}

function Dashboard() {
  return (
    <div className="min-h-screen bg-[#050A1A] p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* First Row: Total Net Worth + Monthly Inflow + Monthly Outflow */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Net Worth KPI */}
          <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
            <p className="text-text-secondary text-sm font-semibold mb-2">
              Total Net Worth
            </p>
            <p className="text-success text-4xl font-bold">
              {formatCHF(totalNetWorth)}
            </p>
          </div>

          {/* Monthly Inflow KPI */}
          <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
            <p className="text-text-secondary text-sm font-semibold mb-2">
              Monthly Inflow
            </p>
            <p className="text-success text-4xl font-bold">
              {formatCHF(monthlyInflow)}
            </p>
          </div>

          {/* Monthly Outflow KPI */}
          <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
            <p className="text-text-secondary text-sm font-semibold mb-2">
              Monthly Outflow
            </p>
            <p className="text-danger text-4xl font-bold">
              {formatCHF(monthlyOutflow)}
            </p>
          </div>
        </div>

        {/* Second Row: Net Worth Evolution (Full Width) */}
        <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
          <h2 className="text-text-primary text-xl font-semibold mb-4">
            Net Worth Evolution
          </h2>
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
                tick={{ fill: CHART_COLORS.muted1 }}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1 }}
                tickFormatter={formatCHFTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  color: '#111827',
                }}
                formatter={(value: number) => formatCHF(value)}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS.gold}
                strokeWidth={3}
                dot={{ fill: CHART_COLORS.gold, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Third Row: Asset Allocation + Inflow Breakdown + Outflow Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Asset Allocation Pie Chart */}
          <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
            <h2 className="text-text-primary text-xl font-semibold mb-4">
              Asset Allocation
            </h2>
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
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#C5CAD3' }}
                  iconType="circle"
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
          <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
            <h2 className="text-text-primary text-xl font-semibold mb-4">
              Inflow Breakdown
            </h2>
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
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#C5CAD3' }}
                  iconType="circle"
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
          <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
            <h2 className="text-text-primary text-xl font-semibold mb-4">
              Outflow Breakdown
            </h2>
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
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend
                  wrapperStyle={{ color: '#C5CAD3' }}
                  iconType="circle"
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
        <div className="bg-bg-surface-1 border border-border-subtle rounded-card shadow-card p-6">
          <h2 className="text-text-primary text-xl font-semibold mb-4">
            Monthly Cashflow
          </h2>
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
                tick={{ fill: CHART_COLORS.muted1 }}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1 }}
                tickFormatter={formatCHFTick}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  color: '#111827',
                }}
                formatter={(value: number) => formatCHF(value)}
              />
              <Legend
                wrapperStyle={{ color: '#C5CAD3' }}
                iconType="square"
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

