import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useCurrency } from './CurrencyContext'
import { useApiKeys } from './ApiKeysContext'
import {
  loadNetWorthItems,
  loadNetWorthTransactions,
  loadCashflowInflowItems,
  loadCashflowOutflowItems,
} from '../services/storageService'
import { loadSnapshots, type NetWorthSnapshot } from '../services/snapshotService'
import { fetchCryptoData } from '../services/cryptoCompareService'
import { fetchStockPrices } from '../services/yahooFinanceService'
import { fetchAsterPerpetualsData } from '../services/asterService'
import { NetWorthCalculationService, type NetWorthCalculationResult } from '../services/netWorthCalculationService'
import type { NetWorthItem, NetWorthTransaction } from '../pages/NetWorth'
import type { InflowItem, OutflowItem } from '../pages/Cashflow'

export interface AppData {
  netWorthItems: NetWorthItem[]
  transactions: NetWorthTransaction[]
  inflowItems: InflowItem[]
  outflowItems: OutflowItem[]
  snapshots: NetWorthSnapshot[]
  cryptoPrices: Record<string, number>
  stockPrices: Record<string, number>
  usdToChfRate: number | null
  calculationResult: NetWorthCalculationResult | null
}

interface DataContextType {
  data: AppData
  loading: boolean
  error: string | null
  refreshData: () => Promise<void>
  refreshPrices: () => Promise<void>
  refreshPerpetuals: () => Promise<void>
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function useData() {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider')
  }
  return context
}

interface DataProviderProps {
  children: ReactNode
}

