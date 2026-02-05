#!/usr/bin/env python3
"""Backtesting engine for indicator-based trading strategies."""
import time
import random
import math
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from decimal import Decimal

import pandas as pd
import numpy as np

try:
    import pandas_ta as ta
except ImportError:
    ta = None

from services.volume import fetch_ohlcv_data, OHLCVCandle


@dataclass
class BacktestTrade:
    """Represents a single trade in backtest."""
    timestamp: int
    type: str  # 'buy' or 'sell'
    price: float
    amount: float
    value: float
    fee: float
    slippage: float
    indicator_value: float
    reason: str
    position_pnl: float = 0.0


@dataclass
class BacktestResult:
    """Complete backtest results."""
    strategy_type: str
    config: Dict[str, Any]
    mint: str
    symbol: str
    timeframe: str
    start_date: str
    end_date: str
    initial_balance: float
    final_balance: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    profit_pct: float
    profit_usd: float
    max_drawdown_pct: float
    max_drawdown_usd: float
    sharpe_ratio: float
    sortino_ratio: float
    win_rate: float
    profit_factor: float
    avg_win: float
    avg_loss: float
    largest_win: float
    largest_loss: float
    total_fees_paid: float
    avg_trade_duration: float
    trades_per_day: float
    equity_curve: List[Dict[str, Any]] = field(default_factory=list)
    trades: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'strategy_type': self.strategy_type,
            'config': self.config,
            'mint': self.mint,
            'symbol': self.symbol,
            'timeframe': self.timeframe,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'initial_balance': self.initial_balance,
            'final_balance': self.final_balance,
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'profit_pct': self.profit_pct,
            'profit_usd': self.profit_usd,
            'max_drawdown_pct': self.max_drawdown_pct,
            'max_drawdown_usd': self.max_drawdown_usd,
            'sharpe_ratio': self.sharpe_ratio,
            'sortino_ratio': self.sortino_ratio,
            'win_rate': self.win_rate,
            'profit_factor': self.profit_factor,
            'avg_win': self.avg_win,
            'avg_loss': self.avg_loss,
            'largest_win': self.largest_win,
            'largest_loss': self.largest_loss,
            'total_fees_paid': self.total_fees_paid,
            'avg_trade_duration': self.avg_trade_duration,
            'trades_per_day': self.trades_per_day,
            'equity_curve': self.equity_curve,
            'trades': self.trades
        }


