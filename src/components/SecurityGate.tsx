import React, { useState, useEffect, useCallback, ReactNode } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { isBiometricEnabled } from '../services/webAuthnService'
import { useIdleTimer } from '../hooks/useIdleTimer'
import LockScreen from './LockScreen'

interface SecurityGateProps {
  children: ReactNode
}

export default function SecurityGate({ children }: SecurityGateProps) {
  const { uid, email, signOut } = useAuth()
  const [locked, setLocked] = useState(false)
  const hasBiometric = uid ? isBiometricEnabled(uid) : false

  // On mount: if biometric is enabled, start locked (require unlock)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  useEffect(() => {
    if (!uid) return
    if (isBiometricEnabled(uid)) {
      setLocked(true)
    }
    setInitialCheckDone(true)
  }, [uid])

  const handleIdle = useCallback(() => {
    if (!uid) return
    if (hasBiometric) {
      setLocked(true)
    } else {
      signOut()
    }
  }, [uid, hasBiometric, signOut])

  useIdleTimer(handleIdle, !!uid)

  // Lock on visibility change (tab hidden -> visible)
  useEffect(() => {
    if (!uid || !hasBiometric) return

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setLocked(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [uid, hasBiometric])

  const handleUnlock = useCallback(() => setLocked(false), [])

  if (!uid || !initialCheckDone) return <>{children}</>

  if (locked && hasBiometric) {
    return (
      <LockScreen
        uid={uid}
        email={email}
        onUnlock={handleUnlock}
        onSignOut={signOut}
      />
    )
  }

  return <>{children}</>
}
