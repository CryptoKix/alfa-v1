#!/usr/bin/env python3
"""Wallet and transaction building routes for browser wallet integration."""
import base64
import requests
import time
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request

from solders.transaction import VersionedTransaction
from solders.message import MessageV0
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from spl.token.instructions import transfer_checked, TransferCheckedParams, get_associated_token_address, create_associated_token_account

from config import WALLET_ADDRESS, JUPITER_API_KEY, JUPITER_QUOTE_API, JUPITER_SWAP_API, JUPITER_LIMIT_ORDER_API
import sio_bridge
from extensions import db, solana_client, price_cache, price_cache_lock
from services.tokens import get_known_tokens, get_token_symbol
from services.portfolio import broadcast_balance
from services.session_keys import (
    store_session_key,
    get_session_info,
    revoke_session,
    extend_session,
    encrypt_session_secret
)

wallet_bp = Blueprint('wallet', __name__)


@wallet_bp.route('/api/wallet/server-address')
def api_server_address():
    """Return the server wallet address (from keypair.json)."""
    return jsonify({
        "address": WALLET_ADDRESS,
        "mode": "server"
    })


@wallet_bp.route('/api/tx/build-swap', methods=['POST'])
def api_build_swap():
    """
    Build an unsigned swap transaction for browser wallet signing.

    Request body:
    {
        "inputMint": "...",
        "outputMint": "...",
        "amount": 1.0,
        "slippageBps": 50,
        "userPublicKey": "..." (browser wallet address)
    }

    Returns:
    {
        "transaction": "<base64 encoded unsigned tx>",
        "quote": {...}
    }
    """
    data = request.json
    input_mint = data.get('inputMint')
    output_mint = data.get('outputMint')
    amount = float(data.get('amount', 0))
    slippage_bps = int(data.get('slippageBps', 50))
    user_public_key = data.get('userPublicKey')

    if not all([input_mint, output_mint, amount, user_public_key]):
        return jsonify({"error": "Missing required fields"}), 400

    known = get_known_tokens()
    input_token = known.get(input_mint, {"decimals": 9})
    amount_lamports = int(amount * (10 ** input_token.get("decimals", 9)))

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}

    try:
        # Get quote
        quote_url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount_lamports}&slippageBps={slippage_bps}"
        quote = requests.get(quote_url, headers=headers, timeout=10).json()
        if "error" in quote:
            return jsonify({"error": f"Quote: {quote['error']}"}), 400

        # Generate swap transaction (unsigned)
        swap_payload = {
            "quoteResponse": quote,
            "userPublicKey": user_public_key,
            "wrapAndUnwrapSol": True,
            "computeUnitPriceMicroLamports": 1000  # Default priority fee
        }
        swap_res = requests.post(JUPITER_SWAP_API, json=swap_payload, headers=headers, timeout=10).json()
        if "error" in swap_res:
            return jsonify({"error": f"Swap: {swap_res['error']}"}), 400

        # Parse expected output
        output_token = known.get(output_mint, {"decimals": 9})
        amount_out = int(quote.get('outAmount', 0)) / (10 ** output_token.get('decimals', 9))

        return jsonify({
            "transaction": swap_res.get('swapTransaction'),
            "quote": quote,
            "expectedOutput": amount_out,
            "inputSymbol": get_token_symbol(input_mint),
            "outputSymbol": get_token_symbol(output_mint)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@wallet_bp.route('/api/tx/build-transfer', methods=['POST'])
def api_build_transfer():
    """
    Build an unsigned transfer transaction for browser wallet signing.

    Request body:
    {
        "recipient": "...",
        "amount": 1.0,
        "mint": "So11..." (optional, defaults to SOL),
        "userPublicKey": "..."
    }

    Returns:
    {
        "transaction": "<base64 encoded unsigned tx>"
    }
    """
    data = request.json
    recipient_address = data.get('recipient')
    amount = float(data.get('amount', 0))
    mint = data.get('mint', 'So11111111111111111111111111111111111111112')
    user_public_key = data.get('userPublicKey')

    if not all([recipient_address, amount, user_public_key]):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        recipient = Pubkey.from_string(recipient_address)
        sender = Pubkey.from_string(user_public_key)
    except:
        return jsonify({"error": "Invalid address"}), 400

    known = get_known_tokens()
    token_info = known.get(mint, {"decimals": 9, "symbol": "SOL"})
    decimals = token_info.get("decimals", 9)
    symbol = token_info.get("symbol", "SOL")

    amount_raw = int(amount * (10 ** decimals))
    if amount_raw <= 0:
        return jsonify({"error": "Invalid amount"}), 400

    try:
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

        # Build unsigned transaction
        msg = MessageV0.try_compile(
            payer=sender,
            instructions=instructions,
            address_lookup_table_accounts=[],
            recent_blockhash=recent_blockhash
        )
        txn = VersionedTransaction(msg, [])  # No signatures yet

        # Serialize the unsigned message (not the transaction)
        # Browser wallet will sign this
        tx_bytes = bytes(msg)
        tx_b64 = base64.b64encode(tx_bytes).decode('utf-8')

        return jsonify({
            "message": tx_b64,
            "recentBlockhash": str(recent_blockhash),
            "amount": amount,
            "symbol": symbol,
            "recipient": recipient_address
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@wallet_bp.route('/api/tx/build-limit', methods=['POST'])
def api_build_limit():
    """
    Build an unsigned limit order transaction for browser wallet signing.

    Request body:
    {
        "inputMint": "...",
        "outputMint": "...",
        "amount": 1.0,
        "price": 100.0,
        "userPublicKey": "..."
    }
    """
    data = request.json
    input_mint = data.get('inputMint')
    output_mint = data.get('outputMint')
    amount = float(data.get('amount', 0))
    price = float(data.get('price', 0))
    user_public_key = data.get('userPublicKey')

    if not all([input_mint, output_mint, amount, price, user_public_key]):
        return jsonify({"error": "Missing required fields"}), 400

    known = get_known_tokens()
    input_token = known.get(input_mint, {"decimals": 9})
    output_token = known.get(output_mint, {"decimals": 9})

    amount_raw = int(amount * (10 ** input_token.get("decimals", 9)))
    taking_amount = amount / price
    taking_amount_raw = int(taking_amount * (10 ** output_token.get("decimals", 9)))

    if amount_raw <= 0 or taking_amount_raw <= 0:
        return jsonify({"error": "Invalid amount or price"}), 400

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}

    try:
        url = f"{JUPITER_LIMIT_ORDER_API}/createOrder"
        payload = {
            "maker": user_public_key,
            "inputMint": input_mint,
            "outputMint": output_mint,
            "makingAmount": str(amount_raw),
            "takingAmount": str(taking_amount_raw),
            "computeUnitPriceMicroLamports": 1000
        }

        res = requests.post(url, json=payload, headers=headers, timeout=10).json()
        if "error" in res:
            return jsonify({"error": f"Limit Order API: {res['error']}"}), 400

        return jsonify({
            "transaction": res.get('transaction'),
            "orderPubKey": res.get('orderPubKey'),
            "inputSymbol": get_token_symbol(input_mint),
            "outputSymbol": get_token_symbol(output_mint),
            "makingAmount": amount,
            "takingAmount": taking_amount
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@wallet_bp.route('/api/tx/submit-signed', methods=['POST'])
def api_submit_signed():
    """
    Submit a browser-signed transaction and log it to the database.

    Request body:
    {
        "signedTransaction": "<base64 encoded signed tx>",
        "txType": "swap" | "transfer" | "limit",
        "metadata": {
            "inputMint": "...",
            "outputMint": "...",
            "amount": 1.0,
            "amountOut": 0.5,  (for swaps)
            "recipient": "...", (for transfers)
            "walletAddress": "..."
        }
    }
    """
    data = request.json
    signed_tx_b64 = data.get('signedTransaction')
    tx_type = data.get('txType', 'swap')
    metadata = data.get('metadata', {})

    if not signed_tx_b64:
        return jsonify({"error": "Missing signed transaction"}), 400

    try:
        # Decode and send the transaction
        signed_tx_bytes = base64.b64decode(signed_tx_b64)

        from solana.rpc.types import TxOpts
        send_res = solana_client.send_raw_transaction(
            signed_tx_bytes,
            opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
        )
        sig = str(send_res.value)

        # Log to database based on transaction type
        wallet_address = metadata.get('walletAddress', 'browser')

        if tx_type == 'swap':
            # Calculate USD value
            usd_value = 0
            with price_cache_lock:
                input_mint = metadata.get('inputMint')
                output_mint = metadata.get('outputMint')
                amount = metadata.get('amount', 0)
                amount_out = metadata.get('amountOut', 0)

                if input_mint and input_mint in price_cache:
                    usd_value = amount * price_cache[input_mint][0]
                elif output_mint and output_mint in price_cache:
                    usd_value = amount_out * price_cache[output_mint][0]

            db.log_trade({
                "wallet_address": wallet_address,
                "source": "Browser Swap",
                "input": get_token_symbol(metadata.get('inputMint', '')),
                "output": get_token_symbol(metadata.get('outputMint', '')),
                "input_mint": metadata.get('inputMint'),
                "output_mint": metadata.get('outputMint'),
                "amount_in": metadata.get('amount', 0),
                "amount_out": metadata.get('amountOut', 0),
                "usd_value": usd_value,
                "slippage_bps": metadata.get('slippageBps', 50),
                "priority_fee": 0,
                "signature": sig,
                "status": "success"
            })

        elif tx_type == 'transfer':
            symbol = get_token_symbol(metadata.get('mint', 'So11111111111111111111111111111111111111112'))
            db.log_trade({
                "wallet_address": wallet_address,
                "source": "Browser Transfer",
                "input": symbol,
                "output": symbol,
                "input_mint": metadata.get('mint'),
                "output_mint": metadata.get('mint'),
                "amount_in": metadata.get('amount', 0),
                "amount_out": metadata.get('amount', 0),
                "signature": sig,
                "status": "success"
            })

        elif tx_type == 'limit':
            input_sym = get_token_symbol(metadata.get('inputMint', ''))
            output_sym = get_token_symbol(metadata.get('outputMint', ''))
            db.log_trade({
                "wallet_address": wallet_address,
                "source": "Browser Limit Order",
                "input": input_sym,
                "output": output_sym,
                "input_mint": metadata.get('inputMint'),
                "output_mint": metadata.get('outputMint'),
                "amount_in": metadata.get('amount', 0),
                "amount_out": metadata.get('takingAmount', 0),
                "signature": sig,
                "status": "pending"
            })

        # Broadcast history update
        sio_bridge.emit('history_update', {'history': db.get_history(50, wallet_address=wallet_address)}, namespace='/history')
        broadcast_balance()

        return jsonify({
            "success": True,
            "signature": sig,
            "explorerUrl": f"https://solscan.io/tx/{sig}"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Session Key Delegation Endpoints ---

@wallet_bp.route('/api/session/create', methods=['POST'])
def api_session_create():
    """
    Create a session key delegation.

    Request body:
    {
        "userWallet": "...",           # Browser wallet public key
        "sessionPubkey": "...",        # Ephemeral signing key public key
        "sessionSecret": "...",        # Base58 encoded private key (encrypted in transit)
        "delegationSignature": "...",  # Signature proving browser wallet ownership
        "permissions": {...},          # Optional permission limits
        "durationHours": 24            # Optional, default 24h
    }
    """
    data = request.json
    user_wallet = data.get('userWallet')
    session_pubkey = data.get('sessionPubkey')
    session_secret = data.get('sessionSecret')
    delegation_sig = data.get('delegationSignature')
    permissions = data.get('permissions', {
        'maxTradeSize': 1000,
        'allowedTokens': []
    })
    duration_hours = int(data.get('durationHours', 24))

    if not all([user_wallet, session_pubkey, session_secret]):
        return jsonify({"error": "Missing required fields"}), 400

    # TODO: Verify delegation signature proves browser wallet ownership
    # This would verify that the user signed a message with their browser wallet
    # proving they authorize this session key delegation.

    try:
        expires_at = datetime.utcnow() + timedelta(hours=duration_hours)

        store_session_key(
            user_wallet=user_wallet,
            session_pubkey=session_pubkey,
            session_secret=session_secret,
            permissions=permissions,
            expires_at=expires_at
        )

        return jsonify({
            "success": True,
            "sessionPubkey": session_pubkey,
            "expiresAt": int(expires_at.timestamp() * 1000),
            "permissions": permissions
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@wallet_bp.route('/api/session/status')
def api_session_status():
    """
    Check session key status for a wallet.

    Query params:
        wallet: Browser wallet public key
    """
    user_wallet = request.args.get('wallet')
    if not user_wallet:
        return jsonify({"error": "Missing wallet parameter"}), 400

    session_info = get_session_info(user_wallet)

    if session_info:
        return jsonify({
            "active": True,
            **session_info
        })
    else:
        return jsonify({
            "active": False
        })


@wallet_bp.route('/api/session/revoke', methods=['POST'])
def api_session_revoke():
    """
    Revoke a session key delegation.

    Request body:
    {
        "userWallet": "...",
        "sessionPubkey": "..." (optional - if not provided, revokes all)
    }
    """
    data = request.json
    user_wallet = data.get('userWallet')
    session_pubkey = data.get('sessionPubkey')

    if not user_wallet:
        return jsonify({"error": "Missing userWallet"}), 400

    try:
        revoke_session(user_wallet, session_pubkey)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@wallet_bp.route('/api/session/extend', methods=['POST'])
def api_session_extend():
    """
    Extend session key expiration.

    Request body:
    {
        "userWallet": "...",
        "sessionPubkey": "...",
        "additionalHours": 24
    }
    """
    data = request.json
    user_wallet = data.get('userWallet')
    session_pubkey = data.get('sessionPubkey')
    additional_hours = int(data.get('additionalHours', 24))

    if not all([user_wallet, session_pubkey]):
        return jsonify({"error": "Missing required fields"}), 400

    try:
        success = extend_session(user_wallet, session_pubkey, additional_hours)
        if success:
            session_info = get_session_info(user_wallet)
            return jsonify({
                "success": True,
                "newExpiresAt": session_info.get('expiresAt') if session_info else None
            })
        else:
            return jsonify({"error": "Session not found or already expired"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
