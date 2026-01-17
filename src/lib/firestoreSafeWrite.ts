/**
 * Conflict-Safe Firestore Write Helpers
 * 
 * Prevents "last write wins" conflicts in multi-device scenarios.
 * Uses timestamps and device IDs to detect and prevent stale overwrites.
 */

import { doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, type Timestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { getDeviceId } from './deviceId'

export interface ConflictMetadata {
  updatedAt: Timestamp | null
  updatedBy: string | null
  version?: number
}

/**
 * Safely upserts a document with conflict detection
 * 
 * Rules:
 * - If document doesn't exist, create it
 * - If document exists and is newer than our data, abort (prevent stale overwrite)
 * - If document exists and is older/equal, update it
 * - Always include updatedAt and updatedBy metadata
 * 
 * @param docRef - Firestore document reference
 * @param data - Data to write (will be merged with existing)
 * @param options - Write options
 * @returns true if write succeeded, false if aborted due to conflict
 */
export async function safeUpsertDoc<T extends Record<string, any>>(
  docRef: ReturnType<typeof doc>,
  data: T,
  options: {
    clientUpdatedAt?: Date | null // When the client last saw this data
    allowOverwrite?: boolean // Force overwrite (use with caution, e.g., Import/Reset)
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const { clientUpdatedAt, allowOverwrite = false } = options
  const deviceId = getDeviceId()

  try {
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef)
      const existing = docSnap.exists() ? docSnap.data() : null

      // If document exists, check for conflicts
      if (existing && !allowOverwrite) {
        const existingUpdatedAt = existing.updatedAt as Timestamp | null
        const existingUpdatedBy = existing.updatedBy as string | null

        // If we have a client timestamp, compare it
        if (clientUpdatedAt && existingUpdatedAt) {
          const existingTime = existingUpdatedAt.toMillis()
          const clientTime = clientUpdatedAt.getTime()

          // If existing document is newer, abort (prevent stale overwrite)
          if (existingTime > clientTime) {
            if (import.meta.env.DEV) {
              console.warn('[SafeWrite] Aborted stale overwrite:', {
                path: docRef.path,
                existingUpdatedAt: existingUpdatedAt.toDate().toISOString(),
                clientUpdatedAt: clientUpdatedAt.toISOString(),
                existingUpdatedBy,
                deviceId,
              })
            }
            return { success: false, reason: 'existing_document_newer' }
          }
        }

        // If document was updated by another device and we don't have client timestamp,
        // and it's very recent (< 5 seconds), be cautious
        if (!clientUpdatedAt && existingUpdatedBy && existingUpdatedBy !== deviceId) {
          const existingTime = existingUpdatedAt?.toMillis() || 0
          const now = Date.now()
          const age = now - existingTime

          // If document was updated by another device within last 5 seconds, abort
          if (age < 5000) {
            if (import.meta.env.DEV) {
              console.warn('[SafeWrite] Aborted recent write by another device:', {
                path: docRef.path,
                existingUpdatedAt: existingUpdatedAt?.toDate().toISOString(),
                existingUpdatedBy,
                deviceId,
                ageMs: age,
              })
            }
            return { success: false, reason: 'recent_write_by_another_device' }
          }
        }
      }

      // Safe to write - merge with existing data and add metadata
      const writeData = {
        ...(existing || {}),
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: deviceId,
      }

      // Increment version if it exists, otherwise start at 1
      if (existing?.version !== undefined) {
        writeData.version = (existing.version as number) + 1
      } else {
        writeData.version = 1
      }

      transaction.set(docRef, writeData, { merge: true })

      if (import.meta.env.DEV) {
        console.log('[SafeWrite] Safe upsert:', {
          path: docRef.path,
          deviceId,
          wasNew: !existing,
          version: writeData.version,
        })
      }

      return { success: true }
    })
  } catch (error) {
    console.error('[SafeWrite] Error in safeUpsertDoc:', error, {
      path: docRef.path,
      deviceId,
    })
    throw error
  }
}

/**
 * Safely updates a document (patch-style, only changed fields)
 * 
 * Use this when you know the document exists and want to update specific fields.
 * 
 * @param docRef - Firestore document reference
 * @param updates - Partial data to update (only changed fields)
 * @param options - Write options
 */
export async function safeUpdateDoc<T extends Record<string, any>>(
  docRef: ReturnType<typeof doc>,
  updates: Partial<T>,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const { clientUpdatedAt, allowOverwrite = false } = options
  const deviceId = getDeviceId()

  try {
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef)

      if (!docSnap.exists()) {
        // Document doesn't exist, can't update
        return { success: false, reason: 'document_not_found' }
      }

      const existing = docSnap.data()
      const existingUpdatedAt = existing.updatedAt as Timestamp | null

      // Check for conflicts
      if (!allowOverwrite && clientUpdatedAt && existingUpdatedAt) {
        const existingTime = existingUpdatedAt.toMillis()
        const clientTime = clientUpdatedAt.getTime()

        if (existingTime > clientTime) {
          if (import.meta.env.DEV) {
            console.warn('[SafeWrite] Aborted stale update:', {
              path: docRef.path,
              existingUpdatedAt: existingUpdatedAt.toDate().toISOString(),
              clientUpdatedAt: clientUpdatedAt.toISOString(),
              deviceId,
            })
          }
          return { success: false, reason: 'existing_document_newer' }
        }
      }

      // Safe to update - merge updates with metadata
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: deviceId,
        version: (existing.version || 0) + 1,
      }

      transaction.update(docRef, updateData)

      if (import.meta.env.DEV) {
        console.log('[SafeWrite] Safe update:', {
          path: docRef.path,
          deviceId,
          version: updateData.version,
        })
      }

      return { success: true }
    })
  } catch (error) {
    console.error('[SafeWrite] Error in safeUpdateDoc:', error, {
      path: docRef.path,
      deviceId,
    })
    throw error
  }
}

/**
 * Safely deletes a document (with conflict check)
 * 
 * @param docRef - Firestore document reference
 * @param options - Delete options
 */
export async function safeDeleteDoc(
  docRef: ReturnType<typeof doc>,
  options: {
    clientUpdatedAt?: Date | null
    allowOverwrite?: boolean
  } = {}
): Promise<{ success: boolean; reason?: string }> {
  const { clientUpdatedAt, allowOverwrite = false } = options
  const deviceId = getDeviceId()

  try {
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef)

      if (!docSnap.exists()) {
        return { success: true } // Already deleted
      }

      const existing = docSnap.data()
      const existingUpdatedAt = existing.updatedAt as Timestamp | null

      // Check for conflicts before delete
      if (!allowOverwrite && clientUpdatedAt && existingUpdatedAt) {
        const existingTime = existingUpdatedAt.toMillis()
        const clientTime = clientUpdatedAt.getTime()

        if (existingTime > clientTime) {
          if (import.meta.env.DEV) {
            console.warn('[SafeWrite] Aborted stale delete:', {
              path: docRef.path,
              existingUpdatedAt: existingUpdatedAt.toDate().toISOString(),
              clientUpdatedAt: clientUpdatedAt.toISOString(),
              deviceId,
            })
          }
          return { success: false, reason: 'existing_document_newer' }
        }
      }

      transaction.delete(docRef)

      if (import.meta.env.DEV) {
        console.log('[SafeWrite] Safe delete:', {
          path: docRef.path,
          deviceId,
        })
      }

      return { success: true }
    })
  } catch (error) {
    console.error('[SafeWrite] Error in safeDeleteDoc:', error, {
      path: docRef.path,
      deviceId,
    })
    throw error
  }
}

