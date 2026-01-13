import json
import logging
import threading
import time
from typing import List, Dict, Any
from helius_infrastructure import HeliusClient, Programs
import requests
from config import JUPITER_QUOTE_API, JUPITER_API_KEY
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("arb_engine")
logger.setLevel(logging.INFO)
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(logging.Formatter('%(levelname)s:%(name)s:%(message)s'))
    logger.addHandler(ch)

class ArbEngine:
    def __init__(self, helius_client: HeliusClient, socketio):
        self.helius = helius_client
        self.socketio = socketio
        self._running = False
        self._thread = None
        
        # Pairs to monitor for ARB
        self.monitored_pairs = [
            {"input": "So11111111111111111111111111111111111111112", "output": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": 10 * 10**9, "input_symbol": "SOL", "output_symbol": "USDC"}, # 10 SOL
            {"input": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "output": "So11111111111111111111111111111111111111112", "amount": 1000 * 10**6, "input_symbol": "USDC", "output_symbol": "SOL"}, # 1000 USDC
        ]
        
        # Major DEXs to compare
        self.venues = ["Raydium", "Orca", "Meteora", "Phoenix"]
        self.executor = ThreadPoolExecutor(max_workers=10)
        logger.info("⚡ ArbEngine Initialized")

    def start(self):
        if self._thread and self._thread.is_alive(): return
        self._running = True
        self._thread = threading.Thread(target=self.main_loop, daemon=True)
        self._thread.start()
        logger.info("⚡ Arb Monitor Engine Thread Started")

    def stop(self):
        self._running = False

    def main_loop(self):
        logger.info("🔄 Arb Engine Main Loop Started")
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
        amount = pair["amount"]
        
        headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}
        
        futures = []
        for venue in self.venues:
            url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&onlyDirectRoutes=true&dexXLabels={venue}"
            futures.append(self.executor.submit(self.fetch_quote, url, venue, headers))
            
        results = [f.result() for f in futures]
        valid_quotes = [r for r in results if r and "outAmount" in r]
        
        if len(valid_quotes) > 1:
            # Sort by outAmount descending
            valid_quotes.sort(key=lambda x: int(x["outAmount"]), reverse=True)
            best = valid_quotes[0]
            worst = valid_quotes[-1]
            
            best_amount = int(best["outAmount"])
            worst_amount = int(worst["outAmount"])
            
            diff = best_amount - worst_amount
            spread_pct = (diff / worst_amount) * 100
            
            if spread_pct > 0.005: # Report even smaller gaps for testing
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
                    "timestamp": time.time()
                }
                self.socketio.emit('arb_opportunity', opp, namespace='/arb')
                # logger.info(f"Arb Found: {pair['input_symbol']}/{pair['output_symbol']} {spread_pct:.3f}%")

    def fetch_quote(self, url, venue, headers):
        try:
            response = requests.get(url, headers=headers, timeout=2).json()
            if "outAmount" in response:
                response["venue"] = venue
                return response
        except:
            pass
        return None
