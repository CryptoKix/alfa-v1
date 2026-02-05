"""
Raydium V4 AMM — direct pool state + swap instruction builder.

Eliminates Jupiter HTTP round-trips for Raydium swaps by:
1. Discovering V4 pools via Raydium API
2. Caching pool state (accounts, fee params) from on-chain data
3. Tracking vault reserves in real-time via gRPC account subscriptions
4. Building swap VersionedTransactions locally (~1ms vs ~500ms Jupiter)

Fallback: If pool not found or reserves stale, caller falls through to Jupiter.
"""

import base64
import logging
import struct
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import requests
from solders.pubkey import Pubkey
from solders.instruction import Instruction, AccountMeta
from solders.message import MessageV0
from solders.transaction import VersionedTransaction
from solders.system_program import transfer, TransferParams, ID as SYSTEM_PROGRAM_ID
from solders.compute_budget import set_compute_unit_limit, set_compute_unit_price

from config import SOLANA_RPC, HELIUS_STAKED_RPC

logger = logging.getLogger("raydium_amm")
logger.setLevel(logging.INFO)

# Raydium V4 program IDs
RAYDIUM_V4_PROGRAM = Pubkey.from_string("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")
RAYDIUM_AUTHORITY = Pubkey.from_string("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1")
OPENBOOK_PROGRAM = Pubkey.from_string("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX")
TOKEN_PROGRAM = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")

# Raydium API
RAYDIUM_POOLS_API = "https://api-v3.raydium.io/pools/info/mint"

# Raydium V4 pool state account layout offsets (from anchor IDL / reverse-engineering)
# Total size: 752 bytes
POOL_STATE_OFFSETS = {
    "status": 8,           # u64
    "nonce": 16,           # u64
    "max_order": 24,       # u64
    "depth": 32,           # u64
    "base_decimal": 40,    # u64
    "quote_decimal": 48,   # u64
    "state": 56,           # u64
    "reset_flag": 64,      # u64
    "min_size": 72,        # u64
    "vol_max_cut_ratio": 80,   # u64
    "amount_wave_ratio": 88,   # u64
    "base_lot_size": 96,       # u64
    "quote_lot_size": 104,     # u64
    "min_price_multiplier": 112,  # u64
    "max_price_multiplier": 120,  # u64
    "system_decimal_value": 128,  # u64
    # Fee params
    "min_separate_numerator": 136,   # u64
    "min_separate_denominator": 144, # u64
    "trade_fee_numerator": 152,      # u64
    "trade_fee_denominator": 160,    # u64
    "pnl_numerator": 168,    # u64
    "pnl_denominator": 176,  # u64
    "swap_fee_numerator": 184,   # u64
    "swap_fee_denominator": 192, # u64
    # Key accounts
    "base_need_take_pnl": 200,    # u64
    "quote_need_take_pnl": 208,   # u64
    "total_pnl_pc": 216,     # u64
    "total_pnl_coin": 224,   # u64
    # More u64s...
    "pool_open_time": 296,   # u64
    # Pubkeys (32 bytes each)
    "padding1": 304,        # u64
    "padding2": 312,        # u64
    "pool_coin_token_account": 320,  # Pubkey - coin vault
    "pool_pc_token_account": 352,    # Pubkey - pc vault
    "coin_mint_address": 384,        # Pubkey - base mint
    "pc_mint_address": 416,          # Pubkey - quote mint
    "lp_mint_address": 448,          # Pubkey
    "open_orders": 480,              # Pubkey
    "market": 512,                   # Pubkey - serum/openbook market
    "serum_dex": 544,                # Pubkey - serum program
    "target_orders": 576,            # Pubkey
    "withdraw_queue": 608,           # Pubkey (deprecated)
    "lp_vault": 640,                 # Pubkey (deprecated)
    "amm_owner": 672,                # Pubkey
    "lp_reserve": 704,               # u64
}

