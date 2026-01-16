import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
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
import { calculationResultToSummary } from '../lib/networth/netWorthSummaryService'
import { saveNetWorthSummaryFirestore } from '../services/firestoreService'
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
  // Track if we're currently saving summary to avoid infinite loops
  const isSavingSummaryRef = useRef(false)

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

    // Extract Account Equity from totalBalance (canonical field)
    const exchangeBalance: import('../pages/NetWorth').ExchangeBalance[] = []
    if (wsState.balances?.totalBalance !== undefined && wsState.balances.totalBalance !== null) {
      const accountValue = typeof wsState.balances.totalBalance === 'number' 
        ? wsState.balances.totalBalance 
        : parseFloat(String(wsState.balances.totalBalance)) || 0
      
      if (accountValue > 0) {
        exchangeBalance.push({
          id: 'kraken-account-equity',
          item: 'Kraken',
          holdings: accountValue,
          platform: 'Kraken',
        })
      }
    }

    return {
      exchangeBalance,
      openPositions: positions,
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
        hyperliquidData: !!hyperliquidData,
        hyperliquidPositions: hyperliquidData?.openPositions?.length || 0,
        krakenData: !!finalKrakenData,
        krakenWsStatus: krakenWsStateRef.current?.status || 'disconnected',
        krakenPositions: finalKrakenData?.openPositions?.length || 0,
        krakenOrders: finalKrakenData?.openOrders?.length || 0,
      })

      // Log the actual data structures
      console.log('[DataContext] Aster data structure:', {
        openPositions: asterData?.openPositions,
      })
      
      console.log('[DataContext] Hyperliquid data structure:', {
        openPositions: hyperliquidData?.openPositions,
      })

      // Merge Aster, Hyperliquid, and Kraken data
      // Create defensive copies to prevent mutation
      const asterPositions = Array.isArray(asterData?.openPositions) ? [...asterData.openPositions] : []
      const hyperliquidPositions = Array.isArray(hyperliquidData?.openPositions) ? [...hyperliquidData.openPositions] : []
      const krakenPositions = Array.isArray(finalKrakenData?.openPositions) ? [...finalKrakenData.openPositions] : []
      const asterOrders = Array.isArray(asterData?.openOrders) ? [...asterData.openOrders] : []
      const hyperliquidOrders = Array.isArray(hyperliquidData?.openOrders) ? [...hyperliquidData.openOrders] : []
      const krakenOrders = Array.isArray(finalKrakenData?.openOrders) ? [...finalKrakenData.openOrders] : []
      const asterExchangeBalance = Array.isArray(asterData?.exchangeBalance) ? [...asterData.exchangeBalance] : []
      const hyperliquidExchangeBalance = Array.isArray(hyperliquidData?.exchangeBalance) ? [...hyperliquidData.exchangeBalance] : []
      const krakenExchangeBalance = Array.isArray(finalKrakenData?.exchangeBalance) ? [...finalKrakenData.exchangeBalance] : []
      
      console.log('[DataContext] Before merge - counts:', {
        asterPositions: asterPositions.length,
        hyperliquidPositions: hyperliquidPositions.length,
        krakenPositions: krakenPositions.length,
        asterOrders: asterOrders.length,
        hyperliquidOrders: hyperliquidOrders.length,
        krakenOrders: krakenOrders.length,
        asterExchangeBalance: asterExchangeBalance.length,
        hyperliquidExchangeBalance: hyperliquidExchangeBalance.length,
        krakenExchangeBalance: krakenExchangeBalance.length,
      })
      
      const mergedData = {
        openPositions: [...asterPositions, ...hyperliquidPositions, ...krakenPositions],
        openOrders: [...asterOrders, ...hyperliquidOrders, ...krakenOrders],
      }
      
      console.log('[DataContext] After merge - mergedData structure:', {
        openPositionsCount: mergedData.openPositions.length,
        openOrdersCount: mergedData.openOrders.length,
        openPositionsIds: mergedData.openPositions.map(p => p.id),
        openOrdersIds: mergedData.openOrders.map(o => o.id),
      })

      console.log('[DataContext] Merged data:', {
        openPositions: mergedData.openPositions,
        openPositionsCount: mergedData.openPositions.length,
      })

      // Helper function to ensure exchangeBalance is initialized
      const ensureExchangeBalance = (item: NetWorthItem): import('../pages/NetWorth').ExchangeBalance[] => {
        const existingExchangeBalance = item.perpetualsData?.exchangeBalance || []
        if (existingExchangeBalance.length > 0) {
          return existingExchangeBalance
        }
        // Return empty array if no existing exchangeBalance (no default entry)
        return []
      }

      // Update items with merged data (or just ensure exchangeBalance is set)
      const updatedItems = items.map((item) => {
        if (item.category === 'Perpetuals') {
          // Merge exchangeBalance from API sources
          const apiExchangeBalance = [...asterExchangeBalance, ...hyperliquidExchangeBalance, ...krakenExchangeBalance]
          
          // Use API exchangeBalance if available, otherwise use existing or default
          let exchangeBalance: import('../pages/NetWorth').ExchangeBalance[]
          if (apiExchangeBalance.length > 0) {
            // Use exchangeBalance from APIs
            exchangeBalance = apiExchangeBalance
          } else {
            // Fallback to existing or default
            exchangeBalance = ensureExchangeBalance(item)
          }
          
          if (asterData || hyperliquidData || finalKrakenData) {
            // We have API data, merge it
            console.log('[DataContext] Updating items with merged Perpetuals data')
            console.log('[DataContext] Merged data being set:', {
              openPositionsCount: mergedData.openPositions.length,
              openOrdersCount: mergedData.openOrders.length,
              exchangeBalanceCount: exchangeBalance.length,
              openPositions: mergedData.openPositions,
            })
            
            // Create a deep copy of mergedData to prevent mutation
            const perpetualsDataCopy = {
              exchangeBalance: exchangeBalance.map(b => ({ ...b })),
              openPositions: mergedData.openPositions.map(p => ({ ...p })),
              openOrders: mergedData.openOrders.map(o => ({ ...o })),
            }
            
            const updatedItem = {
              ...item,
              perpetualsData: perpetualsDataCopy,
            }
            console.log('[DataContext] Updated Perpetuals item:', {
              itemId: updatedItem.id,
              hasPerpetualsData: !!updatedItem.perpetualsData,
              exchangeBalanceCount: updatedItem.perpetualsData?.exchangeBalance?.length || 0,
              positionsCount: updatedItem.perpetualsData?.openPositions?.length || 0,
              openOrdersCount: updatedItem.perpetualsData?.openOrders?.length || 0,
              positionsIds: updatedItem.perpetualsData?.openPositions?.map(p => p.id),
              ordersIds: updatedItem.perpetualsData?.openOrders?.map(o => o.id),
            })
            return updatedItem
          } else {
            // No API data, but ensure exchangeBalance and perpetualsData structure is set
            const perpetualsDataCopy = {
              exchangeBalance: exchangeBalance.map(b => ({ ...b })),
              openPositions: (item.perpetualsData?.openPositions || []).map(p => ({ ...p })),
              openOrders: (item.perpetualsData?.openOrders || []).map(o => ({ ...o })),
            }
            
            const updatedItem = {
              ...item,
              perpetualsData: perpetualsDataCopy,
            }
            console.log('[DataContext] No API data, but ensured exchangeBalance:', {
              itemId: updatedItem.id,
              exchangeBalanceCount: updatedItem.perpetualsData?.exchangeBalance?.length || 0,
            })
            return updatedItem
          }
        }
        return item
      })
      
      const finalPerpetualsItem = updatedItems.find(i => i.category === 'Perpetuals')
      console.log('[DataContext] Final Perpetuals item before return:', {
        hasItem: !!finalPerpetualsItem,
        hasPerpetualsData: !!finalPerpetualsItem?.perpetualsData,
        exchangeBalanceCount: finalPerpetualsItem?.perpetualsData?.exchangeBalance?.length || 0,
        positionsCount: finalPerpetualsItem?.perpetualsData?.openPositions?.length || 0,
        openOrdersCount: finalPerpetualsItem?.perpetualsData?.openOrders?.length || 0,
        positionsIds: finalPerpetualsItem?.perpetualsData?.openPositions?.map(p => p.id),
        ordersIds: finalPerpetualsItem?.perpetualsData?.openOrders?.map(o => o.id),
      })
      return updatedItems
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
      
      // Step 5: Convert to summary and save to Firestore (for snapshot API)
      if (uid && !isSavingSummaryRef.current) {
        isSavingSummaryRef.current = true
        try {
          const summary = calculationResultToSummary(calculationResult, uid, 'CHF')
          await saveNetWorthSummaryFirestore(uid, summary)
        } catch (err) {
          console.error('[DataContext] Error saving net worth summary:', err)
        } finally {
          isSavingSummaryRef.current = false
        }
      }
      
      // Step 6: Update frontend (single state update)
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

        // Save summary to Firestore (for snapshot API)
        if (uid && !isSavingSummaryRef.current) {
          isSavingSummaryRef.current = true
          calculationResultToSummary(calculationResult, uid, 'CHF')
            .then(summary => saveNetWorthSummaryFirestore(uid, summary))
            .catch(err => console.error('[DataContext] Error saving net worth summary:', err))
            .finally(() => { isSavingSummaryRef.current = false })
        }

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

        // Save summary to Firestore (for snapshot API)
        if (uid && !isSavingSummaryRef.current) {
          isSavingSummaryRef.current = true
          calculationResultToSummary(calculationResult, uid, 'CHF')
            .then(summary => saveNetWorthSummaryFirestore(uid, summary))
            .catch(err => console.error('[DataContext] Error saving net worth summary:', err))
            .finally(() => { isSavingSummaryRef.current = false })
        }

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

      // Step 4: Save summary to Firestore (for snapshot API)
      if (uid && !isSavingSummaryRef.current) {
        isSavingSummaryRef.current = true
        try {
          const summary = calculationResultToSummary(calculationResult, uid, 'CHF')
          await saveNetWorthSummaryFirestore(uid, summary)
        } catch (err) {
          console.error('[DataContext] Error saving net worth summary:', err)
        } finally {
          isSavingSummaryRef.current = false
        }
      }

      // Step 5: Update frontend (single state update)
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

  // Save summary to Firestore whenever calculationResult changes
  // This ensures summary is always up-to-date for snapshot API
  useEffect(() => {
    if (!uid || loading || !data.calculationResult || isSavingSummaryRef.current) {
      return
    }

    isSavingSummaryRef.current = true
    const summary = calculationResultToSummary(data.calculationResult, uid, 'CHF')
    saveNetWorthSummaryFirestore(uid, summary)
      .catch(err => console.error('[DataContext] Error saving net worth summary:', err))
      .finally(() => { isSavingSummaryRef.current = false })
  }, [uid, loading, data.calculationResult])

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

