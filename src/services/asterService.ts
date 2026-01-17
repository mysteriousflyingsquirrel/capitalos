import type { PerpetualsData } from '../pages/NetWorth'

export async function fetchAsterPerpetualsData(args: {
  uid: string
  apiKey: string
  apiSecret: string | null
}): Promise<PerpetualsData | null> {
  // Return null if keys are missing
  if (!args.apiKey || !args.apiSecret) {
    return null
  }

  try {
    const response = await fetch(`/api/perpetuals/aster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: args.uid,
        apiKey: args.apiKey,
        apiSecret: args.apiSecret,
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