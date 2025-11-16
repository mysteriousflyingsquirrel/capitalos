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

interface SankeyNode {
  name: string
  value: number
}

interface SankeyLink {
  source: number
  target: number
  value: number
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

// Sankey diagram data
const sankeyNodes: SankeyNode[] = [
  // Inflow sources (left side)
  { name: 'Time', value: 6400 },
  { name: 'Service', value: 800 },
  { name: 'Worker Bees', value: 800 },
  // Outflow destinations (right side)
  { name: 'Fix', value: 3150 },
  { name: 'Variables', value: 450 },
  { name: 'Shared Variables', value: 225 },
  { name: 'Investments', value: 675 },
]

const sankeyLinks: SankeyLink[] = [
  // Time to outflows
  { source: 0, target: 3, value: 3150 }, // Time -> Fix (target index 0 in rightNodes)
  { source: 0, target: 4, value: 450 },  // Time -> Variables (target index 1)
  { source: 0, target: 5, value: 225 },  // Time -> Shared Variables (target index 2)
  { source: 0, target: 6, value: 2575 }, // Time -> Investments (target index 3)
  // Service to outflows
  { source: 1, target: 4, value: 400 },  // Service -> Variables
  { source: 1, target: 6, value: 400 },  // Service -> Investments
  // Worker Bees to outflows
  { source: 2, target: 5, value: 200 },  // Worker Bees -> Shared Variables
  { source: 2, target: 6, value: 600 },  // Worker Bees -> Investments
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

// Helper component: Sankey Diagram
function SankeyDiagram({ nodes, links }: { nodes: SankeyNode[], links: SankeyLink[] }) {
  try {
    const width = 1000
    const height = 500
    const leftColumnX = 50
    const rightColumnX = 750
    const nodeWidth = 120
    const nodeSpacing = 15
    const totalInflow = nodes.slice(0, 3).reduce((sum, n) => sum + n.value, 0)
    const totalOutflow = nodes.slice(3).reduce((sum, n) => sum + n.value, 0)
    const maxTotal = Math.max(totalInflow, totalOutflow, 1) // Prevent division by zero
    const scale = (height - 100) / maxTotal
    
    // Calculate node positions for left side (Inflow)
    const leftNodes = nodes.slice(0, 3)
    let leftY = 50
    const leftNodePositions = leftNodes.map((node) => {
      const y = leftY
      const h = node.value * scale
      leftY += h + nodeSpacing
      return { ...node, y, height: h }
    })
    
    // Calculate node positions for right side (Outflow)
    const rightNodes = nodes.slice(3)
    let rightY = 50
    const rightNodePositions = rightNodes.map((node) => {
      const y = rightY
      const h = node.value * scale
      rightY += h + nodeSpacing
      return { ...node, y, height: h }
    })
    
    // Create Sankey path
    const createSankeyPath = (
      sourceY: number,
      sourceHeight: number,
      targetY: number,
      targetHeight: number,
      linkValue: number
    ) => {
      const linkHeight = linkValue * scale
      const sourceStart = sourceY
      const sourceEnd = sourceStart + linkHeight
      const targetStart = targetY
      const targetEnd = targetStart + linkHeight
      
      const midX = (leftColumnX + nodeWidth + rightColumnX) / 2
      const curve = 30
      
      return `
        M ${leftColumnX + nodeWidth} ${sourceStart}
        C ${leftColumnX + nodeWidth + curve} ${sourceStart} ${midX - curve} ${targetStart} ${midX} ${targetStart}
        L ${midX} ${targetEnd}
        C ${midX - curve} ${targetEnd} ${leftColumnX + nodeWidth + curve} ${sourceEnd} ${leftColumnX + nodeWidth} ${sourceEnd}
        Z
      `
    }
    
    const linkColors = [
      CHART_COLORS.gold,
      CHART_COLORS.accent1,
      CHART_COLORS.accent2,
      CHART_COLORS.accent3,
      '#F8C445',
    ]
    
    // Calculate link positions with stacking
    const linkPositions = links
      .map((link, i) => {
        const sourceNode = leftNodePositions[link.source]
        const targetNode = rightNodePositions[link.target - 3]
        
        if (!sourceNode || !targetNode) return null
        
        // Calculate vertical offset for stacking multiple links from same source
        const previousLinksFromSource = links
          .slice(0, i)
          .filter(l => l.source === link.source)
        const sourceOffset = previousLinksFromSource.reduce((sum, l) => sum + l.value * scale, 0)
        
        const previousLinksToTarget = links
          .slice(0, i)
          .filter(l => l.target === link.target)
        const targetOffset = previousLinksToTarget.reduce((sum, l) => sum + l.value * scale, 0)
        
        return {
          sourceY: sourceNode.y + sourceOffset,
          sourceHeight: sourceNode.height,
          targetY: targetNode.y + targetOffset,
          targetHeight: targetNode.height,
          value: link.value,
          color: linkColors[i % linkColors.length],
        }
      })
      .filter((link): link is NonNullable<typeof link> => link !== null)
    
    return (
      <div className="w-full overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
          {/* Links */}
          {linkPositions.map((link, i) => (
            <path
              key={i}
              d={createSankeyPath(
                link.sourceY,
                link.sourceHeight,
                link.targetY,
                link.targetHeight,
                link.value
              )}
              fill={link.color}
              opacity={0.6}
              stroke="none"
            />
          ))}
          
          {/* Left nodes (Inflow) */}
          {leftNodePositions.map((node, i) => (
            <g key={i}>
              <rect
                x={leftColumnX}
                y={node.y}
                width={nodeWidth}
                height={node.height}
                fill={CHART_COLORS.success}
                rx={4}
              />
              <text
                x={leftColumnX + nodeWidth / 2}
                y={node.y + node.height / 2 - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#F0F2F5"
                fontSize="13"
                fontWeight="600"
              >
                {node.name}
              </text>
              <text
                x={leftColumnX + nodeWidth / 2}
                y={node.y + node.height / 2 + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#8B8F99"
                fontSize="11"
              >
                {formatCHF(node.value)}
              </text>
            </g>
          ))}
          
          {/* Right nodes (Outflow) */}
          {rightNodePositions.map((node, i) => (
            <g key={i}>
              <rect
                x={rightColumnX}
                y={node.y}
                width={nodeWidth}
                height={node.height}
                fill={CHART_COLORS.danger}
                rx={4}
              />
              <text
                x={rightColumnX + nodeWidth / 2}
                y={node.y + node.height / 2 - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#F0F2F5"
                fontSize="13"
                fontWeight="600"
              >
                {node.name}
              </text>
              <text
                x={rightColumnX + nodeWidth / 2}
                y={node.y + node.height / 2 + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#8B8F99"
                fontSize="11"
              >
                {formatCHF(node.value)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    )
  } catch (error) {
    console.error('Sankey diagram error:', error)
    return (
      <div className="w-full p-4 text-center text-text-secondary">
        Error rendering cashflow diagram
      </div>
    )
  }
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
        {/* Page Title */}
        <Heading level={1}>Dashboard</Heading>
        
        {/* First Row: Total Net Worth + Monthly Inflow + Monthly Outflow */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Net Worth KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-5 md:p-6">
            <Heading level={2} className="mb-2">
              Total Net Worth
            </Heading>
            <TotalText variant="neutral">{formatCHF(totalNetWorth)}</TotalText>
          </div>

          {/* Monthly Inflow KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-5 md:p-6">
            <Heading level={2} className="mb-2">
              Monthly Inflow
            </Heading>
            <TotalText variant="inflow">{formatCHF(monthlyInflow)}</TotalText>
          </div>

          {/* Monthly Outflow KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-5 md:p-6">
            <Heading level={2} className="mb-2">
              Monthly Outflow
            </Heading>
            <TotalText variant="outflow">{formatCHF(monthlyOutflow)}</TotalText>
          </div>
        </div>

        {/* Second Row: Net Worth Evolution (Full Width) */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <Heading level={2} className="mb-4">
            Net Worth Evolution
          </Heading>
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
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
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
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
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
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
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
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
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

        {/* Fifth Row: Cashflow Sankey Diagram (Full Width) */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-6">
          <Heading level={2} className="mb-4">
            Cashflow Sankey
          </Heading>
          {sankeyNodes && sankeyLinks && (
            <SankeyDiagram nodes={sankeyNodes} links={sankeyLinks} />
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard

