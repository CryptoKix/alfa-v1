#!/usr/bin/env python3
"""Volume data service for VWAP calculations using Birdeye API."""
import time
import requests
from datetime import datetime, timedelta
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass

from config import BIRDEYE_API_KEY, BIRDEYE_OHLCV_API

# In-memory cache with TTL
_vwap_cache: Dict[str, Tuple[float, List[float], float]] = {}  # mint -> (vwap, hourly_weights, timestamp)
CACHE_TTL_SECONDS = 300  # 5 minutes


@dataclass
class OHLCVCandle:
    """Represents a single OHLCV candle."""
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def typical_price(self) -> float:
        """Calculate typical price: (High + Low + Close) / 3"""
        return (self.high + self.low + self.close) / 3


def fetch_ohlcv_data(mint: str, timeframe: str = "1H", hours_back: int = 24) -> List[OHLCVCandle]:
    """
    Fetch OHLCV data from Birdeye API.

    Args:
        mint: Token mint address
        timeframe: Candle timeframe ('1m', '5m', '15m', '1H', '4H', '1D')
        hours_back: Number of hours of history to fetch

    Returns:
        List of OHLCVCandle objects sorted by timestamp (oldest first)
    """
    if not BIRDEYE_API_KEY:
        print("WARNING: BIRDEYE_API_KEY not set, VWAP calculations will fail")
        return []

    # Calculate time range
    now = int(time.time())
    time_from = now - (hours_back * 3600)

    # Birdeye API request
    headers = {
        "X-API-KEY": BIRDEYE_API_KEY,
        "accept": "application/json"
    }

    params = {
        "address": mint,
        "type": timeframe,
        "time_from": time_from,
        "time_to": now
    }

    try:
        response = requests.get(BIRDEYE_OHLCV_API, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if not data.get("success") or not data.get("data", {}).get("items"):
            print(f"Birdeye OHLCV: No data for {mint[:8]}...")
            return []

        candles = []
        for item in data["data"]["items"]:
            candles.append(OHLCVCandle(
                timestamp=item.get("unixTime", 0),
                open=float(item.get("o", 0)),
                high=float(item.get("h", 0)),
                low=float(item.get("l", 0)),
                close=float(item.get("c", 0)),
                volume=float(item.get("v", 0))
            ))

        # Sort by timestamp (oldest first)
        candles.sort(key=lambda c: c.timestamp)
        print(f"Birdeye OHLCV: Fetched {len(candles)} candles for {mint[:8]}...")
        return candles

    except requests.exceptions.RequestException as e:
        print(f"Birdeye API error: {e}")
        return []
    except (KeyError, ValueError) as e:
        print(f"Birdeye data parsing error: {e}")
        return []


def calculate_vwap(candles: List[OHLCVCandle]) -> float:
    """
    Calculate Volume-Weighted Average Price from candles.

    VWAP = Sum(Typical Price * Volume) / Sum(Volume)
    where Typical Price = (High + Low + Close) / 3

    Returns:
        VWAP value, or 0 if no data
    """
    if not candles:
        return 0.0

    total_tp_volume = 0.0
    total_volume = 0.0

    for candle in candles:
        if candle.volume > 0:
            total_tp_volume += candle.typical_price * candle.volume
            total_volume += candle.volume

    if total_volume == 0:
        return 0.0

    return total_tp_volume / total_volume


def get_hourly_volume_weights(candles: List[OHLCVCandle]) -> List[float]:
    """
    Calculate normalized volume weights for each hour of the day (0-23).

    Returns:
        List of 24 weights (sum = 1.0), indexed by hour
    """
    # Initialize hourly volume buckets
    hourly_volumes = [0.0] * 24

    for candle in candles:
        if candle.volume > 0:
            # Get hour from timestamp (UTC)
            hour = datetime.utcfromtimestamp(candle.timestamp).hour
            hourly_volumes[hour] += candle.volume

    # Normalize to weights that sum to 1.0
    total_volume = sum(hourly_volumes)
    if total_volume == 0:
        # No volume data - return uniform distribution
        return [1.0 / 24] * 24

    weights = [v / total_volume for v in hourly_volumes]
    return weights


def get_vwap_for_token(mint: str, window_hours: int = 24) -> Tuple[float, List[float]]:
    """
    Get VWAP and hourly volume weights for a token, with caching.

    Args:
        mint: Token mint address
        window_hours: VWAP calculation window (1, 4, 24, or 168 hours)

    Returns:
        Tuple of (vwap_price, hourly_weights[24])
    """
    cache_key = f"{mint}:{window_hours}"

    # Check cache
    if cache_key in _vwap_cache:
        vwap, weights, cached_at = _vwap_cache[cache_key]
        if time.time() - cached_at < CACHE_TTL_SECONDS:
            return vwap, weights

    # Fetch fresh data
    # Use 1H candles for windows >= 4 hours, otherwise 15m
    timeframe = "1H" if window_hours >= 4 else "15m"
    candles = fetch_ohlcv_data(mint, timeframe, window_hours)

    if not candles:
        # Return defaults if no data
        return 0.0, [1.0 / 24] * 24

    vwap = calculate_vwap(candles)
    weights = get_hourly_volume_weights(candles)

    # Cache result
    _vwap_cache[cache_key] = (vwap, weights, time.time())

    return vwap, weights


def calculate_vwap_execution_amount(
    total_amount: float,
    hourly_weights: List[float],
    current_hour: int,
    duration_hours: int,
    runs_per_hour: int
) -> float:
    """
    Calculate volume-weighted execution amount for the current slot.

    Args:
        total_amount: Total amount to execute over the duration
        hourly_weights: 24-element list of hourly volume weights
        current_hour: Current hour (0-23)
        duration_hours: Total duration of VWAP execution
        runs_per_hour: Number of execution slots per hour

    Returns:
        Amount to execute in this slot
    """
    if duration_hours <= 0 or runs_per_hour <= 0:
        return 0.0

    # Base amount per execution slot (if uniform distribution)
    total_slots = duration_hours * runs_per_hour
    base_per_slot = total_amount / total_slots

    # Get weight for current hour
    hour_weight = hourly_weights[current_hour % 24]

    # Average weight (uniform distribution)
    avg_weight = 1.0 / 24

    # Relative weight: how much more/less than average this hour should get
    if avg_weight > 0:
        relative_weight = hour_weight / avg_weight
    else:
        relative_weight = 1.0

    # Cap at 3x to prevent extreme concentration
    relative_weight = min(relative_weight, 3.0)

    # Calculate weighted amount
    weighted_amount = base_per_slot * relative_weight

    return weighted_amount


def clear_vwap_cache(mint: Optional[str] = None):
    """Clear VWAP cache for a specific mint or all mints."""
    global _vwap_cache
    if mint:
        keys_to_remove = [k for k in _vwap_cache if k.startswith(f"{mint}:")]
        for key in keys_to_remove:
            del _vwap_cache[key]
    else:
        _vwap_cache = {}
