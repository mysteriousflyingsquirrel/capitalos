import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cashflow from './pages/Cashflow'
import NetWorth from './pages/NetWorth'
import Investing from './pages/Investing'
import Settings from './pages/Settings'
import Login from './pages/Login'
import FloatingLines from './components/FloatingLines'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { IncognitoProvider } from './contexts/IncognitoContext'
import { ApiKeysProvider } from './contexts/ApiKeysContext'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="fixed inset-0 z-0">
          <FloatingLines
            linesGradient={['#4A56FF', '#AD33FF', '#A45CFF', '#3CC8C0']}
            enabledWaves={['top', 'middle', 'bottom']}
            lineCount={[4, 6, 4]}
            animationSpeed={0.5}
            interactive={true}
            parallax={true}
            mixBlendMode="screen"
          />
        </div>
        <div className="text-text-secondary relative z-10">Loading...</div>
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
