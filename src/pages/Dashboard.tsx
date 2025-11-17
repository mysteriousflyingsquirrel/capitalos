import { useState } from 'react'
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

interface SankeyNode {
  name: string
  value: number
}

interface SankeyLink {
  source: number
  target: number
  value: number
}

// Mock data configuration - YTD (Year to Date)
const netWorthDataYTD: NetWorthDataPoint[] = [
  { 
    month: 'Jan', 
    'Total Net Worth': 140000,
    'Cash': 750,
    'Bank Accounts': 25000,
    'Funds': 40000,
    'Stocks': 20000,
    'Commodities': 7000,
    'Crypto': 60000,
    'Real Estate': 450000,
    'Inventory': 8000
  },
  { 
    month: 'Feb', 
    'Total Net Worth': 145000,
    'Cash': 800,
    'Bank Accounts': 26000,
    'Funds': 42000,
    'Stocks': 21000,
    'Commodities': 7200,
    'Crypto': 65000,
    'Real Estate': 450000,
    'Inventory': 8000
  },
  { 
    month: 'Mar', 
    'Total Net Worth': 150000,
    'Cash': 850,
    'Bank Accounts': 27000,
    'Funds': 44000,
    'Stocks': 22000,
    'Commodities': 7400,
    'Crypto': 70000,
    'Real Estate': 450000,
    'Inventory': 8000
  },
  { 
    month: 'Apr', 
    'Total Net Worth': 160000,
    'Cash': 900,
    'Bank Accounts': 28000,
    'Funds': 46000,
    'Stocks': 23000,
    'Commodities': 7600,
    'Crypto': 75000,
    'Real Estate': 450000,
    'Inventory': 8000
  },
  { 
    month: 'May', 
    'Total Net Worth': 170000,
    'Cash': 950,
    'Bank Accounts': 29000,
    'Funds': 48000,
    'Stocks': 24000,
    'Commodities': 7800,
    'Crypto': 80000,
    'Real Estate': 450000,
    'Inventory': 8000
  },
  { 
    month: 'Jun', 
    'Total Net Worth': 180000,
    'Cash': 1000,
    'Bank Accounts': 30000,
    'Funds': 50000,
    'Stocks': 25000,
    'Commodities': 8000,
    'Crypto': 85000,
    'Real Estate': 450000,
    'Inventory': 8000
  },
]

// 1 Year data (monthly for 12 months)
const netWorthData1Year: NetWorthDataPoint[] = [
  { month: 'Jul 2023', 'Total Net Worth': 120000, 'Cash': 600, 'Bank Accounts': 20000, 'Funds': 30000, 'Stocks': 15000, 'Commodities': 5000, 'Crypto': 50000, 'Real Estate': 450000, 'Inventory': 7000 },
  { month: 'Aug 2023', 'Total Net Worth': 125000, 'Cash': 650, 'Bank Accounts': 21000, 'Funds': 32000, 'Stocks': 16000, 'Commodities': 5500, 'Crypto': 52000, 'Real Estate': 450000, 'Inventory': 7200 },
  { month: 'Sep 2023', 'Total Net Worth': 128000, 'Cash': 680, 'Bank Accounts': 22000, 'Funds': 34000, 'Stocks': 17000, 'Commodities': 5800, 'Crypto': 54000, 'Real Estate': 450000, 'Inventory': 7400 },
  { month: 'Oct 2023', 'Total Net Worth': 132000, 'Cash': 700, 'Bank Accounts': 23000, 'Funds': 36000, 'Stocks': 18000, 'Commodities': 6200, 'Crypto': 56000, 'Real Estate': 450000, 'Inventory': 7600 },
  { month: 'Nov 2023', 'Total Net Worth': 135000, 'Cash': 720, 'Bank Accounts': 24000, 'Funds': 38000, 'Stocks': 19000, 'Commodities': 6500, 'Crypto': 58000, 'Real Estate': 450000, 'Inventory': 7800 },
  { month: 'Dec 2023', 'Total Net Worth': 138000, 'Cash': 740, 'Bank Accounts': 24500, 'Funds': 39000, 'Stocks': 19500, 'Commodities': 6800, 'Crypto': 59000, 'Real Estate': 450000, 'Inventory': 7900 },
  ...netWorthDataYTD,
]

