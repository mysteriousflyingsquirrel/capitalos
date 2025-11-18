import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cashflow from './pages/Cashflow'
import NetWorth from './pages/NetWorth'
import Investing from './pages/Investing'
import Settings from './pages/Settings'
import { CurrencyProvider } from './contexts/CurrencyContext'

function App() {
  return (
    <CurrencyProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cashflow" element={<Cashflow />} />
            <Route path="/net-worth" element={<NetWorth />} />
            <Route path="/investing" element={<Investing />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </Router>
    </CurrencyProvider>
  )
}

export default App

