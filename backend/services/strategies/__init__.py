#!/usr/bin/env python3
"""Indicator-based trading strategy registry and processing."""
from typing import Dict, Any, Optional, Tuple
import time
import json

from services.indicators import get_indicator_service, IndicatorResult


# Strategy type constants
RSI_BOT = 'RSI_BOT'
MACD_BOT = 'MACD_BOT'
BB_BOT = 'BB_BOT'
EMA_CROSS_BOT = 'EMA_CROSS_BOT'
MULTI_IND_BOT = 'MULTI_IND_BOT'

# All indicator bot types
INDICATOR_BOT_TYPES = {RSI_BOT, MACD_BOT, BB_BOT, EMA_CROSS_BOT, MULTI_IND_BOT}


class BaseIndicatorStrategy:
    """Base class for indicator-based trading strategies."""

    def __init__(self, bot: Dict[str, Any]):
        self.bot = bot
        self.bot_id = bot['id']
        self.config = json.loads(bot.get('config_json', '{}'))
        self.state = json.loads(bot.get('state_json', '{}'))
        self.input_mint = bot['input_mint']
        self.output_mint = bot['output_mint']
        self.indicator_service = get_indicator_service()

    def get_timeframe(self) -> str:
        """Get configured timeframe, defaulting to 1H."""
        return self.config.get('timeframe', '1H')

    def get_position_size(self) -> float:
        """Get position size for trades."""
        return float(self.config.get('position_size', 0))

    def get_cooldown_seconds(self) -> int:
        """Get cooldown period between trades in seconds."""
        minutes = self.config.get('cooldown_minutes', 60)
        return minutes * 60

    def is_in_cooldown(self) -> bool:
        """Check if strategy is in cooldown period."""
        last_trade = self.state.get('last_trade_time', 0)
        return time.time() - last_trade < self.get_cooldown_seconds()

    def evaluate(self, current_price: float) -> Optional[Dict[str, Any]]:
        """
        Evaluate the strategy and return a trade signal if conditions are met.

        Args:
            current_price: Current token price

        Returns:
            Trade signal dict with 'action' ('buy'/'sell'), 'amount', 'reason'
            or None if no trade should be executed
        """
        raise NotImplementedError("Subclasses must implement evaluate()")

    def update_state(self, updates: Dict[str, Any]):
        """Update strategy state."""
        self.state.update(updates)

    def get_state(self) -> Dict[str, Any]:
        """Get current strategy state."""
        return self.state


class RSIBotStrategy(BaseIndicatorStrategy):
    """RSI Overbought/Oversold Strategy."""

    def evaluate(self, current_price: float) -> Optional[Dict[str, Any]]:
        if self.is_in_cooldown():
            return None

        # Get RSI config
        rsi_period = self.config.get('rsi_period', 14)
        buy_threshold = self.config.get('buy_threshold', 30)
        sell_threshold = self.config.get('sell_threshold', 70)
        timeframe = self.get_timeframe()

        # Calculate RSI
        rsi_result = self.indicator_service.calculate_rsi(
            self.output_mint,
            period=rsi_period,
            timeframe=timeframe
        )

        current_rsi = rsi_result.value
        position = self.state.get('position', 'none')

        self.update_state({
            'last_rsi': current_rsi,
            'last_check': time.time()
        })

        # Buy signal: RSI below buy threshold and no position
        if current_rsi < buy_threshold and position == 'none':
            return {
                'action': 'buy',
                'amount': self.get_position_size(),
                'reason': f'RSI oversold: {current_rsi:.1f} < {buy_threshold}',
                'indicator_value': current_rsi
            }

        # Sell signal: RSI above sell threshold and has position
        if current_rsi > sell_threshold and position == 'long':
            return {
                'action': 'sell',
                'amount': self.state.get('position_amount', 0),
                'reason': f'RSI overbought: {current_rsi:.1f} > {sell_threshold}',
                'indicator_value': current_rsi
            }

        return None


