/**
 * Orca Whirlpools Sidecar Service
 * Runs on port 5003 - separate from Meteora sidecar (5002)
 */

// Load environment variables first
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { Connection, PublicKey } = require('@solana/web3.js')
const OrcaInstructionBuilder = require('./orca_instruction_builder')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.ORCA_SIDECAR_PORT || 5003
const RPC_URL = process.env.RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

// Initialize connection and Orca builder
const connection = new Connection(RPC_URL, 'confirmed')
let orcaBuilder = null

async function initOrca() {
  try {
    orcaBuilder = new OrcaInstructionBuilder()
    // Test connection by getting a known pool
    console.log('[Orca Sidecar] Initialized successfully')
    return true
  } catch (error) {
    console.error('[Orca Sidecar] Failed to initialize:', error.message)
    return false
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'orca-sidecar',
    port: PORT,
    initialized: !!orcaBuilder
  })
})

// Get whirlpool info
app.get('/pool/:address', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const poolInfo = await orcaBuilder.getWhirlpoolInfo(req.params.address)
    res.json(poolInfo)
  } catch (error) {
    console.error('[Orca] Get pool error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Get position info
app.get('/position/:poolAddress/:positionPubkey', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { poolAddress, positionPubkey } = req.params
    const positionInfo = await orcaBuilder.getPositionInfo(poolAddress, positionPubkey)
    res.json(positionInfo)
  } catch (error) {
    console.error('[Orca] Get position error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Build open position transaction
app.post('/build/open-position', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { poolAddress, tickLower, tickUpper, liquidity, wallet } = req.body

    if (!poolAddress || tickLower === undefined || tickUpper === undefined || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.buildOpenPosition({
      poolAddress,
      tickLower,
      tickUpper,
      liquidity,
      wallet
    })
    res.json(result)
  } catch (error) {
    console.error('[Orca] Build open position error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Build increase liquidity transaction
app.post('/build/increase-liquidity', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { positionPubkey, poolAddress, liquidityAmount, tokenMaxA, tokenMaxB, wallet } = req.body

    if (!positionPubkey || !poolAddress || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.buildIncreaseLiquidity({
      positionPubkey,
      poolAddress,
      liquidityAmount,
      tokenMaxA,
      tokenMaxB,
      wallet
    })
    res.json(result)
  } catch (error) {
    console.error('[Orca] Build increase liquidity error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Build decrease liquidity transaction
app.post('/build/decrease-liquidity', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { positionPubkey, poolAddress, liquidityAmount, tokenMinA, tokenMinB, wallet } = req.body

    if (!positionPubkey || !poolAddress || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.buildDecreaseLiquidity({
      positionPubkey,
      poolAddress,
      liquidityAmount,
      tokenMinA,
      tokenMinB,
      wallet
    })
    res.json(result)
  } catch (error) {
    console.error('[Orca] Build decrease liquidity error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Build collect fees transaction
app.post('/build/collect-fees', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { positionPubkey, poolAddress, wallet } = req.body

    if (!positionPubkey || !poolAddress || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.buildCollectFees({
      positionPubkey,
      poolAddress,
      wallet
    })
    res.json(result)
  } catch (error) {
    console.error('[Orca] Build collect fees error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Build collect rewards transaction
app.post('/build/collect-rewards', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { positionPubkey, poolAddress, rewardIndex, wallet } = req.body

    if (!positionPubkey || !poolAddress || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.buildCollectRewards({
      positionPubkey,
      poolAddress,
      rewardIndex: rewardIndex || 0,
      wallet
    })
    res.json(result)
  } catch (error) {
    console.error('[Orca] Build collect rewards error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Build close position transaction (full sequence: fees -> rewards -> decrease -> close)
app.post('/build/close-position', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { positionPubkey, poolAddress, wallet } = req.body

    if (!positionPubkey || !poolAddress || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.buildClosePosition({
      positionPubkey,
      poolAddress,
      wallet
    })
    res.json(result)
  } catch (error) {
    console.error('[Orca] Build close position error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Calculate tick range for a risk profile
app.post('/calculate-tick-range', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { poolAddress, riskProfile } = req.body

    if (!poolAddress) {
      return res.status(400).json({ error: 'Missing poolAddress' })
    }

    // Get pool info to get currentTick and tickSpacing
    const poolInfo = await orcaBuilder.getWhirlpoolInfo(poolAddress)
    if (!poolInfo) {
      return res.status(500).json({ error: 'Failed to get pool info' })
    }

    const currentTick = poolInfo.currentTick
    const tickSpacing = poolInfo.tickSpacing
    const currentPrice = parseFloat(poolInfo.currentPrice || '0')
    const profile = riskProfile || 'medium'

    // Use the builder's calculateTickRange method
    const result = orcaBuilder.calculateTickRange(currentTick, tickSpacing, profile)

    // Calculate price bounds from ticks relative to current price
    // Use the range percentage to calculate price bounds from current price
    const rangePct = result.rangePct / 100 // Convert from percentage
    const priceMin = currentPrice * (1 - rangePct)
    const priceMax = currentPrice * (1 + rangePct)

    console.log(`[Orca] Risk profile ${profile}: currentTick=${currentTick}, range=${result.tickLower}-${result.tickUpper}`)

    res.json({
      success: true,
      tickLower: result.tickLower,
      tickUpper: result.tickUpper,
      rangeMin: result.tickLower,
      rangeMax: result.tickUpper,
      priceMin: priceMin,
      priceMax: priceMax,
      currentPrice: currentPrice,
      currentTick: currentTick,
      tickSpacing: tickSpacing,
      tickCount: result.tickCount,
      rangePct: result.rangePct,
      riskProfile: profile
    })
  } catch (error) {
    console.error('[Orca] Calculate tick range error:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Initialize tick arrays if needed
app.post('/initialize-tick-arrays', async (req, res) => {
  try {
    if (!orcaBuilder) {
      return res.status(503).json({ error: 'Orca not initialized' })
    }
    const { poolAddress, tickLower, tickUpper, wallet } = req.body

    if (!poolAddress || tickLower === undefined || tickUpper === undefined || !wallet) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await orcaBuilder.initializeTickArraysIfNeeded(
      poolAddress,
      tickLower,
      tickUpper,
      wallet
    )
    res.json(result)
  } catch (error) {
    console.error('[Orca] Initialize tick arrays error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// Start server
async function start() {
  await initOrca()

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[Orca Sidecar] Running on 127.0.0.1:${PORT}`)
    console.log(`[Orca Sidecar] RPC: ${RPC_URL}`)
  })
}

start().catch(console.error)
