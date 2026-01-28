/**
 * Meteora DLMM Sidecar Service
 * Express server wrapping the Meteora SDK for transaction building
 */

const express = require('express');
const cors = require('cors');
const MeteoraInstructionBuilder = require('./instruction_builder');

const app = express();
const PORT = process.env.METEORA_SIDECAR_PORT || 5002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize instruction builder
const builder = new MeteoraInstructionBuilder();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'meteora-sidecar' });
});

/**
 * Build create position transaction
 * POST /build/create-position
 * Body: { poolAddress, userWallet, totalXAmount, totalYAmount, strategyType, minBinId, maxBinId }
 */
app.post('/build/create-position', async (req, res) => {
  try {
    const result = await builder.buildCreatePosition(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Create position error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Build add liquidity transaction
 * POST /build/add-liquidity
 * Body: { poolAddress, positionPubkey, userWallet, totalXAmount, totalYAmount, strategyType }
 */
app.post('/build/add-liquidity', async (req, res) => {
  try {
    const result = await builder.buildAddLiquidity(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Add liquidity error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Build remove liquidity transaction
 * POST /build/remove-liquidity
 * Body: { poolAddress, positionPubkey, userWallet, bps?, shouldClaimAndClose? }
 */
app.post('/build/remove-liquidity', async (req, res) => {
  try {
    const result = await builder.buildRemoveLiquidity(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Remove liquidity error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Build claim fees transaction
 * POST /build/claim-fees
 * Body: { poolAddress, positionPubkey, userWallet }
 */
app.post('/build/claim-fees', async (req, res) => {
  try {
    const result = await builder.buildClaimFees(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Claim fees error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Build close position transaction
 * POST /build/close-position
 * Body: { poolAddress, positionPubkey, userWallet }
 */
app.post('/build/close-position', async (req, res) => {
  try {
    const result = await builder.buildClosePosition(req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Sidecar] Close position error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get pool info
 * GET /pool/:address
 */
app.get('/pool/:address', async (req, res) => {
  try {
    const result = await builder.getPoolInfo(req.params.address);
    res.json({ success: true, pool: result });
  } catch (error) {
    console.error('[Sidecar] Get pool error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get position info
 * GET /position/:poolAddress/:positionPubkey
 */
app.get('/position/:poolAddress/:positionPubkey', async (req, res) => {
  try {
    const result = await builder.getPositionInfo(
      req.params.poolAddress,
      req.params.positionPubkey
    );
    res.json({ success: true, position: result });
  } catch (error) {
    console.error('[Sidecar] Get position error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Calculate bin range for risk profile
 * POST /calculate-bins
 * Body: { poolAddress, riskProfile }
 */
app.post('/calculate-bins', async (req, res) => {
  try {
    const { poolAddress, riskProfile } = req.body;
    const poolInfo = await builder.getPoolInfo(poolAddress);

    const binRange = builder.calculateBinRange(
      poolInfo.activeBinId,
      poolInfo.binStep,
      riskProfile
    );

    res.json({
      success: true,
      activeBinId: poolInfo.activeBinId,
      binStep: poolInfo.binStep,
      ...binRange
    });
  } catch (error) {
    console.error('[Sidecar] Calculate bins error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[Meteora Sidecar] Running on port ${PORT}`);
});
