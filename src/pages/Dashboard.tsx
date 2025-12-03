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
import { useAuth } from '../contexts/AuthContext'
import { useIncognito } from '../contexts/IncognitoContext'
import { useApiKeys } from '../contexts/ApiKeysContext'
import { formatMoney } from '../lib/currency'
import type { CurrencyCode } from '../lib/currency'
import {
  loadNetWorthItems,
  loadNetWorthTransactions,
  loadCashflowInflowItems,
  loadCashflowOutflowItems,
} from '../services/storageService'
import { loadSnapshots, type NetWorthSnapshot } from '../services/snapshotService'
import type { NetWorthItem, NetWorthTransaction } from './NetWorth'
import type { NetWorthCategory } from './NetWorth'
import { calculateBalanceChf, calculateCoinAmount, calculateHoldings } from './NetWorth'
import type { InflowItem, OutflowItem } from './Cashflow'
import { fetchCryptoData } from '../services/cryptoCompareService'
import { fetchStockPrices } from '../services/yahooFinanceService'

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
  const [timeFrame, setTimeFrame] = useState<'YTD' | '1M' | '3M' | '1Y' | '5Y' | 'MAX'>('MAX')
  const { baseCurrency, convert, exchangeRates } = useCurrency()
  const { rapidApiKey } = useApiKeys()

  // Load data from Firestore
  const { uid } = useAuth()
  const [netWorthItems, setNetWorthItems] = useState([])
  const [transactions, setTransactions] = useState([])
  const [inflowItems, setInflowItems] = useState([])
  const [outflowItems, setOutflowItems] = useState([])
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([])
  
  // Store current crypto prices (ticker -> USD price)
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  // Store current stock/index fund/commodity prices (ticker -> USD price)
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({})
  const [usdToChfRate, setUsdToChfRate] = useState<number | null>(null)
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)
  
  useEffect(() => {
    if (uid) {
      Promise.all([
        loadNetWorthItems([], uid),
        loadNetWorthTransactions([], uid),
        loadCashflowInflowItems([], uid),
        loadCashflowOutflowItems([], uid),
        loadSnapshots(uid),
      ]).then(([items, txs, inflow, outflow, loadedSnapshots]) => {
        setNetWorthItems(items)
        setTransactions(txs)
        setInflowItems(inflow)
        setOutflowItems(outflow)
        setSnapshots(loadedSnapshots)
      })
    }
  }, [uid])

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

  // Fetch stock/index fund/commodity prices for all relevant items
  const fetchAllStockPrices = async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshingPrices(true)
    }
    
    try {
      const stockItems = netWorthItems.filter((item: NetWorthItem) => 
        item.category === 'Index Funds' || 
        item.category === 'Stocks' || 
        item.category === 'Commodities'
      )
      
      if (stockItems.length === 0) {
        return
      }

      const tickers = stockItems.map((item: NetWorthItem) => item.name.trim().toUpperCase())
      const uniqueTickers = [...new Set(tickers)]
      
      const prices = await fetchStockPrices(uniqueTickers, rapidApiKey)
      
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


  // Calculate total net worth by summing all category subtotals (same logic as NetWorth page)
  const totalNetWorthChf = useMemo(() => {
    const categoryTotals: Record<NetWorthCategory, number> = {
      'Cash': 0,
      'Bank Accounts': 0,
      'Retirement Funds': 0,
      'Index Funds': 0,
      'Stocks': 0,
      'Commodities': 0,
      'Crypto': 0,
      'Real Estate': 0,
      'Depreciating Assets': 0,
    }

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number
      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount, convert USD to CHF using CryptoCompare rate
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
          const valueUsd = coinAmount * currentPriceUsd
          balance = valueUsd * usdToChfRate
        } else {
          // Fallback: calculateBalanceChf returns USD for crypto, need to convert to CHF
          const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
          // Convert USD to CHF
          if (usdToChfRate && usdToChfRate > 0) {
            balance = balanceUsd * usdToChfRate
          } else {
            // Use convert function to convert USD to CHF (baseCurrency)
            balance = convert(balanceUsd, 'USD')
          }
        }
      } else if (item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities') {
        // For Index Funds, Stocks, and Commodities: use current price from Yahoo Finance
        const holdings = calculateHoldings(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = stockPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
          const valueUsd = holdings * currentPriceUsd
          balance = valueUsd * usdToChfRate
        } else {
          // Fallback: calculateBalanceChf returns CHF
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        // For all other items, calculateBalanceChf returns CHF
        balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }
      // Ensure balance is a valid number
      const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
      categoryTotals[item.category] += validBalance
    })

    // Sum all category totals
    return Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)
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

  // Calculate monthly PnL (difference between current net worth and last snapshot of previous month)
  const monthlyPnLChf = useMemo(() => {
    if (snapshots.length === 0) {
      // If no snapshots, fall back to transaction-based calculation
      const now = new Date()
      const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
      lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
      const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
      return totalNetWorthChf - previousMonthNetWorth
    }

    // Find the last snapshot from the previous month
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
      // If no snapshot from previous month, fall back to transaction-based calculation
      const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
      lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
      const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
      return totalNetWorthChf - previousMonthNetWorth
    }
    
    // Get the last snapshot from previous month (most recent one)
    const lastSnapshot = previousMonthSnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
    
    // Snapshots are stored in CHF, so we can use the total directly
    // (convert handles CHF->CHF as identity)
    const previousMonthNetWorth = convert(lastSnapshot.total, 'CHF')
    return totalNetWorthChf - previousMonthNetWorth
  }, [totalNetWorthChf, snapshots, calculateNetWorthAtDate, convert])

  // Calculate monthly PnL percentage
  const monthlyPnLPercentage = useMemo(() => {
    if (snapshots.length === 0) {
      // If no snapshots, fall back to transaction-based calculation
      const now = new Date()
      const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
      lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
      const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
      if (previousMonthNetWorth === 0) return 0
      return ((totalNetWorthChf - previousMonthNetWorth) / previousMonthNetWorth) * 100
    }

    // Find the last snapshot from the previous month
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
      // If no snapshot from previous month, fall back to transaction-based calculation
      const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
      lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
      const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
      if (previousMonthNetWorth === 0) return 0
      return ((totalNetWorthChf - previousMonthNetWorth) / previousMonthNetWorth) * 100
    }
    
    // Get the last snapshot from previous month (most recent one)
    const lastSnapshot = previousMonthSnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
    
    // Snapshots are stored in CHF, so we can use the total directly
    // (convert handles CHF->CHF as identity)
    const previousMonthNetWorth = convert(lastSnapshot.total, 'CHF')
    if (previousMonthNetWorth === 0) return 0
    return ((totalNetWorthChf - previousMonthNetWorth) / previousMonthNetWorth) * 100
  }, [totalNetWorthChf, snapshots, calculateNetWorthAtDate, convert])

  // Calculate Year-to-Date (YTD) PnL (compare latest snapshot from previous year to current state)
  const ytdPnLChf = useMemo(() => {
    if (snapshots.length === 0) {
      // If no snapshots, consider previous year net worth to be 0
      return totalNetWorthChf
    }

    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const previousYear = currentYear - 1
    
    // Get the first day of the current year in UTC (snapshots before this are from previous year)
    const firstDayOfCurrentYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0))
    
    // Find snapshots from the previous year (before the first day of current year)
    const previousYearSnapshots = snapshots.filter(snapshot => {
      const snapshotDate = new Date(snapshot.timestamp)
      return snapshotDate < firstDayOfCurrentYear
    })
    
    if (previousYearSnapshots.length === 0) {
      // If no snapshot from previous year, consider net worth to be 0
      return totalNetWorthChf
    }
    
    // Get the last snapshot from previous year (most recent one)
    const lastSnapshot = previousYearSnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
    
    // Snapshots are stored in CHF, so we can use the total directly
    // (convert handles CHF->CHF as identity)
    const previousYearNetWorth = convert(lastSnapshot.total, 'CHF')
    return totalNetWorthChf - previousYearNetWorth
  }, [totalNetWorthChf, snapshots, convert])

  // Calculate YTD PnL percentage
  const ytdPnLPercentage = useMemo(() => {
    if (snapshots.length === 0) {
      // If no snapshots, consider previous year net worth to be 0
      // Percentage is undefined when starting from 0, return 0 or handle appropriately
      return 0
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
      // If no snapshot from previous year, consider net worth to be 0
      // Percentage is undefined when starting from 0, return 0
      return 0
    }
    
    // Get the last snapshot from previous year (most recent one)
    const lastSnapshot = previousYearSnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
    
    // Snapshots are stored in CHF, so we can use the total directly
    // (convert handles CHF->CHF as identity)
    const previousYearNetWorth = convert(lastSnapshot.total, 'CHF')
    if (previousYearNetWorth === 0) return 0
    return ((totalNetWorthChf - previousYearNetWorth) / previousYearNetWorth) * 100
  }, [totalNetWorthChf, snapshots, convert])

  // Calculate Daily PnL (compare latest snapshot from previous day to current state)
  const dailyPnLChf = useMemo(() => {
    if (snapshots.length === 0) {
      // If no snapshots, consider previous day net worth to be 0
      return totalNetWorthChf
    }

    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth()
    const currentDay = now.getUTCDate()
    
    // Get the first moment of the current day in UTC (snapshots before this are from previous day)
    const firstMomentOfCurrentDay = new Date(Date.UTC(currentYear, currentMonth, currentDay, 0, 0, 0, 0))
    
    // Find snapshots from the previous day (before the first moment of current day)
    const previousDaySnapshots = snapshots.filter(snapshot => {
      const snapshotDate = new Date(snapshot.timestamp)
      return snapshotDate < firstMomentOfCurrentDay
    })
    
    if (previousDaySnapshots.length === 0) {
      // If no snapshot from previous day, consider net worth to be 0
      return totalNetWorthChf
    }
    
    // Get the last snapshot from previous day (most recent one)
    const lastSnapshot = previousDaySnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
    
    // Snapshots are stored in CHF, so we can use the total directly
    // (convert handles CHF->CHF as identity)
    const previousDayNetWorth = convert(lastSnapshot.total, 'CHF')
    return totalNetWorthChf - previousDayNetWorth
  }, [totalNetWorthChf, snapshots, convert])

  // Calculate Daily PnL percentage
  const dailyPnLPercentage = useMemo(() => {
    if (snapshots.length === 0) {
      // If no snapshots, consider previous day net worth to be 0
      // Percentage is undefined when starting from 0, return 0
      return 0
    }

    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth()
    const currentDay = now.getUTCDate()
    
    // Get the first moment of the current day in UTC (snapshots before this are from previous day)
    const firstMomentOfCurrentDay = new Date(Date.UTC(currentYear, currentMonth, currentDay, 0, 0, 0, 0))
    
    // Find snapshots from the previous day (before the first moment of current day)
    const previousDaySnapshots = snapshots.filter(snapshot => {
      const snapshotDate = new Date(snapshot.timestamp)
      return snapshotDate < firstMomentOfCurrentDay
    })
    
    if (previousDaySnapshots.length === 0) {
      // If no snapshot from previous day, consider net worth to be 0
      // Percentage is undefined when starting from 0, return 0
      return 0
    }
    
    // Get the last snapshot from previous day (most recent one)
    const lastSnapshot = previousDaySnapshots.reduce((latest, snapshot) => {
      return snapshot.timestamp > latest.timestamp ? snapshot : latest
    })
    
    // Snapshots are stored in CHF, so we can use the total directly
    // (convert handles CHF->CHF as identity)
    const previousDayNetWorth = convert(lastSnapshot.total, 'CHF')
    if (previousDayNetWorth === 0) return 0
    return ((totalNetWorthChf - previousDayNetWorth) / previousDayNetWorth) * 100
  }, [totalNetWorthChf, snapshots, convert])

  // Convert values from CHF to baseCurrency
  const totalNetWorthConverted = convert(totalNetWorthChf, 'CHF')
  const monthlyInflowConverted = convert(monthlyInflowChf, 'CHF')
  const monthlyOutflowConverted = convert(monthlyOutflowChf, 'CHF')
  const monthlyPnLConverted = convert(monthlyPnLChf, 'CHF')
  const dailyPnLConverted = convert(dailyPnLChf, 'CHF')
  const ytdPnLConverted = convert(ytdPnLChf, 'CHF')

  // Calculate USD value for total net worth
  const totalNetWorthInUsd = useMemo(
    () => totalNetWorthChf * (exchangeRates?.rates['USD'] || 1),
    [totalNetWorthChf, exchangeRates]
  )

  // Calculate USD values for PnL
  const monthlyPnLInUsd = useMemo(
    () => monthlyPnLChf * (exchangeRates?.rates['USD'] || 1),
    [monthlyPnLChf, exchangeRates]
  )

  const dailyPnLInUsd = useMemo(
    () => dailyPnLChf * (exchangeRates?.rates['USD'] || 1),
    [dailyPnLChf, exchangeRates]
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
      'Retirement Funds': 0,
      'Index Funds': 0,
      'Stocks': 0,
      'Commodities': 0,
      'Crypto': 0,
      'Real Estate': 0,
      'Depreciating Assets': 0,
    }

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number
      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount, convert USD to CHF
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          // valueUSD = holdings * currentPriceUSD, valueCHF = valueUSD * usdToChfRate
          const valueUsd = coinAmount * currentPriceUsd
          balance = isNaN(valueUsd) ? 0 : valueUsd * usdToChfRate
        } else {
          // Fallback: calculateBalanceChf returns USD for crypto, need to convert to CHF
          const balanceUsd = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
          // Convert USD to CHF
          if (usdToChfRate && usdToChfRate > 0) {
            balance = balanceUsd * usdToChfRate
          } else {
            // Use convert function to convert USD to CHF (baseCurrency)
            balance = convert(balanceUsd, 'USD')
          }
        }
      } else if (item.category === 'Index Funds' || item.category === 'Stocks' || item.category === 'Commodities') {
        // For Index Funds, Stocks, and Commodities: use current price from Yahoo Finance
        const holdings = calculateHoldings(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = stockPrices[ticker] || 0
        if (currentPriceUsd > 0 && usdToChfRate !== null && usdToChfRate > 0) {
          const valueUsd = holdings * currentPriceUsd
          balance = isNaN(valueUsd) ? 0 : valueUsd * usdToChfRate
        } else {
          // Fallback to transaction-based calculation if price not available
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        // For all other items, balance is already in CHF
        balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }
      // Ensure balance is a valid number
      const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
      categoryTotals[item.category] += validBalance
    })

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

  // Generate net worth evolution data from snapshots
  const netWorthData = useMemo(() => {
    if (snapshots.length === 0 || !convert) {
      // If no snapshots or convert function not available, return empty array
      return []
    }

    // Calculate cutoff date based on timeframe
    const now = new Date()
    let cutoffDate: Date | null = null

    switch (timeFrame) {
      case 'YTD':
        cutoffDate = new Date(now.getFullYear(), 0, 1)
        break
      case '1M':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        break
      case '3M':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        break
      case '1Y':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
        break
      case '5Y':
        cutoffDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
        break
      case 'MAX':
      default:
        cutoffDate = null
        break
    }

    // Filter snapshots based on timeframe and sort
    const filteredSnapshots = snapshots
      .filter(snapshot => {
        if (!cutoffDate) return true
        const snapshotDate = new Date(snapshot.timestamp)
        return snapshotDate >= cutoffDate
      })
      .sort((a, b) => a.timestamp - b.timestamp)

    // Convert snapshots to chart data format
    const chartData: NetWorthDataPoint[] = filteredSnapshots.map(snapshot => {
      const snapshotDate = new Date(snapshot.timestamp)
      const month = snapshotDate.toLocaleString('en-US', { month: 'short', year: 'numeric' })

      return {
        month,
        'Total Net Worth': convert(snapshot.total, 'CHF'),
        'Cash': convert(snapshot.categories['Cash'] || 0, 'CHF'),
        'Bank Accounts': convert(snapshot.categories['Bank Accounts'] || 0, 'CHF'),
        'Retirement Funds': convert(snapshot.categories['Retirement Funds'] || 0, 'CHF'),
        'Index Funds': convert(snapshot.categories['Index Funds'] || 0, 'CHF'),
        'Stocks': convert(snapshot.categories['Stocks'] || 0, 'CHF'),
        'Commodities': convert(snapshot.categories['Commodities'] || 0, 'CHF'),
        'Crypto': convert(snapshot.categories['Crypto'] || 0, 'CHF'),
        'Real Estate': convert(snapshot.categories['Real Estate'] || 0, 'CHF'),
        'Depreciating Assets': convert(snapshot.categories['Depreciating Assets'] || 0, 'CHF'),
      }
    })

    return chartData
  }, [snapshots, convert, timeFrame])


  return (
    <div className="min-h-screen bg-[#050A1A] px-2 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Dashboard</Heading>
        
        {/* First Row: Total Net Worth (with PnL) + Monthly Cashflow (Inflow/Outflow) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Total Net Worth KPI with Monthly PnL */}
          <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
            <div className="mb-6 pb-4 border-b border-border-strong">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <Heading level={2}>Total Net Worth</Heading>
                </div>
                <TotalText variant={totalNetWorthConverted >= 0 ? 'inflow' : 'outflow'} className="mt-1">
                  {formatCurrencyValue(totalNetWorthConverted)}
                </TotalText>
                <TotalText variant={totalNetWorthInUsd >= 0 ? 'inflow' : 'outflow'} className="mt-1">
                  {formatUsd(totalNetWorthInUsd)}
                </TotalText>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">Daily PnL</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <TotalText variant={dailyPnLConverted >= 0 ? 'inflow' : 'outflow'}>
                      {formatCurrencyValue(dailyPnLConverted)}
                    </TotalText>
                    <span className={`text-xs md:text-sm ${dailyPnLPercentage >= 0 ? 'text-success' : 'text-danger'}`}>
                      {isIncognito ? '(****)' : `(${dailyPnLPercentage >= 0 ? '+' : ''}${dailyPnLPercentage.toFixed(2)}%)`}
                    </span>
                  </div>
                  <TotalText variant={dailyPnLInUsd >= 0 ? 'inflow' : 'outflow'}>
                    {formatUsd(dailyPnLInUsd)}
                  </TotalText>
                </div>
              </div>
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">Monthly PnL</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <TotalText variant={monthlyPnLConverted >= 0 ? 'inflow' : 'outflow'}>
                      {formatCurrencyValue(monthlyPnLConverted)}
                    </TotalText>
                    <span className={`text-xs md:text-sm ${monthlyPnLPercentage >= 0 ? 'text-success' : 'text-danger'}`}>
                      {isIncognito ? '(****)' : `(${monthlyPnLPercentage >= 0 ? '+' : ''}${monthlyPnLPercentage.toFixed(2)}%)`}
                    </span>
                  </div>
                  <TotalText variant={monthlyPnLInUsd >= 0 ? 'inflow' : 'outflow'}>
                    {formatUsd(monthlyPnLInUsd)}
                  </TotalText>
                </div>
              </div>
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1">YTD PnL</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <TotalText variant={ytdPnLConverted >= 0 ? 'inflow' : 'outflow'}>
                      {formatCurrencyValue(ytdPnLConverted)}
                    </TotalText>
                    <span className={`text-xs md:text-sm ${ytdPnLPercentage >= 0 ? 'text-success' : 'text-danger'}`}>
                      {isIncognito ? '(****)' : `(${ytdPnLPercentage >= 0 ? '+' : ''}${ytdPnLPercentage.toFixed(2)}%)`}
                    </span>
                  </div>
                  <TotalText variant={ytdPnLInUsd >= 0 ? 'inflow' : 'outflow'}>
                    {formatUsd(ytdPnLInUsd)}
                  </TotalText>
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
                onChange={(e) => setTimeFrame(e.target.value as 'YTD' | '1M' | '3M' | '1Y' | '5Y' | 'MAX')}
                className="bg-bg-surface-2 border border-border-subtle rounded-input pl-3 pr-8 py-2 text-text-primary text2 focus:outline-none focus:border-accent-blue"
              >
                <option value="YTD">YTD</option>
                <option value="1M">1M</option>
                <option value="3M">3M</option>
                <option value="1Y">1Y</option>
                <option value="5Y">5Y</option>
                <option value="MAX">MAX</option>
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
                stroke={CHART_COLORS.danger}
                strokeWidth={4}
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
                  dataKey="Retirement Funds"
                  stroke={CHART_COLORS.accent3}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Index Funds"
                  stroke={CHART_COLORS.purple}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Stocks"
                  stroke={CHART_COLORS.orange}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Commodities"
                  stroke={CHART_COLORS.teal}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Crypto"
                  stroke={CHART_COLORS.pink}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Real Estate"
                  stroke={CHART_COLORS.indigo}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
                <Line
                  type="monotone"
                  dataKey="Depreciating Assets"
                  stroke={CHART_COLORS.cyan}
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

