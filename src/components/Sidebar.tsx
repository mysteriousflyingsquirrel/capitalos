import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/dataSafety/authGateCompat'
import { useSyncStatus } from '../lib/dataSafety/syncStatus'
import { AuthGateState } from '../lib/dataSafety/authGate'
import { useIncognito } from '../contexts/IncognitoContext'
import { IncognitoToggle } from './IncognitoToggle'
import logoIcon from '../icons/capitalos_logo.png'
import dashboardIcon from '../icons/dashboard_icon.svg'
import netWorthIcon from '../icons/networth_icon.svg'
import cashflowIcon from '../icons/cashflow_icon.svg'
import investingIcon from '../icons/investment_icon.svg'
import exchangeIcon from '../icons/exchange_icon.svg'
import analyticsIcon from '../icons/tax_icon.svg'
import settingsIcon from '../icons/settings_icon.svg'

interface NavigationItem {
  name: string
  path: string
  icon: string
}

const navigation: NavigationItem[] = [
  { name: 'Dashboard', path: '/', icon: dashboardIcon },
  { name: 'Net Worth', path: '/net-worth', icon: netWorthIcon },
  { name: 'Cashflow', path: '/cashflow', icon: cashflowIcon },
  { name: 'Analytics', path: '/analytics', icon: analyticsIcon },
]

