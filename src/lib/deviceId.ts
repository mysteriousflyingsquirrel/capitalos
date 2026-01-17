/**
 * Device ID Management
 * 
 * Provides a stable device identifier that persists across sessions.
 * Used for conflict detection in multi-device scenarios.
 */

const DEVICE_ID_KEY = 'capitalos_device_id'

/**
 * Gets or creates a stable device ID
 * 
 * If localStorage has capitalos_device_id, use it
 * Else generate UUID and store it
 * 
 * @returns Stable device ID string
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) {
      return existing
    }

    // Generate UUID v4
    const uuid = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, uuid)
    return uuid
  } catch (error) {
    // Fallback if localStorage is unavailable
    console.warn('[DeviceId] Failed to access localStorage, using session-based ID:', error)
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}

/**
 * Generates a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Clears the device ID (for testing or reset)
 */
export function clearDeviceId(): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY)
  } catch (error) {
    console.warn('[DeviceId] Failed to clear device ID:', error)
  }
}

