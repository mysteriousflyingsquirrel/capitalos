#!/usr/bin/env npx tsx

/**
 * Daily Market Price Update Script
 * 
 * This script is run by GitHub Actions to fetch market prices from Yahoo Finance
 * and store them in Firestore for all registered symbols.
 * 
 * Usage:
 *   npx tsx scripts/update-daily-prices.ts
 * 
 * Environment variables required:
 *   RAPIDAPI_KEY - Yahoo Finance RapidAPI key
 *   FIREBASE_SERVICE_ACCOUNT - Firebase service account JSON (base64 encoded or raw JSON)
 * 
 * Fallback strategy:
 *   1. Fetch all symbols from registry
 *   2. Batch fetch from Yahoo (25 symbols per request)
 *   3. Retry up to 3 times with exponential backoff on rate limit
 *   4. Write successful results to Firestore
 *   5. Report any failures
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

// ============================================================================
// Configuration
// ============================================================================

const CHUNK_SIZE = 25 // Yahoo API can handle ~25 symbols per request
const MAX_RETRIES = 3
const RETRY_DELAYS = [60_000, 120_000, 240_000] // 1min, 2min, 4min

// ============================================================================
// Types
// ============================================================================

interface YahooQuote {
  symbol: string
  regularMarketPrice: number
  currency?: string
  regularMarketTime?: number
}

interface PriceResult {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

class YahooQuotaExceededError extends Error {
  constructor() {
    super('Yahoo Finance API quota exceeded (429)')
    this.name = 'YahooQuotaExceededError'
  }
}

class YahooFetchError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = 'YahooFetchError'
  }
}

async function fetchYahooQuotes(
  symbols: string[],
  apiKey: string
): Promise<PriceResult[]> {
  if (symbols.length === 0) return []

  const symbolsParam = symbols.join(',')
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
      throw new YahooQuotaExceededError()
    }
    const errorText = await response.text()
    throw new YahooFetchError(`Yahoo API returned ${response.status}: ${errorText}`, response.status)
  }

  const data = await response.json()
  const results: PriceResult[] = []

  // Parse Yahoo response
  if (data.quoteResponse && Array.isArray(data.quoteResponse.result)) {
    for (const quote of data.quoteResponse.result as YahooQuote[]) {
      if (quote.symbol && typeof quote.regularMarketPrice === 'number' && quote.regularMarketPrice > 0) {
        results.push({
          symbolRaw: quote.symbol,
          price: quote.regularMarketPrice,
          currency: quote.currency || null,
          marketTime: quote.regularMarketTime ? quote.regularMarketTime * 1000 : null, // Convert to ms
        })
      }
    }
  }

  return results
}

async function fetchYahooQuotesWithRetry(
  symbols: string[],
  apiKey: string
): Promise<{ succeeded: PriceResult[]; failed: string[] }> {
  const succeeded: PriceResult[] = []
  const failed: string[] = []
  
  const chunks = chunkArray(symbols, CHUNK_SIZE)
  
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`  Fetching chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} symbols), attempt ${attempt + 1}`)
        const results = await fetchYahooQuotes(chunk, apiKey)
        succeeded.push(...results)
        
        // Track which symbols didn't return data
        const returnedSymbols = new Set(results.map((r) => normalizeSymbolKey(r.symbolRaw)))
        for (const symbol of chunk) {
          if (!returnedSymbols.has(normalizeSymbolKey(symbol))) {
            console.warn(`    No data returned for: ${symbol}`)
            failed.push(symbol)
          }
        }
        
        lastError = null
        break // Success, move to next chunk
      } catch (err) {
        lastError = err as Error
        
        if (err instanceof YahooQuotaExceededError) {
          if (attempt < MAX_RETRIES - 1) {
            const delay = RETRY_DELAYS[attempt]
            console.warn(`  Rate limited, waiting ${delay / 1000}s before retry...`)
            await sleep(delay)
          } else {
            console.error(`  Rate limit exceeded, giving up on chunk ${chunkIndex + 1}`)
            failed.push(...chunk)
          }
        } else {
          console.error(`  Error fetching chunk ${chunkIndex + 1}:`, err)
          if (attempt >= MAX_RETRIES - 1) {
            failed.push(...chunk)
          }
        }
      }
    }
    
    // Small delay between chunks to avoid rate limiting
    if (chunkIndex < chunks.length - 1) {
      await sleep(1000)
    }
  }
  
  return { succeeded, failed }
}

// ============================================================================
// Firestore Operations
// ============================================================================

async function getSymbolsFromRegistry(db: FirebaseFirestore.Firestore): Promise<string[]> {
  const snapshot = await db.collection('marketSymbolsRegistry').get()
  return snapshot.docs.map((doc) => doc.id)
}

async function writeDailyPrices(
  db: FirebaseFirestore.Firestore,
  dateKey: string,
  prices: PriceResult[]
): Promise<void> {
  if (prices.length === 0) return

  const batch = db.batch()
  
  // Create/update parent doc
  const parentRef = db.collection('marketDailyPrices').doc(dateKey)
  batch.set(parentRef, {
    dateKey,
    provider: 'yahoo',
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  
  // Write each symbol
  for (const price of prices) {
    const symbolKey = normalizeSymbolKey(price.symbolRaw)
    const symbolRef = parentRef.collection('symbols').doc(symbolKey)
    batch.set(symbolRef, {
      symbolKey,
      symbolRaw: price.symbolRaw,
      price: price.price,
      currency: price.currency,
      marketTime: price.marketTime,
      source: 'yahoo',
      fetchedAt: FieldValue.serverTimestamp(),
    })
  }
  
  await batch.commit()
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('Daily Market Price Update')
  console.log('='.repeat(60))
  
  // Validate environment
  const rapidApiKey = process.env.RAPIDAPI_KEY
  if (!rapidApiKey) {
    throw new Error('RAPIDAPI_KEY environment variable is required')
  }
  
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required')
  }
  
  // Parse service account (support both base64 and raw JSON)
  let serviceAccount: ServiceAccount
  try {
    // Try parsing as raw JSON first
    serviceAccount = JSON.parse(serviceAccountJson)
  } catch {
    // Try base64 decode
    try {
      const decoded = Buffer.from(serviceAccountJson, 'base64').toString('utf-8')
      serviceAccount = JSON.parse(decoded)
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON or base64-encoded JSON')
    }
  }
  
  // Initialize Firebase Admin
  console.log('\n1. Initializing Firebase Admin...')
  const app = initializeApp({
    credential: cert(serviceAccount),
  })
  const db = getFirestore(app)
  
  // Get symbols from registry
  console.log('\n2. Fetching symbols from registry...')
  const symbols = await getSymbolsFromRegistry(db)
  
  if (symbols.length === 0) {
    console.log('   No symbols in registry. Nothing to update.')
    console.log('\n✅ Done (no symbols to process)')
    return
  }
  
  console.log(`   Found ${symbols.length} symbols: ${symbols.slice(0, 10).join(', ')}${symbols.length > 10 ? '...' : ''}`)
  
  // Fetch prices from Yahoo
  console.log('\n3. Fetching prices from Yahoo Finance...')
  const { succeeded, failed } = await fetchYahooQuotesWithRetry(symbols, rapidApiKey)
  
  console.log(`   Succeeded: ${succeeded.length}, Failed: ${failed.length}`)
  
  // Write to Firestore
  const dateKey = getUtcDateKey()
  console.log(`\n4. Writing to Firestore (${dateKey})...`)
  await writeDailyPrices(db, dateKey, succeeded)
  console.log(`   Wrote ${succeeded.length} prices`)
  
  // Summary
  console.log('\n' + '='.repeat(60))
  if (failed.length > 0) {
    console.log(`⚠️  Completed with ${failed.length} failures:`)
    console.log(`   ${failed.join(', ')}`)
    process.exitCode = 1 // Non-zero exit to indicate partial failure
  } else {
    console.log('✅ Completed successfully!')
  }
  console.log(`   Date: ${dateKey}`)
  console.log(`   Symbols updated: ${succeeded.length}`)
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
