import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cashflow from './pages/Cashflow'
import NetWorth from './pages/NetWorth'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Login from './pages/Login'
import LoadingScreen from './components/LoadingScreen'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { IncognitoProvider } from './contexts/IncognitoContext'
import { ApiKeysProvider } from './contexts/ApiKeysContext'
import { DataProvider, useData } from './contexts/DataContext'

function ProtectedRoutes() {
  const { user, loading: authLoading } = useAuth()
  const { loading: dataLoading, loadingMessage, error: dataError, isDataReady, data } = useData()

  if (authLoading) {
    return <LoadingScreen />
  }

  if (!user) {
    return <Login />
  }

  // Show loading screen if data is still loading OR data is not ready
  // Only check isDataReady flag - it's set to true only when all data is validated and loaded
  if (dataLoading || !isDataReady) {
    return <LoadingScreen message={loadingMessage || undefined} />
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="fixed inset-0 z-0">
          <LoadingScreen />
        </div>
        <div className="relative z-10 text-center">
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
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <ApiKeysProvider>
          <DataProvider>
            <IncognitoProvider>
              <Router>
                <ProtectedRoutes />
              </Router>
            </IncognitoProvider>
          </DataProvider>
        </ApiKeysProvider>
      </CurrencyProvider>
    </AuthProvider>
  )
}

export default App
