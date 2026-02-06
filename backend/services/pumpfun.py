#!/usr/bin/env python3
"""
Pump.fun bonding curve buy instruction builder.

Direct instruction building for Pump.fun token snipes:
1. Derive bonding curve PDA from token mint
2. Fetch bonding curve state (virtual/real reserves)
3. Compute tokens out using bonding curve math
4. Build unsigned VersionedTransaction with CreateATA + Buy instruction

Eliminates Jupiter HTTP round-trips (~300ms quote + ~300ms swap) with
direct build (~50ms: 1 RPC for state + local instruction building).
"""

import base64
import logging
import struct
import time
from dataclasses import dataclass
from typing import Optional, Tuple

import requests
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.message import MessageV0
from solders.transaction import VersionedTransaction
from solders.system_program import transfer, TransferParams, ID as SYSTEM_PROGRAM_ID
from solders.compute_budget import set_compute_unit_limit, set_compute_unit_price
from solders.hash import Hash

from config import SOLANA_RPC, HELIUS_STAKED_RPC
from endpoint_manager import get_endpoint_manager

logger = logging.getLogger("pumpfun")
logger.setLevel(logging.INFO)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pump.fun Program Constants
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Original Pump.fun program (used for instruction building)
# NOTE: This is the main Pump.fun program where buy/sell instructions are sent.
# Outrider polls "6EF8rLSqY78dq396uA9D8S5WvAnX6k98TqQ29P9f77fM" for create signatures,
# but buy instructions go to this main program.
PUMPFUN_PROGRAM = Pubkey.from_string("6EF8rrecqhRssReavQkS7tUSwGPbbSr6aYxBRfj4zcMY")

# Fee recipient for buy transactions (verified from recent successful buys)
PUMPFUN_FEE_RECIPIENT = Pubkey.from_string("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCJyBVSY1dcGe")

# Standard Solana programs
TOKEN_PROGRAM = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ATA_PROGRAM = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
RENT_SYSVAR = Pubkey.from_string("SysvarRent111111111111111111111111111111111")

# Buy instruction discriminator (first 8 bytes of Anchor hash of "global:buy")
BUY_DISCRIMINATOR = bytes([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea])

# Bonding curve state account offsets (verified against on-chain data)
# Total account size: ~49 bytes
BONDING_CURVE_OFFSETS = {
    "discriminator": 0,              # 8 bytes
    "virtual_token_reserves": 8,     # u64 (8 bytes)
    "virtual_sol_reserves": 16,      # u64 (8 bytes)
    "real_token_reserves": 24,       # u64 (8 bytes)
    "real_sol_reserves": 32,         # u64 (8 bytes)
    "token_total_supply": 40,        # u64 (8 bytes)
    "complete": 48,                  # bool (1 byte)
}


@dataclass
class BondingCurveState:
    """Parsed state of a Pump.fun bonding curve account."""
    bonding_curve_address: str
    token_mint: str
    virtual_token_reserves: int
    virtual_sol_reserves: int
    real_token_reserves: int
    real_sol_reserves: int
    token_total_supply: int
    complete: bool
    associated_bonding_curve: str  # Token account for bonding curve


