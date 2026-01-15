import os
import sys
import time
import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import HELIUS_API_KEY, SOLANA_RPC, WALLET_ADDRESS
from helius_infrastructure import HeliusClient
from database import TactixDB
from copy_trader import CopyTraderEngine

# Setup Mock SocketIO
class MockSocketIO:
    def emit(self, event, data, namespace=None):
        pass # Do nothing

# Setup Logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
logger = logging.getLogger("backfill")

def dummy_execute(*args, **kwargs):
    pass

def backfill_whale_trades():
    print("🐳 Starting Whale Trade Backfill...")
    
    db = TactixDB()
    helius = HeliusClient()
    socketio = MockSocketIO()
    
    # Initialize Engine (just for decoding logic)
    engine = CopyTraderEngine(helius, db, socketio, dummy_execute)
    
    # Get active targets
    targets = db.get_all_targets()
    print(f"✅ Found {len(targets)} targets in database.")
    
    total_signals = 0
    
    for i, target in enumerate(targets):
        address = target['address']
        alias = target['alias']
        print(f"\n[{i+1}/{len(targets)}] Processing {alias} ({address[:8]})...")
        
        try:
            # Fetch last 25 signatures
            # Note: synchronous call to RPC via solana_client inside helius
            response = helius.rpc.get_signatures_for_address(address, limit=25)
            
            # Handle if response is wrapped in an object with 'value' (solders/solana-py)
            if hasattr(response, 'value'):
                signatures_list = response.value
            else:
                signatures_list = response

            # Check type of first item to determine how to access signature
            sigs = []
            if signatures_list:
                first_item = signatures_list[0]
                # print(f"DEBUG: Type of item: {type(first_item)}")
                if isinstance(first_item, dict):
                    sigs = [s['signature'] for s in signatures_list]
                elif hasattr(first_item, 'signature'):
                    sigs = [s.signature for s in signatures_list]
                else:
                    # Fallback for unexpected structure
                    sigs = [str(s) for s in signatures_list]

            print(f"   Fetched {len(sigs)} signatures. Parsing...")
            
            # Using ThreadPool to parallelize decoding slightly since decoding does RPC calls
            found_for_target = 0
            
            # We can't use async features easily here without a loop, but decode_swap is sync-ish wrapper around RPC?
            # Wait, decode_swap in CopyTraderEngine uses `self.helius.rpc.get_transaction` which is synchronous in solana.rpc.api
            # (unless using async client, but HeliusClient uses sync Client for rpc property)
            
            for sig in sigs:
                try:
                    # Check if already exists
                    # db.get_signals filtering by signature is not efficient, but save_signal is INSERT OR IGNORE
                    
                    details = engine.decode_swap(sig, address)
                    if details:
                        # Construct signal object matching CopyTraderEngine
                        sent_token = details['sent']
                        recv_token = details['received']
                        
                        signal_data = {
                            'signature': sig, 'wallet': address, 'alias': alias,
                            'timestamp': time.time(), # We ideally want block time but signature result has it
                            'type': 'Swap Detected',
                            'sent': sent_token, 'received': recv_token
                        }
                        
                        # Try to get timestamp from signature info if available
                        # sig_info = next((s for s in signatures if s.signature == sig), None)
                        # if sig_info and sig_info.block_time:
                        #     signal_data['timestamp'] = sig_info.block_time

                        db.save_signal(sig, address, 'Swap Detected', signal_data)
                        found_for_target += 1
                        total_signals += 1
                        print(f"   ✅ Saved Swap: {sent_token['amount']:.2f} {sent_token['symbol']} -> {recv_token['amount']:.2f} {recv_token['symbol']}")
                except Exception as e:
                    # print(f"   Error parsing {sig}: {e}")
                    pass
                    
            print(f"   -> Added {found_for_target} signals.")
            
        except Exception as e:
            print(f"   ❌ Failed to fetch history: {e}")
            
        time.sleep(0.5) # Rate limit protection

    print(f"\n🎉 Backfill Complete! Total new signals: {total_signals}")

if __name__ == "__main__":
    backfill_whale_trades()
