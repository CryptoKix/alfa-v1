/**
 * Orca Whirlpools SDK instruction builder
 * Wraps @orca-so/whirlpools-sdk to build unsigned transactions
 */

const { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { AnchorProvider, Wallet } = require('@coral-xyz/anchor');
const {
  WhirlpoolContext,
  buildWhirlpoolClient,
  buildDefaultAccountFetcher,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  PDAUtil,
  PoolUtil,
  PriceMath,
  TickUtil,
  ParsableWhirlpool,
  ParsablePosition,
  increaseLiquidityQuoteByInputToken,
  decreaseLiquidityQuoteByLiquidity,
  SwapQuote,
  IGNORE_CACHE
} = require('@orca-so/whirlpools-sdk');
const { Percentage, DecimalUtil } = require('@orca-so/common-sdk');
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const BN = require('bn.js');
const Decimal = require('decimal.js');

// RPC endpoint (can be overridden via env)
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

class OrcaInstructionBuilder {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    // Create a read-only wallet for building transactions
    this.readOnlyWallet = new Wallet(Keypair.generate());
    this.provider = new AnchorProvider(
      this.connection,
      this.readOnlyWallet,
      { commitment: 'confirmed' }
    );
    // Use buildDefaultAccountFetcher and withProvider for proper initialization
    this.fetcher = buildDefaultAccountFetcher(this.connection);
    this.ctx = WhirlpoolContext.withProvider(
      this.provider,
      ORCA_WHIRLPOOL_PROGRAM_ID,
      this.fetcher
    );
    this.client = buildWhirlpoolClient(this.ctx);
    this.whirlpoolCache = new Map();
  }

  /**
   * Fetch whirlpool data using the SDK's account fetcher
   */
  async getWhirlpoolData(poolAddress) {
    if (this.whirlpoolCache.has(poolAddress)) {
      return this.whirlpoolCache.get(poolAddress);
    }

    const poolPubkey = new PublicKey(poolAddress);
    const data = await this.fetcher.getPool(poolPubkey, IGNORE_CACHE);

    if (!data) {
      throw new Error(`Whirlpool not found: ${poolAddress}`);
    }

    this.whirlpoolCache.set(poolAddress, data);
    return data;
  }

  /**
   * Get token decimals by fetching mint account
   */
  async getTokenDecimals(mintAddress) {
    const mintPubkey = new PublicKey(mintAddress);
    const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
    if (mintInfo.value?.data?.parsed?.info?.decimals !== undefined) {
      return mintInfo.value.data.parsed.info.decimals;
    }
    return 9; // Default to 9 decimals
  }

  /**
   * Get whirlpool info including current tick, price, and token info
   */
  async getWhirlpoolInfo(poolAddress) {
    const data = await this.getWhirlpoolData(poolAddress);

    // Get token decimals
    const decimalsA = await this.getTokenDecimals(data.tokenMintA.toBase58());
    const decimalsB = await this.getTokenDecimals(data.tokenMintB.toBase58());

    // Calculate current price from sqrtPrice
    const price = PriceMath.sqrtPriceX64ToPrice(
      data.sqrtPrice,
      decimalsA,
      decimalsB
    );

    return {
      address: poolAddress,
      tokenA: {
        mint: data.tokenMintA.toBase58(),
        decimals: decimalsA
      },
      tokenB: {
        mint: data.tokenMintB.toBase58(),
        decimals: decimalsB
      },
      tickSpacing: data.tickSpacing,
      currentTick: data.tickCurrentIndex,
      currentSqrtPrice: data.sqrtPrice.toString(),
      currentPrice: price.toString(),
      liquidity: data.liquidity.toString(),
      feeRate: data.feeRate,
      protocolFeeRate: data.protocolFeeRate,
      // Rewards info
      rewardInfos: data.rewardInfos.map((r, i) => ({
        index: i,
        mint: r.mint.toBase58(),
        emissionsPerSecondX64: r.emissionsPerSecondX64.toString(),
        growthGlobalX64: r.growthGlobalX64.toString()
      })).filter(r => r.mint !== PublicKey.default.toBase58())
    };
  }

  /**
   * Get tick arrays around current price for visualization
   */
  async getTicksAroundCurrent(poolAddress, numTicks = 100) {
    const whirlpool = await this.getWhirlpool(poolAddress);
    const data = whirlpool.getData();
    const tickSpacing = data.tickSpacing;
    const currentTick = data.tickCurrentIndex;

    // Calculate tick range
    const halfRange = Math.floor(numTicks / 2) * tickSpacing;
    const tickLower = TickUtil.getInitializableTickIndex(currentTick - halfRange, tickSpacing);
    const tickUpper = TickUtil.getInitializableTickIndex(currentTick + halfRange, tickSpacing);

    const tokenAInfo = whirlpool.getTokenAInfo();
    const tokenBInfo = whirlpool.getTokenBInfo();

    // Get tick data
    const ticks = [];
    for (let tick = tickLower; tick <= tickUpper; tick += tickSpacing) {
      const price = PriceMath.tickIndexToPrice(tick, tokenAInfo.decimals, tokenBInfo.decimals);
      ticks.push({
        tickIndex: tick,
        price: price.toString(),
        initialized: false, // Would need to fetch tick array to know
        liquidityNet: '0'
      });
    }

    return {
      currentTick,
      tickSpacing,
      ticks
    };
  }

  /**
   * Initialize tick arrays if needed for a position
   * Returns instructions to initialize any uninitialized tick arrays
   */
  async initializeTickArraysIfNeeded(poolAddress, tickLower, tickUpper) {
    const whirlpool = await this.getWhirlpool(poolAddress);
    const data = whirlpool.getData();
    const tickSpacing = data.tickSpacing;

    const instructions = [];

    // Get tick array PDAs for lower and upper ticks
    const tickArrayLowerPda = PDAUtil.getTickArrayFromTickIndex(
      tickLower,
      tickSpacing,
      new PublicKey(poolAddress),
      ORCA_WHIRLPOOL_PROGRAM_ID
    );

    const tickArrayUpperPda = PDAUtil.getTickArrayFromTickIndex(
      tickUpper,
      tickSpacing,
      new PublicKey(poolAddress),
      ORCA_WHIRLPOOL_PROGRAM_ID
    );

    // Check if tick arrays exist
    const lowerExists = await this.connection.getAccountInfo(tickArrayLowerPda.publicKey);
    const upperExists = await this.connection.getAccountInfo(tickArrayUpperPda.publicKey);

    return {
      tickArrayLower: tickArrayLowerPda.publicKey.toBase58(),
      tickArrayUpper: tickArrayUpperPda.publicKey.toBase58(),
      lowerInitialized: !!lowerExists,
      upperInitialized: !!upperExists
    };
  }

  /**
   * Build open position transaction
   * Creates a new position with liquidity at specified tick range
   */
  async buildOpenPosition(params) {
    const {
      poolAddress,
      userWallet,
      tickLower,
      tickUpper,
      tokenAAmount, // Can be null if using tokenB
      tokenBAmount, // Can be null if using tokenA
      slippagePct = 1
    } = params;

    const whirlpool = await this.getWhirlpool(poolAddress);
    const data = whirlpool.getData();
    const user = new PublicKey(userWallet);

    // Validate tick range
    const tickSpacing = data.tickSpacing;
    if (tickLower % tickSpacing !== 0 || tickUpper % tickSpacing !== 0) {
      throw new Error(`Tick indices must be multiples of tickSpacing (${tickSpacing})`);
    }

    // Generate position mint
    const positionMintKeypair = Keypair.generate();

    // Calculate liquidity quote
    const tokenAInfo = whirlpool.getTokenAInfo();
    const tokenBInfo = whirlpool.getTokenBInfo();
    const slippage = Percentage.fromFraction(slippagePct * 100, 10000);

    let quote;
    if (tokenAAmount) {
      quote = increaseLiquidityQuoteByInputToken(
        tokenAInfo.mint,
        new Decimal(tokenAAmount),
        tickLower,
        tickUpper,
        slippage,
        whirlpool
      );
    } else if (tokenBAmount) {
      quote = increaseLiquidityQuoteByInputToken(
        tokenBInfo.mint,
        new Decimal(tokenBAmount),
        tickLower,
        tickUpper,
        slippage,
        whirlpool
      );
    } else {
      throw new Error('Either tokenAAmount or tokenBAmount must be provided');
    }

    // Build open position instruction
    const { positionMint, tx: openPositionTx } = await whirlpool.openPosition(
      tickLower,
      tickUpper,
      quote
    );

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    // Get instructions from transaction builder
    const instructions = openPositionTx.compressIx(true);

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      positionMint: positionMint.toBase58(),
      positionMintSecret: Buffer.from(positionMintKeypair.secretKey).toString('base64'),
      estimatedTokenA: quote.tokenEstA.toString(),
      estimatedTokenB: quote.tokenEstB.toString(),
      liquidity: quote.liquidityAmount.toString(),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build increase liquidity transaction
   */
  async buildIncreaseLiquidity(params) {
    const {
      poolAddress,
      positionAddress,
      userWallet,
      tokenAAmount,
      tokenBAmount,
      slippagePct = 1
    } = params;

    const whirlpool = await this.getWhirlpool(poolAddress);
    const position = await this.client.getPosition(new PublicKey(positionAddress));
    const positionData = position.getData();
    const user = new PublicKey(userWallet);

    const tokenAInfo = whirlpool.getTokenAInfo();
    const tokenBInfo = whirlpool.getTokenBInfo();
    const slippage = Percentage.fromFraction(slippagePct * 100, 10000);

    let quote;
    if (tokenAAmount) {
      quote = increaseLiquidityQuoteByInputToken(
        tokenAInfo.mint,
        new Decimal(tokenAAmount),
        positionData.tickLowerIndex,
        positionData.tickUpperIndex,
        slippage,
        whirlpool
      );
    } else {
      quote = increaseLiquidityQuoteByInputToken(
        tokenBInfo.mint,
        new Decimal(tokenBAmount),
        positionData.tickLowerIndex,
        positionData.tickUpperIndex,
        slippage,
        whirlpool
      );
    }

    const tx = await position.increaseLiquidity(quote);

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    const instructions = tx.compressIx(true);

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      estimatedTokenA: quote.tokenEstA.toString(),
      estimatedTokenB: quote.tokenEstB.toString(),
      liquidity: quote.liquidityAmount.toString(),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build decrease liquidity transaction
   */
  async buildDecreaseLiquidity(params) {
    const {
      poolAddress,
      positionAddress,
      userWallet,
      liquidityAmount, // BN amount or percentage as decimal (0.5 = 50%)
      slippagePct = 1
    } = params;

    const whirlpool = await this.getWhirlpool(poolAddress);
    const position = await this.client.getPosition(new PublicKey(positionAddress));
    const positionData = position.getData();
    const user = new PublicKey(userWallet);

    const slippage = Percentage.fromFraction(slippagePct * 100, 10000);

    // Calculate liquidity to remove
    let liquidityToRemove;
    if (typeof liquidityAmount === 'number' && liquidityAmount <= 1) {
      // Percentage
      liquidityToRemove = positionData.liquidity.mul(new BN(Math.floor(liquidityAmount * 10000))).div(new BN(10000));
    } else {
      liquidityToRemove = new BN(liquidityAmount);
    }

    const quote = decreaseLiquidityQuoteByLiquidity(
      liquidityToRemove,
      slippage,
      position,
      whirlpool
    );

    const tx = await position.decreaseLiquidity(quote);

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    const instructions = tx.compressIx(true);

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      estimatedTokenA: quote.tokenMinA.toString(),
      estimatedTokenB: quote.tokenMinB.toString(),
      liquidity: liquidityToRemove.toString(),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build collect fees transaction
   */
  async buildCollectFees(params) {
    const {
      poolAddress,
      positionAddress,
      userWallet
    } = params;

    const position = await this.client.getPosition(new PublicKey(positionAddress));
    const user = new PublicKey(userWallet);

    const tx = await position.collectFees();

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    const instructions = tx.compressIx(true);

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build collect rewards transaction
   * Orca supports multiple reward tokens per pool
   */
  async buildCollectRewards(params) {
    const {
      poolAddress,
      positionAddress,
      userWallet,
      rewardIndex = null // null = collect all, or specify 0, 1, 2
    } = params;

    const whirlpool = await this.getWhirlpool(poolAddress);
    const position = await this.client.getPosition(new PublicKey(positionAddress));
    const user = new PublicKey(userWallet);
    const data = whirlpool.getData();

    // Collect specified reward or all rewards
    const rewardIndicesToCollect = rewardIndex !== null
      ? [rewardIndex]
      : data.rewardInfos
          .map((r, i) => ({ mint: r.mint, index: i }))
          .filter(r => !r.mint.equals(PublicKey.default))
          .map(r => r.index);

    const instructions = [];
    for (const idx of rewardIndicesToCollect) {
      const tx = await position.collectReward(idx);
      instructions.push(...tx.compressIx(true));
    }

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      rewardsCollected: rewardIndicesToCollect,
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Build close position transaction
   * IMPORTANT: Must collect fees and rewards before closing!
   * This builds a sequence: collectFees -> collectRewards -> decreaseLiquidity -> closePosition
   */
  async buildClosePosition(params) {
    const {
      poolAddress,
      positionAddress,
      userWallet,
      slippagePct = 1
    } = params;

    const whirlpool = await this.getWhirlpool(poolAddress);
    const position = await this.client.getPosition(new PublicKey(positionAddress));
    const positionData = position.getData();
    const user = new PublicKey(userWallet);
    const data = whirlpool.getData();

    const allInstructions = [];

    // 1. Collect fees first
    const feesTx = await position.collectFees();
    allInstructions.push(...feesTx.compressIx(true));

    // 2. Collect all rewards
    const activeRewards = data.rewardInfos
      .map((r, i) => ({ mint: r.mint, index: i }))
      .filter(r => !r.mint.equals(PublicKey.default));

    for (const reward of activeRewards) {
      const rewardTx = await position.collectReward(reward.index);
      allInstructions.push(...rewardTx.compressIx(true));
    }

    // 3. Decrease all liquidity
    if (!positionData.liquidity.isZero()) {
      const slippage = Percentage.fromFraction(slippagePct * 100, 10000);
      const decreaseQuote = decreaseLiquidityQuoteByLiquidity(
        positionData.liquidity,
        slippage,
        position,
        whirlpool
      );
      const decreaseTx = await position.decreaseLiquidity(decreaseQuote);
      allInstructions.push(...decreaseTx.compressIx(true));
    }

    // 4. Close position
    const closeTx = await position.close();
    allInstructions.push(...closeTx.compressIx(true));

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: user,
      recentBlockhash: blockhash,
      instructions: allInstructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    return {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
      blockhash,
      lastValidBlockHeight
    };
  }

  /**
   * Get position info including amounts, fees, and rewards
   */
  async getPositionInfo(poolAddress, positionAddress) {
    const whirlpool = await this.getWhirlpool(poolAddress);
    const position = await this.client.getPosition(new PublicKey(positionAddress));
    const positionData = position.getData();
    const poolData = whirlpool.getData();

    const tokenAInfo = whirlpool.getTokenAInfo();
    const tokenBInfo = whirlpool.getTokenBInfo();

    // Calculate prices at tick boundaries
    const priceLower = PriceMath.tickIndexToPrice(
      positionData.tickLowerIndex,
      tokenAInfo.decimals,
      tokenBInfo.decimals
    );
    const priceUpper = PriceMath.tickIndexToPrice(
      positionData.tickUpperIndex,
      tokenAInfo.decimals,
      tokenBInfo.decimals
    );
    const currentPrice = PriceMath.sqrtPriceX64ToPrice(
      poolData.sqrtPrice,
      tokenAInfo.decimals,
      tokenBInfo.decimals
    );

    // Get token amounts in position
    const amounts = PoolUtil.getTokenAmountsFromLiquidity(
      positionData.liquidity,
      poolData.sqrtPrice,
      PriceMath.tickIndexToSqrtPriceX64(positionData.tickLowerIndex),
      PriceMath.tickIndexToSqrtPriceX64(positionData.tickUpperIndex),
      false
    );

    // Check if in range
    const inRange = poolData.tickCurrentIndex >= positionData.tickLowerIndex &&
                    poolData.tickCurrentIndex < positionData.tickUpperIndex;

    // Calculate distance from edges (as percentage of range)
    const rangeSize = positionData.tickUpperIndex - positionData.tickLowerIndex;
    let distanceFromEdge = 0;
    if (inRange) {
      const distFromLower = poolData.tickCurrentIndex - positionData.tickLowerIndex;
      const distFromUpper = positionData.tickUpperIndex - poolData.tickCurrentIndex;
      distanceFromEdge = Math.min(distFromLower, distFromUpper) / rangeSize;
    }

    return {
      positionAddress,
      positionMint: positionData.positionMint.toBase58(),
      poolAddress,
      tickLower: positionData.tickLowerIndex,
      tickUpper: positionData.tickUpperIndex,
      currentTick: poolData.tickCurrentIndex,
      liquidity: positionData.liquidity.toString(),
      tokenAAmount: amounts.tokenA.toString(),
      tokenBAmount: amounts.tokenB.toString(),
      priceLower: priceLower.toString(),
      priceUpper: priceUpper.toString(),
      currentPrice: currentPrice.toString(),
      inRange,
      distanceFromEdge,
      // Fees owed (would need update calculation for exact amounts)
      feeOwedA: positionData.feeOwedA.toString(),
      feeOwedB: positionData.feeOwedB.toString(),
      // Rewards
      rewardInfos: positionData.rewardInfos.map((r, i) => ({
        index: i,
        amountOwed: r.amountOwed.toString(),
        growthInsideCheckpoint: r.growthInsideCheckpoint.toString()
      }))
    };
  }

  /**
   * Calculate tick range for a given risk profile
   */
  calculateTickRange(currentTick, tickSpacing, riskProfile) {
    // Risk profile definitions (percentage of price range)
    const profiles = {
      high: { rangePct: 0.075 },   // ~7.5% range (tight, high fees)
      medium: { rangePct: 0.20 },  // ~20% range (balanced)
      low: { rangePct: 0.50 }      // ~50% range (wide, low IL)
    };

    const profile = profiles[riskProfile] || profiles.medium;

    // Convert percentage to tick range
    // Price ratio = 1.0001^ticks, so ticks = ln(ratio) / ln(1.0001)
    const ticksForRange = Math.floor(Math.log(1 + profile.rangePct) / Math.log(1.0001));
    const halfTicks = Math.floor(ticksForRange / 2);

    // Align to tick spacing
    const alignedHalf = Math.floor(halfTicks / tickSpacing) * tickSpacing;
    const alignedCurrent = Math.floor(currentTick / tickSpacing) * tickSpacing;

    const tickLower = alignedCurrent - alignedHalf;
    const tickUpper = alignedCurrent + alignedHalf;

    return {
      tickLower,
      tickUpper,
      tickCount: (tickUpper - tickLower) / tickSpacing,
      rangePct: profile.rangePct * 100
    };
  }
}

module.exports = OrcaInstructionBuilder;
