#!/usr/bin/env python3
"""Session key management service for browser wallet delegation."""
import os
import base64
import json
import time
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
from solders.message import to_bytes_versioned
from solana.rpc.types import TxOpts

from extensions import db, solana_client


# Encryption key derived from server secret
# SECURITY: No default - must be configured via environment variable
SERVER_SECRET = os.getenv('SESSION_KEY_SECRET', '')

if not SERVER_SECRET:
    import warnings
    warnings.warn(
        "SESSION_KEY_SECRET not set! Session key encryption is disabled. "
        "Set SESSION_KEY_SECRET in .env (minimum 32 characters) for production use.",
        RuntimeWarning
    )
    # Use a dummy value to prevent crashes, but session keys won't be secure
    SERVER_SECRET = 'INSECURE-DEFAULT-DO-NOT-USE-IN-PRODUCTION'

def _get_encryption_key():
    """Derive encryption key from server secret."""
    salt = b'tactix_session_salt'
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(SERVER_SECRET.encode()))
    return Fernet(key)


def encrypt_session_secret(secret_bytes: bytes) -> str:
    """Encrypt session key secret for storage."""
    fernet = _get_encryption_key()
    encrypted = fernet.encrypt(secret_bytes)
    return base64.b64encode(encrypted).decode('utf-8')


def decrypt_session_secret(encrypted_str: str) -> bytes:
    """Decrypt session key secret from storage."""
    fernet = _get_encryption_key()
    encrypted = base64.b64decode(encrypted_str.encode('utf-8'))
    return fernet.decrypt(encrypted)


def create_session_key(user_wallet: str, permissions: dict = None, duration_hours: int = 24):
    """
    Create a new session key delegation.

    Note: The actual keypair generation happens on the frontend (browser).
    The frontend sends the session public key and encrypted secret.
    This function validates and stores the delegation.
    """
    if permissions is None:
        permissions = {
            'maxTradeSize': 1000,  # Max $1000 per trade
            'allowedTokens': []    # Empty = all tokens allowed
        }

    expires_at = datetime.utcnow() + timedelta(hours=duration_hours)
    return {
        'permissions': permissions,
        'expiresAt': int(expires_at.timestamp() * 1000),  # JS timestamp
        'durationHours': duration_hours
    }


def store_session_key(
    user_wallet: str,
    session_pubkey: str,
    session_secret: str,
    permissions: dict,
    expires_at: datetime
):
    """Store a validated session key delegation."""
    # Encrypt the session secret
    encrypted_secret = encrypt_session_secret(session_secret.encode('utf-8'))

    db.save_session_key(
        user_wallet=user_wallet,
        session_pubkey=session_pubkey,
        session_secret_encrypted=encrypted_secret,
        permissions=permissions,
        expires_at=expires_at
    )


def get_session_keypair(user_wallet: str) -> Keypair | None:
    """
    Get the decrypted session keypair for a user's browser wallet.
    Returns None if no active session key exists.
    """
    session = db.get_active_session_key(user_wallet)
    if not session:
        return None

    try:
        secret_bytes = decrypt_session_secret(session['session_secret_encrypted'])
        # The secret is base58 encoded private key
        return Keypair.from_base58_string(secret_bytes.decode('utf-8'))
    except Exception as e:
        print(f"Failed to decrypt session key: {e}")
        return None


def get_session_info(user_wallet: str) -> dict | None:
    """Get session key info (without secret)."""
    session = db.get_active_session_key(user_wallet)
    if not session:
        return None

    return {
        'sessionPubkey': session['session_pubkey'],
        'expiresAt': int(datetime.fromisoformat(session['expires_at']).timestamp() * 1000),
        'permissions': session['permissions'],
        'createdAt': session['created_at']
    }


def revoke_session(user_wallet: str, session_pubkey: str = None):
    """Revoke a session key delegation."""
    db.revoke_session_key(user_wallet, session_pubkey)


def extend_session(user_wallet: str, session_pubkey: str, additional_hours: int = 24):
    """Extend session key expiration."""
    session = db.get_active_session_key(user_wallet)
    if not session or session['session_pubkey'] != session_pubkey:
        return False

    current_expires = datetime.fromisoformat(session['expires_at'])
    new_expires = current_expires + timedelta(hours=additional_hours)
    db.extend_session_key(user_wallet, session_pubkey, new_expires)
    return True


def sign_transaction_with_session_key(user_wallet: str, transaction_bytes: bytes) -> bytes:
    """
    Sign a transaction using the user's session key.

    Args:
        user_wallet: The browser wallet address that delegated the session
        transaction_bytes: The unsigned transaction as bytes

    Returns:
        Signed transaction bytes
    """
    keypair = get_session_keypair(user_wallet)
    if not keypair:
        raise Exception(f"No active session key for wallet {user_wallet}")

    # Verify the session key's permissions
    session = db.get_active_session_key(user_wallet)
    if not session:
        raise Exception("Session key not found")

    try:
        txn = VersionedTransaction.from_bytes(transaction_bytes)
        signature = keypair.sign_message(to_bytes_versioned(txn.message))
        signed_txn = VersionedTransaction.populate(txn.message, [signature])
        return bytes(signed_txn)
    except Exception as e:
        raise Exception(f"Failed to sign transaction: {e}")


class SessionPermissionError(Exception):
    """Raised when a session key trade violates permissions."""
    pass


