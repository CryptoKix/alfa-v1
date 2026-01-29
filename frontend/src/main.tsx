import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { initSockets } from './services/socket'
import { WalletContextProvider } from './contexts/WalletContext'
import App from './App'
import './styles/index.css'

console.log('[Main] Starting TacTix.sol...')

// Initialize WebSockets
try {
  initSockets()
  console.log('[Main] Sockets initialized')
} catch (e) {
  console.error('[Socket] Initialization failed', e)
}

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'white', background: '#111' }}>
          <h1>Something went wrong</h1>
          <pre style={{ color: '#ff6b6b' }}>{this.state.error?.message}</pre>
          <pre style={{ color: '#888', fontSize: 12 }}>{this.state.error?.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

console.log('[Main] Rendering app...')

// Temporarily bypass wallet provider to debug
const USE_WALLET = false

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Provider store={store}>
      {USE_WALLET ? (
        <WalletContextProvider>
          <App />
        </WalletContextProvider>
      ) : (
        <App />
      )}
    </Provider>
  </ErrorBoundary>,
)

console.log('[Main] Render called')
