#!/usr/bin/env python3
"""Trade execution service via Jupiter Aggregator."""
import base64
import requests
from flask import current_app

from solders.transaction import VersionedTransaction
from solders.message import to_bytes_versioned
from solana.rpc.types import TxOpts

from config import KEYPAIR, WALLET_ADDRESS, JUPITER_API_KEY, JUPITER_QUOTE_API, JUPITER_SWAP_API
from extensions import db, solana_client, socketio, price_cache, price_cache_lock
from services.tokens import get_known_tokens, get_token_symbol
from services.portfolio import broadcast_balance

from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from spl.token.instructions import get_associated_token_address, create_associated_token_account, transfer_checked
from spl.token.constants import TOKEN_PROGRAM_ID

def execute_transfer(recipient_address, amount, mint="So11111111111111111111111111111111111111112"):
    """Execute a SOL or Token transfer."""
    if not KEYPAIR:
        raise Exception("No private key loaded")

    try:
        recipient = Pubkey.from_string(recipient_address)
    except:
        raise Exception("Invalid recipient address")

    instructions = []
    token_symbol = "SOL"
    decimals = 9

    # SOL Transfer
    if mint == "So11111111111111111111111111111111111111112":
        lamports = int(amount * 1_000_000_000)
        
        # Check balance (simple check)
        balance = solana_client.get_balance(KEYPAIR.pubkey()).value
        if balance < lamports + 5000: # 5000 lamports for fee buffer
            raise Exception("Insufficient SOL balance")

        instructions.append(transfer(
            TransferParams(
                from_pubkey=KEYPAIR.pubkey(),
                to_pubkey=recipient,
                lamports=lamports
            )
        ))

    # SPL Token Transfer
    else:
        mint_pubkey = Pubkey.from_string(mint)
        known = get_known_tokens()
        token_info = known.get(mint, {})
        decimals = token_info.get('decimals', 0)
        token_symbol = token_info.get('symbol', 'Unknown')

        if decimals == 0:
            decimals = 6 

        amount_tokens = int(amount * (10 ** decimals))

        sender_ata = get_associated_token_address(KEYPAIR.pubkey(), mint_pubkey)
        recipient_ata = get_associated_token_address(recipient, mint_pubkey)

        # Check if sender has enough balance
        try:
            sender_balance_info = solana_client.get_token_account_balance(sender_ata).value
            if int(sender_balance_info.amount) < amount_tokens:
                raise Exception(f"Insufficient {token_symbol} balance")
        except:
             raise Exception(f"Failed to fetch balance for {token_symbol}")

        # Check if recipient ATA exists, create if not
        resp = solana_client.get_account_info(recipient_ata)
        if not resp.value:
             instructions.append(
                 create_associated_token_account(
                     payer=KEYPAIR.pubkey(),
                     owner=recipient,
                     mint=mint_pubkey
                 )
             )
        
        instructions.append(
            transfer_checked(
                source=sender_ata,
                mint=mint_pubkey,
                dest=recipient_ata,
                owner=KEYPAIR.pubkey(),
                amount=amount_tokens,
                decimals=decimals
            )
        )

    # Build and Send Transaction
    recent_blockhash = solana_client.get_latest_blockhash().value.blockhash
    msg = __import__('solders.message').message.Message.new_with_blockhash(
        instructions,
        KEYPAIR.pubkey(),
        recent_blockhash
    )
    txn = VersionedTransaction(msg, [KEYPAIR.sign_message(to_bytes_versioned(msg))])
    
    sig = str(solana_client.send_raw_transaction(
        bytes(txn),
        opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
    ).value)
    
    # Calculate USD Value
    usd_value = 0
    with price_cache_lock:
        if mint in price_cache:
            usd_value = amount * price_cache[mint][0]

    # Log transfer
    db.log_trade({
        "wallet_address": WALLET_ADDRESS,
        "source": "Transfer",
        "input": token_symbol,
        "output": token_symbol,
        "input_mint": mint,
        "output_mint": mint,
        "amount_in": amount,
        "amount_out": amount,
        "usd_value": usd_value,
        "slippage_bps": 0,
        "priority_fee": 0,
        "swap_fee": 0,
        "swap_fee_currency": token_symbol,
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
    amount_out = 0
    swap_fee = 0
    swap_fee_currency = ""
    try:
        amount_out = int(quote.get('outAmount', 0)) / (10 ** output_token.get('decimals', 9))
        for plan in quote.get('routePlan', []):
            info = plan.get('swapInfo', {})
            f_amount = info.get('feeAmount')
            f_mint = info.get('feeMint')
            if f_amount and int(f_amount) > 0:
                decimals = known.get(f_mint, {"decimals": 9}).get("decimals", 9)
                swap_fee += int(f_amount) / (10 ** decimals)
                if not swap_fee_currency:
                    swap_fee_currency = get_token_symbol(f_mint)
    except Exception as e:
        current_app.logger.error(f"Fee parsing error: {e}")

    # Calculate USD Value for PnL tracking
    usd_value = 0
    with price_cache_lock:
        if input_mint in price_cache:
            usd_value = amount * price_cache[input_mint][0]
        elif output_mint in price_cache:
            usd_value = amount_out * price_cache[output_mint][0]

    # Log trade to database
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
