/**
 * Compatibility layer: Provides old AuthContext interface from AuthGate
 * This allows gradual migration of existing contexts
 */
import React, { createContext, useContext, ReactNode } from 'react'
import { useAuthGate, AuthGateState } from './authGate'

interface AuthContextType {
  user: any | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  uid: string | null
  email: string | null
  authGateState?: AuthGateState
  error?: Error | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthContextCompatProvider({ children }: { children: ReactNode }) {
  const authGate = useAuthGate()
  
  // Map AuthGate states to loading
  const loading = authGate.state === AuthGateState.AUTH_LOADING ||
                  authGate.state === AuthGateState.INITIALIZING_USER ||
                  authGate.state === AuthGateState.SUBSCRIBING

  const value: AuthContextType = {
    user: authGate.user,
    loading,
    signInWithGoogle: authGate.signInWithGoogle,
    signOut: authGate.signOut,
    uid: authGate.uid,
    email: authGate.email,
    authGateState: authGate.state,
    error: authGate.error,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthContextCompatProvider')
  }
  return context
}