class MACDBotStrategy(BaseIndicatorStrategy):
    """MACD Crossover Strategy."""

    def evaluate(self, current_price: float) -> Optional[Dict[str, Any]]:
        if self.is_in_cooldown():
            return None

        # Get MACD config
        fast = self.config.get('macd_fast', 12)
        slow = self.config.get('macd_slow', 26)
        signal_period = self.config.get('macd_signal', 9)
        require_histogram = self.config.get('require_histogram_confirm', True)
        timeframe = self.get_timeframe()

        # Calculate MACD
        macd_result = self.indicator_service.calculate_macd(
            self.output_mint,
            fast=fast,
            slow=slow,
            signal=signal_period,
            timeframe=timeframe
        )

        macd_data = macd_result.raw_data
        macd_line = macd_data.get('macd', 0)
        signal_line = macd_data.get('signal', 0)
        histogram = macd_data.get('histogram', 0)

        position = self.state.get('position', 'none')
        last_macd = self.state.get('last_macd', macd_line)
        last_signal = self.state.get('last_signal', signal_line)

        self.update_state({
            'last_macd': macd_line,
            'last_signal': signal_line,
            'last_histogram': histogram,
            'last_check': time.time()
        })

        # Detect crossover
        bullish_cross = last_macd <= last_signal and macd_line > signal_line
        bearish_cross = last_macd >= last_signal and macd_line < signal_line

        # Apply histogram confirmation if required
        if require_histogram:
            bullish_cross = bullish_cross and histogram > 0
            bearish_cross = bearish_cross and histogram < 0

        # Buy signal: Bullish crossover and no position
        if bullish_cross and position == 'none':
            return {
                'action': 'buy',
                'amount': self.get_position_size(),
                'reason': f'MACD bullish crossover (hist: {histogram:.4f})',
                'indicator_value': macd_line
            }

        # Sell signal: Bearish crossover and has position
        if bearish_cross and position == 'long':
            return {
                'action': 'sell',
                'amount': self.state.get('position_amount', 0),
                'reason': f'MACD bearish crossover (hist: {histogram:.4f})',
                'indicator_value': macd_line
            }

        return None


class BollingerBotStrategy(BaseIndicatorStrategy):
    """Bollinger Bands Mean Reversion Strategy."""

    def evaluate(self, current_price: float) -> Optional[Dict[str, Any]]:
        if self.is_in_cooldown():
            return None

        # Get BB config
        period = self.config.get('bb_period', 20)
        std_dev = self.config.get('bb_std', 2.0)
        entry_mode = self.config.get('entry_mode', 'touch')  # 'touch' or 'close_beyond'
        timeframe = self.get_timeframe()

        # Calculate Bollinger Bands
        bb_result = self.indicator_service.calculate_bollinger(
            self.output_mint,
            period=period,
            std=std_dev,
            timeframe=timeframe
        )

        bb_data = bb_result.raw_data
        upper = bb_data.get('upper', 0)
        middle = bb_data.get('middle', 0)
        lower = bb_data.get('lower', 0)
        percent_b = bb_data.get('percent_b', 0.5)

        position = self.state.get('position', 'none')

        self.update_state({
            'last_upper': upper,
            'last_middle': middle,
            'last_lower': lower,
            'last_percent_b': percent_b,
            'last_check': time.time()
        })

        # Determine entry condition
        if entry_mode == 'close_beyond':
            buy_condition = current_price < lower
            sell_at_middle = current_price >= middle
            sell_at_upper = current_price >= upper
        else:  # touch
            buy_condition = current_price <= lower * 1.005  # Within 0.5% of lower
            sell_at_middle = current_price >= middle * 0.995
            sell_at_upper = current_price >= upper * 0.995

        # Buy signal: Price at/below lower band and no position
        if buy_condition and position == 'none':
            return {
                'action': 'buy',
                'amount': self.get_position_size(),
                'reason': f'BB lower touch: ${current_price:.4f} <= ${lower:.4f}',
                'indicator_value': percent_b
            }

        # Sell signal: Price at middle or upper band
        if position == 'long':
            exit_target = self.config.get('exit_target', 'middle')  # 'middle' or 'upper'

            if exit_target == 'upper' and sell_at_upper:
                return {
                    'action': 'sell',
                    'amount': self.state.get('position_amount', 0),
                    'reason': f'BB upper reached: ${current_price:.4f} >= ${upper:.4f}',
                    'indicator_value': percent_b
                }
            elif exit_target == 'middle' and sell_at_middle:
                return {
                    'action': 'sell',
                    'amount': self.state.get('position_amount', 0),
                    'reason': f'BB middle reached: ${current_price:.4f} >= ${middle:.4f}',
                    'indicator_value': percent_b
                }

        return None


