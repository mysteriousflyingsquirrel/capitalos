import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

interface SyncStatus {
  online: boolean
  activeListeners: number
  pendingWrites: number
  lastError: Error | null
  lastSyncTime: number | null
  safeMode: boolean
  quotaExceeded: boolean
}

interface SyncStatusContextType extends SyncStatus {
  setOnline: (online: boolean) => void
  setActiveListeners: (count: number) => void
  incrementPendingWrites: () => void
  decrementPendingWrites: () => void
  setLastError: (error: Error | null) => void
  setLastSyncTime: (time: number) => void
  setSafeMode: (safe: boolean) => void
  setQuotaExceeded: (exceeded: boolean) => void
}

const SyncStatusContext = createContext<SyncStatusContextType | undefined>(undefined)

interface SyncStatusProviderProps {
  children: ReactNode
}

export function SyncStatusProvider({ children }: SyncStatusProviderProps) {
  const [online, setOnline] = useState(navigator.onLine)
  const [activeListeners, setActiveListeners] = useState(0)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [lastError, setLastError] = useState<Error | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [safeMode, setSafeMode] = useState(false)
  const [quotaExceeded, setQuotaExceeded] = useState(false)

  // Expose sync status globally for repository checks
  useEffect(() => {
    const status: SyncStatus = {
      online,
      activeListeners,
      pendingWrites,
      lastError,
      lastSyncTime,
      safeMode,
      quotaExceeded,
    }
    ;(window as any).__CAPITALOS_SYNC_STATUS__ = status

    return () => {
      delete (window as any).__CAPITALOS_SYNC_STATUS__
    }
  }, [online, activeListeners, pendingWrites, lastError, lastSyncTime, safeMode, quotaExceeded])

  // When quota is exceeded, enter safe mode
  useEffect(() => {
    if (quotaExceeded) {
      setSafeMode(true)
    }
  }, [quotaExceeded])

  const incrementPendingWrites = useCallback(() => {
    setPendingWrites(prev => prev + 1)
  }, [])

  const decrementPendingWrites = useCallback(() => {
    setPendingWrites(prev => Math.max(0, prev - 1))
  }, [])

  const value: SyncStatusContextType = {
    online,
    activeListeners,
    pendingWrites,
    lastError,
    lastSyncTime,
    safeMode,
    quotaExceeded,
    setOnline,
    setActiveListeners,
    incrementPendingWrites,
    decrementPendingWrites,
    setLastError,
    setLastSyncTime,
    setSafeMode,
    setQuotaExceeded,
  }

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>
}

export function useSyncStatus() {
  const context = useContext(SyncStatusContext)
  if (context === undefined) {
    throw new Error('useSyncStatus must be used within SyncStatusProvider')
  }
  return context
}

