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
import { formatMoney } from '../lib/currency'
import type { CurrencyCode } from '../lib/currency'
import {
  loadNetWorthItems,
  loadNetWorthTransactions,
  loadCashflowInflowItems,
  loadCashflowOutflowItems,
} from '../services/storageService'
import type { NetWorthItem, NetWorthTransaction } from './NetWorth'
import type { NetWorthCategory } from './NetWorth'
import { calculateBalanceChf, calculateCoinAmount } from './NetWorth'
import type { InflowItem, OutflowItem } from './Cashflow'
import { fetchCoinPrice } from '../services/coinGeckoService'

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
  'Inventory': number
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

  // Load data from Firestore
  const { uid } = useAuth()
  const [netWorthItems, setNetWorthItems] = useState([])
  const [transactions, setTransactions] = useState([])
  const [inflowItems, setInflowItems] = useState([])
  const [outflowItems, setOutflowItems] = useState([])
  
  // Store current crypto prices (ticker -> USD price)
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  
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

  // Fetch crypto prices for all crypto items
  useEffect(() => {
    const fetchAllCryptoPrices = async () => {
      const cryptoItems = netWorthItems.filter((item: NetWorthItem) => item.category === 'Crypto')
      if (cryptoItems.length === 0) return

      const tickers = cryptoItems.map((item: NetWorthItem) => item.name.trim().toUpperCase())
      const uniqueTickers = [...new Set(tickers)]
      
      const pricePromises = uniqueTickers.map(async (ticker) => {
        try {
          const price = await fetchCoinPrice(ticker)
          return { ticker, price: price || null }
        } catch (error) {
          return { ticker, price: null }
        }
      })

      const results = await Promise.all(pricePromises)
      const newPrices: Record<string, number> = {}
      
      results.forEach(({ ticker, price }) => {
        if (price !== null) {
          newPrices[ticker] = price
        }
      })

      setCryptoPrices(prev => ({ ...prev, ...newPrices }))
    }

    if (netWorthItems.length > 0) {
      fetchAllCryptoPrices()
      
      // Set up interval to fetch every hour (3600000 ms)
      const interval = setInterval(() => {
        fetchAllCryptoPrices()
      }, 3600000) // 1 hour

      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netWorthItems]) // Re-fetch when crypto items change


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
      'Inventory': 0,
    }

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number
      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount, convert USD to CHF
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0) {
          // Convert USD to CHF
          const cryptoValueUsd = coinAmount * currentPriceUsd
          balance = convert(cryptoValueUsd, 'USD')
        } else {
          // Fallback: calculateBalanceChf returns CHF for crypto fallback
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        // For non-Crypto items, calculateBalanceChf returns CHF
        balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }
      // Ensure balance is a valid number
      const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
      categoryTotals[item.category] += validBalance
    })

    // Sum all category totals
    return Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)
  }, [netWorthItems, transactions, cryptoPrices, convert])

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
        'Inventory': 0,
      }

      netWorthItems.forEach((item: NetWorthItem) => {
        let balance: number
        if (item.category === 'Crypto') {
          // For Crypto: calculate coin amount from filtered transactions, use current price
          const coinAmount = calculateCoinAmount(item.id, transactionsUpToDate)
          const ticker = item.name.trim().toUpperCase()
          const currentPriceUsd = cryptoPrices[ticker] || 0
          if (currentPriceUsd > 0) {
            // Convert USD to CHF
            const cryptoValueUsd = coinAmount * currentPriceUsd
            balance = convert(cryptoValueUsd, 'USD')
          } else {
            // Fallback: calculateBalanceChf returns CHF for crypto fallback
            balance = calculateBalanceChf(item.id, transactionsUpToDate, item, cryptoPrices, convert)
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
  }, [netWorthItems, transactions, cryptoPrices, convert])

  // Calculate monthly PnL (difference between current net worth and previous month end)
  const monthlyPnLChf = useMemo(() => {
    const now = new Date()
    const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
    
    const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
    return totalNetWorthChf - previousMonthNetWorth
  }, [totalNetWorthChf, calculateNetWorthAtDate])

  // Calculate monthly PnL percentage
  const monthlyPnLPercentage = useMemo(() => {
    const now = new Date()
    const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    lastDayOfPreviousMonth.setHours(23, 59, 59, 999)
    
    const previousMonthNetWorth = calculateNetWorthAtDate(lastDayOfPreviousMonth)
    if (previousMonthNetWorth === 0) return 0
    return ((totalNetWorthChf - previousMonthNetWorth) / previousMonthNetWorth) * 100
  }, [totalNetWorthChf, calculateNetWorthAtDate])

  // Calculate Year-to-Date (YTD) PnL
  const ytdPnLChf = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const firstDayOfYear = new Date(currentYear, 0, 1)
    firstDayOfYear.setHours(0, 0, 0, 0)
    
    const yearStartNetWorth = calculateNetWorthAtDate(firstDayOfYear)
    return totalNetWorthChf - yearStartNetWorth
  }, [totalNetWorthChf, calculateNetWorthAtDate])

  // Calculate YTD PnL percentage
  const ytdPnLPercentage = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const firstDayOfYear = new Date(currentYear, 0, 1)
    firstDayOfYear.setHours(0, 0, 0, 0)
    
    const yearStartNetWorth = calculateNetWorthAtDate(firstDayOfYear)
    if (yearStartNetWorth === 0) return 0
    return ((totalNetWorthChf - yearStartNetWorth) / yearStartNetWorth) * 100
  }, [totalNetWorthChf, calculateNetWorthAtDate])

  // Convert values from CHF to baseCurrency
  const totalNetWorthConverted = convert(totalNetWorthChf, 'CHF')
  const monthlyInflowConverted = convert(monthlyInflowChf, 'CHF')
  const monthlyOutflowConverted = convert(monthlyOutflowChf, 'CHF')
  const monthlyPnLConverted = convert(monthlyPnLChf, 'CHF')
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
      'Inventory': 0,
    }

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number
      if (item.category === 'Crypto') {
        // For Crypto: use current price * coin amount, convert USD to CHF
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0) {
          // Convert USD to CHF for balance
          const usdValue = coinAmount * currentPriceUsd
          balance = isNaN(usdValue) ? 0 : convert(usdValue, 'USD')
        } else {
          // Fallback to transaction-based calculation if price not available
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        // For non-Crypto items, balance is already in CHF
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
  }, [netWorthItems, transactions, cryptoPrices, convert])

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

  // Generate net worth evolution data from transactions
  const netWorthData = useMemo(() => {
    if (transactions.length === 0) {
      // If no transactions, just show current state
      const categoryTotals: Record<NetWorthCategory, number> = {
        'Cash': 0,
        'Bank Accounts': 0,
        'Retirement Funds': 0,
        'Index Funds': 0,
        'Stocks': 0,
        'Commodities': 0,
        'Crypto': 0,
        'Real Estate': 0,
        'Inventory': 0,
      }

      netWorthItems.forEach((item: NetWorthItem) => {
        let balance: number
        if (item.category === 'Crypto') {
          const coinAmount = calculateCoinAmount(item.id, transactions)
          const ticker = item.name.trim().toUpperCase()
          const currentPriceUsd = cryptoPrices[ticker] || 0
          if (currentPriceUsd > 0) {
            balance = convert(coinAmount * currentPriceUsd, 'USD')
          } else {
            balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
          }
        } else {
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
        // Ensure balance is a valid number
        const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
        categoryTotals[item.category] += validBalance
      })

      const total = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)

      return [{
        month: new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        'Total Net Worth': convert(total, 'CHF'),
        'Cash': convert(categoryTotals['Cash'], 'CHF'),
        'Bank Accounts': convert(categoryTotals['Bank Accounts'], 'CHF'),
        'Retirement Funds': convert(categoryTotals['Retirement Funds'], 'CHF'),
        'Index Funds': convert(categoryTotals['Index Funds'], 'CHF'),
        'Stocks': convert(categoryTotals['Stocks'], 'CHF'),
        'Commodities': convert(categoryTotals['Commodities'], 'CHF'),
        'Crypto': convert(categoryTotals['Crypto'], 'CHF'),
        'Real Estate': convert(categoryTotals['Real Estate'], 'CHF'),
        'Inventory': convert(categoryTotals['Inventory'], 'CHF'),
      }]
    }

    // Get all unique month-end dates from transactions
    const monthEnds = new Set<string>()
    transactions.forEach((tx: NetWorthTransaction) => {
      const txDate = new Date(tx.date)
      // Get last day of the month for this transaction
      const lastDayOfMonth = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 0)
      monthEnds.add(lastDayOfMonth.toISOString().split('T')[0])
    })

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

    // Filter month ends based on timeframe and sort
    const sortedMonthEnds = Array.from(monthEnds)
      .map(dateStr => new Date(dateStr))
      .filter(date => !cutoffDate || date >= cutoffDate)
      .sort((a, b) => a.getTime() - b.getTime())

    // Initialize chartData - start at the first transaction
    const chartData: NetWorthDataPoint[] = []

    // Calculate net worth for each month end
    const monthEndData = sortedMonthEnds.map(monthEnd => {
      const transactionsUpToDate = transactions.filter((tx: NetWorthTransaction) => {
        const txDate = new Date(tx.date)
        return txDate <= monthEnd
      })

      const categoryTotals: Record<NetWorthCategory, number> = {
        'Cash': 0,
        'Bank Accounts': 0,
        'Retirement Funds': 0,
        'Index Funds': 0,
        'Stocks': 0,
        'Commodities': 0,
        'Crypto': 0,
        'Real Estate': 0,
        'Inventory': 0,
      }

      netWorthItems.forEach((item: NetWorthItem) => {
        let balance: number
        if (item.category === 'Crypto') {
          const coinAmount = calculateCoinAmount(item.id, transactionsUpToDate)
          const ticker = item.name.trim().toUpperCase()
          const currentPriceUsd = cryptoPrices[ticker] || 0
          if (currentPriceUsd > 0) {
            balance = convert(coinAmount * currentPriceUsd, 'USD')
          } else {
            balance = calculateBalanceChf(item.id, transactionsUpToDate, item, cryptoPrices, convert)
          }
        } else {
          balance = calculateBalanceChf(item.id, transactionsUpToDate, item, cryptoPrices, convert)
        }
        // Ensure balance is a valid number
        const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
        categoryTotals[item.category] += validBalance
      })

      const total = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)
      const month = monthEnd.toLocaleString('en-US', { month: 'short', year: 'numeric' })

      return {
        month,
        'Total Net Worth': convert(total, 'CHF'),
        'Cash': convert(categoryTotals['Cash'], 'CHF'),
        'Bank Accounts': convert(categoryTotals['Bank Accounts'], 'CHF'),
        'Retirement Funds': convert(categoryTotals['Retirement Funds'], 'CHF'),
        'Index Funds': convert(categoryTotals['Index Funds'], 'CHF'),
        'Stocks': convert(categoryTotals['Stocks'], 'CHF'),
        'Commodities': convert(categoryTotals['Commodities'], 'CHF'),
        'Crypto': convert(categoryTotals['Crypto'], 'CHF'),
        'Real Estate': convert(categoryTotals['Real Estate'], 'CHF'),
        'Inventory': convert(categoryTotals['Inventory'], 'CHF'),
      }
    })

    // Add the month end data to chartData
    chartData.push(...monthEndData)

    // Add current state
    const categoryTotals: Record<NetWorthCategory, number> = {
      'Cash': 0,
      'Bank Accounts': 0,
      'Retirement Funds': 0,
      'Index Funds': 0,
      'Stocks': 0,
      'Commodities': 0,
      'Crypto': 0,
      'Real Estate': 0,
      'Inventory': 0,
    }

    netWorthItems.forEach((item: NetWorthItem) => {
      let balance: number
      if (item.category === 'Crypto') {
        const coinAmount = calculateCoinAmount(item.id, transactions)
        const ticker = item.name.trim().toUpperCase()
        const currentPriceUsd = cryptoPrices[ticker] || 0
        if (currentPriceUsd > 0) {
          balance = convert(coinAmount * currentPriceUsd, 'USD')
        } else {
          balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
        }
      } else {
        balance = calculateBalanceChf(item.id, transactions, item, cryptoPrices, convert)
      }
      // Ensure balance is a valid number
      const validBalance = isNaN(balance) || !isFinite(balance) ? 0 : balance
      categoryTotals[item.category] += validBalance
    })

    const total = Object.values(categoryTotals).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0)

    chartData.push({
      month: new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      'Total Net Worth': convert(total, 'CHF'),
      'Cash': convert(categoryTotals['Cash'], 'CHF'),
      'Bank Accounts': convert(categoryTotals['Bank Accounts'], 'CHF'),
      'Retirement Funds': convert(categoryTotals['Retirement Funds'], 'CHF'),
      'Index Funds': convert(categoryTotals['Index Funds'], 'CHF'),
      'Stocks': convert(categoryTotals['Stocks'], 'CHF'),
      'Commodities': convert(categoryTotals['Commodities'], 'CHF'),
      'Crypto': convert(categoryTotals['Crypto'], 'CHF'),
      'Real Estate': convert(categoryTotals['Real Estate'], 'CHF'),
      'Inventory': convert(categoryTotals['Inventory'], 'CHF'),
    })

    return chartData
  }, [netWorthItems, transactions, totalNetWorthChf, cryptoPrices, convert, timeFrame])


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
                <Heading level={2}>Total Net Worth</Heading>
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
                  dataKey="Inventory"
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

