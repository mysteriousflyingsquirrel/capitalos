import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { NetWorthSummary } from '../../src/lib/networth/types'

// Export config for Vercel (increase timeout if needed)
export const config = {
  maxDuration: 60,
}

// Initialize Firebase Admin SDK
function initializeAdmin() {
  // Check if Firebase Admin is already initialized (important for serverless)
  if (admin.apps.length > 0) {
    return
  }

  try {
    // Try to initialize with service account from environment variable
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      // Fallback: try to use default credentials (for local development)
      admin.initializeApp()
    }
  } catch (error) {
    // Handle "already exists" error in serverless environments
    if (error instanceof Error && error.message.includes('already exists')) {
      return
    }
    console.error('Failed to initialize Firebase Admin:', error)
    throw new Error(`Firebase Admin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Snapshot format for Firestore storage
interface NetWorthSnapshot {
  date: string
  timestamp: number
  categories: Record<string, number>
  total: number
}


// Note: Calculation logic is handled by NetWorthCalculationService
// which uses balanceCalculationService internally and falls back to transaction-based calculations
// when prices are not provided. This ensures consistency with the frontend.
// 
// All calculations use pricePerItemChf already stored in transactions - no external API calls needed.


/**
 * Convert NetWorthSummary to NetWorthSnapshot format
 * Uses the summary from the global service - ensures consistency
 */
function summaryToSnapshot(summary: NetWorthSummary): NetWorthSnapshot {
  // Convert categories array to record format
  const categories: Record<string, number> = {}
  summary.categories.forEach(cat => {
    categories[cat.categoryKey] = cat.total
  })

  // Use UTC for date calculation
  const now = new Date()
  const nowUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  ))
  
  const year = nowUTC.getUTCFullYear()
  const month = String(nowUTC.getUTCMonth() + 1).padStart(2, '0')
  const day = String(nowUTC.getUTCDate()).padStart(2, '0')
  const date = `${year}-${month}-${day}`

  return {
    date,
    timestamp: nowUTC.getTime(),
    categories,
    total: summary.totalNetWorth,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    // Initialize Firebase Admin
    initializeAdmin()

    // Get user ID from request body or query
    const uid = req.body?.uid || req.query?.uid

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ error: 'User ID (uid) is required. Provide it in the request body as { "uid": "your-user-id" } or as a query parameter ?uid=your-user-id' })
    }

    // Read pre-computed summary from Firestore (computed by client on every data change)
    // No fetching, no computing, no transaction computing - just read and save as snapshot
    console.log('[Snapshot] Reading pre-computed net worth summary from Firestore...')
    const db = admin.firestore()
    const summaryRef = db.collection(`users/${uid}/netWorthSummary`).doc('current')
    const summaryDoc = await summaryRef.get()
    
    if (!summaryDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Net worth summary not found. Please ensure the application has computed and saved a summary.',
      })
    }
    
    const summary = summaryDoc.data() as NetWorthSummary
    console.log('[Snapshot] Summary retrieved from Firestore:', {
      totalNetWorth: summary.totalNetWorth,
      categoriesCount: summary.categories?.length || 0,
      asOf: summary.asOf,
    })

    // Convert summary to snapshot format
    let snapshot = summaryToSnapshot(summary)

    // If called around 00:00 UTC (cron job), create snapshot for yesterday at 23:59:59 UTC
    // This ensures the snapshot represents the end of the previous day, not the start of the new day
    const now = new Date()
    const utcHour = now.getUTCHours()
    const utcMinutes = now.getUTCMinutes()
    
    // If between 00:00 and 00:05 UTC, assume this is the daily cron and use yesterday's date
    if (utcHour === 0 && utcMinutes < 5) {
      const yesterday = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1
      ))
      const yesterdayYear = yesterday.getUTCFullYear()
      const yesterdayMonth = yesterday.getUTCMonth()
      const yesterdayDay = yesterday.getUTCDate()
      
      // Override snapshot date and timestamp to be yesterday at 23:59:59 UTC
      snapshot.date = `${yesterdayYear}-${String(yesterdayMonth + 1).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`
      snapshot.timestamp = new Date(Date.UTC(yesterdayYear, yesterdayMonth, yesterdayDay, 23, 59, 59)).getTime()
    }

    // Check if snapshot already exists for this date
    const existingSnapshotRef = db.collection(`users/${uid}/snapshots`).doc(snapshot.date)
    const existingSnapshot = await existingSnapshotRef.get()
    
    if (existingSnapshot.exists) {
      return res.status(200).json({
        success: true,
        message: `Snapshot already exists for ${snapshot.date}, skipping creation`,
        snapshot: {
          date: snapshot.date,
          timestamp: existingSnapshot.data()?.timestamp,
          total: existingSnapshot.data()?.total,
          categories: existingSnapshot.data()?.categories,
        },
      })
    }

    // Save snapshot to Firestore
    const snapshotRef = db.collection(`users/${uid}/snapshots`).doc(snapshot.date)
    await snapshotRef.set(snapshot)

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'Snapshot created successfully',
      snapshot: {
        date: snapshot.date,
        timestamp: snapshot.timestamp,
        total: snapshot.total,
        categories: snapshot.categories,
      },
    })
  } catch (error) {
    console.error('[Snapshot] Error creating snapshot:', error)
    
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('[Snapshot] Error name:', error.name)
      console.error('[Snapshot] Error message:', error.message)
      console.error('[Snapshot] Error stack:', error.stack)
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}

