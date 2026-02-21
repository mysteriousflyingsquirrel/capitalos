import { useEffect, useRef, useCallback } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export function useIdleTimer(onIdle: () => void, enabled: boolean = true) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onIdleRef.current(), IDLE_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    resetTimer()

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [enabled, resetTimer])
}
