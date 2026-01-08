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
import { fetchHyperliquidPerpetualsData } from '../services/hyperliquidService'
import { fetchKrakenPerpetualsData } from '../services/krakenService'
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
      console.log('[DataContext] Fetching Aster, Hyperliquid, and Kraken data...')
      
      // Fetch Aster, Hyperliquid, and Kraken data in parallel
      const [asterData, hyperliquidData, krakenData] = await Promise.all([
        fetchAsterPerpetualsData(uid),
        fetchHyperliquidPerpetualsData(uid),
        fetchKrakenPerpetualsData(uid),
      ])

      console.log('[DataContext] Fetch results:', {
        asterData: !!asterData,
        asterPositions: asterData?.openPositions?.length || 0,
        asterLockedMargin: asterData?.lockedMargin?.length || 0,
        asterAvailableMargin: asterData?.availableMargin?.length || 0,
        hyperliquidData: !!hyperliquidData,
        hyperliquidPositions: hyperliquidData?.openPositions?.length || 0,
        hyperliquidLockedMargin: hyperliquidData?.lockedMargin?.length || 0,
        hyperliquidAvailableMargin: hyperliquidData?.availableMargin?.length || 0,
        krakenData: !!krakenData,
        krakenPositions: krakenData?.openPositions?.length || 0,
        krakenLockedMargin: krakenData?.lockedMargin?.length || 0,
        krakenAvailableMargin: krakenData?.availableMargin?.length || 0,
      })

      // Log the actual data structures
      console.log('[DataContext] Aster data structure:', {
        openPositions: asterData?.openPositions,
        availableMargin: asterData?.availableMargin,
        lockedMargin: asterData?.lockedMargin,
      })
      
      console.log('[DataContext] Hyperliquid data structure:', {
        openPositions: hyperliquidData?.openPositions,
        availableMargin: hyperliquidData?.availableMargin,
        lockedMargin: hyperliquidData?.lockedMargin,
      })

      // Merge Aster, Hyperliquid, and Kraken data
      // Create defensive copies to prevent mutation
      const asterPositions = Array.isArray(asterData?.openPositions) ? [...asterData.openPositions] : []
      const hyperliquidPositions = Array.isArray(hyperliquidData?.openPositions) ? [...hyperliquidData.openPositions] : []
      const krakenPositions = Array.isArray(krakenData?.openPositions) ? [...krakenData.openPositions] : []
      const asterOrders = Array.isArray(asterData?.openOrders) ? [...asterData.openOrders] : []
      const hyperliquidOrders = Array.isArray(hyperliquidData?.openOrders) ? [...hyperliquidData.openOrders] : []
      const krakenOrders = Array.isArray(krakenData?.openOrders) ? [...krakenData.openOrders] : []
      const asterAvailableMargin = Array.isArray(asterData?.availableMargin) ? [...asterData.availableMargin] : []
      const hyperliquidAvailableMargin = Array.isArray(hyperliquidData?.availableMargin) ? [...hyperliquidData.availableMargin] : []
      const krakenAvailableMargin = Array.isArray(krakenData?.availableMargin) ? [...krakenData.availableMargin] : []
      const asterLockedMargin = Array.isArray(asterData?.lockedMargin) ? [...asterData.lockedMargin] : []
      const hyperliquidLockedMargin = Array.isArray(hyperliquidData?.lockedMargin) ? [...hyperliquidData.lockedMargin] : []
      const krakenLockedMargin = Array.isArray(krakenData?.lockedMargin) ? [...krakenData.lockedMargin] : []
      
      console.log('[DataContext] Before merge - counts:', {
        asterPositions: asterPositions.length,
        hyperliquidPositions: hyperliquidPositions.length,
        krakenPositions: krakenPositions.length,
        asterOrders: asterOrders.length,
        hyperliquidOrders: hyperliquidOrders.length,
        krakenOrders: krakenOrders.length,
      })
      
      const mergedData = {
        openPositions: [...asterPositions, ...hyperliquidPositions, ...krakenPositions],
        openOrders: [...asterOrders, ...hyperliquidOrders, ...krakenOrders],
        availableMargin: [...asterAvailableMargin, ...hyperliquidAvailableMargin, ...krakenAvailableMargin],
        lockedMargin: [...asterLockedMargin, ...hyperliquidLockedMargin, ...krakenLockedMargin],
      }
      
      console.log('[DataContext] After merge - mergedData structure:', {
        openPositionsCount: mergedData.openPositions.length,
        openOrdersCount: mergedData.openOrders.length,
        openPositionsIds: mergedData.openPositions.map(p => p.id),
        openOrdersIds: mergedData.openOrders.map(o => o.id),
      })

      console.log('[DataContext] Merged data:', {
        openPositions: mergedData.openPositions,
        availableMargin: mergedData.availableMargin,
        lockedMargin: mergedData.lockedMargin,
        openPositionsCount: mergedData.openPositions.length,
        availableMarginCount: mergedData.availableMargin.length,
        lockedMarginCount: mergedData.lockedMargin.length,
      })

      // Update items with merged data
      if (asterData || hyperliquidData || krakenData) {
        console.log('[DataContext] Updating items with merged Perpetuals data')
        console.log('[DataContext] Merged data being set:', {
          openPositionsCount: mergedData.openPositions.length,
          openOrdersCount: mergedData.openOrders.length,
          availableMarginCount: mergedData.availableMargin.length,
          lockedMarginCount: mergedData.lockedMargin.length,
          openPositions: mergedData.openPositions,
        })
        
        const updatedItems = items.map((item) => {
          if (item.category === 'Perpetuals') {
            // Create a deep copy of mergedData to prevent mutation
            const perpetualsDataCopy = {
              openPositions: mergedData.openPositions.map(p => ({ ...p })),
              openOrders: mergedData.openOrders.map(o => ({ ...o })),
              availableMargin: mergedData.availableMargin.map(m => ({ ...m })),
              lockedMargin: mergedData.lockedMargin.map(m => ({ ...m })),
            }
            
            const updatedItem = {
              ...item,
              perpetualsData: perpetualsDataCopy,
            }
            console.log('[DataContext] Updated Perpetuals item:', {
              itemId: updatedItem.id,
              hasPerpetualsData: !!updatedItem.perpetualsData,
              positionsCount: updatedItem.perpetualsData?.openPositions?.length || 0,
              openOrdersCount: updatedItem.perpetualsData?.openOrders?.length || 0,
              positionsIds: updatedItem.perpetualsData?.openPositions?.map(p => p.id),
              ordersIds: updatedItem.perpetualsData?.openOrders?.map(o => o.id),
            })
            return updatedItem
          }
          return item
        })
        
        const finalPerpetualsItem = updatedItems.find(i => i.category === 'Perpetuals')
        console.log('[DataContext] Final Perpetuals item before return:', {
          hasItem: !!finalPerpetualsItem,
          hasPerpetualsData: !!finalPerpetualsItem?.perpetualsData,
          positionsCount: finalPerpetualsItem?.perpetualsData?.openPositions?.length || 0,
          openOrdersCount: finalPerpetualsItem?.perpetualsData?.openOrders?.length || 0,
          positionsIds: finalPerpetualsItem?.perpetualsData?.openPositions?.map(p => p.id),
          ordersIds: finalPerpetualsItem?.perpetualsData?.openOrders?.map(o => o.id),
        })
        return updatedItems
      } else {
        console.log('[DataContext] No data from Aster, Hyperliquid, or Kraken, keeping existing items')
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
      const perpetualsItem = itemsWithPerpetuals.find(item => item.category === 'Perpetuals')
      console.log('[DataContext] Before setData - Perpetuals item:', {
        hasItem: !!perpetualsItem,
        hasPerpetualsData: !!perpetualsItem?.perpetualsData,
        openPositionsCount: perpetualsItem?.perpetualsData?.openPositions?.length || 0,
        openOrdersCount: perpetualsItem?.perpetualsData?.openOrders?.length || 0,
        openPositions: perpetualsItem?.perpetualsData?.openPositions,
        openOrders: perpetualsItem?.perpetualsData?.openOrders,
      })
      
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
      
      // Log after state update (in next tick)
      setTimeout(() => {
        const currentPerpetualsItem = itemsWithPerpetuals.find(item => item.category === 'Perpetuals')
        console.log('[DataContext] After setData - Perpetuals item:', {
          hasItem: !!currentPerpetualsItem,
          hasPerpetualsData: !!currentPerpetualsItem?.perpetualsData,
          openPositionsCount: currentPerpetualsItem?.perpetualsData?.openPositions?.length || 0,
          openOrdersCount: currentPerpetualsItem?.perpetualsData?.openOrders?.length || 0,
        })
      }, 0)
      
      setLoading(false)
    } catch (err) {
      console.error('Error loading data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
      setLoading(false)
    }
  }

  // Refresh prices only
  const refreshPrices = async () => {
    if (!uid) return

    // Get current state using functional update to ensure we have latest data
    let currentItems: NetWorthItem[] = []
    let currentTransactions: NetWorthTransaction[] = []
    let currentCryptoPrices: Record<string, number> = {}
    let currentStockPrices: Record<string, number> = {}
    let currentUsdToChfRate: number | null = null

    setData((prev) => {
      // Capture current state
      currentItems = prev.netWorthItems
      currentTransactions = prev.transactions
      currentCryptoPrices = prev.cryptoPrices
      currentStockPrices = prev.stockPrices
      currentUsdToChfRate = prev.usdToChfRate
      return prev // No state change, just reading
    })

    // Check if we have items before proceeding
    if (currentItems.length === 0) {
      return
    }

    try {
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(currentItems),
        fetchStockPricesData(currentItems),
      ])

      // Use functional update to ensure we're working with latest state
      setData((prev) => {
        // Double-check items still exist before updating
        if (prev.netWorthItems.length === 0) {
          return prev
        }

        const calculationResult = calculateTotals(
          prev.netWorthItems,
          prev.transactions,
          cryptoData.cryptoPrices,
          stockPricesData,
          cryptoData.usdToChfRate
        )

        return {
          ...prev,
          cryptoPrices: cryptoData.cryptoPrices,
          stockPrices: stockPricesData,
          usdToChfRate: cryptoData.usdToChfRate,
          calculationResult,
        }
      })
    } catch (err) {
      console.error('Error refreshing prices:', err)
      // Don't update state on error - keep existing data
    }
  }

  // Refresh Perpetuals data only
  const refreshPerpetuals = async () => {
    if (!uid) return

    // Get current state using functional update to ensure we have latest data
    let currentItems: NetWorthItem[] = []
    let currentTransactions: NetWorthTransaction[] = []
    let currentCryptoPrices: Record<string, number> = {}
    let currentStockPrices: Record<string, number> = {}
    let currentUsdToChfRate: number | null = null

    setData((prev) => {
      // Capture current state
      currentItems = prev.netWorthItems
      currentTransactions = prev.transactions
      currentCryptoPrices = prev.cryptoPrices
      currentStockPrices = prev.stockPrices
      currentUsdToChfRate = prev.usdToChfRate
      return prev // No state change, just reading
    })

    // Check if we have items before proceeding
    if (currentItems.length === 0) {
      return
    }

    try {
      const itemsWithPerpetuals = await fetchPerpetualsData(currentItems)

      // Use functional update to ensure we're working with latest state
      setData((prev) => {
        // Double-check items still exist before updating
        if (prev.netWorthItems.length === 0) {
          return prev
        }

        const calculationResult = calculateTotals(
          itemsWithPerpetuals,
          prev.transactions,
          prev.cryptoPrices,
          prev.stockPrices,
          prev.usdToChfRate
        )

        return {
          ...prev,
          netWorthItems: itemsWithPerpetuals,
          calculationResult,
        }
      })
    } catch (err) {
      console.error('Error refreshing Perpetuals data:', err)
      // Don't update state on error - keep existing data
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

