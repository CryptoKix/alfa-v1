/**
 * Transaction building and submission services for browser wallet integration.
 */

import { VersionedTransaction, PublicKey } from '@solana/web3.js'

// Generic wallet interface compatible with Jupiter/Solana adapters
interface WalletAdapter {
  publicKey: PublicKey | null
  signTransaction?: <T extends VersionedTransaction>(transaction: T) => Promise<T>
}

export interface SwapParams {
  inputMint: string
  outputMint: string
  amount: number
  slippageBps?: number
  userPublicKey: string
}

export interface TransferParams {
  recipient: string
  amount: number
  mint?: string
  userPublicKey: string
}

export interface LimitOrderParams {
  inputMint: string
  outputMint: string
  amount: number
  price: number
  userPublicKey: string
}

export interface BuildSwapResponse {
  transaction: string
  quote: any
  expectedOutput: number
  inputSymbol: string
  outputSymbol: string
}

export interface BuildTransferResponse {
  message: string
  recentBlockhash: string
  amount: number
  symbol: string
  recipient: string
}

export interface BuildLimitResponse {
  transaction: string
  orderPubKey: string
  inputSymbol: string
  outputSymbol: string
  makingAmount: number
  takingAmount: number
}

export interface SubmitResult {
  success: boolean
  signature?: string
  explorerUrl?: string
  error?: string
}

/**
 * Build an unsigned swap transaction for browser wallet signing.
 */
export async function buildSwapTransaction(params: SwapParams): Promise<BuildSwapResponse> {
  const response = await fetch('/api/tx/build-swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps || 50,
      userPublicKey: params.userPublicKey
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error)
  }

  return data
}

/**
 * Build an unsigned transfer transaction for browser wallet signing.
 */
export async function buildTransferTransaction(params: TransferParams): Promise<BuildTransferResponse> {
  const response = await fetch('/api/tx/build-transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: params.recipient,
      amount: params.amount,
      mint: params.mint || 'So11111111111111111111111111111111111111112',
      userPublicKey: params.userPublicKey
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error)
  }

  return data
}

/**
 * Build an unsigned limit order transaction for browser wallet signing.
 */
export async function buildLimitOrderTransaction(params: LimitOrderParams): Promise<BuildLimitResponse> {
  const response = await fetch('/api/tx/build-limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      price: params.price,
      userPublicKey: params.userPublicKey
    })
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(data.error)
  }

  return data
}

/**
 * Sign and submit a swap transaction using the browser wallet.
 */
export async function signAndSubmitSwap(
  wallet: WalletAdapter,
  buildResponse: BuildSwapResponse,
  params: SwapParams
): Promise<SubmitResult> {
  if (!wallet.signTransaction || !wallet.publicKey) {
    throw new Error('Wallet not connected')
  }

  try {
    // Decode the transaction
    const txBytes = Buffer.from(buildResponse.transaction, 'base64')
    const transaction = VersionedTransaction.deserialize(txBytes)

    // Sign with browser wallet
    const signedTx = await wallet.signTransaction(transaction)

    // Serialize the signed transaction
    const signedTxBytes = signedTx.serialize()
    const signedTxB64 = Buffer.from(signedTxBytes).toString('base64')

    // Submit to backend for logging and on-chain submission
    const submitResponse = await fetch('/api/tx/submit-signed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedTransaction: signedTxB64,
        txType: 'swap',
        metadata: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          amountOut: buildResponse.expectedOutput,
          slippageBps: params.slippageBps || 50,
          walletAddress: wallet.publicKey.toBase58()
        }
      })
    })

    const result = await submitResponse.json()
    if (result.error) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      signature: result.signature,
      explorerUrl: result.explorerUrl
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Sign and submit a limit order transaction using the browser wallet.
 */
export async function signAndSubmitLimitOrder(
  wallet: WalletAdapter,
  buildResponse: BuildLimitResponse,
  params: LimitOrderParams
): Promise<SubmitResult> {
  if (!wallet.signTransaction || !wallet.publicKey) {
    throw new Error('Wallet not connected')
  }

  try {
    const txBytes = Buffer.from(buildResponse.transaction, 'base64')
    const transaction = VersionedTransaction.deserialize(txBytes)
    const signedTx = await wallet.signTransaction(transaction)
    const signedTxBytes = signedTx.serialize()
    const signedTxB64 = Buffer.from(signedTxBytes).toString('base64')

    const submitResponse = await fetch('/api/tx/submit-signed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedTransaction: signedTxB64,
        txType: 'limit',
        metadata: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount,
          takingAmount: buildResponse.takingAmount,
          walletAddress: wallet.publicKey.toBase58()
        }
      })
    })

    const result = await submitResponse.json()
    if (result.error) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      signature: result.signature,
      explorerUrl: result.explorerUrl
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Execute a server-side trade (uses server keypair).
 */
export async function executeServerTrade(params: {
  inputMint: string
  outputMint: string
  amount: number
  slippageBps?: number
  priorityFee?: number
  strategy?: string
}): Promise<{ success: boolean; signature?: string; error?: string }> {
  const response = await fetch('/api/trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: params.slippageBps || 50,
      priorityFee: params.priorityFee || 0.001,
      strategy: params.strategy || 'Manual Swap'
    })
  })

  const data = await response.json()
  if (data.error) {
    return { success: false, error: data.error }
  }

  return { success: true, signature: data.signature }
}

/**
 * Execute a server-side transfer (uses server keypair).
 */
export async function executeServerTransfer(params: {
  recipient: string
  amount: number
  mint?: string
}): Promise<{ success: boolean; signature?: string; error?: string }> {
  const response = await fetch('/api/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: params.recipient,
      amount: params.amount,
      mint: params.mint || 'So11111111111111111111111111111111111111112'
    })
  })

  const data = await response.json()
  if (data.error) {
    return { success: false, error: data.error }
  }

  return { success: true, signature: data.signature }
}
