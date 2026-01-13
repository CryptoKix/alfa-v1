import requests
import json
import base64
from typing import List
from solders.pubkey import Pubkey
from solders.system_program import transfer, TransferParams
from solders.transaction import VersionedTransaction
from solders.message import MessageV0
from config import KEYPAIR, WALLET_ADDRESS

# Jito Block Engine Endpoints
JITO_ENDPOINTS = [
    "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
    "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
]

# Jito Tip Accounts
JITO_TIP_ACCOUNTS = [
    "96gWu9sjJJcc9wGvBk9SshLeWvAeCQGZvS9dg9yrGU4G",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyMvGrnC7AByELoUzrFP4Wniw1Y8JGuEGUZBPTio",
    "ADaUMid9yfUytqMBqkh6AqnvT4vBNpZpS7UngeatWhpY",
    "DfXygSm4jCyvG8UMEXrS8qXobJuUn2js5qR2pbtqyAg8",
    "ADuUkR4vqMvS2ri6bcSCCKcYsyR8niSpsUSSM91YQYzZ",
    "DttWaMuVvTiduGmq2hpWyDHJDsSNTwd2NoTuMaw79asz",
    "3AVi9Tg9Uo68tJfuAWMwoIrKVw5S9uBjsJAnatS8ipAn",
]

def get_random_tip_account():
    import random
    return JITO_TIP_ACCOUNTS[random.randint(0, len(JITO_TIP_ACCOUNTS) - 1)]

def send_jito_bundle(transactions_b64: List[str]):
    """Send a list of base64 encoded transactions as a Jito bundle."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sendBundle",
        "params": [transactions_b64]
    }
    
    results = []
    for endpoint in JITO_ENDPOINTS:
        try:
            response = requests.post(endpoint, json=payload, timeout=5)
            results.append({"endpoint": endpoint, "status": response.status_code, "data": response.json()})
        except Exception as e:
            results.append({"endpoint": endpoint, "error": str(e)})
            
    return results

def build_tip_transaction(tip_amount_lamports: int, recent_blockhash):
    """Build a simple transaction that sends a tip to Jito."""
    if not KEYPAIR:
        return None
        
    tip_account = Pubkey.from_string(get_random_tip_account())
    sender = KEYPAIR.pubkey()
    
    # Create transfer instruction
    ix = transfer(TransferParams(
        from_pubkey=sender,
        to_pubkey=tip_account,
        lamports=tip_amount_lamports
    ))
    
    # Build message (Legacy for simplicity in tip, or V0)
    # Using solders to build a simple transaction
    from solders.message import Message
    message = Message([ix], sender)
    
    from solana.transaction import Transaction
    tx = Transaction()
    tx.add(ix)
    tx.recent_blockhash = recent_blockhash
    tx.sign(KEYPAIR)
    
    return base64.b64encode(bytes(tx)).decode("utf-8")