function Sidebar() {
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const isOnExchangesRoute = location.pathname.startsWith('/exchanges')
  const [isExchangesOpen, setIsExchangesOpen] = useState(isOnExchangesRoute)
  const { toggleIncognito } = useIncognito()

  // If the user is on a child route, default to expanded.
  useEffect(() => {
    if (isOnExchangesRoute) {
      setIsExchangesOpen(true)
    }
  }, [isOnExchangesRoute])

  // Keyboard shortcut: CTRL + I to toggle incognito
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'i' || event.key === 'I')) {
        event.preventDefault()
        toggleIncognito()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleIncognito])
  const { signOut, email, authGateState } = useAuth()
  const { online, activeListeners, safeMode, quotaExceeded, pendingWrites, lastSyncTime } = useSyncStatus()

  // Determine if syncing
  const isSyncing = 
    authGateState === AuthGateState.INITIALIZING_USER ||
    authGateState === AuthGateState.SUBSCRIBING ||
    pendingWrites > 0

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-[60] bg-bg-surface-1 border-b border-border-subtle px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 text-text-primary hover:bg-bg-surface-2 rounded-input transition-colors"
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
        {/* Incognito button on mobile top bar */}
        <div className="lg:hidden">
          <IncognitoToggle />
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-14 lg:top-0 h-[calc(100vh-3.5rem)] lg:h-full w-[250px] bg-bg-frame
          flex flex-col z-50 border-r border-border-subtle
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="py-3 px-4 border-b border-border-subtle">
          <div className="flex items-center justify-start gap-3 mb-3">
            <img 
              src={logoIcon} 
              alt="Capitalos" 
              className="h-[4.5rem] w-auto" 
            />
            <div className="flex flex-col">
              <span className="text-white font-bold text-xl tracking-wide">
                CAPITALOS
              </span>
              <span className="text-text-secondary text-xs italic">
                no money, no funny
              </span>
            </div>
          </div>
          {/* Incognito button - only visible on desktop when sidebar is visible */}
          <div className="hidden lg:block">
            <IncognitoToggle />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-input
                  transition-all duration-200
                  relative
                  ${
                    isActive
                      ? 'bg-bg-surface-1 border-l-4 border-[#F8C445] text-text-primary'
                      : 'text-text-secondary hover:text-[#F8C445] hover:bg-bg-surface-2'
                  }
                `}
              >
                <img
                  src={item.icon}
                  alt={item.name}
                  className="w-5 h-5 flex-shrink-0"
                  style={{
                    filter: isActive
                      ? 'brightness(0) invert(1) drop-shadow(0 0 4px rgba(248, 196, 69, 0.5))'
                      : 'brightness(0) invert(1)',
                  }}
                />
                <span
                  className={`
                    font-semibold text-sm
                    ${
                      isActive
                        ? 'bg-gradient-to-r from-[#F8C445] to-[#DAA520] bg-clip-text text-transparent'
                        : ''
                    }
                  `}
                >
                  {item.name}
                </span>
              </Link>
            )
          })}

          {/* Exchanges group (non-clickable parent) */}
          <div>
            <button
              type="button"
              onClick={() => setIsExchangesOpen((v) => !v)}
              className={`
                w-full flex items-center justify-between gap-3 px-4 py-3 rounded-input
                transition-all duration-200
                text-text-secondary hover:text-[#F8C445] hover:bg-bg-surface-2
              `}
              aria-expanded={isExchangesOpen}
            >
              <div className="flex items-center gap-3">
                <img
                  src={exchangeIcon}
                  alt="Exchanges"
                  className="w-5 h-5 flex-shrink-0"
                  style={{ filter: 'brightness(0) invert(1)' }}
                />
                <span className="font-semibold text-sm">Exchanges</span>
              </div>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isExchangesOpen ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {isExchangesOpen && (
              <div className="mt-1 space-y-1">
                {[
                  // Use Google's favicon service for reliability (many sites don't expose /favicon.ico)
                  { name: 'Hyperliquid', path: '/exchanges/hyperliquid', iconSrc: 'https://www.google.com/s2/favicons?domain=hyperfoundation.org&sz=32' },
                  { name: 'MEXC', path: '/exchanges/mexc', iconSrc: 'https://www.google.com/s2/favicons?domain=mexc.com&sz=32' },
                  { name: 'Kraken', path: '/exchanges/kraken', iconSrc: 'https://www.google.com/s2/favicons?domain=kraken.com&sz=32' },
                  { name: 'Aster', path: '/exchanges/aster', iconSrc: 'https://www.google.com/s2/favicons?domain=asterdex.com&sz=32' },
                ].map((child) => {
                  const isChildActive = location.pathname.startsWith(child.path)
                  return (
                    <Link
                      key={child.path}
                      to={child.path}
                      onClick={() => setIsMobileOpen(false)}
                      className={`
                        flex items-center gap-3 pl-12 pr-4 py-2 rounded-input
                        transition-all duration-200
                        relative
                        ${
                          isChildActive
                            ? 'bg-bg-surface-1 border-l-4 border-[#F8C445] text-text-primary'
                            : 'text-text-secondary hover:text-[#F8C445] hover:bg-bg-surface-2'
                        }
                      `}
                    >
                      <span className="w-4 h-4 flex-shrink-0" aria-hidden="true">
                        <img
                          src={(child as any).iconSrc}
                          alt=""
                          className="w-4 h-4 rounded-sm"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => {
                            // Hide broken icon without affecting layout
                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </span>
                      <span
                        className={`
                          font-semibold text-sm
                          ${
                            isChildActive
                              ? 'bg-gradient-to-r from-[#F8C445] to-[#DAA520] bg-clip-text text-transparent'
                              : ''
                          }
                        `}
                      >
                        {child.name}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </nav>

        {/* User info and sign out */}
        <div className="px-4 py-3">
          {/* Settings (anchored at bottom, above sync status) */}
          <Link
            to="/settings"
            onClick={() => setIsMobileOpen(false)}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-input
              transition-all duration-200
              relative
              ${
                location.pathname === '/settings'
                  ? 'bg-bg-surface-1 border-l-4 border-[#F8C445] text-text-primary'
                  : 'text-text-secondary hover:text-[#F8C445] hover:bg-bg-surface-2'
              }
            `}
          >
            <img
              src={settingsIcon}
              alt="Settings"
              className="w-5 h-5 flex-shrink-0"
              style={{
                filter:
                  location.pathname === '/settings'
                    ? 'brightness(0) invert(1) drop-shadow(0 0 4px rgba(248, 196, 69, 0.5))'
                    : 'brightness(0) invert(1)',
              }}
            />
            <span
              className={`
                font-semibold text-sm
                ${
                  location.pathname === '/settings'
                    ? 'bg-gradient-to-r from-[#F8C445] to-[#DAA520] bg-clip-text text-transparent'
                    : ''
                }
              `}
            >
              Settings
            </span>
          </Link>

          <div className="my-2 border-t border-border-subtle" />

          {/* Sync Status */}
          <div className="px-3 py-2 bg-bg-surface-2 rounded-input">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
              {isSyncing ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-text-secondary text-[11px]">Syncing</span>
                </>
              ) : !online ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                  <span className="text-text-secondary text-[11px]">Offline</span>
                </>
              ) : safeMode || quotaExceeded ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-text-secondary text-[11px]">Safe Mode</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-text-secondary text-[11px]">Synced</span>
                </>
              )}
            </div>
              <div className="text-text-muted text-[10px] whitespace-nowrap">
                {!isSyncing && lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : ''}
              </div>
            </div>
            {!isSyncing && activeListeners > 0 && (
              <div className="text-text-muted text-[10px] mt-1">
                {activeListeners} listener{activeListeners !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          
          {/* Email + Sign out (compact row) */}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-text-muted text-[11px] truncate min-w-0">
              {email || ''}
            </div>
            <button
              onClick={async () => {
                const confirmed = window.confirm('Are you sure you want to sign out?')
                if (!confirmed) return
                
                try {
                  await signOut()
                } catch (error) {
                  console.error('Failed to sign out:', error)
                }
              }}
              className="flex items-center justify-center w-9 h-9 rounded-input text-text-secondary hover:text-danger hover:bg-bg-surface-2 transition-all duration-200 flex-shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar

