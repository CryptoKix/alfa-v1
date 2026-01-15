#!/usr/bin/env python3
"""Trade execution service via Jupiter Aggregator and Token Transfers."""
import base64
import requests
import time
from flask import current_app

from solders.transaction import VersionedTransaction, Transaction
from solders.message import to_bytes_versioned, Message, MessageV0
from solana.rpc.types import TxOpts
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from spl.token.instructions import transfer_checked, TransferCheckedParams, get_associated_token_address, create_associated_token_account

from config import KEYPAIR, WALLET_ADDRESS, JUPITER_API_KEY, JUPITER_QUOTE_API, JUPITER_SWAP_API, JUPITER_LIMIT_ORDER_API
from extensions import db, solana_client, socketio, price_cache, price_cache_lock
from services.tokens import get_known_tokens, get_token_symbol
from services.portfolio import broadcast_balance
from services.notifications import notify_trade

def create_limit_order(input_mint, output_mint, amount, price, priority_fee=0.001):
    """Create a limit order via Jupiter Limit Order V2."""
    if not KEYPAIR:
        raise Exception("No private key loaded")

    known = get_known_tokens()
    input_token = known.get(input_mint, {"decimals": 9})
    output_token = known.get(output_mint, {"decimals": 9})
    
    amount_raw = int(amount * (10 ** input_token.get("decimals", 9)))
    # price is InputUnits / OutputUnits
    # takingAmount = amount_in / price
    taking_amount = amount / price
    taking_amount_raw = int(taking_amount * (10 ** output_token.get("decimals", 9)))

    if amount_raw <= 0 or taking_amount_raw <= 0:
        raise Exception("Invalid amount or price")

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}
    
    # Create order transaction
    url = f"{JUPITER_LIMIT_ORDER_API}/createOrder"
    payload = {
        "maker": WALLET_ADDRESS,
        "inputMint": input_mint,
        "outputMint": output_mint,
        "makingAmount": str(amount_raw),
        "takingAmount": str(taking_amount_raw),
        "computeUnitPriceMicroLamports": int(priority_fee * 10**15 / 1400000)
    }
    
    res = requests.post(url, json=payload, headers=headers, timeout=10).json()
    if "error" in res:
        raise Exception(f"Limit Order API: {res['error']}")

    # Sign and send transaction
    try:
        txn = VersionedTransaction.from_bytes(base64.b64decode(res['transaction']))
        signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
        signed_txn = VersionedTransaction.populate(txn.message, [signature])
        
        send_res = solana_client.send_raw_transaction(
            bytes(signed_txn),
            opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
        )
        sig = str(send_res.value)
    except Exception as e:
        raise e

    return {
        "success": True,
        "signature": sig,
        "orderAddress": res.get('orderPubKey')
    }

def cancel_limit_order(order_address):
    """Cancel an open limit order via Jupiter."""
    if not KEYPAIR:
        raise Exception("No private key loaded")

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}
    
    url = f"{JUPITER_LIMIT_ORDER_API}/cancelOrders"
    payload = {
        "maker": WALLET_ADDRESS,
        "orders": [order_address]
    }
    
    res = requests.post(url, json=payload, headers=headers, timeout=10).json()
    if "error" in res:
        raise Exception(f"Cancel Order API: {res['error']}")

    # Sign and send transaction
    try:
        txn = VersionedTransaction.from_bytes(base64.b64decode(res['transaction']))
        signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
        signed_txn = VersionedTransaction.populate(txn.message, [signature])
        
        send_res = solana_client.send_raw_transaction(
            bytes(signed_txn),
            opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
        )
        sig = str(send_res.value)
    except Exception as e:
        raise e

    return {
        "success": True,
        "signature": sig
    }

def get_open_limit_orders():
    """Fetch all open limit orders for the wallet."""
    url = f"{JUPITER_LIMIT_ORDER_API}/openOrders?wallet={WALLET_ADDRESS}"
    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}
    
    try:
        res = requests.get(url, headers=headers, timeout=10).json()
        return res
    except:
        return []

