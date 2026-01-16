import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { saveUserSettings, loadUserSettings, type UserSettings } from '../services/firestoreService'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { deleteField, doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

interface ApiKeysContextType {
  rapidApiKey: string | null
  setRapidApiKey: (key: string) => Promise<void>
  asterApiKey: string | null
  setAsterApiKey: (key: string) => Promise<void>
  asterApiSecretKey: string | null
  setAsterApiSecretKey: (key: string) => Promise<void>
  hyperliquidWalletAddress: string | null
  setHyperliquidWalletAddress: (address: string) => Promise<void>
  krakenApiKey: string | null
  setKrakenApiKey: (key: string) => Promise<void>
  krakenApiSecretKey: string | null
  setKrakenApiSecretKey: (key: string) => Promise<void>
  isLoading: boolean
}

const ApiKeysContext = createContext<ApiKeysContextType | undefined>(undefined)

interface ApiKeysProviderProps {
  children: ReactNode
}

function ApiKeysProviderInner({ children }: ApiKeysProviderProps) {
  const { uid } = useAuth()
  const [rapidApiKey, setRapidApiKeyState] = useState<string | null>(null)
  const [asterApiKey, setAsterApiKeyState] = useState<string | null>(null)
  const [asterApiSecretKey, setAsterApiSecretKeyState] = useState<string | null>(null)
  const [hyperliquidWalletAddress, setHyperliquidWalletAddressState] = useState<string | null>(null)
  const [krakenApiKey, setKrakenApiKeyState] = useState<string | null>(null)
  const [krakenApiSecretKey, setKrakenApiSecretKeyState] = useState<string | null>(null)
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
        if (settings?.apiKeys) {
          // Load RapidAPI key from settings, or fallback to env variable
          if (settings.apiKeys.rapidApiKey) {
            setRapidApiKeyState(settings.apiKeys.rapidApiKey)
          } else {
            // Fallback to environment variable if available
            const envKey = import.meta.env.VITE_RAPIDAPI_KEY
            if (envKey) {
              setRapidApiKeyState(envKey)
            } else {
              setRapidApiKeyState(null)
            }
          }
          // Load other API keys
          setAsterApiKeyState(settings.apiKeys.asterApiKey || null)
          setAsterApiSecretKeyState(settings.apiKeys.asterApiSecretKey || null)
          setHyperliquidWalletAddressState(settings.apiKeys.hyperliquidWalletAddress || null)
          setKrakenApiKeyState(settings.apiKeys.krakenApiKey || null)
          setKrakenApiSecretKeyState(settings.apiKeys.krakenApiSecretKey || null)
        } else {
          // No settings found, try environment variable for RapidAPI
          const envKey = import.meta.env.VITE_RAPIDAPI_KEY
          if (envKey) {
            setRapidApiKeyState(envKey)
          } else {
            setRapidApiKeyState(null)
          }
          // Set others to null
          setAsterApiKeyState(null)
          setAsterApiSecretKeyState(null)
          setHyperliquidWalletAddressState(null)
          setKrakenApiKeyState(null)
          setKrakenApiSecretKeyState(null)
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
      const trimmedKey = key.trim()
      const docRef = doc(db, `users/${uid}/settings/user`)
      
      if (trimmedKey) {
        // Key has value - load existing settings and update
        const existingSettings = await loadUserSettings(uid) || {}
        const updatedSettings: UserSettings = {
          ...existingSettings,
          apiKeys: {
            ...existingSettings.apiKeys,
            rapidApiKey: trimmedKey,
          },
        }
        await saveUserSettings(uid, updatedSettings)
      } else {
        // Key is empty - use updateDoc with deleteField() to remove it
        await updateDoc(docRef, {
          'apiKeys.rapidApiKey': deleteField(),
        })
      }
      
      setRapidApiKeyState(trimmedKey || null)
    } catch (error) {
      console.error('Error saving API key:', error)
      throw error
    }
  }

  // Save Aster API key to Firestore
  const setAsterApiKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      const docRef = doc(db, `users/${uid}/settings/user`)
      
      if (trimmedKey) {
        // Key has value - load existing settings and update
        const existingSettings = await loadUserSettings(uid) || {}
        const updatedSettings: UserSettings = {
          ...existingSettings,
          apiKeys: {
            ...existingSettings.apiKeys,
            asterApiKey: trimmedKey,
          },
        }
        await saveUserSettings(uid, updatedSettings)
      } else {
        // Key is empty - use updateDoc with deleteField() to remove it
        await updateDoc(docRef, {
          'apiKeys.asterApiKey': deleteField(),
        })
      }
      
      setAsterApiKeyState(trimmedKey || null)
    } catch (error) {
      console.error('Error saving API key:', error)
      throw error
    }
  }

  // Save Aster API Secret key to Firestore
  const setAsterApiSecretKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      const docRef = doc(db, `users/${uid}/settings/user`)
      
      if (trimmedKey) {
        // Key has value - load existing settings and update
        const existingSettings = await loadUserSettings(uid) || {}
        const updatedSettings: UserSettings = {
          ...existingSettings,
          apiKeys: {
            ...existingSettings.apiKeys,
            asterApiSecretKey: trimmedKey,
          },
        }
        await saveUserSettings(uid, updatedSettings)
      } else {
        // Key is empty - use updateDoc with deleteField() to remove it
        await updateDoc(docRef, {
          'apiKeys.asterApiSecretKey': deleteField(),
        })
      }
      
      setAsterApiSecretKeyState(trimmedKey || null)
    } catch (error) {
      console.error('Error saving API key:', error)
      throw error
    }
  }

  // Save Hyperliquid wallet address to Firestore
  const setHyperliquidWalletAddress = async (address: string) => {
    if (!uid) {
      console.error('Cannot save wallet address: user not authenticated')
      return
    }

    try {
      const trimmedAddress = address.trim()
      const docRef = doc(db, `users/${uid}/settings/user`)
      
      if (trimmedAddress) {
        // Address has value - load existing settings and update
        const existingSettings = await loadUserSettings(uid) || {}
        const updatedSettings: UserSettings = {
          ...existingSettings,
          apiKeys: {
            ...existingSettings.apiKeys,
            hyperliquidWalletAddress: trimmedAddress,
          },
        }
        await saveUserSettings(uid, updatedSettings)
      } else {
        // Address is empty - use updateDoc with deleteField() to remove it
        await updateDoc(docRef, {
          'apiKeys.hyperliquidWalletAddress': deleteField(),
        })
      }
      
      setHyperliquidWalletAddressState(trimmedAddress || null)
    } catch (error) {
      console.error('Error saving wallet address:', error)
      throw error
    }
  }

  // Save Kraken API key to Firestore
  const setKrakenApiKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      const docRef = doc(db, `users/${uid}/settings/user`)
      
      if (trimmedKey) {
        // Key has value - load existing settings and update
        const existingSettings = await loadUserSettings(uid) || {}
        const updatedSettings: UserSettings = {
          ...existingSettings,
          apiKeys: {
            ...existingSettings.apiKeys,
            krakenApiKey: trimmedKey,
          },
        }
        await saveUserSettings(uid, updatedSettings)
      } else {
        // Key is empty - use updateDoc with deleteField() to remove it
        await updateDoc(docRef, {
          'apiKeys.krakenApiKey': deleteField(),
        })
      }
      
      setKrakenApiKeyState(trimmedKey || null)
    } catch (error) {
      console.error('Error saving API key:', error)
      throw error
    }
  }

  // Save Kraken API Secret key to Firestore
  const setKrakenApiSecretKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      const docRef = doc(db, `users/${uid}/settings/user`)
      
      if (trimmedKey) {
        // Key has value - load existing settings and update
        const existingSettings = await loadUserSettings(uid) || {}
        const updatedSettings: UserSettings = {
          ...existingSettings,
          apiKeys: {
            ...existingSettings.apiKeys,
            krakenApiSecretKey: trimmedKey,
          },
        }
        await saveUserSettings(uid, updatedSettings)
      } else {
        // Key is empty - use updateDoc with deleteField() to remove it
        await updateDoc(docRef, {
          'apiKeys.krakenApiSecretKey': deleteField(),
        })
      }
      
      setKrakenApiSecretKeyState(trimmedKey || null)
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
        asterApiKey,
        setAsterApiKey,
        asterApiSecretKey,
        setAsterApiSecretKey,
        hyperliquidWalletAddress,
        setHyperliquidWalletAddress,
        krakenApiKey,
        setKrakenApiKey,
        krakenApiSecretKey,
        setKrakenApiSecretKey,
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

