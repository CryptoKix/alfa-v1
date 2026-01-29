#!/usr/bin/env python3
"""
Rebalance Engine
Monitors positions and triggers rebalancing when price moves near range edges.
"""

import logging
import time
import asyncio
import threading
from typing import Optional, Dict, List, Literal
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("tactix.rebalance")

LiquidityProtocol = Literal['meteora', 'orca']


class RebalanceMode(Enum):
    MANUAL = 'manual'      # Notify user, wait for approval
    AUTOMATIC = 'automatic'  # Auto-execute using session keys


# Rebalance threshold configs (percentage from edge)
REBALANCE_THRESHOLDS = {
    'high': 0.10,    # 10% from edge
    'medium': 0.15,  # 15% from edge
    'low': 0.20,     # 20% from edge
}

# Risk profile configs for new range calculation
RISK_CONFIGS = {
    'high': {'range_pct': 0.075},    # ~7.5% range
    'medium': {'range_pct': 0.20},   # ~20% range
    'low': {'range_pct': 0.50},      # ~50% range
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
    """

    def __init__(self, db, socketio, position_manager, session_key_service=None):
        self.db = db
        self.socketio = socketio
        self.position_manager = position_manager
        self.session_key_service = session_key_service
        self._running = False
        self._check_interval = 30  # seconds
        self._pending_suggestions: Dict[str, RebalanceSuggestion] = {}
        self._rebalance_history: List[RebalanceResult] = []

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

    def _evaluate_position(self, position: Dict) -> Optional[RebalanceSuggestion]:
        """Evaluate a position and return rebalance suggestion if needed."""
        protocol = position.get('protocol')
        pool_address = position.get('pool_address')
        position_pubkey = position.get('position_pubkey')
        range_min = position.get('range_min')
        range_max = position.get('range_max')
        risk_profile = position.get('risk_profile', 'medium')
        auto_rebalance = position.get('auto_rebalance', False)
        user_wallet = position.get('user_wallet')

        # Get current position info from chain
        pos_info = self.position_manager.get_position_info(protocol, pool_address, position_pubkey)
        if not pos_info:
            return None

        # Get current price index
        if protocol == 'meteora':
            current_index = pos_info.get('activeBinId', 0)
        else:
            current_index = pos_info.get('currentTick', 0)

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
        if not in_range:
            reason = 'out_of_range'
            urgency = 'high'
        elif distance_from_edge < threshold:
            reason = 'near_edge'
            urgency = 'medium' if distance_from_edge > threshold / 2 else 'high'
        else:
            # No rebalance needed
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
        """Calculate a new range centered on current price."""
        config = RISK_CONFIGS.get(risk_profile, RISK_CONFIGS['medium'])
        range_pct = config['range_pct']

        if protocol == 'meteora':
            # For Meteora, calculate based on bin step
            # Each bin = binStep basis points
            units = min(int((range_pct * 10000) / price_spacing), 69)
            half_units = units // 2

            return {
                'range_min': current_index - half_units,
                'range_max': current_index + half_units
            }
        else:
            # For Orca, calculate based on tick spacing
            # Price ratio = 1.0001^ticks
            import math
            ticks_for_range = int(math.log(1 + range_pct) / math.log(1.0001))
            half_ticks = ticks_for_range // 2

            # Align to tick spacing
            aligned_half = (half_ticks // price_spacing) * price_spacing
            aligned_current = (current_index // price_spacing) * price_spacing

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
            self.socketio.emit('rebalance_suggestion', suggestion.to_dict(), namespace='/liquidity')

    def _execute_auto_rebalance(self, suggestion: RebalanceSuggestion):
        """Execute automatic rebalance using session keys."""
        try:
            # Emit started event
            self.socketio.emit('rebalance_started', {
                'position_pubkey': suggestion.position_pubkey,
                'timestamp': time.time()
            }, namespace='/liquidity')

            # Get session key for user
            session_key = self.session_key_service.get_session_key(suggestion.user_wallet)
            if not session_key:
                logger.warning(f"[Rebalance] No session key for {suggestion.user_wallet}")
                # Fall back to manual mode
                self.socketio.emit('rebalance_suggestion', suggestion.to_dict(), namespace='/liquidity')
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

            # Remove from pending
            self._pending_suggestions.pop(suggestion.position_pubkey, None)

            # Emit completed event
            self.socketio.emit('rebalance_completed', result.to_dict(), namespace='/liquidity')

            logger.info(f"[Rebalance] Completed rebalance for {suggestion.position_pubkey}")

        except Exception as e:
            logger.error(f"[Rebalance] Auto-rebalance failed: {e}")
            self.socketio.emit('rebalance_failed', {
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
            'riskConfigs': {k: {'rangePct': v['range_pct'] * 100} for k, v in RISK_CONFIGS.items()},
            'checkInterval': self._check_interval,
            'running': self._running
        }

    def update_check_interval(self, interval: int):
        """Update the check interval."""
        self._check_interval = max(10, min(300, interval))  # 10s - 5min
