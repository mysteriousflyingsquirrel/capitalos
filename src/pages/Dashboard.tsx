import { useState, useMemo, useEffect } from 'react'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
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
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useIncognito } from '../contexts/IncognitoContext'
import { useApiKeys } from '../contexts/ApiKeysContext'
import { useData } from '../contexts/DataContext'
import { formatMoney } from '../lib/currency'
import { formatDate } from '../lib/dateFormat'
import type { CurrencyCode } from '../lib/currency'
import type { NetWorthSnapshot } from '../services/snapshotService'
import type { NetWorthItem, NetWorthTransaction } from './NetWorth'
import type { NetWorthCategory } from './NetWorth'
import { calculateBalanceChf, calculateCoinAmount, calculateHoldings } from '../services/balanceCalculationService'
import type { InflowItem, OutflowItem } from './Cashflow'
import { fetchCryptoData } from '../services/cryptoCompareService'
import { NetWorthCalculationService } from '../services/netWorthCalculationService'
import { getDailyPricesMap, categoryUsesYahoo } from '../services/market-data/DailyPriceService'

// TypeScript interfaces
interface NetWorthDataPoint {
  month: string
  'Total Net Worth': number
  'Cash': number
  'Bank Accounts': number
  'Retirement Funds': number
  'Index Funds': number
  'Stocks': number
  'Commodities': number
  'Crypto': number
  'Perpetuals': number
  'Real Estate': number
  'Depreciating Assets': number
}

interface AssetAllocationItem {
  name: string
  value: number
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
}



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
  // Additional colors for more variety
  purple: '#9B59B6',
  orange: '#F39C12',
  teal: '#16A085',
  pink: '#E91E63',
  indigo: '#5C6BC0',
  cyan: '#00BCD4',
  lime: '#CDDC39',
  amber: '#FFC107',
  deepOrange: '#FF5722',
  blueGrey: '#607D8B',
}

// Extended color array for pie charts and multiple elements
const PIE_CHART_COLORS = [
  CHART_COLORS.gold,
  CHART_COLORS.accent1,
  CHART_COLORS.accent2,
  CHART_COLORS.accent3,
  CHART_COLORS.success,
  CHART_COLORS.purple,
  CHART_COLORS.orange,
  CHART_COLORS.teal,
  CHART_COLORS.pink,
  CHART_COLORS.indigo,
  CHART_COLORS.cyan,
  CHART_COLORS.lime,
  CHART_COLORS.amber,
  CHART_COLORS.deepOrange,
  CHART_COLORS.blueGrey,
  CHART_COLORS.bronze,
  CHART_COLORS.danger,
  CHART_COLORS.muted1,
  CHART_COLORS.muted2,
]

// Helper component: SectionCard (same as Hyperliquid)
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

// PnL Box Component (same as Hyperliquid)
interface PnLBoxProps {
  title: string
  value: number | null
  /** Snapshot date label shown top-right (dd/mm/yyyy) */
  snapshotDateLabel?: string | null
}

