#!/usr/bin/env python3
"""
Position Manager for Meteora DLMM
Handles position lifecycle: create, add liquidity, remove liquidity, claim fees, close.
"""

import logging
from typing import Dict, Optional, List, Any
from datetime import datetime

from .dlmm_client import dlmm_client, DLMMClient
from .strategy_calculator import StrategyCalculator, RiskProfile, StrategyType

logger = logging.getLogger("tactix.dlmm.position")


class PositionManager:
    """Manages DLMM position lifecycle operations."""

    def __init__(self, db, socketio, client: Optional[DLMMClient] = None):
        self.db = db
        self.socketio = socketio
        self.client = client or dlmm_client

    def prepare_create_position(
        self,
        pool_address: str,
        user_wallet: str,
        risk_profile: str,
        strategy_type: str,
        amount_x: float,
        amount_y: float,
        token_x_decimals: int = 9,
        token_y_decimals: int = 6
    ) -> Dict[str, Any]:
        """
        Prepare a create position transaction.

        Returns unsigned transaction for frontend to sign.
        """
        # Get pool info from sidecar
        pool_info = self.client.get_pool_info_from_sidecar(pool_address)
        if not pool_info:
            return {'success': False, 'error': 'Failed to fetch pool info'}

        # Calculate bin range based on risk profile
        profile = RiskProfile(risk_profile)
        bin_range = StrategyCalculator.calculate_bin_range(
            pool_info['activeBinId'],
            pool_info['binStep'],
            profile
        )

        # Convert amounts to lamports/smallest units
        total_x_amount = int(amount_x * (10 ** token_x_decimals))
        total_y_amount = int(amount_y * (10 ** token_y_decimals))

        # Build transaction via sidecar
        tx_result = self.client.build_create_position_tx({
            'poolAddress': pool_address,
            'userWallet': user_wallet,
            'totalXAmount': str(total_x_amount),
            'totalYAmount': str(total_y_amount),
            'strategyType': strategy_type,
            'minBinId': bin_range['min_bin_id'],
            'maxBinId': bin_range['max_bin_id']
        })

        if not tx_result or not tx_result.get('success'):
            return {
                'success': False,
                'error': tx_result.get('error', 'Failed to build transaction')
            }

        return {
            'success': True,
            'transaction': tx_result['transaction'],
            'position_pubkey': tx_result['positionPubkey'],
            'position_secret': tx_result['positionSecret'],
            'bin_range': bin_range,
            'pool_info': pool_info,
            'blockhash': tx_result['blockhash']
        }

    def record_position_created(
        self,
        position_pubkey: str,
        pool_address: str,
        user_wallet: str,
        create_signature: str,
        risk_profile: str,
        strategy_type: str,
        bin_range: Dict,
        deposit_x: float,
        deposit_y: float,
        deposit_usd: float,
        pool_info: Optional[Dict] = None
    ) -> int:
        """Record a newly created position in database."""
        pool = self.client.get_pool(pool_address)

        position_data = {
            'position_pubkey': position_pubkey,
            'pool_address': pool_address,
            'pool_name': pool.name if pool else None,
            'token_x_mint': pool.token_x_mint if pool else (pool_info.get('tokenX', {}).get('mint') if pool_info else None),
            'token_y_mint': pool.token_y_mint if pool else (pool_info.get('tokenY', {}).get('mint') if pool_info else None),
            'token_x_symbol': pool.token_x_symbol if pool else None,
            'token_y_symbol': pool.token_y_symbol if pool else None,
            'wallet_address': user_wallet,
            'risk_profile': risk_profile,
            'strategy_type': strategy_type,
            'min_bin_id': bin_range.get('min_bin_id'),
            'max_bin_id': bin_range.get('max_bin_id'),
            'bin_step': pool.bin_step if pool else (pool_info.get('binStep') if pool_info else None),
            'deposit_x_amount': deposit_x,
            'deposit_y_amount': deposit_y,
            'deposit_usd_value': deposit_usd,
            'current_x_amount': deposit_x,
            'current_y_amount': deposit_y,
            'current_usd_value': deposit_usd,
            'create_signature': create_signature,
            'status': 'active'
        }

        position_id = self.db.save_dlmm_position(position_data)

        # Broadcast position update
        self._broadcast_position_update(user_wallet, 'created', position_pubkey)

        logger.info(f"[DLMM] Position created: {position_pubkey[:16]}... for wallet {user_wallet[:16]}...")
        return position_id

    def prepare_add_liquidity(
        self,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str,
        amount_x: float,
        amount_y: float,
        strategy_type: str = 'spot',
        token_x_decimals: int = 9,
        token_y_decimals: int = 6
    ) -> Dict[str, Any]:
        """Prepare an add liquidity transaction."""
        total_x_amount = int(amount_x * (10 ** token_x_decimals))
        total_y_amount = int(amount_y * (10 ** token_y_decimals))

        tx_result = self.client.build_add_liquidity_tx({
            'poolAddress': pool_address,
            'positionPubkey': position_pubkey,
            'userWallet': user_wallet,
            'totalXAmount': str(total_x_amount),
            'totalYAmount': str(total_y_amount),
            'strategyType': strategy_type
        })

        if not tx_result or not tx_result.get('success'):
            return {
                'success': False,
                'error': tx_result.get('error', 'Failed to build transaction')
            }

        return {
            'success': True,
            'transaction': tx_result['transaction'],
            'blockhash': tx_result['blockhash']
        }

    def prepare_remove_liquidity(
        self,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str,
        percentage: int = 100  # 100 = 100%
    ) -> Dict[str, Any]:
        """Prepare a remove liquidity transaction."""
        bps = min(percentage * 100, 10000)  # Convert to basis points

        tx_result = self.client.build_remove_liquidity_tx({
            'poolAddress': pool_address,
            'positionPubkey': position_pubkey,
            'userWallet': user_wallet,
            'bps': bps,
            'shouldClaimAndClose': False
        })

        if not tx_result or not tx_result.get('success'):
            return {
                'success': False,
                'error': tx_result.get('error', 'Failed to build transaction')
            }

        return {
            'success': True,
            'transaction': tx_result['transaction'],
            'blockhash': tx_result['blockhash']
        }

    def prepare_claim_fees(
        self,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Prepare a claim fees transaction."""
        tx_result = self.client.build_claim_fees_tx({
            'poolAddress': pool_address,
            'positionPubkey': position_pubkey,
            'userWallet': user_wallet
        })

        if not tx_result or not tx_result.get('success'):
            return {
                'success': False,
                'error': tx_result.get('error', 'Failed to build transaction')
            }

        return {
            'success': True,
            'transaction': tx_result['transaction'],
            'blockhash': tx_result['blockhash']
        }

    def prepare_close_position(
        self,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str
    ) -> Dict[str, Any]:
        """Prepare a close position transaction (remove all + claim + close)."""
        tx_result = self.client.build_close_position_tx({
            'poolAddress': pool_address,
            'positionPubkey': position_pubkey,
            'userWallet': user_wallet
        })

        if not tx_result or not tx_result.get('success'):
            return {
                'success': False,
                'error': tx_result.get('error', 'Failed to build transaction')
            }

        return {
            'success': True,
            'transaction': tx_result['transaction'],
            'blockhash': tx_result['blockhash']
        }

    def record_position_closed(self, position_pubkey: str, close_signature: str):
        """Record position closure in database."""
        self.db.close_dlmm_position(position_pubkey, close_signature)

        # Get position to find wallet for broadcast
        position = self.db.get_dlmm_position_by_pubkey(position_pubkey)
        if position:
            self._broadcast_position_update(position['wallet_address'], 'closed', position_pubkey)

        logger.info(f"[DLMM] Position closed: {position_pubkey[:16]}...")

    def update_position_fees(
        self,
        position_pubkey: str,
        claimed_x: float,
        claimed_y: float
    ):
        """Update position with claimed fees."""
        position = self.db.get_dlmm_position_by_pubkey(position_pubkey)
        if not position:
            return

        self.db.update_dlmm_position(position_pubkey, {
            'unclaimed_fees_x': 0,
            'unclaimed_fees_y': 0,
            'total_fees_claimed_x': position.get('total_fees_claimed_x', 0) + claimed_x,
            'total_fees_claimed_y': position.get('total_fees_claimed_y', 0) + claimed_y,
            'last_updated': datetime.now().isoformat()
        })

        self._broadcast_position_update(position['wallet_address'], 'fees_claimed', position_pubkey)

    def refresh_position(self, position_pubkey: str) -> Optional[Dict]:
        """Refresh position data from chain."""
        position = self.db.get_dlmm_position_by_pubkey(position_pubkey)
        if not position or position['status'] != 'active':
            return None

        # Get current position info from sidecar
        position_info = self.client.get_position_info(
            position['pool_address'],
            position_pubkey
        )

        if not position_info:
            return position

        # Update database with current values
        # Note: amounts are in raw units, would need price feed to convert to USD
        self.db.update_dlmm_position(position_pubkey, {
            'current_x_amount': float(position_info.get('totalXAmount', 0)),
            'current_y_amount': float(position_info.get('totalYAmount', 0)),
            'unclaimed_fees_x': float(position_info.get('feeX', 0)),
            'unclaimed_fees_y': float(position_info.get('feeY', 0)),
            'last_updated': datetime.now().isoformat()
        })

        # Check if rebalance needed
        risk_profile = RiskProfile(position['risk_profile']) if position.get('risk_profile') else RiskProfile.MEDIUM
        should_rebalance, reason = StrategyCalculator.should_rebalance(
            position_info['activeBinId'],
            position['min_bin_id'],
            position['max_bin_id'],
            risk_profile
        )

        if should_rebalance:
            self._broadcast_rebalance_suggestion(
                position['wallet_address'],
                position_pubkey,
                reason
            )

        return self.db.get_dlmm_position_by_pubkey(position_pubkey)

    def get_positions(self, wallet_address: str, status: str = 'active') -> List[Dict]:
        """Get all positions for a wallet."""
        return self.db.get_dlmm_positions(wallet_address, status)

    def calculate_position_roi(self, position: Dict) -> Dict:
        """Calculate ROI metrics for a position."""
        deposit_usd = position.get('deposit_usd_value', 0)
        current_usd = position.get('current_usd_value', 0)
        total_fees_x = position.get('total_fees_claimed_x', 0) + position.get('unclaimed_fees_x', 0)
        total_fees_y = position.get('total_fees_claimed_y', 0) + position.get('unclaimed_fees_y', 0)

        # Note: Would need price feed to convert fees to USD accurately
        # For now, estimate fees USD value as 0 (frontend can calculate with current prices)

        pnl = current_usd - deposit_usd
        roi_pct = (pnl / deposit_usd * 100) if deposit_usd > 0 else 0

        return {
            'deposit_usd': deposit_usd,
            'current_usd': current_usd,
            'pnl_usd': pnl,
            'roi_pct': round(roi_pct, 2),
            'unclaimed_fees_x': total_fees_x,
            'unclaimed_fees_y': total_fees_y
        }

    def _broadcast_position_update(self, wallet: str, action: str, position_pubkey: str):
        """Broadcast position update via Socket.IO."""
        self.socketio.emit(
            'position_update',
            {
                'action': action,
                'wallet': wallet,
                'position_pubkey': position_pubkey
            },
            namespace='/dlmm'
        )

    def _broadcast_rebalance_suggestion(self, wallet: str, position_pubkey: str, reason: str):
        """Broadcast rebalance suggestion via Socket.IO."""
        self.socketio.emit(
            'rebalance_suggestion',
            {
                'wallet': wallet,
                'position_pubkey': position_pubkey,
                'reason': reason
            },
            namespace='/dlmm'
        )
