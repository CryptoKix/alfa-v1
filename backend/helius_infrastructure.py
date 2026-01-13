"""
Helius Infrastructure Module
============================
Unified Helius integration for Solana trading bot.
Provides RPC, WebSocket, and DAS (Digital Asset Standard) API access.

Usage:
    from helius_infrastructure import HeliusClient

    client = HeliusClient()

    # RPC calls
    balance = client.rpc.get_balance("wallet_address")

    # DAS API
    asset = client.das.get_asset("mint_address")

    # WebSocket (async)
    async with client.ws as ws:
        await ws.subscribe_account("wallet_address", callback)
"""

import os
import json
import time
import asyncio
import logging
import threading
from typing import Optional, Callable, Dict, List, Any, Union
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

import requests
import websockets
from websockets.exceptions import ConnectionClosed
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("helius")


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class HeliusConfig:
    """Helius API configuration."""
    api_key: str = field(default_factory=lambda: os.getenv("HELIUS_API_KEY", ""))
    rpc_url: str = field(default="")
    ws_url: str = field(default="")
    das_url: str = field(default="")
    network: str = "mainnet"
    max_retries: int = 3
    retry_delay: float = 1.0
    timeout: int = 30

    def __post_init__(self):
        if not self.api_key:
            raise ValueError("HELIUS_API_KEY not found in environment")

        base = "mainnet" if self.network == "mainnet" else "devnet"
        if not self.rpc_url:
            self.rpc_url = f"https://{base}.helius-rpc.com/?api-key={self.api_key}"
        if not self.ws_url:
            self.ws_url = f"wss://{base}.helius-rpc.com/?api-key={self.api_key}"
        if not self.das_url:
            self.das_url = f"https://{base}.helius-rpc.com/?api-key={self.api_key}"


class SubscriptionType(Enum):
    """WebSocket subscription types."""
    ACCOUNT = "accountSubscribe"
    LOGS = "logsSubscribe"
    PROGRAM = "programSubscribe"
    SIGNATURE = "signatureSubscribe"
    SLOT = "slotSubscribe"
    ROOT = "rootSubscribe"


# =============================================================================
# Helius RPC Client
# =============================================================================

