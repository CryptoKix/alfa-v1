#!/usr/bin/env python3
"""RSI Overbought/Oversold Strategy.

This module re-exports RSIBotStrategy from the strategies package.
The implementation is in __init__.py for centralized management.
"""
from services.strategies import RSIBotStrategy

__all__ = ['RSIBotStrategy']
