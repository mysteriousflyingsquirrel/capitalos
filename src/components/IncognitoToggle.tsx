import { useIncognito } from '../contexts/IncognitoContext'

export function IncognitoToggle() {
  const { isIncognito, toggleIncognito } = useIncognito()

  return (
    <button
      onClick={toggleIncognito}
      className="flex items-center justify-center px-3 py-2 rounded-input bg-bg-surface-2 border border-border-subtle hover:bg-bg-surface-3 transition-colors text-text-secondary hover:text-text-primary"
      title={isIncognito ? 'Incognito Mode: ON - Click to disable' : 'Incognito Mode: OFF - Click to enable'}
      aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
      aria-pressed={isIncognito}
    >
      <span className="text-base" aria-hidden="true">{isIncognito ? '🙈' : '🐵'}</span>
    </button>
  )
}

