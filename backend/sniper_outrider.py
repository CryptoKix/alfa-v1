#!/usr/bin/env python3
"""Tactix Sniper Outrider - Industrial Discovery Poller with Ultra-Safe Rate Limiting."""
import os
import json
import time
import asyncio
import logging
import requests
import signal
from datetime import datetime
from helius_infrastructure import HeliusClient
from database import TactixDB
from config import HELIUS_API_KEY, SERVER_PORT
from services.notifications import notify_system_status

# Configure logging with high precision
logging.basicConfig(level=logging.INFO, format='[%(asctime)s.%(msecs)03d] [%(levelname)s] %(name)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger("sniper_outrider")

class SniperOutrider:
    def __init__(self):
        self.helius = HeliusClient()
        self.db = TactixDB()
        self.running = True
        self.seen_signatures = set()
        self.api_url = f"http://127.0.0.1:{SERVER_PORT}/api/webhook/sniper"
        self.semaphore = asyncio.Semaphore(1) # Strict serial processing
        
        # High-signal targets for polling
        self.targets = {
            "Raydium Auth": "5Q544fKrMJuWJ65ajBYMv8oAW6BEbxveS5q6Mc8SshY",
            "Raydium CLMM": "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
            "Meteora": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
            "Pump.fun": "6EF8rLSqY78dq396uA9D8S5WvAnX6k98TqQ29P9f77fM"
        }
        
        self.last_rpc_time = 0
        self.cooldown_until = 0

    async def start(self):
        logger.info("🎯 Sniper Outrider Started (Ultra-Safe Mode)")
        notify_system_status("ONLINE", "High-speed Sniper Outrider discovery process is active.")
        
        # Signal Handling for OFFLINE notification
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(self.shutdown()))

        asyncio.create_task(self.heartbeat())
        
        # Wait for backend
        while self.running:
            try:
                requests.get(f"http://127.0.0.1:{SERVER_PORT}/api/health", timeout=2)
                break
            except:
                await asyncio.sleep(2)

        while self.running:
            try:
                if time.time() < self.cooldown_until:
                    await asyncio.sleep(10)
                    continue

                for name, addr in self.targets.items():
                    if time.time() < self.cooldown_until: break
                    await self.poll_target(name, addr)
                    await asyncio.sleep(5) # Stagger between programs
                
                await asyncio.sleep(10) # Cycle delay
            except Exception as e:
                logger.error(f"Main Loop Error: {e}")
                await asyncio.sleep(30)

    async def poll_target(self, name, address):
        try:
            await self.wait_for_rate_limit()
            res = self.helius.rpc.get_signatures_for_address(address, limit=5)
            if not res: return

            for s in res:
                sig = s.get('signature')
                if sig and sig not in self.seen_signatures:
                    self.seen_signatures.add(sig)
                    asyncio.create_task(self.process_signature(sig, name))
        except Exception as e:
            if "429" in str(e): self.trigger_cooldown()

    async def wait_for_rate_limit(self):
        now = time.time()
        elapsed = now - self.last_rpc_time
        if elapsed < 2.0: await asyncio.sleep(2.0 - elapsed)
        self.last_rpc_time = time.time()

    def trigger_cooldown(self):
        logger.warning("⚠️ 429 DETECTED: Entering 120s Protective Cooldown")
        self.cooldown_until = time.time() + 120

    async def process_signature(self, signature, dex_id):
        async with self.semaphore:
            try:
                if time.time() < self.cooldown_until: return
                await self.wait_for_rate_limit()
                
                tx = self.helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
                if not tx or not tx.get('meta'): return
                
                meta = tx['meta']
                logs = "".join(meta.get('logMessages', [])).lower()
                
                # REFINED DETECTION: Avoid generic "create" logs
                is_launch = False
                if dex_id == "Raydium Auth" and "initialize2" in logs: is_launch = True
                elif dex_id == "Pump.fun" and "instruction: create" in logs: is_launch = True
                elif dex_id == "Meteora" and "initialize" in logs: is_launch = True
                elif "initialize2" in logs: is_launch = True # Fallback for other Raydium programs
                
                if not is_launch: return

                post_balances = meta.get('postTokenBalances', [])
                pre_balances = meta.get('preTokenBalances', [])
                
                new_mint = None
                # STRATEGY: New launches have 0 pre-balance for the token mint
                pre_mints = {b.get('mint') for b in pre_balances}
                
                for b in post_balances:
                    m = b.get('mint')
                    if m and m not in ["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]:
                        # If this mint is NOT in pre-balances, it's a candidate for a NEW launch
                        if m not in pre_mints:
                            new_mint = m
                            break
                
                # If no "new" mint found, check first non-major mint as fallback (could be a new pool for old token)
                if not new_mint:
                    for b in post_balances:
                        m = b.get('mint')
                        if m and m not in ["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]:
                            new_mint = m
                            break
                
                if not new_mint: return

                # SOL Delta
                pre_sol = meta.get('preBalances', [])
                post_sol = meta.get('postBalances', [])
                sol_delta = 0
                if pre_sol and post_sol:
                    deltas = [(post_sol[i] - pre_sol[i]) / 1e9 for i in range(min(len(pre_sol), len(post_sol)))]
                    sol_delta = max(deltas) if deltas else 0

                # DAS API Call
                await self.wait_for_rate_limit()
                asset = self.helius.das.get_asset(new_mint)
                info = asset.get('token_info', {})
                metadata = asset.get('content', {}).get('metadata', {})
                
                # Rug Check Analysis
                mint_auth = info.get('mint_authority')
                freeze_auth = info.get('freeze_authority')
                is_rug = bool(mint_auth or freeze_auth)
                
                token_data = {
                    "mint": new_mint,
                    "symbol": info.get('symbol') or metadata.get('symbol') or "???",
                    "name": metadata.get('name') or "Unknown Token",
                    "dex_id": dex_id,
                    "initial_liquidity": round(sol_delta, 2),
                    "detected_at": datetime.now().isoformat(),
                    "signature": signature,
                    "is_rug": is_rug,
                    "mint_auth": mint_auth,
                    "freeze_auth": freeze_auth
                }

                # Final False-Positive Check: If token is a well-known old token (like Fartcoin), skip it.
                # Heuristic: If it has huge supply or many holders, it's not a sniper target.
                # For now, just trust the "new mint in balances" logic.

                self.db.save_sniped_token(token_data)
                rug_status = "⚠️ RUG RISK" if is_rug else "✅ SAFE"
                logger.info(f"✨ SNIPER ALERT: {token_data['symbol']} | LIQ: {sol_delta:.2f} SOL | {rug_status}")
                requests.post(self.api_url, json=token_data, timeout=5)

            except Exception as e:
                if "429" in str(e): self.trigger_cooldown()

    async def heartbeat(self):
        while self.running:
            if len(self.seen_signatures) > 10000: self.seen_signatures.clear()
            status = "COOLDOWN" if time.time() < self.cooldown_until else "ACTIVE"
            logger.info(f"💓 Heartbeat: {status} | Tracking {len(self.seen_signatures)} sigs")
            await asyncio.sleep(60)

    async def shutdown(self):
        logger.info("🛑 Sniper Outrider: Shutting down...")
        self.running = False
        notify_system_status("OFFLINE", "High-speed Sniper Outrider discovery process has been terminated.")
        await asyncio.sleep(1) # Give time for notification
        # The loop will stop naturally since self.running is False, 
        # or the process will exit after this task completes if triggered by signal
        os._exit(0)

if __name__ == "__main__":
    outrider = SniperOutrider()
    asyncio.run(outrider.start())
