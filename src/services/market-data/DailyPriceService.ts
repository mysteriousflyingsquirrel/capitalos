/**
 * Daily Price Service (SSOT)
 * 
 * Manages daily market price snapshots stored in Firestore.
 * Prices are fetched once per day by a GitHub Action and cached in Firestore.
 * Client devices read from Firestore only - no direct Yahoo API calls.
 * 
 * Fallback strategy:
 * 1. Try today's snapshot
 * 2. If missing, try previous days (up to 7 days back)
 * 3. If still missing, return null (UI shows "—")
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
// Main API
// ============================================================================

/**
 * Get daily prices for a list of symbols
 * 
 * This is the main SSOT function. It:
 * 1. Checks session cache
 * 2. Reads from Firestore (today's snapshot)
 * 3. Falls back to previous days if needed
 * 4. Never calls Yahoo directly (that's done by GitHub Action)
 */
export async function getDailyPrices(
  symbolsRaw: string[],
  opts: { forceRefresh?: boolean } = {}
): Promise<Record<string, DailyPriceResult>> {
  if (symbolsRaw.length === 0) {
    return {}
  }

  const { forceRefresh = false } = opts
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
  
  // 2. Read from Firestore - try today first, then fall back to previous days
  for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS && missingKeys.size > 0; daysBack++) {
    const dateKey = getUtcDateKey(daysAgo(daysBack))
    const isStale = daysBack > 0
    
    try {
      const firestoreData = await readSymbolsFromFirestore(dateKey, Array.from(missingKeys))
      
      for (const [symbolKey, entry] of firestoreData) {
        // Update session cache
        setSessionCache(today, symbolKey, { ...entry, isStale, asOfDate: dateKey })
        
        // Add to result
        result[symbolKey] = {
          price: entry.price,
          currency: entry.currency,
          marketTime: entry.marketTime,
          isStale,
          asOfDate: dateKey,
        }
        missingKeys.delete(symbolKey)
      }
      
      if (import.meta.env.DEV && firestoreData.size > 0) {
        console.log(`[DailyPriceService] Found ${firestoreData.size} symbols in Firestore (${dateKey})${isStale ? ' [STALE]' : ''}`)
      }
    } catch (err) {
      console.error(`[DailyPriceService] Error reading from Firestore for ${dateKey}:`, err)
      // Continue to try older dates
    }
  }
  
  // 3. Log any symbols that couldn't be found
  if (missingKeys.size > 0 && import.meta.env.DEV) {
    console.warn(`[DailyPriceService] No prices found for: ${Array.from(missingKeys).join(', ')}`)
  }
  
  return result
}

/**
 * Get a simple price map (symbol -> price) for backward compatibility
 */
export async function getDailyPricesMap(symbolsRaw: string[]): Promise<Record<string, number>> {
  const prices = await getDailyPrices(symbolsRaw)
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
