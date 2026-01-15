import time
import threading
import logging
from collections import defaultdict
from flask import current_app
from extensions import db, socketio
from services.trading import execute_trade_logic

logger = logging.getLogger("wolfpack")
logger.setLevel(logging.INFO)

class WolfPackEngine:
    def __init__(self):
        self._running = False
        self._thread = None
        
        # Configuration
        self.config = {
            "enabled": False,
            "consensus_threshold": 2, # Minimum unique wallets
            "time_window": 60,        # Seconds to look back
            "buy_amount": 0.1,        # SOL amount
            "priority_fee": 0.005,
            "slippage": 15
        }
        
        # State
        self.active_consensus = {} # {mint: {wallets: set(), timestamp: float}}
        self.cooldowns = {} # {mint: timestamp} to prevent rebuying immediately

    def start(self):
        if self._thread: return
        self._running = True
        self.load_config()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("🐺 Wolf Pack Engine Started")

    def load_config(self):
        saved = db.get_setting("wolfpack_config")
        if saved:
            self.config.update(saved)

    def update_config(self, new_config):
        self.config.update(new_config)
        db.save_setting("wolfpack_config", self.config)
        logger.info(f"🐺 Config Updated: {self.config}")
        socketio.emit('wolfpack_update', self.get_status(), namespace='/bots')

    def get_status(self):
        return {
            "config": self.config,
            "consensus": [
                {
                    "mint": mint, 
                    "count": len(data['wallets']), 
                    "wallets": list(data['wallets']),
                    "symbol": data.get('symbol', '???')
                } 
                for mint, data in self.active_consensus.items()
            ]
        }

    def _run_loop(self):
        while self._running:
            try:
                if self.config["enabled"]:
                    self.scan_signals()
                time.sleep(2)
            except Exception as e:
                logger.error(f"Loop Error: {e}")
                time.sleep(5)

    def scan_signals(self):
        # 1. Fetch recent signals from DB
        window_start = time.time() - self.config["time_window"]
        
        # We need to fetch enough signals to cover the window. 
        # Assuming DB get_signals returns most recent first.
        recent_signals = db.get_signals(limit=100)
        
        relevant_signals = [
            s for s in recent_signals 
            if datetime_to_timestamp(s['timestamp']) > window_start
            and s['type'] == 'Swap Detected'
        ]

        # 2. Group by Token (Buy side only)
        # Signal details are stored in JSON. logic needs to parse 'sent'/'received'.
        # CopyTrader saves: 'sent': {mint, symbol...}, 'received': {mint...}
        # If 'sent' is SOL, it's a BUY of 'received'.
        
        candidates = defaultdict(lambda: {"wallets": set(), "symbol": "???"})

        for sig in relevant_signals:
            try:
                details = json.loads(sig['details_json'])
                sent_mint = details.get('sent', {}).get('mint')
                recv_mint = details.get('received', {}).get('mint')
                
                # Check for BUY (SOL -> Token)
                if sent_mint == "So11111111111111111111111111111111111111112":
                    token_mint = recv_mint
                    token_symbol = details.get('received', {}).get('symbol')
                    
                    candidates[token_mint]["wallets"].add(sig['wallet_address'])
                    candidates[token_mint]["symbol"] = token_symbol
            except:
                continue

        # 3. Check Consensus & Cleanup
        self.active_consensus = candidates # Update state for UI
        
        for mint, data in candidates.items():
            count = len(data["wallets"])
            
            if count >= self.config["consensus_threshold"]:
                # Check cooldown
                if mint in self.cooldowns: continue
                
                logger.info(f"🐺 CONSENSUS REACHED: {data['symbol']} ({count} Whales)")
                self.execute_wolf_attack(mint, data['symbol'])

        # Emit updates to UI
        socketio.emit('wolfpack_update', self.get_status(), namespace='/bots')

    def execute_wolf_attack(self, mint, symbol):
        try:
            amount = self.config["buy_amount"]
            logger.info(f"🐺 ATTACKING: Buying {amount} SOL of {symbol}")
            
            # Execute Trade
            execute_trade_logic(
                "So11111111111111111111111111111111111111112",
                mint,
                amount,
                source=f"WolfPack: {symbol}",
                slippage_bps=int(self.config["slippage"] * 100),
                priority_fee=self.config["priority_fee"]
            )
            
            # Set Cooldown (forever for this session, or a long time to prevent double-buy)
            self.cooldowns[mint] = time.time()
            
            socketio.emit('notification', {
                'title': 'Wolf Pack Attack',
                'message': f"Consensus reached! Bought {symbol} with {amount} SOL.",
                'type': 'success'
            }, namespace='/bots')
            
        except Exception as e:
            logger.error(f"Attack Failed: {e}")

# Helper
import json
from datetime import datetime
def datetime_to_timestamp(dt_str):
    try:
        # DB format: YYYY-MM-DD HH:MM:SS
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").timestamp()
    except:
        return 0

wolf_pack = WolfPackEngine()
