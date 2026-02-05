import json
import logging
import threading
import time
from typing import List, Dict, Any
import requests
from config import JUPITER_QUOTE_API, JUPITER_API_KEY, JUPITER_SWAP_API, WALLET_ADDRESS, HELIUS_STAKED_RPC
from concurrent.futures import ThreadPoolExecutor
from services.jito import send_jito_bundle, build_tip_transaction
from services.tokens import get_token_symbol
from services.blockhash_cache import get_fresh_blockhash

# Force logging to console
logger = logging.getLogger("arb_engine")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(levelname)s:%(name)s:%(message)s'))
    logger.addHandler(ch)

class ArbEngine:
    def __init__(self, helius_client, db, socketio):
        self.helius = helius_client
        self.db = db
        self.socketio = socketio
        self._running = False
        self._thread = None
        
        # Pairs to monitor for ARB
        self.monitored_pairs = []
        self.venues = ["Raydium", "Orca", "Meteora", "Phoenix"]
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # Configuration
        self.auto_strike = False
        self.jito_tip = 0.001
        self.min_profit_pct = 0.1
        
        self.refresh_pairs()
        print("⚡ ArbEngine Initialized")

    def refresh_pairs(self):
        """Load pairs from database or use defaults if empty."""
        try:
            # Tell frontend to clear matrix to avoid stale/stuck rows
            self.socketio.emit('matrix_clear', {}, namespace='/arb')
            
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

    def update_config(self, auto_strike: bool, jito_tip: float, min_profit: float):
        self.auto_strike = auto_strike
        self.jito_tip = jito_tip
        self.min_profit_pct = min_profit
        logger.info(f"⚡ Arb Engine Config Updated: Strike={auto_strike}, Tip={jito_tip}, Min={min_profit}%")

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
        print("⚡ Arb Monitor Engine Stopped")

    def is_running(self):
        return self._running

    def main_loop(self):
        print("🔄 Arb Engine Main Loop Started")
        while self._running:
            try:
                for pair in self.monitored_pairs:
                    self.check_pair_arb(pair)
                time.sleep(5) # Poll every 5 seconds
            except Exception as e:
                logger.error(f"Arb Engine Error: {e}")
                time.sleep(10)

    def check_pair_arb(self, pair):
        """Compare quotes across different venues via Jupiter."""
        input_mint = pair["input"]
        output_mint = pair["output"]
        amount = int(pair["amount"])
        
        headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}
        
        futures = []
        for venue in self.venues:
            url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&dexXLabels={venue}"
            futures.append(self.executor.submit(self.fetch_quote, url, venue, headers))
            
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
            
            # Try to get real decimals from DB if possible
            # (In a real scenario, we'd have a more robust way to get decimals for any token)
            
            price = (out_amount / (10**out_decimals)) / (amount / (10**in_decimals))
            matrix_data["venues"][q["venue"]] = price
            
        if matrix_data["venues"]:
            self.socketio.emit('price_matrix_update', matrix_data, namespace='/arb')

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
                self.socketio.emit('arb_opportunity', opp, namespace='/arb')
                
                # --- Auto Strike Logic ---
                if self.auto_strike and spread_pct >= self.min_profit_pct and net_profit_usd > 0:
                    self.execute_atomic_strike(opp)

    def execute_atomic_strike(self, opp):
        """
        Build and send a Jito bundle for atomic venue arbitrage.

        Strategy:
        - If monitoring SOL -> USDC and Raydium gives more USDC than Orca:
          - Leg 1: Buy SOL on Orca (cheap) with USDC
          - Leg 2: Sell SOL on Raydium (expensive) for USDC
          - Net profit = USDC difference minus fees
        """
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

            # Map venue names to Jupiter dex identifiers
            venue_map = {
                'Raydium': 'Raydium',
                'Orca': 'Orca',
                'Meteora': 'Meteora',
                'Phoenix': 'Phoenix'
            }

            best_dex = venue_map.get(best_venue, best_venue)
            worst_dex = venue_map.get(worst_venue, worst_venue)

            headers = {'Content-Type': 'application/json'}
            if JUPITER_API_KEY:
                headers['x-api-key'] = JUPITER_API_KEY

            wallet = str(KEYPAIR.pubkey())

            # Get recent blockhash from cache (instant, no HTTP call)
            recent_blockhash, _ = get_fresh_blockhash(max_age_ms=500)
            if not recent_blockhash:
                logger.error("No blockhash available from cache")
                return
            logger.info(f"Using cached blockhash: {recent_blockhash[:8]}...")

            # ============================================================
            # LEG 1: Buy input token on CHEAP venue (worst_venue)
            # Swap output -> input on the venue where input is cheaper
            # ============================================================

            # We need to figure out how much output token to spend
            # Use the output amount from the worst quote as our input for leg 1
            leg1_input_amount = opp['worst_amount']  # Amount of output token

            leg1_quote_url = (
                f"{JUPITER_QUOTE_API}?"
                f"inputMint={output_mint}&"
                f"outputMint={input_mint}&"
                f"amount={leg1_input_amount}&"
                f"dexes={worst_dex}&"
                f"onlyDirectRoutes=true&"
                f"slippageBps=50"
            )

            leg1_quote_resp = requests.get(leg1_quote_url, headers=headers, timeout=5)
            if leg1_quote_resp.status_code != 200:
                logger.error(f"Leg 1 quote failed: {leg1_quote_resp.text}")
                return
            leg1_quote = leg1_quote_resp.json()

            # Build Leg 1 swap transaction
            leg1_swap_resp = requests.post(JUPITER_SWAP_API, headers=headers, json={
                "quoteResponse": leg1_quote,
                "userPublicKey": wallet,
                "wrapAndUnwrapSol": True,
                "dynamicComputeUnitLimit": True,
                "prioritizationFeeLamports": 10000
            }, timeout=10)

            if leg1_swap_resp.status_code != 200:
                logger.error(f"Leg 1 swap build failed: {leg1_swap_resp.text}")
                return
            leg1_tx_b64 = leg1_swap_resp.json().get('swapTransaction')

            # ============================================================
            # LEG 2: Sell input token on EXPENSIVE venue (best_venue)
            # Swap input -> output on the venue where input is worth more
            # ============================================================

            # Use the output from leg 1 as input for leg 2
            leg2_input_amount = int(leg1_quote.get('outAmount', 0))

            leg2_quote_url = (
                f"{JUPITER_QUOTE_API}?"
                f"inputMint={input_mint}&"
                f"outputMint={output_mint}&"
                f"amount={leg2_input_amount}&"
                f"dexes={best_dex}&"
                f"onlyDirectRoutes=true&"
                f"slippageBps=50"
            )

            leg2_quote_resp = requests.get(leg2_quote_url, headers=headers, timeout=5)
            if leg2_quote_resp.status_code != 200:
                logger.error(f"Leg 2 quote failed: {leg2_quote_resp.text}")
                return
            leg2_quote = leg2_quote_resp.json()

            # Build Leg 2 swap transaction
            leg2_swap_resp = requests.post(JUPITER_SWAP_API, headers=headers, json={
                "quoteResponse": leg2_quote,
                "userPublicKey": wallet,
                "wrapAndUnwrapSol": True,
                "dynamicComputeUnitLimit": True,
                "prioritizationFeeLamports": 10000
            }, timeout=10)

            if leg2_swap_resp.status_code != 200:
                logger.error(f"Leg 2 swap build failed: {leg2_swap_resp.text}")
                return
            leg2_tx_b64 = leg2_swap_resp.json().get('swapTransaction')

            # ============================================================
            # Calculate expected profit
            # ============================================================
            leg2_output = int(leg2_quote.get('outAmount', 0))
            profit = leg2_output - leg1_input_amount

            # Convert to readable units
            out_decimals = 6 if opp['output_symbol'] in ['USDC', 'USDT'] else 9
            profit_readable = profit / (10 ** out_decimals)

            logger.info(f"📊 Arb Calculation:")
            logger.info(f"   Leg 1: {leg1_input_amount / (10**out_decimals):.4f} {opp['output_symbol']} -> {leg2_input_amount / (10**9):.6f} {opp['input_symbol']} on {worst_venue}")
            logger.info(f"   Leg 2: {leg2_input_amount / (10**9):.6f} {opp['input_symbol']} -> {leg2_output / (10**out_decimals):.4f} {opp['output_symbol']} on {best_venue}")
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

            success = any(r.get('status') == 200 for r in results)

            if success:
                logger.info(f"✅ Arb bundle submitted successfully!")
                self.socketio.emit('notification', {
                    'title': 'Arb Strike Executed',
                    'message': f"Atomic arb: {worst_venue} → {best_venue}, expected profit: {profit_readable:.4f} {opp['output_symbol']}",
                    'type': 'success'
                }, namespace='/arb')
            else:
                logger.error(f"❌ Bundle submission failed: {results}")
                self.socketio.emit('notification', {
                    'title': 'Arb Strike Failed',
                    'message': f"Bundle rejected by Jito",
                    'type': 'error'
                }, namespace='/arb')

        except Exception as e:
            logger.error(f"Strike Error: {e}", exc_info=True)
            self.socketio.emit('notification', {
                'title': 'Arb Strike Error',
                'message': str(e),
                'type': 'error'
            }, namespace='/arb')

    def fetch_quote(self, url, venue, headers):
        try:
            response = requests.get(url, headers=headers, timeout=2)
            if response.status_code == 200:
                data = response.json()
                if "outAmount" in data:
                    data["venue"] = venue
                    return data
        except:
            pass
        return None
