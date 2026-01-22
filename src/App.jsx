import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cashflow from './pages/Cashflow'
import NetWorth from './pages/NetWorth'
import Analytics from './pages/Analytics'
import Hyperliquid from './pages/Hyperliquid'
import Kraken from './pages/Kraken'
import Mexc from './pages/Mexc'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { ThemeProvider } from './contexts/ThemeContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { AuthGateProvider, AuthGateState } from './lib/dataSafety/authGate'
import { AuthContextCompatProvider, useAuth } from './lib/dataSafety/authGateCompat'
import { IncognitoProvider } from './contexts/IncognitoContext'
import { ApiKeysProvider } from './contexts/ApiKeysContext'
import { DataProvider, useData } from './contexts/DataContext'
import { AuthGateUI, SyncStatusIndicator } from './components/AuthGateUI'
import { ErrorBoundary } from './components/ErrorBoundary'

function ProtectedRoutes() {
  try {
    const { user, loading: authLoading, authGateState, error: authError } = useAuth()
    const { loading: dataLoading, error: dataError, isInitialLoad } = useData()

    // Show AuthGate UI for error states
    if (authGateState === AuthGateState.ERROR_QUOTA_EXCEEDED ||
        authGateState === AuthGateState.ERROR_FATAL) {
      return <AuthGateUI />
    }

    // Show loading during auth transitions OR initial data load
    // Keep showing AuthGateUI during SUBSCRIBING until data is loaded
    // This ensures a continuous loading experience without flicker
    if (authGateState && authGateState !== AuthGateState.READY && authGateState !== AuthGateState.SIGNED_OUT) {
      return <AuthGateUI />
    }

    if (!user) {
      return <Login />
    }

    if (dataError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-page">
          <div className="text-center">
            <div className="text-red-400 mb-4">Error loading data</div>
            <div className="text-text-secondary">{dataError}</div>
          </div>
        </div>
      )
    }

    return (
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cashflow" element={<Cashflow />} />
          <Route path="/net-worth" element={<NetWorth />} />
          <Route path="/analytics" element={<Analytics />} />
          {/* Backwards-compat deep link: redirect old Investing route to Exchanges → Hyperliquid */}
          <Route path="/investing/*" element={<Navigate to="/exchanges/hyperliquid" replace />} />

          {/* Exchanges */}
          <Route path="/exchanges/hyperliquid" element={<Hyperliquid />} />
          <Route path="/exchanges/mexc" element={<Mexc />} />
          <Route path="/exchanges/kraken" element={<Kraken />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    )
  } catch (error) {
    console.error('[ProtectedRoutes] Error:', error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-page">
        <div className="text-center">
          <div className="text-red-400 mb-4">Application Error</div>
          <div className="text-text-secondary text-sm mb-4">
            {error instanceof Error ? error.message : String(error)}
          </div>
          <details className="text-left text-xs text-text-muted">
            <summary className="cursor-pointer mb-2">Technical details</summary>
            <pre className="bg-galaxy-dark p-2 rounded overflow-auto">
              {error instanceof Error ? error.stack : String(error)}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}

function App() {
  return (
    <ErrorBoundary>
      <AuthGateProvider>
        <ErrorBoundary>
          <AuthContextCompatProvider>
            <ThemeProvider>
              <CurrencyProvider>
                <ApiKeysProvider>
                  <DataProvider>
                    <IncognitoProvider>
                      <Router>
                        <ProtectedRoutes />
                        <SyncStatusIndicator />
                      </Router>
                    </IncognitoProvider>
                  </DataProvider>
                </ApiKeysProvider>
              </CurrencyProvider>
            </ThemeProvider>
          </AuthContextCompatProvider>
        </ErrorBoundary>
      </AuthGateProvider>
    </ErrorBoundary>
  )
}

export default App
