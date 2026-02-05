#!/usr/bin/env python3
"""Multi-Indicator Confluence Strategy.

This module re-exports MultiIndicatorBotStrategy from the strategies package.
The implementation is in __init__.py for centralized management.
"""
from services.strategies import MultiIndicatorBotStrategy

__all__ = ['MultiIndicatorBotStrategy']
