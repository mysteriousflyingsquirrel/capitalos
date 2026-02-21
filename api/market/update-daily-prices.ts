import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import { initializeAdmin, verifyAuth } from '../lib/firebaseAdmin'

// Export config for Vercel
export const config = {
  maxDuration: 60,
}

// ============================================================================
// Types
// ============================================================================

interface DailyPriceEntry {
  symbolKey: string
  symbolRaw: string
  price: number
  currency: string | null
  marketTime: number | null
  source: 'yahoo'
  fetchedAt: admin.firestore.FieldValue
}

interface YahooQuoteResult {
  symbolRaw: string
  price: number
  currency: string | null
  marketTime: number | null
}

// ============================================================================
// Utilities
// ============================================================================

function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeSymbolKey(symbolRaw: string): string {
  return symbolRaw.trim().toUpperCase().replace(/\s+/g, ' ')
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ============================================================================
// Yahoo Finance API
// ============================================================================

const CHUNK_SIZE = 25

async function fetchYahooQuotes(
  symbols: string[],
  apiKey: string
): Promise<YahooQuoteResult[]> {
  if (symbols.length === 0 || !apiKey) return []

  const results: YahooQuoteResult[] = []
  const chunks = chunkArray(symbols, CHUNK_SIZE)

  for (const chunk of chunks) {
    try {
      const symbolsParam = chunk.join(',')
      const url = `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${encodeURIComponent(symbolsParam)}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('[Yahoo] Rate limit exceeded (429), stopping fetch')
          break
        }
        console.error(`[Yahoo] API returned ${response.status}`)
        continue
      }

      const data = await response.json()

      if (data.quoteResponse && Array.isArray(data.quoteResponse.result)) {
        for (const quote of data.quoteResponse.result) {
          if (quote.symbol && typeof quote.regularMarketPrice === 'number' && quote.regularMarketPrice > 0) {
            results.push({
              symbolRaw: quote.symbol,
              price: quote.regularMarketPrice,
              currency: quote.currency || null,
              marketTime: quote.regularMarketTime ? quote.regularMarketTime * 1000 : null,
            })
          }
        }
      }
    } catch (error) {
      console.error('[Yahoo] Error fetching chunk:', error)
    }
  }

  return results
}

// ============================================================================
// Firestore Operations
// ============================================================================

async function readExistingPrices(
  db: admin.firestore.Firestore,
  dateKey: string,
  symbolKeys: string[]
): Promise<Map<string, { price: number; currency: string | null; marketTime: number | null }>> {
  const result = new Map<string, { price: number; currency: string | null; marketTime: number | null }>()

  if (symbolKeys.length === 0) return result

  const symbolsCollectionRef = db.collection('marketDailyPrices').doc(dateKey).collection('symbols')

  // Fetch individual docs for small sets
  if (symbolKeys.length <= 10) {
    const promises = symbolKeys.map(async (symbolKey) => {
      const docSnap = await symbolsCollectionRef.doc(symbolKey).get()
      if (docSnap.exists) {
        const data = docSnap.data()
        if (data && typeof data.price === 'number') {
          result.set(symbolKey, {
            price: data.price,
            currency: data.currency || null,
            marketTime: data.marketTime || null,
          })
        }
      }
    })
    await Promise.all(promises)
  } else {
    // Fetch all docs for larger sets
    const querySnap = await symbolsCollectionRef.get()
    const symbolKeySet = new Set(symbolKeys)
    querySnap.forEach((docSnap) => {
      const symbolKey = docSnap.id
      if (symbolKeySet.has(symbolKey)) {
        const data = docSnap.data()
        if (data && typeof data.price === 'number') {
          result.set(symbolKey, {
            price: data.price,
            currency: data.currency || null,
            marketTime: data.marketTime || null,
          })
        }
      }
    })
  }

  return result
}

async function writePricesToFirestore(
  db: admin.firestore.Firestore,
  dateKey: string,
  prices: YahooQuoteResult[]
): Promise<void> {
  if (prices.length === 0) return

  const batch = db.batch()

  // Ensure parent doc exists
  const parentDocRef = db.collection('marketDailyPrices').doc(dateKey)
  batch.set(parentDocRef, {
    dateKey,
    provider: 'yahoo',
    version: 1,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  // Write each symbol
  for (const price of prices) {
    const symbolKey = normalizeSymbolKey(price.symbolRaw)
    const symbolDocRef = parentDocRef.collection('symbols').doc(symbolKey)
    batch.set(symbolDocRef, {
      symbolKey,
      symbolRaw: price.symbolRaw,
      price: price.price,
      currency: price.currency,
      marketTime: price.marketTime,
      source: 'yahoo',
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
}

// ============================================================================
// Lock Management
// ============================================================================

async function tryAcquireLock(
  db: admin.firestore.Firestore,
  dateKey: string,
  lockId: string
): Promise<boolean> {
  const lockRef = db.collection('marketDailyPrices').doc(dateKey).collection('locks').doc('yahoo')

  try {
    const result = await db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(lockRef)
      const now = Date.now()
      const lockDuration = 60 * 1000 // 60 seconds

      if (lockDoc.exists) {
        const data = lockDoc.data()
        const lockedUntil = data?.lockedUntil?.toMillis?.() || 0
        
        if (lockedUntil > now) {
          // Lock is held by someone else
          return false
        }
      }

      // Acquire lock
      transaction.set(lockRef, {
        lockedUntil: admin.firestore.Timestamp.fromMillis(now + lockDuration),
        lockedBy: lockId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      return true
    })

    return result
  } catch (error) {
    console.error('[Lock] Error acquiring lock:', error)
    return false
  }
}

async function releaseLock(
  db: admin.firestore.Firestore,
  dateKey: string,
  lockId: string
): Promise<void> {
  const lockRef = db.collection('marketDailyPrices').doc(dateKey).collection('locks').doc('yahoo')

  try {
    await db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(lockRef)
      if (lockDoc.exists && lockDoc.data()?.lockedBy === lockId) {
        transaction.delete(lockRef)
      }
    })
  } catch (error) {
    console.error('[Lock] Error releasing lock:', error)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Main Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    initializeAdmin()
    const db = admin.firestore()

    const { uid, symbols } = req.body as {
      uid?: string
      symbols?: string[]
    }

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: 'User ID (uid) is required' })
    }

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' })
    }

    if (!symbols.every(s => typeof s === 'string' && s.length > 0)) {
      return res.status(400).json({ error: 'All symbols must be non-empty strings' })
    }

    // Normalize symbols
    const symbolKeys = [...new Set(symbols.map(s => normalizeSymbolKey(s)))]
    const dateKey = getUtcDateKey()

    // 1. Read existing prices from Firestore
    const existingPrices = await readExistingPrices(db, dateKey, symbolKeys)
    const missingSymbolKeys = symbolKeys.filter(k => !existingPrices.has(k))

    if (process.env.NODE_ENV === 'development') console.log(`[UpdatePrices] Date: ${dateKey}, Requested: ${symbolKeys.length}, Cached: ${existingPrices.size}, Missing: ${missingSymbolKeys.length}`)

    // 2. If all prices exist, return immediately
    if (missingSymbolKeys.length === 0) {
      const prices: Record<string, { price: number; currency: string | null; marketTime: number | null }> = {}
      for (const [key, value] of existingPrices) {
        prices[key] = value
      }

      return res.status(200).json({
        success: true,
        dateKey,
        prices,
        fetched: [],
        cached: symbolKeys,
        source: 'firestore',
      })
    }

    // 3. Read user's RapidAPI key from Firestore
    const settingsSnap = await db.collection('users').doc(uid).collection('settings').doc('user').get()
    const rapidApiKey = settingsSnap.data()?.apiKeys?.rapidApiKey

    if (!rapidApiKey) {
      // No API key - return what we have from cache
      const prices: Record<string, { price: number; currency: string | null; marketTime: number | null }> = {}
      for (const [key, value] of existingPrices) {
        prices[key] = value
      }

      return res.status(200).json({
        success: true,
        dateKey,
        prices,
        fetched: [],
        cached: Array.from(existingPrices.keys()),
        missing: missingSymbolKeys,
        source: 'firestore',
        warning: 'No RapidAPI key configured - some prices unavailable',
      })
    }

    // 4. Try to acquire lock
    const lockId = `${uid}-${Date.now()}`
    let lockAcquired = await tryAcquireLock(db, dateKey, lockId)

    if (!lockAcquired) {
      // Wait and retry
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(250 * Math.pow(2, attempt)) // 250ms, 500ms, 1000ms
        lockAcquired = await tryAcquireLock(db, dateKey, lockId)
        if (lockAcquired) break
      }
    }

    let fetchedPrices: YahooQuoteResult[] = []
    let fetchedSymbolKeys: string[] = []

    if (lockAcquired) {
      try {
        // 5. Fetch missing prices from Yahoo
        if (process.env.NODE_ENV === 'development') console.log(`[UpdatePrices] Fetching ${missingSymbolKeys.length} symbols from Yahoo`)
        fetchedPrices = await fetchYahooQuotes(missingSymbolKeys, rapidApiKey)

        // 6. Write to Firestore
        if (fetchedPrices.length > 0) {
          await writePricesToFirestore(db, dateKey, fetchedPrices)
          fetchedSymbolKeys = fetchedPrices.map(p => normalizeSymbolKey(p.symbolRaw))
          if (process.env.NODE_ENV === 'development') console.log(`[UpdatePrices] Wrote ${fetchedPrices.length} prices to Firestore`)
        }
      } finally {
        await releaseLock(db, dateKey, lockId)
      }
    } else {
      // Lock not acquired - re-read from Firestore (another request probably fetched)
      if (process.env.NODE_ENV === 'development') console.log('[UpdatePrices] Lock not acquired, re-reading from Firestore')
      const refreshedPrices = await readExistingPrices(db, dateKey, missingSymbolKeys)
      for (const [key, value] of refreshedPrices) {
        existingPrices.set(key, value)
      }
    }

    // 7. Build response
    const prices: Record<string, { price: number; currency: string | null; marketTime: number | null }> = {}
    
    // Add existing prices
    for (const [key, value] of existingPrices) {
      prices[key] = value
    }
    
    // Add newly fetched prices
    for (const fetched of fetchedPrices) {
      const key = normalizeSymbolKey(fetched.symbolRaw)
      prices[key] = {
        price: fetched.price,
        currency: fetched.currency,
        marketTime: fetched.marketTime,
      }
    }

    // Identify still-missing symbols
    const stillMissing = symbolKeys.filter(k => !prices[k])

    return res.status(200).json({
      success: true,
      dateKey,
      prices,
      fetched: fetchedSymbolKeys,
      cached: Array.from(existingPrices.keys()),
      missing: stillMissing.length > 0 ? stillMissing : undefined,
      source: fetchedSymbolKeys.length > 0 ? 'yahoo+firestore' : 'firestore',
    })
  } catch (error) {
    console.error('[UpdatePrices] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}
