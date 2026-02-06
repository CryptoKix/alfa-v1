#!/usr/bin/env python3
"""Sniper engine service for detecting and tracking new token launches."""
import time
import threading
import json
import logging
from datetime import datetime
import sio_bridge
from extensions import db, helius
# from config import HELIUS_API_KEY  # DISABLED — all traffic via Shyft

logger = logging.getLogger("sniper_engine")
logger.setLevel(logging.DEBUG)

class SniperEngine:
    def __init__(self):
        self._running = False
        self._thread = None
        # High-signal addresses that are touched during pool creation
        self.monitors = {
            "Raydium Auth": "5Q544fKrMJuWJ65ajBYMv8oAW6BEbxveS5q6Mc8SshY",
            "Pump.fun": "6EF8rLSqY78dq396uA9D8S5WvAnX6k98TqQ29P9f77fM"
        }
        self.seen_signatures = set()
        # SECURITY: Reduced default slippage from 15% to 5% to limit sandwich attack exposure
        # SECURITY: Reduced default buy amount to 0.1 SOL max per snipe
        self.settings = db.get_setting('sniper_settings', {
            "autoSnipe": False,
            "buyAmount": 0.1,
            "slippage": 5,  # 5% max slippage (was 15%)
            "priorityFee": 0.005,
            "minLiquidity": 0.5,
            "requireMintRenounced": True,
            "requireLPBurned": True,
            "requireSocials": False,
            # Take Profit / Stop Loss
            "takeProfitEnabled": True,
            "takeProfitPct": 100,       # Sell at 2x (100% gain)
            "stopLossEnabled": True,
            "stopLossPct": 50,          # Sell at 50% loss
            "trailingStopEnabled": False,
            "trailingStopPct": 20,      # Trailing stop: sell when price drops 20% from peak
        })

    def update_settings(self, new_settings):
        self.settings.update(new_settings)
        logger.info(f"🎯 Sniper Engine Settings Updated: AutoSnipe={'ON' if self.settings.get('autoSnipe') else 'OFF'}")

    def start(self):
        if self._running: return
        self._running = True
        sio_bridge.start_background_task(self._run_engine_loop)
        logger.info("🎯 Sniper Discovery Engine Started")

    def stop(self):
        self._running = False
        logger.info("🎯 Sniper Discovery Engine Stopped")

    def is_running(self):
        return self._running

    def _run_engine_loop(self):
        """Main loop using stable high-frequency polling for Eventlet compatibility."""
        logger.info("🎯 Sniper Main Loop: Entering scanning phase")
        count = 0
        while self._running:
            try:
                self.poll_launches()
                count += 1
                if count % 30 == 0:
                    logger.info(f"🎯 Sniper Heartbeat: Active (Cycle {count})")
                time.sleep(1) # Fast poll
            except Exception as e:
                logger.error(f"Sniper Loop Error: {e}")
                time.sleep(5)

    def poll_launches(self):
        """Check for new pool activity via Authority signatures."""
        for dex_name, addr in self.monitors.items():
            try:
                res = helius.rpc.get_signatures_for_address(addr, limit=20)
                if not res or not res.value: continue

                new_sigs = []
                for s in res.value:
                    if s.signature not in self.seen_signatures:
                        new_sigs.append(s.signature)
                        self.seen_signatures.add(s.signature)

                if new_sigs:
                    logger.debug(f"🎯 Found {len(new_sigs)} new signatures on {dex_name}")
                    # Filter for memory
                    if len(self.seen_signatures) > 10000:
                        self.seen_signatures = set(list(self.seen_signatures)[-5000:])
                    
                    for sig in new_sigs:
                        # Process in background to keep polling fast
                        sio_bridge.start_background_task(self.process_launch, sig, dex_name)
            except:
                pass

    def process_launch(self, signature, dex_id):
        """Detailed transaction decoding."""
        try:
            tx = helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
            if not tx or not tx.value: return
            
            meta = tx.value.transaction.meta
            if not meta: return

            # Check logs for launch instruction
            logs = "".join(meta.log_messages or []).lower()
            if dex_id == "Raydium Auth" and "initialize2" not in logs: return
            if dex_id == "Pump.fun" and "create" not in logs: return

            # 1. Identify New Token Mint
            post_balances = meta.post_token_balances or []
            new_mint = None
            for b in post_balances:
                mint = b.mint
                if mint not in ["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]:
                    new_mint = mint
                    break
            
            if not new_mint: return

            # 2. Extract Liquidity (SOL Delta)
            pre = meta.pre_balances
            post = meta.post_balances
            sol_delta = 0
            if pre and post:
                deltas = [(post[i] - pre[i]) / 1e9 for i in range(min(len(pre), len(post)))]
                sol_delta = max(deltas) if deltas else 0

            # 3. Check Liquidity Filter
            min_liq = float(self.settings.get('minLiquidity', 0))
            if sol_delta < min_liq:
                # logger.debug(f"⏳ Filtered {new_mint[:8]} (Liq: {sol_delta:.2f} SOL)")
                return

            # 4. Fetch Metadata & Rug Check & Emit
            try:
                asset = helius.das.get_asset(new_mint)
                info = asset.get('token_info', {})
                metadata = asset.get('content', {}).get('metadata', {})

                # Rug check — same logic as sniper_outrider
                mint_auth = info.get('mint_authority')
                freeze_auth = info.get('freeze_authority')
                is_rug = bool(mint_auth or freeze_auth)

                token_data = {
                    "mint": new_mint,
                    "symbol": info.get('symbol') or metadata.get('symbol') or "???",
                    "name": metadata.get('name') or "Unknown Token",
                    "dex_id": "Raydium" if dex_id == "Raydium Auth" else "Pump.fun",
                    "initial_liquidity": round(sol_delta, 2),
                    "is_rug": is_rug,
                    "mint_authority": mint_auth,
                    "freeze_authority": freeze_auth,
                    "socials": asset.get('content', {}).get('links', {}),
                    "detected_at": datetime.now().isoformat(),
                    "status": "tracking"
                }

                rug_status = "⚠️ RUG RISK" if is_rug else "✅ SAFE"
                db.save_sniped_token(token_data)
                logger.info(f"🚀 SNIPER ALERT: {token_data['symbol']} | LIQ: {sol_delta:.2f} SOL | {rug_status}")
                sio_bridge.emit('new_token_detected', token_data, namespace='/sniper')

                if self.settings.get('autoSnipe'):
                    self.attempt_auto_snipe(token_data)

            except Exception as e:
                logger.error(f"Metadata Error: {e}")

        except Exception as e:
            pass

    def attempt_auto_snipe(self, token_data):
        """Execute automated trade with safety guards using fast-path execution."""
        try:
            from services.trading import execute_snipe
            from services.trade_guard import trade_guard, TradeGuardError

            buy_amount = float(self.settings.get('buyAmount', 0.1))
            slippage_pct = float(self.settings.get('slippage', 5))

            # SECURITY: Token safety validation against sniper settings
            # This enforces: freeze authority, mint authority, is_rug flag, socials
            try:
                trade_guard.validate_token_safety(token_data, self.settings)
            except TradeGuardError as e:
                logger.warning(f"🛡️ Auto-snipe BLOCKED (safety): {e}")
                sio_bridge.emit('notification', {
                    'title': 'Auto-Snipe Blocked (Safety)',
                    'message': str(e),
                    'type': 'warning'
                }, namespace='/bots')
                return

            # SECURITY: Validate sniper trade against amount/slippage limits
            try:
                trade_guard.validate_sniper_trade(
                    amount_sol=buy_amount,
                    slippage_pct=slippage_pct,
                    token_mint=token_data['mint']
                )
            except TradeGuardError as e:
                logger.warning(f"⚠️ Sniper trade blocked by guard: {e}")
                sio_bridge.emit('notification', {
                    'title': 'Auto-Snipe Blocked',
                    'message': str(e),
                    'type': 'warning'
                }, namespace='/bots')
                return

            # Dynamic Jito tip — use live tip floor data with user setting as minimum
            from services.jito import tip_floor_cache
            priority_fee_sol = float(self.settings.get('priorityFee', 0.005))
            user_min_lamports = max(int(priority_fee_sol * 1e9), 1_000)
            tip_lamports = tip_floor_cache.get_optimal_tip(
                percentile="75th",
                user_min_lamports=user_min_lamports,
            )

            logger.info(f"🤖 AUTO-SNIPE INITIATED: {token_data['symbol']} for {buy_amount} SOL "
                       f"(slippage: {slippage_pct}%, tip: {tip_lamports} lamports / {tip_lamports/1e9:.6f} SOL, "
                       f"dex: {token_data.get('dex_id')})")

            # Use fast-path execute_snipe with direct instruction building + Jito
            sio_bridge.start_background_task(
                execute_snipe,
                token_data,
                buy_amount,
                slippage_bps=int(slippage_pct * 100),
                tip_lamports=tip_lamports,
            )

            sio_bridge.emit('notification', {
                'title': 'Auto-Snipe Fired',
                'message': f"Fast-path snipe: {token_data['symbol']} via {token_data.get('dex_id', 'unknown')}",
                'type': 'success'
            }, namespace='/bots')

        except Exception as e:
            logger.error(f"Auto-Snipe Error: {e}")

# Global instance
sniper_engine = SniperEngine()
