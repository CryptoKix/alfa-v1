#!/usr/bin/env python3
"""Technical indicator calculation service using Pandas-TA."""
import time
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass

import pandas as pd
import numpy as np

try:
    import pandas_ta as ta
except ImportError:
    ta = None
    print("WARNING: pandas-ta not installed. Run: pip install pandas-ta")

from services.volume import fetch_ohlcv_data, OHLCVCandle


# Cache TTL in seconds (1 minute for live trading)
INDICATOR_CACHE_TTL = 60

# Cache structure: {(mint, timeframe): (indicators_dict, timestamp)}
_indicator_cache: Dict[Tuple[str, str], Tuple[Dict[str, Any], float]] = {}


@dataclass
class IndicatorResult:
    """Container for indicator calculation results."""
    value: float
    signal: str  # 'buy', 'sell', 'neutral'
    strength: float  # 0-1 signal strength
    raw_data: Dict[str, Any]


class IndicatorService:
    """Service for calculating technical indicators using Pandas-TA."""

    def __init__(self, cache_ttl: int = INDICATOR_CACHE_TTL):
        self.cache_ttl = cache_ttl
        if ta is None:
            raise ImportError("pandas-ta is required. Install with: pip install pandas-ta")

    def get_ohlcv_dataframe(
        self,
        mint: str,
        timeframe: str = '1H',
        periods: int = 100
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data and return as a Pandas DataFrame.

        Args:
            mint: Token mint address
            timeframe: Candle timeframe ('15m', '1H', '4H')
            periods: Number of candles to fetch

        Returns:
            DataFrame with columns: timestamp, open, high, low, close, volume
        """
        # Calculate hours_back based on timeframe and periods
        timeframe_hours = {'15m': 0.25, '1H': 1, '4H': 4, '1D': 24}
        hours_multiplier = timeframe_hours.get(timeframe, 1)
        hours_back = int(periods * hours_multiplier) + 1

        candles = fetch_ohlcv_data(mint, timeframe, hours_back)

        if not candles:
            return pd.DataFrame()

        # Convert to DataFrame
        df = pd.DataFrame([
            {
                'timestamp': c.timestamp,
                'open': c.open,
                'high': c.high,
                'low': c.low,
                'close': c.close,
                'volume': c.volume
            }
            for c in candles
        ])

        # Set timestamp as datetime index
        df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)

        return df

    def calculate_rsi(
        self,
        mint: str,
        period: int = 14,
        timeframe: str = '1H'
    ) -> IndicatorResult:
        """
        Calculate RSI (Relative Strength Index).

        Args:
            mint: Token mint address
            period: RSI period (default 14)
            timeframe: Candle timeframe

        Returns:
            IndicatorResult with RSI value and signal
        """
        df = self.get_ohlcv_dataframe(mint, timeframe, periods=period + 50)

        if df.empty or len(df) < period:
            return IndicatorResult(
                value=50.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'insufficient_data'}
            )

        # Calculate RSI using pandas-ta
        rsi = ta.rsi(df['close'], length=period)

        if rsi is None or rsi.empty:
            return IndicatorResult(
                value=50.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'calculation_failed'}
            )

        current_rsi = float(rsi.iloc[-1])

        # Determine signal
        if current_rsi <= 30:
            signal = 'buy'
            strength = (30 - current_rsi) / 30  # Stronger as RSI approaches 0
        elif current_rsi >= 70:
            signal = 'sell'
            strength = (current_rsi - 70) / 30  # Stronger as RSI approaches 100
        else:
            signal = 'neutral'
            # Neutral strength based on distance from 50
            strength = 1 - abs(current_rsi - 50) / 20

        return IndicatorResult(
            value=current_rsi,
            signal=signal,
            strength=min(1.0, max(0.0, strength)),
            raw_data={
                'period': period,
                'history': rsi.tail(5).tolist()
            }
        )

    def calculate_macd(
        self,
        mint: str,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
        timeframe: str = '1H'
    ) -> IndicatorResult:
        """
        Calculate MACD (Moving Average Convergence Divergence).

        Args:
            mint: Token mint address
            fast: Fast EMA period (default 12)
            slow: Slow EMA period (default 26)
            signal: Signal line period (default 9)
            timeframe: Candle timeframe

        Returns:
            IndicatorResult with MACD data and signal
        """
        df = self.get_ohlcv_dataframe(mint, timeframe, periods=slow + signal + 50)

        if df.empty or len(df) < slow + signal:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'insufficient_data'}
            )

        # Calculate MACD using pandas-ta
        macd_df = ta.macd(df['close'], fast=fast, slow=slow, signal=signal)

        if macd_df is None or macd_df.empty:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'calculation_failed'}
            )

        # Get column names (pandas-ta naming convention)
        macd_col = f'MACD_{fast}_{slow}_{signal}'
        signal_col = f'MACDs_{fast}_{slow}_{signal}'
        hist_col = f'MACDh_{fast}_{slow}_{signal}'

        macd_line = float(macd_df[macd_col].iloc[-1])
        signal_line = float(macd_df[signal_col].iloc[-1])
        histogram = float(macd_df[hist_col].iloc[-1])

        # Previous values for crossover detection
        prev_macd = float(macd_df[macd_col].iloc[-2])
        prev_signal = float(macd_df[signal_col].iloc[-2])

        # Determine signal based on crossover
        if prev_macd <= prev_signal and macd_line > signal_line:
            # Bullish crossover
            sig = 'buy'
            strength = min(1.0, abs(histogram) / (abs(macd_line) + 0.001))
        elif prev_macd >= prev_signal and macd_line < signal_line:
            # Bearish crossover
            sig = 'sell'
            strength = min(1.0, abs(histogram) / (abs(macd_line) + 0.001))
        else:
            # No crossover - use histogram direction
            if histogram > 0:
                sig = 'buy' if macd_line > signal_line else 'neutral'
            else:
                sig = 'sell' if macd_line < signal_line else 'neutral'
            strength = 0.3  # Lower strength for non-crossover

        return IndicatorResult(
            value=macd_line,
            signal=sig,
            strength=min(1.0, max(0.0, strength)),
            raw_data={
                'macd': macd_line,
                'signal': signal_line,
                'histogram': histogram,
                'fast': fast,
                'slow': slow,
                'signal_period': signal
            }
        )

    def calculate_bollinger(
        self,
        mint: str,
        period: int = 20,
        std: float = 2.0,
        timeframe: str = '1H'
    ) -> IndicatorResult:
        """
        Calculate Bollinger Bands.

        Args:
            mint: Token mint address
            period: Moving average period (default 20)
            std: Number of standard deviations (default 2)
            timeframe: Candle timeframe

        Returns:
            IndicatorResult with BB data and signal
        """
        df = self.get_ohlcv_dataframe(mint, timeframe, periods=period + 50)

        if df.empty or len(df) < period:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'insufficient_data'}
            )

        # Calculate Bollinger Bands using pandas-ta
        bb_df = ta.bbands(df['close'], length=period, std=std)

        if bb_df is None or bb_df.empty:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'calculation_failed'}
            )

        # Get column names dynamically (pandas-ta naming can vary)
        bb_cols = bb_df.columns.tolist()
        lower_col = next((c for c in bb_cols if c.startswith('BBL_')), None)
        mid_col = next((c for c in bb_cols if c.startswith('BBM_')), None)
        upper_col = next((c for c in bb_cols if c.startswith('BBU_')), None)

        if not all([lower_col, mid_col, upper_col]):
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'bb_columns_not_found', 'columns': bb_cols}
            )

        lower = float(bb_df[lower_col].iloc[-1])
        middle = float(bb_df[mid_col].iloc[-1])
        upper = float(bb_df[upper_col].iloc[-1])
        current_price = float(df['close'].iloc[-1])

        # Calculate %B (position within bands)
        if upper != lower:
            percent_b = (current_price - lower) / (upper - lower)
        else:
            percent_b = 0.5

        # Determine signal based on band position
        if current_price <= lower:
            sig = 'buy'  # Price at or below lower band (oversold)
            strength = min(1.0, (lower - current_price) / (middle - lower + 0.001) + 0.5)
        elif current_price >= upper:
            sig = 'sell'  # Price at or above upper band (overbought)
            strength = min(1.0, (current_price - upper) / (upper - middle + 0.001) + 0.5)
        elif current_price < middle:
            sig = 'buy' if percent_b < 0.3 else 'neutral'
            strength = 0.3 if percent_b < 0.3 else 0.1
        else:
            sig = 'sell' if percent_b > 0.7 else 'neutral'
            strength = 0.3 if percent_b > 0.7 else 0.1

        return IndicatorResult(
            value=current_price,
            signal=sig,
            strength=min(1.0, max(0.0, strength)),
            raw_data={
                'upper': upper,
                'middle': middle,
                'lower': lower,
                'percent_b': percent_b,
                'bandwidth': (upper - lower) / middle * 100 if middle > 0 else 0,
                'period': period,
                'std': std
            }
        )

    def calculate_ema(
        self,
        mint: str,
        period: int = 20,
        timeframe: str = '1H'
    ) -> IndicatorResult:
        """
        Calculate Exponential Moving Average.

        Args:
            mint: Token mint address
            period: EMA period (default 20)
            timeframe: Candle timeframe

        Returns:
            IndicatorResult with EMA value
        """
        df = self.get_ohlcv_dataframe(mint, timeframe, periods=period + 50)

        if df.empty or len(df) < period:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'insufficient_data'}
            )

        # Calculate EMA using pandas-ta
        ema = ta.ema(df['close'], length=period)

        if ema is None or ema.empty:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'calculation_failed'}
            )

        current_ema = float(ema.iloc[-1])
        current_price = float(df['close'].iloc[-1])

        # Signal based on price vs EMA
        diff_pct = (current_price - current_ema) / current_ema * 100 if current_ema > 0 else 0

        if diff_pct > 1:
            sig = 'buy'  # Price above EMA (bullish)
            strength = min(1.0, diff_pct / 5)
        elif diff_pct < -1:
            sig = 'sell'  # Price below EMA (bearish)
            strength = min(1.0, abs(diff_pct) / 5)
        else:
            sig = 'neutral'
            strength = 0.1

        return IndicatorResult(
            value=current_ema,
            signal=sig,
            strength=min(1.0, max(0.0, strength)),
            raw_data={
                'ema': current_ema,
                'price': current_price,
                'diff_pct': diff_pct,
                'period': period
            }
        )

    def calculate_sma(
        self,
        mint: str,
        period: int = 20,
        timeframe: str = '1H'
    ) -> IndicatorResult:
        """
        Calculate Simple Moving Average.

        Args:
            mint: Token mint address
            period: SMA period (default 20)
            timeframe: Candle timeframe

        Returns:
            IndicatorResult with SMA value
        """
        df = self.get_ohlcv_dataframe(mint, timeframe, periods=period + 50)

        if df.empty or len(df) < period:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'insufficient_data'}
            )

        # Calculate SMA using pandas-ta
        sma = ta.sma(df['close'], length=period)

        if sma is None or sma.empty:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'calculation_failed'}
            )

        current_sma = float(sma.iloc[-1])
        current_price = float(df['close'].iloc[-1])

        # Signal based on price vs SMA
        diff_pct = (current_price - current_sma) / current_sma * 100 if current_sma > 0 else 0

        if diff_pct > 1:
            sig = 'buy'
            strength = min(1.0, diff_pct / 5)
        elif diff_pct < -1:
            sig = 'sell'
            strength = min(1.0, abs(diff_pct) / 5)
        else:
            sig = 'neutral'
            strength = 0.1

        return IndicatorResult(
            value=current_sma,
            signal=sig,
            strength=min(1.0, max(0.0, strength)),
            raw_data={
                'sma': current_sma,
                'price': current_price,
                'diff_pct': diff_pct,
                'period': period
            }
        )

    def calculate_ema_crossover(
        self,
        mint: str,
        fast_period: int = 9,
        slow_period: int = 21,
        timeframe: str = '1H'
    ) -> IndicatorResult:
        """
        Calculate EMA Crossover (Golden/Death Cross).

        Args:
            mint: Token mint address
            fast_period: Fast EMA period (default 9)
            slow_period: Slow EMA period (default 21)
            timeframe: Candle timeframe

        Returns:
            IndicatorResult with crossover signal
        """
        df = self.get_ohlcv_dataframe(mint, timeframe, periods=slow_period + 50)

        if df.empty or len(df) < slow_period:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'insufficient_data'}
            )

        # Calculate both EMAs
        fast_ema = ta.ema(df['close'], length=fast_period)
        slow_ema = ta.ema(df['close'], length=slow_period)

        if fast_ema is None or slow_ema is None or fast_ema.empty or slow_ema.empty:
            return IndicatorResult(
                value=0.0,
                signal='neutral',
                strength=0.0,
                raw_data={'error': 'calculation_failed'}
            )

        fast_current = float(fast_ema.iloc[-1])
        slow_current = float(slow_ema.iloc[-1])
        fast_prev = float(fast_ema.iloc[-2])
        slow_prev = float(slow_ema.iloc[-2])

        # Detect crossover
        if fast_prev <= slow_prev and fast_current > slow_current:
            # Golden cross (bullish)
            sig = 'buy'
            strength = min(1.0, (fast_current - slow_current) / slow_current * 100)
        elif fast_prev >= slow_prev and fast_current < slow_current:
            # Death cross (bearish)
            sig = 'sell'
            strength = min(1.0, (slow_current - fast_current) / slow_current * 100)
        else:
            # No crossover - trend continuation
            if fast_current > slow_current:
                sig = 'buy'
                strength = 0.3
            elif fast_current < slow_current:
                sig = 'sell'
                strength = 0.3
            else:
                sig = 'neutral'
                strength = 0.1

        return IndicatorResult(
            value=fast_current - slow_current,  # EMA difference
            signal=sig,
            strength=min(1.0, max(0.0, strength)),
            raw_data={
                'fast_ema': fast_current,
                'slow_ema': slow_current,
                'fast_period': fast_period,
                'slow_period': slow_period,
                'difference': fast_current - slow_current
            }
        )

    def get_all_indicators(
        self,
        mint: str,
        timeframe: str = '1H',
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, IndicatorResult]:
        """
        Calculate all indicators for a token (bulk calculation).

        Args:
            mint: Token mint address
            timeframe: Candle timeframe
            config: Optional configuration override for indicators

        Returns:
            Dictionary mapping indicator names to IndicatorResult objects
        """
        # Check cache
        cache_key = (mint, timeframe)
        if cache_key in _indicator_cache:
            cached_data, cached_time = _indicator_cache[cache_key]
            if time.time() - cached_time < self.cache_ttl:
                return cached_data

        # Default config
        cfg = config or {}

        results = {}

        # RSI
        results['rsi'] = self.calculate_rsi(
            mint,
            period=cfg.get('rsi_period', 14),
            timeframe=timeframe
        )

        # MACD
        results['macd'] = self.calculate_macd(
            mint,
            fast=cfg.get('macd_fast', 12),
            slow=cfg.get('macd_slow', 26),
            signal=cfg.get('macd_signal', 9),
            timeframe=timeframe
        )

        # Bollinger Bands
        results['bollinger'] = self.calculate_bollinger(
            mint,
            period=cfg.get('bb_period', 20),
            std=cfg.get('bb_std', 2.0),
            timeframe=timeframe
        )

        # EMA Crossover
        results['ema_cross'] = self.calculate_ema_crossover(
            mint,
            fast_period=cfg.get('ema_fast', 9),
            slow_period=cfg.get('ema_slow', 21),
            timeframe=timeframe
        )

        # Cache results
        _indicator_cache[cache_key] = (results, time.time())

        return results

    def get_confluence_signal(
        self,
        indicators: Dict[str, IndicatorResult],
        min_confluence: int = 2
    ) -> Tuple[str, float, List[str]]:
        """
        Calculate confluence signal from multiple indicators.

        Args:
            indicators: Dictionary of indicator results
            min_confluence: Minimum number of agreeing indicators

        Returns:
            Tuple of (signal, strength, list of agreeing indicators)
        """
        buy_signals = []
        sell_signals = []

        for name, result in indicators.items():
            if result.signal == 'buy':
                buy_signals.append((name, result.strength))
            elif result.signal == 'sell':
                sell_signals.append((name, result.strength))

        buy_count = len(buy_signals)
        sell_count = len(sell_signals)

        if buy_count >= min_confluence and buy_count > sell_count:
            avg_strength = sum(s for _, s in buy_signals) / buy_count
            return 'buy', avg_strength, [n for n, _ in buy_signals]
        elif sell_count >= min_confluence and sell_count > buy_count:
            avg_strength = sum(s for _, s in sell_signals) / sell_count
            return 'sell', avg_strength, [n for n, _ in sell_signals]
        else:
            return 'neutral', 0.0, []


def clear_indicator_cache(mint: Optional[str] = None):
    """Clear indicator cache for a specific mint or all mints."""
    global _indicator_cache
    if mint:
        keys_to_remove = [k for k in _indicator_cache if k[0] == mint]
        for key in keys_to_remove:
            del _indicator_cache[key]
    else:
        _indicator_cache = {}


# Singleton instance
_indicator_service: Optional[IndicatorService] = None


def get_indicator_service() -> IndicatorService:
    """Get or create the singleton IndicatorService instance."""
    global _indicator_service
    if _indicator_service is None:
        _indicator_service = IndicatorService()
    return _indicator_service
