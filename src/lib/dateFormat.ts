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

/**
 * Converts a date from DD/MM/YYYY format to YYYY-MM-DD format (for storage)
 * @param dateString - Date string in DD/MM/YYYY format
 * @returns Date string in YYYY-MM-DD format, or empty string if invalid
 */
export function parseDateInput(dateString: string): string {
  if (!dateString) return ''
  
  // If already in YYYY-MM-DD format, return as-is
  if (dateString.includes('-') && dateString.split('-').length === 3) {
    const parts = dateString.split('-')
    if (parts.length === 3) {
      const [year, month, day] = parts
      const yearNum = parseInt(year, 10)
      const monthNum = parseInt(month, 10)
      const dayNum = parseInt(day, 10)
      // Validate it's a valid date
      if (!isNaN(yearNum) && !isNaN(monthNum) && !isNaN(dayNum)) {
        const date = new Date(yearNum, monthNum - 1, dayNum)
        if (date.getFullYear() === yearNum && date.getMonth() === monthNum - 1 && date.getDate() === dayNum) {
          return dateString
        }
      }
    }
  }
  
  // Try parsing as DD/MM/YYYY
  const parts = dateString.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    // Validate and pad
    const dayNum = parseInt(day, 10)
    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)
    
    if (!isNaN(dayNum) && !isNaN(monthNum) && !isNaN(yearNum)) {
      // Validate ranges
      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
        // Validate it's a valid date (e.g., not 31/02/2024)
        const date = new Date(yearNum, monthNum - 1, dayNum)
        if (date.getFullYear() === yearNum && date.getMonth() === monthNum - 1 && date.getDate() === dayNum) {
          return `${yearNum}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`
        }
      }
    }
  }
  
  return '' // Return empty string if invalid
}

/**
 * Converts a date from YYYY-MM-DD format to DD/MM/YYYY format (for display in inputs)
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date string in DD/MM/YYYY format
 */
export function formatDateInput(dateString: string): string {
  if (!dateString) return ''
  
  // If already in DD/MM/YYYY format, return as-is
  if (dateString.includes('/') && dateString.split('/').length === 3) {
    return dateString
  }
  
  // Parse YYYY-MM-DD format
  const parts = dateString.split('-')
  if (parts.length === 3) {
    const [year, month, day] = parts
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`
  }
  
  return dateString
}

/**
 * Gets current date in DD/MM/YYYY format
 * @returns Current date string in DD/MM/YYYY format
 */
export function getCurrentDateFormatted(): string {
  const now = new Date()
  const day = now.getDate().toString().padStart(2, '0')
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const year = now.getFullYear()
  return `${day}/${month}/${year}`
}

