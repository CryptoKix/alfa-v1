/**
 * Meteora DLMM SDK instruction builder
 * Wraps @meteora-ag/dlmm to build unsigned transactions
 */

const { Connection, PublicKey, VersionedTransaction, TransactionMessage } = require('@solana/web3.js');
const DLMM = require('@meteora-ag/dlmm').default;
const BN = require('bn.js');

// RPC endpoint (can be overridden via env)
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

// Strategy types map to DLMM strategy kinds
const StrategyType = {
  spot: { type: 'Spot' },
  curve: { type: 'Curve' },
  bidask: { type: 'BidAsk' }
};

class MeteoraInstructionBuilder {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    this.dlmmCache = new Map(); // Cache DLMM instances by pool address
  }

  async getDLMM(poolAddress) {
    if (this.dlmmCache.has(poolAddress)) {
      return this.dlmmCache.get(poolAddress);
    }
    const dlmm = await DLMM.create(this.connection, new PublicKey(poolAddress));
    this.dlmmCache.set(poolAddress, dlmm);
    return dlmm;
  }

  /**
   * Build transaction to create position and add liquidity by strategy
   */
  async buildCreatePosition(params) {
    const {
      poolAddress,
      userWallet,
      totalXAmount,
      totalYAmount,
      strategyType = 'spot',
      minBinId,
      maxBinId
    } = params;

    const dlmm = await this.getDLMM(poolAddress);
    const user = new PublicKey(userWallet);

    // Generate position keypair (user needs to sign for this)
    const positionKeypair = require('@solana/web3.js').Keypair.generate();

    // Build strategy parameters
    const strategyParams = {
      maxBinId,
      minBinId,
      strategyType: StrategyType[strategyType] || StrategyType.spot
    };

    // Get active bin for price reference
    const activeBin = await dlmm.getActiveBin();

    // Create position and add liquidity
    const createPositionTx = await dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionKeypair.publicKey,
      user,
      totalXAmount: new BN(totalXAmount),
      totalYAmount: new BN(totalYAmount),
      strategy: strategyParams
    });

    // Serialize the transaction
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    // Build versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: createPositionTx.instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      positionPubkey: positionKeypair.publicKey.toBase58(),
      positionSecret: Buffer.from(positionKeypair.secretKey).toString('base64'),
      activeBinId: activeBin.binId,
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build transaction to add liquidity to existing position
   */
  async buildAddLiquidity(params) {
    const {
      poolAddress,
      positionPubkey,
      userWallet,
      totalXAmount,
      totalYAmount,
      strategyType = 'spot'
    } = params;

    const dlmm = await this.getDLMM(poolAddress);
    const user = new PublicKey(userWallet);
    const position = new PublicKey(positionPubkey);

    // Get position info to determine bin range
    const positionInfo = await dlmm.getPosition(position);

    const strategyParams = {
      maxBinId: positionInfo.upperBinId,
      minBinId: positionInfo.lowerBinId,
      strategyType: StrategyType[strategyType] || StrategyType.spot
    };

    const addLiquidityTx = await dlmm.addLiquidityByStrategy({
      positionPubKey: position,
      user,
      totalXAmount: new BN(totalXAmount),
      totalYAmount: new BN(totalYAmount),
      strategy: strategyParams
    });

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: addLiquidityTx.instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build transaction to remove liquidity from position
   */
  async buildRemoveLiquidity(params) {
    const {
      poolAddress,
      positionPubkey,
      userWallet,
      bps = 10000, // 100% by default
      shouldClaimAndClose = false
    } = params;

    const dlmm = await this.getDLMM(poolAddress);
    const user = new PublicKey(userWallet);
    const position = new PublicKey(positionPubkey);

    // Get position bin data
    const positionInfo = await dlmm.getPosition(position);
    const binIds = positionInfo.positionData.positionBinData.map(bin => bin.binId);

    const removeLiquidityTx = await dlmm.removeLiquidity({
      position,
      user,
      binIds,
      bps: new BN(bps),
      shouldClaimAndClose
    });

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: removeLiquidityTx.instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build transaction to claim all swap fees
   */
  async buildClaimFees(params) {
    const {
      poolAddress,
      positionPubkey,
      userWallet
    } = params;

    const dlmm = await this.getDLMM(poolAddress);
    const user = new PublicKey(userWallet);
    const position = new PublicKey(positionPubkey);

    const claimTx = await dlmm.claimAllSwapFee({
      owner: user,
      position
    });

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: claimTx.instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build transaction to close position (remove all + claim + close)
   */
  async buildClosePosition(params) {
    const {
      poolAddress,
      positionPubkey,
      userWallet
    } = params;

    const dlmm = await this.getDLMM(poolAddress);
    const user = new PublicKey(userWallet);
    const position = new PublicKey(positionPubkey);

    // Get position bin data
    const positionInfo = await dlmm.getPosition(position);
    const binIds = positionInfo.positionData.positionBinData.map(bin => bin.binId);

    // Remove 100% liquidity with claim and close
    const closeTx = await dlmm.removeLiquidity({
      position,
      user,
      binIds,
      bps: new BN(10000), // 100%
      shouldClaimAndClose: true
    });

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: closeTx.instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Get pool info including active bin, bin step, and token info
   */
  async getPoolInfo(poolAddress) {
    const dlmm = await this.getDLMM(poolAddress);
    const activeBin = await dlmm.getActiveBin();

    return {
      address: poolAddress,
      tokenX: {
        mint: dlmm.tokenX.publicKey.toBase58(),
        decimals: dlmm.tokenX.decimal
      },
      tokenY: {
        mint: dlmm.tokenY.publicKey.toBase58(),
        decimals: dlmm.tokenY.decimal
      },
      binStep: dlmm.lbPair.binStep,
      activeBinId: activeBin.binId,
      activePrice: activeBin.price,
      baseFactor: dlmm.lbPair.parameters.baseFactor
    };
  }

  /**
   * Get position details including current amounts and fees
   */
  async getPositionInfo(poolAddress, positionPubkey) {
    const dlmm = await this.getDLMM(poolAddress);
    const position = new PublicKey(positionPubkey);

    const positionInfo = await dlmm.getPosition(position);
    const activeBin = await dlmm.getActiveBin();

    // Calculate total amounts
    let totalX = new BN(0);
    let totalY = new BN(0);

    for (const binData of positionInfo.positionData.positionBinData) {
      totalX = totalX.add(binData.positionXAmount);
      totalY = totalY.add(binData.positionYAmount);
    }

    return {
      position: positionPubkey,
      lowerBinId: positionInfo.lowerBinId,
      upperBinId: positionInfo.upperBinId,
      activeBinId: activeBin.binId,
      totalXAmount: totalX.toString(),
      totalYAmount: totalY.toString(),
      feeX: positionInfo.positionData.feeX.toString(),
      feeY: positionInfo.positionData.feeY.toString(),
      inRange: activeBin.binId >= positionInfo.lowerBinId && activeBin.binId <= positionInfo.upperBinId
    };
  }

  /**
   * Calculate bin range for a given risk profile and current price
   */
  calculateBinRange(activeBinId, binStep, riskProfile) {
    // Risk profile definitions
    const profiles = {
      high: { rangePct: 0.075, bins: 15 },    // ~7.5% range, 10-20 bins
      medium: { rangePct: 0.20, bins: 40 },   // ~20% range, 30-50 bins
      low: { rangePct: 0.50, bins: 65 }       // ~50% range, 60-69 bins
    };

    const profile = profiles[riskProfile] || profiles.medium;

    // Calculate bin range based on percentage
    // Each bin step = binStep basis points
    const binsForRange = Math.floor((profile.rangePct * 10000) / binStep);
    const numBins = Math.min(Math.max(binsForRange, profile.bins), 69); // Max 69 bins

    const halfBins = Math.floor(numBins / 2);
    const minBinId = activeBinId - halfBins;
    const maxBinId = activeBinId + halfBins;

    return {
      minBinId,
      maxBinId,
      numBins: maxBinId - minBinId + 1,
      rangePct: profile.rangePct * 100
    };
  }
}

module.exports = MeteoraInstructionBuilder;
