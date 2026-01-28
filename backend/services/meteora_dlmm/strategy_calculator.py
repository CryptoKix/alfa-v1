#!/usr/bin/env python3
"""
Strategy Calculator for Meteora DLMM
Calculates bin ranges and liquidity distribution based on risk profiles.
"""

from enum import Enum
from typing import Dict, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger("tactix.dlmm.strategy")


class RiskProfile(Enum):
    """Risk profile levels for DLMM positions."""
    HIGH = "high"       # Tight range, high IL risk, very high fees
    MEDIUM = "medium"   # Moderate range, balanced
    LOW = "low"         # Wide range, low IL risk, lower fees


class StrategyType(Enum):
    """Liquidity distribution strategy types."""
    SPOT = "spot"       # Uniform distribution
    CURVE = "curve"     # Bell curve, concentrated in middle
    BIDASK = "bidask"   # Edge-heavy, for volatility capture


@dataclass
class RiskConfig:
    """Configuration for a risk profile."""
    range_pct: float    # Range width as percentage (e.g., 0.075 = 7.5%)
    min_bins: int       # Minimum number of bins
    max_bins: int       # Maximum number of bins
    rebalance_threshold: float  # Rebalance when active bin reaches this % of range edge


# Risk profile configurations
RISK_CONFIGS: Dict[RiskProfile, RiskConfig] = {
    RiskProfile.HIGH: RiskConfig(
        range_pct=0.075,
        min_bins=10,
        max_bins=20,
        rebalance_threshold=0.10
    ),
    RiskProfile.MEDIUM: RiskConfig(
        range_pct=0.20,
        min_bins=30,
        max_bins=50,
        rebalance_threshold=0.15
    ),
    RiskProfile.LOW: RiskConfig(
        range_pct=0.50,
        min_bins=60,
        max_bins=69,
        rebalance_threshold=0.20
    ),
}