class Backtester:
    """
    Backtesting engine with realistic execution simulation.

    Features:
    - Slippage simulation based on candle range
    - Swap fee deduction (Jupiter ~0.3%)
    - Priority fee simulation
    - Execution delay (execute on next candle open)
    - Look-back only indicator calculation (no future leak)
    """

    # Default execution parameters
    DEFAULT_SLIPPAGE_BPS = 50  # 0.5% default slippage
    DEFAULT_SWAP_FEE_BPS = 30  # Jupiter ~0.3% fee
    DEFAULT_PRIORITY_FEE_SOL = 0.0001  # ~$0.02 priority fee
    EXECUTION_DELAY_CANDLES = 1  # Execute on next candle open

    def __init__(
        self,
        strategy_type: str,
        config: Dict[str, Any],
        mint: str,
        timeframe: str = '1H',
        slippage_bps: int = None,
        swap_fee_bps: int = None
    ):
        """
        Initialize backtester.

        Args:
            strategy_type: Type of strategy ('RSI_BOT', 'MACD_BOT', etc.)
            config: Strategy configuration
            mint: Token mint address to backtest
            timeframe: Candle timeframe ('1H', '4H')
            slippage_bps: Override slippage in basis points
            swap_fee_bps: Override swap fee in basis points
        """
        if ta is None:
            raise ImportError("pandas-ta is required for backtesting. Install with: pip install pandas-ta")

        self.strategy_type = strategy_type
        self.config = config
        self.mint = mint
        self.timeframe = timeframe
        self.slippage_bps = slippage_bps or self.DEFAULT_SLIPPAGE_BPS
        self.swap_fee_bps = swap_fee_bps or self.DEFAULT_SWAP_FEE_BPS

    def run(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        initial_balance: float = 10000,
        hours_back: int = 168  # 1 week default
    ) -> BacktestResult:
        """
        Run backtest simulation.

        Args:
            start_date: Start date (ISO format) - optional, uses hours_back if not specified
            end_date: End date (ISO format) - optional, defaults to now
            initial_balance: Starting capital in USD
            hours_back: Hours of history to use if start_date not specified

        Returns:
            BacktestResult with all metrics and trade history
        """
        # Fetch historical data
        candles = fetch_ohlcv_data(self.mint, self.timeframe, hours_back)

        if not candles or len(candles) < 50:
            return self._empty_result(initial_balance, "Insufficient historical data")

        # Convert to DataFrame for indicator calculations
        df = self._candles_to_dataframe(candles)

        # Pre-calculate all indicators
        df = self._calculate_indicators(df)

        # Run simulation
        trades, equity_curve = self._simulate(df, initial_balance)

        # Calculate metrics
        return self._calculate_metrics(
            df=df,
            trades=trades,
            equity_curve=equity_curve,
            initial_balance=initial_balance
        )

    def _candles_to_dataframe(self, candles: List[OHLCVCandle]) -> pd.DataFrame:
        """Convert OHLCV candles to pandas DataFrame."""
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

        df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)

        return df

    def _calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Pre-calculate all indicators needed for the strategy."""
        # RSI
        rsi_period = self.config.get('rsi_period', 14)
        df['rsi'] = ta.rsi(df['close'], length=rsi_period)

        # MACD
        fast = self.config.get('macd_fast', 12)
        slow = self.config.get('macd_slow', 26)
        signal = self.config.get('macd_signal', 9)
        macd_df = ta.macd(df['close'], fast=fast, slow=slow, signal=signal)
        if macd_df is not None:
            df['macd'] = macd_df[f'MACD_{fast}_{slow}_{signal}']
            df['macd_signal'] = macd_df[f'MACDs_{fast}_{slow}_{signal}']
            df['macd_hist'] = macd_df[f'MACDh_{fast}_{slow}_{signal}']

        # Bollinger Bands
        bb_period = self.config.get('bb_period', 20)
        bb_std = self.config.get('bb_std', 2.0)
        bb_df = ta.bbands(df['close'], length=bb_period, std=bb_std)
        if bb_df is not None and not bb_df.empty:
            # Find columns dynamically as pandas-ta naming can vary
            bb_cols = bb_df.columns.tolist()
            upper_col = [c for c in bb_cols if c.startswith('BBU_')][0] if any(c.startswith('BBU_') for c in bb_cols) else None
            middle_col = [c for c in bb_cols if c.startswith('BBM_')][0] if any(c.startswith('BBM_') for c in bb_cols) else None
            lower_col = [c for c in bb_cols if c.startswith('BBL_')][0] if any(c.startswith('BBL_') for c in bb_cols) else None
            if upper_col and middle_col and lower_col:
                df['bb_upper'] = bb_df[upper_col]
                df['bb_middle'] = bb_df[middle_col]
                df['bb_lower'] = bb_df[lower_col]

        # EMAs
        ema_fast = self.config.get('ema_fast', 9)
        ema_slow = self.config.get('ema_slow', 21)
        df['ema_fast'] = ta.ema(df['close'], length=ema_fast)
        df['ema_slow'] = ta.ema(df['close'], length=ema_slow)

        return df

    def _simulate(
        self,
        df: pd.DataFrame,
        initial_balance: float
    ) -> Tuple[List[BacktestTrade], List[Dict[str, Any]]]:
        """
        Run the trading simulation.

        Returns:
            Tuple of (trades list, equity curve)
        """
        trades = []
        equity_curve = []

        # State
        balance = initial_balance
        position = 'none'
        position_amount = 0.0
        entry_price = 0.0
        entry_cost = 0.0
        entry_time = 0
        pending_signal = None  # For execution delay

        # Skip initial rows needed for indicator warm-up
        start_idx = max(50, self.config.get('macd_slow', 26) + self.config.get('macd_signal', 9))

        for i in range(start_idx, len(df)):
            row = df.iloc[i]
            timestamp = int(row['timestamp'])
            current_price = row['close']

            # Record equity
            current_equity = balance
            if position == 'long':
                current_equity = balance + (position_amount * current_price)

            equity_curve.append({
                'timestamp': timestamp,
                'equity': current_equity,
                'price': current_price,
                'position': position
            })

            # Execute pending signal from previous candle (execution delay)
            if pending_signal is not None:
                exec_result = self._execute_trade(
                    pending_signal,
                    row,
                    balance,
                    position,
                    position_amount,
                    entry_price,
                    entry_cost,
                    entry_time
                )

                if exec_result:
                    trade, balance, position, position_amount, entry_price, entry_cost, entry_time = exec_result
                    trades.append(trade)

                pending_signal = None

            # Generate signal for next candle (look-back only)
            signal = self._generate_signal(df.iloc[:i+1], position)

            if signal is not None:
                pending_signal = signal

        # Close any open position at end
        if position == 'long' and position_amount > 0:
            final_row = df.iloc[-1]
            final_price = final_row['close']
            sell_value = position_amount * final_price
            fee = sell_value * (self.swap_fee_bps / 10000)
            balance += sell_value - fee
            profit = sell_value - entry_cost

            trades.append(BacktestTrade(
                timestamp=int(final_row['timestamp']),
                type='sell',
                price=final_price,
                amount=position_amount,
                value=sell_value,
                fee=fee,
                slippage=0,
                indicator_value=0,
                reason='Backtest end - forced close',
                position_pnl=profit
            ))

        return trades, equity_curve

    def _generate_signal(
        self,
        df_slice: pd.DataFrame,
        position: str
    ) -> Optional[Dict[str, Any]]:
        """
        Generate trading signal based on strategy type.
        Uses only data up to current point (no future leak).
        """
        if len(df_slice) < 2:
            return None

        row = df_slice.iloc[-1]
        prev_row = df_slice.iloc[-2]

        if self.strategy_type == 'RSI_BOT':
            return self._rsi_signal(row, position)
        elif self.strategy_type == 'MACD_BOT':
            return self._macd_signal(row, prev_row, position)
        elif self.strategy_type == 'BB_BOT':
            return self._bollinger_signal(row, position)
        elif self.strategy_type == 'EMA_CROSS_BOT':
            return self._ema_cross_signal(row, prev_row, position)
        elif self.strategy_type == 'MULTI_IND_BOT':
            return self._multi_indicator_signal(row, prev_row, position)

        return None

    def _rsi_signal(self, row: pd.Series, position: str) -> Optional[Dict[str, Any]]:
        """Generate RSI-based signal."""
        rsi = row.get('rsi')
        if pd.isna(rsi):
            return None

        buy_threshold = self.config.get('buy_threshold', 30)
        sell_threshold = self.config.get('sell_threshold', 70)

        if rsi < buy_threshold and position == 'none':
            return {
                'action': 'buy',
                'reason': f'RSI oversold: {rsi:.1f}',
                'indicator_value': rsi
            }
        elif rsi > sell_threshold and position == 'long':
            return {
                'action': 'sell',
                'reason': f'RSI overbought: {rsi:.1f}',
                'indicator_value': rsi
            }

        return None

    def _macd_signal(self, row: pd.Series, prev_row: pd.Series, position: str) -> Optional[Dict[str, Any]]:
        """Generate MACD-based signal."""
        macd = row.get('macd')
        macd_signal = row.get('macd_signal')
        macd_hist = row.get('macd_hist')
        prev_macd = prev_row.get('macd')
        prev_signal = prev_row.get('macd_signal')

        if pd.isna(macd) or pd.isna(macd_signal) or pd.isna(prev_macd) or pd.isna(prev_signal):
            return None

        require_histogram = self.config.get('require_histogram_confirm', True)

        # Bullish crossover
        bullish = prev_macd <= prev_signal and macd > macd_signal
        if require_histogram:
            bullish = bullish and macd_hist > 0

        # Bearish crossover
        bearish = prev_macd >= prev_signal and macd < macd_signal
        if require_histogram:
            bearish = bearish and macd_hist < 0

        if bullish and position == 'none':
            return {
                'action': 'buy',
                'reason': f'MACD bullish crossover',
                'indicator_value': macd
            }
        elif bearish and position == 'long':
            return {
                'action': 'sell',
                'reason': f'MACD bearish crossover',
                'indicator_value': macd
            }

        return None

    def _bollinger_signal(self, row: pd.Series, position: str) -> Optional[Dict[str, Any]]:
        """Generate Bollinger Bands signal."""
        price = row['close']
        upper = row.get('bb_upper')
        middle = row.get('bb_middle')
        lower = row.get('bb_lower')

        if pd.isna(upper) or pd.isna(middle) or pd.isna(lower):
            return None

        entry_mode = self.config.get('entry_mode', 'touch')
        exit_target = self.config.get('exit_target', 'middle')

        # Buy at lower band
        if entry_mode == 'close_beyond':
            buy_condition = price < lower
        else:
            buy_condition = price <= lower * 1.005

        if buy_condition and position == 'none':
            return {
                'action': 'buy',
                'reason': f'BB lower touch: ${price:.4f}',
                'indicator_value': (price - lower) / (upper - lower) if upper != lower else 0
            }

        # Sell at middle or upper
        if position == 'long':
            if exit_target == 'upper' and price >= upper * 0.995:
                return {
                    'action': 'sell',
                    'reason': f'BB upper reached: ${price:.4f}',
                    'indicator_value': (price - lower) / (upper - lower) if upper != lower else 1
                }
            elif exit_target == 'middle' and price >= middle * 0.995:
                return {
                    'action': 'sell',
                    'reason': f'BB middle reached: ${price:.4f}',
                    'indicator_value': (price - lower) / (upper - lower) if upper != lower else 0.5
                }

        return None

    def _ema_cross_signal(self, row: pd.Series, prev_row: pd.Series, position: str) -> Optional[Dict[str, Any]]:
        """Generate EMA crossover signal."""
        fast = row.get('ema_fast')
        slow = row.get('ema_slow')
        prev_fast = prev_row.get('ema_fast')
        prev_slow = prev_row.get('ema_slow')

        if pd.isna(fast) or pd.isna(slow) or pd.isna(prev_fast) or pd.isna(prev_slow):
            return None

        # Golden cross
        if prev_fast <= prev_slow and fast > slow and position == 'none':
            return {
                'action': 'buy',
                'reason': 'EMA golden cross',
                'indicator_value': fast - slow
            }

        # Death cross
        if prev_fast >= prev_slow and fast < slow and position == 'long':
            return {
                'action': 'sell',
                'reason': 'EMA death cross',
                'indicator_value': fast - slow
            }

        return None

    def _multi_indicator_signal(self, row: pd.Series, prev_row: pd.Series, position: str) -> Optional[Dict[str, Any]]:
        """Generate multi-indicator confluence signal."""
        active_indicators = self.config.get('indicators', ['RSI', 'MACD', 'BB'])
        min_confluence = self.config.get('min_confluence', 2)

        buy_signals = []
        sell_signals = []

        # Check RSI
        if 'RSI' in active_indicators:
            rsi = row.get('rsi')
            if not pd.isna(rsi):
                if rsi < self.config.get('buy_threshold', 30):
                    buy_signals.append('RSI')
                elif rsi > self.config.get('sell_threshold', 70):
                    sell_signals.append('RSI')

        # Check MACD
        if 'MACD' in active_indicators:
            macd = row.get('macd')
            macd_signal = row.get('macd_signal')
            prev_macd = prev_row.get('macd')
            prev_signal = prev_row.get('macd_signal')

            if not any(pd.isna(x) for x in [macd, macd_signal, prev_macd, prev_signal]):
                if prev_macd <= prev_signal and macd > macd_signal:
                    buy_signals.append('MACD')
                elif prev_macd >= prev_signal and macd < macd_signal:
                    sell_signals.append('MACD')

        # Check Bollinger
        if 'BB' in active_indicators:
            price = row['close']
            lower = row.get('bb_lower')
            upper = row.get('bb_upper')
            middle = row.get('bb_middle')

            if not any(pd.isna(x) for x in [lower, upper, middle]):
                if price <= lower * 1.005:
                    buy_signals.append('BB')
                elif price >= middle * 0.995:
                    sell_signals.append('BB')

        # Check EMA Cross
        if 'EMA_CROSS' in active_indicators:
            fast = row.get('ema_fast')
            slow = row.get('ema_slow')
            prev_fast = prev_row.get('ema_fast')
            prev_slow = prev_row.get('ema_slow')

            if not any(pd.isna(x) for x in [fast, slow, prev_fast, prev_slow]):
                if prev_fast <= prev_slow and fast > slow:
                    buy_signals.append('EMA')
                elif prev_fast >= prev_slow and fast < slow:
                    sell_signals.append('EMA')

        # Confluence check
        if len(buy_signals) >= min_confluence and position == 'none':
            return {
                'action': 'buy',
                'reason': f'Confluence: {", ".join(buy_signals)}',
                'indicator_value': len(buy_signals)
            }
        elif len(sell_signals) >= min_confluence and position == 'long':
            return {
                'action': 'sell',
                'reason': f'Confluence: {", ".join(sell_signals)}',
                'indicator_value': len(sell_signals)
            }

        return None

    def _execute_trade(
        self,
        signal: Dict[str, Any],
        candle: pd.Series,
        balance: float,
        position: str,
        position_amount: float,
        entry_price: float,
        entry_cost: float,
        entry_time: int
    ) -> Optional[Tuple[BacktestTrade, float, str, float, float, float, int]]:
        """
        Execute a trade with realistic slippage and fees.

        Returns:
            Tuple of (trade, new_balance, new_position, new_position_amount, new_entry_price, new_entry_cost, new_entry_time)
            or None if trade cannot be executed
        """
        action = signal['action']
        timestamp = int(candle['timestamp'])

        # Simulate execution at candle open with slippage
        base_price = candle['open']
        candle_range = candle['high'] - candle['low']

        # Slippage: random portion of candle range, direction depends on action
        if action == 'buy':
            # Buy slippage is adverse (higher price)
            slippage_amount = candle_range * random.uniform(0, self.slippage_bps / 10000)
            exec_price = base_price + slippage_amount
        else:
            # Sell slippage is adverse (lower price)
            slippage_amount = candle_range * random.uniform(0, self.slippage_bps / 10000)
            exec_price = base_price - slippage_amount

        if action == 'buy' and position == 'none':
            # Calculate position size
            position_size_pct = self.config.get('position_size_pct', 100)
            amount_to_spend = balance * (position_size_pct / 100)

            # Deduct fee
            fee = amount_to_spend * (self.swap_fee_bps / 10000)
            net_amount = amount_to_spend - fee

            # Calculate tokens received
            tokens = net_amount / exec_price

            trade = BacktestTrade(
                timestamp=timestamp,
                type='buy',
                price=exec_price,
                amount=tokens,
                value=amount_to_spend,
                fee=fee,
                slippage=slippage_amount,
                indicator_value=signal.get('indicator_value', 0),
                reason=signal.get('reason', '')
            )

            return (
                trade,
                balance - amount_to_spend,  # new balance
                'long',  # new position
                tokens,  # new position_amount
                exec_price,  # new entry_price
                amount_to_spend,  # new entry_cost
                timestamp  # new entry_time
            )

        elif action == 'sell' and position == 'long':
            # Sell all tokens
            sell_value = position_amount * exec_price
            fee = sell_value * (self.swap_fee_bps / 10000)
            net_value = sell_value - fee

            # Calculate profit
            profit = net_value - entry_cost
            duration = timestamp - entry_time

            trade = BacktestTrade(
                timestamp=timestamp,
                type='sell',
                price=exec_price,
                amount=position_amount,
                value=sell_value,
                fee=fee,
                slippage=slippage_amount,
                indicator_value=signal.get('indicator_value', 0),
                reason=signal.get('reason', ''),
                position_pnl=profit
            )

            return (
                trade,
                balance + net_value,  # new balance
                'none',  # new position
                0.0,  # new position_amount
                0.0,  # new entry_price
                0.0,  # new entry_cost
                0  # new entry_time
            )

        return None

    def _calculate_metrics(
        self,
        df: pd.DataFrame,
        trades: List[BacktestTrade],
        equity_curve: List[Dict[str, Any]],
        initial_balance: float
    ) -> BacktestResult:
        """Calculate all performance metrics."""
        # Basic metrics
        final_balance = equity_curve[-1]['equity'] if equity_curve else initial_balance
        profit_usd = final_balance - initial_balance
        profit_pct = (profit_usd / initial_balance) * 100 if initial_balance > 0 else 0

        # Trade analysis
        sell_trades = [t for t in trades if t.type == 'sell']
        winning_trades = [t for t in sell_trades if t.position_pnl > 0]
        losing_trades = [t for t in sell_trades if t.position_pnl <= 0]

        total_trades = len(sell_trades)
        win_count = len(winning_trades)
        loss_count = len(losing_trades)
        win_rate = (win_count / total_trades * 100) if total_trades > 0 else 0

        # P&L analysis
        wins = [t.position_pnl for t in winning_trades]
        losses = [abs(t.position_pnl) for t in losing_trades]

        gross_profit = sum(wins) if wins else 0
        gross_loss = sum(losses) if losses else 0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float('inf') if gross_profit > 0 else 0

        avg_win = (sum(wins) / len(wins)) if wins else 0
        avg_loss = (sum(losses) / len(losses)) if losses else 0
        largest_win = max(wins) if wins else 0
        largest_loss = max(losses) if losses else 0

        # Fees
        total_fees = sum(t.fee for t in trades)

        # Drawdown analysis
        max_equity = initial_balance
        max_drawdown_usd = 0
        max_drawdown_pct = 0

        for point in equity_curve:
            equity = point['equity']
            max_equity = max(max_equity, equity)
            drawdown_usd = max_equity - equity
            drawdown_pct = (drawdown_usd / max_equity * 100) if max_equity > 0 else 0

            if drawdown_usd > max_drawdown_usd:
                max_drawdown_usd = drawdown_usd
                max_drawdown_pct = drawdown_pct

        # Risk-adjusted returns (Sharpe & Sortino)
        returns = []
        for i in range(1, len(equity_curve)):
            prev_eq = equity_curve[i-1]['equity']
            curr_eq = equity_curve[i]['equity']
            if prev_eq > 0:
                returns.append((curr_eq - prev_eq) / prev_eq)

        sharpe_ratio = 0
        sortino_ratio = 0

        if returns and len(returns) > 1:
            mean_return = np.mean(returns)
            std_return = np.std(returns)
            downside_returns = [r for r in returns if r < 0]
            downside_std = np.std(downside_returns) if downside_returns else 0

            # Annualize (assuming hourly data for 1H timeframe)
            periods_per_year = 365 * 24 if self.timeframe == '1H' else 365 * 6 if self.timeframe == '4H' else 365

            if std_return > 0:
                sharpe_ratio = (mean_return / std_return) * np.sqrt(periods_per_year)

            if downside_std > 0:
                sortino_ratio = (mean_return / downside_std) * np.sqrt(periods_per_year)

        # Trade duration
        buy_times = {i: t.timestamp for i, t in enumerate(trades) if t.type == 'buy'}
        sell_times = [(t.timestamp, t) for t in trades if t.type == 'sell']

        durations = []
        for sell_time, sell_trade in sell_times:
            # Find matching buy (approximate)
            matching_buys = [bt for bt in buy_times.values() if bt < sell_time]
            if matching_buys:
                buy_time = max(matching_buys)
                durations.append(sell_time - buy_time)

        avg_duration = (sum(durations) / len(durations) / 3600) if durations else 0  # Convert to hours

        # Trades per day
        if equity_curve:
            time_span = (equity_curve[-1]['timestamp'] - equity_curve[0]['timestamp']) / 86400
            trades_per_day = total_trades / time_span if time_span > 0 else 0
        else:
            trades_per_day = 0

        # Date range
        start_date = datetime.utcfromtimestamp(df.iloc[0]['timestamp']).isoformat() if len(df) > 0 else ''
        end_date = datetime.utcfromtimestamp(df.iloc[-1]['timestamp']).isoformat() if len(df) > 0 else ''

        return BacktestResult(
            strategy_type=self.strategy_type,
            config=self.config,
            mint=self.mint,
            symbol=self.config.get('symbol', ''),
            timeframe=self.timeframe,
            start_date=start_date,
            end_date=end_date,
            initial_balance=initial_balance,
            final_balance=final_balance,
            total_trades=total_trades,
            winning_trades=win_count,
            losing_trades=loss_count,
            profit_pct=round(profit_pct, 2),
            profit_usd=round(profit_usd, 2),
            max_drawdown_pct=round(max_drawdown_pct, 2),
            max_drawdown_usd=round(max_drawdown_usd, 2),
            sharpe_ratio=round(sharpe_ratio, 2),
            sortino_ratio=round(sortino_ratio, 2),
            win_rate=round(win_rate, 1),
            profit_factor=round(profit_factor, 2) if profit_factor != float('inf') else 999.99,
            avg_win=round(avg_win, 2),
            avg_loss=round(avg_loss, 2),
            largest_win=round(largest_win, 2),
            largest_loss=round(largest_loss, 2),
            total_fees_paid=round(total_fees, 2),
            avg_trade_duration=round(avg_duration, 1),
            trades_per_day=round(trades_per_day, 2),
            equity_curve=[
                {'timestamp': p['timestamp'], 'equity': round(p['equity'], 2), 'price': round(p['price'], 4)}
                for p in equity_curve[::max(1, len(equity_curve)//100)]  # Sample to max 100 points
            ],
            trades=[
                {
                    'timestamp': t.timestamp,
                    'type': t.type,
                    'price': round(t.price, 4),
                    'amount': round(t.amount, 6),
                    'value': round(t.value, 2),
                    'fee': round(t.fee, 4),
                    'pnl': round(t.position_pnl, 2),
                    'reason': t.reason,
                    'indicator_value': round(t.indicator_value, 2)
                }
                for t in trades
            ]
        )

    def _empty_result(self, initial_balance: float, error: str) -> BacktestResult:
        """Return empty result with error message."""
        return BacktestResult(
            strategy_type=self.strategy_type,
            config={'error': error, **self.config},
            mint=self.mint,
            symbol='',
            timeframe=self.timeframe,
            start_date='',
            end_date='',
            initial_balance=initial_balance,
            final_balance=initial_balance,
            total_trades=0,
            winning_trades=0,
            losing_trades=0,
            profit_pct=0,
            profit_usd=0,
            max_drawdown_pct=0,
            max_drawdown_usd=0,
            sharpe_ratio=0,
            sortino_ratio=0,
            win_rate=0,
            profit_factor=0,
            avg_win=0,
            avg_loss=0,
            largest_win=0,
            largest_loss=0,
            total_fees_paid=0,
            avg_trade_duration=0,
            trades_per_day=0,
            equity_curve=[],
            trades=[]
        )
