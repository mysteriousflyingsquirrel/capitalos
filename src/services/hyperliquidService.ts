import type { PerpetualsData } from '../pages/NetWorth'

export async function fetchHyperliquidPerpetualsData(args: {
  uid: string
  walletAddress: string
}): Promise<PerpetualsData | null> {
  // Return null if wallet address is missing
  if (!args.walletAddress) {
    return null
  }

  try {
    const response = await fetch(`/api/perpetuals/hyperliquid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: args.uid,
        walletAddress: args.walletAddress,
      }),
    })
    
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