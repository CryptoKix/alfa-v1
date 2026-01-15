import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import TradePage from './pages/Trade'
import StrategiesPage from './pages/StrategiesPage'
import SniperPage from './pages/SniperPage'
import CopyTradePage from './pages/CopyTrade'
import { MainLayout } from './components/layout/MainLayout'

function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trade" element={<TradePage />} />
          <Route path="/strategies" element={<StrategiesPage />} />
          <Route path="/copytrade" element={<CopyTradePage />} />
          <Route path="/sniper" element={<SniperPage />} />
        </Routes>
      </MainLayout>
    </Router>
  )
}

export default App
