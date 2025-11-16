import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Cashflow from './pages/Cashflow'
import NetWorth from './pages/NetWorth'
import Investing from './pages/Investing'
import Settings from './pages/Settings'

function App() {
  return (
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
  )
}

export default App

