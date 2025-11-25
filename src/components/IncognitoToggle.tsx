import { useIncognito } from '../contexts/IncognitoContext'

export function IncognitoToggle() {
  const { isIncognito, toggleIncognito } = useIncognito()

  return (
    <button
      onClick={toggleIncognito}
      className="flex items-center gap-2 px-3 py-2 rounded-input bg-bg-surface-2 border border-border-subtle hover:bg-bg-surface-3 transition-colors text-text-secondary hover:text-text-primary"
      title={isIncognito ? 'Incognito Mode: ON - Click to disable' : 'Incognito Mode: OFF - Click to enable'}
    >
      <span className="text-base">{isIncognito ? '🙉' : '🙈'}</span>
      <span className="text-[0.567rem] md:text-xs font-medium">
        {isIncognito ? 'Visible' : 'Incognito'}
      </span>
    </button>
  )
}

