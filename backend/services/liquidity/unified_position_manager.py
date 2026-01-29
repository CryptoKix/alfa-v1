#!/usr/bin/env python3
"""
Unified Position Manager
Protocol-agnostic wrapper that delegates to Meteora or Orca based on protocol param.
"""

import logging
import time
from typing import Optional, Dict, List, Any, Literal
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("tactix.liquidity")

LiquidityProtocol = Literal['meteora', 'orca']


class RiskProfile(Enum):
    HIGH = 'high'      # Tight range, high fees, high IL risk
    MEDIUM = 'medium'  # Balanced range
    LOW = 'low'        # Wide range, lower fees, lower IL risk


@dataclass
class UnifiedPool:
    """Protocol-agnostic pool representation."""
    protocol: LiquidityProtocol
    address: str
    name: str
    token_x_mint: str
    token_y_mint: str
    token_x_symbol: str
    token_y_symbol: str
    price_spacing: int  # binStep for Meteora, tickSpacing for Orca
    fee_rate: int       # In basis points
    liquidity: float
    volume_24h: float
    fees_24h: float
    apr: float
    price: float
    tvl: float
    current_price_index: int  # activeBinId for Meteora, currentTick for Orca

    def to_dict(self) -> Dict[str, Any]:
        return {
            'protocol': self.protocol,
            'address': self.address,
            'name': self.name,
            'tokenX': {
                'mint': self.token_x_mint,
                'symbol': self.token_x_symbol
            },
            'tokenY': {
                'mint': self.token_y_mint,
                'symbol': self.token_y_symbol
            },
            'priceSpacing': self.price_spacing,
            'feeRate': self.fee_rate,
            'liquidity': self.liquidity,
            'volume24h': self.volume_24h,
            'fees24h': self.fees_24h,
            'apr': self.apr,
            'price': self.price,
            'tvl': self.tvl,
            'currentPriceIndex': self.current_price_index
        }


@dataclass
class UnifiedPosition:
    """Protocol-agnostic position representation."""
    protocol: LiquidityProtocol
    position_pubkey: str
    position_nft_mint: Optional[str]  # Orca only
    pool_address: str
    user_wallet: str
    range_min: int      # binId for Meteora, tickIndex for Orca
    range_max: int
    liquidity: str
    token_x_amount: str
    token_y_amount: str
    fee_x_owed: str
    fee_y_owed: str
    in_range: bool
    distance_from_edge: float  # 0-1, how close to range boundary
    auto_rebalance: bool
    risk_profile: str
    created_at: float
    rewards: Optional[List[Dict]] = None  # Orca reward tokens

    def to_dict(self) -> Dict[str, Any]:
        return {
            'protocol': self.protocol,
            'positionPubkey': self.position_pubkey,
            'positionNftMint': self.position_nft_mint,
            'poolAddress': self.pool_address,
            'userWallet': self.user_wallet,
            'rangeMin': self.range_min,
            'rangeMax': self.range_max,
            'liquidity': self.liquidity,
            'tokenXAmount': self.token_x_amount,
            'tokenYAmount': self.token_y_amount,
            'feeXOwed': self.fee_x_owed,
            'feeYOwed': self.fee_y_owed,
            'inRange': self.in_range,
            'distanceFromEdge': self.distance_from_edge,
            'autoRebalance': self.auto_rebalance,
            'riskProfile': self.risk_profile,
            'createdAt': self.created_at,
            'rewards': self.rewards
        }


