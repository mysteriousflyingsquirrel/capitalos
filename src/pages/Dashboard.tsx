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
import { formatDate } from '../lib/dateFormat'
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
import { calculateBalanceChf, calculateCoinAmount, calculateHoldings } from '../services/balanceCalculationService'
import type { InflowItem, OutflowItem } from './Cashflow'
import { fetchCryptoData } from '../services/cryptoCompareService'
import { NetWorthCalculationService } from '../services/netWorthCalculationService'
import { fetchStockPrices } from '../services/yahooFinanceService'
import { fetchAsterPerpetualsData } from '../services/asterService'

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
  
  // Track window width for responsive x-axis ticks
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
        
        // Fetch Aster Perpetuals data if Perpetuals item exists
        const perpetualsItem = items.find((item: NetWorthItem) => item.category === 'Perpetuals')
        if (perpetualsItem) {
          fetchAsterPerpetualsData(uid).then((asterData) => {
            // Use Aster data directly
            if (asterData) {
              setNetWorthItems((prevItems) => {
                return prevItems.map((item: NetWorthItem) => {
                  if (item.category === 'Perpetuals') {
                    return {
                      ...item,
                      perpetualsData: asterData,
                    }
                  }
                  return item
                })
              })
            }
          }).catch((error) => {
            console.error('Failed to fetch Perpetuals data:', error)
            // Keep existing data if fetch fails
          })
        }
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

  // Periodically refresh Aster Perpetuals data (every 5 minutes)
  useEffect(() => {
    if (!uid) return

    const perpetualsItem = netWorthItems.find((item: NetWorthItem) => item.category === 'Perpetuals')
    if (!perpetualsItem) return

    // Fetch immediately
    fetchAsterPerpetualsData(uid).then((asterData) => {
      // Use Aster data directly
      if (asterData) {
        setNetWorthItems((prevItems: NetWorthItem[]) => {
          return prevItems.map((item: NetWorthItem) => {
            if (item.category === 'Perpetuals') {
              return {
                ...item,
                perpetualsData: asterData,
              }
            }
            return item
          })
        })
      }
    }).catch((error) => {
      console.error('Failed to refresh Perpetuals data:', error)
    })

    // Set up interval to refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      fetchAsterPerpetualsData(uid).then((asterData) => {
        // Use Aster data directly
        if (asterData) {
          setNetWorthItems((prevItems: NetWorthItem[]) => {
            return prevItems.map((item: NetWorthItem) => {
              if (item.category === 'Perpetuals') {
                return {
                  ...item,
                  perpetualsData: asterData,
                }
              }
              return item
            })
          })
        }
      }).catch((error) => {
        console.error('Failed to refresh Perpetuals data:', error)
      })
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(refreshInterval)
  }, [uid, netWorthItems])

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
            const { openPositions, lockedMargin, availableMargin } = item.perpetualsData
            
            // Sum all CHF balances directly (matching NetWorth page logic)
            let totalChf = 0
            
            // Open Positions: convert each balance to CHF and sum
            openPositions.forEach(pos => {
              const balanceUsd = pos.margin + pos.pnl
              const balanceChf = usdToChfRate && usdToChfRate > 0 
                ? balanceUsd * usdToChfRate 
                : convert(balanceUsd, 'USD')
              totalChf += balanceChf
            })
            
            // Locked Margin: convert each balance to CHF and sum
            lockedMargin.forEach(margin => {
              const balanceUsd = margin.margin
              const balanceChf = usdToChfRate && usdToChfRate > 0 
                ? balanceUsd * usdToChfRate 
                : convert(balanceUsd, 'USD')
              totalChf += balanceChf
            })
            
            // Available Margin: convert each balance to CHF and sum
            availableMargin.forEach(margin => {
              const balanceUsd = margin.margin
              const balanceChf = usdToChfRate && usdToChfRate > 0 
                ? balanceUsd * usdToChfRate 
                : convert(balanceUsd, 'USD')
              totalChf += balanceChf
            })
            
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

  // Format the latest snapshot's timestamp as UTC date/time (DD/MM/YYYY - hh:mm UTC)
  const latestSnapshotDateTime = useMemo(() => {
    if (!latestSnapshot) {
      return null
    }
    const date = new Date(latestSnapshot.timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} - ${hours}:${minutes} UTC`
  }, [latestSnapshot])

  // Helper function to format snapshot timestamp as UTC date/time (DD/MM/YYYY - hh:mm UTC)
  const formatSnapshotDateTime = (snapshot: NetWorthSnapshot | null): string | null => {
    if (!snapshot) {
      return null
    }
    const date = new Date(snapshot.timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} - ${hours}:${minutes} UTC`
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

  // Format timestamps for Monthly and YTD PnL
  const monthlyPnLSnapshotDateTime = useMemo(() => formatSnapshotDateTime(monthlyPnLSnapshot), [monthlyPnLSnapshot])
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
    <div className="min-h-screen px-2 pt-4 pb-12 lg:pt-6 lg:pb-16">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Title */}
        <Heading level={1}>Dashboard</Heading>
        
        {/* First Row: Total Net Worth (with PnL) + Monthly Cashflow (Inflow/Outflow) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Total Net Worth KPI with Monthly PnL */}
          <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
                <div className="text-xs md:text-sm text-text-muted mb-1 flex justify-between">
                  <span>Daily PnL</span>
                  {latestSnapshotDateTime && <span>({latestSnapshotDateTime})</span>}
                </div>
                {dailyPnLChf === null ? (
                  <div className="text-xs md:text-sm text-warning">
                    ⚠️ No snapshot available
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <TotalText variant={dailyPnLConverted! >= 0 ? 'inflow' : 'outflow'}>
                        {formatCurrencyValue(dailyPnLConverted!)}
                      </TotalText>
                      {dailyPnLPercentage !== null && (
                        <span className={`text-xs md:text-sm ${dailyPnLPercentage >= 0 ? 'text-success' : 'text-danger'}`}>
                          {isIncognito ? '(****)' : `(${dailyPnLPercentage >= 0 ? '+' : ''}${dailyPnLPercentage.toFixed(2)}%)`}
                        </span>
                      )}
                    </div>
                    {dailyPnLInUsd !== null && (
                      <TotalText variant={dailyPnLInUsd >= 0 ? 'inflow' : 'outflow'}>
                        {formatUsd(dailyPnLInUsd)}
                      </TotalText>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs md:text-sm text-text-muted mb-1 flex justify-between">
                  <span>Monthly PnL</span>
                  {monthlyPnLSnapshotDateTime && <span>({monthlyPnLSnapshotDateTime})</span>}
                </div>
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
                <div className="text-xs md:text-sm text-text-muted mb-1 flex justify-between">
                  <span>YTD PnL</span>
                  {ytdPnLSnapshotDateTime && <span>({ytdPnLSnapshotDateTime})</span>}
                </div>
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
          <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
        <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
                  dataKey="Perpetuals"
                  stroke={CHART_COLORS.lime}
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
          <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
          <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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
          <div className="bg-[#050A1A] border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6">
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

