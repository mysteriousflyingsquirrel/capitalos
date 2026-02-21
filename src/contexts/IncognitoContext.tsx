import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface IncognitoContextType {
  isIncognito: boolean
  setIncognito: (value: boolean) => void
  toggleIncognito: () => void
  pendingExitIncognito: boolean
  requestExitIncognito: () => void
  confirmExitIncognito: () => void
  cancelExitIncognito: () => void
}

const IncognitoContext = createContext<IncognitoContextType | undefined>(undefined)

const INCOGNITO_STORAGE_KEY = 'capitalos_incognito_v1'

interface IncognitoProviderProps {
  children: ReactNode
}

export function IncognitoProvider({ children }: IncognitoProviderProps) {
  const [isIncognito, setIsIncognitoState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(INCOGNITO_STORAGE_KEY)
      if (stored === 'true') {
        return true
      }
      if (stored === 'false') {
        return false
      }
    } catch (error) {
      console.warn('Failed to read incognito state from localStorage:', error)
    }
    return false
  })

  const [pendingExitIncognito, setPendingExitIncognito] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(INCOGNITO_STORAGE_KEY, String(isIncognito))
    } catch (error) {
      console.warn('Failed to save incognito state to localStorage:', error)
    }
  }, [isIncognito])

  const setIncognito = (value: boolean) => {
    setIsIncognitoState(value)
  }

  const toggleIncognito = () => {
    setIsIncognitoState(prev => !prev)
  }

  const requestExitIncognito = useCallback(() => {
    setPendingExitIncognito(true)
  }, [])

  const confirmExitIncognito = useCallback(() => {
    setPendingExitIncognito(false)
    setIsIncognitoState(false)
  }, [])

  const cancelExitIncognito = useCallback(() => {
    setPendingExitIncognito(false)
  }, [])

  return (
    <IncognitoContext.Provider
      value={{
        isIncognito,
        setIncognito,
        toggleIncognito,
        pendingExitIncognito,
        requestExitIncognito,
        confirmExitIncognito,
        cancelExitIncognito,
      }}
    >
      {children}
    </IncognitoContext.Provider>
  )
}

export function useIncognito() {
  const context = useContext(IncognitoContext)
  if (context === undefined) {
    throw new Error('useIncognito must be used within an IncognitoProvider')
  }
  return context
}