class HeliusRPC:
    """
    Helius HTTP RPC Client.

    Provides wrapped access to standard Solana RPC methods via Helius endpoints.
    Includes automatic retry logic and error handling.
    """

    def __init__(self, config: HeliusConfig):
        self.config = config
        self.session = requests.Session()
        self._request_id = 0

    def _get_request_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _make_request(self, method: str, params: List[Any] = None) -> Dict:
        """Make a JSON-RPC request with retry logic."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._get_request_id(),
            "method": method,
            "params": params or []
        }

        last_error = None
        for attempt in range(self.config.max_retries):
            try:
                response = self.session.post(
                    self.config.rpc_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=self.config.timeout
                )
                response.raise_for_status()
                result = response.json()

                if "error" in result:
                    raise RPCError(result["error"].get("message", "Unknown RPC error"),
                                   result["error"].get("code"))

                return result.get("result")

            except requests.exceptions.RequestException as e:
                last_error = e
                logger.warning(f"RPC request failed (attempt {attempt + 1}): {e}")
                if attempt < self.config.max_retries - 1:
                    time.sleep(self.config.retry_delay * (attempt + 1))

        raise ConnectionError(f"RPC request failed after {self.config.max_retries} attempts: {last_error}")

    # -------------------------------------------------------------------------
    # Account Methods
    # -------------------------------------------------------------------------

    def get_balance(self, pubkey: str, commitment: str = "confirmed") -> int:
        """Get SOL balance in lamports."""
        result = self._make_request("getBalance", [pubkey, {"commitment": commitment}])
        return result.get("value", 0)

    def get_account_info(self, pubkey: str, encoding: str = "base64",
                         commitment: str = "confirmed") -> Optional[Dict]:
        """Get account information."""
        result = self._make_request("getAccountInfo", [
            pubkey,
            {"encoding": encoding, "commitment": commitment}
        ])
        return result.get("value")

    def get_multiple_accounts(self, pubkeys: List[str], encoding: str = "base64",
                              commitment: str = "confirmed") -> List[Optional[Dict]]:
        """Get multiple account info in a single request."""
        result = self._make_request("getMultipleAccounts", [
            pubkeys,
            {"encoding": encoding, "commitment": commitment}
        ])
        return result.get("value", [])

    def get_token_accounts_by_owner(self, owner: str,
                                     mint: str = None,
                                     program_id: str = None,
                                     encoding: str = "jsonParsed") -> List[Dict]:
        """Get all token accounts for an owner."""
        filter_param = {}
        if mint:
            filter_param["mint"] = mint
        elif program_id:
            filter_param["programId"] = program_id
        else:
            filter_param["programId"] = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

        result = self._make_request("getTokenAccountsByOwner", [
            owner,
            filter_param,
            {"encoding": encoding}
        ])
        return result.get("value", [])

    def get_token_account_balance(self, account: str, commitment: str = "confirmed") -> Dict:
        """Get token account balance."""
        result = self._make_request("getTokenAccountBalance", [
            account,
            {"commitment": commitment}
        ])
        return result.get("value", {})

    # -------------------------------------------------------------------------
    # Transaction Methods
    # -------------------------------------------------------------------------

    def send_transaction(self, transaction: str,
                         skip_preflight: bool = False,
                         preflight_commitment: str = "confirmed",
                         max_retries: int = None) -> str:
        """Send a signed transaction."""
        options = {
            "skipPreflight": skip_preflight,
            "preflightCommitment": preflight_commitment,
            "encoding": "base64"
        }
        if max_retries is not None:
            options["maxRetries"] = max_retries

        return self._make_request("sendTransaction", [transaction, options])

    def get_signature_statuses(self, signatures: List[str],
                                search_transaction_history: bool = False) -> List[Optional[Dict]]:
        """Get signature statuses."""
        result = self._make_request("getSignatureStatuses", [
            signatures,
            {"searchTransactionHistory": search_transaction_history}
        ])
        return result.get("value", [])

    def get_transaction(self, signature: str, encoding: str = "json",
                        commitment: str = "confirmed",
                        max_supported_version: int = 0) -> Optional[Dict]:
        """Get transaction details."""
        return self._make_request("getTransaction", [
            signature,
            {
                "encoding": encoding,
                "commitment": commitment,
                "maxSupportedTransactionVersion": max_supported_version
            }
        ])

    def get_recent_blockhash(self, commitment: str = "confirmed") -> Dict:
        """Get recent blockhash (deprecated but still used)."""
        result = self._make_request("getRecentBlockhash", [{"commitment": commitment}])
        return result.get("value", {})

    def get_latest_blockhash(self, commitment: str = "confirmed") -> Dict:
        """Get latest blockhash."""
        result = self._make_request("getLatestBlockhash", [{"commitment": commitment}])
        return result.get("value", {})

    def get_signatures_for_address(self, address: str, limit: int = 10, before: str = None, until: str = None, commitment: str = "confirmed") -> List[Dict]:
        """Get confirmed signatures for transactions involving an address."""
        params = [address, {"limit": limit, "commitment": commitment}]
        if before:
            params[1]["before"] = before
        if until:
            params[1]["until"] = until
            
        result = self._make_request("getSignaturesForAddress", params)
        return result or []

    # -------------------------------------------------------------------------
    # Block Methods
    # -------------------------------------------------------------------------

    def get_slot(self, commitment: str = "confirmed") -> int:
        """Get current slot."""
        return self._make_request("getSlot", [{"commitment": commitment}])

    def get_block_height(self, commitment: str = "confirmed") -> int:
        """Get current block height."""
        return self._make_request("getBlockHeight", [{"commitment": commitment}])

    def get_block(self, slot: int, encoding: str = "json",
                  transaction_details: str = "full",
                  max_supported_version: int = 0) -> Optional[Dict]:
        """Get block information."""
        return self._make_request("getBlock", [
            slot,
            {
                "encoding": encoding,
                "transactionDetails": transaction_details,
                "maxSupportedTransactionVersion": max_supported_version
            }
        ])

    # -------------------------------------------------------------------------
    # Program Methods
    # -------------------------------------------------------------------------

    def get_program_accounts(self, program_id: str,
                              encoding: str = "base64",
                              filters: List[Dict] = None,
                              commitment: str = "confirmed") -> List[Dict]:
        """Get all accounts owned by a program."""
        options = {"encoding": encoding, "commitment": commitment}
        if filters:
            options["filters"] = filters

        result = self._make_request("getProgramAccounts", [program_id, options])
        return result or []

    # -------------------------------------------------------------------------
    # Utility Methods
    # -------------------------------------------------------------------------

    def get_minimum_balance_for_rent_exemption(self, data_length: int) -> int:
        """Get minimum balance for rent exemption."""
        return self._make_request("getMinimumBalanceForRentExemption", [data_length])

    def get_health(self) -> str:
        """Check RPC node health."""
        return self._make_request("getHealth")

    def get_version(self) -> Dict:
        """Get Solana version."""
        return self._make_request("getVersion")

    def simulate_transaction(self, transaction: str,
                              sig_verify: bool = False,
                              commitment: str = "confirmed") -> Dict:
        """Simulate a transaction."""
        return self._make_request("simulateTransaction", [
            transaction,
            {
                "sigVerify": sig_verify,
                "commitment": commitment,
                "encoding": "base64"
            }
        ])


class RPCError(Exception):
    """RPC error with code."""
    def __init__(self, message: str, code: int = None):
        super().__init__(message)
        self.code = code


# =============================================================================
# Helius WebSocket Client
# =============================================================================

class HeliusWebSocket:
    """
    Helius WebSocket Client for real-time subscriptions.

    Supports:
    - Account subscriptions (wallet changes, token account updates)
    - Log subscriptions (program logs, DEX activity)
    - Transaction subscriptions (signature confirmations)
    - Slot subscriptions (new slots)

    Usage:
        async with HeliusWebSocket(config) as ws:
            await ws.subscribe_account("address", callback)
            await ws.run()
    """

    def __init__(self, config: HeliusConfig):
        self.config = config
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._subscriptions: Dict[int, Dict] = {}  # subscription_id -> info
        self._pending_subscriptions: Dict[int, asyncio.Future] = {}  # request_id -> future
        self._callbacks: Dict[int, Callable] = {}  # subscription_id -> callback
        self._request_id = 0
        self._running = False
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 60.0
        self._lock = asyncio.Lock()

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    def _get_request_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def connect(self) -> None:
        """Establish WebSocket connection."""
        try:
            self.ws = await websockets.connect(
                self.config.ws_url,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5
            )
            self._reconnect_delay = 1.0
            logger.info("WebSocket connected to Helius")
        except Exception as e:
            logger.error(f"WebSocket connection failed: {e}")
            raise

    async def close(self) -> None:
        """Close WebSocket connection."""
        self._running = False
        if self.ws:
            await self.ws.close()
            self.ws = None
        logger.info("WebSocket closed")

    async def _send(self, method: str, params: List[Any]) -> int:
        """Send a WebSocket message and return request ID."""
        if not self.ws:
            raise ConnectionError("WebSocket not connected")

        request_id = self._get_request_id()
        message = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params
        }
        await self.ws.send(json.dumps(message))
        return request_id

    async def _subscribe(self, method: str, params: List[Any],
                         callback: Callable, sub_type: str) -> int:
        """Internal subscription method."""
        async with self._lock:
            request_id = await self._send(method, params)

            # Create future for subscription response
            future = asyncio.get_event_loop().create_future()
            self._pending_subscriptions[request_id] = future

        # Wait for subscription ID
        try:
            subscription_id = await asyncio.wait_for(future, timeout=30.0)
            self._subscriptions[subscription_id] = {
                "type": sub_type,
                "params": params,
                "method": method
            }
            self._callbacks[subscription_id] = callback
            logger.info(f"Subscribed: {sub_type} (ID: {subscription_id})")
            return subscription_id
        except asyncio.TimeoutError:
            raise TimeoutError(f"Subscription timeout for {method}")

    # -------------------------------------------------------------------------
    # Subscription Methods
    # -------------------------------------------------------------------------

    async def subscribe_account(self, pubkey: str, callback: Callable,
                                 encoding: str = "jsonParsed",
                                 commitment: str = "confirmed") -> int:
        """
        Subscribe to account changes.

        Callback receives: {"pubkey": str, "account": {...}, "slot": int}
        """
        return await self._subscribe(
            "accountSubscribe",
            [pubkey, {"encoding": encoding, "commitment": commitment}],
            callback,
            f"account:{pubkey[:8]}..."
        )

    async def subscribe_logs(self, callback: Callable,
                              filter_type: str = "all",
                              mentions: List[str] = None,
                              commitment: str = "confirmed") -> int:
        """
        Subscribe to transaction logs.

        filter_type: "all" | "allWithVotes" | {"mentions": [addresses]}
        Callback receives: {"signature": str, "logs": [...], "err": ...}
        """
        if mentions:
            filter_param = {"mentions": mentions}
        else:
            filter_param = filter_type

        return await self._subscribe(
            "logsSubscribe",
            [filter_param, {"commitment": commitment}],
            callback,
            f"logs:{filter_type if not mentions else mentions[0][:8]}..."
        )

    async def subscribe_program(self, program_id: str, callback: Callable,
                                 encoding: str = "base64",
                                 filters: List[Dict] = None,
                                 commitment: str = "confirmed") -> int:
        """
        Subscribe to program account changes.

        Callback receives: {"pubkey": str, "account": {...}, "slot": int}
        """
        params = [program_id, {"encoding": encoding, "commitment": commitment}]
        if filters:
            params[1]["filters"] = filters

        return await self._subscribe(
            "programSubscribe",
            params,
            callback,
            f"program:{program_id[:8]}..."
        )

    async def subscribe_signature(self, signature: str, callback: Callable,
                                   commitment: str = "confirmed") -> int:
        """
        Subscribe to signature confirmation.

        Callback receives: {"err": null/error} when confirmed
        Note: Subscription is automatically removed after notification
        """
        return await self._subscribe(
            "signatureSubscribe",
            [signature, {"commitment": commitment}],
            callback,
            f"signature:{signature[:8]}..."
        )

    async def subscribe_slot(self, callback: Callable) -> int:
        """
        Subscribe to slot updates.

        Callback receives: {"slot": int, "parent": int, "root": int}
        """
        return await self._subscribe(
            "slotSubscribe",
            [],
            callback,
            "slot"
        )

    async def subscribe_root(self, callback: Callable) -> int:
        """
        Subscribe to root slot updates.

        Callback receives: int (root slot number)
        """
        return await self._subscribe(
            "rootSubscribe",
            [],
            callback,
            "root"
        )

    async def unsubscribe(self, subscription_id: int, method: str = None) -> bool:
        """Unsubscribe from a subscription."""
        if subscription_id not in self._subscriptions:
            return False

        sub_info = self._subscriptions[subscription_id]
        unsub_method = method or sub_info["method"].replace("Subscribe", "Unsubscribe")

        request_id = await self._send(unsub_method, [subscription_id])

        # Clean up
        del self._subscriptions[subscription_id]
        if subscription_id in self._callbacks:
            del self._callbacks[subscription_id]

        logger.info(f"Unsubscribed: {subscription_id}")
        return True

    # -------------------------------------------------------------------------
    # Message Processing
    # -------------------------------------------------------------------------

    async def _handle_message(self, message: str) -> None:
        """Process incoming WebSocket message."""
        try:
            # logger.info(f"WS Recv: {message[:200]}") 
            data = json.loads(message)

            # Handle subscription response
            if "id" in data and "result" in data:
                request_id = data["id"]
                if request_id in self._pending_subscriptions:
                    future = self._pending_subscriptions.pop(request_id)
                    if not future.done():
                        future.set_result(data["result"])
                return

            # Handle subscription notification
            if "method" in data and data["method"].endswith("Notification"):
                print(f"DEBUG: WS Notification: {data['method']} for sub {data.get('params', {}).get('subscription')}")
                await self._handle_notification(data)
                return

            # Handle errors
            if "error" in data:
                logger.error(f"WebSocket error: {data['error']}")
                request_id = data.get("id")
                if request_id in self._pending_subscriptions:
                    future = self._pending_subscriptions.pop(request_id)
                    if not future.done():
                        future.set_exception(RPCError(data["error"].get("message", "Unknown")))

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse WebSocket message: {e}")

    async def _handle_notification(self, data: Dict) -> None:
        """Process subscription notification."""
        params = data.get("params", {})
        subscription_id = params.get("subscription")
        result = params.get("result", {})
        
        # logger.info(f"🔔 Notification for sub {subscription_id}")

        if subscription_id in self._callbacks:
            callback = self._callbacks[subscription_id]
            try:
                # Check if callback is async
                if asyncio.iscoroutinefunction(callback):
                    await callback(result)
                else:
                    callback(result)
            except Exception as e:
                logger.error(f"Callback error for subscription {subscription_id}: {e}")

        # Auto-remove signature subscriptions after notification
        sub_info = self._subscriptions.get(subscription_id, {})
        if sub_info.get("method") == "signatureSubscribe":
            await self.unsubscribe(subscription_id)

    # -------------------------------------------------------------------------
    # Run Loop
    # -------------------------------------------------------------------------

    async def run(self, reconnect: bool = True) -> None:
        """
        Main WebSocket event loop.

        Processes messages and handles reconnection.
        """
        self._running = True
        
        while self._running:
            try:
                if not self.ws or self.ws.closed:
                    if reconnect:
                        await self._reconnect()
                    else:
                        break

                # logger.info("Waiting for message...")
                message = await self.ws.recv()
                await self._handle_message(message)

            except ConnectionClosed as e:
                logger.warning(f"WebSocket connection closed: {e}")
                if reconnect and self._running:
                    await self._reconnect()
                else:
                    break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                if reconnect and self._running:
                    await asyncio.sleep(1)
                else:
                    break

    async def _reconnect(self) -> None:
        """Reconnect with exponential backoff."""
        logger.info(f"Reconnecting in {self._reconnect_delay}s...")
        await asyncio.sleep(self._reconnect_delay)

        try:
            await self.connect()

            # Resubscribe to all active subscriptions
            for sub_id, sub_info in list(self._subscriptions.items()):
                callback = self._callbacks.get(sub_id)
                if callback:
                    try:
                        new_id = await self._subscribe(
                            sub_info["method"],
                            sub_info["params"],
                            callback,
                            sub_info["type"]
                        )
                        # Update subscription ID
                        if new_id != sub_id:
                            del self._subscriptions[sub_id]
                            del self._callbacks[sub_id]
                    except Exception as e:
                        logger.error(f"Failed to resubscribe: {e}")

            self._reconnect_delay = 1.0

        except Exception as e:
            logger.error(f"Reconnection failed: {e}")
            self._reconnect_delay = min(
                self._reconnect_delay * 2,
                self._max_reconnect_delay
            )


# =============================================================================
# Helius DAS (Digital Asset Standard) API
# =============================================================================

class HeliusDAS:
    """
    Helius Digital Asset Standard API Client.

    Provides access to enhanced token/NFT metadata and search capabilities.
    """

    def __init__(self, config: HeliusConfig):
        self.config = config
        self.session = requests.Session()
        self._request_id = 0

    def _get_request_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _make_request(self, method: str, params: Dict) -> Any:
        """Make a DAS API request."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._get_request_id(),
            "method": method,
            "params": params
        }

        for attempt in range(self.config.max_retries):
            try:
                response = self.session.post(
                    self.config.das_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=self.config.timeout
                )
                response.raise_for_status()
                result = response.json()

                if "error" in result:
                    raise RPCError(result["error"].get("message", "Unknown DAS error"),
                                   result["error"].get("code"))

                return result.get("result")

            except requests.exceptions.RequestException as e:
                logger.warning(f"DAS request failed (attempt {attempt + 1}): {e}")
                if attempt < self.config.max_retries - 1:
                    time.sleep(self.config.retry_delay * (attempt + 1))

        raise ConnectionError(f"DAS request failed after {self.config.max_retries} attempts")

    # -------------------------------------------------------------------------
    # Asset Methods
    # -------------------------------------------------------------------------

    def get_asset(self, asset_id: str, display_options: Dict = None) -> Dict:
        """
        Get detailed information about a single asset (token/NFT).

        Returns: Token metadata, ownership, royalties, compression status, etc.
        """
        params = {"id": asset_id}
        if display_options:
            params["displayOptions"] = display_options
        return self._make_request("getAsset", params)

    def get_asset_batch(self, asset_ids: List[str], display_options: Dict = None) -> List[Dict]:
        """
        Get information about multiple assets in a single request.

        Max: 1000 assets per request.
        """
        params = {"ids": asset_ids}
        if display_options:
            params["displayOptions"] = display_options
        return self._make_request("getAssetBatch", params)

    def get_assets_by_owner(self, owner: str,
                            page: int = 1,
                            limit: int = 1000,
                            sort_by: Dict = None,
                            display_options: Dict = None) -> Dict:
        """
        Get all assets owned by an address.

        Returns: {total, limit, page, items: [...]}
        """
        params = {
            "ownerAddress": owner,
            "page": page,
            "limit": limit
        }
        if sort_by:
            params["sortBy"] = sort_by
        if display_options:
            params["displayOptions"] = display_options
        return self._make_request("getAssetsByOwner", params)

    def get_assets_by_group(self, group_key: str, group_value: str,
                            page: int = 1,
                            limit: int = 1000,
                            sort_by: Dict = None) -> Dict:
        """
        Get assets by group (e.g., collection).

        group_key: "collection" | "creator" | etc.
        """
        params = {
            "groupKey": group_key,
            "groupValue": group_value,
            "page": page,
            "limit": limit
        }
        if sort_by:
            params["sortBy"] = sort_by
        return self._make_request("getAssetsByGroup", params)

    def get_assets_by_creator(self, creator: str,
                               only_verified: bool = False,
                               page: int = 1,
                               limit: int = 1000) -> Dict:
        """Get assets by creator address."""
        params = {
            "creatorAddress": creator,
            "onlyVerified": only_verified,
            "page": page,
            "limit": limit
        }
        return self._make_request("getAssetsByCreator", params)

    def get_assets_by_authority(self, authority: str,
                                 page: int = 1,
                                 limit: int = 1000) -> Dict:
        """Get assets by authority address."""
        params = {
            "authorityAddress": authority,
            "page": page,
            "limit": limit
        }
        return self._make_request("getAssetsByAuthority", params)

    # -------------------------------------------------------------------------
    # Search Methods
    # -------------------------------------------------------------------------

    def search_assets(self,
                      owner: str = None,
                      creator: str = None,
                      collection: str = None,
                      delegate: str = None,
                      burnt: bool = False,
                      compressed: bool = None,
                      fungible: bool = None,
                      supply_mint: str = None,
                      frozen: bool = None,
                      interface: str = None,
                      token_type: str = None,
                      page: int = 1,
                      limit: int = 1000,
                      sort_by: Dict = None) -> Dict:
        """
        Search assets with multiple filters.

        interface: "V1_NFT" | "V1_PRINT" | "LEGACY_NFT" | "V2_NFT" | "FungibleAsset" | "FungibleToken"
        token_type: "fungible" | "nonFungible" | "regularNft" | "compressedNft" | "all"
        """
        params = {"page": page, "limit": limit}

        if owner:
            params["ownerAddress"] = owner
        if creator:
            params["creatorAddress"] = creator
        if collection:
            params["grouping"] = [["collection", collection]]
        if delegate:
            params["delegate"] = delegate
        if burnt:
            params["burnt"] = burnt
        if compressed is not None:
            params["compressed"] = compressed
        if fungible is not None:
            params["fungible"] = fungible
        if supply_mint:
            params["supplyMint"] = supply_mint
        if frozen is not None:
            params["frozen"] = frozen
        if interface:
            params["interface"] = interface
        if token_type:
            params["tokenType"] = token_type
        if sort_by:
            params["sortBy"] = sort_by

        return self._make_request("searchAssets", params)

    # -------------------------------------------------------------------------
    # Proof Methods (for Compressed NFTs)
    # -------------------------------------------------------------------------

    def get_asset_proof(self, asset_id: str) -> Dict:
        """Get merkle proof for a compressed NFT."""
        return self._make_request("getAssetProof", {"id": asset_id})

    def get_asset_proofs(self, asset_ids: List[str]) -> Dict:
        """Get merkle proofs for multiple compressed NFTs."""
        return self._make_request("getAssetProofBatch", {"ids": asset_ids})

    # -------------------------------------------------------------------------
    # Signature Methods
    # -------------------------------------------------------------------------

    def get_signatures_for_asset(self, asset_id: str,
                                  page: int = 1,
                                  limit: int = 1000,
                                  sort_direction: str = "desc",
                                  before: str = None,
                                  after: str = None) -> Dict:
        """Get transaction signatures for an asset."""
        params = {
            "id": asset_id,
            "page": page,
            "limit": limit,
            "sortDirection": sort_direction
        }
        if before:
            params["before"] = before
        if after:
            params["after"] = after
        return self._make_request("getSignaturesForAsset", params)

    # -------------------------------------------------------------------------
    # Token Methods
    # -------------------------------------------------------------------------

    def get_token_accounts(self, owner: str = None,
                           mint: str = None,
                           page: int = 1,
                           limit: int = 1000) -> Dict:
        """Get token accounts by owner or mint."""
        params = {"page": page, "limit": limit}
        if owner:
            params["owner"] = owner
        if mint:
            params["mint"] = mint
        return self._make_request("getTokenAccounts", params)

    # -------------------------------------------------------------------------
    # Utility Methods
    # -------------------------------------------------------------------------

    def get_fungible_tokens(self, owner: str, page: int = 1, limit: int = 1000) -> List[Dict]:
        """
        Get all fungible tokens for an owner with metadata.

        Convenience method that filters for fungible tokens.
        """
        result = self.search_assets(
            owner=owner,
            token_type="fungible",
            page=page,
            limit=limit
        )
        return result.get("items", [])

    def get_nfts(self, owner: str, page: int = 1, limit: int = 1000) -> List[Dict]:
        """
        Get all NFTs for an owner.

        Convenience method that filters for non-fungible tokens.
        """
        result = self.search_assets(
            owner=owner,
            token_type="nonFungible",
            page=page,
            limit=limit
        )
        return result.get("items", [])


