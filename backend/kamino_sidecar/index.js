/**
 * Kamino Finance Sidecar Service
 * Express server wrapping Kamino kLend SDK for yield operations
 *
 * Port: 5004 (default)
 */

require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { KaminoMarket, KaminoAction, PROGRAM_ID } = require('@kamino-finance/klend-sdk');
const BN = require('bn.js');
const Decimal = require('decimal.js');

const app = express();
const PORT = process.env.KAMINO_SIDECAR_PORT || 5004;

// Initialize Solana connection
const RPC_URL = process.env.HELIUS_RPC_URL || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Kamino market address (mainnet)
const KAMINO_MAIN_MARKET = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');

// Cache for market data
let marketCache = {
  market: null,
  lastUpdate: 0,
  ttl: 60000 // 1 minute cache
};

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// HELPERS
// ============================================================================

async function getMarket(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && marketCache.market && (now - marketCache.lastUpdate) < marketCache.ttl) {
    return marketCache.market;
  }

  console.log('[Kamino] Loading market data...');
  const market = await KaminoMarket.load(connection, KAMINO_MAIN_MARKET, PROGRAM_ID);
  await market.loadReserves();

  marketCache.market = market;
  marketCache.lastUpdate = now;

  console.log(`[Kamino] Loaded ${market.reserves.size} reserves`);
  return market;
}

function getReserveByMint(market, mintAddress) {
  for (const [address, reserve] of market.reserves) {
    if (reserve.getLiquidityMint().toBase58() === mintAddress) {
      return { address, reserve };
    }
  }
  return null;
}

function getReserveByAddress(market, reserveAddress) {
  return market.reserves.get(reserveAddress);
}

// ============================================================================
// HEALTH & STATUS
// ============================================================================

app.get('/health', async (req, res) => {
  try {
    // Quick health check - verify connection
    const slot = await connection.getSlot();
    res.json({
      status: 'ok',
      service: 'kamino-sidecar',
      protocol: 'kamino',
      slot,
      rpc: RPC_URL.substring(0, 30) + '...'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'kamino-sidecar',
      error: error.message
    });
  }
});

// ============================================================================
// MARKET DATA
// ============================================================================

/**
 * Get all lending markets/reserves
 * GET /markets
 */
