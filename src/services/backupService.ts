import {
  loadNetWorthItems,
  loadNetWorthTransactions,
  loadCashflowInflowItems,
  loadCashflowOutflowItems,
  loadCashflowAccountflowMappings,
  loadPlatforms,
  saveNetWorthItems,
  saveNetWorthTransactions,
  saveCashflowInflowItems,
  saveCashflowOutflowItems,
  saveCashflowAccountflowMappings,
  savePlatforms,
  type Platform,
} from './storageService'
import { clearAllUserData } from './firestoreService'
import { loadUserSettings, saveBaseCurrency, saveApiKeys, type ApiKeys } from '../lib/dataSafety/userSettingsRepo'
import { loadSnapshots, saveSnapshots, type NetWorthSnapshot } from './snapshotService'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { safeWrite } from '../lib/dataSafety/repository'

// Schema version 2.0.0 - matches canonical Firestore structure
const BACKUP_SCHEMA_VERSION = '2.0.0'

export interface BackupData {
  schemaVersion: string
  userId: string | null
  exportedAt: string
  data: {
    netWorthItems: unknown[]
    netWorthTransactions: unknown[]
    cashflowInflowItems: unknown[]
    cashflowOutflowItems: unknown[]
    cashflowAccountflowMappings: unknown[]
    platforms: unknown[]
    settings: {
      baseCurrency?: string
      apiKeys?: ApiKeys
      themeId?: string
    } | null
    snapshots: unknown[]
  }
}

/**
 * Creates a backup object from all user data in Firestore
 * Uses canonical Firestore paths
 */
export async function createBackup(uid: string): Promise<BackupData> {
  const [
    netWorthItems,
    netWorthTransactions,
    cashflowInflowItems,
    cashflowOutflowItems,
    cashflowAccountflowMappings,
    platforms,
    settings,
    snapshots,
  ] = await Promise.all([
    loadNetWorthItems([], uid),
    loadNetWorthTransactions([], uid),
    loadCashflowInflowItems([], uid),
    loadCashflowOutflowItems([], uid),
    loadCashflowAccountflowMappings([], uid),
    loadPlatforms([], uid),
    loadUserSettings(uid),
    loadSnapshots(uid),
  ])

  // Map settings to export format (canonical structure)
  const exportSettings = settings
    ? {
        baseCurrency: settings.baseCurrency || undefined,
        apiKeys: settings.apiKeys || undefined,
        themeId: settings.themeId || undefined,
      }
    : null

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    userId: uid,
    exportedAt: new Date().toISOString(),
    data: {
      netWorthItems,
      netWorthTransactions,
      cashflowInflowItems,
      cashflowOutflowItems,
      cashflowAccountflowMappings,
      platforms,
      settings: exportSettings,
      snapshots,
    },
  }
}

/**
 * Validates a backup object structure
 * Supports both v1.0.0 and v2.0.0 schemas
 */
export function validateBackup(backup: unknown): backup is BackupData {
  if (!backup || typeof backup !== 'object') {
    return false
  }

  const b = backup as Record<string, unknown>

  // Check required top-level fields
  if (
    typeof b.schemaVersion !== 'string' ||
    (b.userId !== null && typeof b.userId !== 'string') ||
    typeof b.exportedAt !== 'string' ||
    !b.data ||
    typeof b.data !== 'object'
  ) {
    return false
  }

  const data = b.data as Record<string, unknown>

  // Check that data has the expected structure
  const requiredDataFields = [
    'netWorthItems',
    'netWorthTransactions',
    'cashflowInflowItems',
    'cashflowOutflowItems',
    'cashflowAccountflowMappings',
  ]

  for (const field of requiredDataFields) {
    if (!Array.isArray(data[field])) {
      return false
    }
  }

  // platforms is optional for backward compatibility
  if (data.platforms !== undefined && !Array.isArray(data.platforms)) {
    return false
  }

  // settings is optional for backward compatibility
  if (data.settings !== undefined && data.settings !== null) {
    if (typeof data.settings !== 'object') {
      return false
    }
    // v1.0.0 only had baseCurrency, v2.0.0 has baseCurrency and apiKeys
    // Both are valid
  }

  // snapshots is optional for backward compatibility
  if (data.snapshots !== undefined && !Array.isArray(data.snapshots)) {
    return false
  }

  return true
}

