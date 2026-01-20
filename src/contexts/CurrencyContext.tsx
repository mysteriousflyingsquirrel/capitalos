import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef, ReactNode } from 'react'
import type { CurrencyCode } from '../lib/currency'
import { getExchangeRates, type ExchangeRates } from '../services/exchangeRateService'
import { loadUserSettings, saveBaseCurrency } from '../lib/dataSafety/userSettingsRepo'
import { useAuth } from '../lib/dataSafety/authGateCompat'

interface CurrencyContextType {
  baseCurrency: CurrencyCode
  exchangeRates: ExchangeRates | null
  convert: (amount: number, from: CurrencyCode) => number
  setBaseCurrency: (currency: CurrencyCode) => Promise<void>
  isLoading: boolean
  error?: string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

interface CurrencyProviderProps {
  children: ReactNode
}

function CurrencyProviderInner({ children }: CurrencyProviderProps) {
  const { uid } = useAuth()
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>('CHF')
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  
  // Ref to store baseCurrency persistently (survives remounts)
  const baseCurrencyRef = useRef<CurrencyCode>('CHF')
  
  // Track previous uid to detect uid changes
  const prevUidRef = useRef<string | null>(null)

  // Auth boundary reset: Clear all state synchronously when uid changes
  useLayoutEffect(() => {
    if (prevUidRef.current !== uid) {
      const prevUid = prevUidRef.current
      prevUidRef.current = uid
      
      // Reset to default
      baseCurrencyRef.current = 'CHF'
      setBaseCurrencyState('CHF')
      // NOTE: exchange rates are not user-specific. Do not clear them on uid changes,
      // otherwise a uid change where baseCurrency stays the same (e.g. CHF->CHF) can
      // leave exchangeRates null because the fetch effect is keyed only on baseCurrency.
      setIsLoading(true)
      setError(undefined)
      
      if (import.meta.env.DEV) {
        console.log('[CurrencyContext] Auth boundary reset:', {
          prevUid,
          newUid: uid,
          resetToDefault: 'CHF',
        })
      }
    }
  }, [uid])

  // Load baseCurrency from Firestore using UserSettingsRepository
  useEffect(() => {
    const loadBaseCurrency = async () => {
      if (!uid) {
        // No uid, use default
        baseCurrencyRef.current = 'CHF'
        setBaseCurrencyState('CHF')
        setIsLoading(false)
        return
      }

      if (import.meta.env.DEV) {
        console.log('[CurrencyContext] Loading baseCurrency:', {
          uid,
          path: `users/${uid}/settings/user`,
        })
      }

      try {
        const settings = await loadUserSettings(uid)
        
        if (import.meta.env.DEV) {
          console.log('[CurrencyContext] Settings loaded:', {
            hasSettings: !!settings,
            baseCurrency: settings?.baseCurrency || 'CHF (default)',
          })
        }
        
        // Use Firestore value or default to CHF
        const currency = (settings?.baseCurrency || 'CHF') as CurrencyCode

        if (import.meta.env.DEV) {
          console.log('[CurrencyContext] Applying baseCurrency:', {
            uid,
            rawFromFirestore: settings?.baseCurrency,
            applied: currency,
          })
        }
        
        baseCurrencyRef.current = currency
        setBaseCurrencyState(currency)
      } catch (error) {
        console.error('[CurrencyContext] Error loading baseCurrency:', error)
        // On error, use default
        baseCurrencyRef.current = 'CHF'
        setBaseCurrencyState('CHF')
      } finally {
        setIsLoading(false)
      }
    }

    loadBaseCurrency()
  }, [uid])

  // Fetch exchange rates when baseCurrency changes
  useEffect(() => {
    const fetchRates = async (base: CurrencyCode) => {
      setIsLoading(true)
      setError(undefined)
      try {
        if (import.meta.env.DEV) {
          console.log('[CurrencyContext] Fetching exchange rates:', { base, uid })
        }
        const rates = await getExchangeRates(base)
        setExchangeRates(rates)
        if (import.meta.env.DEV) {
          console.log('[CurrencyContext] Exchange rates applied:', {
            requestedBase: base,
            returnedBase: rates.base,
            fetchedAt: rates.fetchedAt,
            rates,
          })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch exchange rates'
        setError(errorMessage)
        console.error('[CurrencyContext] Error fetching exchange rates:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (baseCurrency) {
      fetchRates(baseCurrency)
    }
  }, [baseCurrency])

  // Set base currency (updates Firestore and local state)
  const setBaseCurrency = async (currency: CurrencyCode) => {
    if (!uid) {
      console.error('Cannot save baseCurrency: user not authenticated')
      return
    }

    try {
      // Update Firestore using repository
      await saveBaseCurrency(uid, currency)
      
      // Update local state immediately (optimistic update)
      baseCurrencyRef.current = currency
      setBaseCurrencyState(currency)
      
      if (import.meta.env.DEV) {
        console.log('[CurrencyContext] baseCurrency updated:', {
          uid,
          currency,
        })
      }
    } catch (error) {
      console.error('[CurrencyContext] Error saving baseCurrency:', error)
      throw error
    }
  }

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
        setBaseCurrency,
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
