import type { PerpetualsData } from '../pages/NetWorth'

export async function fetchHyperliquidPerpetualsData(uid: string): Promise<PerpetualsData | null> {
  try {
    const response = await fetch(`/api/perpetuals/hyperliquid?uid=${encodeURIComponent(uid)}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      
      if (response.status === 400 && errorData.error?.includes('not configured')) {
        return null
      }
      
      return null
    }

    const result = await response.json()
    
    if (result.success && result.data) {
      return result.data
    }

    return null
  } catch (error) {
    return null
  }
}