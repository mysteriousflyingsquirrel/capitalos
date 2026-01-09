import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
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
import { KrakenFuturesWs, type KrakenWsState } from '../services/krakenFuturesWs'
import type { PerpetualsData } from '../pages/NetWorth'
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
  const { rapidApiKey, krakenApiKey, krakenApiSecretKey } = useApiKeys()
  
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
  // Use ref for WebSocket state to prevent re-renders on every update
  const krakenWsStateRef = useRef<KrakenWsState | null>(null)

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

  // Convert Kraken WebSocket state to PerpetualsData format
  const convertKrakenWsStateToPerpetualsData = (wsState: KrakenWsState): PerpetualsData => {
    const positions: import('../pages/NetWorth').PerpetualsOpenPosition[] = (wsState.positions || []).map((pos, index) => ({
      id: `kraken-${pos.instrument}-${index}`,
      ticker: pos.instrument,
      margin: pos.initialMargin || 0,
      pnl: pos.pnl || 0,
      platform: 'Kraken',
      positionSide: pos.balance > 0 ? 'LONG' : pos.balance < 0 ? 'SHORT' : null,
      leverage: pos.effectiveLeverage !== undefined && pos.effectiveLeverage !== null ? pos.effectiveLeverage : null,
    }))

    // Map balances to available/locked margin
    const availableMargin: import('../pages/NetWorth').PerpetualsAvailableMargin[] = []
    const lockedMargin: import('../pages/NetWorth').PerpetualsLockedMargin[] = []

    if (wsState.balances) {
      const balances = wsState.balances
      const unit = balances.currency || 'USD'
      
      // Available margin
      if (balances.availableMargin !== undefined && balances.availableMargin !== null) {
        availableMargin.push({
          id: 'kraken-available',
          asset: unit,
          margin: balances.availableMargin,
          platform: 'Kraken',
        })
      }

      // Locked margin (initial margin)
      if (balances.initialMargin !== undefined && balances.initialMargin !== null) {
        lockedMargin.push({
          id: 'kraken-locked',
          asset: unit,
          margin: balances.initialMargin,
          platform: 'Kraken',
        })
      }
    }

    return {
      openPositions: positions,
      availableMargin,
      lockedMargin,
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
      
      // Fetch Aster and Hyperliquid data (Kraken uses WebSocket only)
      const [asterData, hyperliquidData] = await Promise.all([
        fetchAsterPerpetualsData(uid),
        fetchHyperliquidPerpetualsData(uid),
      ])
      
      // Get Kraken data from WebSocket (only source)
      // Convert current WebSocket state to PerpetualsData format
      const finalKrakenData = krakenWsStateRef.current && krakenWsStateRef.current.status === 'subscribed'
        ? convertKrakenWsStateToPerpetualsData(krakenWsStateRef.current)
        : null

      console.log('[DataContext] Fetch results:', {
        asterData: !!asterData,
        asterPositions: asterData?.openPositions?.length || 0,
        asterLockedMargin: asterData?.lockedMargin?.length || 0,
        asterAvailableMargin: asterData?.availableMargin?.length || 0,
        hyperliquidData: !!hyperliquidData,
        hyperliquidPositions: hyperliquidData?.openPositions?.length || 0,
        hyperliquidLockedMargin: hyperliquidData?.lockedMargin?.length || 0,
        hyperliquidAvailableMargin: hyperliquidData?.availableMargin?.length || 0,
        krakenData: !!finalKrakenData,
        krakenWsStatus: krakenWsStateRef.current?.status || 'disconnected',
        krakenDataType: finalKrakenData ? typeof finalKrakenData : 'null',
        krakenPositions: finalKrakenData?.openPositions?.length || 0,
        krakenOrders: finalKrakenData?.openOrders?.length || 0,
        krakenLockedMargin: finalKrakenData?.lockedMargin?.length || 0,
        krakenAvailableMargin: finalKrakenData?.availableMargin?.length || 0,
        krakenDataKeys: finalKrakenData ? Object.keys(finalKrakenData) : [],
      })
      
      console.log('[DataContext] Kraken data details:', {
        data: finalKrakenData,
        positions: finalKrakenData?.openPositions,
        orders: finalKrakenData?.openOrders,
        availableMargin: finalKrakenData?.availableMargin,
        lockedMargin: finalKrakenData?.lockedMargin,
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
      const krakenPositions = Array.isArray(finalKrakenData?.openPositions) ? [...finalKrakenData.openPositions] : []
      const asterOrders = Array.isArray(asterData?.openOrders) ? [...asterData.openOrders] : []
      const hyperliquidOrders = Array.isArray(hyperliquidData?.openOrders) ? [...hyperliquidData.openOrders] : []
      const krakenOrders = Array.isArray(finalKrakenData?.openOrders) ? [...finalKrakenData.openOrders] : []
      const asterAvailableMargin = Array.isArray(asterData?.availableMargin) ? [...asterData.availableMargin] : []
      const hyperliquidAvailableMargin = Array.isArray(hyperliquidData?.availableMargin) ? [...hyperliquidData.availableMargin] : []
      const krakenAvailableMargin = Array.isArray(finalKrakenData?.availableMargin) ? [...finalKrakenData.availableMargin] : []
      const asterLockedMargin = Array.isArray(asterData?.lockedMargin) ? [...asterData.lockedMargin] : []
      const hyperliquidLockedMargin = Array.isArray(hyperliquidData?.lockedMargin) ? [...hyperliquidData.lockedMargin] : []
      const krakenLockedMargin = Array.isArray(finalKrakenData?.lockedMargin) ? [...finalKrakenData.lockedMargin] : []
      
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
      if (asterData || hyperliquidData || finalKrakenData) {
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

  // Load all data - exact flow: fetch exchange prices -> fetch crypto prices -> fetch perpetuals data -> update frontend
  const loadAllData = async () => {
    if (!uid) {
      setLoading(false)
      return
    }

    try {
      setError(null)
      
      // Step 1: Load Firebase data
      const firebaseData = await loadFirebaseData()
      
      // Step 2: Fetch exchange prices (USD→CHF rate) and crypto/stock prices
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(firebaseData.items),
        fetchStockPricesData(firebaseData.items),
      ])
      
      // Step 3: Fetch Perpetuals data (reads from WebSocket state for Kraken)
      const itemsWithPerpetuals = await fetchPerpetualsData(firebaseData.items)
      
      // Step 4: Calculate totals
      const calculationResult = calculateTotals(
        itemsWithPerpetuals,
        firebaseData.transactions,
        cryptoData.cryptoPrices,
        stockPricesData,
        cryptoData.usdToChfRate
      )
      
      // Step 5: Update frontend (single state update)
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

  // Refresh prices only (for manual refresh)
  const refreshPrices = async () => {
    if (!uid) return

    let currentItems: NetWorthItem[] = []
    setData((prev) => {
      currentItems = prev.netWorthItems
      return prev
    })

    if (currentItems.length === 0) {
      return
    }

    try {
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(currentItems),
        fetchStockPricesData(currentItems),
      ])

      setData((prev) => {
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
    }
  }

  // Refresh Perpetuals data only (for manual refresh)
  const refreshPerpetuals = async () => {
    if (!uid) return

    let currentItems: NetWorthItem[] = []
    setData((prev) => {
      currentItems = prev.netWorthItems
      return prev
    })

    if (currentItems.length === 0) {
      return
    }

    try {
      const itemsWithPerpetuals = await fetchPerpetualsData(currentItems)

      setData((prev) => {
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

  // Unified refresh function: fetch exchange prices -> fetch crypto prices -> fetch perpetuals data -> update frontend
  const refreshAllData = async () => {
    if (!uid) return

    // Get current state
    let currentItems: NetWorthItem[] = []
    let currentTransactions: NetWorthTransaction[] = []
    let currentCryptoPrices: Record<string, number> = {}
    let currentStockPrices: Record<string, number> = {}
    let currentUsdToChfRate: number | null = null

    setData((prev) => {
      currentItems = prev.netWorthItems
      currentTransactions = prev.transactions
      currentCryptoPrices = prev.cryptoPrices
      currentStockPrices = prev.stockPrices
      currentUsdToChfRate = prev.usdToChfRate
      return prev // No state change, just reading
    })

    if (currentItems.length === 0) {
      return
    }

    try {
      // Step 1: Fetch exchange prices (USD→CHF rate) and crypto/stock prices
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(currentItems),
        fetchStockPricesData(currentItems),
      ])
      
      // Step 2: Fetch perpetuals data (reads from WebSocket state for Kraken)
      const itemsWithPerpetuals = await fetchPerpetualsData(currentItems)
      
      // Step 3: Calculate totals
      const calculationResult = calculateTotals(
        itemsWithPerpetuals,
        currentTransactions,
        cryptoData.cryptoPrices,
        stockPricesData,
        cryptoData.usdToChfRate
      )

      // Step 4: Update frontend (single state update)
      setData((prev) => {
        if (prev.netWorthItems.length === 0) {
          return prev
        }
        return {
          ...prev,
          netWorthItems: itemsWithPerpetuals,
          cryptoPrices: cryptoData.cryptoPrices,
          stockPrices: stockPricesData,
          usdToChfRate: cryptoData.usdToChfRate,
          calculationResult,
        }
      })
    } catch (err) {
      console.error('Error in periodic refresh:', err)
    }
  }

  // Set up periodic refresh (every 5 minutes)
  useEffect(() => {
    if (!uid || loading) return

    const interval = setInterval(() => {
      refreshAllData()
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [uid, loading])

  // Set up Kraken Futures WebSocket connection
  useEffect(() => {
    if (!uid || !krakenApiKey || !krakenApiSecretKey) {
      // Disconnect if credentials are not available
      krakenWsStateRef.current = { status: 'disconnected' }
      return
    }

    // Create WebSocket instance with onState callback
    // WebSocket only stores state in ref - UI updates happen every 5 minutes via refreshAllData
    const ws = new KrakenFuturesWs({
      apiKey: krakenApiKey,
      apiSecret: krakenApiSecretKey,
      onState: (state) => {
        // Only store WebSocket state in ref - does NOT trigger re-renders
        // UI will be updated every 5 minutes via the periodic refresh cycle
        krakenWsStateRef.current = state
      },
    })

    // Connect to WebSocket
    ws.connect()

    // Cleanup on unmount or when credentials change
    return () => {
      ws.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, krakenApiKey, krakenApiSecretKey])

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

