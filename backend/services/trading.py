#!/usr/bin/env python3
"""Trade execution service via Jupiter Aggregator and Token Transfers."""
import base64
import logging
import requests
import time

from solders.transaction import VersionedTransaction, Transaction
from solders.message import to_bytes_versioned, Message, MessageV0
from solana.rpc.types import TxOpts
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from spl.token.instructions import transfer_checked, TransferCheckedParams, get_associated_token_address, create_associated_token_account

from config import KEYPAIR, WALLET_ADDRESS, JUPITER_API_KEY, JUPITER_QUOTE_API, JUPITER_SWAP_API, JUPITER_LIMIT_ORDER_API
import sio_bridge
from extensions import db, solana_client, price_cache, price_cache_lock
from services.tokens import get_known_tokens, get_token_symbol
from services.portfolio import broadcast_balance
from services.notifications import notify_trade
from services.jito import send_jito_bundle, build_tip_transaction

logger = logging.getLogger("trading")
logger.setLevel(logging.INFO)

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

    # Discord Notification
    try:
        from services.notifications import send_discord_notification
        input_sym = get_token_symbol(input_mint)
        output_sym = get_token_symbol(output_mint)
        title = f"📝 LIMIT ORDER PLACED: {input_sym}/{output_sym}"
        message = f"On-chain limit order created via **Jupiter**."
        fields = [
            {"name": "Making", "value": f"{amount:.4f} {input_sym}", "inline": True},
            {"name": "Price", "value": f"${price:.6f}", "inline": True},
            {"name": "Taking (Est)", "value": f"{(amount/price):.4f} {output_sym}", "inline": True}
        ]
        send_discord_notification(title, message, color=0x9945FF, fields=fields)
    except Exception as e:
        print(f"Discord Limit Order Notify Error: {e}")

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

    sio_bridge.emit('history_update', {'history': db.get_history(50, wallet_address=WALLET_ADDRESS)}, namespace='/history')
    broadcast_balance()

    return sig

def execute_trade_logic(input_mint, output_mint, amount, source="Manual", slippage_bps=50, priority_fee=0.001, skip_guard=False):
    """
    Execute a swap trade via Jupiter Aggregator.

    SECURITY: Trade guard validation is applied by default.
    Set skip_guard=True only for internal system trades that have already been validated.
    """
    if not KEYPAIR:
        raise Exception("No private key loaded")

    known = get_known_tokens()
    input_token = known.get(input_mint, {"decimals": 9})
    output_token = known.get(output_mint, {"decimals": 9})
    amount_lamports = int(amount * (10 ** input_token.get("decimals", 9)))

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}

    # Get quote FIRST for USD value estimation
    quote_url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount_lamports}&slippageBps={slippage_bps}"
    quote = requests.get(quote_url, headers=headers, timeout=10).json()
    if "error" in quote:
        raise Exception(f"Quote: {quote['error']}")

    # SECURITY: Trade Guard validation
    if not skip_guard:
        from services.trade_guard import trade_guard, TradeGuardError

        # Calculate USD value for guard
        estimated_usd = 0
        with price_cache_lock:
            if input_mint in price_cache:
                estimated_usd = amount * price_cache[input_mint][0]
            elif output_mint in price_cache:
                amount_out_est = int(quote.get('outAmount', 0)) / (10 ** output_token.get('decimals', 9))
                estimated_usd = amount_out_est * price_cache[output_mint][0]

        # Validate trade (raises TradeGuardError if invalid)
        # Bot/automated sources don't require confirmation
        require_confirm = source == "Manual"
        is_valid, confirm_id = trade_guard.validate_trade(
            input_mint=input_mint,
            output_mint=output_mint,
            amount=amount,
            usd_value=estimated_usd,
            slippage_bps=slippage_bps,
            source=source,
            require_confirmation=require_confirm
        )

        # If confirmation required, return early with confirmation ID
        if confirm_id:
            return {
                "requires_confirmation": True,
                "confirmation_id": confirm_id,
                "usd_value": estimated_usd,
                "message": f"Trade of ${estimated_usd:.2f} requires confirmation"
            }

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

    # SECURITY: Record trade with trade guard for daily volume tracking
    if not skip_guard:
        try:
            from services.trade_guard import trade_guard
            trade_guard.record_trade(input_mint, output_mint, usd_value)
        except Exception as e:
            print(f"Trade guard record error (non-fatal): {e}")

    # Broadcast updates
    sio_bridge.emit('history_update', {'history': db.get_history(50, wallet_address=WALLET_ADDRESS)}, namespace='/history')
    broadcast_balance()

    # Discord Notification
    try:
        input_sym = get_token_symbol(input_mint)
        output_sym = get_token_symbol(output_mint)
        # Calculate price per unit of output token
        price_per_unit = usd_value / amount_out if amount_out > 0 else 0
        
        notify_trade(
            tx_type="BUY" if source.lower() != "grid sell" else "SELL",
            input_sym=input_sym,
            input_amt=amount,
            output_sym=output_sym,
            output_amt=amount_out,
            price=price_per_unit,
            source=source,
            signature=sig
        )
    except Exception as e:
        print(f"Discord Trade Notify Error: {e}")

    return {
        "signature": sig,
        "amount_out": amount_out,
        "usd_value": usd_value
    }


