import type { PerpetualsData } from '../pages/NetWorth'

/**
 * Fetches Perpetuals data from Kraken Futures API
 * @param uid - User ID
 * @returns Perpetuals data or null if error/not configured
 */
export async function fetchKrakenPerpetualsData(uid: string): Promise<PerpetualsData | null> {
  try {
    const response = await fetch(`/api/perpetuals/kraken?uid=${encodeURIComponent(uid)}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      
      // Don't log errors for missing credentials (user hasn't configured yet)
      if (response.status === 400 && errorData.error?.includes('not configured')) {
        return null
      }
      
      console.error('Failed to fetch Kraken Perpetuals data:', errorData)
      return null
    }

    const result = await response.json()
    
    if (result.success && result.data) {
      return result.data
    }

    return null
  } catch (error) {
    console.error('Error fetching Kraken Perpetuals data:', error)
    return null
  }
}

