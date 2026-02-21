/**
 * Daily Price Service (SSOT)
 * 
 * Manages daily market price snapshots stored in Firestore.
 * 
 * Architecture:
 * - First client request of the day triggers a Vercel API route
 * - API reads user's RapidAPI key from Firestore, fetches from Yahoo, writes to shared cache
 * - Subsequent requests (same user or other users) read from Firestore cache
 * - No client-side API key exposure
 * 
 * Fallback strategy:
 * 1. Check session cache (in-memory)
 * 2. Read today's snapshot from Firestore
 * 3. If missing, call API to fetch and cache
 * 4. If API fails or no key, fall back to previous days (up to 7 days back)
 * 5. If still missing, return undefined (UI shows "—")
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../config/firebase'
import { apiPost } from '../../lib/apiClient'

// ============================================================================
// Types
// ============================================================================

export interface DailyPriceEntry {
  symbolKey: string
  symbolRaw: string
  price: number
  currency: string | null
  marketTime: number | null // Unix ms
  source: 'yahoo'
  fetchedAt: Timestamp | null
  /** If true, this price is from a previous day (fallback) */
  isStale?: boolean
  /** The date this price is from (YYYY-MM-DD) */
  asOfDate?: string
}

export interface DailyPriceResult {
  price: number
  currency: string | null
  marketTime: number | null
  isStale: boolean
  asOfDate: string
}

