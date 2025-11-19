import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { 
  User, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth'
import { auth, googleProvider } from '../config/firebase'
import { isIosSafari } from '../utils/browserDetection'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  uid: string | null
  email: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let unsubscribe: (() => void) | null = null

    // Check for redirect result FIRST (for Safari/iOS sign-in)
    // This must be called to complete the redirect sign-in flow
    console.log('Checking for redirect result...')
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return

        if (result) {
          // User signed in via redirect
          console.log('✅ Redirect result received, user signed in:', result.user.email)
          console.log('User UID:', result.user.uid)
          // Set user immediately from redirect result
          setUser(result.user)
          setLoading(false)
        } else {
          // No redirect result, normal page load
          console.log('No redirect result (normal page load)')
        }

        // Set up auth state listener after redirect check
        // This handles future auth state changes
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!isMounted) return
          console.log('Auth state changed:', user ? user.email : 'signed out')
          setUser(user)
          
          // Only set loading to false if we didn't already handle redirect
          if (!result) {
            setLoading(false)
          }
        })

        // If no redirect result, set loading to false
        // The auth state listener will update the user state
        if (!result) {
          setLoading(false)
        }
      })
      .catch((error) => {
        if (!isMounted) return
        console.error('❌ Error getting redirect result:', error)
        console.error('Error code:', error.code)
        console.error('Error message:', error.message)
        
        // Set up auth state listener even if redirect check fails
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!isMounted) return
          setUser(user)
          setLoading(false)
        })
        
        setLoading(false)
      })

    // Fallback: if redirect check takes too long, set up listener anyway
    const fallbackTimer = setTimeout(() => {
      if (!unsubscribe && isMounted) {
        console.log('Redirect check timeout, proceeding with normal flow')
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!isMounted) return
          setUser(user)
          setLoading(false)
        })
        setLoading(false)
      }
    }, 2000)

    return () => {
      isMounted = false
      clearTimeout(fallbackTimer)
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  const signInWithGoogle = async () => {
    try {
      // Use redirect for iOS Safari, popup for other browsers
      if (isIosSafari()) {
        // signInWithRedirect doesn't return a promise that resolves
        // The user will be redirected and then come back to the app
        // The redirect result is handled in the useEffect above
        await signInWithRedirect(auth, googleProvider)
      } else {
        await signInWithPopup(auth, googleProvider)
      }
    } catch (error) {
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  const signOut = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    signInWithGoogle,
    signOut,
    uid: user?.uid || null,
    email: user?.email || null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

