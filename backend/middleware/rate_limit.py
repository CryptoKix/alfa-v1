#!/usr/bin/env python3
"""
Rate Limiting Middleware for TacTix.

Provides per-endpoint rate limiting to prevent abuse and DoS attacks.
Uses a sliding window counter algorithm with in-memory storage.
"""
import os
import time
import threading
import logging
from functools import wraps
from collections import defaultdict
from typing import Callable, Optional, Dict, Tuple

from flask import request, jsonify, g

logger = logging.getLogger("rate_limit")

# Configuration
RATE_LIMIT_ENABLED = os.getenv('TACTIX_RATE_LIMIT_ENABLED', 'true').lower() == 'true'

# Default limits (calls per minute)
DEFAULT_LIMITS = {
    'trade': 5,        # Trading endpoints - 5/min
    'api': 60,         # General API - 60/min
    'webhook': 100,    # Webhooks - 100/min
    'auth': 10,        # Auth endpoints - 10/min
    'websocket': 120,  # WebSocket messages - 120/min
}

# Override from environment
for key in DEFAULT_LIMITS:
    env_var = f'TACTIX_RATE_LIMIT_{key.upper()}'
    if os.getenv(env_var):
        DEFAULT_LIMITS[key] = int(os.getenv(env_var))


class RateLimiter:
    """
    Sliding window rate limiter.

    Thread-safe implementation using a sliding log algorithm
    for accurate rate limiting across window boundaries.
    """

    def __init__(self, window_seconds: int = 60):
        self.window_seconds = window_seconds
        self._requests: Dict[str, list] = defaultdict(list)
        self._lock = threading.Lock()

    def _clean_old_requests(self, key: str, now: float) -> None:
        """Remove requests older than the window."""
        cutoff = now - self.window_seconds
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]

    def is_allowed(self, key: str, limit: int) -> Tuple[bool, int, int]:
        """
        Check if a request is allowed under the rate limit.

        Args:
            key: Unique identifier (e.g., IP + endpoint)
            limit: Maximum requests per window

        Returns:
            Tuple of (is_allowed, current_count, remaining)
        """
        now = time.time()

        with self._lock:
            self._clean_old_requests(key, now)

            current_count = len(self._requests[key])
            remaining = max(0, limit - current_count)

            if current_count >= limit:
                return False, current_count, 0

            self._requests[key].append(now)
            return True, current_count + 1, remaining - 1

    def get_reset_time(self, key: str) -> int:
        """Get seconds until the oldest request expires."""
        if key not in self._requests or not self._requests[key]:
            return 0

        oldest = min(self._requests[key])
        reset_at = oldest + self.window_seconds
        return max(0, int(reset_at - time.time()))

    def cleanup(self) -> int:
        """Remove all expired entries. Returns number of keys cleaned."""
        now = time.time()
        cleaned = 0

        with self._lock:
            for key in list(self._requests.keys()):
                self._clean_old_requests(key, now)
                if not self._requests[key]:
                    del self._requests[key]
                    cleaned += 1

        return cleaned


# Global rate limiter instance
_limiter: Optional[RateLimiter] = None


def init_rate_limiter(app=None):
    """Initialize the rate limiter."""
    global _limiter

    if not RATE_LIMIT_ENABLED:
        logger.warning("Rate limiting is DISABLED (TACTIX_RATE_LIMIT_ENABLED=false)")
        return

    _limiter = RateLimiter(window_seconds=60)

    # Start cleanup thread
    def cleanup_loop():
        while True:
            time.sleep(300)  # Every 5 minutes
            if _limiter:
                cleaned = _limiter.cleanup()
                if cleaned > 0:
                    logger.debug(f"Rate limiter cleanup: removed {cleaned} expired keys")

    cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
    cleanup_thread.start()

    logger.info(f"Rate limiter initialized with limits: {DEFAULT_LIMITS}")


def _get_client_key() -> str:
    """Get unique client identifier for rate limiting."""
    # Use IP address (consider X-Forwarded-For for proxied requests)
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ip:
        ip = ip.split(',')[0].strip()
    return ip or 'unknown'


def rate_limit(category: str = 'api', limit: Optional[int] = None):
    """
    Decorator to apply rate limiting to a route.

    Args:
        category: Rate limit category (trade, api, webhook, auth)
        limit: Override the default limit for this category

    Usage:
        @app.route('/api/trade')
        @rate_limit('trade')
        def trade():
            return {'success': True}
    """
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def decorated(*args, **kwargs):
            if not RATE_LIMIT_ENABLED or not _limiter:
                return f(*args, **kwargs)

            # Get limit for this category
            effective_limit = limit or DEFAULT_LIMITS.get(category, 60)

            # Build rate limit key
            client_key = _get_client_key()
            key = f"{client_key}:{category}:{request.endpoint}"

            # Check rate limit
            allowed, count, remaining = _limiter.is_allowed(key, effective_limit)

            # Add rate limit headers
            g.rate_limit_headers = {
                'X-RateLimit-Limit': str(effective_limit),
                'X-RateLimit-Remaining': str(remaining),
                'X-RateLimit-Reset': str(_limiter.get_reset_time(key))
            }

            if not allowed:
                logger.warning(f"Rate limit exceeded: {key} ({count}/{effective_limit})")
                return jsonify({
                    'error': 'Rate limit exceeded',
                    'code': 'RATE_LIMITED',
                    'retry_after': _limiter.get_reset_time(key)
                }), 429

            return f(*args, **kwargs)

        return decorated
    return decorator


def add_rate_limit_headers(response):
    """Add rate limit headers to response (call in after_request)."""
    headers = getattr(g, 'rate_limit_headers', None)
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response


# Endpoint category mappings for automatic rate limiting
ENDPOINT_CATEGORIES = {
    '/api/trade': 'trade',
    '/api/swap': 'trade',
    '/api/snipe': 'trade',
    '/api/bots': 'api',
    '/api/portfolio': 'api',
    '/api/auth': 'auth',
    '/api/webhook': 'webhook',
}


def get_endpoint_category(path: str) -> str:
    """Get the rate limit category for an endpoint path."""
    for prefix, category in ENDPOINT_CATEGORIES.items():
        if path.startswith(prefix):
            return category
    return 'api'
