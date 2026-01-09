import type { PerpetualsData } from '../pages/NetWorth'

/**
 * Fetches Perpetuals data from Kraken Futures API via REST
 * 
 * @deprecated This REST endpoint is deprecated in favor of WebSocket client (krakenFuturesWs.ts).
 * This function is kept for fallback/debugging purposes only.
 * The WebSocket client provides real-time updates and is the preferred method.
 * 
 * @param uid - User ID
 * @returns Perpetuals data or null if error/not configured
 */
export async function fetchKrakenPerpetualsData(uid: string): Promise<PerpetualsData | null> {
  console.log('[KrakenService] fetchKrakenPerpetualsData called', { uid })
  
  try {
    const url = `/api/perpetuals/kraken?uid=${encodeURIComponent(uid)}`
    console.log('[KrakenService] Fetching from:', url)
    
    const response = await fetch(url)
    console.log('[KrakenService] Response status:', response.status, response.statusText)
    console.log('[KrakenService] Response headers:', Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[KrakenService] Response not OK, error text:', errorText)
      
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText || 'Unknown error' }
      }
      
      console.error('[KrakenService] Parsed error data:', errorData)
      
      // Don't log errors for missing credentials (user hasn't configured yet)
      if (response.status === 400 && errorData.error?.includes('not configured')) {
        console.log('[KrakenService] Credentials not configured, returning null')
        return null
      }
      
      console.error('[KrakenService] Failed to fetch Kraken Perpetuals data:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      })
      return null
    }

    const result = await response.json()
    console.log('[KrakenService] Raw API response:', result)
    
    console.log('[KrakenService] API response details:', {
      success: result.success,
      hasData: !!result.data,
      hasError: !!result.error,
      error: result.error,
      dataStructure: result.data ? {
        openPositions: result.data.openPositions,
        openOrders: result.data.openOrders,
        availableMargin: result.data.availableMargin,
        lockedMargin: result.data.lockedMargin,
        openPositionsCount: result.data.openPositions?.length || 0,
        openOrdersCount: result.data.openOrders?.length || 0,
        availableMarginCount: result.data.availableMargin?.length || 0,
        lockedMarginCount: result.data.lockedMargin?.length || 0,
      } : null,
    })
    
    if (result.success && result.data) {
      console.log('[KrakenService] Returning data successfully')
      return result.data
    }

    console.log('[KrakenService] No data to return (success:', result.success, ', hasData:', !!result.data, ')')
    return null
  } catch (error) {
    console.error('[KrakenService] Exception caught:', error)
    if (error instanceof Error) {
      console.error('[KrakenService] Error message:', error.message)
      console.error('[KrakenService] Error stack:', error.stack)
    }
    return null
  }
}

