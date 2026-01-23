#!/usr/bin/env python3
"""Yield Hunter service package for DeFi yield aggregation."""

from .yield_aggregator import (
    YieldOpportunity,
    get_all_opportunities,
    get_opportunities_by_protocol,
    calculate_risk_level
)

__all__ = [
    'YieldOpportunity',
    'get_all_opportunities',
    'get_opportunities_by_protocol',
    'calculate_risk_level'
]
