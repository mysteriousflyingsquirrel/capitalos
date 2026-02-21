import React, { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import Heading from '../components/Heading'

type View = 'signIn' | 'signUp' | 'forgotPassword'

function getFirebaseErrorMessage(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? (err as { code: string }).code
      : ''

  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email.'
    case 'auth/wrong-password':
      return 'Incorrect password.'
    case 'auth/invalid-credential':
      return 'Invalid email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    case 'auth/popup-closed-by-user':
      return ''
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
  }
}

function Login() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()

  const [view, setView] = useState<View>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  const switchView = (next: View) => {
    clearMessages()
    setPassword('')
    setConfirmPassword('')
    setView(next)
  }

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      await signInWithEmail(email.trim(), password)
    } catch (err) {
      const msg = getFirebaseErrorMessage(err)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSignUp = async (e: FormEvent) => {
    e.preventDefault()
    clearMessages()

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await signUpWithEmail(email.trim(), password)
    } catch (err) {
      const msg = getFirebaseErrorMessage(err)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)

    try {
      await resetPassword(email.trim())
      setSuccess('Password reset link sent. Check your inbox.')
    } catch (err) {
      const msg = getFirebaseErrorMessage(err)
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    clearMessages()
    setLoading(true)

    try {
      const isSafari =
        /^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
        /iphone|ipad|ipod/i.test(navigator.userAgent)

      if (isSafari) setIsRedirecting(true)

      await signInWithGoogle()

      if (!isSafari) setLoading(false)
    } catch (err: unknown) {
      setIsRedirecting(false)
      const msg = getFirebaseErrorMessage(err)
      if (msg) setError(msg)
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-2.5 bg-bg-surface-2 border border-border-primary rounded-input text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:border-[#DAA520] transition-colors'

  const primaryBtnClass =
    'w-full py-3 px-4 bg-gradient-to-r from-[#DAA520] to-[#B87333] hover:from-[#F0C850] hover:to-[#D4943F] text-[#050A1A] text-sm md:text-base font-semibold rounded-full transition-all duration-200 shadow-card hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'

  const Spinner = () => (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-page">
      <div className="max-w-md w-full">
        <div className="bg-bg-frame border border-[#DAA520] rounded-card shadow-card px-3 py-3 lg:p-6">
          <Heading level={1} className="mb-6 text-center">
            Capitalos
          </Heading>
          <p className="text-text-secondary text-[0.567rem] md:text-xs mb-6 text-center">
            {view === 'forgotPassword'
              ? 'Enter your email to receive a password reset link.'
              : 'Sign in to your personal wealth, cashflow and investing cockpit.'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-bg-surface-2 border border-danger rounded-input" role="alert">
              <p className="text-danger text-[0.567rem] md:text-xs">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-bg-surface-2 border border-success rounded-input" role="status">
              <p className="text-success text-[0.567rem] md:text-xs">{success}</p>
            </div>
          )}

          {/* --- Sign In --- */}
          {view === 'signIn' && (
            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchView('forgotPassword')}
                  className="text-[#DAA520] text-[0.567rem] md:text-xs hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={loading} className={primaryBtnClass}>
                {loading ? <><Spinner /> Signing in...</> : 'Sign In'}
              </button>

              <p className="text-text-secondary text-[0.567rem] md:text-xs text-center pt-1">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => switchView('signUp')} className="text-[#DAA520] hover:underline">
                  Create one
                </button>
              </p>
            </form>
          )}

          {/* --- Sign Up --- */}
          {view === 'signUp' && (
            <form onSubmit={handleEmailSignUp} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className={inputClass}
              />

              <button type="submit" disabled={loading} className={primaryBtnClass}>
                {loading ? <><Spinner /> Creating account...</> : 'Create Account'}
              </button>

              <p className="text-text-secondary text-[0.567rem] md:text-xs text-center pt-1">
                Already have an account?{' '}
                <button type="button" onClick={() => switchView('signIn')} className="text-[#DAA520] hover:underline">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* --- Forgot Password --- */}
          {view === 'forgotPassword' && (
            <form onSubmit={handleResetPassword} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />

              <button type="submit" disabled={loading} className={primaryBtnClass}>
                {loading ? <><Spinner /> Sending...</> : 'Send Reset Link'}
              </button>

              <p className="text-text-secondary text-[0.567rem] md:text-xs text-center pt-1">
                <button type="button" onClick={() => switchView('signIn')} className="text-[#DAA520] hover:underline">
                  Back to sign in
                </button>
              </p>
            </form>
          )}

          {/* --- Divider --- */}
          {view !== 'forgotPassword' && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border-primary" />
                <span className="text-text-tertiary text-[0.567rem] md:text-xs">or</span>
                <div className="flex-1 h-px bg-border-primary" />
              </div>

              {/* --- Google --- */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3 px-4 bg-bg-surface-2 border border-border-primary hover:border-[#DAA520] text-text-primary text-sm md:text-base font-medium rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading && !isRedirecting ? (
                  <><Spinner /> Signing in...</>
                ) : isRedirecting ? (
                  <><Spinner /> Redirecting to Google...</>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
