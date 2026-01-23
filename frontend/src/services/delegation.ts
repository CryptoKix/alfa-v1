/**
 * Session key delegation services for browser wallet bot automation.
 */

import { Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'

// Generic wallet interface that works with both Solana and Jupiter adapters
export interface WalletAdapter {
  publicKey: PublicKey | null
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>
}

export interface SessionKeyInfo {
  sessionPubkey: string
  expiresAt: number
  permissions: {
    maxTradeSize?: number
    allowedTokens?: string[]
  }
  createdAt?: string
}

export interface CreateSessionResult {
  success: boolean
  sessionPubkey?: string
  expiresAt?: number
  permissions?: SessionKeyInfo['permissions']
  error?: string
}

/**
 * Create a new session key delegation.
 *
 * Flow:
 * 1. Generate ephemeral keypair on the frontend
 * 2. Sign a delegation message with the browser wallet
 * 3. Send session key info to backend for encrypted storage
 */
export async function createSessionKey(
  wallet: WalletAdapter,
  options: {
    durationHours?: number
    maxTradeSize?: number
    allowedTokens?: string[]
  } = {}
): Promise<CreateSessionResult> {
  if (!wallet.publicKey || !wallet.signMessage) {
    return { success: false, error: 'Wallet not connected or does not support signing' }
  }

  const { durationHours = 24, maxTradeSize = 1000, allowedTokens = [] } = options

  try {
    // 1. Generate ephemeral keypair
    const sessionKeypair = Keypair.generate()
    const sessionPubkey = sessionKeypair.publicKey.toBase58()
    const sessionSecret = bs58.encode(sessionKeypair.secretKey)

    // 2. Create and sign delegation message
    const delegationMessage = new TextEncoder().encode(
      `TacTix Delegation: I authorize session key ${sessionPubkey} to sign transactions on behalf of ${wallet.publicKey.toBase58()} for ${durationHours} hours.`
    )

    const delegationSignature = await wallet.signMessage(delegationMessage)
    const delegationSigB58 = bs58.encode(delegationSignature)

    // 3. Send to backend
    const response = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userWallet: wallet.publicKey.toBase58(),
        sessionPubkey,
        sessionSecret,
        delegationSignature: delegationSigB58,
        permissions: {
          maxTradeSize,
          allowedTokens
        },
        durationHours
      })
    })

    const data = await response.json()

    if (data.error) {
      return { success: false, error: data.error }
    }

    return {
      success: true,
      sessionPubkey: data.sessionPubkey,
      expiresAt: data.expiresAt,
      permissions: data.permissions
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check session key status for the connected wallet.
 */
export async function getSessionKeyStatus(
  walletAddress: string
): Promise<{ active: boolean; info?: SessionKeyInfo }> {
  try {
    const response = await fetch(`/api/session/status?wallet=${encodeURIComponent(walletAddress)}`)
    const data = await response.json()

    if (data.active) {
      return {
        active: true,
        info: {
          sessionPubkey: data.sessionPubkey,
          expiresAt: data.expiresAt,
          permissions: data.permissions,
          createdAt: data.createdAt
        }
      }
    }

    return { active: false }
  } catch (error) {
    console.error('Failed to check session status:', error)
    return { active: false }
  }
}

/**
 * Revoke session key delegation.
 */
export async function revokeSessionKey(
  walletAddress: string,
  sessionPubkey?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/session/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userWallet: walletAddress,
        sessionPubkey
      })
    })

    const data = await response.json()

    if (data.error) {
      return { success: false, error: data.error }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Extend session key expiration.
 */
export async function extendSessionKey(
  walletAddress: string,
  sessionPubkey: string,
  additionalHours: number = 24
): Promise<{ success: boolean; newExpiresAt?: number; error?: string }> {
  try {
    const response = await fetch('/api/session/extend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userWallet: walletAddress,
        sessionPubkey,
        additionalHours
      })
    })

    const data = await response.json()

    if (data.error) {
      return { success: false, error: data.error }
    }

    return {
      success: true,
      newExpiresAt: data.newExpiresAt
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
