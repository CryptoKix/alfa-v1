/**
 * Hook for managing wallet mode (browser vs server) and executing transactions.
 */

import { useCallback, useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAppSelector, useAppDispatch } from '@/app/hooks'
import { setWalletMode, WalletMode } from '@/features/wallet/walletSlice'
import {
  buildSwapTransaction,
  buildLimitOrderTransaction,
  signAndSubmitSwap,
  signAndSubmitLimitOrder,
  executeServerTrade,
  executeServerTransfer,
  SwapParams,
  LimitOrderParams,
  SubmitResult
} from '@/services/transactions'

export interface UseWalletModeReturn {
  mode: WalletMode
  setMode: (mode: WalletMode) => void
  browserWalletConnected: boolean
  browserWalletAddress: string | null
  serverWalletAddress: string | null
  sessionKeyActive: boolean
  activeWalletAddress: string | null
  canUseBrowserWallet: boolean
  canUseSessionKey: boolean
  executeSwap: (params: Omit<SwapParams, 'userPublicKey'> & { strategy?: string }) => Promise<SubmitResult>
  executeLimitOrder: (params: Omit<LimitOrderParams, 'userPublicKey'>) => Promise<SubmitResult>
  executeTransfer: (params: { recipient: string; amount: number; mint?: string }) => Promise<SubmitResult>
}

export function useWalletMode(): UseWalletModeReturn {
  const wallet = useWallet()
  const dispatch = useAppDispatch()

  const {
    mode,
    browserWalletConnected,
    browserWalletAddress,
    serverWalletAddress,
    sessionKeyActive,
    sessionKeyInfo
  } = useAppSelector(state => state.wallet)

  const setMode = useCallback((newMode: WalletMode) => {
    dispatch(setWalletMode(newMode))
  }, [dispatch])

  const canUseBrowserWallet = useMemo(() => {
    return browserWalletConnected && !!browserWalletAddress && !!wallet.signTransaction
  }, [browserWalletConnected, browserWalletAddress, wallet.signTransaction])

  const canUseSessionKey = useMemo(() => {
    return sessionKeyActive && sessionKeyInfo !== null && sessionKeyInfo.expiresAt > Date.now()
  }, [sessionKeyActive, sessionKeyInfo])

  const activeWalletAddress = useMemo(() => {
    if (mode === 'browser' && browserWalletAddress) {
      return browserWalletAddress
    }
    return serverWalletAddress
  }, [mode, browserWalletAddress, serverWalletAddress])

  /**
   * Execute a swap transaction based on the current wallet mode.
   */
  const executeSwap = useCallback(async (
    params: Omit<SwapParams, 'userPublicKey'> & { strategy?: string }
  ): Promise<SubmitResult> => {
    try {
      if (mode === 'browser' && canUseBrowserWallet) {
        // Browser wallet mode - sign with browser extension
        const buildResponse = await buildSwapTransaction({
          ...params,
          userPublicKey: browserWalletAddress!
        })

        return await signAndSubmitSwap(wallet, buildResponse, {
          ...params,
          userPublicKey: browserWalletAddress!
        })
      } else {
        // Server wallet mode - sign with server keypair
        const result = await executeServerTrade({
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          slippageBps: params.slippageBps,
          strategy: params.strategy
        })

        return {
          success: result.success,
          signature: result.signature,
          explorerUrl: result.signature ? `https://solscan.io/tx/${result.signature}` : undefined,
          error: result.error
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [mode, canUseBrowserWallet, browserWalletAddress, wallet])

  /**
   * Execute a limit order based on the current wallet mode.
   */
  const executeLimitOrder = useCallback(async (
    params: Omit<LimitOrderParams, 'userPublicKey'>
  ): Promise<SubmitResult> => {
    try {
      if (mode === 'browser' && canUseBrowserWallet) {
        const buildResponse = await buildLimitOrderTransaction({
          ...params,
          userPublicKey: browserWalletAddress!
        })

        return await signAndSubmitLimitOrder(wallet, buildResponse, {
          ...params,
          userPublicKey: browserWalletAddress!
        })
      } else {
        // Server wallet mode
        const response = await fetch('/api/limit/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            amount: params.amount,
            price: params.price
          })
        })

        const data = await response.json()
        if (data.error) {
          return { success: false, error: data.error }
        }

        return {
          success: true,
          signature: data.signature,
          explorerUrl: data.signature ? `https://solscan.io/tx/${data.signature}` : undefined
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [mode, canUseBrowserWallet, browserWalletAddress, wallet])

  /**
   * Execute a transfer based on the current wallet mode.
   * Note: For browser mode, transfers require additional implementation.
   */
  const executeTransfer = useCallback(async (
    params: { recipient: string; amount: number; mint?: string }
  ): Promise<SubmitResult> => {
    try {
      // Currently only server mode is fully implemented for transfers
      // Browser mode transfer would need transaction building UI
      const result = await executeServerTransfer(params)

      return {
        success: result.success,
        signature: result.signature,
        explorerUrl: result.signature ? `https://solscan.io/tx/${result.signature}` : undefined,
        error: result.error
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [])

  return {
    mode,
    setMode,
    browserWalletConnected,
    browserWalletAddress,
    serverWalletAddress,
    sessionKeyActive,
    activeWalletAddress,
    canUseBrowserWallet,
    canUseSessionKey,
    executeSwap,
    executeLimitOrder,
    executeTransfer
  }
}
