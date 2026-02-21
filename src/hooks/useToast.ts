import { useState, useCallback, useRef } from 'react'

export interface Toast {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

export function useToast(autoDismissMs = 5000) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const addToast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, autoDismissMs)
  }, [autoDismissMs])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, addToast, dismissToast }
}
