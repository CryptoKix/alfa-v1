#!/usr/bin/env python3
"""
Rebalance Engine
Monitors positions and triggers rebalancing when price moves near range edges.
Supports bidirectional HFT-style auto-rebalancing for concentrated liquidity.
"""

import logging
import time
import asyncio
import threading
from typing import Optional, Dict, List, Literal
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict

import sio_bridge

logger = logging.getLogger("tactix.rebalance")

LiquidityProtocol = Literal['meteora', 'orca']


class RebalanceMode(Enum):
    MANUAL = 'manual'      # Notify user, wait for approval
    AUTOMATIC = 'automatic'  # Auto-execute using session keys


# Rebalance threshold configs (percentage from edge)
REBALANCE_THRESHOLDS = {
    'high': 0.10,    # 10% from edge - aggressive HFT style
    'medium': 0.15,  # 15% from edge - balanced
    'low': 0.20,     # 20% from edge - conservative
}

# Risk profile configs for new range calculation
RISK_CONFIGS = {
    'high': {'range_pct': 0.02, 'tick_range': 50},     # ~2% range, aggressive
    'medium': {'range_pct': 0.08, 'tick_range': 200},  # ~8% range, balanced
    'low': {'range_pct': 0.20, 'tick_range': 500},     # ~20% range, conservative
}


@dataclass
class RebalanceRateLimits:
    """Rate limiting configuration for rebalancing."""
    min_cooldown_seconds: int = 300          # 5 minutes minimum between rebalances
    max_rebalances_per_hour: int = 6         # Max 6 rebalances per hour
    max_rebalances_per_day: int = 50         # Max 50 rebalances per day
    min_fees_usd_before_rebalance: float = 1.0  # Min fees earned before rebalancing
    hysteresis_pct: float = 0.5              # 0.5% buffer zone to prevent flip-flopping
    estimated_tx_cost_usd: float = 0.12      # Estimated tx cost (2 txs for close+open)

    def to_dict(self) -> Dict:
        return {
            'minCooldownSeconds': self.min_cooldown_seconds,
            'maxRebalancesPerHour': self.max_rebalances_per_hour,
            'maxRebalancesPerDay': self.max_rebalances_per_day,
            'minFeesUsdBeforeRebalance': self.min_fees_usd_before_rebalance,
            'hysteresisPct': self.hysteresis_pct,
            'estimatedTxCostUsd': self.estimated_tx_cost_usd,
        }


@dataclass
class RebalanceStats:
    """Stats for a position's rebalancing activity."""
    position_pubkey: str
    last_rebalance_time: float = 0
    rebalances_this_hour: int = 0
    rebalances_today: int = 0
    total_rebalances: int = 0
    total_fees_collected_usd: float = 0
    total_tx_costs_usd: float = 0
    hour_window_start: float = 0
    day_window_start: float = 0

    def reset_hour_if_needed(self):
        """Reset hourly counter if window has passed."""
        now = time.time()
        if now - self.hour_window_start > 3600:
            self.hour_window_start = now
            self.rebalances_this_hour = 0

    def reset_day_if_needed(self):
        """Reset daily counter if window has passed."""
        now = time.time()
        if now - self.day_window_start > 86400:
            self.day_window_start = now
            self.rebalances_today = 0

    def record_rebalance(self, fees_collected_usd: float = 0, tx_cost_usd: float = 0):
        """Record a rebalance event."""
        self.reset_hour_if_needed()
        self.reset_day_if_needed()

        self.last_rebalance_time = time.time()
        self.rebalances_this_hour += 1
        self.rebalances_today += 1
        self.total_rebalances += 1
        self.total_fees_collected_usd += fees_collected_usd
        self.total_tx_costs_usd += tx_cost_usd

    def to_dict(self) -> Dict:
        return {
            'positionPubkey': self.position_pubkey,
            'lastRebalanceTime': self.last_rebalance_time,
            'rebalancesThisHour': self.rebalances_this_hour,
            'rebalancesToday': self.rebalances_today,
            'totalRebalances': self.total_rebalances,
            'totalFeesCollectedUsd': self.total_fees_collected_usd,
            'totalTxCostsUsd': self.total_tx_costs_usd,
            'netProfitUsd': self.total_fees_collected_usd - self.total_tx_costs_usd,
        }


