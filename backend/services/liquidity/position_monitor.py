#!/usr/bin/env python3
"""
Position Monitor Service
Enhanced monitoring with configurable rebalance triggers.
"""

import logging
import time
import threading
from typing import Optional, Dict, List, Tuple, Literal
from dataclasses import dataclass, field, asdict
from collections import deque

logger = logging.getLogger("tactix.position_monitor")

LiquidityProtocol = Literal['meteora', 'orca']


@dataclass
class MonitorSettings:
    """Configurable settings for position monitoring.

    All optional triggers are only active if their value is set (not None).
    """

    # Distance threshold (always active) - percentage from edge to trigger rebalance
    distance_thresholds: Dict[str, float] = field(default_factory=lambda: {
        'high': 0.10,    # 10% from edge
        'medium': 0.15,  # 15% from edge
        'low': 0.20      # 20% from edge
    })

    # Fee accumulation trigger - only if fee_threshold_usd is set
    fee_threshold_usd: Optional[float] = None  # e.g., 50.0 USD

    # Time-based trigger - only if max_position_age_hours is set
    max_position_age_hours: Optional[int] = None  # e.g., 168 hours (1 week)

    # Volatility trigger - only if volatility_threshold_pct is set
    volatility_threshold_pct: Optional[float] = None  # e.g., 5.0%
    volatility_window_minutes: int = 60  # Check volatility over this window

    # Monitor loop settings
    check_interval_seconds: int = 15

    def to_dict(self) -> Dict:
        """Convert settings to dictionary for API response."""
        return {
            'distanceThresholds': self.distance_thresholds,
            'feeThresholdUsd': self.fee_threshold_usd,
            'maxPositionAgeHours': self.max_position_age_hours,
            'volatilityThresholdPct': self.volatility_threshold_pct,
            'volatilityWindowMinutes': self.volatility_window_minutes,
            'checkIntervalSeconds': self.check_interval_seconds,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> 'MonitorSettings':
        """Create settings from dictionary."""
        return cls(
            distance_thresholds=data.get('distanceThresholds', cls.distance_thresholds),
            fee_threshold_usd=data.get('feeThresholdUsd'),
            max_position_age_hours=data.get('maxPositionAgeHours'),
            volatility_threshold_pct=data.get('volatilityThresholdPct'),
            volatility_window_minutes=data.get('volatilityWindowMinutes', 60),
            check_interval_seconds=data.get('checkIntervalSeconds', 15),
        )


@dataclass
class PositionStatus:
    """Current status of a monitored position."""
    position_pubkey: str
    protocol: LiquidityProtocol
    pool_address: str
    user_wallet: str
    in_range: bool
    distance_from_edge: float
    current_price: float
    range_min_price: float
    range_max_price: float
    fees_x: float
    fees_y: float
    total_fees_usd: float
    position_age_hours: float
    urgency: str  # 'healthy', 'warning', 'critical'
    reason: str  # 'healthy', 'near_edge', 'out_of_range', 'fee_threshold', 'max_age', 'high_volatility'
    timestamp: float

    def to_dict(self) -> Dict:
        return {
            'positionPubkey': self.position_pubkey,
            'protocol': self.protocol,
            'poolAddress': self.pool_address,
            'userWallet': self.user_wallet,
            'inRange': self.in_range,
            'distanceFromEdge': self.distance_from_edge,
            'currentPrice': self.current_price,
            'rangeMinPrice': self.range_min_price,
            'rangeMaxPrice': self.range_max_price,
            'feesX': self.fees_x,
            'feesY': self.fees_y,
            'totalFeesUsd': self.total_fees_usd,
            'positionAgeHours': self.position_age_hours,
            'urgency': self.urgency,
            'reason': self.reason,
            'timestamp': self.timestamp,
        }


class PositionMonitor:
    """
    Enhanced position monitor with configurable rebalance triggers.

    Monitors positions and emits status updates via Socket.IO.
    Supports multiple trigger conditions:
    - Distance from range edge (always active)
    - Fee accumulation threshold (optional)
    - Position age (optional)
    - Price volatility (optional)
    """

    def __init__(self, db, socketio, position_manager, price_service=None):
        self.db = db
        self.socketio = socketio
        self.position_manager = position_manager
        self.price_service = price_service

        self.settings = MonitorSettings()
        self._running = False
        self._thread: Optional[threading.Thread] = None

        # Price history for volatility calculation
        # Key: pool_address, Value: deque of (timestamp, price)
        self._price_history: Dict[str, deque] = {}
        self._price_history_max_len = 100  # Keep last 100 price points per pool

    def start(self):
        """Start the position monitoring loop."""
        if self._running:
            logger.warning("[PositionMonitor] Already running")
            return

        self._running = True
        self._thread = threading.Thread(target=self._monitoring_loop, daemon=True)
        self._thread.start()
        logger.info("[PositionMonitor] Started with %ds interval", self.settings.check_interval_seconds)

    def stop(self):
        """Stop the position monitoring loop."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        logger.info("[PositionMonitor] Stopped")

    def is_running(self) -> bool:
        """Check if monitor is running."""
        return self._running

    def update_settings(self, updates: Dict) -> MonitorSettings:
        """Update monitor settings."""
        if 'distanceThresholds' in updates and updates['distanceThresholds'] is not None:
            self.settings.distance_thresholds = updates['distanceThresholds']

        if 'feeThresholdUsd' in updates:
            self.settings.fee_threshold_usd = updates['feeThresholdUsd']

        if 'maxPositionAgeHours' in updates:
            self.settings.max_position_age_hours = updates['maxPositionAgeHours']

        if 'volatilityThresholdPct' in updates:
            self.settings.volatility_threshold_pct = updates['volatilityThresholdPct']

        if 'volatilityWindowMinutes' in updates and updates['volatilityWindowMinutes'] is not None:
            self.settings.volatility_window_minutes = updates['volatilityWindowMinutes']

        if 'checkIntervalSeconds' in updates and updates['checkIntervalSeconds'] is not None:
            self.settings.check_interval_seconds = max(5, min(300, updates['checkIntervalSeconds']))

        # Emit settings update
        self.socketio.emit('monitor_settings_update', self.settings.to_dict(), namespace='/liquidity')

        logger.info("[PositionMonitor] Settings updated: %s", self.settings.to_dict())
        return self.settings

    def _monitoring_loop(self):
        """Main monitoring loop."""
        while self._running:
            try:
                self._check_all_positions()
            except Exception as e:
                logger.error("[PositionMonitor] Error in monitoring loop: %s", e)

            time.sleep(self.settings.check_interval_seconds)

    def _check_all_positions(self):
        """Check all active positions and emit status updates."""
        positions = self.db.get_all_active_liquidity_positions()

        for position in positions:
            try:
                status = self._evaluate_position(position)
                if status:
                    # Emit position status via Socket.IO
                    self.socketio.emit('position_status', status.to_dict(), namespace='/liquidity')
            except Exception as e:
                logger.error("[PositionMonitor] Error evaluating position %s: %s",
                           position.get('position_pubkey'), e)

    def _evaluate_position(self, position: Dict) -> Optional[PositionStatus]:
        """Evaluate a position and return its current status."""
        protocol = position.get('protocol')
        pool_address = position.get('pool_address')
        position_pubkey = position.get('position_pubkey')
        range_min = position.get('range_min', 0)
        range_max = position.get('range_max', 0)
        risk_profile = position.get('risk_profile', 'medium')
        user_wallet = position.get('user_wallet')
        created_at = position.get('created_at', time.time())

        # Get current position info from chain
        pos_info = self.position_manager.get_position_info(protocol, pool_address, position_pubkey)
        if not pos_info:
            return None

        # Get current price/index
        if protocol == 'meteora':
            current_index = pos_info.get('activeBinId', 0)
            current_price = pos_info.get('activePrice', 0)
        else:
            current_index = pos_info.get('currentTick', 0)
            current_price = pos_info.get('currentPrice', 0)

        # Record price for volatility tracking
        self._record_price(pool_address, current_price)

        # Check if in range
        in_range = range_min <= current_index <= range_max

        # Calculate distance from edge
        range_size = range_max - range_min
        if range_size == 0:
            distance_from_edge = 0
        elif in_range:
            dist_from_lower = (current_index - range_min) / range_size
            dist_from_upper = (range_max - current_index) / range_size
            distance_from_edge = min(dist_from_lower, dist_from_upper)
        else:
            distance_from_edge = 0

        # Get fees
        fees_x = float(pos_info.get('feeXOwed', 0) or pos_info.get('feeOwedA', 0) or 0)
        fees_y = float(pos_info.get('feeYOwed', 0) or pos_info.get('feeOwedB', 0) or 0)

        # Convert fees to USD (simplified - would need price oracle in production)
        total_fees_usd = self._estimate_fees_usd(protocol, pool_address, fees_x, fees_y)

        # Calculate position age
        position_age_hours = (time.time() - created_at) / 3600

        # Determine if rebalance needed and why
        should_rebalance, reason = self._should_rebalance(position, PositionStatus(
            position_pubkey=position_pubkey,
            protocol=protocol,
            pool_address=pool_address,
            user_wallet=user_wallet,
            in_range=in_range,
            distance_from_edge=distance_from_edge,
            current_price=current_price,
            range_min_price=position.get('range_min_price', 0),
            range_max_price=position.get('range_max_price', 0),
            fees_x=fees_x,
            fees_y=fees_y,
            total_fees_usd=total_fees_usd,
            position_age_hours=position_age_hours,
            urgency='healthy',
            reason='healthy',
            timestamp=time.time(),
        ))

        # Determine urgency
        if reason == 'out_of_range':
            urgency = 'critical'
        elif reason in ('near_edge', 'high_volatility'):
            urgency = 'warning'
        elif reason in ('fee_threshold', 'max_age'):
            urgency = 'warning'
        else:
            urgency = 'healthy'

        return PositionStatus(
            position_pubkey=position_pubkey,
            protocol=protocol,
            pool_address=pool_address,
            user_wallet=user_wallet,
            in_range=in_range,
            distance_from_edge=distance_from_edge,
            current_price=current_price,
            range_min_price=position.get('range_min_price', 0),
            range_max_price=position.get('range_max_price', 0),
            fees_x=fees_x,
            fees_y=fees_y,
            total_fees_usd=total_fees_usd,
            position_age_hours=position_age_hours,
            urgency=urgency,
            reason=reason,
            timestamp=time.time(),
        )

    def _should_rebalance(self, position: Dict, status: PositionStatus) -> Tuple[bool, str]:
        """
        Check all configured triggers to determine if position should be rebalanced.

        Returns:
            Tuple of (should_rebalance: bool, reason: str)
        """
        risk_profile = position.get('risk_profile', 'medium')

        # 1. Distance threshold (always checked)
        threshold = self.settings.distance_thresholds.get(risk_profile, 0.15)

        if not status.in_range:
            return True, 'out_of_range'

        if status.distance_from_edge < threshold:
            return True, 'near_edge'

        # 2. Fee accumulation (if configured)
        if self.settings.fee_threshold_usd is not None:
            if status.total_fees_usd >= self.settings.fee_threshold_usd:
                return True, f'fee_threshold:{status.total_fees_usd:.2f}'

        # 3. Time-based (if configured)
        if self.settings.max_position_age_hours is not None:
            if status.position_age_hours >= self.settings.max_position_age_hours:
                return True, f'max_age:{status.position_age_hours:.1f}h'

        # 4. Volatility (if configured)
        if self.settings.volatility_threshold_pct is not None:
            price_change = self._get_price_change_pct(
                status.pool_address,
                self.settings.volatility_window_minutes
            )
            if abs(price_change) >= self.settings.volatility_threshold_pct:
                return True, f'high_volatility:{price_change:.2f}%'

        return False, 'healthy'

    def _record_price(self, pool_address: str, price: float):
        """Record price for volatility tracking."""
        if pool_address not in self._price_history:
            self._price_history[pool_address] = deque(maxlen=self._price_history_max_len)

        self._price_history[pool_address].append((time.time(), price))

    def _get_price_change_pct(self, pool_address: str, window_minutes: int) -> float:
        """Get price change percentage over the specified window."""
        if pool_address not in self._price_history:
            return 0.0

        history = self._price_history[pool_address]
        if len(history) < 2:
            return 0.0

        window_start = time.time() - (window_minutes * 60)

        # Find the oldest price within the window
        oldest_price = None
        for ts, price in history:
            if ts >= window_start:
                oldest_price = price
                break

        if oldest_price is None or oldest_price == 0:
            return 0.0

        current_price = history[-1][1]
        return ((current_price - oldest_price) / oldest_price) * 100

    def _estimate_fees_usd(self, protocol: str, pool_address: str, fees_x: float, fees_y: float) -> float:
        """Estimate total fees in USD.

        This is a simplified implementation. In production, you'd want to:
        - Get actual token prices from an oracle
        - Handle decimals correctly for each token
        """
        # For now, assume fees_y is in USDC/USDT (stablecoin) and fees_x value
        # This is a simplification - real implementation would need price feeds

        if self.price_service:
            try:
                # Get pool info for token prices
                pool_info = self.position_manager.get_pool(protocol, pool_address)
                if pool_info:
                    # Simplified: assume token Y is quote (like USDC)
                    # and use pool price for token X
                    price_x = pool_info.price if hasattr(pool_info, 'price') else 1.0
                    return (fees_x * price_x) + fees_y
            except Exception:
                pass

        # Fallback: just sum the raw values (assumes similar scale)
        return fees_x + fees_y

    def get_position_status(self, position_pubkey: str) -> Optional[PositionStatus]:
        """Get status for a specific position."""
        positions = self.db.get_all_active_liquidity_positions()

        for position in positions:
            if position.get('position_pubkey') == position_pubkey:
                return self._evaluate_position(position)

        return None