export function DataProvider({ children }: DataProviderProps) {
  const { uid } = useAuth()
  const { convert } = useCurrency()
  const { rapidApiKey } = useApiKeys()
  
  const [data, setData] = useState<AppData>({
    netWorthItems: [],
    transactions: [],
    inflowItems: [],
    outflowItems: [],
    snapshots: [],
    cryptoPrices: {},
    stockPrices: {},
    usdToChfRate: null,
    calculationResult: null,
  })
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load all Firebase data
  const loadFirebaseData = async (): Promise<{
    items: NetWorthItem[]
    transactions: NetWorthTransaction[]
    inflowItems: InflowItem[]
    outflowItems: OutflowItem[]
    snapshots: NetWorthSnapshot[]
  }> => {
    if (!uid) {
      throw new Error('User ID is required')
    }

    const [items, txs, inflow, outflow, loadedSnapshots] = await Promise.all([
      loadNetWorthItems([], uid),
      loadNetWorthTransactions([], uid),
      loadCashflowInflowItems([], uid),
      loadCashflowOutflowItems([], uid),
      loadSnapshots(uid),
    ])

    return {
      items,
      transactions: txs,
      inflowItems: inflow,
      outflowItems: outflow,
      snapshots: loadedSnapshots,
    }
  }

  // Fetch crypto prices and USD→CHF rate
  const fetchCryptoPrices = async (items: NetWorthItem[]): Promise<{
    cryptoPrices: Record<string, number>
    usdToChfRate: number | null
  }> => {
    const cryptoItems = items.filter((item) => item.category === 'Crypto')
    const tickers = cryptoItems.map((item) => item.name.trim().toUpperCase())
    const uniqueTickers = [...new Set(tickers)]

    if (uniqueTickers.length === 0) {
      return { cryptoPrices: {}, usdToChfRate: null }
    }

    try {
      const { prices, usdToChfRate } = await fetchCryptoData(uniqueTickers)
      return { cryptoPrices: prices, usdToChfRate }
    } catch (error) {
      console.error('Error fetching crypto prices:', error)
      return { cryptoPrices: {}, usdToChfRate: null }
    }
  }

  // Fetch stock/index fund/commodity prices
  const fetchStockPricesData = async (items: NetWorthItem[]): Promise<Record<string, number>> => {
    const stockItems = items.filter(
      (item) =>
        item.category === 'Index Funds' ||
        item.category === 'Stocks' ||
        item.category === 'Commodities'
    )

    if (stockItems.length === 0) {
      return {}
    }

    const tickers = stockItems.map((item) => item.name.trim().toUpperCase())
    const uniqueTickers = [...new Set(tickers)]

    try {
      return await fetchStockPrices(uniqueTickers, rapidApiKey)
    } catch (error) {
      console.error('Error fetching stock prices:', error)
      return {}
    }
  }

  // Fetch Aster Perpetuals data
  const fetchPerpetualsData = async (items: NetWorthItem[]): Promise<NetWorthItem[]> => {
    console.log('[DataContext] fetchPerpetualsData called:', {
      hasUid: !!uid,
      uid: uid,
      itemsCount: items.length,
      hasPerpetualsItem: !!items.find((item) => item.category === 'Perpetuals'),
    })
    
    if (!uid) {
      console.log('[DataContext] No UID, skipping Perpetuals fetch')
      return items
    }

    const perpetualsItem = items.find((item) => item.category === 'Perpetuals')
    if (!perpetualsItem) {
      console.log('[DataContext] No Perpetuals item found, skipping fetch')
      return items
    }

    try {
      console.log('[DataContext] Fetching Aster data...')
      
      const asterData = await fetchAsterPerpetualsData(uid)

      console.log('[DataContext] Fetch results:', {
        asterData: !!asterData,
        asterPositions: asterData?.openPositions?.length || 0,
        asterLockedMargin: asterData?.lockedMargin?.length || 0,
        asterAvailableMargin: asterData?.availableMargin?.length || 0,
      })

      // Use Aster data directly
      if (asterData) {
        console.log('[DataContext] Updating items with Aster Perpetuals data')
        return items.map((item) => {
          if (item.category === 'Perpetuals') {
            return {
              ...item,
              perpetualsData: asterData,
            }
          }
          return item
        })
      } else {
        console.log('[DataContext] No data from Aster, keeping existing items')
      }
    } catch (error) {
      console.error('[DataContext] Error fetching Perpetuals data:', error)
    }

    return items
  }

  // Calculate totals
  const calculateTotals = (
    items: NetWorthItem[],
    transactions: NetWorthTransaction[],
    cryptoPrices: Record<string, number>,
    stockPrices: Record<string, number>,
    usdToChfRate: number | null
  ): NetWorthCalculationResult => {
    return NetWorthCalculationService.calculateTotals(
      items,
      transactions,
      cryptoPrices,
      stockPrices,
      usdToChfRate,
      convert
    )
  }

  // Load all data
  const loadAllData = async () => {
    if (!uid) {
      setLoading(false)
      return
    }

    try {
      setError(null)
      
      // Step 1: Load Firebase data
      const firebaseData = await loadFirebaseData()
      
      // Step 2: Fetch Perpetuals data (needs items)
      const itemsWithPerpetuals = await fetchPerpetualsData(firebaseData.items)
      
      // Step 3: Fetch prices in parallel
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(itemsWithPerpetuals),
        fetchStockPricesData(itemsWithPerpetuals),
      ])
      
      // Step 4: Calculate totals
      const calculationResult = calculateTotals(
        itemsWithPerpetuals,
        firebaseData.transactions,
        cryptoData.cryptoPrices,
        stockPricesData,
        cryptoData.usdToChfRate
      )
      
      // Step 5: Update state
      setData({
        netWorthItems: itemsWithPerpetuals,
        transactions: firebaseData.transactions,
        inflowItems: firebaseData.inflowItems,
        outflowItems: firebaseData.outflowItems,
        snapshots: firebaseData.snapshots,
        cryptoPrices: cryptoData.cryptoPrices,
        stockPrices: stockPricesData,
        usdToChfRate: cryptoData.usdToChfRate,
        calculationResult,
      })
      
      setLoading(false)
    } catch (err) {
      console.error('Error loading data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
      setLoading(false)
    }
  }

  // Refresh prices only
  const refreshPrices = async () => {
    if (!uid || data.netWorthItems.length === 0) return

    try {
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(data.netWorthItems),
        fetchStockPricesData(data.netWorthItems),
      ])

      const calculationResult = calculateTotals(
        data.netWorthItems,
        data.transactions,
        cryptoData.cryptoPrices,
        stockPricesData,
        cryptoData.usdToChfRate
      )

      setData((prev) => ({
        ...prev,
        cryptoPrices: cryptoData.cryptoPrices,
        stockPrices: stockPricesData,
        usdToChfRate: cryptoData.usdToChfRate,
        calculationResult,
      }))
    } catch (err) {
      console.error('Error refreshing prices:', err)
    }
  }

  // Refresh Perpetuals data only
  const refreshPerpetuals = async () => {
    if (!uid) return

    try {
      const itemsWithPerpetuals = await fetchPerpetualsData(data.netWorthItems)
      const calculationResult = calculateTotals(
        itemsWithPerpetuals,
        data.transactions,
        data.cryptoPrices,
        data.stockPrices,
        data.usdToChfRate
      )

      setData((prev) => ({
        ...prev,
        netWorthItems: itemsWithPerpetuals,
        calculationResult,
      }))
    } catch (err) {
      console.error('Error refreshing Perpetuals data:', err)
    }
  }

  // Refresh all data
  const refreshData = async () => {
    setLoading(true)
    await loadAllData()
  }

  // Initial load
  useEffect(() => {
    loadAllData()
  }, [uid]) // Reload when uid changes

  // Note: convert function dependency is handled within calculateTotals
  // We recalculate when data changes, not when convert changes, since convert is stable

  // Set up periodic refresh (every 5 minutes)
  useEffect(() => {
    if (!uid || loading) return

    const interval = setInterval(() => {
      refreshPrices()
      refreshPerpetuals()
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [uid, loading])

  return (
    <DataContext.Provider
      value={{
        data,
        loading,
        error,
        refreshData,
        refreshPrices,
        refreshPerpetuals,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

