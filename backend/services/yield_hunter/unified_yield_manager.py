#!/usr/bin/env python3
"""
Unified Yield Manager
Protocol-agnostic wrapper for yield operations across Kamino, Jupiter Lend, Loopscale, and HyLo.
"""

import logging
import time
import requests
from typing import Optional, Dict, List, Any, Literal
from dataclasses import dataclass, asdict
from enum import Enum

from .yield_aggregator import YieldOpportunity, get_all_opportunities, get_opportunities_by_protocol
from .jupiter_lend import build_jupiter_lend_deposit_ix, build_jupiter_lend_withdraw_ix
from .loopscale import build_loopscale_deposit_ix, build_loopscale_withdraw_ix

logger = logging.getLogger("tactix.yield")

YieldProtocol = Literal['kamino', 'jupiter_lend', 'loopscale', 'hylo']

# Sidecar URLs
KAMINO_SIDECAR_URL = "http://127.0.0.1:5004"
HYLO_SIDECAR_URL = "http://127.0.0.1:5005"


class YieldAction(Enum):
    DEPOSIT = 'deposit'
    WITHDRAW = 'withdraw'
    CLAIM_REWARDS = 'claim_rewards'


@dataclass
class YieldPosition:
    """User's position in a yield protocol."""
    id: Optional[int]
    protocol: YieldProtocol
    vault_address: str
    vault_name: str
    user_wallet: str
    deposit_token: str
    deposit_symbol: str
    deposited_amount: float
    current_value: float
    shares: float
    entry_apy: float
    current_apy: float
    rewards_earned: float
    risk_level: str
    status: str  # 'active', 'withdrawn', 'pending'
    created_at: float
    last_updated: float
    tx_signature: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class UnifiedYieldManager:
    """
    Protocol-agnostic yield manager.
    Routes operations to appropriate protocol handlers.
    """

    SUPPORTED_PROTOCOLS = ['kamino', 'jupiter_lend', 'loopscale', 'hylo']

    def __init__(self, db_connection=None):
        """
        Initialize the unified yield manager.

        Args:
            db_connection: Optional database connection for position tracking
        """
        self.db = db_connection
        self._sidecar_status = {
            'kamino': None,
            'hylo': None
        }

    def check_sidecar_health(self, protocol: str) -> bool:
        """Check if a protocol's sidecar is running."""
        if protocol == 'kamino':
            url = f"{KAMINO_SIDECAR_URL}/health"
        elif protocol == 'hylo':
            url = f"{HYLO_SIDECAR_URL}/health"
        else:
            return True  # No sidecar needed

        try:
            response = requests.get(url, timeout=2)
            self._sidecar_status[protocol] = response.status_code == 200
            return self._sidecar_status[protocol]
        except:
            self._sidecar_status[protocol] = False
            return False

    def get_protocol_status(self) -> Dict[str, Dict]:
        """Get status of all protocols."""
        status = {}
        for protocol in self.SUPPORTED_PROTOCOLS:
            if protocol in ['kamino', 'hylo']:
                healthy = self.check_sidecar_health(protocol)
                status[protocol] = {
                    'available': healthy,
                    'requires_sidecar': True,
                    'sidecar_running': healthy
                }
            else:
                status[protocol] = {
                    'available': True,
                    'requires_sidecar': False,
                    'sidecar_running': None
                }
        return status

    def get_opportunities(
        self,
        protocol_filter: Optional[str] = None,
        risk_filter: Optional[str] = None,
        min_apy: Optional[float] = None,
        min_tvl: Optional[float] = None,
        deposit_symbol_filter: Optional[str] = None
    ) -> List[YieldOpportunity]:
        """
        Get yield opportunities with advanced filtering.

        Args:
            protocol_filter: Filter by protocol name
            risk_filter: Filter by risk level ('low', 'medium', 'high')
            min_apy: Minimum APY percentage
            min_tvl: Minimum TVL in USD
            deposit_symbol_filter: Filter by deposit token symbol

        Returns:
            List of YieldOpportunity objects
        """
        opportunities = get_all_opportunities(
            risk_filter=risk_filter,
            protocol_filter=protocol_filter
        )

        # Apply additional filters
        if min_apy is not None:
            opportunities = [o for o in opportunities if o.apy >= min_apy]

        if min_tvl is not None:
            opportunities = [o for o in opportunities if o.tvl >= min_tvl]

        if deposit_symbol_filter:
            filter_upper = deposit_symbol_filter.upper()
            opportunities = [
                o for o in opportunities
                if filter_upper in o.deposit_symbol.upper()
            ]

        return opportunities

    def build_deposit_tx(
        self,
        protocol: YieldProtocol,
        vault_address: str,
        amount: float,
        user_wallet: str,
        deposit_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Build an unsigned deposit transaction for any protocol.

        Args:
            protocol: Protocol name ('kamino', 'jupiter_lend', 'loopscale', 'hylo')
            vault_address: Vault or pool address
            amount: Amount to deposit in token units
            user_wallet: User's wallet public key
            deposit_token: Token mint address (required for some protocols)

        Returns:
            Dict with transaction data or error
        """
        try:
            if protocol == 'jupiter_lend':
                return self._build_jupiter_lend_deposit(vault_address, amount, user_wallet)

            elif protocol == 'loopscale':
                return self._build_loopscale_deposit(vault_address, amount, user_wallet)

            elif protocol == 'kamino':
                return self._build_kamino_deposit(vault_address, amount, user_wallet, deposit_token)

            elif protocol == 'hylo':
                return self._build_hylo_deposit(vault_address, amount, user_wallet, deposit_token)

            else:
                return {'success': False, 'error': f'Unsupported protocol: {protocol}'}

        except Exception as e:
            logger.error(f"[UnifiedYield] Build deposit error for {protocol}: {e}")
            return {'success': False, 'error': str(e)}

    def build_withdraw_tx(
        self,
        protocol: YieldProtocol,
        vault_address: str,
        amount: float,
        user_wallet: str,
        shares: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Build an unsigned withdraw transaction for any protocol.

        Args:
            protocol: Protocol name
            vault_address: Vault or pool address
            amount: Amount to withdraw (or shares for share-based protocols)
            user_wallet: User's wallet public key
            shares: Explicit share amount if different from amount

        Returns:
            Dict with transaction data or error
        """
        try:
            if protocol == 'jupiter_lend':
                return self._build_jupiter_lend_withdraw(vault_address, amount, user_wallet)

            elif protocol == 'loopscale':
                return self._build_loopscale_withdraw(vault_address, shares or amount, user_wallet)

            elif protocol == 'kamino':
                return self._build_kamino_withdraw(vault_address, shares or amount, user_wallet)

            elif protocol == 'hylo':
                return self._build_hylo_withdraw(vault_address, amount, user_wallet)

            else:
                return {'success': False, 'error': f'Unsupported protocol: {protocol}'}

        except Exception as e:
            logger.error(f"[UnifiedYield] Build withdraw error for {protocol}: {e}")
            return {'success': False, 'error': str(e)}

    # === Jupiter Lend ===

    def _build_jupiter_lend_deposit(
        self,
        mint: str,
        amount: float,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Build Jupiter Lend deposit transaction."""
        # Jupiter Lend uses token mint as the vault identifier
        # Convert amount to smallest units (assume 6 decimals for most tokens)
        decimals = 9 if mint == 'So11111111111111111111111111111111111111112' else 6
        amount_raw = int(amount * (10 ** decimals))

        result = build_jupiter_lend_deposit_ix(mint, amount_raw, user_wallet)

        if result and 'transaction' in result:
            return {
                'success': True,
                'protocol': 'jupiter_lend',
                'transaction': result.get('transaction'),
                'message': result.get('message'),
                'vault_address': mint,
                'amount': amount,
                'amount_raw': amount_raw
            }
        elif result and 'error' in result:
            return {'success': False, 'error': result['error']}
        else:
            return {'success': False, 'error': 'Failed to build Jupiter Lend deposit'}

    def _build_jupiter_lend_withdraw(
        self,
        mint: str,
        amount: float,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Build Jupiter Lend withdraw transaction."""
        decimals = 9 if mint == 'So11111111111111111111111111111111111111112' else 6
        amount_raw = int(amount * (10 ** decimals))

        result = build_jupiter_lend_withdraw_ix(mint, amount_raw, user_wallet)

        if result and 'transaction' in result:
            return {
                'success': True,
                'protocol': 'jupiter_lend',
                'transaction': result.get('transaction'),
                'message': result.get('message'),
                'vault_address': mint,
                'amount': amount,
                'amount_raw': amount_raw
            }
        elif result and 'error' in result:
            return {'success': False, 'error': result['error']}
        else:
            return {'success': False, 'error': 'Failed to build Jupiter Lend withdraw'}

    # === Loopscale ===

    def _build_loopscale_deposit(
        self,
        vault_address: str,
        amount: float,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Build Loopscale vault deposit transaction."""
        # Loopscale uses 6 decimals for most tokens
        amount_raw = int(amount * 1_000_000)

        result = build_loopscale_deposit_ix(vault_address, amount_raw, user_wallet)

        if result and ('transaction' in result or 'tx' in result):
            return {
                'success': True,
                'protocol': 'loopscale',
                'transaction': result.get('transaction') or result.get('tx'),
                'message': result.get('message'),
                'vault_address': vault_address,
                'amount': amount,
                'amount_raw': amount_raw
            }
        elif result and 'error' in result:
            return {'success': False, 'error': result['error']}
        else:
            return {'success': False, 'error': 'Failed to build Loopscale deposit'}

    def _build_loopscale_withdraw(
        self,
        vault_address: str,
        shares: float,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Build Loopscale vault withdraw transaction."""
        shares_raw = int(shares * 1_000_000)

        result = build_loopscale_withdraw_ix(vault_address, shares_raw, user_wallet)

        if result and ('transaction' in result or 'tx' in result):
            return {
                'success': True,
                'protocol': 'loopscale',
                'transaction': result.get('transaction') or result.get('tx'),
                'message': result.get('message'),
                'vault_address': vault_address,
                'shares': shares,
                'shares_raw': shares_raw
            }
        elif result and 'error' in result:
            return {'success': False, 'error': result['error']}
        else:
            return {'success': False, 'error': 'Failed to build Loopscale withdraw'}

    # === Kamino (via sidecar) ===

    def _build_kamino_deposit(
        self,
        vault_address: str,
        amount: float,
        user_wallet: str,
        deposit_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Build Kamino deposit transaction via sidecar."""
        if not self.check_sidecar_health('kamino'):
            return {
                'success': False,
                'error': 'Kamino sidecar not available. Start it with: cd backend/kamino_sidecar && npm start'
            }

        try:
            response = requests.post(
                f"{KAMINO_SIDECAR_URL}/build/deposit",
                json={
                    'vaultAddress': vault_address,
                    'amount': amount,
                    'userWallet': user_wallet,
                    'depositToken': deposit_token
                },
                timeout=15
            )

            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return {
                        'success': True,
                        'protocol': 'kamino',
                        'transaction': data.get('transaction'),
                        'message': data.get('message'),
                        'vault_address': vault_address,
                        'amount': amount
                    }
                else:
                    return {'success': False, 'error': data.get('error', 'Kamino deposit failed')}
            else:
                return {'success': False, 'error': f'Kamino sidecar returned {response.status_code}'}

        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': f'Kamino sidecar request failed: {e}'}

    def _build_kamino_withdraw(
        self,
        vault_address: str,
        shares: float,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Build Kamino withdraw transaction via sidecar."""
        if not self.check_sidecar_health('kamino'):
            return {
                'success': False,
                'error': 'Kamino sidecar not available. Start it with: cd backend/kamino_sidecar && npm start'
            }

        try:
            response = requests.post(
                f"{KAMINO_SIDECAR_URL}/build/withdraw",
                json={
                    'vaultAddress': vault_address,
                    'shares': shares,
                    'userWallet': user_wallet
                },
                timeout=15
            )

            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return {
                        'success': True,
                        'protocol': 'kamino',
                        'transaction': data.get('transaction'),
                        'message': data.get('message'),
                        'vault_address': vault_address,
                        'shares': shares
                    }
                else:
                    return {'success': False, 'error': data.get('error', 'Kamino withdraw failed')}
            else:
                return {'success': False, 'error': f'Kamino sidecar returned {response.status_code}'}

        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': f'Kamino sidecar request failed: {e}'}

    # === HyLo ===

    def _build_hylo_deposit(
        self,
        vault_address: str,
        amount: float,
        user_wallet: str,
        deposit_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Build HyLo deposit transaction."""
        # Try REST API first
        try:
            response = requests.post(
                "https://api.hylo.so/v1/transactions/deposit",
                json={
                    'vaultAddress': vault_address,
                    'amount': str(int(amount * 1_000_000)),
                    'userWallet': user_wallet,
                    'depositToken': deposit_token
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'protocol': 'hylo',
                    'transaction': data.get('transaction'),
                    'vault_address': vault_address,
                    'amount': amount
                }

        except requests.exceptions.RequestException:
            pass

        # Fall back to sidecar if available
        if self.check_sidecar_health('hylo'):
            try:
                response = requests.post(
                    f"{HYLO_SIDECAR_URL}/build/deposit",
                    json={
                        'vaultAddress': vault_address,
                        'amount': amount,
                        'userWallet': user_wallet,
                        'depositToken': deposit_token
                    },
                    timeout=15
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get('success'):
                        return {
                            'success': True,
                            'protocol': 'hylo',
                            'transaction': data.get('transaction'),
                            'vault_address': vault_address,
                            'amount': amount
                        }

            except requests.exceptions.RequestException:
                pass

        return {
            'success': False,
            'error': 'HyLo deposits not yet supported. Use their web interface at hylo.so'
        }

    def _build_hylo_withdraw(
        self,
        vault_address: str,
        amount: float,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Build HyLo withdraw transaction."""
        # Try REST API first
        try:
            response = requests.post(
                "https://api.hylo.so/v1/transactions/withdraw",
                json={
                    'vaultAddress': vault_address,
                    'amount': str(int(amount * 1_000_000)),
                    'userWallet': user_wallet
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'protocol': 'hylo',
                    'transaction': data.get('transaction'),
                    'vault_address': vault_address,
                    'amount': amount
                }

        except requests.exceptions.RequestException:
            pass

        # Fall back to sidecar
        if self.check_sidecar_health('hylo'):
            try:
                response = requests.post(
                    f"{HYLO_SIDECAR_URL}/build/withdraw",
                    json={
                        'vaultAddress': vault_address,
                        'amount': amount,
                        'userWallet': user_wallet
                    },
                    timeout=15
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get('success'):
                        return {
                            'success': True,
                            'protocol': 'hylo',
                            'transaction': data.get('transaction'),
                            'vault_address': vault_address,
                            'amount': amount
                        }

            except requests.exceptions.RequestException:
                pass

        return {
            'success': False,
            'error': 'HyLo withdrawals not yet supported. Use their web interface at hylo.so'
        }

    # === Position Tracking ===

    def record_position(
        self,
        protocol: YieldProtocol,
        vault_address: str,
        vault_name: str,
        user_wallet: str,
        deposit_token: str,
        deposit_symbol: str,
        amount: float,
        shares: float,
        apy: float,
        risk_level: str,
        tx_signature: str
    ) -> Optional[int]:
        """
        Record a new yield position in the database.

        Returns:
            Position ID if successful, None otherwise
        """
        if not self.db:
            logger.warning("[UnifiedYield] No database connection for position recording")
            return None

        try:
            cursor = self.db.cursor()
            cursor.execute('''
                INSERT INTO yield_positions (
                    protocol, vault_address, vault_name, user_wallet,
                    deposit_token, deposit_symbol, deposited_amount,
                    current_value, shares, entry_apy, current_apy,
                    rewards_earned, risk_level, status, tx_signature,
                    created_at, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                protocol, vault_address, vault_name, user_wallet,
                deposit_token, deposit_symbol, amount,
                amount, shares, apy, apy,
                0.0, risk_level, 'active', tx_signature,
                time.time(), time.time()
            ))
            self.db.commit()

            position_id = cursor.lastrowid
            logger.info(f"[UnifiedYield] Recorded position {position_id} for {protocol}")
            return position_id

        except Exception as e:
            logger.error(f"[UnifiedYield] Failed to record position: {e}")
            return None

    def get_user_positions(
        self,
        user_wallet: str,
        protocol_filter: Optional[str] = None,
        status_filter: Optional[str] = None
    ) -> List[YieldPosition]:
        """
        Get all positions for a user.

        Args:
            user_wallet: User's wallet address
            protocol_filter: Optional protocol filter
            status_filter: Optional status filter ('active', 'withdrawn')

        Returns:
            List of YieldPosition objects
        """
        if not self.db:
            return []

        try:
            query = '''
                SELECT id, protocol, vault_address, vault_name, user_wallet,
                       deposit_token, deposit_symbol, deposited_amount,
                       current_value, shares, entry_apy, current_apy,
                       rewards_earned, risk_level, status, tx_signature,
                       created_at, last_updated
                FROM yield_positions
                WHERE user_wallet = ?
            '''
            params = [user_wallet]

            if protocol_filter:
                query += ' AND protocol = ?'
                params.append(protocol_filter)

            if status_filter:
                query += ' AND status = ?'
                params.append(status_filter)

            query += ' ORDER BY created_at DESC'

            cursor = self.db.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()

            positions = []
            for row in rows:
                positions.append(YieldPosition(
                    id=row[0],
                    protocol=row[1],
                    vault_address=row[2],
                    vault_name=row[3],
                    user_wallet=row[4],
                    deposit_token=row[5],
                    deposit_symbol=row[6],
                    deposited_amount=row[7],
                    current_value=row[8],
                    shares=row[9],
                    entry_apy=row[10],
                    current_apy=row[11],
                    rewards_earned=row[12],
                    risk_level=row[13],
                    status=row[14],
                    tx_signature=row[15],
                    created_at=row[16],
                    last_updated=row[17]
                ))

            return positions

        except Exception as e:
            logger.error(f"[UnifiedYield] Failed to get positions: {e}")
            return []

    def update_position_status(
        self,
        position_id: int,
        status: str,
        current_value: Optional[float] = None,
        current_apy: Optional[float] = None,
        rewards_earned: Optional[float] = None
    ) -> bool:
        """Update a position's status and values."""
        if not self.db:
            return False

        try:
            updates = ['status = ?', 'last_updated = ?']
            params = [status, time.time()]

            if current_value is not None:
                updates.append('current_value = ?')
                params.append(current_value)

            if current_apy is not None:
                updates.append('current_apy = ?')
                params.append(current_apy)

            if rewards_earned is not None:
                updates.append('rewards_earned = ?')
                params.append(rewards_earned)

            params.append(position_id)

            query = f'''
                UPDATE yield_positions
                SET {', '.join(updates)}
                WHERE id = ?
            '''

            cursor = self.db.cursor()
            cursor.execute(query, params)
            self.db.commit()

            return cursor.rowcount > 0

        except Exception as e:
            logger.error(f"[UnifiedYield] Failed to update position: {e}")
            return False

    def get_best_opportunity(
        self,
        deposit_symbol: str,
        risk_filter: Optional[str] = None
    ) -> Optional[YieldOpportunity]:
        """
        Find the best yield opportunity for a given token.

        Args:
            deposit_symbol: Token symbol to deposit
            risk_filter: Optional risk level filter

        Returns:
            Best YieldOpportunity or None
        """
        opportunities = self.get_opportunities(
            risk_filter=risk_filter,
            deposit_symbol_filter=deposit_symbol
        )

        if not opportunities:
            return None

        # Already sorted by APY descending
        return opportunities[0]

    def compare_opportunities(
        self,
        deposit_symbol: str
    ) -> Dict[str, List[YieldOpportunity]]:
        """
        Compare opportunities across risk levels for a token.

        Returns:
            Dict with 'low', 'medium', 'high' keys containing opportunities
        """
        result = {'low': [], 'medium': [], 'high': []}

        opportunities = self.get_opportunities(deposit_symbol_filter=deposit_symbol)

        for opp in opportunities:
            if opp.risk_level in result:
                result[opp.risk_level].append(opp)

        return result


# Singleton instance for easy access
_manager_instance: Optional[UnifiedYieldManager] = None


def get_yield_manager(db_connection=None) -> UnifiedYieldManager:
    """Get or create the singleton yield manager instance."""
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = UnifiedYieldManager(db_connection)
    elif db_connection and not _manager_instance.db:
        _manager_instance.db = db_connection
    return _manager_instance
