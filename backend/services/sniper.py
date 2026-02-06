#!/usr/bin/env python3
"""Sniper engine service — two-mode detection and execution.

Modes:
  graduated: Safe, hold-oriented. Raydium only. Full RugCheck + trade_guard. TP/SL targets.
  hft:       Fast, scalp-oriented. Pump.fun bonding curve. Minimal safety. Auto-sell on timer/target.
  both:      Graduated for Raydium, HFT for Pump.fun simultaneously.
"""
import time
import threading
import json
import logging
from datetime import datetime
import sio_bridge
from extensions import db, helius

logger = logging.getLogger("sniper_engine")
logger.setLevel(logging.DEBUG)

# HFT defaults for settings migration
HFT_SETTINGS_DEFAULTS = {
    "snipeMode": "graduated",
    "hftBuyAmount": 0.1,
    "hftSlippage": 25,
    "hftPriorityFee": 0.00005,
    "hftJitoPercentile": "95th",
    "hftMaxHoldSeconds": 60,
    "hftTakeProfitPct": 30,
    "hftStopLossPct": 25,
    "hftAutoSellEnabled": True,
}


class SniperEngine:
    def __init__(self):
        self._running = False
        self._thread = None
        self._hft_thread = None
        self._hft_positions = {}  # mint -> position dict
        self._hft_lock = threading.Lock()
        # High-signal addresses that are touched during pool creation
        self.monitors = {
            "Raydium": "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
            "Pump.fun": "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
        }
        self.seen_signatures = set()
        self._snipe_count = 0
        self._circuit_breaker_limit = 1  # Max snipes per arm cycle (safety for testing)
        self.settings = db.get_setting('sniper_settings', {
            "autoSnipe": False,
            "buyAmount": 0.1,
            "slippage": 15,
            "priorityFee": 0.005,
            "minLiquidity": 0.5,
            "requireMintRenounced": True,
            "requireLPBurned": True,
            "requireSocials": False,
            # Take Profit / Stop Loss (graduated mode)
            "takeProfitEnabled": True,
            "takeProfitPct": 100,
            "stopLossEnabled": True,
            "stopLossPct": 50,
            "trailingStopEnabled": False,
            "trailingStopPct": 20,
            # Anti-rug checks (graduated mode)
            "skipBondingCurve": False,
            "rugcheckEnabled": True,
            "rugcheckMinScore": 10000,
            "creatorBalanceCheckEnabled": True,
            "minMarketCapSOL": 0,
            # Mode + HFT
            **HFT_SETTINGS_DEFAULTS,
        })
        # Migrate existing DB settings that lack new HFT keys
        for key, default in HFT_SETTINGS_DEFAULTS.items():
            if key not in self.settings:
                self.settings[key] = default

    def update_settings(self, new_settings):
        was_armed = self.settings.get('autoSnipe', False)
        self.settings.update(new_settings)
        now_armed = self.settings.get('autoSnipe', False)
        # Reset circuit breaker when re-arming
        if now_armed and not was_armed:
            self._snipe_count = 0
            logger.info("🔌 Circuit breaker reset (re-armed)")
        mode = self.settings.get('snipeMode', 'graduated')
        logger.info(f"🎯 Settings Updated: mode={mode} AutoSnipe={'ON' if now_armed else 'OFF'}")

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._running = True
        with self._hft_lock:
            self._hft_positions = {}
        self._thread = threading.Thread(target=self._run_engine_loop, daemon=True, name="sniper-engine")
        self._thread.start()
        self._hft_thread = threading.Thread(target=self._hft_monitor_loop, daemon=True, name="sniper-hft-monitor")
        self._hft_thread.start()
        logger.info("🎯 Sniper Discovery Engine + HFT Monitor Started")

    def stop(self):
        self._running = False
        self._thread = None
        self._hft_thread = None
        logger.info("🎯 Sniper Discovery Engine Stopped")

    def is_running(self):
        return self._running and self._thread is not None and self._thread.is_alive()

    def get_hft_positions(self):
        with self._hft_lock:
            return [{**pos, 'mint': mint} for mint, pos in self._hft_positions.items()]

    # ── Detection Loop ─────────────────────────────────────────────────

    def _run_engine_loop(self):
        logger.info("🎯 Sniper Main Loop: Entering scanning phase")
        count = 0
        while self._running:
            try:
                self.poll_launches()
                count += 1
                if count % 30 == 0:
                    mode = self.settings.get('snipeMode', 'graduated')
                    hft_count = len(self._hft_positions)
                    logger.info(f"🎯 Heartbeat: Cycle {count} | mode={mode} | HFT positions={hft_count}")
                time.sleep(1)
            except Exception as e:
                logger.error(f"Sniper Loop Error: {e}")
                time.sleep(5)

    def poll_launches(self):
        for dex_name, addr in self.monitors.items():
            try:
                sigs = helius.rpc.get_signatures_for_address(addr, limit=20)
                if not sigs:
                    continue
                new_sigs = []
                for s in sigs:
                    sig = s.get('signature') if isinstance(s, dict) else getattr(s, 'signature', None)
                    if sig and sig not in self.seen_signatures:
                        new_sigs.append(sig)
                        self.seen_signatures.add(sig)
                if new_sigs:
                    logger.debug(f"🎯 Found {len(new_sigs)} new signatures on {dex_name}")
                    if len(self.seen_signatures) > 10000:
                        self.seen_signatures = set(list(self.seen_signatures)[-5000:])
                    for sig in new_sigs:
                        sio_bridge.start_background_task(self.process_launch, sig, dex_name)
            except Exception as e:
                logger.error(f"🎯 Poll error ({dex_name}): {e}")

    def process_launch(self, signature, dex_id):
        try:
            tx = helius.rpc.get_transaction(signature, encoding='jsonParsed', max_supported_version=0)
            if not tx:
                return
            meta = tx.get('meta') if isinstance(tx, dict) else getattr(tx, 'meta', None)
            if not meta:
                return

            log_messages = meta.get('logMessages') or meta.get('log_messages') or []
            logs = "".join(log_messages).lower()
            if dex_id == "Raydium" and "initialize2" not in logs: return
            if dex_id == "Pump.fun" and "create" not in logs: return

            post_token_balances = meta.get('postTokenBalances') or meta.get('post_token_balances') or []
            new_mint = None
            for b in post_token_balances:
                mint = b.get('mint') if isinstance(b, dict) else getattr(b, 'mint', None)
                if mint and mint not in ["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]:
                    new_mint = mint
                    break
            if not new_mint: return

            pre = meta.get('preBalances') or meta.get('pre_balances') or []
            post = meta.get('postBalances') or meta.get('post_balances') or []
            sol_delta = 0
            if pre and post:
                deltas = [(post[i] - pre[i]) / 1e9 for i in range(min(len(pre), len(post)))]
                sol_delta = max(deltas) if deltas else 0

            min_liq = float(self.settings.get('minLiquidity', 0))
            if sol_delta < min_liq:
                return

            try:
                asset = helius.das.get_asset(new_mint)
                info = asset.get('token_info', {})
                metadata = asset.get('content', {}).get('metadata', {})
                mint_auth = info.get('mint_authority')
                freeze_auth = info.get('freeze_authority')
                is_rug = bool(mint_auth or freeze_auth)

                token_data = {
                    "mint": new_mint,
                    "symbol": info.get('symbol') or metadata.get('symbol') or "???",
                    "name": metadata.get('name') or "Unknown Token",
                    "dex_id": dex_id,
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
                logger.info(f"🚀 SNIPER ALERT: {token_data['symbol']} | LIQ: {sol_delta:.2f} SOL | {rug_status} | DEX: {dex_id}")
                emit_data = {**token_data}
                emit_data['socials_json'] = json.dumps(token_data.get('socials', {}))
                emit_data.setdefault('pool_address', '')
                sio_bridge.emit('new_token_detected', emit_data, namespace='/sniper')

                if self.settings.get('autoSnipe'):
                    self.attempt_auto_snipe(token_data)

            except Exception as e:
                logger.error(f"Metadata Error: {e}")

        except Exception as e:
            logger.error(f"🎯 Process launch error ({dex_id}, {signature[:12]}...): {e}")

    # ── Mode Router ────────────────────────────────────────────────────

    def attempt_auto_snipe(self, token_data):
        """Route to graduated or HFT execution based on mode + dex."""
        # Circuit breaker — disarm after N snipes per arm cycle
        if self._snipe_count >= self._circuit_breaker_limit:
            symbol = token_data.get('symbol', '???')
            logger.warning(f"🔌 CIRCUIT BREAKER: {self._snipe_count}/{self._circuit_breaker_limit} snipes fired — disarming. Skipping {symbol}")
            self.settings['autoSnipe'] = False
            db.save_setting('sniper_settings', self.settings)
            sio_bridge.emit('sniper_status', {
                'armed': False,
                'detecting': self.is_running(),
            }, namespace='/sniper')
            sio_bridge.emit('notification', {
                'title': 'Circuit Breaker Tripped',
                'message': f'Sniper disarmed after {self._snipe_count} snipe(s). Re-arm to continue.',
                'type': 'warning',
            }, namespace='/bots')
            return

        mode = self.settings.get('snipeMode', 'graduated')
        dex_id = token_data.get('dex_id', '')
        symbol = token_data.get('symbol', '???')

        if mode == 'graduated':
            if dex_id == 'Pump.fun':
                logger.info(f"⏭️ Graduated mode: skipping Pump.fun token {symbol}")
                return
            self._execute_graduated_snipe(token_data)

        elif mode == 'hft':
            if dex_id != 'Pump.fun':
                logger.info(f"⏭️ HFT mode: skipping non-Pump.fun token {symbol} ({dex_id})")
                return
            self._execute_hft_snipe(token_data)

        elif mode == 'both':
            if dex_id == 'Pump.fun':
                self._execute_hft_snipe(token_data)
            else:
                self._execute_graduated_snipe(token_data)

        else:
            logger.warning(f"Unknown snipeMode: {mode}")

    # ── Graduated Execution ────────────────────────────────────────────

    def _execute_graduated_snipe(self, token_data):
        """Full safety checks + hold strategy for graduated tokens."""
        try:
            from services.trading import execute_snipe
            from services.trade_guard import trade_guard, TradeGuardError

            buy_amount = float(self.settings.get('buyAmount', 0.1))
            slippage_pct = float(self.settings.get('slippage', 15))

            try:
                trade_guard.validate_token_safety(token_data, self.settings)
            except TradeGuardError as e:
                logger.warning(f"🛡️ Graduated BLOCKED (safety): {e}")
                sio_bridge.emit('notification', {
                    'title': 'Graduated Snipe Blocked',
                    'message': str(e),
                    'type': 'warning'
                }, namespace='/bots')
                return

            try:
                trade_guard.validate_sniper_trade(
                    amount_sol=buy_amount,
                    slippage_pct=slippage_pct,
                    token_mint=token_data['mint']
                )
            except TradeGuardError as e:
                logger.warning(f"⚠️ Graduated trade blocked: {e}")
                sio_bridge.emit('notification', {
                    'title': 'Graduated Snipe Blocked',
                    'message': str(e),
                    'type': 'warning'
                }, namespace='/bots')
                return

            from services.jito import tip_floor_cache
            priority_fee_sol = float(self.settings.get('priorityFee', 0.005))
            user_min_lamports = max(int(priority_fee_sol * 1e9), 1_000)
            tip_lamports = tip_floor_cache.get_optimal_tip(
                percentile="75th",
                user_min_lamports=user_min_lamports,
            )

            logger.info(f"🎓 GRADUATED SNIPE: {token_data['symbol']} for {buy_amount} SOL "
                       f"(slippage: {slippage_pct}%, tip: {tip_lamports/1e9:.6f} SOL, dex: {token_data.get('dex_id')})")

            def _safe_execute():
                try:
                    result = execute_snipe(
                        token_data,
                        buy_amount,
                        slippage_bps=int(slippage_pct * 100),
                        tip_lamports=tip_lamports,
                    )
                    logger.info(f"✅ GRADUATED SUCCESS: {token_data['symbol']} — {result}")
                except Exception as exc:
                    logger.error(f"❌ GRADUATED FAILED: {token_data['symbol']} — {exc}", exc_info=True)

            sio_bridge.start_background_task(_safe_execute)
            self._snipe_count += 1
            logger.info(f"🔌 Circuit breaker: {self._snipe_count}/{self._circuit_breaker_limit} snipes fired")

            sio_bridge.emit('notification', {
                'title': 'Graduated Snipe Fired',
                'message': f"{token_data['symbol']} via {token_data.get('dex_id', 'unknown')}",
                'type': 'success'
            }, namespace='/bots')

        except Exception as e:
            logger.error(f"Graduated Snipe Error: {e}")

    # ── HFT Execution ──────────────────────────────────────────────────

    def _execute_hft_snipe(self, token_data):
        """Minimal safety + auto-sell for bonding curve tokens."""
        try:
            from services.trading import execute_snipe
            from services.trade_guard import trade_guard, TradeGuardError, HFT_MAX_CONCURRENT

            # Check concurrent position limit
            with self._hft_lock:
                if len(self._hft_positions) >= HFT_MAX_CONCURRENT:
                    logger.info(f"⏭️ HFT: max {HFT_MAX_CONCURRENT} concurrent positions — skipping {token_data['symbol']}")
                    return

            buy_amount = float(self.settings.get('hftBuyAmount', 0.1))
            slippage_pct = float(self.settings.get('hftSlippage', 25))

            # Minimal safety check — blocklist + freeze auth + amount cap
            try:
                trade_guard.validate_hft_snipe(token_data, buy_amount)
            except TradeGuardError as e:
                logger.warning(f"🛡️ HFT BLOCKED: {e}")
                sio_bridge.emit('notification', {
                    'title': 'HFT Snipe Blocked',
                    'message': str(e),
                    'type': 'warning'
                }, namespace='/bots')
                return

            # Aggressive Jito tip
            from services.jito import tip_floor_cache
            priority_fee_sol = float(self.settings.get('hftPriorityFee', 0.00005))
            user_min_lamports = max(int(priority_fee_sol * 1e9), 1_000)
            percentile = self.settings.get('hftJitoPercentile', '95th')
            tip_lamports = tip_floor_cache.get_optimal_tip(
                percentile=percentile,
                user_min_lamports=user_min_lamports,
            )

            logger.info(f"⚡ HFT SNIPE: {token_data['symbol']} for {buy_amount} SOL "
                       f"(slippage: {slippage_pct}%, tip: {tip_lamports/1e9:.6f} SOL, jito: {percentile})")

            def _hft_execute():
                try:
                    result = execute_snipe(
                        token_data,
                        buy_amount,
                        slippage_bps=int(slippage_pct * 100),
                        tip_lamports=tip_lamports,
                    )

                    if not result.get('confirmed', False):
                        logger.error(f"❌ HFT TX FAILED ON-CHAIN: {token_data['symbol']} — sig={result.get('signature','')[:16]}... (no position registered)")
                        sio_bridge.emit('notification', {
                            'title': 'HFT Snipe Failed',
                            'message': f"{token_data['symbol']}: tx reverted on-chain",
                            'type': 'error'
                        }, namespace='/bots')
                        return

                    logger.info(f"✅ HFT SUCCESS: {token_data['symbol']} — {result}")

                    # Register position for auto-sell monitoring
                    tokens_out = result.get('estimated_tokens_out', 0)
                    hold_seconds = float(self.settings.get('hftMaxHoldSeconds', 60))
                    now = time.time()
                    position = {
                        'symbol': token_data['symbol'],
                        'sol_spent': buy_amount,
                        'tokens_received': tokens_out,
                        'entry_price_sol': buy_amount / tokens_out if tokens_out > 0 else 0,
                        'entry_time': now,
                        'deadline': now + hold_seconds,
                        'peak_pnl_pct': 0.0,
                        'current_pnl_pct': 0.0,
                        'signature': result.get('signature', ''),
                        'status': 'monitoring',
                    }
                    with self._hft_lock:
                        self._hft_positions[token_data['mint']] = position
                    logger.info(f"⚡ HFT position registered: {token_data['symbol']} — auto-sell in {hold_seconds}s")

                    sio_bridge.emit('hft_position_opened', {
                        **position, 'mint': token_data['mint'],
                        'entry_time': datetime.fromtimestamp(now).isoformat(),
                        'seconds_remaining': int(hold_seconds),
                    }, namespace='/sniper')

                except Exception as exc:
                    logger.error(f"❌ HFT FAILED: {token_data['symbol']} — {exc}", exc_info=True)

            sio_bridge.start_background_task(_hft_execute)
            self._snipe_count += 1
            logger.info(f"🔌 Circuit breaker: {self._snipe_count}/{self._circuit_breaker_limit} snipes fired")

            sio_bridge.emit('notification', {
                'title': 'HFT Snipe Fired',
                'message': f"⚡ {token_data['symbol']} on Pump.fun bonding curve",
                'type': 'success'
            }, namespace='/bots')

        except Exception as e:
            logger.error(f"HFT Snipe Error: {e}")

    # ── HFT Position Monitor ──────────────────────────────────────────

    def _hft_monitor_loop(self):
        """Monitor HFT positions and auto-sell on TP/SL/timeout."""
        logger.info("⚡ HFT Monitor: Started")
        while self._running:
            try:
                positions_to_sell = []
                with self._hft_lock:
                    if not self._hft_positions:
                        pass  # Fall through to sleep
                    else:
                        now = time.time()

                        for mint, pos in list(self._hft_positions.items()):
                            if pos.get('status') == 'selling':
                                continue

                            # 1. Time-based auto-sell
                            if now >= pos['deadline']:
                                positions_to_sell.append((mint, pos, 'timeout'))
                                continue

                            # 2. Price-based targets
                            if not self.settings.get('hftAutoSellEnabled', True):
                                continue

                            current_price = self._get_token_price_sol(mint)
                            if current_price <= 0:
                                continue

                            entry_price = pos.get('entry_price_sol', 0)
                            if entry_price <= 0:
                                continue

                            pnl_pct = ((current_price - entry_price) / entry_price) * 100
                            pos['peak_pnl_pct'] = max(pos.get('peak_pnl_pct', 0), pnl_pct)
                            pos['current_pnl_pct'] = pnl_pct

                            # Emit live update
                            sio_bridge.emit('hft_position_update', {
                                'mint': mint,
                                'current_pnl_pct': round(pnl_pct, 2),
                                'peak_pnl_pct': round(pos['peak_pnl_pct'], 2),
                                'seconds_remaining': max(0, int(pos['deadline'] - now)),
                                'status': 'monitoring',
                            }, namespace='/sniper')

                            # Take profit
                            tp_pct = float(self.settings.get('hftTakeProfitPct', 30))
                            if pnl_pct >= tp_pct:
                                positions_to_sell.append((mint, pos, 'take_profit'))
                                continue

                            # Stop loss
                            sl_pct = float(self.settings.get('hftStopLossPct', 25))
                            if pnl_pct <= -sl_pct:
                                positions_to_sell.append((mint, pos, 'stop_loss'))
                                continue

                        # Mark as selling before releasing lock
                        for mint, pos, reason in positions_to_sell:
                            pos['status'] = 'selling'

                # Execute sells outside of lock
                for mint, pos, reason in positions_to_sell:
                    sio_bridge.start_background_task(self._hft_auto_sell, mint, pos, reason)

                time.sleep(2)

            except Exception as e:
                logger.error(f"HFT Monitor Error: {e}")
                time.sleep(5)

    def _get_token_price_sol(self, mint):
        """Get token price in SOL. Primary: price_cache. Fallback: bonding curve. Last resort: Jupiter."""
        import requests as _req
        from extensions import price_cache, price_cache_lock
        sol_mint = "So11111111111111111111111111111111111111112"

        # 1. Price cache (fastest — in-memory)
        with price_cache_lock:
            if mint in price_cache:
                price_usd = price_cache[mint][0]
                sol_usd = price_cache.get(sol_mint, (0.0, 0))[0]
                if sol_usd > 0 and price_usd > 0:
                    return price_usd / sol_usd

        # 2. Bonding curve reserves (Pump.fun tokens still on curve)
        try:
            from services.pumpfun import pumpfun_buyer
            state = pumpfun_buyer.fetch_bonding_curve_state(mint)
            if state and state.virtual_token_reserves > 0:
                return (state.virtual_sol_reserves / state.virtual_token_reserves) / 1e9
        except Exception:
            pass

        # 3. Jupiter Price API (works for any DEX, ~100ms)
        try:
            # Check local TTL cache to avoid hammering Jupiter
            cache_key = f"_jup_price_{mint}"
            cached = getattr(self, cache_key, None)
            if cached and (time.time() - cached[1]) < 5:
                return cached[0]

            resp = _req.get(
                f"https://api.jup.ag/price/v2?ids={mint}",
                timeout=3,
            )
            if resp.status_code == 200:
                data = resp.json().get("data", {}).get(mint, {})
                price_usd = float(data.get("price", 0))
                if price_usd > 0:
                    with price_cache_lock:
                        sol_usd = price_cache.get(sol_mint, (0.0, 0))[0]
                    if sol_usd > 0:
                        price_sol = price_usd / sol_usd
                        setattr(self, cache_key, (price_sol, time.time()))
                        return price_sol
        except Exception:
            pass
        return 0

    def _hft_auto_sell(self, mint, pos, reason):
        """Execute auto-sell for an HFT position."""
        symbol = pos.get('symbol', '???')
        pnl = pos.get('current_pnl_pct', 0)
        logger.info(f"⚡ HFT AUTO-SELL: {symbol} reason={reason} pnl={pnl:.1f}%")

        try:
            sio_bridge.emit('hft_position_update', {
                'mint': mint, 'status': 'selling', 'reason': reason,
            }, namespace='/sniper')

            from services.tokens import get_token_accounts
            from services.trading import execute_trade_with_jito
            from services.jito import tip_floor_cache

            holdings = get_token_accounts()
            token_balance = 0
            for h in holdings:
                if h.get('mint') == mint:
                    token_balance = h.get('balance', 0)
                    break

            if token_balance <= 0:
                logger.warning(f"⚡ HFT auto-sell: no balance for {symbol}")
                with self._hft_lock:
                    self._hft_positions.pop(mint, None)
                sio_bridge.emit('hft_position_update', {
                    'mint': mint, 'status': 'error', 'reason': 'no_balance',
                }, namespace='/sniper')
                return

            percentile = self.settings.get('hftJitoPercentile', '95th')
            tip_lamports = tip_floor_cache.get_optimal_tip(percentile=percentile)
            slippage_bps = int(float(self.settings.get('hftSlippage', 25)) * 100)

            result = execute_trade_with_jito(
                input_mint=mint,
                output_mint="So11111111111111111111111111111111111111112",
                amount=token_balance,
                source=f"HFT Sell ({symbol}, {reason})",
                slippage_bps=slippage_bps,
                tip_lamports=tip_lamports,
            )

            logger.info(f"✅ HFT SOLD: {symbol} reason={reason} — {result.get('signature', '')[:16]}...")

            with self._hft_lock:
                self._hft_positions.pop(mint, None)

            sio_bridge.emit('hft_position_update', {
                'mint': mint, 'status': 'sold', 'reason': reason,
                'sol_received': result.get('amount_out', 0),
                'signature': result.get('signature', ''),
            }, namespace='/sniper')

            # Refresh positions for all clients
            try:
                positions = db.get_snipe_positions(50)
                for p in positions:
                    if hasattr(p.get('timestamp'), 'isoformat'):
                        p['timestamp'] = p['timestamp'].isoformat()
                sio_bridge.emit('snipe_positions_update', {'positions': positions}, namespace='/sniper')
            except Exception:
                pass

            sio_bridge.emit('notification', {
                'title': f'HFT Auto-Sell ({reason})',
                'message': f"{symbol}: P&L {pnl:+.1f}%",
                'type': 'info',
            }, namespace='/bots')

        except Exception as e:
            logger.error(f"❌ HFT auto-sell error for {symbol}: {e}", exc_info=True)
            with self._hft_lock:
                self._hft_positions.pop(mint, None)
            sio_bridge.emit('hft_position_update', {
                'mint': mint, 'status': 'error', 'reason': str(e),
            }, namespace='/sniper')


# Global instance
sniper_engine = SniperEngine()