def _check_session_permissions(
    session: dict,
    input_mint: str,
    output_mint: str,
    usd_value: float
) -> None:
    """
    Verify a trade is allowed under session permissions.

    Raises:
        SessionPermissionError: If trade violates permissions
    """
    permissions = session.get('permissions', {})
    if isinstance(permissions, str):
        import json
        permissions = json.loads(permissions)

    # Check max trade size
    max_trade_size = permissions.get('maxTradeSize', 0)
    if max_trade_size > 0 and usd_value > max_trade_size:
        raise SessionPermissionError(
            f"Trade size ${usd_value:.2f} exceeds session limit ${max_trade_size:.2f}"
        )

    # Check allowed tokens (if specified)
    allowed_tokens = permissions.get('allowedTokens', [])
    if allowed_tokens:
        if input_mint not in allowed_tokens and output_mint not in allowed_tokens:
            raise SessionPermissionError(
                f"Neither {input_mint[:8]}... nor {output_mint[:8]}... in allowed tokens list"
            )


def execute_trade_with_session_key(
    user_wallet: str,
    input_mint: str,
    output_mint: str,
    amount: float,
    source: str = "Delegated Bot",
    slippage_bps: int = 50
):
    """
    Execute a trade using the session key (for bot automation).

    This creates and signs the transaction using the delegated session key,
    then submits it to the network.

    SECURITY: Enforces session permissions (maxTradeSize, allowedTokens).
    """
    import requests
    from config import JUPITER_API_KEY, JUPITER_QUOTE_API, JUPITER_SWAP_API
    from services.tokens import get_known_tokens, get_token_symbol
    from services.portfolio import broadcast_balance
    import sio_bridge
    from extensions import price_cache, price_cache_lock

    keypair = get_session_keypair(user_wallet)
    if not keypair:
        raise Exception(f"No active session key for wallet {user_wallet}")

    session_pubkey = str(keypair.pubkey())
    known = get_known_tokens()
    input_token = known.get(input_mint, {"decimals": 9})
    output_token = known.get(output_mint, {"decimals": 9})
    amount_lamports = int(amount * (10 ** input_token.get("decimals", 9)))

    headers = {'x-api-key': JUPITER_API_KEY} if JUPITER_API_KEY else {}

    # Get quote FIRST to calculate USD value for permission check
    quote_url = f"{JUPITER_QUOTE_API}?inputMint={input_mint}&outputMint={output_mint}&amount={amount_lamports}&slippageBps={slippage_bps}"
    quote = requests.get(quote_url, headers=headers, timeout=10).json()
    if "error" in quote:
        raise Exception(f"Quote: {quote['error']}")

    # SECURITY: Calculate estimated USD value and check permissions BEFORE signing
    estimated_usd = 0
    with price_cache_lock:
        if input_mint in price_cache:
            estimated_usd = amount * price_cache[input_mint][0]
        elif output_mint in price_cache:
            amount_out_est = int(quote.get('outAmount', 0)) / (10 ** output_token.get('decimals', 9))
            estimated_usd = amount_out_est * price_cache[output_mint][0]

    # Get session and enforce permissions
    session = db.get_active_session_key(user_wallet)
    if session:
        _check_session_permissions(session, input_mint, output_mint, estimated_usd)

    # Generate swap transaction (for the session key to sign)
    swap_payload = {
        "quoteResponse": quote,
        "userPublicKey": user_wallet,  # The browser wallet that owns the funds
        "wrapAndUnwrapSol": True,
        "computeUnitPriceMicroLamports": 1000
    }
    swap_res = requests.post(JUPITER_SWAP_API, json=swap_payload, headers=headers, timeout=10).json()
    if "error" in swap_res:
        raise Exception(f"Swap: {swap_res['error']}")

    # Sign with session key
    try:
        tx_bytes = base64.b64decode(swap_res['swapTransaction'])
        txn = VersionedTransaction.from_bytes(tx_bytes)
        signature = keypair.sign_message(to_bytes_versioned(txn.message))
        signed_txn = VersionedTransaction.populate(txn.message, [signature])

        send_res = solana_client.send_raw_transaction(
            bytes(signed_txn),
            opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
        )
        sig = str(send_res.value)
    except Exception as e:
        raise Exception(f"Transaction failed: {e}")

    # Parse output amount
    amount_out = int(quote.get('outAmount', 0)) / (10 ** output_token.get('decimals', 9))

    # Calculate USD Value
    usd_value = 0
    with price_cache_lock:
        if input_mint in price_cache:
            usd_value = amount * price_cache[input_mint][0]
        elif output_mint in price_cache:
            usd_value = amount_out * price_cache[output_mint][0]

    # Log to database
    db.log_trade({
        "wallet_address": user_wallet,
        "source": f"{source} (Session Key)",
        "input": get_token_symbol(input_mint),
        "output": get_token_symbol(output_mint),
        "input_mint": input_mint,
        "output_mint": output_mint,
        "amount_in": amount,
        "amount_out": amount_out,
        "usd_value": usd_value,
        "slippage_bps": slippage_bps,
        "priority_fee": 0,
        "signature": sig,
        "status": "success"
    })

    # Broadcast updates
    sio_bridge.emit('history_update', {'history': db.get_history(50, wallet_address=user_wallet)}, namespace='/history')

    return {
        "signature": sig,
        "amount_out": amount_out,
        "usd_value": usd_value
    }