app.get('/markets', async (req, res) => {
  try {
    const market = await getMarket();
    const reserves = [];

    for (const [address, reserve] of market.reserves) {
      const stats = reserve.getReserveStats();
      const config = reserve.state.config;

      reserves.push({
        address: address,
        mint: reserve.getLiquidityMint().toBase58(),
        symbol: reserve.getTokenSymbol() || 'UNKNOWN',
        decimals: reserve.state.liquidity.mintDecimals,
        supplyApy: stats.supplyInterestAPY * 100,
        borrowApy: stats.borrowInterestAPY * 100,
        totalSupply: stats.totalSupply.toString(),
        totalBorrow: stats.totalBorrows.toString(),
        availableLiquidity: stats.availableLiquidity.toString(),
        utilizationRate: stats.utilizationRatio * 100,
        ltv: config.loanToValuePct / 100,
        liquidationThreshold: config.liquidationThresholdPct / 100
      });
    }

    res.json({
      success: true,
      marketAddress: KAMINO_MAIN_MARKET.toBase58(),
      reserves,
      count: reserves.length
    });
  } catch (error) {
    console.error('[Kamino] Get markets error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get specific reserve info
 * GET /reserve/:mintOrAddress
 */
app.get('/reserve/:mintOrAddress', async (req, res) => {
  try {
    const market = await getMarket();
    const { mintOrAddress } = req.params;

    let reserveData = getReserveByMint(market, mintOrAddress);

    if (!reserveData) {
      const reserve = getReserveByAddress(market, mintOrAddress);
      if (reserve) {
        reserveData = { address: mintOrAddress, reserve };
      }
    }

    if (!reserveData) {
      return res.status(404).json({ success: false, error: 'Reserve not found' });
    }

    const { address, reserve } = reserveData;
    const stats = reserve.getReserveStats();

    res.json({
      success: true,
      reserve: {
        address,
        mint: reserve.getLiquidityMint().toBase58(),
        symbol: reserve.getTokenSymbol() || 'UNKNOWN',
        decimals: reserve.state.liquidity.mintDecimals,
        supplyApy: stats.supplyInterestAPY * 100,
        borrowApy: stats.borrowInterestAPY * 100,
        totalSupply: stats.totalSupply.toString(),
        totalBorrow: stats.totalBorrows.toString(),
        availableLiquidity: stats.availableLiquidity.toString(),
        utilizationRate: stats.utilizationRatio * 100,
        cTokenMint: reserve.state.collateral.mintPubkey.toBase58(),
        cTokenSupply: reserve.state.collateral.mintTotalSupply.toString()
      }
    });
  } catch (error) {
    console.error('[Kamino] Get reserve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// USER POSITIONS
// ============================================================================

/**
 * Get user's lending positions
 * GET /positions/:wallet
 */
app.get('/positions/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const market = await getMarket();
    const userPubkey = new PublicKey(wallet);

    // Get user's obligations (positions)
    const obligations = await market.getAllUserObligations(userPubkey);

    const positions = obligations.map(obligation => {
      const deposits = obligation.state.deposits.map(d => ({
        reserve: d.depositReserve.toBase58(),
        depositedAmount: d.depositedAmount.toString(),
        marketValue: d.marketValueSf.toString()
      }));

      const borrows = obligation.state.borrows.map(b => ({
        reserve: b.borrowReserve.toBase58(),
        borrowedAmount: b.borrowedAmountSf.toString(),
        marketValue: b.marketValueSf.toString()
      }));

      return {
        obligationAddress: obligation.state.obligationAddress?.toBase58(),
        deposits,
        borrows,
        depositedValue: obligation.getDepositedValue().toString(),
        borrowedValue: obligation.getBorrowedValue().toString(),
        healthFactor: obligation.getHealthFactor()
      };
    });

    res.json({ success: true, wallet, positions, count: positions.length });
  } catch (error) {
    console.error('[Kamino] Get positions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TRANSACTION BUILDING
// ============================================================================

/**
 * Build deposit transaction
 * POST /build/deposit
 * Body: { reserveAddress, amount, userWallet }
 */
app.post('/build/deposit', async (req, res) => {
  try {
    const { reserveAddress, vaultAddress, amount, userWallet, depositToken } = req.body;

    // Support both reserveAddress and vaultAddress (vaultAddress for consistency with other protocols)
    const targetReserve = reserveAddress || vaultAddress;

    if (!targetReserve || !amount || !userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: reserveAddress/vaultAddress, amount, userWallet'
      });
    }

    const market = await getMarket();
    const userPubkey = new PublicKey(userWallet);

    // Find reserve by address or mint
    let reserve = getReserveByAddress(market, targetReserve);
    let reserveAddr = targetReserve;

    if (!reserve) {
      const byMint = getReserveByMint(market, depositToken || targetReserve);
      if (byMint) {
        reserve = byMint.reserve;
        reserveAddr = byMint.address;
      }
    }

    if (!reserve) {
      return res.status(404).json({ success: false, error: 'Reserve not found' });
    }

    // Convert amount to lamports/base units
    const decimals = reserve.state.liquidity.mintDecimals;
    const amountBN = new BN(new Decimal(amount).mul(new Decimal(10).pow(decimals)).floor().toString());

    console.log(`[Kamino] Building deposit: ${amount} to ${reserveAddr}`);

    // Build deposit action
    const depositAction = await KaminoAction.buildDepositTxns(
      market,
      amountBN,
      reserve.getLiquidityMint(),
      userPubkey,
      new PublicKey(reserveAddr)
    );

    // Get setup and cleanup instructions
    const setupIxs = await depositAction.getSetupIxs();
    const depositIxs = await depositAction.getDepositIxs();
    const cleanupIxs = await depositAction.getCleanupIxs();

    // Combine all instructions into a transaction
    const transaction = new Transaction();

    // Add setup instructions
    for (const ix of setupIxs) {
      transaction.add(ix);
    }

    // Add deposit instructions
    for (const ix of depositIxs) {
      transaction.add(ix);
    }

    // Add cleanup instructions
    for (const ix of cleanupIxs) {
      transaction.add(ix);
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = userPubkey;

    // Serialize to base64
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const transactionBase64 = serialized.toString('base64');

    // Estimate shares received
    const cTokenRatio = reserve.getCTokenExchangeRate();
    const estimatedShares = new Decimal(amount).div(cTokenRatio).toString();

    res.json({
      success: true,
      transaction: transactionBase64,
      reserveAddress: reserveAddr,
      amount: amount,
      estimatedShares,
      blockhash,
      lastValidBlockHeight
    });
  } catch (error) {
    console.error('[Kamino] Build deposit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build withdraw transaction
 * POST /build/withdraw
 * Body: { reserveAddress, shares, userWallet }
 */
app.post('/build/withdraw', async (req, res) => {
  try {
    const { reserveAddress, vaultAddress, shares, amount, userWallet } = req.body;

    const targetReserve = reserveAddress || vaultAddress;
    const withdrawAmount = shares || amount;

    if (!targetReserve || !withdrawAmount || !userWallet) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: reserveAddress/vaultAddress, shares/amount, userWallet'
      });
    }

    const market = await getMarket();
    const userPubkey = new PublicKey(userWallet);

    // Find reserve
    let reserve = getReserveByAddress(market, targetReserve);
    let reserveAddr = targetReserve;

    if (!reserve) {
      const byMint = getReserveByMint(market, targetReserve);
      if (byMint) {
        reserve = byMint.reserve;
        reserveAddr = byMint.address;
      }
    }

    if (!reserve) {
      return res.status(404).json({ success: false, error: 'Reserve not found' });
    }

    // Convert shares to base units
    const decimals = reserve.state.liquidity.mintDecimals;
    const sharesBN = new BN(new Decimal(withdrawAmount).mul(new Decimal(10).pow(decimals)).floor().toString());

    console.log(`[Kamino] Building withdraw: ${withdrawAmount} shares from ${reserveAddr}`);

    // Build withdraw action
    const withdrawAction = await KaminoAction.buildWithdrawTxns(
      market,
      sharesBN,
      reserve.getLiquidityMint(),
      userPubkey,
      new PublicKey(reserveAddr)
    );

    // Get instructions
    const setupIxs = await withdrawAction.getSetupIxs();
    const withdrawIxs = await withdrawAction.getWithdrawIxs();
    const cleanupIxs = await withdrawAction.getCleanupIxs();

    // Build transaction
    const transaction = new Transaction();

    for (const ix of setupIxs) {
      transaction.add(ix);
    }
    for (const ix of withdrawIxs) {
      transaction.add(ix);
    }
    for (const ix of cleanupIxs) {
      transaction.add(ix);
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = userPubkey;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    const transactionBase64 = serialized.toString('base64');

    // Estimate tokens received
    const cTokenRatio = reserve.getCTokenExchangeRate();
    const estimatedAmount = new Decimal(withdrawAmount).mul(cTokenRatio).toString();

    res.json({
      success: true,
      transaction: transactionBase64,
      reserveAddress: reserveAddr,
      shares: withdrawAmount,
      estimatedAmount,
      blockhash,
      lastValidBlockHeight
    });
  } catch (error) {
    console.error('[Kamino] Build withdraw error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get deposit quote (estimated shares)
 * POST /quote/deposit
 * Body: { reserveAddress, amount }
 */
app.post('/quote/deposit', async (req, res) => {
  try {
    const { reserveAddress, amount } = req.body;

    if (!reserveAddress || !amount) {
      return res.status(400).json({ success: false, error: 'Missing reserveAddress or amount' });
    }

    const market = await getMarket();
    let reserve = getReserveByAddress(market, reserveAddress);

    if (!reserve) {
      const byMint = getReserveByMint(market, reserveAddress);
      if (byMint) {
        reserve = byMint.reserve;
      }
    }

    if (!reserve) {
      return res.status(404).json({ success: false, error: 'Reserve not found' });
    }

    const cTokenRatio = reserve.getCTokenExchangeRate();
    const estimatedShares = new Decimal(amount).div(cTokenRatio).toString();
    const stats = reserve.getReserveStats();

    res.json({
      success: true,
      amount,
      estimatedShares,
      currentApy: stats.supplyInterestAPY * 100,
      exchangeRate: cTokenRatio.toString()
    });
  } catch (error) {
    console.error('[Kamino] Deposit quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get withdraw quote (estimated tokens)
 * POST /quote/withdraw
 * Body: { reserveAddress, shares }
 */
app.post('/quote/withdraw', async (req, res) => {
  try {
    const { reserveAddress, shares } = req.body;

    if (!reserveAddress || !shares) {
      return res.status(400).json({ success: false, error: 'Missing reserveAddress or shares' });
    }

    const market = await getMarket();
    let reserve = getReserveByAddress(market, reserveAddress);

    if (!reserve) {
      const byMint = getReserveByMint(market, reserveAddress);
      if (byMint) {
        reserve = byMint.reserve;
      }
    }

    if (!reserve) {
      return res.status(404).json({ success: false, error: 'Reserve not found' });
    }

    const cTokenRatio = reserve.getCTokenExchangeRate();
    const estimatedAmount = new Decimal(shares).mul(cTokenRatio).toString();

    res.json({
      success: true,
      shares,
      estimatedAmount,
      exchangeRate: cTokenRatio.toString()
    });
  } catch (error) {
    console.error('[Kamino] Withdraw quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`[Kamino Sidecar] Running on port ${PORT}`);
  console.log(`[Kamino Sidecar] RPC: ${RPC_URL.substring(0, 40)}...`);
  console.log(`[Kamino Sidecar] Market: ${KAMINO_MAIN_MARKET.toBase58()}`);

  // Pre-load market data
  getMarket().then(() => {
    console.log('[Kamino Sidecar] Market data pre-loaded');
  }).catch(err => {
    console.error('[Kamino Sidecar] Failed to pre-load market:', err.message);
  });
});
