import {
  saveDocuments,
  loadDocuments,
  type Platform,
} from './firestoreService'
import { loadPlatforms } from './storageService'

export interface ForecastEntry {
  id: string
  platformId: string
  type: 'inflow' | 'outflow'
  date: string // ISO date string (YYYY-MM-DD)
  title: string
  amount: number // Absolute value (positive)
  createdAt?: string
  updatedAt?: string
}

/**
 * Save forecast entries to Firestore
 */
export async function saveForecastEntries(
  uid: string,
  entries: ForecastEntry[]
): Promise<void> {
  await saveDocuments(uid, 'forecastEntries', entries)
}

/**
 * Load forecast entries from Firestore
 */
export async function loadForecastEntries(
  uid: string
): Promise<ForecastEntry[]> {
  return loadDocuments<ForecastEntry>(uid, 'forecastEntries')
}

/**
 * Get forecast entries for a specific platform
 */
export async function getForecastEntriesForPlatform(
  uid: string,
  platformId: string
): Promise<ForecastEntry[]> {
  const allEntries = await loadForecastEntries(uid)
  return allEntries.filter(entry => entry.platformId === platformId)
}
