import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, ReactNode } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useCurrency } from './CurrencyContext'
import { useApiKeys } from './ApiKeysContext'
import { useSyncStatus } from '../lib/dataSafety/syncStatus'
import {
  loadNetWorthItems,
  loadNetWorthTransactions,
  loadCashflowInflowItems,
  loadCashflowOutflowItems,
} from '../services/storageService'
import { loadSnapshots, type NetWorthSnapshot } from '../services/snapshotService'
import { fetchCryptoData } from '../services/cryptoCompareService'
import { fetchStockPrices } from '../services/yahooFinanceService'
import { fetchHyperliquidPerpetualsData } from '../services/hyperliquidService'
import { MexcFuturesPositionsWs, type MexcWsStatus } from '../services/mexcFuturesPositionsWs'
import { fetchMexcEquityUsd, fetchMexcOpenOrders, fetchMexcOpenPositions, fetchMexcUnrealizedPnlWindows } from '../services/mexcFuturesService'
import type { ExchangeBalance, PerpetualsData, PerpetualsOpenPosition, PortfolioPnL } from '../pages/NetWorth'
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
  isInitialLoad: boolean // True only during the very first load, false for refreshes
  mexcPositionsWs: PerpetualsOpenPosition[]
  mexcPositionsWsStatus: MexcWsStatus
  mexcPositionsWsError: string | null
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
  const { 
    rapidApiKey, 
    hyperliquidWalletAddress,
    mexcApiKey,
    mexcSecretKey,
    apiKeysLoaded,
    getCurrentKeys,
  } = useApiKeys()
  const { setHasInitialDataLoaded } = useSyncStatus()
  const prevUidRef = useRef<string | null>(null)
  
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
  const mexcWsStatusRef = useRef<MexcWsStatus>('disconnected')
  const mexcWsPositionsMapRef = useRef<Map<string, PerpetualsOpenPosition>>(new Map())
  // Reactive MEXC WS state for pages (positions table + status label)
  const [mexcPositionsWs, setMexcPositionsWs] = useState<PerpetualsOpenPosition[]>([])
  const [mexcPositionsWsStatus, setMexcPositionsWsStatus] = useState<MexcWsStatus>('disconnected')
  const [mexcPositionsWsError, setMexcPositionsWsError] = useState<string | null>(null)
  // Track if we're currently saving summary to avoid infinite loops
  const isSavingSummaryRef = useRef(false)
  // Track if data has ever been loaded (to distinguish initial load from refreshes)
  const hasLoadedDataRef = useRef(false)

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

  // Fetch Perpetuals data (Hyperliquid + MEXC)
  // Accepts optional keys parameter - if not provided, uses closure values
  // This allows refreshAllData to pass ref keys (always current) while other callers use closure
  const fetchPerpetualsData = async (
    items: NetWorthItem[],
    providedKeys?: {
      hyperliquidWalletAddress: string | null
    }
  ): Promise<NetWorthItem[]> => {
    // Use provided keys if available, otherwise use closure values
    const keys = providedKeys || {
      hyperliquidWalletAddress,
    }
    // Always log (not just dev mode) to diagnose production issues
    console.log('[DataContext] fetchPerpetualsData called:', {
      apiKeysLoaded,
      hasHyperliquidKey: !!keys.hyperliquidWalletAddress,
      hasUid: !!uid,
      uid: uid,
      itemsCount: items.length,
      hasPerpetualsInItems: items.some(item => item.category === 'Perpetuals'),
      timestamp: new Date().toISOString(),
    })
    
    if (!uid) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[DataContext] No UID, skipping Perpetuals fetch')
      }
      return items
    }

    // Gate Perpetuals fetch on apiKeysLoaded
    if (!apiKeysLoaded) {
      console.warn('[DataContext] fetchPerpetualsData: API keys not loaded yet, removing Perpetuals items', {
        itemsCount: items.length,
        perpetualsItemsCount: items.filter(item => item.category === 'Perpetuals').length,
      })
      // Remove any existing Perpetuals items and return
      return items.filter(item => item.category !== 'Perpetuals')
    }

    // Remove any existing Perpetuals items (they're created dynamically, not from Firebase)
    const itemsWithoutPerpetuals = items.filter(item => item.category !== 'Perpetuals')

    try {
      console.log('[DataContext] fetchPerpetualsData: Fetching Hyperliquid and MEXC data...')

      // Fetch Hyperliquid - pass wallet address explicitly from parameters
      const hyperliquidData = await fetchHyperliquidPerpetualsData({
        uid,
        walletAddress: keys.hyperliquidWalletAddress || '',
      })

      // MEXC: positions from WS state ref (if subscribed), orders/performance/equity via REST endpoints
      const mexcWsPositions = mexcWsStatusRef.current === 'subscribed'
        ? Array.from(mexcWsPositionsMapRef.current.values()).map(p => ({ ...p }))
        : []

      const [mexcOpenOrders, mexcPortfolioPnL, mexcEquityUsd, mexcRestPositions] = await Promise.all([
        fetchMexcOpenOrders({ uid }),
        fetchMexcUnrealizedPnlWindows({ uid }),
        fetchMexcEquityUsd({ uid }),
        fetchMexcOpenPositions({ uid }),
      ])

      // Baseline from REST + overlay WS updates (WS may be sparse/non-snapshot)
      const mexcPositionsById = new Map<string, PerpetualsOpenPosition>()
      if (Array.isArray(mexcRestPositions)) {
        for (const p of mexcRestPositions as any[]) {
          if (p && typeof p.id === 'string') mexcPositionsById.set(p.id, p as PerpetualsOpenPosition)
        }
      }
      for (const p of mexcWsPositions) {
        mexcPositionsById.set(p.id, p)
      }
      const mexcPositions = Array.from(mexcPositionsById.values())

      const mexcExchangeBalance: ExchangeBalance[] = mexcEquityUsd !== null
        ? [{
            id: 'mexc-account-equity',
            item: 'MEXC',
            holdings: mexcEquityUsd,
            platform: 'MEXC',
          }]
        : []

      const mexcData: PerpetualsData = {
        exchangeBalance: mexcExchangeBalance,
        openPositions: mexcPositions,
        openOrders: mexcOpenOrders,
        ...(mexcPortfolioPnL && { portfolioPnL: mexcPortfolioPnL as PortfolioPnL }),
      }

      // Always log fetch results (not just dev mode)
      console.log('[DataContext] fetchPerpetualsData: Fetch results:', {
        hyperliquidData: !!hyperliquidData,
        hyperliquidPositions: hyperliquidData?.openPositions?.length || 0,
        hyperliquidExchangeBalance: hyperliquidData?.exchangeBalance?.length || 0,
        mexcPositions: mexcData.openPositions?.length || 0,
        mexcExchangeBalance: mexcData.exchangeBalance?.length || 0,
        mexcOpenOrders: (mexcData as any)?.openOrders?.length || 0,
      })

      // Create one Perpetuals item per exchange (no cross-exchange merging)
      const perpItems: NetWorthItem[] = []

      const hasHyperliquidConfigured = !!keys.hyperliquidWalletAddress
      // Use ref-backed keys for stability (avoid transient null state during refresh)
      const currentKeys = getCurrentKeys()
      const hasMexcConfigured = !!currentKeys.mexcApiKey && !!currentKeys.mexcSecretKey

      if (hasHyperliquidConfigured) {
        const hl: PerpetualsData = hyperliquidData || { exchangeBalance: [], openPositions: [], openOrders: [] }
        perpItems.push({
          id: 'perpetuals-hyperliquid',
          category: 'Perpetuals',
          name: 'Hyperliquid',
          platform: 'Hyperliquid',
          currency: 'USD',
          perpetualsData: hl,
        })
      }

      if (hasMexcConfigured) {
        perpItems.push({
          id: 'perpetuals-mexc',
          category: 'Perpetuals',
          name: 'MEXC',
          platform: 'MEXC',
          currency: 'USD',
          perpetualsData: mexcData,
        })
      }

      // Return without Perpetuals plus per-exchange Perpetuals items
      if (perpItems.length > 0) {
        return [...itemsWithoutPerpetuals, ...perpItems]
      }

      return itemsWithoutPerpetuals
    } catch (error) {
      console.error('[DataContext] fetchPerpetualsData: Error fetching Perpetuals data:', error, {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        itemsCount: items.length,
        itemsWithoutPerpetualsCount: itemsWithoutPerpetuals.length,
        willReturnEmpty: itemsWithoutPerpetuals.length === 0,
      })
      // Return items without Perpetuals on error
      return itemsWithoutPerpetuals
    }
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
      
      // Step 3: Wait for API keys to load (if initial load), then fetch Perpetuals data
      // During initial load, we want to wait for keys so perpetuals are ready before showing the UI
      const isInitialLoad = !hasLoadedDataRef.current
      
      if (isInitialLoad && !apiKeysLoaded) {
        // Wait for API keys to load (max 5 seconds)
        const maxWait = 5000
        const startTime = Date.now()
        
        while (!apiKeysLoaded && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[DataContext] Waited for API keys:', {
            apiKeysLoaded,
            waitedMs: Date.now() - startTime,
          })
        }
      }
      
      // Now fetch Perpetuals data (keys are loaded or we've waited long enough)
      // Use getCurrentKeys() to ensure we always have the latest keys, not stale closure values
      const currentKeys = getCurrentKeys()
      const itemsWithPerpetuals = await fetchPerpetualsData(firebaseData.items, {
        hyperliquidWalletAddress: currentKeys.hyperliquidWalletAddress,
      })
      
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
      
      hasLoadedDataRef.current = true
      setLoading(false)
      // Signal to AuthGate that initial data load is complete
      setHasInitialDataLoaded(true)
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
          saveNetWorthSummaryFirestore(uid, calculationResultToSummary(calculationResult, uid, 'CHF'))
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
      // Use getCurrentKeys() to ensure we always have the latest keys
      const currentKeys = getCurrentKeys()
      const itemsWithPerpetuals = await fetchPerpetualsData(currentItems, {
        hyperliquidWalletAddress: currentKeys.hyperliquidWalletAddress,
      })

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
          saveNetWorthSummaryFirestore(uid, calculationResultToSummary(calculationResult, uid, 'CHF'))
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

  // Reset flag synchronously when uid changes (before regular useEffect runs)
  // useLayoutEffect runs synchronously after DOM mutations, before paint
  // This ensures AuthGate sees the correct state immediately when checking
  useLayoutEffect(() => {
    if (prevUidRef.current !== uid) {
      prevUidRef.current = uid
      hasLoadedDataRef.current = false
      setHasInitialDataLoaded(false)
    }
  }, [uid, setHasInitialDataLoaded])

  // Automatic retry: when apiKeysLoaded transitions false → true
  // and data is already loaded, automatically refresh Perpetuals
  useEffect(() => {
    if (!uid || !apiKeysLoaded || !hasLoadedDataRef.current) {
      return
    }

    // Keys just became ready and data is already loaded - refresh Perpetuals
    refreshPerpetuals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeysLoaded, uid]) // Only trigger when apiKeysLoaded changes

  // Initial load
  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }

    // Start loading - flag was already reset synchronously in useLayoutEffect above
    loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]) // Reload when uid changes

  // Note: convert function dependency is handled within calculateTotals
  // We recalculate when data changes, not when convert changes, since convert is stable

  // Unified refresh function: fetch exchange prices -> fetch crypto prices -> fetch perpetuals data -> update frontend
  const refreshAllData = async () => {
    console.log('[DataContext] refreshAllData called (periodic refresh)', { uid, timestamp: new Date().toISOString() })
    
    if (!uid) {
      console.log('[DataContext] refreshAllData: No UID, returning early')
      return
    }

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

    console.log('[DataContext] refreshAllData: Read current state', {
      currentItemsCount: currentItems.length,
      hasPerpetuals: currentItems.some(item => item.category === 'Perpetuals'),
      perpetualsItemId: currentItems.find(item => item.category === 'Perpetuals')?.id,
    })

    if (currentItems.length === 0) {
      console.warn('[DataContext] refreshAllData: currentItems is empty, returning early (this may indicate items were already cleared)')
      return
    }

    try {
      console.log('[DataContext] refreshAllData: Starting fetch (crypto prices, stock prices, perpetuals)')
      
      // Step 1: Fetch exchange prices (USD→CHF rate) and crypto/stock prices
      const [cryptoData, stockPricesData] = await Promise.all([
        fetchCryptoPrices(currentItems),
        fetchStockPricesData(currentItems),
      ])
      
      // Step 2: Get current keys from ref (always available, even if state resets)
      // This ensures we always have the latest keys, not stale closure values
      const currentKeys = getCurrentKeys()
      
      console.log('[DataContext] refreshAllData: Fetched crypto/stock prices, about to fetch perpetuals', {
        currentItemsCount: currentItems.length,
        apiKeysLoaded,
        hasHyperliquidKey: !!currentKeys.hyperliquidWalletAddress,
      })
      
      // Step 3: Fetch perpetuals data
      // Pass keys from ref (always current) instead of using closure values
      const itemsWithPerpetuals = await fetchPerpetualsData(currentItems, {
        hyperliquidWalletAddress: currentKeys.hyperliquidWalletAddress,
      })
      
      console.log('[DataContext] refreshAllData: After fetchPerpetualsData', {
        itemsWithPerpetualsCount: itemsWithPerpetuals.length,
        hadPerpetualsBefore: currentItems.some(item => item.category === 'Perpetuals'),
        hasPerpetualsAfter: itemsWithPerpetuals.some(item => item.category === 'Perpetuals'),
        itemsWithPerpetualsCategories: itemsWithPerpetuals.map(item => item.category),
      })
      
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
        console.log('[DataContext] refreshAllData: Updating state', {
          prevItemsCount: prev.netWorthItems.length,
          newItemsCount: itemsWithPerpetuals.length,
          willPreservePrev: prev.netWorthItems.length === 0,
        })
        
        if (prev.netWorthItems.length === 0) {
          console.warn('[DataContext] refreshAllData: prev.netWorthItems is empty, preserving previous state (not updating)')
          return prev
        }
        
        if (itemsWithPerpetuals.length === 0) {
          console.error('[DataContext] refreshAllData: WARNING - itemsWithPerpetuals is empty! This will clear all items!', {
            prevItemsCount: prev.netWorthItems.length,
            prevCategories: prev.netWorthItems.map(item => item.category),
          })
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
      
      console.log('[DataContext] refreshAllData: Completed successfully')
    } catch (err) {
      console.error('[DataContext] Error in periodic refresh:', err, {
        stack: err instanceof Error ? err.stack : undefined,
        currentItemsCount: currentItems.length,
      })
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

  const mexcWsSubscribedRef = useRef(false)

  // Set up MEXC Futures WebSocket connection (positions only)
  useEffect(() => {
    if (!uid || !mexcApiKey || !mexcSecretKey || !apiKeysLoaded) {
      mexcWsStatusRef.current = 'disconnected'
      mexcWsPositionsMapRef.current = new Map()
      mexcWsSubscribedRef.current = false
      setMexcPositionsWsStatus('disconnected')
      setMexcPositionsWsError(null)
      setMexcPositionsWs([])
      return
    }

    const ws = new MexcFuturesPositionsWs({
      apiKey: mexcApiKey,
      secretKey: mexcSecretKey,
      onPositions: (incoming) => {
        for (const p of incoming) {
          if (p.amountToken === 0) {
            mexcWsPositionsMapRef.current.delete(p.id)
          } else {
            mexcWsPositionsMapRef.current.set(p.id, p)
          }
        }
        // Reactive: update table state (positions only)
        setMexcPositionsWs(Array.from(mexcWsPositionsMapRef.current.values()))
      },
      onStatus: (status, err) => {
        mexcWsStatusRef.current = status
        setMexcPositionsWsStatus(status)
        setMexcPositionsWsError(err ?? null)

        // When first subscribed and data has loaded, trigger a single perpetuals refresh
        if (
          status === 'subscribed' &&
          !mexcWsSubscribedRef.current &&
          hasLoadedDataRef.current
        ) {
          mexcWsSubscribedRef.current = true
          setTimeout(() => {
            refreshPerpetuals()
          }, 500)
        }
      },
    })

    ws.connect()

    return () => {
      ws.disconnect()
      mexcWsSubscribedRef.current = false
      setMexcPositionsWsStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, mexcApiKey, mexcSecretKey, apiKeysLoaded])

  return (
    <DataContext.Provider
      value={{
        data,
        loading,
        error,
        isInitialLoad: loading && !hasLoadedDataRef.current,
        mexcPositionsWs,
        mexcPositionsWsStatus,
        mexcPositionsWsError,
        refreshData,
        refreshPrices,
        refreshPerpetuals,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