class StrategyCalculator:
    """Calculator for DLMM position strategies."""

    @staticmethod
    def get_risk_profile_from_bin_step(bin_step: int) -> RiskProfile:
        """
        Determine recommended risk profile based on pool's bin step.
        Higher bin step = more volatile pair = safer to use lower risk profile.
        """
        if bin_step <= 10:
            # Stable pairs (stablecoins, correlated assets)
            return RiskProfile.HIGH
        elif bin_step <= 50:
            # Standard pairs
            return RiskProfile.MEDIUM
        else:
            # Volatile pairs
            return RiskProfile.LOW

    @staticmethod
    def calculate_bin_range(
        active_bin_id: int,
        bin_step: int,
        risk_profile: RiskProfile
    ) -> Dict:
        """
        Calculate bin range for a given risk profile.

        Args:
            active_bin_id: Current active bin of the pool
            bin_step: Pool's bin step (basis points per bin)
            risk_profile: Desired risk profile

        Returns:
            Dict with min_bin_id, max_bin_id, num_bins, range_pct
        """
        config = RISK_CONFIGS[risk_profile]

        # Calculate number of bins based on range percentage
        # Each bin represents bin_step basis points
        bins_for_range = int((config.range_pct * 10000) / bin_step)

        # Clamp to min/max bins for this risk profile
        num_bins = max(config.min_bins, min(bins_for_range, config.max_bins))

        # Ensure we don't exceed Meteora's 69 bin limit
        num_bins = min(num_bins, 69)

        # Center around active bin
        half_bins = num_bins // 2
        min_bin_id = active_bin_id - half_bins
        max_bin_id = active_bin_id + (num_bins - half_bins - 1)

        # Calculate actual range percentage
        actual_range_pct = (num_bins * bin_step) / 10000

        return {
            'min_bin_id': min_bin_id,
            'max_bin_id': max_bin_id,
            'num_bins': num_bins,
            'range_pct': round(actual_range_pct * 100, 2),
            'risk_profile': risk_profile.value,
            'rebalance_threshold': config.rebalance_threshold
        }

    @staticmethod
    def should_rebalance(
        active_bin_id: int,
        min_bin_id: int,
        max_bin_id: int,
        risk_profile: RiskProfile
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if position should be rebalanced.

        Returns:
            Tuple of (should_rebalance, reason)
        """
        config = RISK_CONFIGS[risk_profile]
        total_bins = max_bin_id - min_bin_id + 1

        # Out of range
        if active_bin_id < min_bin_id:
            return True, "Active bin below position range"
        if active_bin_id > max_bin_id:
            return True, "Active bin above position range"

        # Check if near edge
        bins_from_min = active_bin_id - min_bin_id
        bins_from_max = max_bin_id - active_bin_id

        threshold_bins = int(total_bins * config.rebalance_threshold)

        if bins_from_min <= threshold_bins:
            return True, f"Active bin within {config.rebalance_threshold*100:.0f}% of lower edge"
        if bins_from_max <= threshold_bins:
            return True, f"Active bin within {config.rebalance_threshold*100:.0f}% of upper edge"

        return False, None

    @staticmethod
    def calculate_price_impact(
        bin_step: int,
        num_bins: int
    ) -> Dict:
        """
        Calculate potential price impact metrics for a position.

        Returns:
            Dict with max_price_move_pct, il_at_max_move
        """
        # Maximum price move within range
        max_price_move_pct = (num_bins * bin_step) / 10000 / 2

        # Approximate IL at max move (simplified formula)
        # IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
        price_ratio = 1 + max_price_move_pct
        il_at_max_move = abs(2 * (price_ratio ** 0.5) / (1 + price_ratio) - 1)

        return {
            'max_price_move_pct': round(max_price_move_pct * 100, 2),
            'il_at_max_move_pct': round(il_at_max_move * 100, 2)
        }

    @staticmethod
    def estimate_fee_potential(
        pool_apr: float,
        risk_profile: RiskProfile,
        deposit_usd: float
    ) -> Dict:
        """
        Estimate fee earning potential based on risk profile.

        Higher risk = more concentrated liquidity = higher share of fees.
        """
        # Fee multiplier based on concentration
        fee_multipliers = {
            RiskProfile.HIGH: 2.5,    # Very concentrated
            RiskProfile.MEDIUM: 1.5,  # Moderately concentrated
            RiskProfile.LOW: 1.0,     # Wide range, baseline
        }

        multiplier = fee_multipliers[risk_profile]
        adjusted_apr = pool_apr * multiplier

        # Estimate daily/weekly/monthly earnings
        daily_estimate = (adjusted_apr / 365) * deposit_usd / 100
        weekly_estimate = daily_estimate * 7
        monthly_estimate = daily_estimate * 30

        return {
            'adjusted_apr': round(adjusted_apr, 2),
            'base_apr': pool_apr,
            'concentration_multiplier': multiplier,
            'daily_estimate_usd': round(daily_estimate, 4),
            'weekly_estimate_usd': round(weekly_estimate, 4),
            'monthly_estimate_usd': round(monthly_estimate, 2)
        }

    @staticmethod
    def get_strategy_description(risk_profile: RiskProfile, strategy_type: StrategyType) -> Dict:
        """Get human-readable description of strategy."""
        risk_descriptions = {
            RiskProfile.HIGH: {
                'name': 'Aggressive',
                'description': 'Tight range (5-10%), very high fee potential, requires frequent rebalancing',
                'best_for': 'Stable pairs, high conviction on price range',
                'il_risk': 'Very High',
                'management': 'Very Active'
            },
            RiskProfile.MEDIUM: {
                'name': 'Balanced',
                'description': 'Moderate range (15-25%), good fee potential with manageable IL',
                'best_for': 'Most trading pairs, general purpose',
                'il_risk': 'Medium',
                'management': 'Active'
            },
            RiskProfile.LOW: {
                'name': 'Conservative',
                'description': 'Wide range (40-60%), lower fees but minimal IL risk',
                'best_for': 'Volatile pairs, passive management',
                'il_risk': 'Low',
                'management': 'Occasional'
            }
        }

        strategy_descriptions = {
            StrategyType.SPOT: {
                'name': 'Uniform (Spot)',
                'description': 'Equal liquidity distribution across all bins',
                'best_for': 'General purpose, uncertain price direction'
            },
            StrategyType.CURVE: {
                'name': 'Bell Curve',
                'description': 'Concentrated in middle bins, less at edges',
                'best_for': 'Stablecoins, mean-reverting pairs'
            },
            StrategyType.BIDASK: {
                'name': 'Bid-Ask',
                'description': 'Heavy at edges, light in middle',
                'best_for': 'Capturing volatility, range breakouts'
            }
        }

        return {
            'risk': risk_descriptions[risk_profile],
            'strategy': strategy_descriptions[strategy_type]
        }
