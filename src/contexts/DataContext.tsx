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
  isInitialLoad: boolean // True only during the very first load, false for refreshes
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
    krakenApiKey, 
    krakenApiSecretKey,
    asterApiKey,
    asterApiSecretKey,
    hyperliquidWalletAddress,
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
  const krakenWsStateRef = useRef<KrakenWsState | null>(null)
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
  // Accepts optional keys parameter - if not provided, uses closure values
  // This allows refreshAllData to pass ref keys (always current) while other callers use closure
  const fetchPerpetualsData = async (
    items: NetWorthItem[],
    providedKeys?: {
      asterApiKey: string | null
      asterApiSecretKey: string | null
      hyperliquidWalletAddress: string | null
    }
  ): Promise<NetWorthItem[]> => {
    // Use provided keys if available, otherwise use closure values
    const keys = providedKeys || {
      asterApiKey,
      asterApiSecretKey,
      hyperliquidWalletAddress,
    }
    // Always log (not just dev mode) to diagnose production issues
    console.log('[DataContext] fetchPerpetualsData called:', {
      apiKeysLoaded,
      hasAsterKey: !!keys.asterApiKey,
      hasAsterSecretKey: !!keys.asterApiSecretKey,
      hasHyperliquidKey: !!keys.hyperliquidWalletAddress,
      krakenWsStatus: krakenWsStateRef.current?.status || 'disconnected',
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
      console.log('[DataContext] fetchPerpetualsData: Fetching Aster, Hyperliquid, and Kraken data...')
      
      // Fetch Aster and Hyperliquid data (Kraken uses WebSocket only)
      // Pass keys explicitly from parameters - services will return null if keys are missing
      const fetchPromises: Promise<PerpetualsData | null>[] = []
      
      // Fetch Aster - pass keys explicitly from parameters
      fetchPromises.push(fetchAsterPerpetualsData({
        uid,
        apiKey: keys.asterApiKey || '',
        apiSecret: keys.asterApiSecretKey || null,
      }))
      
      // Fetch Hyperliquid - pass wallet address explicitly from parameters
      fetchPromises.push(fetchHyperliquidPerpetualsData({
        uid,
        walletAddress: keys.hyperliquidWalletAddress || '',
      }))
      
      const [asterData, hyperliquidData] = await Promise.all(fetchPromises)
      
      // Get Kraken data from WebSocket (only source)
      // Convert current WebSocket state to PerpetualsData format
      const finalKrakenData = krakenWsStateRef.current && krakenWsStateRef.current.status === 'subscribed'
        ? convertKrakenWsStateToPerpetualsData(krakenWsStateRef.current)
        : null

      // Always log fetch results (not just dev mode)
      console.log('[DataContext] fetchPerpetualsData: Fetch results:', {
        asterData: !!asterData,
        asterPositions: asterData?.openPositions?.length || 0,
        asterExchangeBalance: asterData?.exchangeBalance?.length || 0,
        hyperliquidData: !!hyperliquidData,
        hyperliquidPositions: hyperliquidData?.openPositions?.length || 0,
        hyperliquidExchangeBalance: hyperliquidData?.exchangeBalance?.length || 0,
        krakenData: !!finalKrakenData,
        krakenWsStatus: krakenWsStateRef.current?.status || 'disconnected',
        krakenPositions: finalKrakenData?.openPositions?.length || 0,
        krakenExchangeBalance: finalKrakenData?.exchangeBalance?.length || 0,
        krakenOrders: (finalKrakenData as any)?.openOrders?.length || 0,
        totalPositions: [...(asterData?.openPositions || []), ...(hyperliquidData?.openPositions || []), ...(finalKrakenData?.openPositions || [])].length,
        totalExchangeBalance: [...(asterData?.exchangeBalance || []), ...(hyperliquidData?.exchangeBalance || []), ...(finalKrakenData?.exchangeBalance || [])].length,
      })

      // Merge Aster, Hyperliquid, and Kraken data
      // Create defensive copies to prevent mutation
      const asterPositions = Array.isArray(asterData?.openPositions) ? [...asterData.openPositions] : []
      const hyperliquidPositions = Array.isArray(hyperliquidData?.openPositions) ? [...hyperliquidData.openPositions] : []
      const krakenPositions = Array.isArray(finalKrakenData?.openPositions) ? [...finalKrakenData.openPositions] : []
      // Note: openOrders may not be in PerpetualsData interface, but APIs may return it
      // We'll handle it safely by checking if it exists
      const asterOrders = (asterData as any)?.openOrders && Array.isArray((asterData as any).openOrders) ? [...(asterData as any).openOrders] : []
      const hyperliquidOrders = (hyperliquidData as any)?.openOrders && Array.isArray((hyperliquidData as any).openOrders) ? [...(hyperliquidData as any).openOrders] : []
      const krakenOrders = (finalKrakenData as any)?.openOrders && Array.isArray((finalKrakenData as any).openOrders) ? [...(finalKrakenData as any).openOrders] : []
      const asterExchangeBalance = Array.isArray(asterData?.exchangeBalance) ? [...asterData.exchangeBalance] : []
      const hyperliquidExchangeBalance = Array.isArray(hyperliquidData?.exchangeBalance) ? [...hyperliquidData.exchangeBalance] : []
      const krakenExchangeBalance = Array.isArray(finalKrakenData?.exchangeBalance) ? [...finalKrakenData.exchangeBalance] : []
      
      const mergedData = {
        openPositions: [...asterPositions, ...hyperliquidPositions, ...krakenPositions],
        // Note: openOrders are not part of PerpetualsData interface, but we track them for logging
        openOrders: [...asterOrders, ...hyperliquidOrders, ...krakenOrders],
      }

      // Merge exchangeBalance from API sources
      const apiExchangeBalance = [...asterExchangeBalance, ...hyperliquidExchangeBalance, ...krakenExchangeBalance]
      
      // Create perpetualsData structure (PerpetualsData interface doesn't include openOrders)
      const perpetualsData: PerpetualsData = {
        exchangeBalance: apiExchangeBalance.map(b => ({ ...b })),
        openPositions: mergedData.openPositions.map(p => ({ ...p })),
      }

      // Only create Perpetuals item if we have any data
      if (asterData || hyperliquidData || finalKrakenData || apiExchangeBalance.length > 0) {
        // Create Perpetuals item dynamically
        const perpetualsItem: NetWorthItem = {
          id: 'perpetuals-dynamic', // Special ID to indicate it's not from Firebase
          category: 'Perpetuals',
          name: 'Perpetuals',
          platform: 'Multiple',
          currency: 'USD',
          perpetualsData: perpetualsData,
        }

        console.log('[DataContext] fetchPerpetualsData: Created dynamic Perpetuals item:', {
          hasPerpetualsData: !!perpetualsItem.perpetualsData,
          exchangeBalanceCount: perpetualsItem.perpetualsData?.exchangeBalance?.length || 0,
          positionsCount: perpetualsItem.perpetualsData?.openPositions?.length || 0,
          itemsWithoutPerpetualsCount: itemsWithoutPerpetuals.length,
          returningItemsCount: itemsWithoutPerpetuals.length + 1,
        })

        // Add Perpetuals item to items array
        return [...itemsWithoutPerpetuals, perpetualsItem]
      } else {
        // No data, return items without Perpetuals
        console.warn('[DataContext] fetchPerpetualsData: No perpetuals data available, returning items without Perpetuals', {
          asterData: !!asterData,
          hyperliquidData: !!hyperliquidData,
          finalKrakenData: !!finalKrakenData,
          apiExchangeBalanceLength: apiExchangeBalance.length,
          itemsWithoutPerpetualsCount: itemsWithoutPerpetuals.length,
          willReturnEmpty: itemsWithoutPerpetuals.length === 0,
        })
        return itemsWithoutPerpetuals
      }
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
        asterApiKey: currentKeys.asterApiKey,
        asterApiSecretKey: currentKeys.asterApiSecretKey,
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
        asterApiKey: currentKeys.asterApiKey,
        asterApiSecretKey: currentKeys.asterApiSecretKey,
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
        hasAsterKey: !!currentKeys.asterApiKey,
        hasAsterSecret: !!currentKeys.asterApiSecretKey,
        hasHyperliquidKey: !!currentKeys.hyperliquidWalletAddress,
        krakenWsStatus: krakenWsStateRef.current?.status || 'disconnected',
      })
      
      // Step 3: Fetch perpetuals data (reads from WebSocket state for Kraken)
      // Pass keys from ref (always current) instead of using closure values
      const itemsWithPerpetuals = await fetchPerpetualsData(currentItems, {
        asterApiKey: currentKeys.asterApiKey,
        asterApiSecretKey: currentKeys.asterApiSecretKey,
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
    }, 1 * 20 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [uid, loading])

  // Track if we've already triggered refresh on first Kraken WS subscription
  const krakenWsSubscribedRef = useRef(false)

  // Set up Kraken Futures WebSocket connection
  useEffect(() => {
    if (!uid || !krakenApiKey || !krakenApiSecretKey || !apiKeysLoaded) {
      // Disconnect if credentials are not available or keys not loaded
      krakenWsStateRef.current = { status: 'disconnected' }
      krakenWsSubscribedRef.current = false
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
        
        // When WS reaches "subscribed" for the first time AND apiKeysLoaded is true,
        // trigger a single refreshPerpetuals (debounced, one-shot)
        if (
          state.status === 'subscribed' && 
          !krakenWsSubscribedRef.current && 
          apiKeysLoaded &&
          hasLoadedDataRef.current
        ) {
          krakenWsSubscribedRef.current = true
          // Debounce: wait a short moment to ensure WS data is ready
          setTimeout(() => {
            refreshPerpetuals()
          }, 500)
        }
      },
    })

    // Connect to WebSocket
    ws.connect()

    // Cleanup on unmount or when credentials change
    return () => {
      ws.disconnect()
      krakenWsSubscribedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, krakenApiKey, krakenApiSecretKey, apiKeysLoaded])

  return (
    <DataContext.Provider
      value={{
        data,
        loading,
        error,
        isInitialLoad: loading && !hasLoadedDataRef.current,
        refreshData,
        refreshPrices,
        refreshPerpetuals,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