// 5 Year data (quarterly for 20 quarters)
const netWorthData5Year: NetWorthDataPoint[] = [
  { month: 'Q1 2020', 'Total Net Worth': 80000, 'Cash': 400, 'Bank Accounts': 12000, 'Funds': 18000, 'Stocks': 8000, 'Commodities': 3000, 'Crypto': 30000, 'Real Estate': 400000, 'Inventory': 5000 },
  { month: 'Q2 2020', 'Total Net Worth': 85000, 'Cash': 450, 'Bank Accounts': 13000, 'Funds': 20000, 'Stocks': 9000, 'Commodities': 3200, 'Crypto': 32000, 'Real Estate': 410000, 'Inventory': 5200 },
  { month: 'Q3 2020', 'Total Net Worth': 90000, 'Cash': 500, 'Bank Accounts': 14000, 'Funds': 22000, 'Stocks': 10000, 'Commodities': 3500, 'Crypto': 35000, 'Real Estate': 420000, 'Inventory': 5500 },
  { month: 'Q4 2020', 'Total Net Worth': 95000, 'Cash': 520, 'Bank Accounts': 15000, 'Funds': 24000, 'Stocks': 11000, 'Commodities': 3800, 'Crypto': 38000, 'Real Estate': 430000, 'Inventory': 5800 },
  { month: 'Q1 2021', 'Total Net Worth': 100000, 'Cash': 550, 'Bank Accounts': 16000, 'Funds': 26000, 'Stocks': 12000, 'Commodities': 4000, 'Crypto': 40000, 'Real Estate': 435000, 'Inventory': 6000 },
  { month: 'Q2 2021', 'Total Net Worth': 105000, 'Cash': 580, 'Bank Accounts': 17000, 'Funds': 28000, 'Stocks': 13000, 'Commodities': 4200, 'Crypto': 42000, 'Real Estate': 440000, 'Inventory': 6200 },
  { month: 'Q3 2021', 'Total Net Worth': 110000, 'Cash': 600, 'Bank Accounts': 18000, 'Funds': 30000, 'Stocks': 14000, 'Commodities': 4500, 'Crypto': 45000, 'Real Estate': 442000, 'Inventory': 6500 },
  { month: 'Q4 2021', 'Total Net Worth': 115000, 'Cash': 620, 'Bank Accounts': 19000, 'Funds': 32000, 'Stocks': 15000, 'Commodities': 4800, 'Crypto': 48000, 'Real Estate': 444000, 'Inventory': 6800 },
  { month: 'Q1 2022', 'Total Net Worth': 118000, 'Cash': 640, 'Bank Accounts': 20000, 'Funds': 34000, 'Stocks': 16000, 'Commodities': 5000, 'Crypto': 50000, 'Real Estate': 446000, 'Inventory': 7000 },
  { month: 'Q2 2022', 'Total Net Worth': 122000, 'Cash': 660, 'Bank Accounts': 21000, 'Funds': 35000, 'Stocks': 17000, 'Commodities': 5200, 'Crypto': 52000, 'Real Estate': 447000, 'Inventory': 7200 },
  { month: 'Q3 2022', 'Total Net Worth': 125000, 'Cash': 680, 'Bank Accounts': 22000, 'Funds': 36000, 'Stocks': 18000, 'Commodities': 5500, 'Crypto': 54000, 'Real Estate': 448000, 'Inventory': 7400 },
  { month: 'Q4 2022', 'Total Net Worth': 130000, 'Cash': 700, 'Bank Accounts': 23000, 'Funds': 37000, 'Stocks': 19000, 'Commodities': 5800, 'Crypto': 56000, 'Real Estate': 449000, 'Inventory': 7600 },
  { month: 'Q1 2023', 'Total Net Worth': 133000, 'Cash': 720, 'Bank Accounts': 23500, 'Funds': 38000, 'Stocks': 19500, 'Commodities': 6000, 'Crypto': 57000, 'Real Estate': 449500, 'Inventory': 7700 },
  { month: 'Q2 2023', 'Total Net Worth': 136000, 'Cash': 740, 'Bank Accounts': 24000, 'Funds': 38500, 'Stocks': 19700, 'Commodities': 6500, 'Crypto': 58000, 'Real Estate': 449800, 'Inventory': 7800 },
  { month: 'Q3 2023', 'Total Net Worth': 138000, 'Cash': 760, 'Bank Accounts': 24500, 'Funds': 39000, 'Stocks': 19800, 'Commodities': 6800, 'Crypto': 59000, 'Real Estate': 450000, 'Inventory': 7900 },
  { month: 'Q4 2023', 'Total Net Worth': 140000, 'Cash': 780, 'Bank Accounts': 25000, 'Funds': 39500, 'Stocks': 19900, 'Commodities': 6900, 'Crypto': 60000, 'Real Estate': 450000, 'Inventory': 8000 },
  { month: 'Q1 2024', 'Total Net Worth': 145000, 'Cash': 850, 'Bank Accounts': 27000, 'Funds': 44000, 'Stocks': 22000, 'Commodities': 7400, 'Crypto': 70000, 'Real Estate': 450000, 'Inventory': 8000 },
  { month: 'Q2 2024', 'Total Net Worth': 160000, 'Cash': 900, 'Bank Accounts': 28000, 'Funds': 46000, 'Stocks': 23000, 'Commodities': 7600, 'Crypto': 75000, 'Real Estate': 450000, 'Inventory': 8000 },
]

