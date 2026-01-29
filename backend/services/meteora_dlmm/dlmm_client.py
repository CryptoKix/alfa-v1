#!/usr/bin/env python3
"""
Meteora DLMM Client
Handles API calls to Meteora REST API and Node.js sidecar service.
"""

import requests
import logging
from typing import Optional, Dict, List, Any
from dataclasses import dataclass

logger = logging.getLogger("tactix.dlmm")

# Meteora API endpoints
METEORA_API_BASE = "https://dlmm-api.meteora.ag"
SIDECAR_BASE = "http://localhost:5002"


@dataclass
class DLMMPool:
    """Represents a Meteora DLMM pool."""
    address: str
    name: str
    token_x_mint: str
    token_y_mint: str
    token_x_symbol: str
    token_y_symbol: str
    bin_step: int
    base_fee_bps: int
    protocol_fee_bps: int
    liquidity: float
    volume_24h: float
    fees_24h: float
    apr: float
    price: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            'address': self.address,
            'name': self.name,
            'token_x_mint': self.token_x_mint,
            'token_y_mint': self.token_y_mint,
            'token_x_symbol': self.token_x_symbol,
            'token_y_symbol': self.token_y_symbol,
            'bin_step': self.bin_step,
            'base_fee_bps': self.base_fee_bps,
            'protocol_fee_bps': self.protocol_fee_bps,
            'liquidity': self.liquidity,
            'volume_24h': self.volume_24h,
            'fees_24h': self.fees_24h,
            'apr': self.apr,
            'price': self.price
        }


