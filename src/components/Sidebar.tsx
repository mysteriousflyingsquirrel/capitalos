import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import logoIcon from '../icons/capitalos_logo.png'
import dashboardIcon from '../icons/dashboard_icon.svg'
import netWorthIcon from '../icons/networth_icon.svg'
import cashflowIcon from '../icons/cashflow_icon.svg'
import investingIcon from '../icons/investment_icon.svg'
import taxIcon from '../icons/tax_icon.svg'
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
  { name: 'Investing', path: '/investing', icon: investingIcon },
  { name: 'Tax', path: '/tax', icon: taxIcon },
  { name: 'Settings', path: '/settings', icon: settingsIcon },
]

function Sidebar() {
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-bg-surface-1 border border-border-subtle rounded-card text-text-primary"
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
          fixed left-0 top-0 h-full w-[250px] bg-[#050A1A] border-r border-border-subtle
          flex flex-col z-30
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-start gap-3 py-3 px-4 border-b border-border-subtle">
          <img 
            src={logoIcon} 
            alt="Capitalos" 
            className="h-[4.5rem] w-auto" 
          />
          <span className="text-white font-bold text-xl tracking-wide">
            CAPITALOS
          </span>
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
        </nav>
      </aside>
    </>
  )
}

export default Sidebar

