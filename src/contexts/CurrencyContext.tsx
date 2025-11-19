import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { CurrencyCode } from '../lib/currency'
import { getExchangeRates, type ExchangeRates } from '../services/exchangeRateService'
import { saveUserSettings, loadUserSettings } from '../services/firestoreService'
import { useAuth } from './AuthContext'

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

function CurrencyProviderInner({ children }: CurrencyProviderProps) {
  const { uid } = useAuth()
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>(() => {
    // Load from localStorage on initial mount (fallback)
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

  // Load settings from Firestore when uid is available
  useEffect(() => {
    if (uid) {
      loadUserSettings(uid)
        .then((settings) => {
          if (settings && (settings.baseCurrency === 'CHF' || settings.baseCurrency === 'EUR' || settings.baseCurrency === 'USD')) {
            setBaseCurrencyState(settings.baseCurrency as CurrencyCode)
            fetchRates(settings.baseCurrency as CurrencyCode)
          } else {
            // No settings in Firestore, fetch rates with current currency
            fetchRates(baseCurrency)
          }
        })
        .catch((error) => {
          console.error('Failed to load settings from Firestore:', error)
          fetchRates(baseCurrency)
        })
    } else {
      // No user, just fetch rates with current currency
      fetchRates(baseCurrency)
    }
  }, [uid]) // Run when uid changes

  // Set base currency and refetch rates
  const setBaseCurrency = async (newBase: CurrencyCode) => {
    setBaseCurrencyState(newBase)
    // Save to localStorage (backup)
    try {
      localStorage.setItem(BASE_CURRENCY_STORAGE_KEY, newBase)
    } catch (error) {
      console.warn('Failed to save base currency to localStorage:', error)
    }
    // Save to Firestore immediately
    if (uid) {
      try {
        await saveUserSettings(uid, { baseCurrency: newBase })
      } catch (error) {
        console.error('Failed to save base currency to Firestore:', error)
      }
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