class PumpfunBuyer:
    """
    Pump.fun bonding curve buy instruction builder.

    Provides fast-path token purchases by building instructions locally
    instead of routing through Jupiter HTTP APIs.
    """

    def __init__(self):
        self._rpc_url = HELIUS_STAKED_RPC or SOLANA_RPC
        self._session = requests.Session()
        # Cache recent bonding curve states (short TTL)
        self._state_cache: dict[str, Tuple[BondingCurveState, float]] = {}
        self._cache_ttl = 2.0  # seconds

    # ── PDA Derivation ──────────────────────────────────────────────────

    def derive_bonding_curve(self, token_mint: str) -> Tuple[str, str]:
        """
        Derive the bonding curve PDA and its associated token account.

        Args:
            token_mint: The token's mint address

        Returns:
            (bonding_curve_address, associated_bonding_curve_address)
        """
        mint_pubkey = Pubkey.from_string(token_mint)

        # Bonding curve PDA: seeds = ["bonding-curve", mint_pubkey]
        bonding_curve, _ = Pubkey.find_program_address(
            [b"bonding-curve", bytes(mint_pubkey)],
            PUMPFUN_PROGRAM
        )

        # Associated token account for the bonding curve
        assoc_bonding_curve = self._get_ata(bonding_curve, mint_pubkey)

        return str(bonding_curve), str(assoc_bonding_curve)

    def _derive_global_config(self) -> str:
        """Derive the global config PDA."""
        global_pda, _ = Pubkey.find_program_address(
            [b"global"],
            PUMPFUN_PROGRAM
        )
        return str(global_pda)

    def _derive_event_authority(self) -> str:
        """Derive the event authority PDA."""
        event_auth, _ = Pubkey.find_program_address(
            [b"__event_authority"],
            PUMPFUN_PROGRAM
        )
        return str(event_auth)

    # ── State Fetching ──────────────────────────────────────────────────

    def fetch_bonding_curve_state(self, token_mint: str) -> Optional[BondingCurveState]:
        """
        Fetch and parse the bonding curve state for a token.

        Args:
            token_mint: The token's mint address

        Returns:
            BondingCurveState or None if not found/failed
        """
        # Check cache first
        now = time.time()
        if token_mint in self._state_cache:
            state, cached_at = self._state_cache[token_mint]
            if now - cached_at < self._cache_ttl:
                return state

        try:
            bonding_curve, assoc_bonding_curve = self.derive_bonding_curve(token_mint)

            # Fetch account data
            rpc_url = get_endpoint_manager().get_rpc_url() or self._rpc_url
            resp = self._session.post(rpc_url, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getAccountInfo",
                "params": [bonding_curve, {"encoding": "base64", "commitment": "confirmed"}]
            }, timeout=3)

            result = resp.json().get("result", {})
            value = result.get("value")
            if not value or not value.get("data"):
                logger.warning(f"Bonding curve not found for {token_mint[:8]}...")
                return None

            data = base64.b64decode(value["data"][0])
            if len(data) < 49:
                logger.warning(f"Bonding curve data too short: {len(data)} bytes")
                return None

            # Parse state
            state = BondingCurveState(
                bonding_curve_address=bonding_curve,
                token_mint=token_mint,
                virtual_token_reserves=struct.unpack_from('<Q', data, BONDING_CURVE_OFFSETS["virtual_token_reserves"])[0],
                virtual_sol_reserves=struct.unpack_from('<Q', data, BONDING_CURVE_OFFSETS["virtual_sol_reserves"])[0],
                real_token_reserves=struct.unpack_from('<Q', data, BONDING_CURVE_OFFSETS["real_token_reserves"])[0],
                real_sol_reserves=struct.unpack_from('<Q', data, BONDING_CURVE_OFFSETS["real_sol_reserves"])[0],
                token_total_supply=struct.unpack_from('<Q', data, BONDING_CURVE_OFFSETS["token_total_supply"])[0],
                complete=bool(data[BONDING_CURVE_OFFSETS["complete"]]),
                associated_bonding_curve=assoc_bonding_curve,
            )

            # Cache the state
            self._state_cache[token_mint] = (state, now)

            logger.debug(f"Bonding curve {token_mint[:8]}...: "
                        f"vTokens={state.virtual_token_reserves} vSOL={state.virtual_sol_reserves} "
                        f"complete={state.complete}")
            return state

        except Exception as e:
            logger.error(f"Failed to fetch bonding curve state for {token_mint[:8]}...: {e}")
            return None

    # ── Swap Math ───────────────────────────────────────────────────────

    def compute_tokens_out(self, sol_lamports: int, state: BondingCurveState) -> int:
        """
        Compute expected tokens out for a given SOL input.

        Uses the constant-product formula:
        tokens_out = (sol_lamports * virtual_token_reserves) / (virtual_sol_reserves + sol_lamports)

        Args:
            sol_lamports: Input SOL amount in lamports
            state: Current bonding curve state

        Returns:
            Expected token amount (raw, no decimals applied)
        """
        if state.virtual_sol_reserves == 0:
            return 0

        # Constant product: tokens_out = (sol * vTokens) / (vSOL + sol)
        tokens_out = (sol_lamports * state.virtual_token_reserves) // (state.virtual_sol_reserves + sol_lamports)
        return tokens_out

    def compute_sol_for_tokens(self, tokens_wanted: int, state: BondingCurveState) -> int:
        """
        Compute SOL required to receive a specific amount of tokens.

        Inverse of compute_tokens_out for exact-output swaps.

        Args:
            tokens_wanted: Desired token amount (raw)
            state: Current bonding curve state

        Returns:
            Required SOL amount in lamports
        """
        if state.virtual_token_reserves == 0 or tokens_wanted >= state.virtual_token_reserves:
            return 0

        # Solve for sol: tokens = (sol * vTokens) / (vSOL + sol)
        # sol = (tokens * vSOL) / (vTokens - tokens)
        sol_required = (tokens_wanted * state.virtual_sol_reserves) // (state.virtual_token_reserves - tokens_wanted)
        return sol_required + 1  # Add 1 lamport for rounding safety

    # ── Transaction Building ────────────────────────────────────────────

    def build_buy_transaction(
        self,
        token_mint: str,
        sol_lamports: int,
        min_tokens_out: int,
        user_pubkey: str,
        blockhash: str,
        compute_unit_price: int = 50000,  # microlamports per CU
    ) -> Optional[str]:
        """
        Build an unsigned VersionedTransaction for a Pump.fun buy.

        Args:
            token_mint: Token mint address
            sol_lamports: SOL amount to spend (lamports)
            min_tokens_out: Minimum tokens to receive (slippage protection)
            user_pubkey: User's wallet public key
            blockhash: Recent blockhash for transaction
            compute_unit_price: Priority fee in microlamports per compute unit

        Returns:
            Base64-encoded unsigned VersionedTransaction, or None on error
        """
        try:
            # Fetch current state to get account addresses
            state = self.fetch_bonding_curve_state(token_mint)
            if not state:
                logger.error(f"Cannot build buy: no bonding curve state for {token_mint[:8]}...")
                return None

            if state.complete:
                logger.warning(f"Token {token_mint[:8]}... has graduated (bonding curve complete)")
                return None

            user = Pubkey.from_string(user_pubkey)
            mint = Pubkey.from_string(token_mint)
            bonding_curve = Pubkey.from_string(state.bonding_curve_address)
            assoc_bonding_curve = Pubkey.from_string(state.associated_bonding_curve)
            global_config = Pubkey.from_string(self._derive_global_config())
            event_authority = Pubkey.from_string(self._derive_event_authority())

            # User's associated token account for this token
            user_ata = self._get_ata(user, mint)

            instructions = []

            # 1. Compute budget instructions for priority
            instructions.append(set_compute_unit_limit(200_000))
            instructions.append(set_compute_unit_price(compute_unit_price))

            # 2. Create user ATA (idempotent - won't fail if exists)
            instructions.append(self._create_ata_idempotent_ix(user, user, mint))

            # 3. Pump.fun buy instruction
            buy_ix = self._build_buy_instruction(
                global_config=global_config,
                fee_recipient=PUMPFUN_FEE_RECIPIENT,
                mint=mint,
                bonding_curve=bonding_curve,
                assoc_bonding_curve=assoc_bonding_curve,
                user_ata=user_ata,
                user=user,
                event_authority=event_authority,
                token_amount=min_tokens_out,
                max_sol_cost=sol_lamports,
            )
            instructions.append(buy_ix)

            # Build VersionedTransaction (unsigned)
            recent_hash = Hash.from_string(blockhash)
            msg = MessageV0.try_compile(
                payer=user,
                instructions=instructions,
                address_lookup_table_accounts=[],
                recent_blockhash=recent_hash,
            )
            tx = VersionedTransaction(msg, [])
            tx_bytes = bytes(tx)

            return base64.b64encode(tx_bytes).decode('utf-8')

        except Exception as e:
            logger.error(f"Failed to build buy transaction: {e}", exc_info=True)
            return None

    def _build_buy_instruction(
        self,
        global_config: Pubkey,
        fee_recipient: Pubkey,
        mint: Pubkey,
        bonding_curve: Pubkey,
        assoc_bonding_curve: Pubkey,
        user_ata: Pubkey,
        user: Pubkey,
        event_authority: Pubkey,
        token_amount: int,
        max_sol_cost: int,
    ) -> Instruction:
        """
        Build the Pump.fun buy instruction.

        Instruction data: discriminator (8 bytes) + token_amount (u64) + max_sol_cost (u64)
        """
        # Data: discriminator + token_amount + max_sol_cost
        data = BUY_DISCRIMINATOR + struct.pack('<QQ', token_amount, max_sol_cost)

        # 12 accounts in order (from IDL / transaction inspection)
        accounts = [
            AccountMeta(global_config, is_signer=False, is_writable=False),
            AccountMeta(fee_recipient, is_signer=False, is_writable=True),
            AccountMeta(mint, is_signer=False, is_writable=False),
            AccountMeta(bonding_curve, is_signer=False, is_writable=True),
            AccountMeta(assoc_bonding_curve, is_signer=False, is_writable=True),
            AccountMeta(user_ata, is_signer=False, is_writable=True),
            AccountMeta(user, is_signer=True, is_writable=True),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(TOKEN_PROGRAM, is_signer=False, is_writable=False),
            AccountMeta(RENT_SYSVAR, is_signer=False, is_writable=False),
            AccountMeta(event_authority, is_signer=False, is_writable=False),
            AccountMeta(PUMPFUN_PROGRAM, is_signer=False, is_writable=False),
        ]

        return Instruction(PUMPFUN_PROGRAM, data, accounts)

    # ── SPL Token Helpers ───────────────────────────────────────────────

    @staticmethod
    def _get_ata(owner: Pubkey, mint: Pubkey) -> Pubkey:
        """Derive the Associated Token Account address."""
        seeds = [bytes(owner), bytes(TOKEN_PROGRAM), bytes(mint)]
        ata, _ = Pubkey.find_program_address(seeds, ATA_PROGRAM)
        return ata

    @staticmethod
    def _create_ata_idempotent_ix(payer: Pubkey, owner: Pubkey, mint: Pubkey) -> Instruction:
        """Build createAssociatedTokenAccountIdempotent instruction."""
        ata = PumpfunBuyer._get_ata(owner, mint)

        accounts = [
            AccountMeta(payer, is_signer=True, is_writable=True),
            AccountMeta(ata, is_signer=False, is_writable=True),
            AccountMeta(owner, is_signer=False, is_writable=False),
            AccountMeta(mint, is_signer=False, is_writable=False),
            AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            AccountMeta(TOKEN_PROGRAM, is_signer=False, is_writable=False),
        ]
        # createIdempotent = instruction index 1 in ATA program
        return Instruction(ATA_PROGRAM, bytes([1]), accounts)

    def clear_cache(self):
        """Clear the bonding curve state cache."""
        self._state_cache.clear()


# Module-level singleton instance
pumpfun_buyer = PumpfunBuyer()