class DLMMClient:
    """Client for interacting with Meteora DLMM API and sidecar service."""

    def __init__(self, sidecar_url: str = SIDECAR_BASE):
        self.sidecar_url = sidecar_url
        self._pools_cache: Dict[str, DLMMPool] = {}
        self._cache_timestamp: float = 0

    def get_all_pools(self, refresh: bool = False) -> List[DLMMPool]:
        """Fetch all DLMM pools from Meteora API."""
        import time

        # Cache for 60 seconds
        if not refresh and time.time() - self._cache_timestamp < 60 and self._pools_cache:
            return list(self._pools_cache.values())

        try:
            response = requests.get(f"{METEORA_API_BASE}/pair/all", timeout=30)
            response.raise_for_status()
            data = response.json()

            pools = []
            for item in data:
                try:
                    name = item.get('name', '')
                    pool = DLMMPool(
                        address=item.get('address', ''),
                        name=name,
                        token_x_mint=item.get('mint_x', ''),
                        token_y_mint=item.get('mint_y', ''),
                        token_x_symbol=name.split('-')[0] if name and '-' in name else '',
                        token_y_symbol=name.split('-')[1] if name and '-' in name else '',
                        bin_step=self._safe_int(item.get('bin_step', 0)),
                        base_fee_bps=self._safe_int(self._safe_float(item.get('base_fee_percentage', 0)) * 100),
                        protocol_fee_bps=self._safe_int(self._safe_float(item.get('protocol_fee_percentage', 0)) * 100),
                        liquidity=self._safe_float(item.get('liquidity', 0)),
                        volume_24h=self._safe_float(item.get('trade_volume_24h', 0)),
                        fees_24h=self._safe_float(item.get('fees_24h', 0)),
                        apr=self._safe_float(item.get('apr', 0)),
                        price=self._safe_float(item.get('current_price', 0))
                    )
                    pools.append(pool)
                    self._pools_cache[pool.address] = pool
                except (KeyError, ValueError) as e:
                    logger.debug(f"Skipping malformed pool data: {e}")
                    continue

            self._cache_timestamp = time.time()
            logger.info(f"[DLMM] Fetched {len(pools)} pools")
            return pools

        except requests.RequestException as e:
            logger.error(f"[DLMM] Failed to fetch pools: {e}")
            return list(self._pools_cache.values()) if self._pools_cache else []

    def _safe_int(self, value, default: int = 0) -> int:
        """Safely convert value to int."""
        try:
            if isinstance(value, (int, float)):
                return int(value)
            if isinstance(value, str):
                # Handle malformed strings like "0.040.04..."
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

    def get_pool(self, address: str) -> Optional[DLMMPool]:
        """Get a specific pool by address."""
        if address in self._pools_cache:
            return self._pools_cache[address]

        # Try to fetch from API
        try:
            response = requests.get(f"{METEORA_API_BASE}/pair/{address}", timeout=15)
            response.raise_for_status()
            item = response.json()

            name = item.get('name', '')
            pool = DLMMPool(
                address=item.get('address', address),
                name=name,
                token_x_mint=item.get('mint_x', ''),
                token_y_mint=item.get('mint_y', ''),
                token_x_symbol=name.split('-')[0] if name and '-' in name else '',
                token_y_symbol=name.split('-')[1] if name and '-' in name else '',
                bin_step=self._safe_int(item.get('bin_step', 0)),
                base_fee_bps=self._safe_int(self._safe_float(item.get('base_fee_percentage', 0)) * 100),
                protocol_fee_bps=self._safe_int(self._safe_float(item.get('protocol_fee_percentage', 0)) * 100),
                liquidity=self._safe_float(item.get('liquidity', 0)),
                volume_24h=self._safe_float(item.get('trade_volume_24h', 0)),
                fees_24h=self._safe_float(item.get('fees_24h', 0)),
                apr=self._safe_float(item.get('apr', 0)),
                price=self._safe_float(item.get('current_price', 0))
            )
            self._pools_cache[address] = pool
            return pool

        except requests.RequestException as e:
            logger.error(f"[DLMM] Failed to fetch pool {address}: {e}")
            return None
        except Exception as e:
            logger.error(f"[DLMM] Error parsing pool {address}: {e}")
            return None

    def get_pool_info_from_sidecar(self, address: str) -> Optional[Dict]:
        """Get detailed pool info from sidecar (includes active bin)."""
        try:
            response = requests.get(f"{self.sidecar_url}/pool/{address}", timeout=15)
            response.raise_for_status()
            data = response.json()
            if data.get('success'):
                return data.get('pool')
            return None
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar pool info error: {e}")
            return None

    def get_bin_liquidity(self, address: str, bins_left: int = 35, bins_right: int = 35) -> Optional[Dict]:
        """Get actual bin liquidity distribution from sidecar."""
        try:
            response = requests.get(
                f"{self.sidecar_url}/pool/{address}/bins",
                params={'left': bins_left, 'right': bins_right},
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            if data.get('success'):
                return {
                    'activeBinId': data.get('activeBinId'),
                    'bins': data.get('bins', []),
                    'binStep': data.get('binStep')
                }
            return None
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar bin liquidity error: {e}")
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
            logger.error(f"[DLMM] Sidecar position info error: {e}")
            return None

    def calculate_bins(self, pool_address: str, risk_profile: str) -> Optional[Dict]:
        """Calculate bin range for a risk profile via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/calculate-bins",
                json={'poolAddress': pool_address, 'riskProfile': risk_profile},
                timeout=15
            )
            response.raise_for_status()
            data = response.json()
            if data.get('success'):
                return data
            return None
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar calculate bins error: {e}")
            return None

    def build_create_position_tx(self, params: Dict) -> Optional[Dict]:
        """Build create position transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/create-position",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar build create position error: {e}")
            return None

    def build_add_liquidity_tx(self, params: Dict) -> Optional[Dict]:
        """Build add liquidity transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/add-liquidity",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar build add liquidity error: {e}")
            return None

    def build_remove_liquidity_tx(self, params: Dict) -> Optional[Dict]:
        """Build remove liquidity transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/remove-liquidity",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar build remove liquidity error: {e}")
            return None

    def build_claim_fees_tx(self, params: Dict) -> Optional[Dict]:
        """Build claim fees transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/claim-fees",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar build claim fees error: {e}")
            return None

    def build_close_position_tx(self, params: Dict) -> Optional[Dict]:
        """Build close position transaction via sidecar."""
        try:
            response = requests.post(
                f"{self.sidecar_url}/build/close-position",
                json=params,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"[DLMM] Sidecar build close position error: {e}")
            return None

    def check_sidecar_health(self) -> bool:
        """Check if sidecar service is running."""
        try:
            response = requests.get(f"{self.sidecar_url}/health", timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False


# Singleton instance
dlmm_client = DLMMClient()
