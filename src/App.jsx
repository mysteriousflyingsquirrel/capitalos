import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cashflow from './pages/Cashflow'
import NetWorth from './pages/NetWorth'
import Investing from './pages/Investing'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { IncognitoProvider } from './contexts/IncognitoContext'
import { ApiKeysProvider } from './contexts/ApiKeysContext'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A1A] flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cashflow" element={<Cashflow />} />
        <Route path="/net-worth" element={<NetWorth />} />
        <Route path="/investing" element={<Investing />} />
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
          <IncognitoProvider>
            <Router>
              <ProtectedRoutes />
            </Router>
          </IncognitoProvider>
        </ApiKeysProvider>
      </CurrencyProvider>
    </AuthProvider>
  )
}

export default App
