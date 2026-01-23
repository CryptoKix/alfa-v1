import { FC, ReactNode, useMemo, useEffect } from 'react'
import { UnifiedWalletProvider, useUnifiedWallet } from '@jup-ag/wallet-adapter'
import { useAppDispatch } from '@/app/hooks'
import { setBrowserWalletConnected, setServerWalletAddress } from '@/features/wallet/walletSlice'

interface WalletContextProviderProps {
  children: ReactNode
}

// Sync Jupiter wallet state to Redux
const WalletConnectionSync: FC<{ children: ReactNode }> = ({ children }) => {
  const { connected, publicKey } = useUnifiedWallet()
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(setBrowserWalletConnected({
      connected,
      address: publicKey?.toBase58() || null
    }))
  }, [connected, publicKey, dispatch])

  useEffect(() => {
    const fetchServerWallet = async () => {
      try {
        const res = await fetch('/api/wallet/server-address')
        const data = await res.json()
        if (data.address) {
          dispatch(setServerWalletAddress(data.address))
        }
      } catch (e) {
        console.error('Failed to fetch server wallet address:', e)
      }
    }
    fetchServerWallet()
  }, [dispatch])

  return <>{children}</>
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  const config = useMemo(() => ({
    autoConnect: true,
    env: 'mainnet-beta' as const,
    metadata: {
      name: 'TacTix.sol',
      description: 'Solana Trading Terminal',
      url: 'https://tactix.sol',
      iconUrls: ['/logo_concept_5.svg'],
    },
    notificationCallback: {
      onConnect: (props: { publicKey: string; walletName: string }) => {
        console.log(`[Jupiter Wallet] Connected: ${props.walletName} (${props.publicKey.slice(0, 8)}...)`)
      },
      onConnecting: (props: { walletName: string }) => {
        console.log(`[Jupiter Wallet] Connecting to ${props.walletName}...`)
      },
      onDisconnect: (props: { publicKey: string; walletName: string }) => {
        console.log(`[Jupiter Wallet] Disconnected: ${props.walletName}`)
      },
      onNotInstalled: (props: { walletName: string }) => {
        console.log(`[Jupiter Wallet] ${props.walletName} not installed`)
      },
    },
    walletlistExplanation: {
      href: 'https://station.jup.ag/docs/additional-topics/wallet-list',
    },
    theme: 'jupiter' as const,
    lang: 'en' as const,
  }), [])

  return (
    <UnifiedWalletProvider wallets={[]} config={config}>
      <WalletConnectionSync>
        {children}
      </WalletConnectionSync>
    </UnifiedWalletProvider>
  )
}

// Re-export Jupiter wallet hooks for use throughout the app
export { useUnifiedWallet, useUnifiedWalletContext } from '@jup-ag/wallet-adapter'

// Helper hook to get the active wallet address based on mode
import { useAppSelector } from '@/app/hooks'

export const useActiveWallet = () => {
  const { mode, browserWalletAddress, serverWalletAddress } = useAppSelector(state => state.wallet)
  const { connected, publicKey, signTransaction, signAllTransactions } = useUnifiedWallet()

  return {
    // The currently active wallet based on mode
    address: mode === 'browser' ? browserWalletAddress : serverWalletAddress,
    // Mode info
    mode,
    isServerMode: mode === 'server',
    isBrowserMode: mode === 'browser',
    // Browser wallet state (Jupiter)
    browserConnected: connected,
    browserAddress: publicKey?.toBase58() || null,
    // Server wallet state
    serverAddress: serverWalletAddress,
    // Signing functions (only available in browser mode)
    signTransaction: connected ? signTransaction : undefined,
    signAllTransactions: connected ? signAllTransactions : undefined,
  }
}

// Helper to determine if a trade should use Jupiter wallet confirmation
export const useShouldUseJupiterWallet = (tradeValueUsd: number) => {
  const {
    jupiterWalletEnabled,
    largeTradeThreshold,
    requireJupiterForLargeTrades,
    browserWalletConnected
  } = useAppSelector(state => state.wallet)

  const shouldUseJupiter =
    jupiterWalletEnabled &&
    requireJupiterForLargeTrades &&
    browserWalletConnected &&
    tradeValueUsd >= largeTradeThreshold

  return {
    shouldUseJupiter,
    threshold: largeTradeThreshold,
    isAboveThreshold: tradeValueUsd >= largeTradeThreshold,
    jupiterEnabled: jupiterWalletEnabled && browserWalletConnected,
  }
}
