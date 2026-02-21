import { useIncognito } from '../contexts/IncognitoContext'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { isBiometricEnabled } from '../services/webAuthnService'

export function IncognitoToggle() {
  const { isIncognito, toggleIncognito, requestExitIncognito } = useIncognito()
  const { uid } = useAuth()
  const hasBiometric = uid ? isBiometricEnabled(uid) : false

  const handleClick = () => {
    if (isIncognito && hasBiometric) {
      requestExitIncognito()
    } else {
      toggleIncognito()
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center justify-center px-3 py-2 rounded-input bg-bg-surface-2 border border-border-subtle hover:bg-bg-surface-3 transition-colors text-text-secondary hover:text-text-primary"
      title={isIncognito ? 'Incognito Mode: ON - Click to disable' : 'Incognito Mode: OFF - Click to enable'}
      aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
      aria-pressed={isIncognito}
    >
      <span className="text-base" aria-hidden="true">{isIncognito ? '🙈' : '🐵'}</span>
    </button>
  )
}

