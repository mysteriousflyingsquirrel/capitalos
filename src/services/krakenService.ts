import type { PerpetualsData } from '../pages/NetWorth'

/**
 * Fetches Perpetuals data from Kraken Futures API
 * @param uid - User ID
 * @returns Perpetuals data or null if error/not configured
 */
export async function fetchKrakenPerpetualsData(uid: string): Promise<PerpetualsData | null> {
  console.log('[Kraken Service] Fetching data for UID:', uid)
  
  try {
    const url = `/api/perpetuals/kraken?uid=${encodeURIComponent(uid)}`
    console.log('[Kraken Service] Fetching from:', url)
    
    const response = await fetch(url)
    
    console.log('[Kraken Service] Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      
      console.log('[Kraken Service] Error response:', {
        status: response.status,
        error: errorData,
      })
      
      // Don't log errors for missing credentials (user hasn't configured yet)
      if (response.status === 400 && errorData.error?.includes('not configured')) {
        console.log('[Kraken Service] Credentials not configured, returning null')
        return null
      }
      
      // For 401 errors (authentication/permission issues), return null gracefully
      // The user may have an invalid key or the key check may have failed
      if (response.status === 401) {
        console.log('[Kraken Service] Authentication failed (401), returning null')
        return null
      }
      
      console.error('[Kraken Service] Failed to fetch Kraken Futures Perpetuals data:', errorData)
      return null
    }

    const result = await response.json()
    
    console.log('[Kraken Service] Response received:', {
      success: result.success,
      hasData: !!result.data,
      positionsCount: result.data?.openPositions?.length || 0,
      lockedMarginCount: result.data?.lockedMargin?.length || 0,
      availableMarginCount: result.data?.availableMargin?.length || 0,
    })
    
    if (result.success && result.data) {
      return result.data
    }

    console.log('[Kraken Service] Response missing success or data')
    return null
  } catch (error) {
    console.error('[Kraken Service] Error fetching Kraken Futures Perpetuals data:', error)
    return null
  }
}

