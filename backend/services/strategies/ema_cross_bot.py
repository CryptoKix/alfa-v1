#!/usr/bin/env python3
"""EMA Crossover (Golden/Death Cross) Strategy.

This module re-exports EMACrossBotStrategy from the strategies package.
The implementation is in __init__.py for centralized management.
"""
from services.strategies import EMACrossBotStrategy

__all__ = ['EMACrossBotStrategy']
