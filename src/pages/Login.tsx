import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Heading from '../components/Heading'

function Login() {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
      // Note: On mobile, signInWithRedirect will redirect the user away
      // so this code may not execute. The redirect result is handled in AuthContext.
    } catch (err: any) {
      // Don't show error for popup-closed-by-user on mobile (shouldn't happen with redirect)
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed the popup, which is fine
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to sign in')
      setLoading(false)
    }
    // Only set loading to false if we didn't redirect (desktop)
    // On mobile with redirect, the user will be redirected away
    if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050A1A] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-bg-surface-1 border border-[#DAA520] rounded-card shadow-card p-8">
          <Heading level={1} className="mb-6 text-center">
            Capitalos
          </Heading>
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-8 text-center">
            Sign in with your Google account to access your personal wealth, cashflow and investing cockpit.
          </p>
          
          {error && (
            <div className="mb-4 p-3 bg-bg-surface-2 border border-danger rounded-input">
              <p className="text-danger text-[0.567rem] md:text-xs">{error}</p>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-sm md:text-base font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Login

