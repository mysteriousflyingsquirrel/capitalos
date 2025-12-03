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
import { clearAllUserData, loadUserSettings, saveUserSettings } from './firestoreService'
import { loadSnapshots, saveSnapshots, type NetWorthSnapshot } from './snapshotService'

const BACKUP_SCHEMA_VERSION = '1.0.0'

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
    settings: { baseCurrency: string } | null
    snapshots: unknown[]
  }
}


/**
 * Creates a backup object from all user data in Firestore
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
      settings: settings && settings.baseCurrency ? { baseCurrency: settings.baseCurrency } : null,
      snapshots,
    },
  }
}


/**
 * Validates a backup object structure
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
    if (typeof data.settings !== 'object' || !('baseCurrency' in data.settings)) {
      return false
    }
  }

  // snapshots is optional for backward compatibility
  if (data.snapshots !== undefined && !Array.isArray(data.snapshots)) {
    return false
  }

  return true
}

/**
 * Restores data from a backup object to Firestore
 */
export async function restoreBackup(
  backup: BackupData,
  currentUid: string,
  options: { clearExisting: boolean } = { clearExisting: true }
): Promise<void> {
  // Validate backup
  if (!validateBackup(backup)) {
    throw new Error('Invalid backup format')
  }

  if (backup.userId && backup.userId !== currentUid) {
    console.warn(
      `Backup was exported by user ${backup.userId}, but restoring to user ${currentUid}`
    )
  }

  if (options.clearExisting) {
    await clearAllUserData(currentUid)
  }

  await Promise.all([
    saveNetWorthItems(backup.data.netWorthItems as { id: string }[], currentUid),
    saveNetWorthTransactions(
      backup.data.netWorthTransactions as { id: string }[],
      currentUid
    ),
    saveCashflowInflowItems(
      backup.data.cashflowInflowItems as { id: string }[],
      currentUid
    ),
    saveCashflowOutflowItems(
      backup.data.cashflowOutflowItems as { id: string }[],
      currentUid
    ),
    saveCashflowAccountflowMappings(
      backup.data.cashflowAccountflowMappings as { id: string }[],
      currentUid
    ),
    savePlatforms((backup.data.platforms as Platform[]) || [], currentUid),
    backup.data.settings
      ? saveUserSettings(currentUid, backup.data.settings as { baseCurrency: string })
      : Promise.resolve(),
    saveSnapshots((backup.data.snapshots as NetWorthSnapshot[]) || [], currentUid),
  ])
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
 */
export async function readBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string)
        if (validateBackup(jsonData)) {
          resolve(jsonData as BackupData)
        } else {
          reject(new Error('Invalid backup file format'))
        }
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


