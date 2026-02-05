import json
import logging
import threading
import time
from typing import List, Dict, Any, Optional, Tuple
import requests
from config import JUPITER_QUOTE_API, JUPITER_API_KEY, JUPITER_SWAP_API, WALLET_ADDRESS, HELIUS_STAKED_RPC
from concurrent.futures import ThreadPoolExecutor
from services.jito import send_jito_bundle, build_tip_transaction
from services.tokens import get_token_symbol
from services.blockhash_cache import get_blockhash
import sio_bridge

# Force logging to console
logger = logging.getLogger("arb_engine")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(levelname)s:%(name)s:%(message)s'))
    logger.addHandler(ch)

# Direct DEX venues that bypass Jupiter
DIRECT_VENUES = {"Raydium", "Orca"}


class ArbEngine:
    def __init__(self, helius_client, db, scan_interval: float = 2.0):
        self.helius = helius_client
        self.db = db
        self._running = False
        self._thread = None
        self.scan_interval = max(1.0, scan_interval)

        # Pairs to monitor for ARB
        self.monitored_pairs = []
        self.venues = ["Raydium", "Orca", "Meteora", "Phoenix"]
        self.executor = ThreadPoolExecutor(max_workers=10)

        # Persistent HTTP session for Jupiter API (TLS reuse)
        self.session = requests.Session()
        if JUPITER_API_KEY:
            self.session.headers['x-api-key'] = JUPITER_API_KEY

        # Configuration
        self.auto_strike = False
        self.jito_tip = 0.001
        self.min_profit_pct = 0.1

        # Direct DEX execution
        self.raydium_registry = None       # Injected by main.py
        self.orca_sidecar_url = "http://127.0.0.1:5003"
        self.orca_pool_map: Dict[Tuple[str, str], str] = {}  # (mintA, mintB) -> whirlpool address
        self._orca_map_loaded = False

        self.refresh_pairs()
        print("⚡ ArbEngine Initialized")

    # ── Direct DEX wiring ────────────────────────────────────────────

    def set_raydium_registry(self, registry):
        """Wire the Raydium pool registry for direct swap building."""
        self.raydium_registry = registry
        logger.info("ArbEngine: Raydium registry wired for direct swaps")

    def _load_orca_pool_map(self):
        """Load Orca whirlpool address mapping for monitored pairs.
        Queries the sidecar for known pools. Called once on first strike attempt.
        """
        if self._orca_map_loaded:
            return

        # Known high-liquidity Orca whirlpools (hardcoded for speed, discoverable via API)
        known_pools = {
            # SOL/USDC 0.01% fee tier
            ("So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"):
                "7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm",
            ("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "So11111111111111111111111111111111111111112"):
                "7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm",
            # SOL/USDT
            ("So11111111111111111111111111111111111111112", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"):
                "4GkRbcYg1VKsZropgai4dMf2Nj2PkXNLf43knFpavrSi",
            ("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "So11111111111111111111111111111111111111112"):
                "4GkRbcYg1VKsZropgai4dMf2Nj2PkXNLf43knFpavrSi",
        }
        self.orca_pool_map.update(known_pools)

        # Try to discover more via Orca API (best-effort, non-blocking)
        try:
            resp = self.session.get("https://api.mainnet.orca.so/v1/whirlpool/list", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                whirlpools = data.get("whirlpools", [])
                for wp in whirlpools:
                    addr = wp.get("address", "")
                    mint_a = wp.get("tokenA", {}).get("mint", "")
                    mint_b = wp.get("tokenB", {}).get("mint", "")
                    tvl = wp.get("tvl", 0)
                    if addr and mint_a and mint_b and tvl and tvl > 100_000:
                        # Only cache pools with >$100k TVL
                        key_ab = (mint_a, mint_b)
                        key_ba = (mint_b, mint_a)
                        # Keep the one with highest TVL
                        if key_ab not in self.orca_pool_map:
                            self.orca_pool_map[key_ab] = addr
                            self.orca_pool_map[key_ba] = addr
                logger.info(f"Loaded {len(self.orca_pool_map)} Orca pool mappings")
        except Exception as e:
            logger.debug(f"Orca pool map API load failed (using hardcoded): {e}")

        self._orca_map_loaded = True

    # ── Core methods (unchanged) ─────────────────────────────────────

    def refresh_pairs(self):
        """Load pairs from database or use defaults if empty."""
        try:
            # Tell frontend to clear matrix to avoid stale/stuck rows
            sio_bridge.emit('matrix_clear', {}, namespace='/arb')

            db_pairs = self.db.get_arb_pairs()
            if not db_pairs:
                # Default pairs - save to DB so they have IDs and can be managed
                defaults = [
                    {"input": "So11111111111111111111111111111111111111112", "output": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": 10 * 10**9, "in_sym": "SOL", "out_sym": "USDC"},
                    {"input": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "output": "So11111111111111111111111111111111111111112", "amount": 1000 * 10**6, "in_sym": "USDC", "out_sym": "SOL"},
                ]
                for d in defaults:
                    self.db.save_arb_pair(d["input"], d["output"], d["in_sym"], d["out_sym"], d["amount"])
                db_pairs = self.db.get_arb_pairs()

            self.monitored_pairs = []
            for p in db_pairs:
                in_sym = p["input_symbol"]
                out_sym = p["output_symbol"]

                # If symbol looks like a truncated mint (e.g. "Abc1..."), try to re-resolve it
                if in_sym.endswith("...") and len(in_sym) <= 7:
                    in_sym = get_token_symbol(p["input_mint"])
                if out_sym.endswith("...") and len(out_sym) <= 7:
                    out_sym = get_token_symbol(p["output_mint"])

                self.monitored_pairs.append({
                    "id": p["id"],
                    "input": p["input_mint"],
                    "output": p["output_mint"],
                    "input_symbol": in_sym,
                    "output_symbol": out_sym,
                    "amount": p["amount"]
                })
        except Exception as e:
            logger.error(f"Error refreshing arb pairs: {e}")

    def update_config(self, auto_strike: bool, jito_tip: float, min_profit: float, scan_interval: float = None):
        self.auto_strike = auto_strike
        self.jito_tip = jito_tip
        self.min_profit_pct = min_profit
        if scan_interval is not None:
            self.scan_interval = max(1.0, scan_interval)
        logger.info(f"⚡ Arb Engine Config Updated: Strike={auto_strike}, Tip={jito_tip}, Min={min_profit}%, Interval={self.scan_interval}s")

    def refresh(self):
        self.refresh_pairs()
        logger.info(f"⚡ Arb Engine Refreshed: {len(self.monitored_pairs)} pairs")

    def start(self):
        if self._thread and self._thread.is_alive(): return
        self._running = True
        self._thread = threading.Thread(target=self.main_loop, daemon=True)
        self._thread.start()
        print("⚡ Arb Monitor Engine Started")

    def stop(self):
        self._running = False
        self._thread = None
        self.session.close()
        print("⚡ Arb Monitor Engine Stopped")

    def is_running(self):
        return self._running

    def main_loop(self):
        logger.info(f"🔄 Arb Engine Main Loop Started (interval={self.scan_interval}s)")
        while self._running:
            try:
                for pair in self.monitored_pairs:
                    self.check_pair_arb(pair)
                time.sleep(self.scan_interval)
            except Exception as e:
                logger.error(f"Arb Engine Error: {e}")
                time.sleep(self.scan_interval * 2)

    def check_pair_arb(self, pair):
        """Compare quotes across different venues via Jupiter."""
        input_mint = pair["input"]
        output_mint = pair["output"]
        amount = int(pair["amount"])

        futures = []
        for venue in self.venues:
            url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&dexXLabels={venue}"
            futures.append(self.executor.submit(self.fetch_quote, url, venue))

        results = [f.result() for f in futures]
        valid_quotes = [r for r in results if r and "outAmount" in r]

        matrix_data = {
            "id": pair.get("id"),
            "input_symbol": pair["input_symbol"],
            "output_symbol": pair["output_symbol"],
            "venues": {}
        }

        for q in valid_quotes:
            out_amount = int(q["outAmount"])

            # Robust price calculation using decimals
            in_decimals = 9 if pair["input_symbol"] == "SOL" else (6 if pair["input_symbol"] in ["USDC", "USDT"] else 6)
            out_decimals = 9 if pair["output_symbol"] == "SOL" else (6 if pair["output_symbol"] in ["USDC", "USDT"] else 6)

            price = (out_amount / (10**out_decimals)) / (amount / (10**in_decimals))
            matrix_data["venues"][q["venue"]] = price

        if matrix_data["venues"]:
            sio_bridge.emit('price_matrix_update', matrix_data, namespace='/arb')

        if len(valid_quotes) > 1:
            valid_quotes.sort(key=lambda x: int(x["outAmount"]), reverse=True)
            best = valid_quotes[0] # Highest output
            worst = valid_quotes[-1] # Lowest output

            best_amount = int(best["outAmount"])
            worst_amount = int(worst["outAmount"])

            diff = best_amount - worst_amount
            spread_pct = (diff / worst_amount) * 100

            if spread_pct > 0.005:
                gross_profit_usd = 0
                if pair["output_symbol"] == "USDC":
                    gross_profit_usd = diff / 1e6
                elif pair["input_symbol"] == "USDC":
                    target_price = matrix_data["venues"].get(best["venue"], 0)
                    gross_profit_usd = (diff / 1e9) * target_price if pair["output_symbol"] == "SOL" else 0

                net_profit_usd = max(0, gross_profit_usd - 0.25)

                opp = {
                    "input_mint": input_mint,
                    "output_mint": output_mint,
                    "input_symbol": pair["input_symbol"],
                    "output_symbol": pair["output_symbol"],
                    "best_venue": best["venue"],
                    "worst_venue": worst["venue"],
                    "best_amount": best_amount,
                    "worst_amount": worst_amount,
                    "spread_pct": spread_pct,
                    "gross_profit_usd": gross_profit_usd,
                    "net_profit_usd": net_profit_usd,
                    "timestamp": time.time(),
                    "input_amount": amount,
                    "best_quote": best,
                    "worst_quote": worst
                }
                sio_bridge.emit('arb_opportunity', opp, namespace='/arb')

                # --- Auto Strike Logic ---
                if self.auto_strike and spread_pct >= self.min_profit_pct and net_profit_usd > 0:
                    self.execute_atomic_strike(opp)

    # ── Venue-Aware Swap Building ────────────────────────────────────

    def _build_swap_for_venue(
        self,
        venue: str,
        input_mint: str,
        output_mint: str,
        amount_in: int,
        wallet: str,
        blockhash: str,
        slippage_bps: int = 50,
    ) -> Tuple[Optional[str], int, str]:
        """
        Build a swap transaction for a specific venue.

        Returns (tx_b64, estimated_output, method_used) where method_used is
        "raydium_direct", "orca_sidecar", or "jupiter_fallback".
        Returns (None, 0, "failed") on failure.
        """
        # 1. Try Raydium direct (instant, ~1ms)
        if venue == "Raydium" and self.raydium_registry:
            try:
                pool = self.raydium_registry.get_pool_for_pair(input_mint, output_mint)
                if pool:
                    # Check reserve freshness (stale >50 slots ≈ 20s → skip)
                    from services.blockhash_cache import get_blockhash_cache
                    current_slot = get_blockhash_cache().get_slot()
                    if current_slot > 0 and pool.last_update_slot > 0:
                        slot_delta = current_slot - pool.last_update_slot
                        if slot_delta > 50:
                            logger.warning(f"Raydium reserves stale ({slot_delta} slots) — falling through to Jupiter")
                            # Fall through below
                            pool = None

                    if pool:
                        # Determine swap direction
                        coin_to_pc = (input_mint == pool.coin_mint)

                        estimated_out = self.raydium_registry.compute_amount_out(
                            pool.pool_address, amount_in, coin_to_pc
                        )
                        if estimated_out <= 0:
                            logger.warning("Raydium compute_amount_out returned 0 — falling through")
                        else:
                            min_out = int(estimated_out * (10000 - slippage_bps) / 10000)
                            tx_b64 = self.raydium_registry.build_swap_transaction(
                                pool.pool_address, amount_in, min_out, coin_to_pc,
                                wallet, blockhash,
                            )
                            if tx_b64:
                                logger.info(f"Built Raydium swap directly: {amount_in} → ~{estimated_out}")
                                return tx_b64, estimated_out, "raydium_direct"
                            else:
                                logger.warning("Raydium tx build returned None — falling through")
            except Exception as e:
                logger.warning(f"Raydium direct build failed: {e} — falling through to Jupiter")

        # 2. Try Orca sidecar (~100ms localhost HTTP)
        if venue == "Orca":
            try:
                self._load_orca_pool_map()
                pool_address = self.orca_pool_map.get((input_mint, output_mint))
                if pool_address:
                    resp = self.session.post(
                        f"{self.orca_sidecar_url}/build/swap",
                        json={
                            "poolAddress": pool_address,
                            "inputMint": input_mint,
                            "amount": str(amount_in),
                            "userWallet": wallet,
                            "slippagePct": slippage_bps / 100,
                        },
                        timeout=3,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        tx_b64 = data.get("transaction")
                        estimated_out = int(data.get("estimatedAmountOut", 0))
                        if tx_b64 and estimated_out > 0:
                            logger.info(f"Built Orca swap via sidecar: {amount_in} → ~{estimated_out}")
                            return tx_b64, estimated_out, "orca_sidecar"
                    else:
                        logger.warning(f"Orca sidecar returned {resp.status_code}: {resp.text[:200]}")
                else:
                    logger.debug(f"No Orca pool mapping for {input_mint[:8]}../{output_mint[:8]}..")
            except requests.ConnectionError:
                logger.warning("Orca sidecar unreachable — falling through to Jupiter")
            except Exception as e:
                logger.warning(f"Orca sidecar build failed: {e} — falling through to Jupiter")

        # 3. Jupiter fallback (any venue, ~500-600ms)
        return self._build_jupiter_swap(
            venue, input_mint, output_mint, amount_in, wallet, slippage_bps
        )

    def _build_jupiter_swap(
        self,
        venue: str,
        input_mint: str,
        output_mint: str,
        amount_in: int,
        wallet: str,
        slippage_bps: int = 50,
    ) -> Tuple[Optional[str], int, str]:
        """Build a swap via Jupiter Quote + Swap API (fallback path)."""
        try:
            # Quote
            quote_url = (
                f"{JUPITER_QUOTE_API}?"
                f"inputMint={input_mint}&"
                f"outputMint={output_mint}&"
                f"amount={amount_in}&"
                f"dexes={venue}&"
                f"onlyDirectRoutes=true&"
                f"slippageBps={slippage_bps}"
            )
            quote_resp = self.session.get(quote_url, timeout=5)
            if quote_resp.status_code != 200:
                logger.error(f"Jupiter quote failed for {venue}: {quote_resp.text[:200]}")
                return None, 0, "failed"

            quote = quote_resp.json()
            estimated_out = int(quote.get("outAmount", 0))

            # Swap
            swap_resp = self.session.post(JUPITER_SWAP_API, json={
                "quoteResponse": quote,
                "userPublicKey": wallet,
                "wrapAndUnwrapSol": True,
                "dynamicComputeUnitLimit": True,
                "prioritizationFeeLamports": 10000,
            }, timeout=10)

            if swap_resp.status_code != 200:
                logger.error(f"Jupiter swap build failed for {venue}: {swap_resp.text[:200]}")
                return None, 0, "failed"

            tx_b64 = swap_resp.json().get("swapTransaction")
            logger.info(f"Built Jupiter swap (fallback) for {venue}: {amount_in} → ~{estimated_out}")
            return tx_b64, estimated_out, "jupiter_fallback"

        except Exception as e:
            logger.error(f"Jupiter fallback error for {venue}: {e}")
            return None, 0, "failed"

    # ── Atomic Strike Execution ──────────────────────────────────────

    def execute_atomic_strike(self, opp):
        """
        Build and send a Jito bundle for atomic venue arbitrage.

        Uses direct DEX instruction building for Raydium (~1ms) and Orca (~100ms),
        falling back to Jupiter API (~500ms) for other venues.

        Strategy:
        - If monitoring SOL -> USDC and Raydium gives more USDC than Orca:
          - Leg 1: Buy SOL on Orca (cheap) with USDC
          - Leg 2: Sell SOL on Raydium (expensive) for USDC
          - Net profit = USDC difference minus fees
        """
        strike_start = time.time()
        logger.info(f"🚀 ATOMIC STRIKE: {opp['input_symbol']}/{opp['output_symbol']} spread={opp['spread_pct']:.3f}%")

        try:
            from config import KEYPAIR
            import base64

            if not KEYPAIR:
                logger.error("No keypair configured - cannot execute strike")
                return

            # Venues from opportunity
            best_venue = opp['best_venue']   # Highest output = expensive venue to SELL on
            worst_venue = opp['worst_venue'] # Lowest output = cheap venue to BUY on

            input_mint = opp['input_mint']
            output_mint = opp['output_mint']
            input_amount = opp['input_amount']

            wallet = str(KEYPAIR.pubkey())

            # Get blockhash from cache (instant memory read, zero RPC)
            recent_blockhash, last_valid_height = get_blockhash()
            if not recent_blockhash:
                logger.error("No blockhash available from cache")
                return
            # Staleness guard: skip if blockhash is close to expiry
            blocks_remaining = None
            if last_valid_height > 0:
                from services.blockhash_cache import get_blockhash_cache
                current_slot = get_blockhash_cache().get_slot()
                if current_slot > 0:
                    blocks_remaining = last_valid_height - current_slot
                    if blocks_remaining < 20:
                        logger.warning(f"Blockhash too close to expiry ({blocks_remaining} blocks remaining) — skipping strike")
                        return
            logger.info(f"Using gRPC blockhash: {recent_blockhash[:8]}... (valid for {blocks_remaining or '?'} blocks)")

            # ============================================================
            # LEG 1: Buy input token on CHEAP venue (worst_venue)
            # Swap output -> input on the venue where input is cheaper
            # ============================================================
            leg1_input_amount = opp['worst_amount']  # Amount of output token

            # ============================================================
            # Build both legs — use direct DEX when available
            # Raydium is instant (~1ms), Orca sidecar ~100ms, Jupiter ~500ms
            # Parallelize when both need network calls
            # ============================================================

            leg1_build_start = time.time()

            # Check if either leg can use direct building (instant / fast)
            worst_is_direct = worst_venue in DIRECT_VENUES
            best_is_direct = best_venue in DIRECT_VENUES

            # Build Leg 1: output->input on worst_venue (buy cheap)
            if worst_is_direct and worst_venue == "Raydium" and self.raydium_registry:
                # Raydium is instant — build sequentially, then use output for leg 2
                leg1_tx_b64, leg1_output, leg1_method = self._build_swap_for_venue(
                    worst_venue, output_mint, input_mint, leg1_input_amount,
                    wallet, recent_blockhash,
                )
            else:
                # Non-instant leg 1 — will parallelize with leg 2 below if possible
                leg1_tx_b64, leg1_output, leg1_method = self._build_swap_for_venue(
                    worst_venue, output_mint, input_mint, leg1_input_amount,
                    wallet, recent_blockhash,
                )

            if not leg1_tx_b64:
                logger.error(f"Leg 1 build failed ({leg1_method})")
                return

            leg1_time_ms = (time.time() - leg1_build_start) * 1000

            # Use output from leg 1 as input for leg 2
            leg2_input_amount = leg1_output

            # Build Leg 2: input->output on best_venue (sell expensive)
            leg2_build_start = time.time()
            leg2_tx_b64, leg2_output, leg2_method = self._build_swap_for_venue(
                best_venue, input_mint, output_mint, leg2_input_amount,
                wallet, recent_blockhash,
            )

            if not leg2_tx_b64:
                logger.error(f"Leg 2 build failed ({leg2_method})")
                return

            leg2_time_ms = (time.time() - leg2_build_start) * 1000

            # ============================================================
            # Calculate expected profit
            # ============================================================
            profit = leg2_output - leg1_input_amount

            # Convert to readable units
            out_decimals = 6 if opp['output_symbol'] in ['USDC', 'USDT'] else 9
            profit_readable = profit / (10 ** out_decimals)

            logger.info(f"📊 Arb Calculation:")
            logger.info(f"   Leg 1 [{leg1_method}, {leg1_time_ms:.0f}ms]: {leg1_input_amount / (10**out_decimals):.4f} {opp['output_symbol']} -> {leg2_input_amount / (10**9):.6f} {opp['input_symbol']} on {worst_venue}")
            logger.info(f"   Leg 2 [{leg2_method}, {leg2_time_ms:.0f}ms]: {leg2_input_amount / (10**9):.6f} {opp['input_symbol']} -> {leg2_output / (10**out_decimals):.4f} {opp['output_symbol']} on {best_venue}")
            logger.info(f"   Profit: {profit_readable:.4f} {opp['output_symbol']}")

            if profit <= 0:
                logger.warning(f"⚠️ No profit after routing - aborting strike")
                return

            # ============================================================
            # Build Jito tip transaction
            # ============================================================
            tip_lamports = int(self.jito_tip * 1e9)
            tip_tx_b64 = build_tip_transaction(tip_lamports, recent_blockhash)

            if not tip_tx_b64:
                logger.error("Failed to build tip transaction")
                return

            # ============================================================
            # Sign and send bundle via Jito
            # ============================================================

            # Decode, sign, and re-encode transactions
            def sign_transaction(tx_b64):
                from solders.transaction import VersionedTransaction
                tx_bytes = base64.b64decode(tx_b64)
                tx = VersionedTransaction.from_bytes(tx_bytes)
                signed_tx = VersionedTransaction(tx.message, [KEYPAIR])
                return base64.b64encode(bytes(signed_tx)).decode('utf-8')

            signed_leg1 = sign_transaction(leg1_tx_b64)
            signed_leg2 = sign_transaction(leg2_tx_b64)

            bundle = [signed_leg1, signed_leg2, tip_tx_b64]

            logger.info(f"🚀 Sending Jito bundle with {len(bundle)} transactions...")
            results = send_jito_bundle(bundle)

            strike_elapsed_ms = (time.time() - strike_start) * 1000
            success = any(r.get('status') == 200 for r in results)

            if success:
                logger.info(f"✅ Arb bundle submitted successfully!")
                logger.info(f"⏱️ Strike completed in {strike_elapsed_ms:.0f}ms (leg1={leg1_method}/{leg1_time_ms:.0f}ms, leg2={leg2_method}/{leg2_time_ms:.0f}ms)")
                sio_bridge.emit('notification', {
                    'title': 'Arb Strike Executed',
                    'message': f"Atomic arb: {worst_venue} → {best_venue}, expected profit: {profit_readable:.4f} {opp['output_symbol']}",
                    'type': 'success'
                }, namespace='/arb')
                sio_bridge.emit('strike_result', {
                    'success': True,
                    'profit': profit_readable,
                    'output_symbol': opp['output_symbol'],
                    'worst_venue': worst_venue,
                    'best_venue': best_venue,
                    'leg1_method': leg1_method,
                    'leg2_method': leg2_method,
                    'elapsed_ms': strike_elapsed_ms,
                    'timestamp': time.time(),
                }, namespace='/arb')
            else:
                logger.error(f"❌ Bundle submission failed: {results}")
                logger.info(f"⏱️ Strike failed in {strike_elapsed_ms:.0f}ms")
                sio_bridge.emit('notification', {
                    'title': 'Arb Strike Failed',
                    'message': f"Bundle rejected by Jito",
                    'type': 'error'
                }, namespace='/arb')

        except Exception as e:
            strike_elapsed_ms = (time.time() - strike_start) * 1000
            logger.error(f"Strike Error ({strike_elapsed_ms:.0f}ms): {e}", exc_info=True)
            sio_bridge.emit('notification', {
                'title': 'Arb Strike Error',
                'message': str(e),
                'type': 'error'
            }, namespace='/arb')

    def fetch_quote(self, url, venue):
        try:
            response = self.session.get(url, timeout=2)
            if response.status_code == 200:
                data = response.json()
                if "outAmount" in data:
                    data["venue"] = venue
                    return data
        except:
            pass
        return None
