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

// Detect if user is on a mobile device
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.innerWidth < 768)
}

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
    let redirectCheckComplete = false

    // Check for redirect result first (for mobile sign-in)
    // This must complete before we consider loading done
    getRedirectResult(auth)
      .then((result) => {
        if (!isMounted) return
        redirectCheckComplete = true
        
        if (result) {
          // User signed in via redirect
          console.log('Redirect result received, user signed in:', result.user.email)
          setUser(result.user)
          setLoading(false)
        } else {
          // No redirect result, set loading to false
          setLoading(false)
        }
      })
      .catch((error) => {
        if (!isMounted) return
        redirectCheckComplete = true
        console.error('Error getting redirect result:', error)
        setLoading(false)
      })

    // Set up auth state listener
    // This will fire when redirect completes and user is authenticated
    // But we only update loading state after redirect check is complete
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return
      console.log('Auth state changed:', user ? user.email : 'signed out')
      setUser(user)
      
      // Only set loading to false if redirect check is complete
      // This prevents setting loading to false before redirect result is processed
      if (redirectCheckComplete) {
        setLoading(false)
      }
    })

    // Fallback: if redirect check takes too long, set loading to false anyway
    const fallbackTimer = setTimeout(() => {
      if (!redirectCheckComplete && isMounted) {
        redirectCheckComplete = true
        setLoading(false)
      }
    }, 2000)

    return () => {
      isMounted = false
      clearTimeout(fallbackTimer)
      unsubscribe()
    }
  }, [])

  const signInWithGoogle = async () => {
    try {
      // Use redirect for mobile devices, popup for desktop
      if (isMobileDevice()) {
        await signInWithRedirect(auth, googleProvider)
        // Note: signInWithRedirect doesn't return a promise that resolves
        // The user will be redirected and then come back to the app
        // The redirect result is handled in the useEffect above
      } else {
        await signInWithPopup(auth, googleProvider)
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error)
      // Don't throw popup-closed-by-user error, it's expected on mobile
      if (error.code === 'auth/popup-closed-by-user' && isMobileDevice()) {
        // This shouldn't happen with redirect, but handle it gracefully
        return
      }
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

