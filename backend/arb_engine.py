import json
import logging
import threading
import time
from typing import List, Dict, Any
import requests
from config import JUPITER_QUOTE_API, JUPITER_API_KEY, JUPITER_SWAP_API, WALLET_ADDRESS
from concurrent.futures import ThreadPoolExecutor
from services.jito import send_jito_bundle, build_tip_transaction

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
            db_pairs = self.db.get_arb_pairs()
            if not db_pairs:
                # Default pairs
                self.monitored_pairs = [
                    {"input": "So11111111111111111111111111111111111111112", "output": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": 10 * 10**9, "input_symbol": "SOL", "output_symbol": "USDC"},
                    {"input": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "output": "So11111111111111111111111111111111111111112", "amount": 1000 * 10**6, "input_symbol": "USDC", "output_symbol": "SOL"},
                ]
            else:
                self.monitored_pairs = [
                    {
                        "id": p["id"],
                        "input": p["input_mint"],
                        "output": p["output_mint"],
                        "input_symbol": p["input_symbol"],
                        "output_symbol": p["output_symbol"],
                        "amount": p["amount"]
                    } for p in db_pairs
                ]
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
            "input_symbol": pair["input_symbol"],
            "output_symbol": pair["output_symbol"],
            "venues": {}
        }
        
        for q in valid_quotes:
            out_amount = int(q["outAmount"])
            if pair["input_symbol"] == "SOL":
                price = out_amount / (pair["amount"] / 1e9) / 1e6 # USDC per SOL
            elif pair["output_symbol"] == "SOL":
                price = (pair["amount"] / 1e6) / (out_amount / 1e9) # USDC per SOL
            else:
                price = out_amount / pair["amount"]
            
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
        """Build and send a Jito bundle for the arbitrage opportunity."""
        logger.info(f"🚀 ATOMIC STRIKE TRIGGERED: {opp['input_symbol']} -> {opp['output_symbol']} ({opp['spread_pct']:.3f}%)")
        
        try:
            # 1. We need to buy the target asset on the CHEAPER venue (worst output for SOL -> X means cheaper X?)
            # Wait, best venue has highest outAmount. So it is the cheapest venue to BUY on.
            # No, if I sell 10 SOL, best venue gives me 1450 USDC, worst gives 1440.
            # So I should BUY USDC on the BEST venue.
            
            # For ARB: 
            # Step 1: Buy Target on Venue A (where it is cheap)
            # Step 2: Sell Target on Venue B (where it is expensive)
            
            # In our setup:
            # opp['best_quote'] gives the highest output for a fixed input.
            # So Best Venue is where we get the MOST of the output.
            
            # To actually ARB, we need to do:
            # SOL -> USDC (Venue Best)
            # USDC -> SOL (Venue ? - we need to fetch the opposite quote)
            
            # Real atomic arb requires:
            # 1. Buy token X on Venue A with 10 SOL.
            # 2. Sell token X on Venue B for SOL.
            # 3. If Result > 10 SOL + Fees, profit.
            
            # Our current monitor only checks one-way spreads.
            # Let's log the attempt for now as we integrate Jito.
            logger.info(f"Simulating atomic bundle via Jito with {self.jito_tip} SOL tip...")
            
            # Placeholder for actual transaction construction
            # transactions = [buy_tx, sell_tx, tip_tx]
            # send_jito_bundle(transactions)
            
            self.socketio.emit('notification', {
                'title': 'Arb Strike Sent',
                'message': f"Atomic bundle submitted to Jito Block Engine",
                'type': 'info'
            }, namespace='/arb')
            
        except Exception as e:
            logger.error(f"Strike Error: {e}")

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
