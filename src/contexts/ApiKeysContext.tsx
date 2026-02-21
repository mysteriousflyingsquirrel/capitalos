import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, ReactNode } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { deleteField } from 'firebase/firestore'
import { 
  loadUserSettings, 
  saveApiKeys, 
  type ApiKeys 
} from '../lib/dataSafety/userSettingsRepo'

// Refs to store keys persistently (survive remounts)
interface ApiKeysRefs {
  twelveDataApiKey: string | null
  hyperliquidWalletAddress: string | null
  mexcApiKey: string | null
  mexcSecretKey: string | null
}

interface ApiKeysContextType {
  twelveDataApiKey: string | null
  setTwelveDataApiKey: (key: string) => Promise<void>
  hyperliquidWalletAddress: string | null
  setHyperliquidWalletAddress: (address: string) => Promise<void>
  mexcApiKey: string | null
  setMexcApiKey: (key: string) => Promise<void>
  mexcSecretKey: string | null
  setMexcSecretKey: (key: string) => Promise<void>
  isLoading: boolean
  apiKeysLoaded: boolean
  // Get current keys from ref (always available, even if state resets)
  getCurrentKeys: () => ApiKeysRefs
  // Check if API keys are loaded (from ref, not state - for use in async functions)
  isApiKeysLoaded: () => boolean
}

const ApiKeysContext = createContext<ApiKeysContextType | undefined>(undefined)

interface ApiKeysProviderProps {
  children: ReactNode
}