function PnLBox({ title, value, snapshotDateLabel }: PnLBoxProps) {
  const { isIncognito } = useIncognito()
  const { baseCurrency } = useCurrency()
  const formatCurrency = (val: number) => formatMoney(val, baseCurrency, 'ch', { incognito: isIncognito })
  
  if (value === null) {
    return (
      <div className="bg-bg-surface-2 border border-border-subtle rounded-card p-4 relative">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="text-text-muted text-xs md:text-sm">{title}</div>
          {snapshotDateLabel != null && snapshotDateLabel !== '' && (
            <div className="text-text-muted text-[0.65rem] md:text-[0.7rem] whitespace-nowrap text-right shrink-0">
              {snapshotDateLabel}
            </div>
          )}
        </div>
        <div className="text-text-muted text-lg font-medium">N/A</div>
      </div>
    )
  }
  
  const isPositive = value >= 0

  return (
    <div className="bg-bg-surface-2 border border-border-subtle rounded-card p-4 relative">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-text-muted text-xs md:text-sm">{title}</div>
        {snapshotDateLabel != null && snapshotDateLabel !== '' && (
          <div className="text-text-muted text-[0.65rem] md:text-[0.7rem] whitespace-nowrap text-right shrink-0">
            {snapshotDateLabel}
          </div>
        )}
      </div>
      <TotalText variant={isPositive ? 'inflow' : 'outflow'} className="block">
        {formatCurrency(value)}
      </TotalText>
    </div>
  )
}

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
  const [timeFrame, setTimeFrame] = useState<'YTD' | '6M' | '1Y' | '5Y' | 'MAX'>('MAX')
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const { rapidApiKey } = useApiKeys()

  // Load data from DataContext (includes merged Perpetuals data)
  const { uid } = useAuth()
  const { data } = useData()
  const netWorthItems = data.netWorthItems
  const transactions = data.transactions
  const inflowItems = data.inflowItems
  const outflowItems = data.outflowItems
  const snapshots = data.snapshots
  
  // Store current crypto prices (ticker -> USD price)
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  // Store current stock/index fund/commodity prices (ticker -> USD price)
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({})
  const [usdToChfRate, setUsdToChfRate] = useState<number | null>(null)
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)

  // Sync prices from DataContext (ensures prices are updated from periodic refresh)
  useEffect(() => {
    // Sync crypto prices from DataContext
    if (Object.keys(data.cryptoPrices).length > 0) {
      setCryptoPrices(prev => ({ ...prev, ...data.cryptoPrices }))
    }
    // Sync stock prices from DataContext
    if (Object.keys(data.stockPrices).length > 0) {
      setStockPrices(prev => ({ ...prev, ...data.stockPrices }))
    }
    // Sync USD to CHF rate from DataContext
    if (data.usdToChfRate !== null) {
      setUsdToChfRate(data.usdToChfRate)
    }
  }, [data.cryptoPrices, data.stockPrices, data.usdToChfRate])
  
  // Track window width for responsive x-axis ticks
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Data is loaded by DataContext, no need to load here

  // Fetch crypto prices and USD→CHF rate for all crypto items
  const fetchAllCryptoPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
      const cryptoItems = netWorthItems.filter((item: NetWorthItem) => item.category === 'Crypto')
      const tickers = cryptoItems.map((item: NetWorthItem) => item.name.trim().toUpperCase())
      const uniqueTickers = [...new Set(tickers)]
      
      const { prices, usdToChfRate: rate } = await fetchCryptoData(uniqueTickers)
      
      // Update crypto prices
      setCryptoPrices(prev => ({ ...prev, ...prices }))
      
      // Update USD→CHF rate
      if (rate !== null) {
        setUsdToChfRate(rate)
      }
    } catch (error) {
      console.error('Error fetching crypto data:', error)
    } finally {
      if (showLoading) {
        setIsRefreshingPrices(false)
      }
    }
  }

  // Fetch stock/index fund/commodity prices for all relevant items (from daily Firestore cache)
  const fetchAllStockPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
      const stockItems = netWorthItems.filter((item: NetWorthItem) => categoryUsesYahoo(item.category))
      
      if (stockItems.length === 0) {
        return
      }

      const tickers = stockItems.map((item: NetWorthItem) => item.name.trim().toUpperCase())
      const uniqueTickers = [...new Set(tickers)]
      
      // Use daily Firestore cache - triggers API fetch if needed
      const prices = await getDailyPricesMap(uniqueTickers, uid || undefined)
      
      // Update stock prices
      setStockPrices(prev => ({ ...prev, ...prices }))
    } catch (error) {
      console.error('Error fetching stock prices:', error)
    } finally {
      if (showLoading) {
        setIsRefreshingPrices(false)
      }
    }
  }

  // Fetch all prices (crypto and stocks)
  const fetchAllPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
      // Fetch both in parallel
      await Promise.all([
        fetchAllCryptoPrices(false),
        fetchAllStockPrices(false),
      ])
    } finally {
      if (showLoading) {
        setIsRefreshingPrices(false)
      }
    }
  }

  useEffect(() => {
    if (netWorthItems.length > 0) {
      // Fetch immediately on page load
      fetchAllPrices()
      
      // Set up interval to fetch every 5 minutes (300000 ms)
      const interval = setInterval(() => {
        fetchAllPrices()
      }, 300000) // 5 minutes

      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netWorthItems]) // Re-fetch when items change

  // Perpetuals data is refreshed by DataContext, no need to refresh here

  // Pull-to-refresh functionality for mobile
  useEffect(() => {
    let touchStartY = 0
    let touchEndY = 0
    let isPulling = false

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      touchEndY = e.touches[0].clientY
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      
      // Only trigger pull-to-refresh if at the top of the page and pulling down
      if (scrollTop === 0 && touchEndY > touchStartY && touchEndY - touchStartY > 50) {
        isPulling = true
        // Prevent default scrolling while pulling
        if (touchEndY - touchStartY > 100) {
          e.preventDefault()
        }
      } else {
        isPulling = false
      }
    }

    const handleTouchEnd = () => {
      if (isPulling && touchEndY - touchStartY > 100) {
        // Trigger refresh
        fetchAllPrices(true)
      }
      isPulling = false
      touchStartY = 0
      touchEndY = 0
    }

    // Only add listeners on mobile devices
    if (window.innerWidth <= 768) {
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd, { passive: true })
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount


  // Calculate total net worth using shared calculation service
  const totalNetWorthChf = useMemo(() => {
    const result = NetWorthCalculationService.calculateTotals(
      netWorthItems,
      transactions,
      cryptoPrices,
      stockPrices,
      usdToChfRate,
      convert
    )
    return result.totalNetWorthChf
  }, [netWorthItems, transactions, cryptoPrices, stockPrices, usdToChfRate, convert])

  // Calculate monthly inflow/outflow from cashflow items
  const monthlyInflowChf = useMemo(() => {
    return inflowItems.reduce((sum, item) => sum + item.amountChf, 0)
  }, [inflowItems])

  const monthlyOutflowChf = useMemo(() => {
    return outflowItems.reduce((sum, item) => sum + item.amountChf, 0)
  }, [outflowItems])

  const monthlySpareChangeChf = monthlyInflowChf - monthlyOutflowChf

  // Helper function to calculate net worth at a specific date from transactions
  const calculateNetWorthAtDate = useMemo(() => {
    return (targetDate: Date): number => {
      // Filter transactions up to target date
      const transactionsUpToDate = transactions.filter((tx: NetWorthTransaction) => {
        const txDate = new Date(tx.date)
        return txDate <= targetDate
      })

      // Use same category totals approach as totalNetWorthChf
      const categoryTotals: Record<NetWorthCategory, number> = {
        'Cash': 0,
        'Bank Accounts': 0,
        'Retirement Funds': 0,
        'Index Funds': 0,
        'Stocks': 0,
        'Commodities': 0,
        'Crypto': 0,
        'Perpetuals': 0,
        'Real Estate': 0,
        'Depreciating Assets': 0,
      }

      netWorthItems.forEach((item: NetWorthItem) => {
        let balance: number
        if (item.category === 'Crypto') {
          // For Crypto: calculate coin amount from filtered transactions, use current price
          const coinAmount = calculateCoinAmount(item.id, transactionsUpToDate)
          const ticker = item.name.trim().toUpperCase()
          const currentPriceUsd = cryptoPrices[ticker] || 0
          if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
            // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
            const valueUsd = coinAmount * currentPriceUsd
            balance = valueUsd * usdToChfRate
          } else {
            // Fallback: calculateBalanceChf returns USD for crypto, need to convert to CHF
            const balanceUsd = calculateBalanceChf(item.id, transactionsUpToDate, item, cryptoPrices, convert)
            // Convert USD to CHF
            if (usdToChfRate && usdToChfRate > 0) {
              balance = balanceUsd * usdToChfRate
            } else {
              // Use convert function to convert USD to CHF (baseCurrency)
              balance = convert(balanceUsd, 'USD')
            }
          }
        } else if (item.category === 'Perpetuals') {
          // For Perpetuals: calculate from subcategories (convert each balance individually)
          if (!item.perpetualsData) {
            balance = 0
          } else {
            const { exchangeBalance } = item.perpetualsData
            
            // Sum all CHF balances directly (matching NetWorth page logic)
            // Only Exchange Balance contributes to total (Open Positions are displayed but not included)
            let totalChf = 0
            
            // Exchange Balance: convert each holdings to CHF and sum
            if (exchangeBalance) {
              exchangeBalance.forEach(balance => {
                const balanceChf = usdToChfRate && usdToChfRate > 0 
                  ? balance.holdings * usdToChfRate 
                  : convert(balance.holdings, 'USD')
                totalChf += balanceChf
              })
            }
            
            // Note: Open Positions are displayed but NOT included in the total perpetuals value
            balance = totalChf
          }
        } else {
          // For non-Crypto items, calculateBalanceChf returns CHF
          balance = calculateBalanceChf(item.id, transactionsUpToDate, item, cryptoPrices, convert)
        }
        // Ensure balance is a valid number
        const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
        categoryTotals[item.category] += validBalance
      })

      // Sum all category totals
      return Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)
    }
  }, [netWorthItems, transactions, cryptoPrices, stockPrices, usdToChfRate, convert])

  // Find the latest snapshot (by timestamp)
  const latestSnapshot = useMemo(() => {
    if (snapshots.length === 0) {
      return null
    }
    // Find snapshot with the highest timestamp
    return snapshots.reduce((latest, snapshot) => 
      snapshot.timestamp > latest.timestamp ? snapshot : latest
    )
  }, [snapshots])

  // Calculate daily PnL (difference between current net worth and latest snapshot)
  const dailyPnLChf = useMemo(() => {
    if (!latestSnapshot) {
      return null // No snapshots available
    }
    
    // Snapshots are stored in CHF, so we can use the total directly
    const latestNetWorth = convert(latestSnapshot.total, 'CHF')
    return totalNetWorthChf - latestNetWorth
  }, [totalNetWorthChf, latestSnapshot, convert])

  // Calculate daily PnL percentage
  const dailyPnLPercentage = useMemo(() => {
    if (!latestSnapshot || dailyPnLChf === null) {
      return null
    }
    
    const latestNetWorth = convert(latestSnapshot.total, 'CHF')
    if (latestNetWorth === 0) return 0
    return ((totalNetWorthChf - latestNetWorth) / latestNetWorth) * 100
  }, [totalNetWorthChf, latestSnapshot, dailyPnLChf, convert])

  // Format the latest snapshot's timestamp as date only (dd/mm/yyyy)
  const latestSnapshotDateTime = useMemo(() => {
    if (!latestSnapshot) {
      return null
    }
    const date = new Date(latestSnapshot.timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${day}/${month}/${year}`
  }, [latestSnapshot])

  // Helper function to format snapshot timestamp as date only (dd/mm/yyyy)
  const formatSnapshotDateTime = (snapshot: NetWorthSnapshot | null): string | null => {
    if (!snapshot) {
      return null
    }
    const date = new Date(snapshot.timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${day}/${month}/${year}`
  }

  // Find the snapshot used for Monthly PnL (last snapshot from previous month)
  const monthlyPnLSnapshot = useMemo(() => {
    if (snapshots.length === 0) {
      return null
    }

    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth()
    
    // Get the first day of the current month in UTC (snapshots before this are from previous month)
    const firstDayOfCurrentMonth = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0))
    
    // Find snapshots from the previous month (before the first day of current month)
    const previousMonthSnapshots = snapshots.filter(snapshot => {
      const snapshotDate = new Date(snapshot.timestamp)
      return snapshotDate < firstDayOfCurrentMonth
    })
    
    if (previousMonthSnapshots.length === 0) {
      return null
    }
    
    // Get the last snapshot from previous month (most recent one)
    return previousMonthSnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
  }, [snapshots])

  // Find the snapshot used for Weekly PnL (last snapshot before Monday 00:00 UTC of current week; week starts on Monday)
  const weeklyPnLSnapshot = useMemo(() => {
    if (snapshots.length === 0) {
      return null
    }

    const now = new Date()
    const d = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const offset = d === 0 ? 6 : d - 1
    const mondayThisWeekUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset, 0, 0, 0, 0))

    const beforeThisWeek = snapshots.filter((s) => new Date(s.timestamp) < mondayThisWeekUTC)
    if (beforeThisWeek.length === 0) {
      return null
    }

    return beforeThisWeek.reduce((latest, s) => (s.timestamp > latest.timestamp ? s : latest))
  }, [snapshots])

  // Find the snapshot used for YTD PnL (last snapshot from previous year)
  const ytdPnLSnapshot = useMemo(() => {
    if (snapshots.length === 0) {
      return null
    }

    const now = new Date()
    const currentYear = now.getUTCFullYear()
    
    // Get the first day of the current year in UTC (snapshots before this are from previous year)
    const firstDayOfCurrentYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0))
    
    // Find snapshots from the previous year (before the first day of current year)
    const previousYearSnapshots = snapshots.filter(snapshot => {
      const snapshotDate = new Date(snapshot.timestamp)
      return snapshotDate < firstDayOfCurrentYear
    })
    
    if (previousYearSnapshots.length === 0) {
      return null
    }
    
    // Get the last snapshot from previous year (most recent one)
    return previousYearSnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
  }, [snapshots])

  // Format timestamps for Monthly, Weekly, and YTD PnL
  const monthlyPnLSnapshotDateTime = useMemo(() => formatSnapshotDateTime(monthlyPnLSnapshot), [monthlyPnLSnapshot])
  const weeklyPnLSnapshotDateTime = useMemo(() => formatSnapshotDateTime(weeklyPnLSnapshot), [weeklyPnLSnapshot])
  const ytdPnLSnapshotDateTime = useMemo(() => formatSnapshotDateTime(ytdPnLSnapshot), [ytdPnLSnapshot])

  // Calculate monthly PnL (difference between current net worth and last snapshot of previous month)
  const monthlyPnLChf = useMemo(() => {
    if (monthlyPnLSnapshot) {
      // Use snapshot if available
      const previousMonthNetWorth = convert(monthlyPnLSnapshot.total, 'CHF')
      return totalNetWorthChf - previousMonthNetWorth
    }
    
    // If no snapshots, fall back to transaction-based calculation
    const now = new Date()
    const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
    const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
    return totalNetWorthChf - previousMonthNetWorth
  }, [totalNetWorthChf, monthlyPnLSnapshot, calculateNetWorthAtDate, convert])

  // Calculate monthly PnL percentage
  const monthlyPnLPercentage = useMemo(() => {
    if (monthlyPnLSnapshot) {
      // Use snapshot if available
      const previousMonthNetWorth = convert(monthlyPnLSnapshot.total, 'CHF')
      if (previousMonthNetWorth === 0) return 0
      return ((totalNetWorthChf - previousMonthNetWorth) / previousMonthNetWorth) * 100
    }
    
    // If no snapshots, fall back to transaction-based calculation
    const now = new Date()
    const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
    const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
    if (previousMonthNetWorth === 0) return 0
    return ((totalNetWorthChf - previousMonthNetWorth) / previousMonthNetWorth) * 100
  }, [totalNetWorthChf, monthlyPnLSnapshot, calculateNetWorthAtDate, convert])

  // Calculate Weekly PnL (current value vs last snapshot before Monday 00:00 UTC of this week)
  const weeklyPnLChf = useMemo(() => {
    if (!weeklyPnLSnapshot) return null
    const baselineChf = convert(weeklyPnLSnapshot.total, 'CHF')
    return totalNetWorthChf - baselineChf
  }, [totalNetWorthChf, weeklyPnLSnapshot, convert])

  const weeklyPnLPercentage = useMemo(() => {
    if (!weeklyPnLSnapshot || weeklyPnLChf === null) return null
    const baselineChf = convert(weeklyPnLSnapshot.total, 'CHF')
    if (baselineChf === 0) return 0
    return (weeklyPnLChf / baselineChf) * 100
  }, [totalNetWorthChf, weeklyPnLSnapshot, weeklyPnLChf, convert])

  // Calculate Year-to-Date (YTD) PnL (compare latest snapshot from previous year to current state)
  const ytdPnLChf = useMemo(() => {
    if (ytdPnLSnapshot) {
      // Use snapshot if available
      const previousYearNetWorth = convert(ytdPnLSnapshot.total, 'CHF')
      return totalNetWorthChf - previousYearNetWorth
    }
    
    // If no snapshots, consider previous year net worth to be 0
    return totalNetWorthChf
  }, [totalNetWorthChf, ytdPnLSnapshot, convert])

  // Calculate YTD PnL percentage
  const ytdPnLPercentage = useMemo(() => {
    if (ytdPnLSnapshot) {
      // Use snapshot if available
      const previousYearNetWorth = convert(ytdPnLSnapshot.total, 'CHF')
      if (previousYearNetWorth === 0) return 0
      return ((totalNetWorthChf - previousYearNetWorth) / previousYearNetWorth) * 100
    }
    
    // If no snapshots, consider previous year net worth to be 0
    // Percentage is undefined when starting from 0, return 0
    return 0
  }, [totalNetWorthChf, ytdPnLSnapshot, convert])


  // Convert values from CHF to baseCurrency
  const totalNetWorthConverted = convert(totalNetWorthChf, 'CHF')
  const monthlyInflowConverted = convert(monthlyInflowChf, 'CHF')
  const monthlyOutflowConverted = convert(monthlyOutflowChf, 'CHF')
  const dailyPnLConverted = dailyPnLChf !== null ? convert(dailyPnLChf, 'CHF') : null
  const weeklyPnLConverted = weeklyPnLChf !== null ? convert(weeklyPnLChf, 'CHF') : null
  const monthlyPnLConverted = convert(monthlyPnLChf, 'CHF')
  const ytdPnLConverted = convert(ytdPnLChf, 'CHF')

  // Calculate USD value for total net worth
  const totalNetWorthInUsd = useMemo(
    () => totalNetWorthChf * (exchangeRates?.rates['USD'] || 1),
    [totalNetWorthChf, exchangeRates]
  )

  // Calculate USD values for PnL
  const dailyPnLInUsd = useMemo(
    () => dailyPnLChf !== null ? dailyPnLChf * (exchangeRates?.rates['USD'] || 1) : null,
    [dailyPnLChf, exchangeRates]
  )
  const weeklyPnLInUsd = useMemo(
    () => (weeklyPnLChf !== null ? weeklyPnLChf * (exchangeRates?.rates['USD'] || 1) : null),
    [weeklyPnLChf, exchangeRates]
  )
  const monthlyPnLInUsd = useMemo(
    () => monthlyPnLChf * (exchangeRates?.rates['USD'] || 1),
    [monthlyPnLChf, exchangeRates]
  )

  const ytdPnLInUsd = useMemo(
    () => ytdPnLChf * (exchangeRates?.rates['USD'] || 1),
    [ytdPnLChf, exchangeRates]
  )

  // Format currency helper
  const { isIncognito } = useIncognito()
  const formatCurrencyValue = (value: number) => formatMoney(value, baseCurrency, 'ch', { incognito: isIncognito })
  const formatUsd = (value: number) => formatMoney(value, 'USD', 'ch', { incognito: isIncognito })

  // Format for chart ticks
  const formatCurrencyTick = (value: number) => {
    if (isIncognito) return '****'
    const converted = convert(value, 'CHF')
    if (!Number.isFinite(converted)) return ''

    const abs = Math.abs(converted)
    const formatScaled = (n: number) => {
      const absN = Math.abs(n)
      const fixed = absN >= 10 ? n.toFixed(0) : n.toFixed(1)
      return fixed.replace(/\.0$/, '')
    }

    if (abs >= 1_000_000) return `${formatScaled(converted / 1_000_000)}M`
    if (abs >= 1_000) return `${formatScaled(converted / 1_000)}k`
    return `${Math.round(converted)}`
  }

  // Calculate asset allocation from net worth items using shared calculation service
  const assetAllocationData = useMemo(() => {
    const result = NetWorthCalculationService.calculateTotals(
      netWorthItems,
      transactions,
      cryptoPrices,
      stockPrices,
      usdToChfRate,
      convert
    )
    const categoryTotals = result.categoryTotals

    const total = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)
    if (total === 0 || isNaN(total)) return []

    // Return actual values, not percentages - the pie chart will calculate percentages automatically
    // Include all categories with valid positive values
    return Object.entries(categoryTotals)
      .map(([name, value]) => ({
        name,
        value: isNaN(value) || !isFinite(value) ? 0 : Math.max(0, value),
      }))
      .filter(({ value }) => value > 0) // Only show categories with positive values in the chart
  }, [netWorthItems, transactions, cryptoPrices, stockPrices, usdToChfRate, convert])

  // Calculate inflow breakdown
  const inflowBreakdownData = useMemo(() => {
    const groupTotals: Record<string, number> = {}
    inflowItems.forEach(item => {
      groupTotals[item.group] = (groupTotals[item.group] || 0) + item.amountChf
    })

    const total = Object.values(groupTotals).reduce((sum, val) => sum + val, 0)
    if (total === 0) return []

    // Return actual values, not percentages - the pie chart will calculate percentages automatically
    return Object.entries(groupTotals)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value: value,
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

    // Return actual values, not percentages - the pie chart will calculate percentages automatically
    return Object.entries(groupTotals)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value: value,
      }))
  }, [outflowItems])

  // Generate net worth evolution data from snapshots (only last snapshot per month)
  const netWorthData = useMemo(() => {
    if (snapshots.length === 0 || !convert) {
      return []
    }

    // Calculate cutoff timestamp based on timeframe (using UTC)
    const now = new Date()
    let cutoffTimestamp: number | null = null

    switch (timeFrame) {
      case 'YTD':
        cutoffTimestamp = Date.UTC(now.getUTCFullYear(), 0, 1)
        break
      case '6M':
        cutoffTimestamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)
        break
      case '1Y':
        cutoffTimestamp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1)
        break
      case '5Y':
        cutoffTimestamp = Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), 1)
        break
      case 'MAX':
      default:
        cutoffTimestamp = null
        break
    }

    // Get current year and month in UTC (to exclude current month)
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth() + 1 // 1-12 for comparison with date field

    // Filter snapshots by timeframe and exclude current month
    // Use the date field (YYYY-MM-DD) instead of parsing timestamp to avoid timezone issues
    const filteredSnapshots = snapshots.filter(snapshot => {
      // Skip if date is missing or malformed
      if (!snapshot.date || typeof snapshot.date !== 'string') {
        return false
      }
      
      // Parse date field (YYYY-MM-DD) to get year and month
      const dateParts = snapshot.date.split('-')
      if (dateParts.length < 2) {
        return false
      }
      
      const snapshotYearStr = dateParts[0]
      const snapshotMonthStr = dateParts[1]
      const snapshotYear = parseInt(snapshotYearStr, 10)
      const snapshotMonth = parseInt(snapshotMonthStr, 10) // 1-12
      
      // Skip if parsing failed
      if (isNaN(snapshotYear) || isNaN(snapshotMonth)) {
        return false
      }
      
      // Exclude snapshots from current month (only show completed months)
      if (snapshotYear === currentYear && snapshotMonth === currentMonth) {
        return false
      }
      
      // Apply timeframe filter if specified
      if (cutoffTimestamp !== null && snapshot.timestamp < cutoffTimestamp) {
        return false
      }
      return true
    })

    // Group snapshots by year-month and keep only the last one per month
    // Use a Map with year-month as key to ensure no duplicates
    const snapshotsByMonth = new Map<string, NetWorthSnapshot>()
    
    filteredSnapshots.forEach(snapshot => {
      // Parse date field (YYYY-MM-DD) to get year-month key
      if (!snapshot.date || typeof snapshot.date !== 'string') {
        return
      }
      
      const dateParts = snapshot.date.split('-')
      if (dateParts.length < 2) {
        return
      }
      
      const yearStr = dateParts[0]
      const monthStr = dateParts[1]
      const monthKey = `${yearStr}-${monthStr}` // Already in YYYY-MM format
      
      // Keep only the snapshot with the latest timestamp for each month
      const existing = snapshotsByMonth.get(monthKey)
      if (!existing || snapshot.timestamp > existing.timestamp) {
        snapshotsByMonth.set(monthKey, snapshot)
      }
    })

    // Convert to array, sort by timestamp, and create chart data
    const chartData: NetWorthDataPoint[] = Array.from(snapshotsByMonth.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(snapshot => {
        // Parse date field (YYYY-MM-DD) to create month label
        if (!snapshot.date || typeof snapshot.date !== 'string') {
          return null
        }
        
        const dateParts = snapshot.date.split('-')
        if (dateParts.length < 2) {
          return null
        }
        
        const yearStr = dateParts[0]
        const monthStr = dateParts[1]
        const year = parseInt(yearStr, 10)
        const month = parseInt(monthStr, 10) - 1 // Convert to 0-indexed for Date constructor
        
        if (isNaN(year) || isNaN(month)) {
          return null
        }
        
        const date = new Date(Date.UTC(year, month, 1))
        const monthLabel = date.toLocaleString('en-US', { month: 'short', year: 'numeric' })

        return {
          month: monthLabel,
          'Total Net Worth': convert(snapshot.total, 'CHF'),
          'Cash': convert(snapshot.categories['Cash'] || 0, 'CHF'),
          'Bank Accounts': convert(snapshot.categories['Bank Accounts'] || 0, 'CHF'),
          'Retirement Funds': convert(snapshot.categories['Retirement Funds'] || 0, 'CHF'),
          'Index Funds': convert(snapshot.categories['Index Funds'] || 0, 'CHF'),
          'Stocks': convert(snapshot.categories['Stocks'] || 0, 'CHF'),
          'Commodities': convert(snapshot.categories['Commodities'] || 0, 'CHF'),
          'Crypto': convert(snapshot.categories['Crypto'] || 0, 'CHF'),
          'Perpetuals': convert(snapshot.categories['Perpetuals'] || 0, 'CHF'),
          'Real Estate': convert(snapshot.categories['Real Estate'] || 0, 'CHF'),
          'Depreciating Assets': convert(snapshot.categories['Depreciating Assets'] || 0, 'CHF'),
        }
      })
      .filter((item): item is NetWorthDataPoint => item !== null)

    // Add current month snapshot as last entry if it exists
    const currentMonthSnapshots = snapshots.filter(snapshot => {
      if (!snapshot.date || typeof snapshot.date !== 'string') {
        return false
      }
      
      const dateParts = snapshot.date.split('-')
      if (dateParts.length < 2) {
        return false
      }
      
      const snapshotYearStr = dateParts[0]
      const snapshotMonthStr = dateParts[1]
      const snapshotYear = parseInt(snapshotYearStr, 10)
      const snapshotMonth = parseInt(snapshotMonthStr, 10)
      
      if (isNaN(snapshotYear) || isNaN(snapshotMonth)) {
        return false
      }
      
      return snapshotYear === currentYear && snapshotMonth === currentMonth
    })

    if (currentMonthSnapshots.length > 0) {
      // Get the last snapshot of current month (by timestamp)
      const lastCurrentMonthSnapshot = currentMonthSnapshots.reduce((latest, snapshot) => {
        return snapshot.timestamp > latest.timestamp ? snapshot : latest
      })

      // Parse date field to create month label
      if (!lastCurrentMonthSnapshot.date || typeof lastCurrentMonthSnapshot.date !== 'string') {
        return chartData
      }
      
      const dateParts = lastCurrentMonthSnapshot.date.split('-')
      if (dateParts.length < 2) {
        return chartData
      }
      
      const yearStr = dateParts[0]
      const monthStr = dateParts[1]
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10) - 1
      
      if (isNaN(year) || isNaN(month)) {
        return chartData
      }
      
      const date = new Date(Date.UTC(year, month, 1))
      const monthLabel = date.toLocaleString('en-US', { month: 'short', year: 'numeric' })

      chartData.push({
        month: monthLabel,
        'Total Net Worth': convert(lastCurrentMonthSnapshot.total, 'CHF'),
        'Cash': convert(lastCurrentMonthSnapshot.categories['Cash'] || 0, 'CHF'),
        'Bank Accounts': convert(lastCurrentMonthSnapshot.categories['Bank Accounts'] || 0, 'CHF'),
        'Retirement Funds': convert(lastCurrentMonthSnapshot.categories['Retirement Funds'] || 0, 'CHF'),
        'Index Funds': convert(lastCurrentMonthSnapshot.categories['Index Funds'] || 0, 'CHF'),
        'Stocks': convert(lastCurrentMonthSnapshot.categories['Stocks'] || 0, 'CHF'),
        'Commodities': convert(lastCurrentMonthSnapshot.categories['Commodities'] || 0, 'CHF'),
        'Crypto': convert(lastCurrentMonthSnapshot.categories['Crypto'] || 0, 'CHF'),
        'Perpetuals': convert(lastCurrentMonthSnapshot.categories['Perpetuals'] || 0, 'CHF'),
        'Real Estate': convert(lastCurrentMonthSnapshot.categories['Real Estate'] || 0, 'CHF'),
        'Depreciating Assets': convert(lastCurrentMonthSnapshot.categories['Depreciating Assets'] || 0, 'CHF'),
      })
    }

    return chartData
  }, [snapshots, convert, timeFrame])

  // Calculate dynamic interval for x-axis ticks based on data length and window width
  const xAxisInterval = useMemo(() => {
    const dataLength = netWorthData.length
    if (dataLength === 0) return 0
    
    // Estimate available width for chart (accounting for padding and margins)
    // Chart container is typically ~90% of window width on large screens
    const estimatedChartWidth = windowWidth > 1024 
      ? (windowWidth - 250) * 0.9 // Subtract sidebar width (250px) and padding
      : windowWidth * 0.9
    
    // Calculate how many ticks we can fit (each tick needs ~40px with rotation for double density)
    // Reduced from 80px to 40px to show approximately double the number of ticks
    const minTickWidth = 40
    const maxTicks = Math.floor(estimatedChartWidth / minTickWidth)
    
    // Calculate interval to show approximately maxTicks ticks
    // But ensure we show at least 6-8 ticks (doubled from 3-4) and at most all ticks
    const targetTicks = Math.max(6, Math.min(maxTicks, dataLength))
    const interval = dataLength > targetTicks ? Math.floor(dataLength / targetTicks) : 0
    
    return interval
  }, [netWorthData.length, windowWidth])

  return (
    <div className="min-h-screen px-2 lg:px-6 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Dashboard</Heading>
        
        {/* Total Net Worth, Performance, Monthly Cashflow — mobile: TNW, Perf, MC; desktop: TNW+MC row, then Perf */}
        <div className="flex flex-col gap-6 md:grid md:grid-cols-2">
          {/* Total Net Worth KPI — mobile 1st, desktop top-left */}
          <div className="order-1 md:order-1 bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <Heading level={2}>Total Net Worth</Heading>
            </div>
            <div className="flex flex-col space-y-1">
              <TotalText variant={totalNetWorthConverted >= 0 ? 'inflow' : 'outflow'} className="text-[1.296rem] lg:text-[1.5525rem]">
                {formatCurrencyValue(totalNetWorthConverted)}
              </TotalText>
              <TotalText variant={totalNetWorthInUsd >= 0 ? 'inflow' : 'outflow'}>
                {formatUsd(totalNetWorthInUsd)}
              </TotalText>
            </div>
          </div>

          {/* Monthly Cashflow KPI — mobile 3rd, desktop top-right */}
          <div className="order-3 md:order-2 bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <Heading level={2}>Monthly Cashflow</Heading>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <TotalText variant="inflow">{formatCurrencyValue(monthlyInflowConverted)}</TotalText>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                <TotalText variant="outflow">{formatCurrencyValue(monthlyOutflowConverted)}</TotalText>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <radialGradient id="IconifyId17ecdb2904d178eab14122" cx="2218.4" cy="26.957" r="74.733" gradientTransform="matrix(-1.0422 0 0 1 2371.6 0)" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FFCA28" offset=".599"></stop>
                      <stop stopColor="#FFB300" offset="1"></stop>
                    </radialGradient>
                    <path id="IconifyId17ecdb2904d178eab14123" d="M32.34 71.87l.24-.03l-.22-8.84c0-4.85 1.52-10.42 8.33-11.63c3.5-.62 7.44.91 8.59.91s1.26-.99 1.26-.99l.07-38c0-4.62 2.88-9.02 8.37-9.02s8.59 3.74 8.59 9l.84 37.11s.32 1.57.57 1.65c1.46.44 3.32-1.36 8.67-.37s6.96 5.37 8.75 5.73s3.03-.7 8.08-.7s9.49 3.93 9.49 8.78l-.34 29.75c0 4.12-3.47 8.25-4.27 9.14c-2.82 3.17-4.36 7.19-4.36 11.36v2c0 4.73-4.19 6.53-9.12 6.55l-34.8.17c-4.65.02-8.43-2.91-8.43-8.07s-.49-9.81-4.63-11.85s-12.39-12-13.19-21.98c-.55-6.93 2.23-10.08 7.51-10.67z"></path>
                    <clipPath id="IconifyId17ecdb2904d178eab14124">
                      <use xlinkHref="#IconifyId17ecdb2904d178eab14123"></use>
                    </clipPath>
                  </defs>
                  <path d="M50.98 122.96c-3.16 0-6.86-1.72-6.86-6.57c0-5.09-.42-10.72-5.45-13.19c-3.46-1.7-12.44-13.2-13.11-22.8c-.4-5.7 1.91-6.53 6.09-8.03c.42-.15.85-.3 1.28-.46c1.07-.4 1.07-.4.93-8.93c0-5.96 2.32-9.28 7.1-10.13c.47-.08.98-.12 1.53-.12c1.71 0 3.47.41 4.75.7c.89.21 1.53.35 2.05.35a2.68 2.68 0 0 0 2.75-2.32c.01-.06.01-.11.01-.17l.07-38c0-3.62 2.15-7.52 6.87-7.52c4.44 0 7.09 2.8 7.09 7.5l.84 37.15c0 .09.01.18.03.27c.33 1.59.68 2.51 1.61 2.79c.3.09.61.13.94.13c.59 0 1.15-.13 1.79-.29c.83-.2 1.86-.45 3.29-.45c.87 0 1.81.09 2.81.28c2.92.54 4.55 2.27 5.86 3.65c.94.99 1.75 1.85 2.87 2.07c.35.07.69.1 1.05.1c.68 0 1.32-.12 2.07-.26c1.19-.23 2.67-.51 5.26-.51c4.33 0 7.99 3.34 7.99 7.28l-.34 29.73c0 3.31-2.94 6.81-4.14 8.17c-3.05 3.43-4.99 7.81-4.99 12.33v2.03c0 4.14-3.98 5.03-7.38 5.05l-34.66.17z" fill="url(#IconifyId17ecdb2904d178eab14122)"></path>
                  <path d="M59 7h.2c4.86 0 5.8 4.04 5.8 6.28v.07l.62 37.11c0 .18-.08.36-.05.53c.25 1.25.63 3.33 2.6 3.92c.44.13.87.2 1.35.2c.77 0 1.45-.17 2.13-.33c.83-.2 1.68-.41 2.93-.41c.78 0 1.63.08 2.53.25c2.44.45 3.76 1.85 5.04 3.21c1.02 1.08 2.08 2.2 3.67 2.52c.44.09.88.13 1.34.13c.82 0 1.56-.14 2.35-.29c1.13-.21 2.53-.48 4.98-.48c3.46 0 6.49 2.7 6.49 5.75l-.34 29.78c0 1.93-1.25 4.6-3.51 7.15c-3.29 3.7-5.12 8.43-5.12 13.3v2.02c0 .91-.22 3.55-6.13 3.57l-34.83.17c-2.59 0-5.38-1.33-5.38-5.07c0-4-.01-11.44-6.3-14.54c-3.15-1.55-11.66-12.61-12.28-21.56c-.32-4.57.93-5.02 5.09-6.51c.42-.15.86-.31 1.3-.47c1.97-.74 1.97-2.47 1.97-4c0-.71-.01-1.66-.02-2.61c-.02-1.85-.05-3.7-.05-3.7c0-6.84 3.34-8.23 5.86-8.68c.38-.07.81-.1 1.27-.1c1.54 0 3.2.38 4.41.66c.98.23 1.7.39 2.38.39c2.51 0 4.03-1.83 4.24-3.64c.01-.11.02-.23.02-.34l.07-38.14c0-2.23 1.13-6.16 5.37-6.16m-.02-2.7c-5.49 0-8.37 4.4-8.37 9.02l-.07 38s-.11.99-1.26.99c-.95 0-3.84-1.06-6.79-1.06c-.6 0-1.2.04-1.79.15c-6.82 1.21-8.33 6.78-8.33 11.63c0 0 .12 7.47.05 7.5c-4.8 1.79-8.86 2.5-8.34 10c.69 9.99 9.8 22 13.94 24.04s4.61 6.46 4.61 11.62c0 5.14 3.73 7.84 8.36 7.84h.05l34.85.06c4.93-.02 9.12-1.59 9.12-6.32v-2c0-4.17 1.54-8.19 4.36-11.36c.8-.9 4.32-5.02 4.32-9.14l.31-29.76c0-4.85-4.44-8.78-9.5-8.78c-4.32 0-5.86.77-7.33.77c-.25 0-.5-.02-.76-.07c-1.79-.36-3.4-4.74-8.75-5.73c-1.19-.22-2.2-.3-3.08-.3c-2.63 0-4.02.74-5.08.74a1.7 1.7 0 0 1-.51-.07c-.25-.08-.57-1.65-.57-1.65l-.84-37.11c-.01-5.27-3.1-9.01-8.6-9.01z" fill="#EDA600"></path>
                  <path d="M40.46 86.01c-1.27.88-6.13-2.09-7.6-7.08c-1.69-5.75-.13-11.25-.13-11.25s2.85 6.18 4.08 8.5c2.74 5.16 4.88 8.98 3.65 9.83z" clipPath="url(#IconifyId17ecdb2904d178eab14124)" fill="#EDA600"></path>
                </svg>
                <TotalText variant="spare">{formatCurrencyValue(convert(monthlySpareChangeChf, 'CHF'))}</TotalText>
              </div>
            </div>
          </div>
          {/* Performance Frame — mobile 2nd, desktop full-width row below TNW+MC */}
          <div className="order-2 md:order-3 md:col-span-2">
            <SectionCard title="Performance">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <PnLBox title="Daily PnL" value={dailyPnLConverted} snapshotDateLabel={latestSnapshotDateTime} />
                <PnLBox title="Weekly PnL" value={weeklyPnLConverted} snapshotDateLabel={weeklyPnLSnapshotDateTime} />
                <PnLBox title="Monthly PnL" value={monthlyPnLConverted} snapshotDateLabel={monthlyPnLSnapshotDateTime} />
                <PnLBox title="YTD PnL" value={ytdPnLConverted} snapshotDateLabel={ytdPnLSnapshotDateTime} />
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Second Row: Net Worth Evolution (Full Width) */}
        <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
          <div className="mb-6 pb-4 border-b border-border-strong">
            <div className="flex items-center justify-between">
              <div>
                <Heading level={2}>Net Worth Evolution</Heading>
                {snapshots.length > 0 && (
                  <div className="text-xs text-text-muted mt-1">
                    Last snapshot: {formatDate(snapshots[snapshots.length - 1].date)}
                  </div>
                )}
              </div>
              <select
                value={timeFrame}
                onChange={(e) => setTimeFrame(e.target.value as 'YTD' | '6M' | '1Y' | '5Y' | 'MAX')}
                className="bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text2 focus:outline-none focus:border-accent-blue"
              >
                <option value="YTD">YTD</option>
                <option value="6M">6M</option>
                <option value="1Y">1Y</option>
                <option value="5Y">5Y</option>
                <option value="MAX">MAX</option>
              </select>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={netWorthData}
              margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="month"
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                interval={xAxisInterval}
                angle={-45}
                textAnchor="end"
                height={60}
                minTickGap={40}
              />
              <YAxis
                stroke={CHART_COLORS.muted1}
                tick={{ fill: CHART_COLORS.muted1, fontSize: '0.648rem' }}
                tickFormatter={formatCurrencyTick}
                width={44}
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
                stroke={CHART_COLORS.danger}
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
                <Line
                  type="monotone"
                  dataKey="Cash"
                  stroke={CHART_COLORS.accent1}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Bank Accounts"
                  stroke={CHART_COLORS.accent2}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Retirement Funds"
                  stroke={CHART_COLORS.accent3}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Index Funds"
                  stroke={CHART_COLORS.purple}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Stocks"
                  stroke={CHART_COLORS.orange}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Commodities"
                  stroke={CHART_COLORS.teal}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Crypto"
                  stroke={CHART_COLORS.pink}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Perpetuals"
                  stroke={CHART_COLORS.lime}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Real Estate"
                  stroke={CHART_COLORS.indigo}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Depreciating Assets"
                  stroke={CHART_COLORS.cyan}
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Third Row: Asset Allocation + Inflow Breakdown + Outflow Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Asset Allocation Pie Chart */}
          <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
                  formatter={(value: number, name: string) => {
                    if (isIncognito) return '****'
                    const total = assetAllocationData.reduce((sum, item) => sum + item.value, 0)
                    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
                    return `${percent}%`
                  }}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.648rem', fontWeight: '400' }}
                  iconType="circle"
                  className="text2"
                  formatter={(value, entry) => {
                    if (isIncognito) return `**** in ${value}`
                    const item = assetAllocationData.find(item => item.name === value)
                    if (!item) return `${value}`
                    const total = assetAllocationData.reduce((sum, item) => sum + item.value, 0)
                    const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
                    return `${percent}% in ${value}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Inflow Breakdown Pie Chart */}
          <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
                  formatter={(value: number, name: string) => {
                    if (isIncognito) return '****'
                    const total = inflowBreakdownData.reduce((sum, item) => sum + item.value, 0)
                    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
                    return `${percent}%`
                  }}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.648rem', fontWeight: '400' }}
                  iconType="circle"
                  className="text2"
                  formatter={(value, entry) => {
                    if (isIncognito) return `**** in ${value}`
                    const total = inflowBreakdownData.reduce((sum, item) => sum + item.value, 0)
                    const item = inflowBreakdownData.find(item => item.name === value)
                    const percent = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
                    return `${percent}% in ${value}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Outflow Breakdown Pie Chart */}
          <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
                  formatter={(value: number, name: string) => {
                    if (isIncognito) return '****'
                    const total = outflowBreakdownData.reduce((sum, item) => sum + item.value, 0)
                    const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
                    return `${percent}%`
                  }}
                />
                <Legend
                  wrapperStyle={{ color: '#8B8F99', fontSize: '0.648rem', fontWeight: '400' }}
                  iconType="circle"
                  className="text2"
                  formatter={(value, entry) => {
                    if (isIncognito) return `**** in ${value}`
                    const total = outflowBreakdownData.reduce((sum, item) => sum + item.value, 0)
                    const item = outflowBreakdownData.find(item => item.name === value)
                    const percent = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
                    return `${percent}% in ${value}`
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>


      </div>
    </div>
  )
}

export default Dashboard

