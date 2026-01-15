import os
import sys
import time
import sqlite3
import json
from solana.rpc.api import Client
from solders.pubkey import Pubkey

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import HELIUS_API_KEY, SOLANA_RPC

# Constants
JUPITER_PROGRAM_ID = Pubkey.from_string("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")
MIN_SOL_THRESHOLD = 5.0  # Only track users moving > 5 SOL
TARGET_COUNT = 50

def get_db_connection():
    return sqlite3.connect('backend/tactix_data.db')

def detect_whales():
    print(f"🐳 Starting Whale Detection (Threshold: {MIN_SOL_THRESHOLD} SOL)...")
    client = Client(SOLANA_RPC)
    
    # 1. Fetch recent signatures
    print("📡 Fetching recent Jupiter transactions...")
    try:
        signatures_resp = client.get_signatures_for_address(
            JUPITER_PROGRAM_ID, 
            limit=500 # Fetch enough to find whales
        )
        signatures = [s.signature for s in signatures_resp.value]
        print(f"✅ Found {len(signatures)} recent transactions.")
    except Exception as e:
        print(f"❌ Failed to fetch signatures: {e}")
        return

    # 2. Process in batches to respect rate limits
    detected_whales = {} # {address: max_volume_seen}
    batch_size = 10 # Helius allows more, but let's be safe
    
    # Connect DB
    conn = get_db_connection()
    cursor = conn.cursor()
    
    processed = 0
    whales_found = 0
    
    for i, sig in enumerate(signatures):
        if whales_found >= TARGET_COUNT:
            break
            
        print(f"🔍 Analyzing tx {i+1}/{len(signatures)}...", end='\r')
        
        try:
            # Fetch single transaction
            tx = client.get_transaction(sig, encoding="jsonParsed", max_supported_transaction_version=0)
            
            if not tx.value: continue
            
            # Check for errors
            if tx.value.transaction.meta.err: continue
            
            meta = tx.value.transaction.meta
            msg = tx.value.transaction.transaction.message
            accounts = msg.account_keys
            
            # Identify Signer (Fee Payer is usually index 0)
            signer = str(accounts[0].pubkey)
            
            # Heuristic: Check SOL balance (pre_balances index 0 is fee payer)
            try:
                pre_sol = meta.pre_balances[0] / 1e9
                if pre_sol > MIN_SOL_THRESHOLD: # Holds > 5 SOL (lowered threshold to find more)
                    if signer not in detected_whales:
                        detected_whales[signer] = pre_sol
                        whales_found += 1
                        
                        alias = f"Detected Whale {whales_found}"
                        print(f"\n   🐋 FOUND: {alias} ({signer}) - Bal: {pre_sol:.2f} SOL")
                        
                        # Add to DB
                        cursor.execute(
                            "INSERT OR IGNORE INTO targets (address, alias, status, config_json, performance_json, tags) VALUES (?, ?, ?, ?, ?, ?)",
                            (signer, alias, 'active', 
                             json.dumps({"scale_factor": 0.05, "max_per_trade": 0.5, "auto_execute": False}),
                             json.dumps({"total_profit_sol": 0, "win_rate": 0}),
                             json.dumps(["detected", "whale", f"bal:{int(pre_sol)}"])
                            )
                        )
                        conn.commit()
            except Exception as e:
                pass
                
        except Exception as e:
            # print(f"   ⚠️ Tx error: {e}")
            pass
            
        time.sleep(0.1) # Be nice to RPC

    conn.commit()
    conn.close()
    print(f"✅ Whale Detection Complete. Added {whales_found} new targets.")

if __name__ == "__main__":
    detect_whales()
