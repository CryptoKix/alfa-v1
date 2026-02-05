#!/usr/bin/env python3
"""MACD Crossover Strategy.

This module re-exports MACDBotStrategy from the strategies package.
The implementation is in __init__.py for centralized management.
"""
from services.strategies import MACDBotStrategy

__all__ = ['MACDBotStrategy']