@dataclass
class RebalanceSuggestion:
    """Represents a rebalance suggestion for a position."""
    position_pubkey: str
    protocol: LiquidityProtocol
    pool_address: str
    user_wallet: str
    reason: str  # 'out_of_range' | 'near_edge'
    current_price_index: int
    range_min: int
    range_max: int
    distance_from_edge: float
    suggested_range_min: int
    suggested_range_max: int
    urgency: str  # 'high' | 'medium' | 'low'
    auto_rebalance: bool
    timestamp: float

    def to_dict(self) -> Dict:
        return {
            'positionPubkey': self.position_pubkey,
            'protocol': self.protocol,
            'poolAddress': self.pool_address,
            'userWallet': self.user_wallet,
            'reason': self.reason,
            'currentPriceIndex': self.current_price_index,
            'rangeMin': self.range_min,
            'rangeMax': self.range_max,
            'distanceFromEdge': self.distance_from_edge,
            'suggestedRangeMin': self.suggested_range_min,
            'suggestedRangeMax': self.suggested_range_max,
            'urgency': self.urgency,
            'autoRebalance': self.auto_rebalance,
            'timestamp': self.timestamp
        }


@dataclass
class RebalanceResult:
    """Result of a rebalance operation."""
    position_pubkey: str
    old_position_pubkey: str
    new_position_pubkey: str
    close_signature: str
    open_signature: str
    old_range_min: int
    old_range_max: int
    new_range_min: int
    new_range_max: int
    timestamp: float

    def to_dict(self) -> Dict:
        return {
            'positionPubkey': self.position_pubkey,
            'oldPositionPubkey': self.old_position_pubkey,
            'newPositionPubkey': self.new_position_pubkey,
            'closeSignature': self.close_signature,
            'openSignature': self.open_signature,
            'oldRangeMin': self.old_range_min,
            'oldRangeMax': self.old_range_max,
            'newRangeMin': self.new_range_min,
            'newRangeMax': self.new_range_max,
            'timestamp': self.timestamp
        }