def execute_trade_with_jito(input_mint, output_mint, amount, source="Manual", slippage_bps=50, tip_lamports=10000):
    """Execute a swap trade via Jupiter with Jito bundle submission for MEV protection (Issue 7)."""
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

    # Generate swap transaction WITHOUT priority fee (Jito tip handles MEV protection)
    swap_payload = {
        "quoteResponse": quote,
        "userPublicKey": WALLET_ADDRESS,
        "wrapAndUnwrapSol": True,
        "computeUnitPriceMicroLamports": 0  # No priority fee, using Jito tip instead
    }
    swap_res = requests.post(JUPITER_SWAP_API, json=swap_payload, headers=headers, timeout=10).json()
    if "error" in swap_res:
        raise Exception(f"Swap: {swap_res['error']}")

    # Sign swap transaction
    try:
        txn = VersionedTransaction.from_bytes(base64.b64decode(swap_res['swapTransaction']))
        signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
        signed_txn = VersionedTransaction.populate(txn.message, [signature])
        swap_tx_b64 = base64.b64encode(bytes(signed_txn)).decode("utf-8")
    except Exception as e:
        raise Exception(f"Swap tx signing failed: {e}")

    # Build Jito tip transaction
    tip_tx_b64 = None
    try:
        recent_blockhash = solana_client.get_latest_blockhash().value.blockhash
        tip_tx_b64 = build_tip_transaction(tip_lamports, recent_blockhash)
    except Exception as e:
        logger.warning(f"Tip tx build failed ({e}), proceeding without Jito bundle")

    # Submit bundle to Jito (or skip if no tip tx)
    jito_success = False
    jito_sig = None
    jito_results = []

    if tip_tx_b64:
        bundle = [swap_tx_b64, tip_tx_b64]
        jito_results = send_jito_bundle(bundle)

        for result in jito_results:
            if "data" in result and "result" in result.get("data", {}):
                jito_success = True
                jito_sig = result["data"]["result"]
                break

    if jito_success:
        sig = jito_sig if jito_sig else str(signature)
        print(f"✅ Jito bundle submitted successfully: {sig}")
    else:
        # Fallback to regular RPC submission
        if tip_tx_b64:
            print(f"⚠️ Jito bundle failed, falling back to regular RPC")
        else:
            print(f"⚠️ No Jito tip tx, submitting via regular RPC")
        try:
            send_res = solana_client.send_raw_transaction(
                bytes(signed_txn),
                opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
            )
            sig = str(send_res.value)
        except Exception as e:
            raise Exception(f"Both Jito and regular RPC failed: {e}")

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
    except:
        pass

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
        "source": f"{source} (Jito)" if jito_success else source,
        "input": get_token_symbol(input_mint),
        "output": get_token_symbol(output_mint),
        "input_mint": input_mint,
        "output_mint": output_mint,
        "amount_in": amount,
        "amount_out": amount_out,
        "usd_value": usd_value,
        "slippage_bps": slippage_bps,
        "priority_fee": tip_lamports / 1e9,  # Convert lamports to SOL
        "swap_fee": swap_fee,
        "swap_fee_currency": swap_fee_currency,
        "signature": sig,
        "status": "success"
    })

    # Broadcast updates
    sio_bridge.emit('history_update', {'history': db.get_history(50, wallet_address=WALLET_ADDRESS)}, namespace='/history')
    broadcast_balance()

    # Discord Notification
    try:
        input_sym = get_token_symbol(input_mint)
        output_sym = get_token_symbol(output_mint)
        price_per_unit = usd_value / amount_out if amount_out > 0 else 0

        notify_trade(
            tx_type="BUY" if "sell" not in source.lower() else "SELL",
            input_sym=input_sym,
            input_amt=amount,
            output_sym=output_sym,
            output_amt=amount_out,
            price=price_per_unit,
            source=f"{source} (Jito)" if jito_success else source,
            signature=sig
        )
    except Exception as e:
        print(f"Discord Trade Notify Error: {e}")

    return {
        "signature": sig,
        "amount_out": amount_out,
        "usd_value": usd_value,
        "jito_success": jito_success
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Sniper Fast-Path Execution
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def execute_snipe(token_data: dict, buy_amount_sol: float, slippage_bps: int = 500, tip_lamports: int = 0):
    """
    Execute a fast-path snipe trade with direct instruction building + Jito MEV protection.

    Routing priority:
    1. Pump.fun → Direct bonding curve buy (~50ms)
    2. Raydium V4 → Direct AMM swap (~100ms first, ~1ms cached)
    3. Fallback → Jupiter Quote + Swap API (~600ms)

    All paths use Jito bundle submission for MEV protection.

    Args:
        token_data: Token info dict from sniper detection containing:
            - mint: Token mint address
            - dex_id: "Pump.fun", "Raydium Auth", "Raydium", etc.
            - pool_address: (optional) Raydium V4 pool address
            - symbol: Token symbol
        buy_amount_sol: SOL amount to spend
        slippage_bps: Slippage tolerance in basis points (default 500 = 5%)
        tip_lamports: Jito tip in lamports. 0 = use dynamic tip floor (recommended).

    Returns:
        dict with: signature, method, elapsed_ms, jito_success, estimated_tokens_out
    """
    if not KEYPAIR:
        raise Exception("No private key loaded")

    # Dynamic Jito tip — if caller didn't specify, use live tip floor
    if tip_lamports <= 0:
        from services.jito import tip_floor_cache
        tip_lamports = tip_floor_cache.get_optimal_tip(percentile="75th")

    # SECURITY: Final safety net — block confirmed rugs and blocklisted tokens
    from services.trade_guard import trade_guard, TradeGuardError, TOKEN_BLOCKLIST
    token_mint_check = token_data.get('mint', '')
    if token_mint_check in TOKEN_BLOCKLIST:
        raise Exception(f"🛡️ Token {token_mint_check[:8]}... is blocklisted — execution blocked")
    if token_data.get('is_rug'):
        trade_guard.add_to_blocklist(token_mint_check)
        raise Exception(f"🛡️ Token {token_mint_check[:8]}... flagged as rug — execution blocked")

    start_time = time.time()
    token_mint = token_data.get('mint')
    dex_id = token_data.get('dex_id', '')
    symbol = token_data.get('symbol', '???')
    pool_address = token_data.get('pool_address')

    sol_lamports = int(buy_amount_sol * 1e9)
    method = "unknown"
    signed_swap_tx_b64 = None
    estimated_tokens_out = 0

    logger.info(f"🎯 SNIPE: {symbol} ({token_mint[:8]}...) via {dex_id} for {buy_amount_sol} SOL")

    # Get fresh blockhash
    recent_blockhash = str(solana_client.get_latest_blockhash().value.blockhash)

    # ── Route 1: Pump.fun Direct ────────────────────────────────────────
    if dex_id == "Pump.fun":
        try:
            from services.pumpfun import pumpfun_buyer

            # Fetch bonding curve state
            state = pumpfun_buyer.fetch_bonding_curve_state(token_mint)
            if state and not state.complete:
                # Compute expected tokens
                estimated_tokens_out = pumpfun_buyer.compute_tokens_out(sol_lamports, state)
                min_tokens = int(estimated_tokens_out * (10000 - slippage_bps) / 10000)

                # Build unsigned transaction
                unsigned_tx_b64 = pumpfun_buyer.build_buy_transaction(
                    token_mint=token_mint,
                    sol_lamports=sol_lamports,
                    min_tokens_out=min_tokens,
                    user_pubkey=WALLET_ADDRESS,
                    blockhash=recent_blockhash,
                    compute_unit_price=50000,
                )

                if unsigned_tx_b64:
                    # Sign the transaction
                    tx_bytes = base64.b64decode(unsigned_tx_b64)
                    txn = VersionedTransaction.from_bytes(tx_bytes)
                    signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
                    signed_txn = VersionedTransaction.populate(txn.message, [signature])
                    signed_swap_tx_b64 = base64.b64encode(bytes(signed_txn)).decode('utf-8')
                    method = "pumpfun_direct"
                    logger.info(f"✅ Pump.fun direct build success: {estimated_tokens_out} tokens expected")
        except Exception as e:
            logger.warning(f"Pump.fun direct failed: {e} → fallback to Jupiter")

    # ── Route 2: Raydium V4 Direct ──────────────────────────────────────
    elif dex_id in ("Raydium Auth", "Raydium") and pool_address:
        try:
            from services.raydium_amm import RaydiumPoolRegistry
            from service_registry import registry

            # Try to get registry instance, fallback to new instance
            raydium_registry = registry.get('raydium_pools')
            if not raydium_registry:
                raydium_registry = RaydiumPoolRegistry()

            # Discover pool on-the-fly
            pool_state = raydium_registry.discover_pool_by_address(pool_address)
            if pool_state:
                # Determine swap direction (SOL → token)
                wsol = "So11111111111111111111111111111111111111112"
                if pool_state.coin_mint == token_mint:
                    # pc (SOL/USDC) → coin (token)
                    coin_to_pc = False
                else:
                    # coin (SOL) → pc (token)
                    coin_to_pc = True

                # Compute expected output
                estimated_tokens_out = raydium_registry.compute_amount_out(
                    pool_address, sol_lamports, coin_to_pc
                )
                min_out = int(estimated_tokens_out * (10000 - slippage_bps) / 10000)

                # Build unsigned transaction
                unsigned_tx_b64 = raydium_registry.build_swap_transaction(
                    pool_address=pool_address,
                    amount_in=sol_lamports,
                    min_amount_out=min_out,
                    coin_to_pc=coin_to_pc,
                    user_pubkey=WALLET_ADDRESS,
                    blockhash=recent_blockhash,
                )

                if unsigned_tx_b64:
                    # Sign the transaction
                    tx_bytes = base64.b64decode(unsigned_tx_b64)
                    txn = VersionedTransaction.from_bytes(tx_bytes)
                    signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
                    signed_txn = VersionedTransaction.populate(txn.message, [signature])
                    signed_swap_tx_b64 = base64.b64encode(bytes(signed_txn)).decode('utf-8')
                    method = "raydium_direct"
                    logger.info(f"✅ Raydium direct build success: {estimated_tokens_out} tokens expected")
        except Exception as e:
            logger.warning(f"Raydium direct failed: {e} → fallback to Jupiter")

    # ── Route 3: Jupiter Fallback ───────────────────────────────────────
    if not signed_swap_tx_b64:
        try:
            wsol = "So11111111111111111111111111111111111111112"
            headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}

            # Get quote
            quote_url = f"{JUPITER_QUOTE_API}?inputMint={wsol}&outputMint={token_mint}&amount={sol_lamports}&slippageBps={slippage_bps}"
            quote = requests.get(quote_url, headers=headers, timeout=10).json()
            if "error" in quote:
                raise Exception(f"Jupiter Quote: {quote['error']}")

            estimated_tokens_out = int(quote.get('outAmount', 0))

            # Get swap transaction (no priority fee - Jito tip handles MEV)
            swap_payload = {
                "quoteResponse": quote,
                "userPublicKey": WALLET_ADDRESS,
                "wrapAndUnwrapSol": True,
                "computeUnitPriceMicroLamports": 0,
            }
            swap_res = requests.post(JUPITER_SWAP_API, json=swap_payload, headers=headers, timeout=10).json()
            if "error" in swap_res:
                raise Exception(f"Jupiter Swap: {swap_res['error']}")

            # Sign the transaction
            txn = VersionedTransaction.from_bytes(base64.b64decode(swap_res['swapTransaction']))
            signature = KEYPAIR.sign_message(to_bytes_versioned(txn.message))
            signed_txn = VersionedTransaction.populate(txn.message, [signature])
            signed_swap_tx_b64 = base64.b64encode(bytes(signed_txn)).decode('utf-8')
            method = "jupiter_fallback"
            logger.info(f"✅ Jupiter fallback success: {estimated_tokens_out} tokens expected")
        except Exception as e:
            raise Exception(f"All swap routes failed. Jupiter error: {e}")

    # ── Build Jito Tip Transaction ──────────────────────────────────────
    tip_tx_b64 = None
    try:
        tip_tx_b64 = build_tip_transaction(tip_lamports, recent_blockhash)
    except Exception as e:
        logger.warning(f"Tip tx build failed ({e}), proceeding without Jito bundle")
    if not tip_tx_b64:
        logger.warning("No Jito tip transaction, will submit via RPC fallback")

    # ── Submit via Jito or Fallback RPC ─────────────────────────────────
    jito_success = False
    sig = None

    if tip_tx_b64:
        bundle = [signed_swap_tx_b64, tip_tx_b64]
        jito_results = send_jito_bundle(bundle)

        for result in jito_results:
            if result.get("status") == 200:
                jito_data = result.get("data", {})
                # Jito returns 200 even for errors — check for "result" key
                if "result" in jito_data:
                    jito_success = True
                    logger.info(f"✅ Jito bundle accepted: {jito_data['result']}")
                    break
                elif "error" in jito_data:
                    logger.warning(f"Jito 200 but error: {jito_data['error']}")
                else:
                    logger.warning(f"Jito unexpected response: {jito_data}")

    if not jito_success:
        # Fallback to standard RPC submission
        logger.warning(f"Jito bundle failed or unavailable, falling back to RPC. Results: {jito_results}")
        try:
            tx_bytes = base64.b64decode(signed_swap_tx_b64)
            send_res = solana_client.send_raw_transaction(
                tx_bytes,
                opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
            )
            sig = str(send_res.value)
        except Exception as e:
            raise Exception(f"Transaction submission failed: {e}")
    else:
        # For Jito bundles, we need to extract signature from the signed transaction
        tx_bytes = base64.b64decode(signed_swap_tx_b64)
        txn = VersionedTransaction.from_bytes(tx_bytes)
        sig = str(txn.signatures[0])

    elapsed_ms = int((time.time() - start_time) * 1000)

    # ── Confirm Transaction On-Chain ─────────────────────────────────────
    confirmed = False
    tx_err = None
    if sig:
        from solders.signature import Signature as SoldersSig
        for attempt in range(8):  # ~4 seconds max
            time.sleep(0.5)
            try:
                status_res = solana_client.get_signature_statuses([SoldersSig.from_string(sig)])
                statuses = status_res.value
                if statuses and statuses[0] is not None:
                    if statuses[0].err is None:
                        confirmed = True
                        logger.info(f"✅ Tx confirmed on-chain: {sig[:16]}... (attempt {attempt+1})")
                    else:
                        tx_err = str(statuses[0].err)
                        logger.error(f"❌ Tx FAILED on-chain: {sig[:16]}... err={tx_err}")
                    break
            except Exception as e:
                logger.debug(f"Confirmation poll {attempt+1}: {e}")
        else:
            logger.warning(f"⚠️ Tx not confirmed after 4s: {sig[:16]}... (will log as unconfirmed)")

    # ── Log Trade & Broadcast Updates ───────────────────────────────────
    # Get token decimals for proper conversion
    known = get_known_tokens()
    output_token = known.get(token_mint, {"decimals": 9})
    amount_out = estimated_tokens_out / (10 ** output_token.get('decimals', 9)) if confirmed else 0

    # Calculate USD value
    usd_value = 0
    with price_cache_lock:
        wsol = "So11111111111111111111111111111111111111112"
        if wsol in price_cache:
            usd_value = buy_amount_sol * price_cache[wsol][0]

    trade_status = "success" if confirmed else ("failed" if tx_err else "unconfirmed")

    # Log to database
    db.log_trade({
        "wallet_address": WALLET_ADDRESS,
        "source": f"Snipe ({method})",
        "input": "SOL",
        "output": symbol,
        "input_mint": "So11111111111111111111111111111111111111112",
        "output_mint": token_mint,
        "amount_in": buy_amount_sol if confirmed else 0,
        "amount_out": amount_out,
        "usd_value": usd_value if confirmed else 0,
        "slippage_bps": slippage_bps,
        "priority_fee": tip_lamports / 1e9,
        "signature": sig,
        "status": trade_status,
        "error": tx_err,
    })

    # Broadcast updates
    sio_bridge.emit('history_update', {'history': db.get_history(50, wallet_address=WALLET_ADDRESS)}, namespace='/history')
    broadcast_balance()

    # Emit snipe result to frontend
    sio_bridge.emit('snipe_result', {
        'signature': sig,
        'symbol': symbol,
        'mint': token_mint,
        'method': method,
        'elapsed_ms': elapsed_ms,
        'jito_success': jito_success,
        'tokens_out': amount_out,
        'sol_in': buy_amount_sol,
        'tip_lamports': tip_lamports,
    }, namespace='/sniper')

    # Discord notification
    try:
        notify_trade(
            tx_type="SNIPE",
            input_sym="SOL",
            input_amt=buy_amount_sol,
            output_sym=symbol,
            output_amt=amount_out,
            price=usd_value / amount_out if amount_out > 0 else 0,
            source=f"Auto-Snipe ({method}, {elapsed_ms}ms, {'Jito' if jito_success else 'RPC'})",
            signature=sig
        )
    except Exception as e:
        logger.warning(f"Discord notification failed: {e}")

    logger.info(f"🎯 SNIPE EXECUTED: {symbol} via {method} in {elapsed_ms}ms (Jito: {jito_success}, tip: {tip_lamports} lamports / {tip_lamports/1e9:.6f} SOL, confirmed: {confirmed})")

    return {
        "signature": sig,
        "method": method,
        "elapsed_ms": elapsed_ms,
        "jito_success": jito_success,
        "estimated_tokens_out": amount_out,
        "confirmed": confirmed,
    }
