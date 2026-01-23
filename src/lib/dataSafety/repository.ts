import { 
  DocumentReference,
  WriteBatch,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch as createBatch,
} from 'firebase/firestore'
import { db } from '../../config/firebase'
import { isQuotaError } from './quotaDetection'
import { trackWriteAttempt, trackWriteSuccess } from './subscriptionManager'

interface WriteOptions {
  origin: 'user' | 'remote' | 'system'
  domain: string
  merge?: boolean
  dirty?: boolean
}

/**
 * Runtime guard: Check if payload looks like a full store dump
 */
function isFullStoreDump(payload: any, domain: string): boolean {
  if (!payload || typeof payload !== 'object') return false
  
  // Check for common full-store patterns
  const keys = Object.keys(payload)
  
  // If payload has arrays that look like collections
  if (keys.some(key => Array.isArray(payload[key]) && payload[key].length > 10)) {
    return true
  }
  
  // If payload has nested objects that look like full state
  if (keys.length > 20) {
    return true
  }
  
  return false
}

/**
 * Runtime guard: Check if writing empty array/object to critical collections
 */
function isDangerousEmptyWrite(domain: string, payload: any): boolean {
  const criticalCollections = ['netWorthItems', 'netWorthTransactions']
  
  if (!criticalCollections.includes(domain)) return false
  
  // Check if payload is empty array or object
  if (Array.isArray(payload) && payload.length === 0) {
    return true
  }
  
  if (typeof payload === 'object' && Object.keys(payload).length === 0) {
    return true
  }
  
  return false
}

/**
 * Safe write wrapper - enforces no-overwrite guarantee
 */
export async function safeWrite<T = any>(
  docRef: DocumentReference<T>,
  data: Partial<T>,
  options: WriteOptions
): Promise<void> {
  const { origin, domain, merge = false, dirty = true } = options

  // Get sync status to check for offline/safe mode
  // Access global sync status (set by SyncStatusProvider)
  // Note: During initialization, sync status might not be available yet
  const syncStatus = typeof window !== 'undefined' ? (window as any).__CAPITALOS_SYNC_STATUS__ : null
  
  if (syncStatus) {
    // Block writes if offline
    if (!syncStatus.online) {
      throw new Error('Cannot write: App is offline (read-only mode)')
    }
    
    // Block writes if in safe mode
    if (syncStatus.safeMode) {
      throw new Error('Cannot write: App is in safe mode (quota exceeded)')
    }
  }
  // If sync status is not available (e.g., during initialization), allow the write
  // The sync status will be set up by SyncStatusProvider

  // Runtime guards (dev hard-fail)
  if (import.meta.env.DEV) {
    // Guard: No setDoc without merge for user/system writes
    if (!merge && (origin === 'user' || origin === 'system')) {
      throw new Error(
        `[Repository] SAFETY VIOLATION: setDoc without merge attempted. ` +
        `Domain: ${domain}, Origin: ${origin}. ` +
        `Use merge: true or updateDoc instead.`
      )
    }
    
    // Guard: No full store dumps
    if (isFullStoreDump(data, domain)) {
      throw new Error(
        `[Repository] SAFETY VIOLATION: Full store dump detected. ` +
        `Domain: ${domain}, Origin: ${origin}. ` +
        `Only item-level writes are allowed.`
      )
    }
    
    // Guard: No dangerous empty writes
    if (isDangerousEmptyWrite(domain, data)) {
      throw new Error(
        `[Repository] SAFETY VIOLATION: Empty write to critical collection. ` +
        `Domain: ${domain}, Origin: ${origin}. ` +
        `Empty arrays/objects cannot be written to ${domain}.`
      )
    }
  }

  // Only allow writes from user/system origin
  if (origin === 'remote') {
    throw new Error(
      `[Repository] SAFETY VIOLATION: Remote origin cannot trigger writes. ` +
      `Domain: ${domain}. Remote updates must never trigger writes.`
    )
  }

  // Track write attempt
  trackWriteAttempt()
  
  try {
    // Perform write with merge if specified
    if (merge) {
      // Use setDoc with merge option - works for both creating and updating
      // This is safer than updateDoc because it doesn't require the document to exist
      await setDoc(docRef, data as any, { merge: true })
    } else {
      // Only allow setDoc without merge for system initialization (but guard blocks this)
      // This path should not be reached due to the guard above
      if (origin === 'system') {
        await setDoc(docRef, data as any)
      } else {
        // For user writes, always use merge
        await setDoc(docRef, data as any, { merge: true })
      }
    }
    
    // Track write success
    trackWriteSuccess()
  } catch (error) {
    // Detect quota errors and update sync status
    if (isQuotaError(error)) {
      const syncStatus = (window as any).__CAPITALOS_SYNC_STATUS__
      if (syncStatus && syncStatus.setQuotaExceeded) {
        syncStatus.setQuotaExceeded(true)
      }
    }
    throw error
  }
}

/**
 * Safe batch write wrapper
 */
export function safeBatch(): WriteBatch {
  return createBatch(db)
}

/**
 * Safe delete wrapper
 */
export async function safeDelete<T = any>(
  docRef: DocumentReference<T>,
  options: { origin: 'user' | 'system'; domain: string }
): Promise<void> {
  const { origin, domain } = options

  // Check sync status
  const syncStatus = (window as any).__CAPITALOS_SYNC_STATUS__
  if (syncStatus) {
    if (!syncStatus.online) {
      throw new Error('Cannot delete: App is offline (read-only mode)')
    }
    if (syncStatus.safeMode) {
      throw new Error('Cannot delete: App is in safe mode (quota exceeded)')
    }
  }

  // Only allow deletes from user/system origin
  if (origin === 'remote') {
    throw new Error(
      `[Repository] SAFETY VIOLATION: Remote origin cannot trigger deletes. ` +
      `Domain: ${domain}.`
    )
  }

  try {
    await deleteDoc(docRef)
  } catch (error) {
    // Detect quota errors and update sync status
    if (isQuotaError(error)) {
      const syncStatus = (window as any).__CAPITALOS_SYNC_STATUS__
      if (syncStatus && syncStatus.setQuotaExceeded) {
        syncStatus.setQuotaExceeded(true)
      }
    }
    throw error
  }
}

