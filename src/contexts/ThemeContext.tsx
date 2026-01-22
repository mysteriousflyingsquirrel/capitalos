import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { applyTheme, getThemeById, type Theme, type ThemeId } from '../lib/themes'
import { loadUserSettings, saveThemeId } from '../lib/dataSafety/userSettingsRepo'

interface ThemeContextType {
  themeId: ThemeId
  theme: Theme
  isLoading: boolean
  error?: string
  setThemeId: (themeId: ThemeId) => Promise<void>
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
}

function ThemeProviderInner({ children }: ThemeProviderProps) {
  const { uid } = useAuth()
  const [themeId, setThemeIdState] = useState<ThemeId>('galaxy')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  // Persist across remounts + avoid stale closures during optimistic updates
  const themeIdRef = useRef<ThemeId>('galaxy')
  const prevUidRef = useRef<string | null>(null)

  const setThemeIdLocal = (next: ThemeId) => {
    themeIdRef.current = next
    setThemeIdState(next)
    applyTheme(getThemeById(next))
  }

  // Auth boundary reset: default to galaxy immediately to avoid flicker/invalid state
  useLayoutEffect(() => {
    if (prevUidRef.current !== uid) {
      prevUidRef.current = uid
      setError(undefined)
      setIsLoading(true)
      setThemeIdLocal('galaxy')
    }
  }, [uid])

  // Load themeId from Firestore on uid change
  useEffect(() => {
    const loadTheme = async () => {
      if (!uid) {
        setIsLoading(false)
        return
      }

      try {
        const settings = await loadUserSettings(uid)
        const requestedThemeId = settings?.themeId || 'galaxy'
        const loadedTheme = getThemeById(requestedThemeId)
        setThemeIdLocal(loadedTheme.id)

        // If missing, write back once so it becomes explicit
        if (!settings?.themeId) {
          await saveThemeId(uid, 'galaxy')
        }

        // If stored themeId is no longer supported (e.g. removed themes),
        // migrate it to the resolved fallback once to keep Settings consistent.
        if (settings?.themeId && loadedTheme.id !== requestedThemeId) {
          await saveThemeId(uid, loadedTheme.id)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load theme'
        setError(message)
        // keep default galaxy
      } finally {
        setIsLoading(false)
      }
    }

    loadTheme()
  }, [uid])

  const setThemeId = async (nextThemeId: ThemeId) => {
    if (!uid) {
      throw new Error('Cannot save theme: user not authenticated')
    }

    const prev = themeIdRef.current
    // Optimistic apply
    setThemeIdLocal(nextThemeId)
    setError(undefined)

    try {
      await saveThemeId(uid, nextThemeId)
    } catch (err) {
      // Revert on failure
      setThemeIdLocal(prev)
      const message = err instanceof Error ? err.message : 'Failed to save theme'
      setError(message)
      throw err
    }
  }

  const theme = getThemeById(themeId)

  return (
    <ThemeContext.Provider value={{ themeId, theme, isLoading, error, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return <ThemeProviderInner>{children}</ThemeProviderInner>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}


