import {
  loadDocuments,
} from './firestoreService'

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

export async function loadForecastEntries(
  uid: string
): Promise<ForecastEntry[]> {
  if (!uid) throw new Error('loadForecastEntries: uid is required')
  return loadDocuments<ForecastEntry>(uid, 'forecastEntries')
}

export async function getForecastEntriesForPlatform(
  uid: string,
  platformId: string
): Promise<ForecastEntry[]> {
  if (!uid) throw new Error('getForecastEntriesForPlatform: uid is required')
  if (!platformId) throw new Error('getForecastEntriesForPlatform: platformId is required')
  const allEntries = await loadForecastEntries(uid)
  return allEntries.filter(entry => entry.platformId === platformId)
}
