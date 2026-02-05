#!/usr/bin/env python3
"""
Yield Optimizer Strategy
Automatically moves funds to the highest APY opportunities across protocols.

Features:
- Monitors current position APY vs best available
- Rebalances when improvement exceeds threshold (accounting for gas)
- Supports risk level filtering
- Configurable check intervals
"""

import logging
from typing import Dict, List, Optional

from . import BaseYieldStrategy, register_strategy

logger = logging.getLogger("tactix.yield.strategies.optimizer")


@register_strategy('yield_optimizer')
class YieldOptimizerStrategy(BaseYieldStrategy):
    """
    Auto-optimize yield by moving to highest APY opportunities.

    Config options:
        - min_apy_improvement: Minimum APY improvement to trigger move (default: 2.0)
        - check_interval_seconds: How often to check (default: 14400 = 4 hours)
        - risk_filter: Only consider opportunities of this risk level (low/medium/high/all)
        - deposit_symbol: Token symbol to optimize (e.g., 'USDC', 'SOL')
        - min_tvl: Minimum TVL for target opportunities (default: 100000)
        - max_slippage_pct: Maximum acceptable slippage (default: 0.5)
        - excluded_protocols: List of protocols to exclude

    State:
        - current_protocol: Protocol where funds are currently deposited
        - current_vault: Current vault address
        - current_apy: APY when deposited
        - deposited_amount: Amount deposited
        - last_move_time: Timestamp of last move
    """

    STRATEGY_TYPE = 'yield_optimizer'
    DEFAULT_CONFIG = {
        'min_apy_improvement': 2.0,  # Need at least 2% APY improvement
        'check_interval_seconds': 14400,  # 4 hours
        'risk_filter': 'all',
        'deposit_symbol': None,  # Required
        'min_tvl': 100000,
        'max_slippage_pct': 0.5,
        'excluded_protocols': []
    }

    def evaluate(self) -> Dict:
        """
        Evaluate if we should move funds to a better opportunity.

        Returns:
            Dict with needs_action, action_type, and details
        """
        deposit_symbol = self.config.get('deposit_symbol')
        if not deposit_symbol:
            logger.warning(f"[YieldOptimizer {self.strategy_id}] No deposit_symbol configured")
            return {'needs_action': False, 'reason': 'no_deposit_symbol_configured'}

        # Get current position
        current = self.state.get('current_protocol')
        current_vault = self.state.get('current_vault')
        current_apy = self.state.get('current_apy', 0)
        deposited = self.state.get('deposited_amount', 0)

        # Get best available opportunity
        best = self._find_best_opportunity(deposit_symbol)

        if not best:
            logger.info(f"[YieldOptimizer {self.strategy_id}] No opportunities found for {deposit_symbol}")
            return {'needs_action': False, 'reason': 'no_opportunities'}

        # If no current position, recommend deposit to best
        if not current or deposited <= 0:
            return {
                'needs_action': True,
                'action_type': 'initial_deposit',
                'details': {
                    'target_protocol': best.protocol,
                    'target_vault': best.vault_address,
                    'target_apy': best.apy,
                    'target_name': best.name,
                    'deposit_symbol': deposit_symbol
                }
            }

        # Check if best opportunity is better than current
        min_improvement = self.config.get('min_apy_improvement', 2.0)
        apy_difference = best.apy - current_apy

        # Also check if current vault is same as best (no action needed)
        if best.vault_address == current_vault:
            # Just update the current APY in state
            if best.apy != current_apy:
                self.update_state({'current_apy': best.apy})
            return {'needs_action': False, 'reason': 'already_in_best'}

        if apy_difference < min_improvement:
            logger.info(
                f"[YieldOptimizer {self.strategy_id}] APY improvement {apy_difference:.2f}% "
                f"< threshold {min_improvement}%"
            )
            return {
                'needs_action': False,
                'reason': 'improvement_below_threshold',
                'current_apy': current_apy,
                'best_apy': best.apy,
                'difference': apy_difference
            }

        # Estimate if move is profitable after gas
        # Rough estimate: 2 transactions (withdraw + deposit) ~ 0.002 SOL ~ $0.25
        gas_cost_estimate = 0.25  # USD
        days_to_breakeven = gas_cost_estimate / (deposited * (apy_difference / 100) / 365)

        if days_to_breakeven > 30:  # More than 30 days to breakeven
            logger.info(
                f"[YieldOptimizer {self.strategy_id}] Move not profitable. "
                f"Breakeven: {days_to_breakeven:.1f} days"
            )
            return {
                'needs_action': False,
                'reason': 'not_profitable_after_gas',
                'breakeven_days': days_to_breakeven
            }

        # Recommend rebalance
        return {
            'needs_action': True,
            'action_type': 'rebalance',
            'details': {
                'from_protocol': current,
                'from_vault': current_vault,
                'from_apy': current_apy,
                'to_protocol': best.protocol,
                'to_vault': best.vault_address,
                'to_apy': best.apy,
                'to_name': best.name,
                'apy_improvement': apy_difference,
                'breakeven_days': days_to_breakeven,
                'amount': deposited
            }
        }

    def execute(self, evaluation: Dict) -> Dict:
        """Execute the yield optimization action."""
        action_type = evaluation.get('action_type')
        details = evaluation.get('details', {})

        if action_type == 'initial_deposit':
            return self._execute_initial_deposit(details)
        elif action_type == 'rebalance':
            return self._execute_rebalance(details)
        else:
            return {'success': False, 'error': f'Unknown action type: {action_type}'}

    def _find_best_opportunity(self, deposit_symbol: str):
        """Find the best yield opportunity for the given token."""
        if not hasattr(self, 'yield_manager') or not self.yield_manager:
            logger.error(f"[YieldOptimizer {self.strategy_id}] No yield_manager available")
            return None

        risk_filter = self.config.get('risk_filter')
        if risk_filter == 'all':
            risk_filter = None

        min_tvl = self.config.get('min_tvl', 100000)
        excluded = self.config.get('excluded_protocols', [])

        opportunities = self.yield_manager.get_opportunities(
            risk_filter=risk_filter,
            deposit_symbol_filter=deposit_symbol,
            min_tvl=min_tvl
        )

        # Filter out excluded protocols
        if excluded:
            opportunities = [o for o in opportunities if o.protocol not in excluded]

        if not opportunities:
            return None

        # Return best (already sorted by APY descending)
        return opportunities[0]

    def _execute_initial_deposit(self, details: Dict) -> Dict:
        """Execute initial deposit to best opportunity."""
        # This would need actual deposit execution
        # For now, we just update state to track the "virtual" position

        logger.info(
            f"[YieldOptimizer {self.strategy_id}] Initial deposit to "
            f"{details['target_protocol']} ({details['target_name']}) at {details['target_apy']}% APY"
        )

        # In production, this would:
        # 1. Build deposit transaction via yield_manager
        # 2. Sign with session key
        # 3. Submit transaction
        # 4. Update state on success

        # For now, just update state
        self.update_state({
            'current_protocol': details['target_protocol'],
            'current_vault': details['target_vault'],
            'current_apy': details['target_apy'],
            'last_evaluation': details
        })

        return {
            'success': True,
            'action': 'initial_deposit',
            'protocol': details['target_protocol'],
            'vault_address': details['target_vault'],
            'note': 'State updated. Actual deposit requires wallet integration.'
        }

    def _execute_rebalance(self, details: Dict) -> Dict:
        """Execute rebalance from one vault to another."""
        logger.info(
            f"[YieldOptimizer {self.strategy_id}] Rebalancing from "
            f"{details['from_protocol']} ({details['from_apy']}%) to "
            f"{details['to_protocol']} ({details['to_apy']}%) - "
            f"+{details['apy_improvement']:.2f}% improvement"
        )

        # In production, this would:
        # 1. Build withdraw transaction from current vault
        # 2. Build deposit transaction to new vault
        # 3. Sign and submit both transactions
        # 4. Update state on success

        # For now, just update state
        self.update_state({
            'current_protocol': details['to_protocol'],
            'current_vault': details['to_vault'],
            'current_apy': details['to_apy'],
            'previous_protocol': details['from_protocol'],
            'previous_apy': details['from_apy'],
            'last_rebalance_improvement': details['apy_improvement'],
            'last_evaluation': details
        })

        return {
            'success': True,
            'action': 'rebalance',
            'protocol': details['to_protocol'],
            'vault_address': details['to_vault'],
            'apy_improvement': details['apy_improvement'],
            'note': 'State updated. Actual rebalance requires wallet integration.'
        }