# OpenBook market account layout offsets
MARKET_OFFSETS = {
    "account_flags": 5,        # u64
    "own_address": 13,         # Pubkey
    "vault_signer_nonce": 45,  # u64
    "base_mint": 53,           # Pubkey
    "quote_mint": 85,          # Pubkey
    "base_vault": 117,         # Pubkey
    "base_deposits_total": 149,  # u64
    "base_fees_accrued": 157,    # u64
    "quote_vault": 165,        # Pubkey
    "quote_deposits_total": 197,  # u64
    "quote_fees_accrued": 205,    # u64
    "quote_dust_threshold": 213,  # u64
    "request_queue": 221,      # Pubkey
    "event_queue": 253,        # Pubkey
    "bids": 285,               # Pubkey
    "asks": 317,               # Pubkey
    "base_lot_size": 349,      # u64
    "quote_lot_size": 357,     # u64
    "fee_rate_bps": 365,       # u64
    "referrer_rebates_accrued": 373,  # u64
}


@dataclass
class RaydiumPoolState:
    """All accounts + live state needed for a Raydium V4 swap instruction."""
    pool_address: str
    coin_mint: str      # base token
    pc_mint: str        # quote token (usually USDC/SOL)
    coin_decimals: int
    pc_decimals: int

    # Pool accounts
    coin_vault: str     # pool's base token account
    pc_vault: str       # pool's quote token account
    open_orders: str
    target_orders: str
    market_address: str
    serum_program: str

    # OpenBook market accounts
    market_bids: str
    market_asks: str
    market_event_queue: str
    market_coin_vault: str
    market_pc_vault: str
    market_vault_signer: str

    # Fee parameters
    trade_fee_numerator: int
    trade_fee_denominator: int
    swap_fee_numerator: int
    swap_fee_denominator: int

    # Live reserves (updated via gRPC or polling)
    coin_reserve: int = 0
    pc_reserve: int = 0
    last_update_slot: int = 0
    last_update_time: float = 0.0


