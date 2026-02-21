import React, { useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { isBiometricEnabled } from '../services/webAuthnService'
import { useIdleTimer } from '../hooks/useIdleTimer'
import { useIncognito } from '../contexts/IncognitoContext'
import LockScreen from './LockScreen'

const SESSION_UNLOCKED_KEY = 'capitalos_session_unlocked'

interface SecurityGateProps {
  children: ReactNode
}

export default function SecurityGate({ children }: SecurityGateProps) {
  const { uid, email, signOut } = useAuth()
  const [locked, setLocked] = useState(false)
  const hasBiometric = uid ? isBiometricEnabled(uid) : false
  const { pendingExitIncognito, confirmExitIncognito, cancelExitIncognito } = useIncognito()
  const pendingExitRef = useRef(false)
  pendingExitRef.current = pendingExitIncognito

  // On mount: lock only on cold app start (no sessionStorage flag), skip on refresh
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  useEffect(() => {
    if (!uid) return
    if (isBiometricEnabled(uid)) {
      const alreadyUnlocked = sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true'
      if (!alreadyUnlocked) {
        setLocked(true)
      }
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

  // Lock on visibility change (app lost focus -> returned)
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

  // Lock when user requests to exit incognito mode (biometric gate)
  useEffect(() => {
    if (pendingExitIncognito && hasBiometric) {
      setLocked(true)
    }
  }, [pendingExitIncognito, hasBiometric])

  const handleUnlock = useCallback(() => {
    setLocked(false)
    try { sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true') } catch {}
    if (pendingExitRef.current) {
      confirmExitIncognito()
    }
  }, [confirmExitIncognito])

  const handleSignOut = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_UNLOCKED_KEY) } catch {}
    if (pendingExitRef.current) {
      cancelExitIncognito()
    }
    signOut()
  }, [signOut, cancelExitIncognito])

  if (!uid || !initialCheckDone) return <>{children}</>

  if (locked && hasBiometric) {
    return (
      <LockScreen
        uid={uid}
        email={email}
        onUnlock={handleUnlock}
        onSignOut={handleSignOut}
      />
    )
  }

  return <>{children}</>
}