/**
 * Maps legacy backup format to canonical format
 * Handles v1.0.0 and other legacy structures
 */
function mapLegacyBackup(backup: any): BackupData {
  const data = backup.data || {}
  
  // Map legacy settings paths to canonical structure
  let settings: BackupData['data']['settings'] = null
  
  if (data.settings) {
    // v1.0.0 format: { baseCurrency: string }
    settings = {
      baseCurrency: data.settings.baseCurrency,
      // apiKeys not in v1.0.0, will be undefined
    }
  } else {
    // Check for legacy paths
    if (data.apiKeys || (data as any).settings?.apiKeys) {
      settings = {
        baseCurrency: (data as any).baseCurrency || (data as any).settings?.baseCurrency,
        apiKeys: data.apiKeys || (data as any).settings?.apiKeys,
      }
    } else if ((data as any).baseCurrency) {
      settings = {
        baseCurrency: (data as any).baseCurrency,
      }
    }
  }

  return {
    schemaVersion: backup.schemaVersion || '1.0.0',
    userId: backup.userId || null,
    exportedAt: backup.exportedAt || new Date().toISOString(),
    data: {
      netWorthItems: data.netWorthItems || [],
      netWorthTransactions: data.netWorthTransactions || [],
      cashflowInflowItems: data.cashflowInflowItems || [],
      cashflowOutflowItems: data.cashflowOutflowItems || [],
      cashflowAccountflowMappings: data.cashflowAccountflowMappings || [],
      platforms: data.platforms || [],
      settings,
      snapshots: data.snapshots || [],
    },
  }
}

/**
 * Restores data from a backup object to Firestore
 * 
 * @param backup - Backup data to restore
 * @param currentUid - Current user ID
 * @param options - Import options
 * @param options.mode - 'merge' (default) or 'replace'
 * @param options.includeSettings - Whether to import settings (default: true)
 */