# =============================================================================
# Unified Helius Client
# =============================================================================

class HeliusClient:
    """
    Unified Helius API Client.

    Provides access to all Helius services:
    - rpc: Standard Solana RPC methods
    - ws: WebSocket subscriptions
    - das: Digital Asset Standard API

    Usage:
        client = HeliusClient()

        # RPC
        balance = client.rpc.get_balance("address")

        # DAS
        assets = client.das.get_assets_by_owner("address")

        # WebSocket (async)
        async with client.websocket() as ws:
            await ws.subscribe_account("address", callback)
            await ws.run()
    """

    def __init__(self, api_key: str = None, network: str = "mainnet"):
        self.config = HeliusConfig(
            api_key=api_key or os.getenv("HELIUS_API_KEY", ""),
            network=network
        )
        self._rpc: Optional[HeliusRPC] = None
        self._das: Optional[HeliusDAS] = None

    @property
    def rpc(self) -> HeliusRPC:
        """Get RPC client (lazy initialization)."""
        if self._rpc is None:
            self._rpc = HeliusRPC(self.config)
        return self._rpc

    @property
    def das(self) -> HeliusDAS:
        """Get DAS client (lazy initialization)."""
        if self._das is None:
            self._das = HeliusDAS(self.config)
        return self._das

    def websocket(self) -> HeliusWebSocket:
        """
        Create a new WebSocket client.

        Returns a context manager for use with async with.
        """
        return HeliusWebSocket(self.config)

    # -------------------------------------------------------------------------
    # Convenience Methods
    # -------------------------------------------------------------------------

    def get_portfolio(self, owner: str) -> Dict:
        """
        Get complete portfolio for an address.

        Returns: {
            "sol_balance": float,
            "tokens": [...],
            "nfts": [...]
        }
        """
        sol_balance = self.rpc.get_balance(owner) / 1e9

        # Get all assets
        assets = self.das.get_assets_by_owner(owner, limit=1000)

        tokens = []
        nfts = []

        for item in assets.get("items", []):
            interface = item.get("interface", "")
            if interface in ("FungibleToken", "FungibleAsset"):
                tokens.append(item)
            else:
                nfts.append(item)

        return {
            "sol_balance": sol_balance,
            "tokens": tokens,
            "nfts": nfts,
            "total_assets": assets.get("total", 0)
        }

    def get_token_price(self, mint: str) -> Optional[float]:
        """
        Get token price from DAS metadata.

        Note: Price availability depends on token and Helius pricing data.
        """
        try:
            asset = self.das.get_asset(mint)
            token_info = asset.get("token_info", {})
            return token_info.get("price_info", {}).get("price_per_token")
        except Exception:
            return None

    def get_token_prices(self, mints: List[str]) -> Dict[str, Optional[float]]:
        """Get prices for multiple tokens."""
        prices = {}
        try:
            assets = self.das.get_asset_batch(mints)
            for asset in assets:
                mint = asset.get("id")
                token_info = asset.get("token_info", {})
                price = token_info.get("price_info", {}).get("price_per_token")
                prices[mint] = price
        except Exception as e:
            logger.error(f"Failed to get token prices: {e}")
        return prices


