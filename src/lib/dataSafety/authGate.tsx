import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { 
  User, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth'
import { auth, googleProvider } from '../../config/firebase'
import { isIosSafari } from '../../utils/browserDetection'
import { ensureUserInitialized } from './userInitialization'
import { performUserContextSwap } from './userContextSwap'
import { SyncStatusProvider, useSyncStatus } from './syncStatus'
import { isQuotaError } from './quotaDetection'

export enum AuthGateState {
  AUTH_LOADING = 'AUTH_LOADING',
  SIGNED_OUT = 'SIGNED_OUT',
  INITIALIZING_USER = 'INITIALIZING_USER',
  SUBSCRIBING = 'SUBSCRIBING',
  READY = 'READY',
  ERROR_QUOTA_EXCEEDED = 'ERROR_QUOTA_EXCEEDED',
  ERROR_FATAL = 'ERROR_FATAL',
}

interface AuthGateContextType {
  state: AuthGateState
  user: User | null
  uid: string | null
  email: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  error: Error | null
  retry: () => Promise<void>
}

const AuthGateContext = createContext<AuthGateContextType | undefined>(undefined)

interface AuthGateProviderProps {
  children: ReactNode
}

// In-flight latch to prevent duplicate initialization
let initializationInFlight: string | null = null

function AuthGateProviderInner({ children }: AuthGateProviderProps) {
  const [state, setState] = useState<AuthGateState>(AuthGateState.AUTH_LOADING)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const prevUidRef = useRef<string | null>(null)
  const initWatchdogRef = useRef<NodeJS.Timeout | null>(null)
  
  // Get sync status hooks - must be called unconditionally
  const { setQuotaExceeded, setOnline } = useSyncStatus()

  // Hard user context swap on auth change
  const handleUserChange = async (newUser: User | null) => {
    const nextUid = newUser?.uid || null
    const prevUid = prevUidRef.current

    // If UID changed, perform hard swap
    if (prevUid !== nextUid) {
      console.log('[AuthGate] User change detected:', { prevUid, nextUid })
      
      // Perform complete user context swap
      if (prevUid) {
        console.log('[AuthGate] Performing user context swap')
        await performUserContextSwap(prevUid, nextUid)
      }

      prevUidRef.current = nextUid
    }

    if (!newUser) {
      setUser(null)
      setState(AuthGateState.SIGNED_OUT)
      setError(null)
      return
    }

    // New user - initialize
    setUser(newUser)
    setState(AuthGateState.INITIALIZING_USER)
    setError(null)

    // Clear any existing watchdog
    if (initWatchdogRef.current) {
      clearTimeout(initWatchdogRef.current)
    }

    // Set watchdog for initialization timeout
    initWatchdogRef.current = setTimeout(() => {
      if (state === AuthGateState.INITIALIZING_USER || state === AuthGateState.SUBSCRIBING) {
        console.error('[AuthGate] Initialization timeout (>15s)')
        setError(new Error('Initialization timeout: Having trouble connecting to Firebase'))
        setState(AuthGateState.ERROR_FATAL)
      }
    }, 15000)

    try {
      // Prevent duplicate initialization
      if (initializationInFlight === newUser.uid) {
        console.log('[AuthGate] Initialization already in flight for', newUser.uid)
        return
      }
      initializationInFlight = newUser.uid

      // Initialize user (idempotent, minimal writes)
      await ensureUserInitialized(newUser.uid)
      
      // Clear watchdog on success
      if (initWatchdogRef.current) {
        clearTimeout(initWatchdogRef.current)
        initWatchdogRef.current = null
      }

      // Move to subscribing state
      setState(AuthGateState.SUBSCRIBING)
      
      // Note: Actual subscriptions will be set up by DataContext/other contexts
      // For now, we just mark as ready after a brief delay
      // In a real implementation, this would wait for first snapshot
      setTimeout(() => {
        if (prevUidRef.current === newUser.uid) {
          setState(AuthGateState.READY)
          initializationInFlight = null
        }
      }, 100)

    } catch (err) {
      initializationInFlight = null
      
      if (initWatchdogRef.current) {
        clearTimeout(initWatchdogRef.current)
        initWatchdogRef.current = null
      }

      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[AuthGate] User initialization failed:', error)

      // Check for quota errors
      if (isQuotaError(err)) {
        setQuotaExceeded(true)
        setState(AuthGateState.ERROR_QUOTA_EXCEEDED)
      } else {
        setState(AuthGateState.ERROR_FATAL)
      }
      
      setError(error)
    }
  }

  // Bootstrap: single source of truth for auth state
  useEffect(() => {
    let isMounted = true
    let unsubscribe: (() => void) | null = null

    const bootstrap = async () => {
      try {
        // Check for redirect result first (Safari/iOS)
        const redirectResult = await getRedirectResult(auth)
        
        if (!isMounted) return

        if (redirectResult?.user) {
          console.log('[AuthGate] Redirect result received:', redirectResult.user.email)
          await handleUserChange(redirectResult.user)
        } else {
          // No redirect, set up auth state listener
          // The listener will fire immediately with current auth state
          unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!isMounted) return
            console.log('[AuthGate] Auth state changed:', user ? user.email : 'signed out')
            await handleUserChange(user)
          })
        }
      } catch (err) {
        if (!isMounted) return
        console.error('[AuthGate] Bootstrap error:', err)
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        
        // Still set up listener for future auth changes
        // This will also fire immediately with current state
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return
          console.log('[AuthGate] Auth state changed (after error):', user ? user.email : 'signed out')
          await handleUserChange(user)
        })
      }
    }

    // Set a timeout to ensure we don't stay in AUTH_LOADING forever
    const timeout = setTimeout(() => {
      if (isMounted && state === AuthGateState.AUTH_LOADING) {
        console.warn('[AuthGate] Bootstrap timeout, setting up auth listener anyway')
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return
          console.log('[AuthGate] Auth state changed (timeout fallback):', user ? user.email : 'signed out')
          await handleUserChange(user)
        })
      }
    }, 3000) // 3 second timeout

    bootstrap().catch((err) => {
      console.error('[AuthGate] Bootstrap promise rejection:', err)
      if (isMounted) {
        // Ensure we set up the listener even if bootstrap fails
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return
          await handleUserChange(user)
        })
      }
    })

    return () => {
      isMounted = false
      clearTimeout(timeout)
      if (unsubscribe) {
        unsubscribe()
      }
      if (initWatchdogRef.current) {
        clearTimeout(initWatchdogRef.current)
      }
    }
  }, [])

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
    }
    const handleOffline = () => {
      setOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Set initial state
    setOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline])

  const signInWithGoogle = async () => {
    try {
      setError(null)
      if (isIosSafari()) {
        await signInWithRedirect(auth, googleProvider)
      } else {
        await signInWithPopup(auth, googleProvider)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[AuthGate] Sign in error:', error)
      setError(error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      const currentUid = prevUidRef.current
      
      // Perform complete user context swap before signing out
      if (currentUid) {
        await performUserContextSwap(currentUid, null)
      }

      await firebaseSignOut(auth)
      prevUidRef.current = null
      initializationInFlight = null
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[AuthGate] Sign out error:', error)
      setError(error)
      throw error
    }
  }

  const retry = async () => {
    if (!user) return
    
    setError(null)
    setState(AuthGateState.INITIALIZING_USER)
    
    try {
      await ensureUserInitialized(user.uid)
      setState(AuthGateState.SUBSCRIBING)
      setTimeout(() => {
        if (prevUidRef.current === user.uid) {
          setState(AuthGateState.READY)
        }
      }, 100)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      
      if (isQuotaError(err)) {
        setQuotaExceeded(true)
        setState(AuthGateState.ERROR_QUOTA_EXCEEDED)
      } else {
        setState(AuthGateState.ERROR_FATAL)
      }
    }
  }

  const value: AuthGateContextType = {
    state,
    user,
    uid: user?.uid || null,
    email: user?.email || null,
    signInWithGoogle,
    signOut,
    error,
    retry,
  }

  return <AuthGateContext.Provider value={value}>{children}</AuthGateContext.Provider>
}

export function AuthGateProvider({ children }: AuthGateProviderProps) {
  return (
    <SyncStatusProvider>
      <AuthGateProviderInner>{children}</AuthGateProviderInner>
    </SyncStatusProvider>
  )
}

export function useAuthGate() {
  const context = useContext(AuthGateContext)
  if (context === undefined) {
    throw new Error('useAuthGate must be used within AuthGateProvider')
  }
  return context
}