class EMACrossBotStrategy(BaseIndicatorStrategy):
    """EMA Crossover (Golden/Death Cross) Strategy."""

    def evaluate(self, current_price: float) -> Optional[Dict[str, Any]]:
        if self.is_in_cooldown():
            return None

        # Get EMA config
        fast_period = self.config.get('ema_fast', 9)
        slow_period = self.config.get('ema_slow', 21)
        timeframe = self.get_timeframe()

        # Calculate EMA crossover
        ema_result = self.indicator_service.calculate_ema_crossover(
            self.output_mint,
            fast_period=fast_period,
            slow_period=slow_period,
            timeframe=timeframe
        )

        ema_data = ema_result.raw_data
        fast_ema = ema_data.get('fast_ema', 0)
        slow_ema = ema_data.get('slow_ema', 0)
        difference = ema_data.get('difference', 0)

        position = self.state.get('position', 'none')
        last_fast = self.state.get('last_fast_ema', fast_ema)
        last_slow = self.state.get('last_slow_ema', slow_ema)

        self.update_state({
            'last_fast_ema': fast_ema,
            'last_slow_ema': slow_ema,
            'last_difference': difference,
            'last_check': time.time()
        })

        # Detect crossover
        golden_cross = last_fast <= last_slow and fast_ema > slow_ema
        death_cross = last_fast >= last_slow and fast_ema < slow_ema

        # Buy signal: Golden cross and no position
        if golden_cross and position == 'none':
            return {
                'action': 'buy',
                'amount': self.get_position_size(),
                'reason': f'EMA golden cross: {fast_period} > {slow_period}',
                'indicator_value': difference
            }

        # Sell signal: Death cross and has position
        if death_cross and position == 'long':
            return {
                'action': 'sell',
                'amount': self.state.get('position_amount', 0),
                'reason': f'EMA death cross: {fast_period} < {slow_period}',
                'indicator_value': difference
            }

        return None


class MultiIndicatorBotStrategy(BaseIndicatorStrategy):
    """Multi-Indicator Confluence Strategy."""

    def evaluate(self, current_price: float) -> Optional[Dict[str, Any]]:
        if self.is_in_cooldown():
            return None

        # Get config
        active_indicators = self.config.get('indicators', ['RSI', 'MACD', 'BB'])
        min_confluence = self.config.get('min_confluence', 2)
        timeframe = self.get_timeframe()

        # Calculate all active indicators
        indicators = self.indicator_service.get_all_indicators(
            self.output_mint,
            timeframe=timeframe,
            config=self.config
        )

        # Filter to active indicators and get confluence signal
        active_results = {}
        indicator_map = {
            'RSI': 'rsi',
            'MACD': 'macd',
            'BB': 'bollinger',
            'EMA_CROSS': 'ema_cross'
        }

        for ind in active_indicators:
            key = indicator_map.get(ind)
            if key and key in indicators:
                active_results[ind] = indicators[key]

        # Get confluence signal
        signal, strength, agreeing = self.indicator_service.get_confluence_signal(
            active_results,
            min_confluence=min_confluence
        )

        position = self.state.get('position', 'none')

        # Update state with all indicator values
        state_update = {
            'last_check': time.time(),
            'last_signal': signal,
            'last_strength': strength,
            'agreeing_indicators': agreeing
        }
        for name, result in active_results.items():
            state_update[f'last_{name.lower()}'] = result.value

        self.update_state(state_update)

        # Buy signal: Confluence buy and no position
        if signal == 'buy' and position == 'none' and strength >= 0.5:
            return {
                'action': 'buy',
                'amount': self.get_position_size(),
                'reason': f'Confluence buy: {", ".join(agreeing)} (strength: {strength:.2f})',
                'indicator_value': strength,
                'agreeing_indicators': agreeing
            }

        # Sell signal: Confluence sell and has position
        if signal == 'sell' and position == 'long' and strength >= 0.5:
            return {
                'action': 'sell',
                'amount': self.state.get('position_amount', 0),
                'reason': f'Confluence sell: {", ".join(agreeing)} (strength: {strength:.2f})',
                'indicator_value': strength,
                'agreeing_indicators': agreeing
            }

        return None


# Strategy Registry
STRATEGY_REGISTRY = {
    RSI_BOT: RSIBotStrategy,
    MACD_BOT: MACDBotStrategy,
    BB_BOT: BollingerBotStrategy,
    EMA_CROSS_BOT: EMACrossBotStrategy,
    MULTI_IND_BOT: MultiIndicatorBotStrategy,
}


def get_strategy_class(strategy_type: str):
    """Get the strategy class for a given type."""
    return STRATEGY_REGISTRY.get(strategy_type)


def is_indicator_bot(bot_type: str) -> bool:
    """Check if a bot type is an indicator-based strategy."""
    return bot_type in INDICATOR_BOT_TYPES


def process_indicator_bot(bot: Dict[str, Any], current_price: float) -> Optional[Dict[str, Any]]:
    """
    Process an indicator bot and return a trade signal if conditions are met.

    Args:
        bot: Bot database record
        current_price: Current token price

    Returns:
        Trade signal dict or None
    """
    strategy_class = STRATEGY_REGISTRY.get(bot['type'])

    if not strategy_class:
        return None

    try:
        strategy = strategy_class(bot)
        return strategy.evaluate(current_price)
    except Exception as e:
        print(f"Error processing indicator bot {bot.get('id')}: {e}")
        return None
