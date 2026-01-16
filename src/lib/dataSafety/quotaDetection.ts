/**
 * Quota detection and error handling
 */

export interface FirebaseError {
  code?: string
  message?: string
}

/**
 * Check if error is a quota/resource-exhausted error
 */
export function isQuotaError(error: any): boolean {
  if (!error) return false

  const code = error.code || ''
  const message = (error.message || '').toLowerCase()

  // Check for resource-exhausted code
  if (code === 'resource-exhausted') {
    return true
  }

  // Check for quota-related messages
  if (message.includes('quota') || 
      message.includes('resource-exhausted') ||
      message.includes('maximum backoff delay') ||
      message.includes('too many requests')) {
    return true
  }

  return false
}

/**
 * Wrap Firestore operations to detect quota errors
 */
export async function withQuotaDetection<T>(
  operation: () => Promise<T>,
  onQuotaError?: (error: any) => void
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isQuotaError(error)) {
      console.error('[QuotaDetection] Quota error detected:', error)
      if (onQuotaError) {
        onQuotaError(error)
      }
    }
    throw error
  }
}

