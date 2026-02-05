import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout'
import { useAppDispatch } from './app/hooks'
import { setServerWalletAddress } from './features/wallet/walletSlice'
import Dashboard from './pages/Dashboard'
import TradePage from './pages/TradePage'
import BotsPage from './pages/BotsPage'
import CopyTradePage from './pages/CopyTradePage'
import ArbPage from './pages/ArbPage'
import SniperPage from './pages/SniperPage'
import DLMMPage from './pages/DLMMPage'
import LiquidityPage from './pages/LiquidityPage'
import YieldPage from './pages/YieldPage'
import YieldHunterPage from './pages/YieldHunterPage'
import NewsPage from './pages/NewsPage'
import ControlPanel from './pages/ControlPanel'
import SKRStakingPage from './pages/SKRStakingPage'

function App() {
  const dispatch = useAppDispatch()

  // Fetch server wallet address on mount (for server mode)
  useEffect(() => {
    const fetchServerWallet = async () => {
      try {
        const res = await fetch('/api/wallet/server-address')
        if (res.ok) {
          const data = await res.json()
          if (data.address) {
            dispatch(setServerWalletAddress(data.address))
            console.log('[Wallet] Server wallet loaded:', data.address.slice(0, 8) + '...')
          }
        }
      } catch (e) {
        console.error('[Wallet] Failed to fetch server wallet:', e)
      }
    }
    fetchServerWallet()
  }, [dispatch])

  return (
    <Router>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trade" element={<TradePage />} />
          <Route path="/strategies" element={<BotsPage />} />
          <Route path="/bots" element={<BotsPage />} />
          <Route path="/copytrade" element={<CopyTradePage />} />
          <Route path="/arb" element={<ArbPage />} />
          <Route path="/sniper" element={<SniperPage />} />
          <Route path="/dlmm" element={<DLMMPage />} />
          <Route path="/liquidity" element={<LiquidityPage />} />
          <Route path="/yield" element={<YieldHunterPage />} />
          <Route path="/yield/widgets" element={<YieldPage />} />
          <Route path="/skr" element={<SKRStakingPage />} />
          <Route path="/intel" element={<NewsPage />} />
          <Route path="/control" element={<ControlPanel />} />
        </Routes>
      </AppShell>
    </Router>
  )
}

export default App
