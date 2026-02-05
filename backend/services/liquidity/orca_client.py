#!/usr/bin/env python3
"""
Orca Whirlpools Client
Handles API calls to Orca REST API and Node.js sidecar service.
"""

import requests
import logging
import time
from typing import Optional, Dict, List, Any
from dataclasses import dataclass

logger = logging.getLogger("tactix.orca")

# Orca API endpoints
ORCA_API_BASE = "https://api.orca.so"
SIDECAR_BASE = "http://localhost:5003"  # Dedicated Orca sidecar port


@dataclass
class OrcaPool:
    """Represents an Orca Whirlpool."""
    address: str
    name: str
    token_a_mint: str
    token_b_mint: str
    token_a_symbol: str
    token_b_symbol: str
    tick_spacing: int
    fee_rate: int  # In basis points
    liquidity: float
    volume_24h: float
    fees_24h: float
    apr: float
    price: float
    tvl: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            'address': self.address,
            'name': self.name,
            'token_a_mint': self.token_a_mint,
            'token_b_mint': self.token_b_mint,
            'token_a_symbol': self.token_a_symbol,
            'token_b_symbol': self.token_b_symbol,
            'tick_spacing': self.tick_spacing,
            'fee_rate': self.fee_rate,
            'liquidity': self.liquidity,
            'volume_24h': self.volume_24h,
            'fees_24h': self.fees_24h,
            'apr': self.apr,
            'price': self.price,
            'tvl': self.tvl,
            'protocol': 'orca'
        }


