import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './app/store'
import { initSockets } from './services/socket'
import { WalletContextProvider } from './contexts/WalletContext'
import App from './App'
import './index.css'

// Initialize WebSockets
try {
  initSockets()
} catch (e) {
  console.error("Socket initialization failed", e)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
  </Provider>,
)