class RaydiumPoolRegistry:
    """
    Service that discovers, caches, and maintains Raydium V4 pool state.

    Implements TactixService protocol: start()/stop()/is_running()/set_stream_manager()
    """

    def __init__(self):
        self._pools: Dict[str, RaydiumPoolState] = {}       # pool_address -> state
        self._pair_index: Dict[str, str] = {}                 # "mintA:mintB" -> pool_address
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stream_manager = None
        self._lock = threading.Lock()
        self._rpc_url = HELIUS_STAKED_RPC or SOLANA_RPC
        self._session = requests.Session()
        self._discovery_pairs: List[Tuple[str, str]] = []     # pairs to rediscover periodically

    # ── Service Protocol ─────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._maintenance_loop, daemon=True)
        self._thread.start()
        logger.info("RaydiumPoolRegistry started")

    def stop(self):
        self._running = False
        self._session.close()
        logger.info("RaydiumPoolRegistry stopped")

    def is_running(self):
        return self._running

    def set_stream_manager(self, stream_manager):
        """Register gRPC account subscriptions for vault token accounts."""
        self._stream_manager = stream_manager
        # Subscribe vaults for any pools already discovered
        self._subscribe_vaults()
        logger.info("RaydiumPoolRegistry: gRPC stream manager wired")

    # ── Pool Discovery ───────────────────────────────────────────────

    def discover_pools(self, mint_pairs: List[Tuple[str, str]]):
        """
        Find Raydium V4 pools for the given mint pairs via Raydium API,
        then fetch on-chain state for each pool.
        """
        self._discovery_pairs = mint_pairs
        discovered = 0

        for mint_a, mint_b in mint_pairs:
            try:
                pool_addr = self._find_pool_via_api(mint_a, mint_b)
                if pool_addr and pool_addr not in self._pools:
                    state = self._fetch_pool_state(pool_addr)
                    if state:
                        with self._lock:
                            self._pools[pool_addr] = state
                            # Index both directions
                            self._pair_index[f"{mint_a}:{mint_b}"] = pool_addr
                            self._pair_index[f"{mint_b}:{mint_a}"] = pool_addr
                        discovered += 1
                        logger.info(f"Discovered Raydium V4 pool {pool_addr[:8]}... for {mint_a[:8]}../{mint_b[:8]}..")
            except Exception as e:
                logger.warning(f"Pool discovery failed for {mint_a[:8]}../{mint_b[:8]}..: {e}")

        # Subscribe new vaults to gRPC
        if self._stream_manager and discovered > 0:
            self._subscribe_vaults()

        logger.info(f"Raydium pool discovery complete: {discovered} new pools ({len(self._pools)} total)")
        return discovered

    def _find_pool_via_api(self, mint_a: str, mint_b: str) -> Optional[str]:
        """Query Raydium API to find the V4 pool for a mint pair."""
        try:
            # Raydium v3 API: search by mint pair
            url = f"{RAYDIUM_POOLS_API}?mint1={mint_a}&mint2={mint_b}&poolType=standard&poolSortField=liquidity&sortType=desc&pageSize=5&page=1"
            resp = self._session.get(url, timeout=10)
            if resp.status_code != 200:
                logger.warning(f"Raydium API returned {resp.status_code}")
                return None

            data = resp.json()
            pools = data.get("data", {}).get("data", [])

            # Find the V4 pool with highest liquidity
            for pool in pools:
                program_id = pool.get("programId", "")
                if program_id == str(RAYDIUM_V4_PROGRAM):
                    return pool.get("id")

            # If no V4 pool found, return None (caller will use Jupiter)
            if pools:
                logger.debug(f"No V4 pool found for pair (found {len(pools)} non-V4 pools)")
            return None

        except Exception as e:
            logger.warning(f"Raydium API error: {e}")
            return None

    def _fetch_pool_state(self, pool_address: str) -> Optional[RaydiumPoolState]:
        """Fetch and parse the on-chain pool state + OpenBook market accounts."""
        try:
            # Fetch pool account data
            pool_data = self._get_account_data(pool_address)
            if not pool_data or len(pool_data) < 712:
                logger.warning(f"Pool {pool_address[:8]}... data too short ({len(pool_data) if pool_data else 0} bytes)")
                return None

            # Parse key fields
            def read_u64(offset):
                return struct.unpack_from('<Q', pool_data, offset)[0]

            def read_pubkey(offset):
                return str(Pubkey.from_bytes(pool_data[offset:offset + 32]))

            coin_vault = read_pubkey(POOL_STATE_OFFSETS["pool_coin_token_account"])
            pc_vault = read_pubkey(POOL_STATE_OFFSETS["pool_pc_token_account"])
            coin_mint = read_pubkey(POOL_STATE_OFFSETS["coin_mint_address"])
            pc_mint = read_pubkey(POOL_STATE_OFFSETS["pc_mint_address"])
            open_orders = read_pubkey(POOL_STATE_OFFSETS["open_orders"])
            market_address = read_pubkey(POOL_STATE_OFFSETS["market"])
            serum_program = read_pubkey(POOL_STATE_OFFSETS["serum_dex"])
            target_orders = read_pubkey(POOL_STATE_OFFSETS["target_orders"])

            coin_decimals = read_u64(POOL_STATE_OFFSETS["base_decimal"])
            pc_decimals = read_u64(POOL_STATE_OFFSETS["quote_decimal"])

            trade_fee_num = read_u64(POOL_STATE_OFFSETS["trade_fee_numerator"])
            trade_fee_den = read_u64(POOL_STATE_OFFSETS["trade_fee_denominator"])
            swap_fee_num = read_u64(POOL_STATE_OFFSETS["swap_fee_numerator"])
            swap_fee_den = read_u64(POOL_STATE_OFFSETS["swap_fee_denominator"])

            # Fetch OpenBook market to get bids, asks, event_queue, vaults
            market_data = self._get_account_data(market_address)
            if not market_data or len(market_data) < 380:
                logger.warning(f"Market {market_address[:8]}... data too short")
                return None

            def read_market_pubkey(offset):
                return str(Pubkey.from_bytes(market_data[offset:offset + 32]))

            market_bids = read_market_pubkey(MARKET_OFFSETS["bids"])
            market_asks = read_market_pubkey(MARKET_OFFSETS["asks"])
            market_event_queue = read_market_pubkey(MARKET_OFFSETS["event_queue"])
            market_coin_vault = read_market_pubkey(MARKET_OFFSETS["base_vault"])
            market_pc_vault = read_market_pubkey(MARKET_OFFSETS["quote_vault"])

            # Derive vault signer PDA
            vault_signer_nonce = struct.unpack_from('<Q', market_data, MARKET_OFFSETS["vault_signer_nonce"])[0]
            market_vault_signer = self._derive_vault_signer(market_address, vault_signer_nonce)

            # Fetch initial vault reserves
            coin_reserve = self._get_token_balance(coin_vault)
            pc_reserve = self._get_token_balance(pc_vault)

            state = RaydiumPoolState(
                pool_address=pool_address,
                coin_mint=coin_mint,
                pc_mint=pc_mint,
                coin_decimals=coin_decimals,
                pc_decimals=pc_decimals,
                coin_vault=coin_vault,
                pc_vault=pc_vault,
                open_orders=open_orders,
                target_orders=target_orders,
                market_address=market_address,
                serum_program=serum_program,
                market_bids=market_bids,
                market_asks=market_asks,
                market_event_queue=market_event_queue,
                market_coin_vault=market_coin_vault,
                market_pc_vault=market_pc_vault,
                market_vault_signer=market_vault_signer,
                trade_fee_numerator=trade_fee_num,
                trade_fee_denominator=trade_fee_den,
                swap_fee_numerator=swap_fee_num,
                swap_fee_denominator=swap_fee_den,
                coin_reserve=coin_reserve,
                pc_reserve=pc_reserve,
                last_update_slot=0,
                last_update_time=time.time(),
            )

            logger.info(f"Pool {pool_address[:8]}...: coin={coin_mint[:8]}.. pc={pc_mint[:8]}.. "
                        f"reserves={coin_reserve}/{pc_reserve} fee={trade_fee_num}/{trade_fee_den}")
            return state

        except Exception as e:
            logger.error(f"Failed to fetch pool state for {pool_address[:8]}...: {e}", exc_info=True)
            return None

    # ── RPC Helpers ──────────────────────────────────────────────────

    def _get_account_data(self, address: str) -> Optional[bytes]:
        """Fetch raw account data via RPC getAccountInfo."""
        try:
            resp = self._session.post(self._rpc_url, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getAccountInfo",
                "params": [address, {"encoding": "base64", "commitment": "confirmed"}]
            }, timeout=5)
            result = resp.json().get("result", {})
            value = result.get("value")
            if value and value.get("data"):
                data_b64 = value["data"][0]
                return base64.b64decode(data_b64)
            return None
        except Exception as e:
            logger.error(f"getAccountInfo failed for {address[:8]}...: {e}")
            return None

    def _get_token_balance(self, token_account: str) -> int:
        """Fetch SPL token account balance (raw amount)."""
        try:
            resp = self._session.post(self._rpc_url, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getTokenAccountBalance",
                "params": [token_account]
            }, timeout=5)
            result = resp.json().get("result", {}).get("value", {})
            return int(result.get("amount", "0"))
        except Exception as e:
            logger.debug(f"getTokenAccountBalance failed for {token_account[:8]}...: {e}")
            return 0

    def _derive_vault_signer(self, market_address: str, nonce: int) -> str:
        """Derive the OpenBook market vault signer PDA."""
        market_pubkey = Pubkey.from_string(market_address)
        # createProgramAddress with [market_address_bytes, nonce_le_bytes]
        nonce_bytes = nonce.to_bytes(8, byteorder='little')
        # The vault signer is derived from the DEX program with seeds = [market_pubkey, nonce]
        try:
            vault_signer = Pubkey.create_program_address(
                [bytes(market_pubkey), nonce_bytes],
                OPENBOOK_PROGRAM
            )
            return str(vault_signer)
        except Exception as e:
            logger.error(f"Vault signer derivation failed: {e}")
            # Fallback: try nonce as single byte
            try:
                vault_signer = Pubkey.create_program_address(
                    [bytes(market_pubkey), bytes([nonce & 0xFF])],
                    OPENBOOK_PROGRAM
                )
                return str(vault_signer)
            except Exception as e2:
                logger.error(f"Vault signer fallback also failed: {e2}")
                return ""

    # ── gRPC Vault Tracking ──────────────────────────────────────────

    def _subscribe_vaults(self):
        """Subscribe to vault token accounts via gRPC for real-time reserve updates."""
        if not self._stream_manager:
            return

        vault_addresses = []
        with self._lock:
            for pool in self._pools.values():
                vault_addresses.append(pool.coin_vault)
                vault_addresses.append(pool.pc_vault)

        if not vault_addresses:
            return

        try:
            self._stream_manager.subscribe_accounts(
                'raydium_vaults',
                vault_addresses,
                self._on_vault_update
            )
            logger.info(f"Subscribed to {len(vault_addresses)} Raydium vault accounts via gRPC")
        except Exception as e:
            logger.warning(f"gRPC vault subscription failed (will use polling): {e}")

    def _on_vault_update(self, pubkey: str, data: bytes, slot: int):
        """Callback from gRPC when a vault token account is updated.

        SPL token account layout: balance is u64 at offset 64.
        """
        if len(data) < 72:
            return

        balance = struct.unpack_from('<Q', data, 64)[0]

        with self._lock:
            for pool in self._pools.values():
                if pool.coin_vault == pubkey:
                    pool.coin_reserve = balance
                    pool.last_update_slot = slot
                    pool.last_update_time = time.time()
                    return
                elif pool.pc_vault == pubkey:
                    pool.pc_reserve = balance
                    pool.last_update_slot = slot
                    pool.last_update_time = time.time()
                    return

    # ── Swap Math ────────────────────────────────────────────────────

    def get_pool_for_pair(self, mint_a: str, mint_b: str) -> Optional[RaydiumPoolState]:
        """Look up the pool for a mint pair."""
        with self._lock:
            key = f"{mint_a}:{mint_b}"
            pool_addr = self._pair_index.get(key)
            if pool_addr:
                return self._pools.get(pool_addr)
            return None

    def compute_amount_out(self, pool_address: str, amount_in: int, coin_to_pc: bool) -> int:
        """
        Compute swap output using constant-product formula with fees.

        Args:
            pool_address: Raydium pool address
            amount_in: Raw input amount (lamports/atoms)
            coin_to_pc: True if swapping coin->pc (e.g., SOL->USDC), False for reverse

        Returns:
            Expected output amount (raw), or 0 on error
        """
        with self._lock:
            pool = self._pools.get(pool_address)
            if not pool:
                return 0

            if pool.coin_reserve == 0 or pool.pc_reserve == 0:
                return 0

            # Use trade fees (swap fees are for LP, trade fees are the actual swap fee)
            numerator = pool.trade_fee_numerator
            denominator = pool.trade_fee_denominator

            if denominator == 0:
                return 0

            # Amount after fee deduction
            amount_in_after_fee = amount_in * (denominator - numerator) // denominator

            if coin_to_pc:
                reserve_in = pool.coin_reserve
                reserve_out = pool.pc_reserve
            else:
                reserve_in = pool.pc_reserve
                reserve_out = pool.coin_reserve

            # Constant product: amount_out = (reserve_out * amount_in_after_fee) / (reserve_in + amount_in_after_fee)
            amount_out = (reserve_out * amount_in_after_fee) // (reserve_in + amount_in_after_fee)
            return amount_out

    # ── Instruction Building ─────────────────────────────────────────

    def build_swap_transaction(
        self,
        pool_address: str,
        amount_in: int,
        min_amount_out: int,
        coin_to_pc: bool,
        user_pubkey: str,
        blockhash: str,
    ) -> Optional[str]:
        """
        Build a complete Raydium V4 swap VersionedTransaction.

        Handles WSOL wrap/unwrap if SOL is involved.
        Returns base64-encoded unsigned transaction, or None on error.
        """
        with self._lock:
            pool = self._pools.get(pool_address)
            if not pool:
                logger.warning(f"Pool {pool_address[:8]}... not found")
                return None

        user = Pubkey.from_string(user_pubkey)
        instructions = []

        # Compute budget for priority
        instructions.append(set_compute_unit_limit(300_000))
        instructions.append(set_compute_unit_price(10_000))

        # Determine input/output mints
        if coin_to_pc:
            input_mint = pool.coin_mint
            output_mint = pool.pc_mint
        else:
            input_mint = pool.pc_mint
            output_mint = pool.coin_mint

        wsol_mint = "So11111111111111111111111111111111111111112"
        needs_wsol_wrap = (input_mint == wsol_mint)
        needs_wsol_unwrap = (output_mint == wsol_mint)

        # Get/create user token accounts
        from spl.token.instructions import (
            create_associated_token_account, close_account, CloseAccountParams,
            sync_native, SyncNativeParams
        )
        from solders.pubkey import Pubkey as SoldersPubkey

        input_mint_pk = Pubkey.from_string(input_mint)
        output_mint_pk = Pubkey.from_string(output_mint)

        # Derive user ATAs
        user_source_ata = self._get_ata(user, input_mint_pk)
        user_dest_ata = self._get_ata(user, output_mint_pk)

        # WSOL wrapping: Transfer SOL → ATA, then SyncNative
        if needs_wsol_wrap:
            # Create ATA if needed (createIdempotent)
            instructions.append(
                self._create_ata_idempotent_ix(user, user, input_mint_pk)
            )
            # Transfer SOL to the WSOL ATA
            instructions.append(
                transfer(TransferParams(
                    from_pubkey=user,
                    to_pubkey=user_source_ata,
                    lamports=amount_in,
                ))
            )
            # Sync native balance
            instructions.append(
                self._sync_native_ix(user_source_ata)
            )

        # Ensure destination ATA exists
        if needs_wsol_unwrap:
            instructions.append(
                self._create_ata_idempotent_ix(user, user, output_mint_pk)
            )
        else:
            instructions.append(
                self._create_ata_idempotent_ix(user, user, output_mint_pk)
            )

        # Build Raydium V4 swap instruction
        swap_ix = self._build_swap_instruction(
            pool, amount_in, min_amount_out, coin_to_pc,
            user, user_source_ata, user_dest_ata
        )
        instructions.append(swap_ix)

        # WSOL unwrapping: Close the WSOL ATA to get SOL back
        if needs_wsol_unwrap:
            instructions.append(
                self._close_account_ix(user_dest_ata, user, user)
            )

        # Also close WSOL source ATA if we wrapped
        if needs_wsol_wrap:
            instructions.append(
                self._close_account_ix(user_source_ata, user, user)
            )

        # Build VersionedTransaction
        try:
            from solders.hash import Hash
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
            logger.error(f"Failed to build swap transaction: {e}", exc_info=True)
            return None

    def _build_swap_instruction(
        self,
        pool: RaydiumPoolState,
        amount_in: int,
        min_amount_out: int,
        coin_to_pc: bool,
        user: Pubkey,
        user_source: Pubkey,
        user_dest: Pubkey,
    ) -> Instruction:
        """Build the Raydium V4 swap instruction (discriminator 9, 17 bytes data, 18 accounts)."""
        # Data: [9u8, amount_in: u64 LE, min_amount_out: u64 LE]
        data = struct.pack('<BQQ', 9, amount_in, min_amount_out)

        # 18 accounts in exact order
        accounts = [
            AccountMeta(TOKEN_PROGRAM, is_signer=False, is_writable=False),
            AccountMeta(Pubkey.from_string(pool.pool_address), is_signer=False, is_writable=True),
            AccountMeta(RAYDIUM_AUTHORITY, is_signer=False, is_writable=False),
            AccountMeta(Pubkey.from_string(pool.open_orders), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.target_orders), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.coin_vault), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.pc_vault), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.serum_program), is_signer=False, is_writable=False),
            AccountMeta(Pubkey.from_string(pool.market_address), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.market_bids), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.market_asks), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.market_event_queue), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.market_coin_vault), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.market_pc_vault), is_signer=False, is_writable=True),
            AccountMeta(Pubkey.from_string(pool.market_vault_signer), is_signer=False, is_writable=False),
            AccountMeta(user_source, is_signer=False, is_writable=True),
            AccountMeta(user_dest, is_signer=False, is_writable=True),
            AccountMeta(user, is_signer=True, is_writable=False),
        ]

        return Instruction(RAYDIUM_V4_PROGRAM, data, accounts)

    # ── SPL Token Helpers ────────────────────────────────────────────

    @staticmethod
    def _get_ata(owner: Pubkey, mint: Pubkey) -> Pubkey:
        """Derive the Associated Token Account address."""
        ATA_PROGRAM = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        seeds = [bytes(owner), bytes(TOKEN_PROGRAM), bytes(mint)]
        ata, _ = Pubkey.find_program_address(seeds, ATA_PROGRAM)
        return ata

    @staticmethod
    def _create_ata_idempotent_ix(payer: Pubkey, owner: Pubkey, mint: Pubkey) -> Instruction:
        """Build createAssociatedTokenAccountIdempotent instruction."""
        ATA_PROGRAM = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        ata = RaydiumPoolRegistry._get_ata(owner, mint)

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

    @staticmethod
    def _sync_native_ix(token_account: Pubkey) -> Instruction:
        """Build SyncNative instruction for WSOL account."""
        # SyncNative = instruction index 17 in Token program
        accounts = [
            AccountMeta(token_account, is_signer=False, is_writable=True),
        ]
        return Instruction(TOKEN_PROGRAM, bytes([17]), accounts)

    @staticmethod
    def _close_account_ix(account: Pubkey, dest: Pubkey, owner: Pubkey) -> Instruction:
        """Build CloseAccount instruction for WSOL cleanup."""
        # CloseAccount = instruction index 9 in Token program
        accounts = [
            AccountMeta(account, is_signer=False, is_writable=True),
            AccountMeta(dest, is_signer=False, is_writable=True),
            AccountMeta(owner, is_signer=True, is_writable=False),
        ]
        return Instruction(TOKEN_PROGRAM, bytes([9]), accounts)

    # ── Maintenance ──────────────────────────────────────────────────

    def _maintenance_loop(self):
        """Background thread: periodic reserve refresh + pool rediscovery."""
        RESERVE_REFRESH_INTERVAL = 30    # seconds (only when gRPC is not active)
        DISCOVERY_INTERVAL = 300         # 5 minutes

        last_discovery = time.time()

        while self._running:
            try:
                now = time.time()

                # Refresh reserves via RPC if gRPC is not providing updates
                with self._lock:
                    pools_to_refresh = [
                        (p.pool_address, p.coin_vault, p.pc_vault)
                        for p in self._pools.values()
                        if (now - p.last_update_time) > RESERVE_REFRESH_INTERVAL
                    ]

                for pool_addr, coin_vault, pc_vault in pools_to_refresh:
                    try:
                        coin_bal = self._get_token_balance(coin_vault)
                        pc_bal = self._get_token_balance(pc_vault)
                        with self._lock:
                            pool = self._pools.get(pool_addr)
                            if pool:
                                pool.coin_reserve = coin_bal
                                pool.pc_reserve = pc_bal
                                pool.last_update_time = time.time()
                    except Exception as e:
                        logger.debug(f"Reserve refresh failed for {pool_addr[:8]}...: {e}")

                # Periodic rediscovery
                if (now - last_discovery) > DISCOVERY_INTERVAL and self._discovery_pairs:
                    self.discover_pools(self._discovery_pairs)
                    last_discovery = time.time()

                time.sleep(10)

            except Exception as e:
                logger.error(f"Maintenance loop error: {e}")
                time.sleep(10)
