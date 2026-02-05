# gRPC & Low-Latency Infrastructure Requirements

This document outlines the infrastructure needed for competitive arbitrage execution.

---

## Current State (No Additional Cost)

The current implementation works with your existing Helius free/starter plan:

| Component | Implementation | Latency |
|-----------|---------------|---------|
| Blockhash | HTTP polling every 400ms | ~100ms per fetch |
| Quotes | Jupiter HTTP API | ~100-200ms |
| Bundle submission | Jito HTTP (1 req/sec/region) | ~100ms |
| **Total strike latency** | | **~400-500ms** |

---

## Upgrade Path

### Tier 1: Helius Staked Connections (Business Plan)

**Cost:** ~$499/month (Business plan)

**Benefits:**
- Priority transaction landing via Stake-Weighted QoS (SWQoS)
- Higher RPC rate limits
- Better inclusion rates during congestion

**What it improves:**
| Component | Before | After |
|-----------|--------|-------|
| Transaction landing | Standard queue | Priority lane |
| Success rate | ~70-80% | ~90-95% |

**Implementation:**
```python
# Already configured in config.py
HELIUS_STAKED_RPC = f"https://staked.helius-rpc.com/?api-key={HELIUS_API_KEY}"
```

---

### Tier 2: LaserStream gRPC (Professional+ Plan)

**Cost:** ~$999/month (Professional plan) or included in Business

**Benefits:**
- Real-time slot/block streaming (sub-millisecond updates)
- No more HTTP polling for blockhash
- Earliest visibility into state changes

**What it improves:**
| Component | Before | After |
|-----------|--------|-------|
| Blockhash freshness | 400ms polling | Real-time stream |
| Slot awareness | Polling | Instant notification |
| Data latency | ~50-100ms | ~1-5ms |

**Endpoints:**
```
# Regional LaserStream endpoints
laserstream-mainnet-ewr.helius-rpc.com:443  # New York (closest to Jito)
laserstream-mainnet-fra.helius-rpc.com:443  # Frankfurt
laserstream-mainnet-tyo.helius-rpc.com:443  # Tokyo
laserstream-mainnet-ams.helius-rpc.com:443  # Amsterdam
```

**Implementation Requirements:**
1. Yellowstone gRPC proto files
2. Python gRPC client setup
3. Streaming subscription for slots/blockhash

---

### Tier 3: Jito gRPC (Whitelist Required)

**Cost:** Free (requires Discord whitelist approval)

**Benefits:**
- Faster bundle submission (~10-20ms vs ~100ms HTTP)
- Streaming bundle status updates
- Direct Block Engine connection

**How to get access:**
1. Join [Jito Discord](https://discord.gg/jito)
2. Open ticket requesting gRPC access
3. Provide your keypair public key
4. Wait for whitelist approval (1-5 business days)

**What it improves:**
| Component | Before | After |
|-----------|--------|-------|
| Bundle submission | ~100ms HTTP | ~10-20ms gRPC |
| Status updates | Polling | Streaming |

---

## Full Low-Latency Stack

With all tiers enabled:

| Component | Implementation | Latency |
|-----------|---------------|---------|
| Blockhash | LaserStream gRPC stream | ~0ms (always fresh) |
| Slot updates | LaserStream subscription | ~1-5ms |
| Quotes | Jupiter HTTP (unavoidable) | ~100-200ms |
| Bundle submission | Jito gRPC | ~10-20ms |
| Transaction landing | Helius staked | Priority |
| **Total strike latency** | | **~150-250ms** |

---

## Monthly Cost Summary

| Tier | Provider | Cost | Key Benefit |
|------|----------|------|-------------|
| Current | Helius Free | $0 | Basic functionality |
| Tier 1 | Helius Business | ~$499/mo | Staked connections |
| Tier 2 | Helius Professional | ~$999/mo | LaserStream gRPC |
| Tier 3 | Jito gRPC | $0 | Fast bundle submission |

**Recommended minimum for competitive arb:** Tier 1 + Tier 3 (~$499/mo)

**Full stack:** All tiers (~$999/mo + Jito whitelist)

---

## Dependencies (Already Added)

```
# backend/requirements.txt
grpcio>=1.63.0
grpcio-tools>=1.63.0
protobuf>=5.26.1
websocket-client>=1.6.0
```

---

## Implementation Checklist

When ready to upgrade:

### For Tier 1 (Staked Connections)
- [ ] Upgrade Helius plan to Business
- [ ] Verify `HELIUS_STAKED_RPC` is being used for transaction sends
- [ ] Test landing rates

### For Tier 2 (LaserStream)
- [ ] Upgrade Helius plan to Professional (or confirm included in Business)
- [ ] Download Yellowstone proto files
- [ ] Generate Python gRPC stubs
- [ ] Implement streaming blockhash subscription
- [ ] Replace polling in `blockhash_cache.py` with gRPC stream

### For Tier 3 (Jito gRPC)
- [ ] Join Jito Discord
- [ ] Request gRPC whitelist with keypair pubkey
- [ ] Download Jito proto files from [jito-labs/mev-protos](https://github.com/jito-labs/mev-protos)
- [ ] Implement gRPC bundle submission in `services/jito.py`
- [ ] Test bundle landing

---

## Resources

- [Helius Pricing](https://www.helius.dev/pricing)
- [Helius LaserStream Docs](https://www.helius.dev/docs/laserstream/grpc)
- [Helius Staked Connections](https://www.helius.dev/staked-connections)
- [Jito Block Engine Docs](https://docs.jito.wtf/lowlatencytxnsend/)
- [Jito Discord](https://discord.gg/jito)
- [Yellowstone gRPC](https://github.com/rpcpool/yellowstone-grpc)
- [Jito MEV Protos](https://github.com/jito-labs/mev-protos)

---

## Notes

The current blockhash cache implementation (`backend/services/blockhash_cache.py`) works on your existing plan using HTTP polling + WebSocket slot notifications. It provides a ~100ms improvement by eliminating the blockhash HTTP call during strike execution.

When you upgrade, the cache can be enhanced to use LaserStream gRPC for real-time streaming instead of polling.
