#!/usr/bin/env python3
"""
Yield Strategy Module
Automated yield optimization strategies across multiple protocols.

Strategy Types:
- yield_optimizer: Auto-move funds to highest APY
- risk_balanced: Maintain target allocation across risk levels
- leverage_loops: Combine Loopscale loops with Kamino collateral
- stablecoin_maximizer: Rotate stablecoins for best rates
- lst_yield: Optimize LST yields
"""

import time
import threading
import logging
from typing import Dict, List, Optional, Type
from abc import ABC, abstractmethod

logger = logging.getLogger("tactix.yield.strategies")

# Registry of strategy classes
STRATEGY_REGISTRY: Dict[str, Type['BaseYieldStrategy']] = {}


def register_strategy(strategy_type: str):
    """Decorator to register a strategy class."""
    def decorator(cls):
        STRATEGY_REGISTRY[strategy_type] = cls
        return cls
    return decorator


class BaseYieldStrategy(ABC):
    """Base class for yield optimization strategies."""

    STRATEGY_TYPE = 'base'
    DEFAULT_CONFIG = {}

    def __init__(self, strategy_id: int, wallet_address: str, config: dict, state: dict, db):
        self.strategy_id = strategy_id
        self.wallet_address = wallet_address
        self.config = {**self.DEFAULT_CONFIG, **config}
        self.state = state
        self.db = db
        self._running = False

    @abstractmethod
    def evaluate(self) -> Dict:
        """
        Evaluate current positions and determine if action is needed.

        Returns:
            Dict with:
                - needs_action: bool
                - action_type: str ('deposit', 'withdraw', 'rebalance', 'none')
                - details: dict with action-specific data
        """
        pass

    @abstractmethod
    def execute(self, evaluation: Dict) -> Dict:
        """
        Execute the recommended action from evaluation.

        Returns:
            Dict with:
                - success: bool
                - action: str
                - signature: str (if transaction was made)
                - profit: float (if applicable)
                - error: str (if failed)
        """
        pass

    def run_cycle(self) -> Dict:
        """Run a single strategy cycle (evaluate + execute if needed)."""
        try:
            logger.info(f"[Strategy {self.strategy_id}] Running cycle...")

            # Evaluate
            evaluation = self.evaluate()

            if not evaluation.get('needs_action'):
                logger.info(f"[Strategy {self.strategy_id}] No action needed")
                self._log_action('evaluate', result='no_action', details=evaluation)
                return {'success': True, 'action': 'none'}

            # Execute
            result = self.execute(evaluation)

            # Log the action
            self._log_action(
                action=evaluation.get('action_type', 'unknown'),
                protocol=result.get('protocol'),
                vault_address=result.get('vault_address'),
                amount=result.get('amount'),
                signature=result.get('signature'),
                result='success' if result.get('success') else 'failed',
                details=result
            )

            # Update run count
            self.db.increment_yield_strategy_run(
                self.strategy_id,
                profit=result.get('profit', 0)
            )

            return result

        except Exception as e:
            logger.error(f"[Strategy {self.strategy_id}] Cycle error: {e}")
            self._log_action('error', result='failed', details={'error': str(e)})
            return {'success': False, 'error': str(e)}

    def _log_action(self, action: str, protocol=None, vault_address=None,
                   amount=None, signature=None, result=None, details=None):
        """Log a strategy action to the database."""
        try:
            self.db.log_yield_strategy_action(
                self.strategy_id, action, protocol, vault_address,
                amount, signature, result, details
            )
        except Exception as e:
            logger.error(f"[Strategy {self.strategy_id}] Failed to log action: {e}")

    def update_state(self, new_state: dict):
        """Update strategy state in database."""
        self.state.update(new_state)
        self.db.update_yield_strategy_state(self.strategy_id, self.state)

    def get_check_interval(self) -> int:
        """Get the check interval in seconds."""
        return self.config.get('check_interval_seconds', 14400)  # Default 4 hours


class StrategyScheduler:
    """
    Background scheduler for running yield strategies.
    Runs as a daemon thread checking for strategies that need to run.
    """

    def __init__(self, db, yield_manager):
        self.db = db
        self.yield_manager = yield_manager
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._strategies: Dict[int, BaseYieldStrategy] = {}

    def start(self):
        """Start the strategy scheduler."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("[StrategyScheduler] Started")

    def stop(self):
        """Stop the strategy scheduler."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("[StrategyScheduler] Stopped")

    def _run_loop(self):
        """Main scheduler loop."""
        while self._running:
            try:
                self._check_and_run_strategies()
            except Exception as e:
                logger.error(f"[StrategyScheduler] Loop error: {e}")

            # Check every 60 seconds
            time.sleep(60)

    def _check_and_run_strategies(self):
        """Check all active strategies and run those that are due."""
        strategies = self.db.get_all_active_yield_strategies()

        for strat_data in strategies:
            try:
                strategy_id = strat_data['id']
                strategy_type = strat_data['strategy_type']

                # Check if strategy is due to run
                if not self._is_due(strat_data):
                    continue

                # Get or create strategy instance
                strategy = self._get_strategy_instance(strat_data)
                if not strategy:
                    logger.warning(f"[StrategyScheduler] Unknown strategy type: {strategy_type}")
                    continue

                # Run the strategy
                logger.info(f"[StrategyScheduler] Running strategy {strategy_id} ({strategy_type})")
                result = strategy.run_cycle()

                # Update next run time
                interval = strategy.get_check_interval()
                self.db.update_yield_strategy(strategy_id, {
                    'last_run': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'next_run': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(time.time() + interval))
                })

            except Exception as e:
                logger.error(f"[StrategyScheduler] Strategy {strat_data.get('id')} error: {e}")

    def _is_due(self, strat_data: dict) -> bool:
        """Check if a strategy is due to run."""
        from datetime import datetime

        next_run = strat_data.get('next_run')
        if not next_run:
            return True  # Never run before

        try:
            next_run_time = datetime.strptime(next_run, '%Y-%m-%d %H:%M:%S')
            return datetime.now() >= next_run_time
        except:
            return True  # Invalid date format, run anyway

    def _get_strategy_instance(self, strat_data: dict) -> Optional[BaseYieldStrategy]:
        """Get or create a strategy instance."""
        strategy_id = strat_data['id']

        # Check cache
        if strategy_id in self._strategies:
            # Update config/state from database
            strategy = self._strategies[strategy_id]
            strategy.config = strat_data.get('config', {})
            strategy.state = strat_data.get('state', {})
            return strategy

        # Create new instance
        strategy_type = strat_data['strategy_type']
        strategy_class = STRATEGY_REGISTRY.get(strategy_type)

        if not strategy_class:
            return None

        strategy = strategy_class(
            strategy_id=strategy_id,
            wallet_address=strat_data['wallet_address'],
            config=strat_data.get('config', {}),
            state=strat_data.get('state', {}),
            db=self.db
        )

        # Set the yield manager reference
        strategy.yield_manager = self.yield_manager

        self._strategies[strategy_id] = strategy
        return strategy


# Import strategy implementations to register them
from .yield_optimizer import YieldOptimizerStrategy