export async function restoreBackup(
  backup: BackupData,
  currentUid: string,
  options: {
    mode?: 'merge' | 'replace'
    includeSettings?: boolean
  } = {}
): Promise<void> {
  // Check if offline
  if (!navigator.onLine) {
    throw new Error('Cannot import data while offline. Please check your internet connection and try again.')
  }

  // Validate backup
  if (!validateBackup(backup)) {
    throw new Error('Invalid backup file format. Please ensure the file is a valid Capitalos backup.')
  }

  // Map legacy format if needed
  const normalizedBackup = backup.schemaVersion === '1.0.0' 
    ? mapLegacyBackup(backup)
    : backup

  const { mode = 'merge', includeSettings = true } = options

  if (backup.userId && backup.userId !== currentUid) {
    console.warn(
      `[BackupService] Backup was exported by user ${backup.userId}, but restoring to user ${currentUid}`
    )
  }

  try {
    // REPLACE mode: Clear existing data first
    if (mode === 'replace') {
      await clearAllUserData(currentUid)
    }

    // Import collections (merge or replace)
    const collectionPromises: Promise<void>[] = []

    // Helper to batch write items with merge
    // Note: writeBatch.set() doesn't support merge option, so we use setDoc in parallel
    // For Import/Reset flows, we use allowOverwrite to bypass conflict checks
    const batchWriteCollection = async <T extends { id: string }>(
      items: T[],
      collectionName: string,
      allowOverwrite: boolean
    ): Promise<void> => {
      if (items.length === 0) return

      const BATCH_SIZE = 500
      const collectionPath = `users/${currentUid}/${collectionName}`

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE)
        
        // Use Promise.all with setDoc for merge support
        await Promise.all(
          chunk.map(async (item) => {
            if (!item.id) {
              console.warn(`[BackupService] Skipping item without ID in ${collectionName}:`, item)
              return
            }
            const docRef = doc(db, collectionPath, item.id)
            // Use setDoc with merge to upsert (create or update)
            // For Import/Reset, allowOverwrite bypasses conflict checks
            await setDoc(docRef, item, { merge: true })
          })
        )
      }
    }

    // Import all collections in parallel
    // Use allowOverwrite flag for Import/Reset flows (intentional bulk overwrite)
    const allowOverwrite = mode === 'replace'
    
    collectionPromises.push(
      batchWriteCollection(normalizedBackup.data.netWorthItems as { id: string }[], 'netWorthItems', allowOverwrite),
      batchWriteCollection(
        normalizedBackup.data.netWorthTransactions as { id: string }[],
        'netWorthTransactions',
        allowOverwrite
      ),
      batchWriteCollection(
        normalizedBackup.data.cashflowInflowItems as { id: string }[],
        'cashflowInflowItems',
        allowOverwrite
      ),
      batchWriteCollection(
        normalizedBackup.data.cashflowOutflowItems as { id: string }[],
        'cashflowOutflowItems',
        allowOverwrite
      ),
      batchWriteCollection(
        normalizedBackup.data.cashflowAccountflowMappings as { id: string }[],
        'cashflowAccountflowMappings',
        allowOverwrite
      ),
      batchWriteCollection(
        (normalizedBackup.data.platforms || []) as { id: string }[],
        'platforms',
        allowOverwrite
      ),
      batchWriteCollection(
        (normalizedBackup.data.snapshots || []) as { id: string }[],
        'snapshots',
        allowOverwrite
      ),
    )

    // Import settings (canonical path: users/{uid}/settings/user)
    if (includeSettings && normalizedBackup.data.settings) {
      const settings = normalizedBackup.data.settings
      const settingsDocRef = doc(db, 'users', currentUid, 'settings', 'user')

      const settingsData: any = {}

      if (settings.baseCurrency) {
        settingsData.baseCurrency = settings.baseCurrency
      }

      if (settings.apiKeys) {
        settingsData.apiKeys = settings.apiKeys
      }

      if (settings.themeId) {
        settingsData.themeId = settings.themeId
      }

      if (Object.keys(settingsData).length > 0) {
        // Use safeWrite with merge to preserve existing fields
        collectionPromises.push(
          safeWrite(settingsDocRef, settingsData, {
            origin: 'user',
            domain: 'settings',
            merge: true,
          })
        )
      }
    }

    // Wait for all imports to complete
    await Promise.all(collectionPromises)

    if (import.meta.env.DEV) {
      console.log('[BackupService] Import completed successfully:', {
        mode,
        includeSettings,
        collectionsImported: [
          'netWorthItems',
          'netWorthTransactions',
          'cashflowInflowItems',
          'cashflowOutflowItems',
          'cashflowAccountflowMappings',
          'platforms',
          'snapshots',
        ],
      })
    }
  } catch (error: any) {
    // Handle specific Firestore errors
    if (error?.code === 'resource-exhausted' || error?.message?.includes('quota')) {
      throw new Error(
        'Firestore quota exceeded. Please try again later or upgrade your Firebase plan.'
      )
    }

    if (error?.code === 'permission-denied') {
      throw new Error(
        'Permission denied. Please ensure you are signed in and have access to import data.'
      )
    }

    if (error?.code === 'unavailable' || error?.message?.includes('network')) {
      throw new Error(
        'Network error. Please check your internet connection and try again.'
      )
    }

    // Re-throw with user-friendly message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    throw new Error(`Failed to import data: ${errorMessage}`)
  }
}

/**
 * Downloads a backup as a JSON file
 */
export function downloadBackup(backup: BackupData): void {
  const jsonString = JSON.stringify(backup, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const date = new Date(backup.exportedAt)
  const dateStr = date.toISOString().split('T')[0]
  const filename = `capitalos-backup-${dateStr}.json`

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Reads a backup file from a File object
 * Validates and normalizes the backup format
 */
export async function readBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string)
        
        // Validate backup
        if (!validateBackup(jsonData)) {
          reject(new Error('Invalid backup file format. Please ensure the file is a valid Capitalos backup.'))
          return
        }

        // Normalize legacy formats
        const normalized = jsonData.schemaVersion === '1.0.0'
          ? mapLegacyBackup(jsonData)
          : jsonData

        resolve(normalized as BackupData)
      } catch (error) {
        reject(new Error('Failed to parse JSON file: ' + (error as Error).message))
      }
    }
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    reader.readAsText(file)
  })
}