export interface DailySnapshotDoc {
  dateKey: string
  provider: 'yahoo'
  version: number
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

// ============================================================================
// Constants
// ============================================================================

const COLLECTION_DAILY_PRICES = 'marketDailyPrices'
const SUBCOLLECTION_SYMBOLS = 'symbols'
const COLLECTION_SYMBOLS_REGISTRY = 'marketSymbolsRegistry'
const MAX_FALLBACK_DAYS = 7

// Session cache for current browser session
const sessionCache: Map<string, Map<string, DailyPriceEntry>> = new Map()

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get UTC date key in YYYY-MM-DD format
 */
export function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get a date N days ago
 */
function daysAgo(n: number, from: Date = new Date()): Date {
  const result = new Date(from)
  result.setUTCDate(result.getUTCDate() - n)
  return result
}

/**
 * Normalize symbol key for Firestore doc ID
 * - Trim whitespace
 * - Uppercase
 * - Collapse multiple spaces
 * - Keep exchange suffixes (VWCE.DE, ZSIL.SW, BRK-B)
 */
export function normalizeSymbolKey(symbolRaw: string): string {
  return symbolRaw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

// ============================================================================
// Session Cache
// ============================================================================

function getSessionCache(dateKey: string): Map<string, DailyPriceEntry> {
  let dateCache = sessionCache.get(dateKey)
  if (!dateCache) {
    dateCache = new Map()
    sessionCache.set(dateKey, dateCache)
  }
  return dateCache
}

function setSessionCache(dateKey: string, symbolKey: string, entry: DailyPriceEntry): void {
  const dateCache = getSessionCache(dateKey)
  dateCache.set(symbolKey, entry)
}

function getFromSessionCache(dateKey: string, symbolKey: string): DailyPriceEntry | null {
  const dateCache = sessionCache.get(dateKey)
  if (!dateCache) return null
  return dateCache.get(symbolKey) || null
}

/**
 * Clear session cache (for testing/debugging)
 */
export function clearSessionCache(): void {
  sessionCache.clear()
}

// ============================================================================
// Firestore Operations
// ============================================================================

/**
 * Read price entries from Firestore for a specific date
 */
async function readSymbolsFromFirestore(
  dateKey: string,
  symbolKeys: string[]
): Promise<Map<string, DailyPriceEntry>> {
  const result = new Map<string, DailyPriceEntry>()
  
  if (symbolKeys.length === 0) return result

  const symbolsCollectionRef = collection(db, COLLECTION_DAILY_PRICES, dateKey, SUBCOLLECTION_SYMBOLS)
  
  // Firestore doesn't support "in" queries with more than 30 items
  // So we fetch individual docs for small sets, or all docs for large sets
  if (symbolKeys.length <= 10) {
    // Fetch individual docs
    const promises = symbolKeys.map(async (symbolKey) => {
      const docRef = doc(symbolsCollectionRef, symbolKey)
      const docSnap = await getDoc(docRef)
      if (docSnap.exists()) {
        const data = docSnap.data() as DailyPriceEntry
        result.set(symbolKey, { ...data, asOfDate: dateKey })
      }
    })
    await Promise.all(promises)
  } else {
    // Fetch all docs in the subcollection
    const querySnap = await getDocs(symbolsCollectionRef)
    const symbolKeySet = new Set(symbolKeys)
    querySnap.forEach((docSnap) => {
      const symbolKey = docSnap.id
      if (symbolKeySet.has(symbolKey)) {
        const data = docSnap.data() as DailyPriceEntry
        result.set(symbolKey, { ...data, asOfDate: dateKey })
      }
    })
  }
  
  return result
}

/**
 * Write price entries to Firestore
 */
async function writeSymbolsToFirestore(
  dateKey: string,
  entries: DailyPriceEntry[]
): Promise<void> {
  if (entries.length === 0) return

  const batch = writeBatch(db)
  
  // Ensure parent doc exists
  const parentDocRef = doc(db, COLLECTION_DAILY_PRICES, dateKey)
  const parentDoc: DailySnapshotDoc = {
    dateKey,
    provider: 'yahoo',
    version: 1,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  }
  batch.set(parentDocRef, parentDoc, { merge: true })
  
  // Write each symbol
  for (const entry of entries) {
    const symbolDocRef = doc(db, COLLECTION_DAILY_PRICES, dateKey, SUBCOLLECTION_SYMBOLS, entry.symbolKey)
    batch.set(symbolDocRef, {
      ...entry,
      fetchedAt: serverTimestamp(),
    })
  }
  
  await batch.commit()
  
  if (import.meta.env.DEV) {
    console.log(`[DailyPriceService] Wrote ${entries.length} symbols to Firestore for ${dateKey}`)
  }
}

// ============================================================================
// Symbols Registry
// ============================================================================

/**
 * Register a symbol in the registry (called when user adds a new item)
 * This ensures the GitHub Action will fetch this symbol in the future
 */
export async function registerSymbol(
  symbolRaw: string,
  uid: string,
  assetClass: 'stock' | 'etf' | 'commodity' | 'unknown' = 'unknown'
): Promise<void> {
  const symbolKey = normalizeSymbolKey(symbolRaw)
  const docRef = doc(db, COLLECTION_SYMBOLS_REGISTRY, symbolKey)
  
  await setDoc(docRef, {
    symbolKey,
    symbolRaw,
    assetClass,
    addedBy: uid,
    addedAt: serverTimestamp(),
  }, { merge: true })
  
  if (import.meta.env.DEV) {
    console.log(`[DailyPriceService] Registered symbol: ${symbolKey}`)
  }
}

/**
 * Get all registered symbols from the registry
 */
export async function getRegisteredSymbols(): Promise<string[]> {
  const querySnap = await getDocs(collection(db, COLLECTION_SYMBOLS_REGISTRY))
  return querySnap.docs.map((doc) => doc.id)
}

// ============================================================================
// API Route Call
// ============================================================================

interface ApiUpdateResponse {
  success: boolean
  dateKey: string
  prices: Record<string, { price: number; currency: string | null; marketTime: number | null }>
  fetched: string[]
  cached: string[]
  missing?: string[]
  source: string
  warning?: string
  error?: string
}

/**
 * Call the Vercel API route to fetch and cache missing prices
 * Uses the user's RapidAPI key stored in Firestore
 */
async function fetchMissingPricesFromApi(
  uid: string,
  symbols: string[]
): Promise<ApiUpdateResponse | null> {
  if (symbols.length === 0 || !uid) return null

  try {
    const response = await apiPost('/api/market/update-daily-prices', { symbols })

    if (!response.ok) {
      console.error(`[DailyPriceService] API returned ${response.status}`)
      return null
    }

    const data: ApiUpdateResponse = await response.json()
    
    if (import.meta.env.DEV) {
      console.log(`[DailyPriceService] API response:`, {
        fetched: data.fetched?.length || 0,
        cached: data.cached?.length || 0,
        missing: data.missing?.length || 0,
        source: data.source,
        warning: data.warning,
      })
    }

    return data
  } catch (err) {
    console.error('[DailyPriceService] Error calling API:', err)
    return null
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get daily prices for a list of symbols
 * 
 * This is the main SSOT function. It:
 * 1. Checks session cache
 * 2. Reads from Firestore (today's snapshot)
 * 3. If missing, calls API to fetch from Yahoo and cache
 * 4. Falls back to previous days if API fails
 * 5. Returns undefined for symbols that can't be found (UI shows "—")
 */
export async function getDailyPrices(
  symbolsRaw: string[],
  opts: { forceRefresh?: boolean; uid?: string } = {}
): Promise<Record<string, DailyPriceResult>> {
  if (symbolsRaw.length === 0) {
    return {}
  }

  const { forceRefresh = false, uid } = opts
  const today = getUtcDateKey()
  const result: Record<string, DailyPriceResult> = {}
  
  // Normalize symbols
  const symbolMap = new Map<string, string>() // symbolKey -> symbolRaw
  for (const raw of symbolsRaw) {
    const key = normalizeSymbolKey(raw)
    symbolMap.set(key, raw)
  }
  const symbolKeys = Array.from(symbolMap.keys())
  
  // Track which symbols we still need to find
  const missingKeys = new Set(symbolKeys)
  
  // 1. Check session cache (unless forceRefresh)
  if (!forceRefresh) {
    for (const symbolKey of symbolKeys) {
      const cached = getFromSessionCache(today, symbolKey)
      if (cached) {
        result[symbolKey] = {
          price: cached.price,
          currency: cached.currency,
          marketTime: cached.marketTime,
          isStale: cached.isStale || false,
          asOfDate: cached.asOfDate || today,
        }
        missingKeys.delete(symbolKey)
      }
    }
    
    if (missingKeys.size === 0) {
      if (import.meta.env.DEV) {
        console.log(`[DailyPriceService] All ${symbolKeys.length} symbols from session cache`)
      }
      return result
    }
  }
  
  // 2. Read today's prices from Firestore
  try {
    const firestoreData = await readSymbolsFromFirestore(today, Array.from(missingKeys))
    
    for (const [symbolKey, entry] of firestoreData) {
      setSessionCache(today, symbolKey, { ...entry, isStale: false, asOfDate: today })
      result[symbolKey] = {
        price: entry.price,
        currency: entry.currency,
        marketTime: entry.marketTime,
        isStale: false,
        asOfDate: today,
      }
      missingKeys.delete(symbolKey)
    }
    
    if (import.meta.env.DEV && firestoreData.size > 0) {
      console.log(`[DailyPriceService] Found ${firestoreData.size} symbols in Firestore (${today})`)
    }
  } catch (err) {
    console.error(`[DailyPriceService] Error reading from Firestore:`, err)
  }

  // 3. If we still have missing symbols and have a uid, call API to fetch them
  if (missingKeys.size > 0 && uid) {
    const apiResponse = await fetchMissingPricesFromApi(uid, Array.from(missingKeys))
    
    if (apiResponse?.success && apiResponse.prices) {
      for (const [symbolKey, priceData] of Object.entries(apiResponse.prices)) {
        if (missingKeys.has(symbolKey)) {
          // Update session cache
          const entry: DailyPriceEntry = {
            symbolKey,
            symbolRaw: symbolMap.get(symbolKey) || symbolKey,
            price: priceData.price,
            currency: priceData.currency,
            marketTime: priceData.marketTime,
            source: 'yahoo',
            fetchedAt: null,
            isStale: false,
            asOfDate: today,
          }
          setSessionCache(today, symbolKey, entry)
          
          result[symbolKey] = {
            price: priceData.price,
            currency: priceData.currency,
            marketTime: priceData.marketTime,
            isStale: false,
            asOfDate: today,
          }
          missingKeys.delete(symbolKey)
        }
      }
    }
  }
  
  // 4. Fallback: try previous days for any remaining missing symbols
  if (missingKeys.size > 0) {
    for (let daysBack = 1; daysBack <= MAX_FALLBACK_DAYS && missingKeys.size > 0; daysBack++) {
      const dateKey = getUtcDateKey(daysAgo(daysBack))
      
      try {
        const firestoreData = await readSymbolsFromFirestore(dateKey, Array.from(missingKeys))
        
        for (const [symbolKey, entry] of firestoreData) {
          setSessionCache(today, symbolKey, { ...entry, isStale: true, asOfDate: dateKey })
          result[symbolKey] = {
            price: entry.price,
            currency: entry.currency,
            marketTime: entry.marketTime,
            isStale: true,
            asOfDate: dateKey,
          }
          missingKeys.delete(symbolKey)
        }
        
        if (import.meta.env.DEV && firestoreData.size > 0) {
          console.log(`[DailyPriceService] Found ${firestoreData.size} symbols in Firestore (${dateKey}) [STALE]`)
        }
      } catch (err) {
        console.error(`[DailyPriceService] Error reading fallback from Firestore for ${dateKey}:`, err)
      }
    }
  }
  
  // 5. Log any symbols that couldn't be found
  if (missingKeys.size > 0 && import.meta.env.DEV) {
    console.warn(`[DailyPriceService] No prices found for: ${Array.from(missingKeys).join(', ')}`)
  }
  
  return result
}

/**
 * Get a simple price map (symbol -> price) for backward compatibility
 * @param symbolsRaw - Array of raw symbol strings
 * @param uid - User ID (required to fetch missing prices from API)
 */
export async function getDailyPricesMap(
  symbolsRaw: string[],
  uid?: string
): Promise<Record<string, number>> {
  const prices = await getDailyPrices(symbolsRaw, { uid })
  const result: Record<string, number> = {}
  
  for (const [symbol, data] of Object.entries(prices)) {
    result[symbol] = data.price
  }
  
  return result
}

/**
 * Upsert a single symbol's price for today
 * Used by GitHub Action or when user adds a new item (hybrid mode)
 */
export async function upsertDailyPrice(
  symbolRaw: string,
  price: number,
  currency: string | null = null,
  marketTime: number | null = null
): Promise<void> {
  const dateKey = getUtcDateKey()
  const symbolKey = normalizeSymbolKey(symbolRaw)
  
  const entry: DailyPriceEntry = {
    symbolKey,
    symbolRaw,
    price,
    currency,
    marketTime,
    source: 'yahoo',
    fetchedAt: null, // Will be set by serverTimestamp
  }
  
  await writeSymbolsToFirestore(dateKey, [entry])
  
  // Update session cache
  setSessionCache(dateKey, symbolKey, { ...entry, asOfDate: dateKey })
}

/**
 * Batch upsert prices for today
 * Used by GitHub Action
 */
export async function upsertDailyPricesBatch(
  entries: Array<{
    symbolRaw: string
    price: number
    currency: string | null
    marketTime: number | null
  }>
): Promise<void> {
  const dateKey = getUtcDateKey()
  
  const firestoreEntries: DailyPriceEntry[] = entries.map((e) => ({
    symbolKey: normalizeSymbolKey(e.symbolRaw),
    symbolRaw: e.symbolRaw,
    price: e.price,
    currency: e.currency,
    marketTime: e.marketTime,
    source: 'yahoo',
    fetchedAt: null,
  }))
  
  await writeSymbolsToFirestore(dateKey, firestoreEntries)
  
  // Update session cache
  for (const entry of firestoreEntries) {
    setSessionCache(dateKey, entry.symbolKey, { ...entry, asOfDate: dateKey })
  }
}

// ============================================================================
// Asset Class Detection
// ============================================================================

/**
 * Derive asset class from item category
 */
export function deriveAssetClass(
  category: string
): 'stock' | 'etf' | 'commodity' | 'unknown' {
  switch (category) {
    case 'Stocks':
      return 'stock'
    case 'Index Funds':
      return 'etf'
    case 'Commodities':
      return 'commodity'
    default:
      return 'unknown'
  }
}

/**
 * Check if a category uses Yahoo prices
 */
export function categoryUsesYahoo(category: string): boolean {
  return ['Index Funds', 'Stocks', 'Commodities'].includes(category)
}
