import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { CurrencyCode } from '../lib/currency'
import { getExchangeRates, type ExchangeRates } from '../services/exchangeRateService'

interface CurrencyContextType {
  baseCurrency: CurrencyCode
  setBaseCurrency: (c: CurrencyCode) => void
  exchangeRates: ExchangeRates | null
  convert: (amount: number, from: CurrencyCode) => number
  isLoading: boolean
  error?: string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

const BASE_CURRENCY_STORAGE_KEY = 'capitalos_base_currency'

interface CurrencyProviderProps {
  children: ReactNode
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>(() => {
    // Load from localStorage on initial mount
    try {
      const stored = localStorage.getItem(BASE_CURRENCY_STORAGE_KEY)
      if (stored && (stored === 'CHF' || stored === 'EUR' || stored === 'USD')) {
        return stored as CurrencyCode
      }
    } catch (error) {
      console.warn('Failed to read base currency from localStorage:', error)
    }
    return 'CHF'
  })

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

  // Initial fetch on mount
  useEffect(() => {
    fetchRates(baseCurrency)
  }, []) // Only run on mount

  // Set base currency and refetch rates
  const setBaseCurrency = (newBase: CurrencyCode) => {
    setBaseCurrencyState(newBase)
    // Save to localStorage
    try {
      localStorage.setItem(BASE_CURRENCY_STORAGE_KEY, newBase)
    } catch (error) {
      console.warn('Failed to save base currency to localStorage:', error)
    }
    // Refetch rates
    fetchRates(newBase)
  }

  // Convert amount from one currency to base currency
  const convert = (amount: number, from: CurrencyCode): number => {
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
  }

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        setBaseCurrency,
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

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}