class OrcaClient:
    """Client for interacting with Orca Whirlpools API and sidecar service."""

    def __init__(self, sidecar_url: str = SIDECAR_BASE):
        self.sidecar_url = sidecar_url
        self._pools_cache: Dict[str, OrcaPool] = {}
        self._cache_timestamp: float = 0

    def get_all_pools(self, refresh: bool = False) -> List[OrcaPool]:
        """Fetch all Whirlpool pools from Orca API."""
        # Cache for 60 seconds
        if not refresh and time.time() - self._cache_timestamp < 60 and self._pools_cache:
            return list(self._pools_cache.values())

        try:
            # Orca pools endpoint
            response = requests.get(f"{ORCA_API_BASE}/v1/whirlpool/list", timeout=30)
            response.raise_for_status()
            data = response.json()

            pools = []
            whirlpools = data.get('whirlpools', [])

            for item in whirlpools:
                try:
                    token_a = item.get('tokenA', {})
                    token_b = item.get('tokenB', {})

                    pool = OrcaPool(
                        address=item.get('address', ''),
                        name=f"{token_a.get('symbol', '?')}-{token_b.get('symbol', '?')}",
                        token_a_mint=token_a.get('mint', ''),
                        token_b_mint=token_b.get('mint', ''),
                        token_a_symbol=token_a.get('symbol', ''),
                        token_b_symbol=token_b.get('symbol', ''),
                        tick_spacing=self._safe_int(item.get('tickSpacing', 0)),
                        fee_rate=self._safe_int(item.get('feeRate', 0)),
                        liquidity=self._safe_float(item.get('liquidity', 0)),
                        volume_24h=self._safe_float(item.get('volume', {}).get('day', 0)),
                        fees_24h=self._safe_float(item.get('feeApr', {}).get('day', 0)),
                        apr=self._safe_float(item.get('totalApr', {}).get('day', 0)),
                        price=self._safe_float(item.get('price', 0)),
                        tvl=self._safe_float(item.get('tvl', 0))
                    )
                    pools.append(pool)
                    self._pools_cache[pool.address] = pool
                except (KeyError, ValueError) as e:
                    logger.debug(f"Skipping malformed Orca pool data: {e}")
                    continue

            self._cache_timestamp = time.time()
            logger.info(f"[Orca] Fetched {len(pools)} pools")
            return pools

        except requests.RequestException as e:
            logger.error(f"[Orca] Failed to fetch pools: {e}")
            return list(self._pools_cache.values()) if self._pools_cache else []

    def _safe_int(self, value, default: int = 0) -> int:
        """Safely convert value to int."""
        try:
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                clean = value.split('.')[0] if '.' in value else value
                return int(clean) if clean else default
            return default
        except (ValueError, TypeError):
            return default

    def _safe_float(self, value, default: float = 0.0) -> float:
        """Safely convert value to float."""
        try:
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                return float(value)
            return default
        except (ValueError, TypeError):
            return default

    def get_pool(self, address: str) -> Optional[OrcaPool]:
        """Get a specific pool by address."""
        if address in self._pools_cache:
            return self._pools_cache[address]

        # Single pool endpoint doesn't work reliably - refresh full cache instead
        # This populates cache from list endpoint which has all the metrics
        if not self._pools_cache:
            logger.info(f"[Orca] Cache empty, fetching pools list for {address}")
            self.get_all_pools(refresh=True)
            if address in self._pools_cache:
                return self._pools_cache[address]

        # Pool not found in cache
        logger.warning(f"[Orca] Pool {address} not found in cache")
        return None

    def _get_pool_from_api(self, address: str) -> Optional[OrcaPool]:
        """Legacy: Try to fetch single pool from API (unreliable)."""
        try:
            response = requests.get(f"{ORCA_API_BASE}/v1/whirlpool/{address}", timeout=15)
            response.raise_for_status()
            item = response.json()

            # Validate response has actual pool data (not error response)
            if 'address' not in item and 'tokenA' not in item:
                logger.warning(f"[Orca] API returned invalid pool data for {address}")
                return None

            token_a = item.get('tokenA', {})
            token_b = item.get('tokenB', {})

            pool = OrcaPool(
                address=item.get('address', address),
                name=f"{token_a.get('symbol', '?')}-{token_b.get('symbol', '?')}",
                token_a_mint=token_a.get('mint', ''),
                token_b_mint=token_b.get('mint', ''),
                token_a_symbol=token_a.get('symbol', ''),
                token_b_symbol=token_b.get('symbol', ''),
                tick_spacing=self._safe_int(item.get('tickSpacing', 0)),
                fee_rate=self._safe_int(item.get('feeRate', 0)),
                liquidity=self._safe_float(item.get('liquidity', 0)),
                volume_24h=self._safe_float(item.get('volume', {}).get('day', 0)),
                fees_24h=self._safe_float(item.get('feeApr', {}).get('day', 0)),
                apr=self._safe_float(item.get('totalApr', {}).get('day', 0)),
                price=self._safe_float(item.get('price', 0)),
                tvl=self._safe_float(item.get('tvl', 0))
            )
            self._pools_cache[address] = pool
            return pool

        except requests.RequestException as e:
            logger.error(f"[Orca] Failed to fetch pool {address}: {e}")
            return None

    def get_pool_info_from_sidecar(self, address: str) -> Optional[Dict]:
        """Get detailed pool info from sidecar (includes current tick)."""
        try:
            response = requests.get(f"{self.sidecar_url}/pool/{address}", timeout=15)
            response.raise_for_status()
            data = response.json()
            # Sidecar returns pool data directly (not wrapped in success/pool)
            if data.get('address'):
                return data
            # Also handle wrapped response format
            if data.get('success'):
                return data.get('pool')
            return data if data else None
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar pool info error: {e}")
            return None

    def get_tick_data(self, address: str, count: int = 100) -> Optional[Dict]:
        """Get tick data around current price from sidecar."""
        try:
            response = requests.get(
                f"{self.sidecar_url}/pool/{address}/ticks",
                params={'count': count},
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            if data.get('success'):
                return {
                    'currentTick': data.get('currentTick'),
                    'ticks': data.get('ticks', []),
                    'tickSpacing': data.get('tickSpacing')
                }
            return None
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar tick data error: {e}")
            return None

    def get_position_info(self, pool_address: str, position_pubkey: str) -> Optional[Dict]:
        """Get position info from sidecar."""
        try:
            response = requests.get(
                f"{self.sidecar_url}/position/{pool_address}/{position_pubkey}",
                timeout=15
            )
            response.raise_for_status()
            data = response.json()
            if data.get('success'):
                return data.get('position')
            return None
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar position info error: {e}")
            return None

    def calculate_tick_range(self, pool_address: str, risk_profile: str) -> Optional[Dict]:
        """Calculate tick range for a risk profile via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/calculate-tick-range",
                json={'poolAddress': pool_address, 'riskProfile': risk_profile},
                timeout=15
            )
            response.raise_for_status()
            data = response.json()
            if data.get('success'):
                return data
            return None
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar calculate range error: {e}")
            return None

    def check_tick_arrays(self, pool_address: str, tick_lower: int, tick_upper: int) -> Optional[Dict]:
        """Check if tick arrays need initialization."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/initialize-tick-arrays",
                json={
                    'poolAddress': pool_address,
                    'tickLower': tick_lower,
                    'tickUpper': tick_upper
                },
                timeout=15
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar check tick arrays error: {e}")
            return None

    def build_open_position_tx(self, params: Dict) -> Optional[Dict]:
        """Build open position transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/open-position",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar build open position error: {e}")
            return None

    def build_increase_liquidity_tx(self, params: Dict) -> Optional[Dict]:
        """Build increase liquidity transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/increase-liquidity",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar build increase liquidity error: {e}")
            return None

    def build_decrease_liquidity_tx(self, params: Dict) -> Optional[Dict]:
        """Build decrease liquidity transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/decrease-liquidity",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar build decrease liquidity error: {e}")
            return None

    def build_collect_fees_tx(self, params: Dict) -> Optional[Dict]:
        """Build collect fees transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/collect-fees",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar build collect fees error: {e}")
            return None

    def build_collect_rewards_tx(self, params: Dict) -> Optional[Dict]:
        """Build collect rewards transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/collect-rewards",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar build collect rewards error: {e}")
            return None

    def build_close_position_tx(self, params: Dict) -> Optional[Dict]:
        """Build close position transaction via sidecar (includes collect fees/rewards)."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/close-position",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[Orca] Sidecar build close position error: {e}")
            return None

    def check_sidecar_health(self) -> bool:
        """Check if Orca sidecar service is running."""
        try:
            response = requests.get(f"{self.sidecar_url}/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                return data.get('service') == 'orca-sidecar' and data.get('initialized', False)
            return False
        except requests.RequestException:
            return False


# Singleton instance
orca_client = OrcaClient()
