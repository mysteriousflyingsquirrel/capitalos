/**
 * Masks a value when incognito mode is enabled
 * @param display - The value to display (string or number)
 * @param isIncognito - Whether incognito mode is enabled
 * @returns Masked string '****' if incognito, otherwise the original value as string
 */
export function maskValue(display: string | number, isIncognito: boolean): string {
  if (!isIncognito) {
    return typeof display === 'number' ? String(display) : display
  }
  return '****'
}

/**
 * Masks a formatted currency string when incognito mode is enabled
 * @param formattedValue - The formatted currency string (e.g., "CHF 1,234.56")
 * @param isIncognito - Whether incognito mode is enabled
 * @returns Masked string '****' if incognito, otherwise the original formatted value
 */
export function maskFormattedValue(formattedValue: string, isIncognito: boolean): string {
  if (!isIncognito) {
    return formattedValue
  }
  return '****'
}