class RebalanceEngine:
    """
    Engine that monitors positions and triggers rebalancing when needed.

    Features:
    - Bidirectional auto-rebalancing (follows price up AND down)
    - Rate limiting (max rebalances per hour/day)
    - Cooldown between rebalances
    - Fee threshold check (only rebalance if profitable)
    - Hysteresis buffer to prevent flip-flopping at boundaries
    """

    def __init__(self, db, position_manager, session_key_service=None):
        self.db = db
        self.position_manager = position_manager
        self.session_key_service = session_key_service
        self._running = False
        self._check_interval = 15  # seconds - faster for HFT-style
        self._pending_suggestions: Dict[str, RebalanceSuggestion] = {}
        self._rebalance_history: List[RebalanceResult] = []

        # Rate limiting
        self.rate_limits = RebalanceRateLimits()
        self._position_stats: Dict[str, RebalanceStats] = {}

        # Track last seen price index for hysteresis
        self._last_seen_index: Dict[str, int] = {}
        self._triggered_exit: Dict[str, bool] = {}  # Track if we've already triggered on exit

    def start(self):
        """Start the rebalance monitoring loop."""
        if self._running:
            logger.warning("[Rebalance] Engine already running")
            return

        self._running = True
        thread = threading.Thread(target=self._monitoring_loop, daemon=True)
        thread.start()
        logger.info("[Rebalance] Engine started")

    def stop(self):
        """Stop the rebalance monitoring loop."""
        self._running = False
        logger.info("[Rebalance] Engine stopped")

    def _monitoring_loop(self):
        """Main monitoring loop that checks all positions periodically."""
        while self._running:
            try:
                self._check_all_positions()
            except Exception as e:
                logger.error(f"[Rebalance] Error in monitoring loop: {e}")

            time.sleep(self._check_interval)

    def _check_all_positions(self):
        """Check all active positions for rebalancing needs."""
        # Get all active positions
        positions = self.db.get_all_active_liquidity_positions()

        for pos in positions:
            try:
                suggestion = self._evaluate_position(pos)
                if suggestion:
                    self._handle_suggestion(suggestion)
            except Exception as e:
                logger.error(f"[Rebalance] Error evaluating position {pos.get('position_pubkey')}: {e}")

    def _get_or_create_stats(self, position_pubkey: str) -> RebalanceStats:
        """Get or create stats tracker for a position."""
        if position_pubkey not in self._position_stats:
            self._position_stats[position_pubkey] = RebalanceStats(
                position_pubkey=position_pubkey,
                hour_window_start=time.time(),
                day_window_start=time.time()
            )
        return self._position_stats[position_pubkey]

    def _check_rate_limits(self, position_pubkey: str) -> tuple[bool, str]:
        """Check if rebalance is allowed by rate limits. Returns (allowed, reason)."""
        stats = self._get_or_create_stats(position_pubkey)
        stats.reset_hour_if_needed()
        stats.reset_day_if_needed()

        now = time.time()

        # Check cooldown
        if stats.last_rebalance_time > 0:
            elapsed = now - stats.last_rebalance_time
            if elapsed < self.rate_limits.min_cooldown_seconds:
                return False, f"cooldown:{int(self.rate_limits.min_cooldown_seconds - elapsed)}s"

        # Check hourly limit
        if stats.rebalances_this_hour >= self.rate_limits.max_rebalances_per_hour:
            return False, f"hourly_limit:{stats.rebalances_this_hour}/{self.rate_limits.max_rebalances_per_hour}"

        # Check daily limit
        if stats.rebalances_today >= self.rate_limits.max_rebalances_per_day:
            return False, f"daily_limit:{stats.rebalances_today}/{self.rate_limits.max_rebalances_per_day}"

        return True, "allowed"

    def _check_hysteresis(self, position_pubkey: str, current_index: int, range_min: int, range_max: int) -> bool:
        """
        Check hysteresis to prevent flip-flopping at boundaries.

        Once price exits range, we require it to move an additional hysteresis_pct
        before triggering a rebalance. This prevents rapid back-and-forth rebalancing
        when price hovers at the edge.
        """
        range_size = range_max - range_min
        hysteresis_ticks = int(range_size * (self.rate_limits.hysteresis_pct / 100))

        in_range = range_min <= current_index <= range_max

        # Track if we've exited the range
        if in_range:
            # Reset exit trigger when back in range
            self._triggered_exit[position_pubkey] = False
            return False  # Don't suggest rebalance while in range (handled by near_edge logic)

        # Price is out of range
        if not self._triggered_exit.get(position_pubkey, False):
            # First time exiting - check if we've moved past hysteresis buffer
            if current_index > range_max:
                # Exited above - check hysteresis
                if current_index > range_max + hysteresis_ticks:
                    self._triggered_exit[position_pubkey] = True
                    return True
            elif current_index < range_min:
                # Exited below - check hysteresis
                if current_index < range_min - hysteresis_ticks:
                    self._triggered_exit[position_pubkey] = True
                    return True
            return False  # Haven't moved past hysteresis buffer yet

        return True  # Already triggered

    def _evaluate_position(self, position: Dict) -> Optional[RebalanceSuggestion]:
        """Evaluate a position and return rebalance suggestion if needed.

        Enhanced with:
        - Rate limiting (cooldown, hourly/daily limits)
        - Fee threshold check
        - Hysteresis buffer for boundary stability
        """
        protocol = position.get('protocol')
        pool_address = position.get('pool_address')
        position_pubkey = position.get('position_pubkey')
        range_min = position.get('range_min')
        range_max = position.get('range_max')
        risk_profile = position.get('risk_profile', 'medium')
        auto_rebalance = position.get('auto_rebalance', False)
        user_wallet = position.get('user_wallet')

        # Check rate limits first (for auto-rebalance positions)
        if auto_rebalance:
            allowed, limit_reason = self._check_rate_limits(position_pubkey)
            if not allowed:
                logger.debug(f"[Rebalance] Position {position_pubkey[:8]} rate limited: {limit_reason}")
                return None

        # Get current position info from chain
        pos_info = self.position_manager.get_position_info(protocol, pool_address, position_pubkey)
        if not pos_info:
            return None

        # Get current price index
        if protocol == 'meteora':
            current_index = pos_info.get('activeBinId', 0)
        else:
            current_index = pos_info.get('currentTick', 0)

        # Update last seen index
        self._last_seen_index[position_pubkey] = current_index

        # Check if out of range
        in_range = range_min <= current_index <= range_max

        # Calculate distance from edge
        range_size = range_max - range_min
        if range_size == 0:
            return None

        if in_range:
            dist_from_lower = (current_index - range_min) / range_size
            dist_from_upper = (range_max - current_index) / range_size
            distance_from_edge = min(dist_from_lower, dist_from_upper)
        else:
            # Out of range
            distance_from_edge = 0

        # Get threshold for this risk profile
        threshold = REBALANCE_THRESHOLDS.get(risk_profile, 0.15)

        # Determine if rebalance needed
        reason = None
        urgency = None

        if not in_range:
            # Check hysteresis for out-of-range positions
            if auto_rebalance and not self._check_hysteresis(position_pubkey, current_index, range_min, range_max):
                logger.debug(f"[Rebalance] Position {position_pubkey[:8]} waiting for hysteresis buffer")
                return None
            reason = 'out_of_range'
            urgency = 'high'
        elif distance_from_edge < threshold:
            reason = 'near_edge'
            urgency = 'medium' if distance_from_edge > threshold / 2 else 'high'
        else:
            # No rebalance needed
            return None

        # For auto-rebalance, check fee threshold (profitability check)
        if auto_rebalance and reason == 'near_edge':
            # Get fees owed
            fees_x = float(pos_info.get('feeXOwed', 0) or pos_info.get('feeOwedA', 0) or 0)
            fees_y = float(pos_info.get('feeYOwed', 0) or pos_info.get('feeOwedB', 0) or 0)

            # Rough USD estimate (assumes Y is quote token like USDC)
            # In production, use actual price feeds
            estimated_fees_usd = fees_y + (fees_x * pos_info.get('activePrice', pos_info.get('currentPrice', 1)))

            # Only rebalance if fees cover tx costs + min threshold
            min_required = self.rate_limits.estimated_tx_cost_usd + self.rate_limits.min_fees_usd_before_rebalance

            if estimated_fees_usd < min_required and reason == 'near_edge':
                logger.debug(f"[Rebalance] Position {position_pubkey[:8]} fees ${estimated_fees_usd:.2f} < min ${min_required:.2f}")
                # Still allow if urgency is high (very close to edge)
                if urgency != 'high':
                    return None

        # Calculate new range centered on current price
        new_range = self._calculate_new_centered_range(
            protocol,
            current_index,
            position.get('price_spacing', 1),
            risk_profile
        )

        return RebalanceSuggestion(
            position_pubkey=position_pubkey,
            protocol=protocol,
            pool_address=pool_address,
            user_wallet=user_wallet,
            reason=reason,
            current_price_index=current_index,
            range_min=range_min,
            range_max=range_max,
            distance_from_edge=distance_from_edge,
            suggested_range_min=new_range['range_min'],
            suggested_range_max=new_range['range_max'],
            urgency=urgency,
            auto_rebalance=auto_rebalance,
            timestamp=time.time()
        )

    def _calculate_new_centered_range(
        self,
        protocol: LiquidityProtocol,
        current_index: int,
        price_spacing: int,
        risk_profile: str
    ) -> Dict[str, int]:
        """Calculate a new range centered on current price.

        Uses risk profile configs with both percentage-based and tick-based ranges.
        For HFT-style rebalancing, we use tighter ranges to maximize fee capture.
        """
        config = RISK_CONFIGS.get(risk_profile, RISK_CONFIGS['medium'])
        tick_range = config.get('tick_range', 200)  # Default to medium
        range_pct = config['range_pct']

        if protocol == 'meteora':
            # For Meteora, calculate based on bin step
            # Each bin = binStep basis points
            # Use percentage-based calculation
            units = min(int((range_pct * 10000) / price_spacing), 69)
            half_units = max(units // 2, 5)  # Minimum 5 bins on each side

            return {
                'range_min': current_index - half_units,
                'range_max': current_index + half_units
            }
        else:
            # For Orca, use tick_range directly for more control
            # This allows precise HFT-style positioning
            half_ticks = tick_range // 2

            # Align to tick spacing
            aligned_half = (half_ticks // price_spacing) * price_spacing
            aligned_current = (current_index // price_spacing) * price_spacing

            # Ensure minimum range
            aligned_half = max(aligned_half, price_spacing * 5)

            return {
                'range_min': aligned_current - aligned_half,
                'range_max': aligned_current + aligned_half
            }

    def _handle_suggestion(self, suggestion: RebalanceSuggestion):
        """Handle a rebalance suggestion."""
        position_key = suggestion.position_pubkey

        # Check if we already have a pending suggestion for this position
        existing = self._pending_suggestions.get(position_key)
        if existing and time.time() - existing.timestamp < 300:  # 5 min cooldown
            return

        # Store the suggestion
        self._pending_suggestions[position_key] = suggestion

        if suggestion.auto_rebalance and self.session_key_service:
            # Auto-execute rebalance
            logger.info(f"[Rebalance] Auto-rebalancing position {position_key}")
            self._execute_auto_rebalance(suggestion)
        else:
            # Emit suggestion to user
            logger.info(f"[Rebalance] Suggesting rebalance for position {position_key}")
            sio_bridge.emit('rebalance_suggestion', suggestion.to_dict(), namespace='/liquidity')

    def _execute_auto_rebalance(self, suggestion: RebalanceSuggestion):
        """Execute automatic rebalance using session keys."""
        try:
            # Emit started event
            sio_bridge.emit('rebalance_started', {
                'position_pubkey': suggestion.position_pubkey,
                'timestamp': time.time()
            }, namespace='/liquidity')

            # Get session key for user
            session_key = self.session_key_service.get_session_key(suggestion.user_wallet)
            if not session_key:
                logger.warning(f"[Rebalance] No session key for {suggestion.user_wallet}")
                # Fall back to manual mode
                sio_bridge.emit('rebalance_suggestion', suggestion.to_dict(), namespace='/liquidity')
                return

            # Step 1: Close old position
            close_result = self._close_position_with_session_key(
                suggestion.protocol,
                suggestion.pool_address,
                suggestion.position_pubkey,
                suggestion.user_wallet,
                session_key
            )

            if not close_result or not close_result.get('success'):
                raise Exception("Failed to close old position")

            # Step 2: Open new position with withdrawn tokens
            open_result = self._open_position_with_session_key(
                suggestion.protocol,
                suggestion.pool_address,
                suggestion.user_wallet,
                suggestion.suggested_range_min,
                suggestion.suggested_range_max,
                close_result.get('withdrawn_x', 0),
                close_result.get('withdrawn_y', 0),
                session_key
            )

            if not open_result or not open_result.get('success'):
                raise Exception("Failed to open new position")

            # Record result
            result = RebalanceResult(
                position_pubkey=suggestion.position_pubkey,
                old_position_pubkey=suggestion.position_pubkey,
                new_position_pubkey=open_result.get('position_pubkey', ''),
                close_signature=close_result.get('signature', ''),
                open_signature=open_result.get('signature', ''),
                old_range_min=suggestion.range_min,
                old_range_max=suggestion.range_max,
                new_range_min=suggestion.suggested_range_min,
                new_range_max=suggestion.suggested_range_max,
                timestamp=time.time()
            )

            self._rebalance_history.append(result)

            # Update database
            self.db.record_rebalance(result.to_dict())

            # Record stats for rate limiting
            stats = self._get_or_create_stats(suggestion.position_pubkey)
            fees_collected = close_result.get('fees_collected_usd', 0)
            stats.record_rebalance(
                fees_collected_usd=fees_collected,
                tx_cost_usd=self.rate_limits.estimated_tx_cost_usd
            )

            # Reset hysteresis trigger
            self._triggered_exit.pop(suggestion.position_pubkey, None)

            # Remove from pending
            self._pending_suggestions.pop(suggestion.position_pubkey, None)

            # Emit completed event with stats
            result_dict = result.to_dict()
            result_dict['stats'] = stats.to_dict()
            sio_bridge.emit('rebalance_completed', result_dict, namespace='/liquidity')

            logger.info(f"[Rebalance] Completed rebalance for {suggestion.position_pubkey} (total: {stats.total_rebalances})")

        except Exception as e:
            logger.error(f"[Rebalance] Auto-rebalance failed: {e}")
            sio_bridge.emit('rebalance_failed', {
                'position_pubkey': suggestion.position_pubkey,
                'error': str(e),
                'timestamp': time.time()
            }, namespace='/liquidity')

    def _close_position_with_session_key(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        position_pubkey: str,
        user_wallet: str,
        session_key
    ) -> Optional[Dict]:
        """Close position using session key."""
        # Build close transaction
        tx_result = self.position_manager.prepare_close_position(
            protocol, pool_address, position_pubkey, user_wallet
        )

        if not tx_result or not tx_result.get('success'):
            return None

        # Sign and submit with session key
        signed_tx = self.session_key_service.sign_transaction(
            session_key,
            tx_result.get('transaction')
        )

        if not signed_tx:
            return None

        # Submit to chain
        signature = self.session_key_service.submit_transaction(signed_tx)

        return {
            'success': True,
            'signature': signature,
            'withdrawn_x': tx_result.get('withdrawn_x', 0),
            'withdrawn_y': tx_result.get('withdrawn_y', 0)
        }

    def _open_position_with_session_key(
        self,
        protocol: LiquidityProtocol,
        pool_address: str,
        user_wallet: str,
        range_min: int,
        range_max: int,
        amount_x: float,
        amount_y: float,
        session_key
    ) -> Optional[Dict]:
        """Open new position using session key."""
        # For this we need direct sidecar access with specific range
        if protocol == 'meteora':
            tx_result = self.position_manager.meteora_client.build_create_position_tx({
                'poolAddress': pool_address,
                'userWallet': user_wallet,
                'totalXAmount': str(int(amount_x)),
                'totalYAmount': str(int(amount_y)),
                'strategyType': 'spot',
                'minBinId': range_min,
                'maxBinId': range_max
            })
        else:
            tx_result = self.position_manager.orca_client.build_open_position_tx({
                'poolAddress': pool_address,
                'userWallet': user_wallet,
                'tickLower': range_min,
                'tickUpper': range_max,
                'tokenAAmount': str(amount_x),
                'slippagePct': 1
            })

        if not tx_result or not tx_result.get('success'):
            return None

        # Sign and submit with session key
        signed_tx = self.session_key_service.sign_transaction(
            session_key,
            tx_result.get('transaction')
        )

        if not signed_tx:
            return None

        signature = self.session_key_service.submit_transaction(signed_tx)

        return {
            'success': True,
            'signature': signature,
            'position_pubkey': tx_result.get('positionPubkey') or tx_result.get('positionMint')
        }

    # ==================== Manual Rebalance API ====================

    def approve_rebalance(self, position_pubkey: str) -> Optional[Dict]:
        """User approves a pending rebalance suggestion."""
        suggestion = self._pending_suggestions.get(position_pubkey)
        if not suggestion:
            return None

        # Return the transaction data for the user to sign
        # First close old position
        close_tx = self.position_manager.prepare_close_position(
            suggestion.protocol,
            suggestion.pool_address,
            suggestion.position_pubkey,
            suggestion.user_wallet
        )

        return {
            'suggestion': suggestion.to_dict(),
            'closeTransaction': close_tx,
            'newRangeMin': suggestion.suggested_range_min,
            'newRangeMax': suggestion.suggested_range_max
        }

    def dismiss_suggestion(self, position_pubkey: str):
        """User dismisses a rebalance suggestion."""
        self._pending_suggestions.pop(position_pubkey, None)

    def get_pending_suggestions(self, user_wallet: Optional[str] = None) -> List[Dict]:
        """Get all pending rebalance suggestions."""
        suggestions = list(self._pending_suggestions.values())
        if user_wallet:
            suggestions = [s for s in suggestions if s.user_wallet == user_wallet]
        return [s.to_dict() for s in suggestions]

    def get_rebalance_history(
        self,
        user_wallet: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict]:
        """Get rebalance history."""
        history = self._rebalance_history[-limit:]
        # Could also fetch from DB for persistence
        return [r.to_dict() for r in history]

    # ==================== Settings ====================

    def get_settings(self) -> Dict:
        """Get rebalance engine settings."""
        return {
            'thresholds': REBALANCE_THRESHOLDS,
            'riskConfigs': {
                k: {
                    'rangePct': v['range_pct'] * 100,
                    'tickRange': v.get('tick_range', 200)
                } for k, v in RISK_CONFIGS.items()
            },
            'rateLimits': self.rate_limits.to_dict(),
            'checkInterval': self._check_interval,
            'running': self._running
        }

    def update_settings(self, updates: Dict):
        """Update rebalance engine settings."""
        if 'checkInterval' in updates:
            self._check_interval = max(5, min(300, updates['checkInterval']))

        if 'rateLimits' in updates:
            rl = updates['rateLimits']
            if 'minCooldownSeconds' in rl:
                self.rate_limits.min_cooldown_seconds = max(60, rl['minCooldownSeconds'])
            if 'maxRebalancesPerHour' in rl:
                self.rate_limits.max_rebalances_per_hour = max(1, min(20, rl['maxRebalancesPerHour']))
            if 'maxRebalancesPerDay' in rl:
                self.rate_limits.max_rebalances_per_day = max(1, min(100, rl['maxRebalancesPerDay']))
            if 'minFeesUsdBeforeRebalance' in rl:
                self.rate_limits.min_fees_usd_before_rebalance = max(0, rl['minFeesUsdBeforeRebalance'])
            if 'hysteresisPct' in rl:
                self.rate_limits.hysteresis_pct = max(0, min(5, rl['hysteresisPct']))
            if 'estimatedTxCostUsd' in rl:
                self.rate_limits.estimated_tx_cost_usd = max(0, rl['estimatedTxCostUsd'])

        logger.info(f"[Rebalance] Settings updated: interval={self._check_interval}s, limits={self.rate_limits.to_dict()}")

    def update_check_interval(self, interval: int):
        """Update the check interval."""
        self._check_interval = max(5, min(300, interval))  # 5s - 5min for HFT-style

    def get_position_stats(self, position_pubkey: str) -> Optional[Dict]:
        """Get rebalance stats for a position."""
        stats = self._position_stats.get(position_pubkey)
        if stats:
            stats.reset_hour_if_needed()
            stats.reset_day_if_needed()
            return stats.to_dict()
        return None

    def get_all_stats(self) -> List[Dict]:
        """Get rebalance stats for all tracked positions."""
        result = []
        for pubkey, stats in self._position_stats.items():
            stats.reset_hour_if_needed()
            stats.reset_day_if_needed()
            result.append(stats.to_dict())
        return result
