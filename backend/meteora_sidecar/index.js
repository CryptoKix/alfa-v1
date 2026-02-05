/**
 * Liquidity Sidecar Service
 * Express server wrapping Meteora DLMM and Orca Whirlpools SDKs for transaction building
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const MeteoraInstructionBuilder = require('./instruction_builder');
const OrcaInstructionBuilder = require('./orca_instruction_builder');

const app = express();
const PORT = process.env.LIQUIDITY_SIDECAR_PORT || process.env.METEORA_SIDECAR_PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize instruction builders
const meteoraBuilder = new MeteoraInstructionBuilder();
const orcaBuilder = new OrcaInstructionBuilder();

// ============================================================================
// HEALTH & STATUS
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'liquidity-sidecar', protocols: ['meteora', 'orca'] });
});

// ============================================================================
// METEORA DLMM ENDPOINTS (existing, kept for backward compatibility)
// ============================================================================

/**
 * Build create position transaction
 * POST /build/create-position
 * Body: { poolAddress, userWallet, totalXAmount, totalYAmount, strategyType, minBinId, maxBinId }
 */
app.post('/build/create-position', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildCreatePosition(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora create position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build add liquidity transaction
 * POST /build/add-liquidity
 */
app.post('/build/add-liquidity', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildAddLiquidity(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora add liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build remove liquidity transaction
 * POST /build/remove-liquidity
 */
app.post('/build/remove-liquidity', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildRemoveLiquidity(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora remove liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build claim fees transaction
 * POST /build/claim-fees
 */
app.post('/build/claim-fees', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildClaimFees(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora claim fees error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build close position transaction
 * POST /build/close-position
 */
app.post('/build/close-position', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildClosePosition(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora close position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get Meteora pool info
 * GET /pool/:address
 */
app.get('/pool/:address', async (req, res) => {
  try {
    const result = await meteoraBuilder.getPoolInfo(req.params.address);
    res.json({ success: true, pool: result });
  } catch (error) {
    console.error('[Sidecar] Meteora get pool error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get bin liquidity distribution around active bin
 * GET /pool/:address/bins
 */
app.get('/pool/:address/bins', async (req, res) => {
  try {
    const left = parseInt(req.query.left) || 35;
    const right = parseInt(req.query.right) || 35;
    const result = await meteoraBuilder.getBinsAroundActive(req.params.address, left, right);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora get bins error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get Meteora position info
 * GET /position/:poolAddress/:positionPubkey
 */
app.get('/position/:poolAddress/:positionPubkey', async (req, res) => {
  try {
    const result = await meteoraBuilder.getPositionInfo(
      req.params.poolAddress,
      req.params.positionPubkey
    );
    res.json({ success: true, position: result });
  } catch (error) {
    console.error('[Sidecar] Meteora get position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Calculate bin range for risk profile
 * POST /calculate-bins
 */
app.post('/calculate-bins', async (req, res) => {
  try {
    const { poolAddress, riskProfile } = req.body;
    const poolInfo = await meteoraBuilder.getPoolInfo(poolAddress);

    const binRange = meteoraBuilder.calculateBinRange(
      poolInfo.activeBinId,
      poolInfo.binStep,
      riskProfile
    );

    // Calculate prices from bin IDs
    // Meteora price = (1 + binStep/10000)^(binId - 8388608) for DLMM
    const basePriceFactor = 1 + poolInfo.binStep / 10000;
    const priceFromBin = (binId) => Math.pow(basePriceFactor, binId - 8388608);

    const currentPrice = priceFromBin(poolInfo.activeBinId);
    const priceMin = priceFromBin(binRange.minBinId);
    const priceMax = priceFromBin(binRange.maxBinId);

    res.json({
      success: true,
      activeBinId: poolInfo.activeBinId,
      binStep: poolInfo.binStep,
      // Original fields
      ...binRange,
      // Normalized fields for frontend
      rangeMin: binRange.minBinId,
      rangeMax: binRange.maxBinId,
      priceMin: priceMin,
      priceMax: priceMax,
      currentPrice: currentPrice,
      riskProfile: riskProfile || 'medium'
    });
  } catch (error) {
    console.error('[Sidecar] Meteora calculate bins error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// METEORA NAMESPACED ENDPOINTS (explicit /meteora prefix)
// ============================================================================

app.post('/meteora/build/create-position', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildCreatePosition(req.body);
    res.json({ success: true, protocol: 'meteora', ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora create position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/meteora/build/add-liquidity', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildAddLiquidity(req.body);
    res.json({ success: true, protocol: 'meteora', ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora add liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/meteora/build/remove-liquidity', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildRemoveLiquidity(req.body);
    res.json({ success: true, protocol: 'meteora', ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora remove liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/meteora/build/claim-fees', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildClaimFees(req.body);
    res.json({ success: true, protocol: 'meteora', ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora claim fees error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/meteora/build/close-position', async (req, res) => {
  try {
    const result = await meteoraBuilder.buildClosePosition(req.body);
    res.json({ success: true, protocol: 'meteora', ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora close position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/meteora/pool/:address', async (req, res) => {
  try {
    const result = await meteoraBuilder.getPoolInfo(req.params.address);
    res.json({ success: true, protocol: 'meteora', pool: result });
  } catch (error) {
    console.error('[Sidecar] Meteora get pool error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/meteora/pool/:address/bins', async (req, res) => {
  try {
    const left = parseInt(req.query.left) || 35;
    const right = parseInt(req.query.right) || 35;
    const result = await meteoraBuilder.getBinsAroundActive(req.params.address, left, right);
    res.json({ success: true, protocol: 'meteora', ...result });
  } catch (error) {
    console.error('[Sidecar] Meteora get bins error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/meteora/position/:poolAddress/:positionPubkey', async (req, res) => {
  try {
    const result = await meteoraBuilder.getPositionInfo(
      req.params.poolAddress,
      req.params.positionPubkey
    );
    res.json({ success: true, protocol: 'meteora', position: result });
  } catch (error) {
    console.error('[Sidecar] Meteora get position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/meteora/calculate-range', async (req, res) => {
  try {
    const { poolAddress, riskProfile } = req.body;
    const poolInfo = await meteoraBuilder.getPoolInfo(poolAddress);

    const binRange = meteoraBuilder.calculateBinRange(
      poolInfo.activeBinId,
      poolInfo.binStep,
      riskProfile
    );

    res.json({
      success: true,
      protocol: 'meteora',
      currentPriceIndex: poolInfo.activeBinId,
      priceSpacing: poolInfo.binStep,
      ...binRange
    });
  } catch (error) {
    console.error('[Sidecar] Meteora calculate range error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ORCA WHIRLPOOLS ENDPOINTS
// ============================================================================

/**
 * Get Orca whirlpool info
 * GET /orca/pool/:address
 */
app.get('/orca/pool/:address', async (req, res) => {
  try {
    const result = await orcaBuilder.getWhirlpoolInfo(req.params.address);
    res.json({ success: true, protocol: 'orca', pool: result });
  } catch (error) {
    console.error('[Sidecar] Orca get pool error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get tick data around current price
 * GET /orca/pool/:address/ticks
 * Query params: count (default 100)
 */
app.get('/orca/pool/:address/ticks', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 100;
    const result = await orcaBuilder.getTicksAroundCurrent(req.params.address, count);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca get ticks error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get Orca position info
 * GET /orca/position/:poolAddress/:positionPubkey
 */
app.get('/orca/position/:poolAddress/:positionPubkey', async (req, res) => {
  try {
    const result = await orcaBuilder.getPositionInfo(
      req.params.poolAddress,
      req.params.positionPubkey
    );
    res.json({ success: true, protocol: 'orca', position: result });
  } catch (error) {
    console.error('[Sidecar] Orca get position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Check if tick arrays need initialization
 * POST /orca/check-tick-arrays
 * Body: { poolAddress, tickLower, tickUpper }
 */
app.post('/orca/check-tick-arrays', async (req, res) => {
  try {
    const { poolAddress, tickLower, tickUpper } = req.body;
    const result = await orcaBuilder.initializeTickArraysIfNeeded(poolAddress, tickLower, tickUpper);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca check tick arrays error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build open position transaction
 * POST /orca/build/open-position
 * Body: { poolAddress, userWallet, tickLower, tickUpper, tokenAAmount?, tokenBAmount?, slippagePct? }
 */
app.post('/orca/build/open-position', async (req, res) => {
  try {
    const result = await orcaBuilder.buildOpenPosition(req.body);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca open position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build increase liquidity transaction
 * POST /orca/build/increase-liquidity
 * Body: { poolAddress, positionAddress, userWallet, tokenAAmount?, tokenBAmount?, slippagePct? }
 */
app.post('/orca/build/increase-liquidity', async (req, res) => {
  try {
    const result = await orcaBuilder.buildIncreaseLiquidity(req.body);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca increase liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build decrease liquidity transaction
 * POST /orca/build/decrease-liquidity
 * Body: { poolAddress, positionAddress, userWallet, liquidityAmount, slippagePct? }
 */
app.post('/orca/build/decrease-liquidity', async (req, res) => {
  try {
    const result = await orcaBuilder.buildDecreaseLiquidity(req.body);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca decrease liquidity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build collect fees transaction
 * POST /orca/build/collect-fees
 * Body: { poolAddress, positionAddress, userWallet }
 */
app.post('/orca/build/collect-fees', async (req, res) => {
  try {
    const result = await orcaBuilder.buildCollectFees(req.body);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca collect fees error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build collect rewards transaction
 * POST /orca/build/collect-rewards
 * Body: { poolAddress, positionAddress, userWallet, rewardIndex? }
 */
app.post('/orca/build/collect-rewards', async (req, res) => {
  try {
    const result = await orcaBuilder.buildCollectRewards(req.body);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca collect rewards error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Build close position transaction (includes collect fees, rewards, decrease liquidity)
 * POST /orca/build/close-position
 * Body: { poolAddress, positionAddress, userWallet, slippagePct? }
 */
app.post('/orca/build/close-position', async (req, res) => {
  try {
    const result = await orcaBuilder.buildClosePosition(req.body);
    res.json({ success: true, protocol: 'orca', ...result });
  } catch (error) {
    console.error('[Sidecar] Orca close position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Calculate tick range for risk profile
 * POST /orca/calculate-range
 * Body: { poolAddress, riskProfile }
 */
app.post('/orca/calculate-range', async (req, res) => {
  try {
    const { poolAddress, riskProfile } = req.body;
    const poolInfo = await orcaBuilder.getWhirlpoolInfo(poolAddress);

    const tickRange = orcaBuilder.calculateTickRange(
      poolInfo.currentTick,
      poolInfo.tickSpacing,
      riskProfile
    );

    res.json({
      success: true,
      protocol: 'orca',
      currentPriceIndex: poolInfo.currentTick,
      priceSpacing: poolInfo.tickSpacing,
      ...tickRange
    });
  } catch (error) {
    console.error('[Sidecar] Orca calculate range error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Liquidity Sidecar] Running on 127.0.0.1:${PORT}`);
  console.log(`[Liquidity Sidecar] Protocols: Meteora DLMM, Orca Whirlpools`);
});
