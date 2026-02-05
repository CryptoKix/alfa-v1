#!/usr/bin/env python3
"""Bollinger Bands Mean Reversion Strategy.

This module re-exports BollingerBotStrategy from the strategies package.
The implementation is in __init__.py for centralized management.
"""
from services.strategies import BollingerBotStrategy

__all__ = ['BollingerBotStrategy']
