import { FC, ReactNode, useMemo, useCallback, useEffect } from 'react'
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { Connection, clusterApiUrl } from '@solana/web3.js'
import { useAppDispatch } from '@/app/hooks'
import { setBrowserWalletConnected, setServerWalletAddress } from '@/features/wallet/walletSlice'

import '@solana/wallet-adapter-react-ui/styles.css'

const HELIUS_RPC = import.meta.env.VITE_HELIUS_RPC || 'https://api.mainnet-beta.solana.com'

interface WalletContextProviderProps {
  children: ReactNode
}

const WalletConnectionSync: FC<{ children: ReactNode }> = ({ children }) => {
  const { connected, publicKey, disconnect } = useWallet()
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
  const endpoint = useMemo(() => HELIUS_RPC, [])

  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletConnectionSync>
            {children}
          </WalletConnectionSync>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export { useWallet, useConnection } from '@solana/wallet-adapter-react'
export { useWalletModal } from '@solana/wallet-adapter-react-ui'