class UnifiedPositionManager:
    """
    Protocol-agnostic position manager that delegates to Meteora or Orca clients.
    """

    def __init__(self, db, socketio, meteora_client, orca_client):
        self.db = db
        self.socketio = socketio
        self.meteora_client = meteora_client
        self.orca_client = orca_client

    # ==================== Pool Operations ====================

    def get_all_pools(
        self,
        protocol: Optional[LiquidityProtocol] = None,
        min_liquidity: float = 0,
        min_tvl: float = 0,
        search: str = ''
    ) -> List[UnifiedPool]:
        """Get pools from one or both protocols."""
        pools = []

        if protocol is None or protocol == 'meteora':
            meteora_pools = self.meteora_client.get_all_pools()
            for mp in meteora_pools:
                # Get chain info for current price index
                chain_info = self.meteora_client.get_pool_info_from_sidecar(mp.address)
                current_index = chain_info.get('activeBinId', 0) if chain_info else 0

                pools.append(UnifiedPool(
                    protocol='meteora',
                    address=mp.address,
                    name=mp.name,
                    token_x_mint=mp.token_x_mint,
                    token_y_mint=mp.token_y_mint,
                    token_x_symbol=mp.token_x_symbol,
                    token_y_symbol=mp.token_y_symbol,
                    price_spacing=mp.bin_step,
                    fee_rate=mp.base_fee_bps,
                    liquidity=mp.liquidity,
                    volume_24h=mp.volume_24h,
                    fees_24h=mp.fees_24h,
                    apr=mp.apr,
                    price=mp.price,
                    tvl=mp.liquidity,  # Meteora uses liquidity as TVL
                    current_price_index=current_index
                ))

        if protocol is None or protocol == 'orca':
            orca_pools = self.orca_client.get_all_pools()
            for op in orca_pools:
                # Get chain info for current tick
                chain_info = self.orca_client.get_pool_info_from_sidecar(op.address)
                current_index = chain_info.get('currentTick', 0) if chain_info else 0

                pools.append(UnifiedPool(
                    protocol='orca',
                    address=op.address,
                    name=op.name,
                    token_x_mint=op.token_a_mint,
                    token_y_mint=op.token_b_mint,
                    token_x_symbol=op.token_a_symbol,
                    token_y_symbol=op.token_b_symbol,
                    price_spacing=op.tick_spacing,
                    fee_rate=op.fee_rate,
                    liquidity=op.liquidity,
                    volume_24h=op.volume_24h,
                    fees_24h=op.fees_24h,
                    apr=op.apr,
                    price=op.price,
                    tvl=op.tvl,
                    current_price_index=current_index
                ))

        # Apply filters
        if min_liquidity > 0:
            pools = [p for p in pools if p.liquidity >= min_liquidity]
        if min_tvl > 0:
            pools = [p for p in pools if p.tvl >= min_tvl]
        if search:
            search_lower = search.lower()
            pools = [p for p in pools if search_lower in p.name.lower()]

        # Sort by TVL
        pools.sort(key=lambda p: p.tvl, reverse=True)

        return pools

    def get_pool(self, protocol: LiquidityProtocol, address: str) -> Optional[UnifiedPool]:
        """Get a specific pool."""
        if protocol == 'meteora':
            mp = self.meteora_client.get_pool(address)
            if not mp:
                return None

            chain_info = self.meteora_client.get_pool_info_from_sidecar(address)
            current_index = chain_info.get('activeBinId', 0) if chain_info else 0

            return UnifiedPool(
                protocol='meteora',
                address=mp.address,
                name=mp.name,
                token_x_mint=mp.token_x_mint,
                token_y_mint=mp.token_y_mint,
                token_x_symbol=mp.token_x_symbol,
                token_y_symbol=mp.token_y_symbol,
                price_spacing=mp.bin_step,
                fee_rate=mp.base_fee_bps,
                liquidity=mp.liquidity,
                volume_24h=mp.volume_24h,
                fees_24h=mp.fees_24h,
                apr=mp.apr,
                price=mp.price,
                tvl=mp.liquidity,
                current_price_index=current_index
            )
        else:  # orca
            op = self.orca_client.get_pool(address)
            if not op:
                return None

            chain_info = self.orca_client.get_pool_info_from_sidecar(address)
            current_index = chain_info.get('currentTick', 0) if chain_info else 0

            return UnifiedPool(
                protocol='orca',
                address=op.address,
                name=op.name,
                token_x_mint=op.token_a_mint,
                token_y_mint=op.token_b_mint,
                token_x_symbol=op.token_a_symbol,
                token_y_symbol=op.token_b_symbol,
                price_spacing=op.tick_spacing,
                fee_rate=op.fee_rate,
                liquidity=op.liquidity,
                volume_24h=op.volume_24h,
                fees_24h=op.fees_24h,
                apr=op.apr,
                price=op.price,
                tvl=op.tvl,
                current_price_index=current_index
            )

    # ==================== Position Operations ====================

    def calculate_range(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        risk_profile: str
    ) -> Optional[Dict]:
        """Calculate range for a risk profile."""
        if protocol == 'meteora':
            return self.meteora_client.calculate_bins(pool_address, risk_profile)
        else:
            return self.orca_client.calculate_tick_range(pool_address, risk_profile)

    def prepare_create_position(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        user_wallet: str,
        risk_profile: str,
        amount_x: float,
        amount_y: float,
        token_x_decimals: int = 9,
        token_y_decimals: int = 6,
        auto_rebalance: bool = False
    ) -> Dict:
        """Build create position transaction for either protocol."""

        # Get range based on risk profile
        range_info = self.calculate_range(protocol, pool_address, risk_profile)
        if not range_info:
            return {'success': False, 'error': 'Failed to calculate range'}

        if protocol == 'meteora':
            # Convert amounts to lamports
            amount_x_lamports = int(amount_x * (10 ** token_x_decimals))
            amount_y_lamports = int(amount_y * (10 ** token_y_decimals))

            result = self.meteora_client.build_create_position_tx({
                'poolAddress': pool_address,
                'userWallet': user_wallet,
                'totalXAmount': str(amount_x_lamports),
                'totalYAmount': str(amount_y_lamports),
                'strategyType': 'spot',
                'minBinId': range_info.get('minBinId'),
                'maxBinId': range_info.get('maxBinId')
            })

            if result and result.get('success'):
                result['rangeMin'] = range_info.get('minBinId')
                result['rangeMax'] = range_info.get('maxBinId')
                result['protocol'] = 'meteora'
                result['autoRebalance'] = auto_rebalance
                result['riskProfile'] = risk_profile

            return result or {'success': False, 'error': 'Failed to build transaction'}

        else:  # orca
            # Convert amounts (Orca uses decimal strings)
            result = self.orca_client.build_open_position_tx({
                'poolAddress': pool_address,
                'userWallet': user_wallet,
                'tickLower': range_info.get('tickLower'),
                'tickUpper': range_info.get('tickUpper'),
                'tokenAAmount': str(amount_x),
                'slippagePct': 1
            })

            if result and result.get('success'):
                result['rangeMin'] = range_info.get('tickLower')
                result['rangeMax'] = range_info.get('tickUpper')
                result['protocol'] = 'orca'
                result['autoRebalance'] = auto_rebalance
                result['riskProfile'] = risk_profile

            return result or {'success': False, 'error': 'Failed to build transaction'}

    def prepare_close_position(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str
    ) -> Dict:
        """Build close position transaction for either protocol."""
        if protocol == 'meteora':
            return self.meteora_client.build_close_position_tx({
                'poolAddress': pool_address,
                'positionPubkey': position_pubkey,
                'userWallet': user_wallet
            }) or {'success': False, 'error': 'Failed to build transaction'}
        else:
            # Orca close includes fee/reward collection
            return self.orca_client.build_close_position_tx({
                'poolAddress': pool_address,
                'positionAddress': position_pubkey,
                'userWallet': user_wallet,
                'slippagePct': 1
            }) or {'success': False, 'error': 'Failed to build transaction'}

    def prepare_add_liquidity(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str,
        amount_x: float,
        amount_y: float,
        token_x_decimals: int = 9,
        token_y_decimals: int = 6
    ) -> Dict:
        """Build add liquidity transaction for either protocol."""
        if protocol == 'meteora':
            amount_x_lamports = int(amount_x * (10 ** token_x_decimals))
            amount_y_lamports = int(amount_y * (10 ** token_y_decimals))

            return self.meteora_client.build_add_liquidity_tx({
                'poolAddress': pool_address,
                'positionPubkey': position_pubkey,
                'userWallet': user_wallet,
                'totalXAmount': str(amount_x_lamports),
                'totalYAmount': str(amount_y_lamports),
                'strategyType': 'spot'
            }) or {'success': False, 'error': 'Failed to build transaction'}
        else:
            return self.orca_client.build_increase_liquidity_tx({
                'poolAddress': pool_address,
                'positionAddress': position_pubkey,
                'userWallet': user_wallet,
                'tokenAAmount': str(amount_x),
                'slippagePct': 1
            }) or {'success': False, 'error': 'Failed to build transaction'}

    def prepare_remove_liquidity(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str,
        percentage: int = 100
    ) -> Dict:
        """Build remove liquidity transaction for either protocol."""
        if protocol == 'meteora':
            bps = percentage * 100  # Convert percentage to basis points
            return self.meteora_client.build_remove_liquidity_tx({
                'poolAddress': pool_address,
                'positionPubkey': position_pubkey,
                'userWallet': user_wallet,
                'bps': bps,
                'shouldClaimAndClose': percentage == 100
            }) or {'success': False, 'error': 'Failed to build transaction'}
        else:
            liquidity_amount = percentage / 100  # Decimal percentage
            return self.orca_client.build_decrease_liquidity_tx({
                'poolAddress': pool_address,
                'positionAddress': position_pubkey,
                'userWallet': user_wallet,
                'liquidityAmount': liquidity_amount,
                'slippagePct': 1
            }) or {'success': False, 'error': 'Failed to build transaction'}

    def prepare_claim_fees(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str
    ) -> Dict:
        """Build claim fees transaction for either protocol."""
        if protocol == 'meteora':
            return self.meteora_client.build_claim_fees_tx({
                'poolAddress': pool_address,
                'positionPubkey': position_pubkey,
                'userWallet': user_wallet
            }) or {'success': False, 'error': 'Failed to build transaction'}
        else:
            return self.orca_client.build_collect_fees_tx({
                'poolAddress': pool_address,
                'positionAddress': position_pubkey,
                'userWallet': user_wallet
            }) or {'success': False, 'error': 'Failed to build transaction'}

    def prepare_claim_rewards(
        self,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str,
        reward_index: Optional[int] = None
    ) -> Dict:
        """Build claim rewards transaction (Orca only)."""
        return self.orca_client.build_collect_rewards_tx({
            'poolAddress': pool_address,
            'positionAddress': position_pubkey,
            'userWallet': user_wallet,
            'rewardIndex': reward_index
        }) or {'success': False, 'error': 'Failed to build transaction'}

    # ==================== Position Tracking ====================

    def get_position_info(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        position_pubkey: str
    ) -> Optional[Dict]:
        """Get position info from chain via sidecar."""
        if protocol == 'meteora':
            return self.meteora_client.get_position_info(pool_address, position_pubkey)
        else:
            return self.orca_client.get_position_info(pool_address, position_pubkey)

    def record_position_created(
        self,
        protocol: LiquidityProtocol,
        position_pubkey: str,
        position_nft_mint: Optional[str],
        pool_address: str,
        user_wallet: str,
        signature: str,
        risk_profile: str,
        range_min: int,
        range_max: int,
        deposit_x: float,
        deposit_y: float,
        deposit_usd: float,
        auto_rebalance: bool
    ) -> str:
        """Record a new position in the database."""
        position_id = self.db.save_liquidity_position({
            'protocol': protocol,
            'position_pubkey': position_pubkey,
            'position_nft_mint': position_nft_mint,
            'pool_address': pool_address,
            'user_wallet': user_wallet,
            'create_signature': signature,
            'risk_profile': risk_profile,
            'range_min': range_min,
            'range_max': range_max,
            'deposit_x': deposit_x,
            'deposit_y': deposit_y,
            'deposit_usd': deposit_usd,
            'auto_rebalance': auto_rebalance,
            'status': 'active'
        })

        # Broadcast position update
        self.socketio.emit('position_created', {
            'protocol': protocol,
            'position_pubkey': position_pubkey,
            'pool_address': pool_address,
            'user_wallet': user_wallet,
            'timestamp': time.time()
        }, namespace='/liquidity')

        return position_id

    def record_position_closed(
        self,
        position_pubkey: str,
        signature: str
    ):
        """Record position closure in database."""
        self.db.update_liquidity_position(position_pubkey, {
            'status': 'closed',
            'close_signature': signature,
            'closed_at': time.time()
        })

        # Broadcast position update
        self.socketio.emit('position_closed', {
            'position_pubkey': position_pubkey,
            'timestamp': time.time()
        }, namespace='/liquidity')

    def get_positions(
        self,
        user_wallet: str,
        protocol: Optional[LiquidityProtocol] = None,
        status: str = 'active'
    ) -> List[Dict]:
        """Get user's positions from database."""
        return self.db.get_liquidity_positions(user_wallet, protocol, status)

    def update_position_auto_rebalance(
        self,
        position_pubkey: str,
        auto_rebalance: bool
    ):
        """Update auto-rebalance setting for a position."""
        self.db.update_liquidity_position(position_pubkey, {
            'auto_rebalance': auto_rebalance
        })

        self.socketio.emit('position_settings_updated', {
            'position_pubkey': position_pubkey,
            'auto_rebalance': auto_rebalance,
            'timestamp': time.time()
        }, namespace='/liquidity')

    def check_sidecar_health(self) -> Dict:
        """Check health of both protocol sidecar endpoints."""
        return {
            'meteora': self.meteora_client.check_sidecar_health(),
            'orca': self.orca_client.check_sidecar_health()
        }
