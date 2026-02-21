import React from 'react'
import type { Toast } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg border text-sm flex items-start gap-2 ${
            toast.type === 'error'
              ? 'bg-red-900/90 border-red-700 text-red-100'
              : toast.type === 'success'
              ? 'bg-green-900/90 border-green-700 text-green-100'
              : 'bg-blue-900/90 border-blue-700 text-blue-100'
          }`}
          role="alert"
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-current opacity-60 hover:opacity-100 ml-2 flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
