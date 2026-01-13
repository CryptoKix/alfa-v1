import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import TradePage from './pages/Trade'
import StrategiesPage from './pages/StrategiesPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trade" element={<TradePage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
        <Route path="/copytrade" element={<Dashboard />} />
      </Routes>
    </Router>
  )
}

export default App
