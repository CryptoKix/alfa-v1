import asyncio
import json
import logging
import threading
import time
from typing import List, Dict, Any
from helius_infrastructure import HeliusClient, Programs
import requests
from config import JUPITER_QUOTE_API, JUPITER_API_KEY

logger = logging.getLogger("arb_engine")
logger.setLevel(logging.INFO)

class ArbEngine:
    def __init__(self, helius_client: HeliusClient, socketio):
        self.helius = helius_client
        self.socketio = socketio
        self._running = False
        self._thread = None
        self._loop = None
        
        # Pairs to monitor for ARB
        self.monitored_pairs = [
            {"input": "So11111111111111111111111111111111111111112", "output": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": 10 * 10**9, "input_symbol": "SOL", "output_symbol": "USDC"}, # 10 SOL
            {"input": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "output": "So11111111111111111111111111111111111111112", "amount": 1000 * 10**6, "input_symbol": "USDC", "output_symbol": "SOL"}, # 1000 USDC
        ]
        
        # Major DEXs to compare
        self.venues = ["Raydium", "Orca", "Meteora", "Phoenix"]

    def start(self):
        if self._thread: return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()
        print("⚡ Arb Monitor Engine Started")

    def stop(self):
        self._running = False
        if self._loop: self._loop.call_soon_threadsafe(self._loop.stop)

    def _run_event_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self.main_loop())

    async def main_loop(self):
        while self._running:
            try:
                for pair in self.monitored_pairs:
                    await self.check_pair_arb(pair)
                await asyncio.sleep(5) # Poll every 5 seconds
            except Exception as e:
                logger.error(f"Arb Engine Error: {e}")
                await asyncio.sleep(10)

    async def check_pair_arb(self, pair):
        """Compare quotes across different venues via Jupiter."""
        input_mint = pair["input"]
        output_mint = pair["output"]
        amount = pair["amount"]
        
        headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}
        
        tasks = []
        for venue in self.venues:
            url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&onlyDirectRoutes=true&dexXLabels={venue}"
            tasks.append(self.fetch_quote(url, venue, headers))
            
        results = await asyncio.gather(*tasks)
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
            
            if spread_pct > 0.01: # Report if > 0.01%
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

    async def fetch_quote(self, url, venue, headers):
        try:
            # Using loop.run_in_executor because requests is blocking
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda: requests.get(url, headers=headers, timeout=2).json()
            )
            if "outAmount" in response:
                response["venue"] = venue
                return response
        except:
            pass
        return None
