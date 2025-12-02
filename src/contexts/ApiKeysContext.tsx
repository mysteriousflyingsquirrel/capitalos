import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { saveUserSettings, loadUserSettings, type UserSettings } from '../services/firestoreService'
import { useAuth } from './AuthContext'

interface ApiKeysContextType {
  rapidApiKey: string | null
  setRapidApiKey: (key: string) => Promise<void>
  isLoading: boolean
}

const ApiKeysContext = createContext<ApiKeysContextType | undefined>(undefined)

interface ApiKeysProviderProps {
  children: ReactNode
}

function ApiKeysProviderInner({ children }: ApiKeysProviderProps) {
  const { uid } = useAuth()
  const [rapidApiKey, setRapidApiKeyState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load API keys from Firestore on mount
  useEffect(() => {
    const loadApiKeys = async () => {
      if (!uid) {
        setIsLoading(false)
        return
      }

      try {
        const settings = await loadUserSettings(uid)
        if (settings?.apiKeys?.rapidApiKey) {
          setRapidApiKeyState(settings.apiKeys.rapidApiKey)
        } else {
          // Fallback to environment variable if available
          const envKey = import.meta.env.VITE_RAPIDAPI_KEY
          if (envKey) {
            setRapidApiKeyState(envKey)
          }
        }
      } catch (error) {
        console.error('Error loading API keys:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadApiKeys()
  }, [uid])

  // Save RapidAPI key to Firestore
  const setRapidApiKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      // Load existing settings to preserve other settings
      const existingSettings = await loadUserSettings(uid) || {}
      
      // Update API keys
      const updatedSettings: UserSettings = {
        ...existingSettings,
        apiKeys: {
          ...existingSettings.apiKeys,
          rapidApiKey: key.trim() || undefined,
        },
      }

      await saveUserSettings(uid, updatedSettings)
      setRapidApiKeyState(key.trim() || null)
    } catch (error) {
      console.error('Error saving API key:', error)
      throw error
    }
  }

  return (
    <ApiKeysContext.Provider
      value={{
        rapidApiKey,
        setRapidApiKey,
        isLoading,
      }}
    >
      {children}
    </ApiKeysContext.Provider>
  )
}

export function ApiKeysProvider({ children }: ApiKeysProviderProps) {
  return <ApiKeysProviderInner>{children}</ApiKeysProviderInner>
}

export function useApiKeys() {
  const context = useContext(ApiKeysContext)
  if (context === undefined) {
    throw new Error('useApiKeys must be used within an ApiKeysProvider')
  }
  return context
}

