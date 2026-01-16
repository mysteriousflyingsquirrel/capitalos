import React from 'react'
import { AuthGateState, useAuthGate } from '../lib/dataSafety/authGate'
import { useSyncStatus } from '../lib/dataSafety/syncStatus'

export function AuthGateUI() {
  const { state, error, retry, signOut } = useAuthGate()
  const { safeMode, quotaExceeded, online } = useSyncStatus()

  // Show loading screen during auth transitions
  if (state === AuthGateState.AUTH_LOADING || 
      state === AuthGateState.INITIALIZING_USER ||
      state === AuthGateState.SUBSCRIBING) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-goldenrod mx-auto mb-4"></div>
          <div className="text-text-primary text-lg mb-2">
            {state === AuthGateState.AUTH_LOADING && 'Checking authentication...'}
            {state === AuthGateState.INITIALIZING_USER && 'Initializing account...'}
            {state === AuthGateState.SUBSCRIBING && 'Loading data...'}
          </div>
          <div className="text-text-secondary text-sm">
            Please wait
          </div>
        </div>
      </div>
    )
  }

  // Show signed out state
  if (state === AuthGateState.SIGNED_OUT) {
    return null // Let Login component handle this
  }

  // Show quota exceeded error
  if (state === AuthGateState.ERROR_QUOTA_EXCEEDED || safeMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="max-w-md w-full mx-4">
          <div className="bg-space-blue border border-red-500 rounded-lg p-6">
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              Firebase Quota Exceeded
            </h1>
            <div className="text-text-secondary mb-6 space-y-2">
              <p>
                Today's free Firebase limits were reached. Firestore is throttling requests.
              </p>
              <p>
                Capitalos is in safe mode to prevent further issues.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={retry}
                disabled={!online}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Retry
              </button>
              <button
                onClick={signOut}
                className="btn-secondary"
              >
                Sign Out
              </button>
            </div>
            {!online && (
              <div className="mt-4 text-sm text-text-secondary">
                Retry is disabled while offline.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Show fatal error
  if (state === AuthGateState.ERROR_FATAL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="max-w-md w-full mx-4">
          <div className="bg-space-blue border border-red-500 rounded-lg p-6">
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              Connection Error
            </h1>
            <div className="text-text-secondary mb-6 space-y-2">
              <p>
                {error?.message || 'Having trouble connecting to Firebase.'}
              </p>
              {error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm">Technical details</summary>
                  <pre className="mt-2 text-xs bg-galaxy-dark p-2 rounded overflow-auto">
                    {error.stack || error.toString()}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={retry}
                disabled={!online}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Retry
              </button>
              <button
                onClick={signOut}
                className="btn-secondary"
              >
                Sign Out
              </button>
            </div>
            {!online && (
              <div className="mt-4 text-sm text-text-secondary">
                Retry is disabled while offline.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

/**
 * Sync status indicator component
 */
export function SyncStatusIndicator() {
  const { online, activeListeners, safeMode, quotaExceeded } = useSyncStatus()

  if (!online) {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span>Offline — Read-only</span>
        </div>
      </div>
    )
  }

  if (safeMode || quotaExceeded) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
        <div className="flex items-center gap-2">
          <span>🛑</span>
          <span>Safe Mode</span>
        </div>
      </div>
    )
  }

  // Show listener count in dev mode
  if (import.meta.env.DEV && activeListeners > 0) {
    return (
      <div className="fixed bottom-4 right-4 bg-space-blue border border-bronze-gold text-text-primary px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
        Listeners: {activeListeners}
      </div>
    )
  }

  return null
}