function ApiKeysProviderInner({ children }: ApiKeysProviderProps) {
  const { uid } = useAuth()
  const [twelveDataApiKey, setTwelveDataApiKeyState] = useState<string | null>(null)
  const [hyperliquidWalletAddress, setHyperliquidWalletAddressState] = useState<string | null>(null)
  const [mexcApiKey, setMexcApiKeyState] = useState<string | null>(null)
  const [mexcSecretKey, setMexcSecretKeyState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false)
  
  // Refs to store keys persistently (survive remounts) - ALWAYS available
  const keysRef = useRef<ApiKeysRefs>({
    twelveDataApiKey: null,
    hyperliquidWalletAddress: null,
    mexcApiKey: null,
    mexcSecretKey: null,
  })
  
  // Track previous uid to detect uid changes
  const prevUidRef = useRef<string | null>(null)
  // Track if keys have ever been successfully loaded for the current uid
  const keysLoadedForUidRef = useRef<string | null>(null)
  // Ref to track apiKeysLoaded (for use in async functions that can't rely on state)
  const apiKeysLoadedRef = useRef(false)
  
  // Helper to update both state and ref
  const updateKeys = (updates: Partial<ApiKeysRefs>) => {
    // Update ref (persistent, always available)
    keysRef.current = { ...keysRef.current, ...updates }
    // Update state (for reactivity)
    if (updates.twelveDataApiKey !== undefined) setTwelveDataApiKeyState(updates.twelveDataApiKey)
    if (updates.hyperliquidWalletAddress !== undefined) setHyperliquidWalletAddressState(updates.hyperliquidWalletAddress)
    if (updates.mexcApiKey !== undefined) setMexcApiKeyState(updates.mexcApiKey)
    if (updates.mexcSecretKey !== undefined) setMexcSecretKeyState(updates.mexcSecretKey)
  }

  // Auth boundary reset: Clear all state synchronously when uid changes
  useLayoutEffect(() => {
    if (prevUidRef.current !== uid) {
      const prevUid = prevUidRef.current
      prevUidRef.current = uid
      
      // Clear all in-memory state
      updateKeys({
        twelveDataApiKey: null,
        hyperliquidWalletAddress: null,
        mexcApiKey: null,
        mexcSecretKey: null,
      })
      
      // Reset loaded flags
      setApiKeysLoaded(false)
      apiKeysLoadedRef.current = false
      setIsLoading(true)
      keysLoadedForUidRef.current = null
      
      if (import.meta.env.DEV) {
        console.log('[ApiKeysContext] Auth boundary reset:', {
          prevUid,
          newUid: uid,
          cleared: true,
        })
      }
    }
  }, [uid])

  // Load API keys from Firestore using UserSettingsRepository
  useEffect(() => {
    const loadApiKeys = async () => {
      if (!uid) {
        setIsLoading(false)
        // Mark as loaded even if no UID (to unblock DataContext)
        setApiKeysLoaded(true)
        apiKeysLoadedRef.current = true
        return
      }
      
      // Check if we've already loaded keys for this uid
      const haveLoadedForThisUid = keysLoadedForUidRef.current === uid
      
      if (import.meta.env.DEV) {
        console.log('[ApiKeysContext] Loading API keys:', {
          uid,
          haveLoadedForThisUid,
          path: `users/${uid}/settings/user`,
        })
      }

      try {
        const settings = await loadUserSettings(uid)
        
        if (import.meta.env.DEV) {
          console.log('[ApiKeysContext] Settings loaded:', {
            hasSettings: !!settings,
            hasApiKeys: !!settings?.apiKeys,
            apiKeysKeys: settings?.apiKeys ? Object.keys(settings.apiKeys) : [],
            hasHyperliquidKey: !!settings?.apiKeys?.hyperliquidWalletAddress,
          })
        }
        
        if (settings?.apiKeys) {
          const tdKey = settings.apiKeys.twelveDataApiKey || import.meta.env.VITE_TWELVE_DATA_API_KEY || null
          
          // Update both ref and state (ref persists, state is reactive)
          updateKeys({
            twelveDataApiKey: tdKey,
            hyperliquidWalletAddress: settings.apiKeys.hyperliquidWalletAddress || null,
            mexcApiKey: settings.apiKeys.mexcApiKey || null,
            mexcSecretKey: settings.apiKeys.mexcSecretKey || null,
          })
        } else {
          const envKey = import.meta.env.VITE_TWELVE_DATA_API_KEY || null
          
          // Update both ref and state
          updateKeys({
            twelveDataApiKey: envKey,
            hyperliquidWalletAddress: null,
            mexcApiKey: null,
            mexcSecretKey: null,
          })
        }
      } catch (error) {
        console.error('[ApiKeysContext] Error loading API keys:', error)
        // On error, still mark as loaded (to unblock DataContext)
        // Keys will be null, which is acceptable
      } finally {
        setIsLoading(false)
        // Mark keys as loaded after Firestore read completes (even if no keys found)
        setApiKeysLoaded(true)
        apiKeysLoadedRef.current = true
        // Track that keys were loaded for this uid
        keysLoadedForUidRef.current = uid
        
        if (import.meta.env.DEV) {
          console.log('[ApiKeysContext] API keys loading complete:', {
            uid,
            apiKeysLoaded: true,
            hasHyperliquidKey: !!keysRef.current.hyperliquidWalletAddress,
          })
        }
      }
    }

    loadApiKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]) // Only depend on uid - apiKeysLoaded is managed internally

  const setTwelveDataApiKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      
      if (trimmedKey) {
        await saveApiKeys(uid, { twelveDataApiKey: trimmedKey })
      } else {
        await saveApiKeys(uid, { twelveDataApiKey: deleteField() })
      }
      
      updateKeys({ twelveDataApiKey: trimmedKey || null })
    } catch (error) {
      console.error('[ApiKeysContext] Error saving API key:', error)
      throw error
    }
  }

  // Save Hyperliquid wallet address using UserSettingsRepository
  const setHyperliquidWalletAddress = async (address: string) => {
    if (!uid) {
      console.error('Cannot save wallet address: user not authenticated')
      return
    }

    try {
      const trimmedAddress = address.trim()
      
      if (trimmedAddress) {
        await saveApiKeys(uid, { hyperliquidWalletAddress: trimmedAddress })
      } else {
        await saveApiKeys(uid, { hyperliquidWalletAddress: deleteField() })
      }
      
      updateKeys({ hyperliquidWalletAddress: trimmedAddress || null })
    } catch (error) {
      console.error('[ApiKeysContext] Error saving wallet address:', error)
      throw error
    }
  }

  // Save MEXC API key using UserSettingsRepository
  const setMexcApiKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      
      if (trimmedKey) {
        await saveApiKeys(uid, { mexcApiKey: trimmedKey })
      } else {
        await saveApiKeys(uid, { mexcApiKey: deleteField() })
      }
      
      updateKeys({ mexcApiKey: trimmedKey || null })
    } catch (error) {
      console.error('[ApiKeysContext] Error saving API key:', error)
      throw error
    }
  }

  // Save MEXC API Secret key using UserSettingsRepository
  const setMexcSecretKey = async (key: string) => {
    if (!uid) {
      console.error('Cannot save API key: user not authenticated')
      return
    }

    try {
      const trimmedKey = key.trim()
      
      if (trimmedKey) {
        await saveApiKeys(uid, { mexcSecretKey: trimmedKey })
      } else {
        await saveApiKeys(uid, { mexcSecretKey: deleteField() })
      }
      
      updateKeys({ mexcSecretKey: trimmedKey || null })
    } catch (error) {
      console.error('[ApiKeysContext] Error saving API key:', error)
      throw error
    }
  }

  // Get current keys from ref (always available, even if state resets)
  const getCurrentKeys = () => keysRef.current
  
  // Check if API keys are loaded from ref (for use in async functions)
  const isApiKeysLoaded = () => apiKeysLoadedRef.current

  return (
    <ApiKeysContext.Provider
      value={{
        twelveDataApiKey,
        setTwelveDataApiKey,
        hyperliquidWalletAddress,
        setHyperliquidWalletAddress,
        mexcApiKey,
        setMexcApiKey,
        mexcSecretKey,
        setMexcSecretKey,
        isLoading,
        apiKeysLoaded,
        getCurrentKeys,
        isApiKeysLoaded,
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
