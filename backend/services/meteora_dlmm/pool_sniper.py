#!/usr/bin/env python3
"""
Meteora DLMM Pool Sniper Engine
Monitors for new DLMM pool creation and optionally auto-creates positions.
"""

import time
import logging
import threading
import requests
from typing import Optional, Dict, List, Callable
from datetime import datetime
import sio_bridge

logger = logging.getLogger("tactix.dlmm.sniper")

# Meteora DLMM Program ID and Authority
METEORA_DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
POLL_INTERVAL = 5  # seconds


class DLMMPoolSniper:
    """
    Pool sniper engine that monitors for new Meteora DLMM pool creation.
    Detection-only by default. Auto-create position is disabled.
    """

    def __init__(
        self,
        db,
        helius_api_key: str,
        position_manager=None,
        on_pool_detected: Optional[Callable] = None
    ):
        self.db = db
        self.helius_api_key = helius_api_key
        self.position_manager = position_manager
        self.on_pool_detected = on_pool_detected

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_signature: Optional[str] = None
        self._processed_signatures: set = set()

    def start(self):
        """Start the sniper engine.

        Ensures the DB settings 'enabled' flag is set so the poll loop
        doesn't immediately stop itself on the first iteration.
        """
        if self._running:
            logger.warning("[DLMM Sniper] Already running")
            return

        # Sync DB enabled flag — the user explicitly asked to start
        try:
            self.db.update_dlmm_sniper_settings({'enabled': True})
        except Exception:
            pass

        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("[DLMM Sniper] Started monitoring for new pools")

    def stop(self):
        """Stop the sniper engine."""
        self._running = False

        try:
            self.db.update_dlmm_sniper_settings({'enabled': False})
        except Exception:
            pass

        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None
        logger.info("[DLMM Sniper] Stopped")

    def restart(self):
        """Restart the sniper engine (useful after settings change)."""
        self.stop()
        self.start()

    def is_running(self) -> bool:
        """Check if sniper is running."""
        return self._running

    def _poll_loop(self):
        """Main polling loop to check for new pool transactions."""
        while self._running:
            try:
                settings = self.db.get_dlmm_sniper_settings()

                if not settings.get('enabled', False):
                    logger.info("[DLMM Sniper] Disabled, stopping loop")
                    self._running = False
                    break

                self._check_for_new_pools(settings)

            except Exception as e:
                logger.error(f"[DLMM Sniper] Poll error: {e}")

            time.sleep(POLL_INTERVAL)

    def _check_for_new_pools(self, settings: Dict):
        """Check for new pool creation transactions."""
        try:
            # Get recent signatures for Meteora DLMM program
            signatures = self._get_recent_signatures()

            for sig_info in signatures:
                signature = sig_info.get('signature')

                # Skip if already processed
                if signature in self._processed_signatures:
                    continue

                self._processed_signatures.add(signature)

                # Limit set size
                if len(self._processed_signatures) > 1000:
                    self._processed_signatures = set(list(self._processed_signatures)[-500:])

                # Analyze transaction
                pool_data = self._analyze_transaction(signature)

                if pool_data:
                    # Apply filters
                    if self._passes_filters(pool_data, settings):
                        self._handle_new_pool(pool_data, settings)

        except Exception as e:
            logger.error(f"[DLMM Sniper] Check error: {e}")

    def _get_recent_signatures(self) -> List[Dict]:
        """Get recent signatures for the Meteora DLMM program."""
        url = f"https://api.helius.xyz/v0/addresses/{METEORA_DLMM_PROGRAM}/transactions"
        params = {
            'api-key': self.helius_api_key,
            'limit': 20
        }

        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[DLMM Sniper] Failed to fetch signatures: {e}")
            return []

    def _analyze_transaction(self, signature: str) -> Optional[Dict]:
        """
        Analyze a transaction to check if it's a pool initialization.
        Returns pool data if it's a new pool, None otherwise.
        """
        url = f"https://api.helius.xyz/v0/transactions"
        params = {
            'api-key': self.helius_api_key,
            'transactions': [signature]
        }

        try:
            response = requests.post(url, json={'transactions': [signature]}, params={'api-key': self.helius_api_key}, timeout=15)
            response.raise_for_status()
            txns = response.json()

            if not txns:
                return None

            tx = txns[0]

            # Check if this is a pool initialization
            # Look for "initialize" in the description or specific instruction patterns
            description = tx.get('description', '').lower()
            tx_type = tx.get('type', '')

            if 'initialize' not in description and tx_type != 'UNKNOWN':
                return None

            # Parse account keys to find pool address
            account_data = tx.get('accountData', [])
            instructions = tx.get('instructions', [])

            # Try to extract pool info from native transfers or token transfers
            pool_address = None
            token_x_mint = None
            token_y_mint = None

            # Look for the created account (pool)
            for inst in instructions:
                program_id = inst.get('programId', '')
                if program_id == METEORA_DLMM_PROGRAM:
                    accounts = inst.get('accounts', [])
                    if len(accounts) >= 3:
                        # Typically: pool, tokenX mint, tokenY mint
                        pool_address = accounts[0]
                        if len(accounts) > 1:
                            token_x_mint = accounts[1] if len(accounts) > 1 else None
                            token_y_mint = accounts[2] if len(accounts) > 2 else None
                        break

            # Also check token transfers for mints
            token_transfers = tx.get('tokenTransfers', [])
            mints_found = set()
            for transfer in token_transfers:
                mint = transfer.get('mint')
                if mint:
                    mints_found.add(mint)

            if len(mints_found) >= 2:
                mints_list = list(mints_found)
                token_x_mint = token_x_mint or mints_list[0]
                token_y_mint = token_y_mint or mints_list[1] if len(mints_list) > 1 else None

            if not pool_address:
                return None

            # Try to get more pool info from Meteora API
            pool_info = self._fetch_pool_info(pool_address)

            return {
                'pool_address': pool_address,
                'token_x_mint': token_x_mint,
                'token_y_mint': token_y_mint,
                'token_x_symbol': pool_info.get('token_x_symbol') if pool_info else None,
                'token_y_symbol': pool_info.get('token_y_symbol') if pool_info else None,
                'bin_step': pool_info.get('bin_step') if pool_info else None,
                'base_fee_bps': pool_info.get('base_fee_bps') if pool_info else None,
                'initial_price': pool_info.get('price') if pool_info else None,
                'detected_signature': signature,
                'status': 'detected'
            }

        except Exception as e:
            logger.error(f"[DLMM Sniper] Failed to analyze tx {signature}: {e}")
            return None

    def _fetch_pool_info(self, pool_address: str) -> Optional[Dict]:
        """Fetch pool info from Meteora API."""
        try:
            response = requests.get(
                f"https://dlmm-api.meteora.ag/pair/{pool_address}",
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                name = data.get('name', '')
                tokens = name.split('-') if name else ['', '']

                return {
                    'token_x_symbol': tokens[0] if len(tokens) > 0 else None,
                    'token_y_symbol': tokens[1] if len(tokens) > 1 else None,
                    'bin_step': data.get('bin_step'),
                    'base_fee_bps': int(data.get('base_fee_percentage', 0) * 100),
                    'price': data.get('current_price')
                }
        except Exception as e:
            logger.debug(f"[DLMM Sniper] Could not fetch pool info: {e}")
        return None

    def _passes_filters(self, pool_data: Dict, settings: Dict) -> bool:
        """Check if pool passes configured filters."""
        bin_step = pool_data.get('bin_step')

        if bin_step is not None:
            min_step = settings.get('min_bin_step', 1)
            max_step = settings.get('max_bin_step', 100)

            if bin_step < min_step or bin_step > max_step:
                logger.debug(f"[DLMM Sniper] Pool filtered: bin_step {bin_step} not in [{min_step}, {max_step}]")
                return False

            # Risk profile filter
            risk_filter = settings.get('risk_profile_filter', 'all')
            if risk_filter != 'all':
                pool_risk = self._get_risk_from_bin_step(bin_step)
                if pool_risk != risk_filter:
                    logger.debug(f"[DLMM Sniper] Pool filtered: risk {pool_risk} != {risk_filter}")
                    return False

        return True

    def _get_risk_from_bin_step(self, bin_step: int) -> str:
        """Determine risk profile based on bin step."""
        if bin_step <= 10:
            return 'high'
        elif bin_step <= 50:
            return 'medium'
        return 'low'

    def _handle_new_pool(self, pool_data: Dict, settings: Dict):
        """Handle a newly detected pool."""
        try:
            # Save to database
            self.db.save_dlmm_sniped_pool(pool_data)

            # Broadcast via Socket.IO
            sio_bridge.emit('dlmm_pool_detected', pool_data, namespace='/dlmm')

            logger.info(f"[DLMM Sniper] New pool detected: {pool_data['pool_address']}")

            # Call custom callback if provided
            if self.on_pool_detected:
                self.on_pool_detected(pool_data)

            # Auto-create position if enabled (DISABLED BY DEFAULT)
            if settings.get('auto_create_position', False):
                self._auto_create_position(pool_data, settings)

        except Exception as e:
            logger.error(f"[DLMM Sniper] Handle pool error: {e}")

    def _auto_create_position(self, pool_data: Dict, settings: Dict):
        """
        Auto-create a position in the new pool.
        WARNING: This is disabled by default and requires server wallet.
        """
        if not self.position_manager:
            logger.warning("[DLMM Sniper] No position manager, cannot auto-create")
            return

        # Check max positions limit
        # This would require checking current active positions
        max_positions = settings.get('max_positions', 5)

        # Get default strategy settings
        strategy_type = settings.get('default_strategy_type', 'spot')
        deposit_sol = settings.get('deposit_amount_sol', 0.1)

        logger.info(f"[DLMM Sniper] Auto-create position in {pool_data['pool_address']} (SOL: {deposit_sol})")

        # Note: Auto-create would need server wallet integration
        # This is intentionally not fully implemented for safety
        logger.warning("[DLMM Sniper] Auto-create is not implemented - detection only mode")


# Singleton instance (initialized in app.py)
dlmm_sniper: Optional[DLMMPoolSniper] = None


def init_dlmm_sniper(db, helius_api_key: str, position_manager=None) -> DLMMPoolSniper:
    """Initialize the DLMM pool sniper."""
    global dlmm_sniper
    dlmm_sniper = DLMMPoolSniper(db, helius_api_key, position_manager)
    return dlmm_sniper


def get_dlmm_sniper() -> Optional[DLMMPoolSniper]:
    """Get the DLMM pool sniper instance."""
    return dlmm_sniper