def execute_transfer(recipient_address, amount, mint="So11111111111111111111111111111111111111112"):
    """Execute a SOL or Token transfer to an external wallet."""
    if not KEYPAIR:
        raise Exception("No private key loaded")

    try:
        recipient = Pubkey.from_string(recipient_address)
    except:
        raise Exception("Invalid recipient address")

    sender = Pubkey.from_string(WALLET_ADDRESS)
    known = get_known_tokens()
    token_info = known.get(mint, {"decimals": 9, "symbol": "???"})
    decimals = token_info.get("decimals", 9)
    symbol = token_info.get("symbol", "???")
    
    amount_raw = int(amount * (10 ** decimals))
    if amount_raw <= 0:
        raise Exception("Invalid amount")

    recent_blockhash = solana_client.get_latest_blockhash().value.blockhash
    instructions = []

    if mint == "So11111111111111111111111111111111111111112":
        # Native SOL Transfer
        ix = transfer(
            TransferParams(
                from_pubkey=sender,
                to_pubkey=recipient,
                lamports=amount_raw
            )
        )
        instructions.append(ix)
    else:
        # SPL Token Transfer
        mint_pubkey = Pubkey.from_string(mint)
        sender_ata = get_associated_token_address(sender, mint_pubkey)
        recipient_ata = get_associated_token_address(recipient, mint_pubkey)

        # Check if recipient ATA exists
        recipient_ata_info = solana_client.get_account_info(recipient_ata)
        if recipient_ata_info.value is None:
            instructions.append(
                create_associated_token_account(
                    payer=sender,
                    owner=recipient,
                    mint=mint_pubkey
                )
            )

        instructions.append(
            transfer_checked(
                TransferCheckedParams(
                    program_id=Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
                    source=sender_ata,
                    mint=mint_pubkey,
                    dest=recipient_ata,
                    owner=sender,
                    amount=amount_raw,
                    decimals=decimals,
                    signers=[]
                )
            )
        )

    # Build and sign transaction using MessageV0
    msg = MessageV0.try_compile(
        payer=sender,
        instructions=instructions,
        address_lookup_table_accounts=[],
        recent_blockhash=recent_blockhash
    )
    txn = VersionedTransaction(msg, [KEYPAIR])

    sig_res = solana_client.send_raw_transaction(
        bytes(txn),
        opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
    )
    sig = str(sig_res.value)

    # Log to DB
    db.log_trade({
        "wallet_address": WALLET_ADDRESS,
        "source": "Transfer",
        "input": symbol,
        "output": symbol,
        "input_mint": mint,
        "output_mint": mint,
        "amount_in": amount,
        "amount_out": amount,
        "signature": sig,
        "status": "success"
    })

    socketio.emit('history_update', {'history': db.get_history(50, wallet_address=WALLET_ADDRESS)}, namespace='/history')
    broadcast_balance()

    return sig

def execute_trade_logic(input_mint, output_mint, amount, source="Manual", slippage_bps=50, priority_fee=0.001):
    """Execute a swap trade via Jupiter Aggregator."""
    if not KEYPAIR:
        raise Exception("No private key loaded")

    known = get_known_tokens()
    input_token = known.get(input_mint, {"decimals": 9})
    output_token = known.get(output_mint, {"decimals": 9})
    amount_lamports = int(amount * (10 ** input_token.get("decimals", 9)))

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}

    # Get quote
    quote_url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount_lamports}&slippageBps={slippage_bps}"
    quote = requests.get(quote_url, headers=headers, timeout=10).json()
    if "error" in quote:
        raise Exception(f"Quote: {quote['error']}")

    # Generate swap transaction
    compute_unit_price = int(priority_fee * 10**15 / 1400000)
    swap_payload = {
        "quoteResponse": quote,
        "userPublicKey": WALLET_ADDRESS,
        "wrapAndUnwrapSol": True,
        "computeUnitPriceMicroLamports": compute_unit_price
    }
    swap_res = requests.post(JUPITER_SWAP_API, json=swap_payload, headers=headers, timeout=10).json()
    if "error" in swap_res:
        raise Exception(f"Swap: {swap_res['error']}")

    # Sign and send transaction
    try:
        txn = VersionedTransaction.from_bytes(base64.b64decode(swap_res['swapTransaction']))
        signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
        signed_txn = VersionedTransaction.populate(txn.message, [signature])
        
        send_res = solana_client.send_raw_transaction(
            bytes(signed_txn),
            opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
        )
        sig = str(send_res.value)
    except Exception as e:
        raise e

    # Parse output amount and fees
    amount_out = int(quote.get('outAmount', 0)) / (10 ** output_token.get('decimals', 9))
    swap_fee = 0
    swap_fee_currency = ""
    try:
        for plan in quote.get('routePlan', []):
            info = plan.get('swapInfo', {})
            f_amount = info.get('feeAmount')
            f_mint = info.get('feeMint')
            if f_amount and int(f_amount) > 0:
                decimals = known.get(f_mint, {"decimals": 9}).get("decimals", 9)
                swap_fee += int(f_amount) / (10 ** decimals)
                if not swap_fee_currency:
                    swap_fee_currency = get_token_symbol(f_mint)
    except: pass

    # Calculate USD Value
    usd_value = 0
    with price_cache_lock:
        if input_mint in price_cache:
            usd_value = amount * price_cache[input_mint][0]
        elif output_mint in price_cache:
            usd_value = amount_out * price_cache[output_mint][0]

    # Log to database
    db.log_trade({
        "wallet_address": WALLET_ADDRESS,
        "source": source,
        "input": get_token_symbol(input_mint),
        "output": get_token_symbol(output_mint),
        "input_mint": input_mint,
        "output_mint": output_mint,
        "amount_in": amount,
        "amount_out": amount_out,
        "usd_value": usd_value,
        "slippage_bps": slippage_bps,
        "priority_fee": priority_fee,
        "swap_fee": swap_fee,
        "swap_fee_currency": swap_fee_currency,
        "signature": sig,
        "status": "success"
    })

    # Broadcast updates
    socketio.emit('history_update', {'history': db.get_history(50, wallet_address=WALLET_ADDRESS)}, namespace='/history')
    broadcast_balance()

    return {
        "signature": sig,
        "amount_out": amount_out,
        "usd_value": usd_value
    }
