# TacTix High-Frequency Arbitrage (HFA) Architecture

This document outlines the requirements and roadmap for transitioning the TacTix Arbitrage module from a manual/polling monitor to a fully automated, low-latency execution engine.

## 1. Data Ingress: The Streaming Pipeline
To compete in the millisecond-latency environment of Solana arbitrage, TacTix must move away from REST polling.

### Requirements:
*   **gRPC (Geyser) Integration:** Utilize Helius or Jito gRPC streams to receive account state changes (pool balances) in real-time.
*   **Sub-Slot Latency:** Ingest data as it happens on the leader node, before block finalization.
*   **Local AMM Simulation:**
    *   Maintain an in-memory "shadow" of DEX pools.
    *   Implement constant-product (Raydium) and DLMM (Meteora) math in the bot core.
    *   Calculate quotes locally (<1ms) instead of waiting for Jupiter's API response (~300-800ms).


### Shyft gRPC Integration
The primary ingress point for real-time data will be Shyft's **Geyser gRPC stream**.
*   **Template:** `backend/services/shyft_grpc.py`
*   **Functionality:** This module acts as a high-speed listener for pool account data.
*   **Workflow:** 
    1.  Bot subscribes to specific AMM vault addresses (e.g., Raydium SOL/USDC vault).
    2.  Shyft pushes raw account updates via gRPC.
    3.  `ArbEngine` parses the binary data to extract vault balances.
    4.  Local price simulation is triggered immediately.

## 2. Decision Logic: Opportunity Detection
*   **Bellman-Ford / Pathfinding:** Move beyond simple 2-pair comparison to multi-hop triangular arbitrage detection.
*   **Net Profit Filtering:** Automatically calculate net profit by subtracting:
    *   Dynamic Slippage.
    *   DEX Swap Fees (0.01% - 0.3%).
    *   Jito Bundle Tips.
    *   Priority Fees.

## 3. Execution: Atomic Bundles
Arbitrage must be atomic (all-or-nothing) to prevent "toxic flow" (getting stuck with one leg of a trade).

### Jito Bundle Strategy:
*   **Direct-to-Validator:** Send transactions directly to Jito-enabled validators, bypassing the public mempool.
*   **MEV Protection:** Protect trades from being front-run by other searchers.
*   **Conditional Tipping:** Implement a "Tip" instruction at the end of the bundle. The validator only receives the tip if the entire transaction succeeds.
*   **No Landed-Failures:** If the arbitrage gap disappears before the transaction lands, the bundle is discarded by the validator, resulting in $0 fees paid.

## 4. Infrastructure Hardware
*   **Stake-Weighted QoS:** Access to RPCs with locked SOL stake to ensure transaction delivery during congestion.
*   **Geographic Proximity:** Deploy the execution core in AWS regions with the lowest latency to Solana's leading validators (Tokyo/Frankfurt).

## Roadmap to Automation
1.  **[Current]** 5s Cross-DEX Monitoring & Matrix Visualization.
2.  **[Integration]** Jito SDK & Atomic Transaction Building.
3.  **[Simulation]** Auto-Strike Dry-Runs (Simulated bundles).
4.  **[Production]** Full gRPC Streaming & Automated HFA Execution.
