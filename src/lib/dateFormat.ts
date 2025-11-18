/**
 * Formats a date string (YYYY-MM-DD) to DD/MM/YYYY format
 * @param dateString - Date string in YYYY-MM-DD format (ISO date string)
 * @returns Formatted date string in DD/MM/YYYY format
 */
export function formatDate(dateString: string): string {
  if (!dateString) return ''
  
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      // If invalid date, try parsing as YYYY-MM-DD directly
      const parts = dateString.split('-')
      if (parts.length === 3) {
        const [year, month, day] = parts
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
      }
      return dateString // Return as-is if can't parse
    }
    
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    
    return `${day}/${month}/${year}`
  } catch (error) {
    // Fallback: try to parse as YYYY-MM-DD directly
    const parts = dateString.split('-')
    if (parts.length === 3) {
      const [year, month, day] = parts
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
    }
    return dateString
  }
}