// Max data (yearly for 10 years)
const netWorthDataMax: NetWorthDataPoint[] = [
  { month: '2015', 'Total Net Worth': 50000, 'Cash': 300, 'Bank Accounts': 8000, 'Funds': 10000, 'Stocks': 5000, 'Commodities': 2000, 'Crypto': 20000, 'Real Estate': 350000, 'Inventory': 3000 },
  { month: '2016', 'Total Net Worth': 60000, 'Cash': 350, 'Bank Accounts': 10000, 'Funds': 12000, 'Stocks': 6000, 'Commodities': 2500, 'Crypto': 25000, 'Real Estate': 370000, 'Inventory': 3500 },
  { month: '2017', 'Total Net Worth': 70000, 'Cash': 400, 'Bank Accounts': 12000, 'Funds': 15000, 'Stocks': 7000, 'Commodities': 3000, 'Crypto': 30000, 'Real Estate': 390000, 'Inventory': 4000 },
  { month: '2018', 'Total Net Worth': 75000, 'Cash': 450, 'Bank Accounts': 14000, 'Funds': 18000, 'Stocks': 8000, 'Commodities': 3500, 'Crypto': 32000, 'Real Estate': 400000, 'Inventory': 4500 },
  { month: '2019', 'Total Net Worth': 78000, 'Cash': 480, 'Bank Accounts': 15000, 'Funds': 20000, 'Stocks': 9000, 'Commodities': 4000, 'Crypto': 35000, 'Real Estate': 410000, 'Inventory': 5000 },
  { month: '2020', 'Total Net Worth': 85000, 'Cash': 500, 'Bank Accounts': 16000, 'Funds': 24000, 'Stocks': 11000, 'Commodities': 3800, 'Crypto': 38000, 'Real Estate': 430000, 'Inventory': 5800 },
  { month: '2021', 'Total Net Worth': 105000, 'Cash': 600, 'Bank Accounts': 18000, 'Funds': 30000, 'Stocks': 14000, 'Commodities': 4500, 'Crypto': 45000, 'Real Estate': 442000, 'Inventory': 6500 },
  { month: '2022', 'Total Net Worth': 125000, 'Cash': 680, 'Bank Accounts': 22000, 'Funds': 36000, 'Stocks': 18000, 'Commodities': 5500, 'Crypto': 54000, 'Real Estate': 448000, 'Inventory': 7400 },
  { month: '2023', 'Total Net Worth': 138000, 'Cash': 740, 'Bank Accounts': 24500, 'Funds': 39000, 'Stocks': 19800, 'Commodities': 6800, 'Crypto': 59000, 'Real Estate': 450000, 'Inventory': 7900 },
  { month: '2024', 'Total Net Worth': 180000, 'Cash': 1000, 'Bank Accounts': 30000, 'Funds': 50000, 'Stocks': 25000, 'Commodities': 8000, 'Crypto': 85000, 'Real Estate': 450000, 'Inventory': 8000 },
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
  const [timeFrame, setTimeFrame] = useState<'YTD' | '1Year' | '5Year' | 'Max'>('Max')

  const getNetWorthData = () => {
    switch (timeFrame) {
      case 'YTD':
        return netWorthDataYTD
      case '1Year':
        return netWorthData1Year
      case '5Year':
        return netWorthData5Year
      case 'Max':
        return netWorthDataMax
      default:
        return netWorthDataYTD
    }
  }

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
            <TotalText variant="neutral">{formatCHF(totalNetWorth)}</TotalText>
          </div>

          {/* Monthly Inflow KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <Heading level={2} className="mb-2">
              Monthly Inflow
            </Heading>
            <TotalText variant="inflow">{formatCHF(monthlyInflow)}</TotalText>
          </div>

          {/* Monthly Outflow KPI */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <Heading level={2} className="mb-2">
              Monthly Outflow
            </Heading>
            <TotalText variant="outflow">{formatCHF(monthlyOutflow)}</TotalText>
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
            <LineChart data={getNetWorthData()}>
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
                  fontSize: '0.60rem',
                  fontWeight: '400',
                }}
                formatter={(value: number) => formatCHF(value)}
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
                dot={{ fill: CHART_COLORS.gold, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="Cash"
                stroke={CHART_COLORS.accent1}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.accent1, r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Bank Accounts"
                stroke={CHART_COLORS.accent2}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.accent2, r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Funds"
                stroke={CHART_COLORS.accent3}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.accent3, r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Stocks"
                stroke={CHART_COLORS.success}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.success, r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Commodities"
                stroke={CHART_COLORS.bronze}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.bronze, r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Crypto"
                stroke="#F8C445"
                strokeWidth={2}
                dot={{ fill: '#F8C445', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Real Estate"
                stroke="#4A56FF"
                strokeWidth={2}
                dot={{ fill: '#4A56FF', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Inventory"
                stroke={CHART_COLORS.muted1}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS.muted1, r: 3 }}
                activeDot={{ r: 5 }}
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
                  fontSize: '0.60rem',
                  fontWeight: '400',
                }}
                formatter={(value: number) => formatCHF(value)}
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

        {/* Fifth Row: Cashflow Sankey Diagram (Full Width) */}
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
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