# =============================================================================
# Preset Program Addresses
# =============================================================================

class Programs:
    """Common Solana program addresses for subscriptions."""

    # DEX Programs
    RAYDIUM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
    RAYDIUM_CLMM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK"
    RAYDIUM_CP = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
    ORCA_WHIRLPOOL = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
    JUPITER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
    METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
    PUMP_FUN = "61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH"
    PHOENIX = "PhoeNiXNJdyduccm4GqvbeHkCrxy2m1K9Dk6Sshn6No"
    LIFINITY = "Eew6XJvQp2fWJFsSkmD7pEeYndfcS2JvksfbaS9df2To"

    # Token Programs
    TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"

    # System Programs
    SYSTEM_PROGRAM = "11111111111111111111111111111111"
    COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111"

    # Pyth Oracle
    PYTH_ORACLE = "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"


class Tokens:
    """Common Solana token mint addresses."""

    SOL = "So11111111111111111111111111111111111111112"
    USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
    JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
    RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"
    BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
    WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"


# =============================================================================
# Example Usage & Testing
# =============================================================================

if __name__ == "__main__":
    import asyncio

    print("=" * 60)
    print("Helius Infrastructure Test")
    print("=" * 60)

    # Initialize client
    client = HeliusClient()

    # Test RPC
    print("\n[RPC] Testing basic RPC calls...")
    try:
        slot = client.rpc.get_slot()
        print(f"  Current slot: {slot}")

        version = client.rpc.get_version()
        print(f"  Solana version: {version.get('solana-core', 'unknown')}")
    except Exception as e:
        print(f"  RPC Error: {e}")

    # Test DAS
    print("\n[DAS] Testing Digital Asset Standard API...")
    try:
        # Get SOL token info
        sol_asset = client.das.get_asset(Tokens.SOL)
        print(f"  SOL Token: {sol_asset.get('content', {}).get('metadata', {}).get('name', 'N/A')}")

        # Get token price
        token_info = sol_asset.get("token_info", {})
        price = token_info.get("price_info", {}).get("price_per_token")
        if price:
            print(f"  SOL Price: ${price:.2f}")
    except Exception as e:
        print(f"  DAS Error: {e}")

    # Test WebSocket (brief)
    print("\n[WebSocket] Testing WebSocket connection...")

    async def test_websocket():
        slot_received = asyncio.Event()

        def on_slot(data):
            print(f"  Slot update: {data.get('slot', 'N/A')}")
            slot_received.set()

        try:
            async with client.websocket() as ws:
                await ws.subscribe_slot(on_slot)

                # Wait for one slot update or timeout
                try:
                    await asyncio.wait_for(slot_received.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    print("  WebSocket timeout (no slot update in 5s)")

                print("  WebSocket connection successful!")
        except Exception as e:
            print(f"  WebSocket Error: {e}")

    asyncio.run(test_websocket())

    print("\n" + "=" * 60)
    print("Test complete!")
    print("=" * 60)
