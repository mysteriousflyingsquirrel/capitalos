import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import type { CurrencyCode } from '../lib/currency'
import { getExchangeRates, type ExchangeRates } from '../services/exchangeRateService'
import { saveUserSettings, loadUserSettings } from '../services/firestoreService'
import { useAuth } from '../lib/dataSafety/authGateCompat'

interface CurrencyContextType {
  baseCurrency: CurrencyCode
  exchangeRates: ExchangeRates | null
  convert: (amount: number, from: CurrencyCode) => number
  isLoading: boolean
  error?: string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

interface CurrencyProviderProps {
  children: ReactNode
}

function CurrencyProviderInner({ children }: CurrencyProviderProps) {
  const { uid } = useAuth()
  // Base currency is always CHF
  const baseCurrency: CurrencyCode = 'CHF'

  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  // Fetch exchange rates
  const fetchRates = async (base: CurrencyCode) => {
    setIsLoading(true)
    setError(undefined)
    try {
      const rates = await getExchangeRates(base)
      setExchangeRates(rates)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch exchange rates'
      setError(errorMessage)
      console.error('Error fetching exchange rates:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch exchange rates on mount (always CHF)
  useEffect(() => {
    fetchRates('CHF')
  }, []) // Run once on mount

  // Convert amount from one currency to base currency
  // Memoized to prevent unnecessary re-renders in components that depend on it
  const convert = useCallback((amount: number, from: CurrencyCode): number => {
    // If from is already base currency, no conversion needed
    if (from === baseCurrency) {
      return amount
    }

    // If no exchange rates available, return amount as-is
    if (!exchangeRates || exchangeRates.base !== baseCurrency) {
      return amount
    }

    // Exchange rates are relative to baseCurrency:
    // rates[USD] = how many USD for 1 baseCurrency
    // So: 1 USD = 1 / rates[USD] baseCurrency
    // Therefore: amountInBase = amount * (1 / rates[from])
    const rate = exchangeRates.rates[from]
    if (!rate || rate === 0) {
      console.warn(`No exchange rate found for ${from}, returning original amount`)
      return amount
    }

    return amount / rate
  }, [exchangeRates, baseCurrency])

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        exchangeRates,
        convert,
        isLoading,
        error,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  return <CurrencyProviderInner>{children}</CurrencyProviderInner>
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}

