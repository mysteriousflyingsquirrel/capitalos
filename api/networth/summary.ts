/**
 * API endpoint for Net Worth Summary
 * GET /api/networth/summary?uid=xxx
 * Returns cached net worth summary (5-minute TTL)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import admin from 'firebase-admin'
import type { CurrencyCode } from '../../src/lib/currency'
import { getNetWorthSummary as getNetWorthSummaryServer } from '../../src/lib/networth/netWorthServiceServer'

// Export config for Vercel
export const config = {
  maxDuration: 60,
}

// Initialize Firebase Admin SDK
function initializeAdmin() {
  if (admin.apps.length > 0) {
    return
  }

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      admin.initializeApp()
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return
    }
    console.error('Failed to initialize Firebase Admin:', error)
    throw new Error(`Firebase Admin initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' })
  }

  try {
    initializeAdmin()

    // Get user ID from query parameter
    // TODO: In production, validate uid from auth token/session instead of trusting client
    const uid = req.query?.uid as string | undefined

    if (!uid || typeof uid !== 'string') {
      return res.status(400).json({ 
        error: 'User ID (uid) is required. Provide it as a query parameter: ?uid=your-user-id' 
      })
    }

    // Get base currency from query or default to CHF
    const baseCurrency = (req.query?.baseCurrency as CurrencyCode) || 'CHF'

    // Get summary from service (uses server-side caching)
    const summary = await getNetWorthSummaryServer(uid, baseCurrency)

    // Return summary
    // Note: Do not apply long CDN caching - we want 5-minute refresh behavior
    return res.status(200).json(summary)
  } catch (error) {
    console.error('[NetWorthSummary API] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return res.status(500).json({
      error: errorMessage,
    })
  }
}
