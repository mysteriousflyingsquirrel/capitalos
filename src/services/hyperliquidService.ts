import type { PerpetualsData } from '../pages/NetWorth'

/**
 * Fetches Perpetuals data from Hyperliquid API
 * @param uid - User ID
 * @returns Perpetuals data or null if error/not configured
 */
export async function fetchHyperliquidPerpetualsData(uid: string): Promise<PerpetualsData | null> {
  try {
    const response = await fetch(`/api/perpetuals/hyperliquid?uid=${encodeURIComponent(uid)}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      
      // Don't log errors for missing credentials (user hasn't configured yet)
      if (response.status === 400 && errorData.error?.includes('not configured')) {
        return null
      }
      
      console.error('Failed to fetch Hyperliquid Perpetuals data:', errorData)
      return null
    }

    const result = await response.json()
    
    console.log('[HyperliquidService] API response:', {
      success: result.success,
      hasData: !!result.data,
      dataStructure: result.data ? {
        openPositions: result.data.openPositions,
        openPositionsCount: result.data.openPositions?.length || 0,
      } : null,
    })
    
    if (result.success && result.data) {
      console.log('[HyperliquidService] Returning data:', result.data)
      return result.data
    }

    console.log('[HyperliquidService] No data to return')
    return null
  } catch (error) {
    console.error('Error fetching Hyperliquid Perpetuals data:', error)
    return null
  }
}

