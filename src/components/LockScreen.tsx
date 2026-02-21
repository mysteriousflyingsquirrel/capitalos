import React, { useState, useCallback, useEffect } from 'react'
import { verifyBiometric } from '../services/webAuthnService'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../config/firebase'
import Heading from './Heading'

interface LockScreenProps {
  uid: string
  email: string | null
  onUnlock: () => void
  onSignOut: () => void
}

export default function LockScreen({ uid, email, onUnlock, onSignOut }: LockScreenProps) {
  const [verifying, setVerifying] = useState(false)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleBiometric = useCallback(async () => {
    setVerifying(true)
    setError(null)
    try {
      const ok = await verifyBiometric(uid)
      if (ok) {
        onUnlock()
      } else {
        setError('Verification failed. Try again or use your password.')
        setShowPasswordFallback(true)
      }
    } catch {
      setError('Biometric verification failed.')
      setShowPasswordFallback(true)
    } finally {
      setVerifying(false)
    }
  }, [uid, onUnlock])

  useEffect(() => {
    handleBiometric()
  }, [handleBiometric])

  const handlePasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      onUnlock()
    } catch {
      setError('Incorrect password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-page">
      <div className="max-w-sm w-full">
        <div className="bg-bg-frame border border-border-subtle rounded-card shadow-card px-3 py-3 lg:p-6 text-center">
          <Heading level={1} className="mb-2">Capitalos</Heading>
          <p className="text-text-secondary text-xs mb-6">App is locked</p>

          {error && (
            <div className="mb-4 p-3 bg-bg-surface-2 border border-danger rounded-input">
              <p className="text-danger text-xs">{error}</p>
            </div>
          )}

          <button
            onClick={handleBiometric}
            disabled={verifying}
            className="w-full py-3 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-sm font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {verifying ? 'Verifying...' : 'Unlock with Biometrics'}
          </button>

          {showPasswordFallback && email && (
            <form onSubmit={handlePasswordUnlock} className="space-y-3 mb-4">
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-border-primary" />
                <span className="text-text-tertiary text-xs">or</span>
                <div className="flex-1 h-px bg-border-primary" />
              </div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 bg-bg-surface-2 border border-border-primary rounded-input text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-[#DAA520] transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-bg-surface-2 border border-border-primary hover:border-[#DAA520] text-text-primary text-sm font-medium rounded-full transition-all duration-200 disabled:opacity-50"
              >
                {loading ? 'Unlocking...' : 'Unlock with Password'}
              </button>
            </form>
          )}

          <button
            onClick={onSignOut}
            className="text-text-tertiary text-xs hover:text-text-secondary transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
