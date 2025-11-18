export type CurrencyCode = 'CHF' | 'EUR' | 'USD'

export const supportedCurrencies: CurrencyCode[] = ['CHF', 'EUR', 'USD']

// Format money with currency symbol
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  numberFormat: 'ch' | 'us' | 'de' = 'ch'
): string {
  const localeMap: Record<typeof numberFormat, string> = {
    ch: 'de-CH',
    us: 'en-US',
    de: 'de-DE',
  }

  const locale = localeMap[numberFormat]

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

// Format money with CHF-style formatting (for backward compatibility)
export function formatChf(amount: number): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
  }).format(amount)
}

