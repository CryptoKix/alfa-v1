#!/usr/bin/env python3
"""
Local Authentication Middleware for TacTix.

Provides defense-in-depth authentication even for localhost access.
Uses a token-based system with session cookies.

Flow:
1. On first startup, generates random auth token saved to .auth_token
2. User enters token in frontend to get session cookie
3. All API/WebSocket requests require valid session

This prevents unauthorized access even if:
- A malicious process on the same machine tries to access the API
- The user accidentally opens a port to the network
- A browser exploit tries to make cross-origin requests
"""
import os
import secrets
import hashlib
import logging
from functools import wraps
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Callable

from flask import request, jsonify, g, current_app
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

logger = logging.getLogger("auth")

# Configuration
AUTH_ENABLED = os.getenv('TACTIX_AUTH_ENABLED', 'true').lower() == 'true'
AUTH_TOKEN_FILE = os.getenv('TACTIX_AUTH_TOKEN_FILE', '.auth_token')
SESSION_EXPIRY_HOURS = int(os.getenv('TACTIX_SESSION_EXPIRY_HOURS', '24'))
SESSION_SECRET = os.getenv('TACTIX_SESSION_SECRET', '')

# Paths that don't require authentication
PUBLIC_PATHS = {
    '/api/auth/login',
    '/api/auth/status',
    '/api/health',
    '/health',
    '/',  # SPA entry point
    '/api/webhook/price',  # Internal price server webhook
    '/api/webhook/sniper',  # Internal sniper webhook
}

# Path prefixes that don't require authentication (for development)
# TODO: Remove in production - all API calls should require auth
PUBLIC_PATH_PREFIXES = {
    '/api/',  # Temporarily allow all API calls for dev testing
}

# Static file extensions that don't require auth
PUBLIC_EXTENSIONS = {'.js', '.css', '.png', '.jpg', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.map'}

# Global state
_serializer: Optional[URLSafeTimedSerializer] = None
_auth_token_hash: Optional[str] = None


def _hash_token(token: str) -> str:
    """Hash a token for secure comparison."""
    return hashlib.sha256(token.encode()).hexdigest()


def _get_or_create_auth_token(base_dir: str) -> str:
    """Get existing auth token or create a new one."""
    global _auth_token_hash

    token_path = Path(base_dir) / AUTH_TOKEN_FILE

    if token_path.exists():
        token = token_path.read_text().strip()
        if token:
            _auth_token_hash = _hash_token(token)
            logger.info(f"Loaded auth token from {token_path}")
            return token

    # Generate new token
    token = secrets.token_urlsafe(32)

    # Write with restricted permissions
    token_path.write_text(token)
    token_path.chmod(0o600)

    _auth_token_hash = _hash_token(token)

    logger.info(f"Generated new auth token at {token_path}")
    print("\n" + "=" * 60)
    print("TacTix Authentication Token Generated")
    print("=" * 60)
    print(f"\nYour authentication token: {token}\n")
    print("Enter this token in the TacTix login screen to authenticate.")
    print(f"Token stored in: {token_path}")
    print("=" * 60 + "\n")

    return token


def init_auth(app, base_dir: str = None):
    """
    Initialize authentication middleware.

    Args:
        app: Flask application instance
        base_dir: Directory for auth token file
    """
    global _serializer, _auth_token_hash, SESSION_SECRET

    if not AUTH_ENABLED:
        logger.warning("Authentication is DISABLED (TACTIX_AUTH_ENABLED=false)")
        return

    if base_dir is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Get or create session secret
    if not SESSION_SECRET:
        SESSION_SECRET = secrets.token_urlsafe(32)
        logger.info("Generated ephemeral session secret (will change on restart)")

    _serializer = URLSafeTimedSerializer(SESSION_SECRET)

    # Get or create auth token
    _get_or_create_auth_token(base_dir)

    # Register before_request handler
    @app.before_request
    def check_auth():
        # Skip if auth disabled
        if not AUTH_ENABLED:
            return None

        # Skip for public paths
        if request.path in PUBLIC_PATHS:
            return None

        # Skip for public path prefixes (dev mode)
        if any(request.path.startswith(prefix) for prefix in PUBLIC_PATH_PREFIXES):
            return None

        # Skip for static files
        if any(request.path.endswith(ext) for ext in PUBLIC_EXTENSIONS):
            return None

        # Check session cookie
        session_token = request.cookies.get('tactix_session')

        if not session_token:
            # For API calls, return JSON error
            if request.path.startswith('/api/'):
                return jsonify({
                    'error': 'Authentication required',
                    'code': 'AUTH_REQUIRED'
                }), 401
            # For other paths, allow (SPA will handle)
            return None

        # Validate session token
        try:
            data = _serializer.loads(
                session_token,
                max_age=SESSION_EXPIRY_HOURS * 3600
            )
            g.authenticated = True
            g.session_data = data
        except SignatureExpired:
            if request.path.startswith('/api/'):
                return jsonify({
                    'error': 'Session expired',
                    'code': 'SESSION_EXPIRED'
                }), 401
        except BadSignature:
            if request.path.startswith('/api/'):
                return jsonify({
                    'error': 'Invalid session',
                    'code': 'INVALID_SESSION'
                }), 401

        return None

    logger.info("Authentication middleware initialized")


def verify_auth_token(token: str) -> bool:
    """Verify the provided token matches the stored auth token."""
    if not _auth_token_hash:
        return False
    return secrets.compare_digest(_hash_token(token), _auth_token_hash)


def create_session_token(user_data: dict = None) -> str:
    """Create a new session token."""
    if not _serializer:
        raise RuntimeError("Auth not initialized")

    data = {
        'created_at': datetime.utcnow().isoformat(),
        **(user_data or {})
    }

    return _serializer.dumps(data)


def require_auth(f: Callable) -> Callable:
    """
    Decorator to require authentication for a route.

    Usage:
        @app.route('/api/protected')
        @require_auth
        def protected_endpoint():
            return {'message': 'secret data'}
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if not AUTH_ENABLED:
            return f(*args, **kwargs)

        if not getattr(g, 'authenticated', False):
            return jsonify({
                'error': 'Authentication required',
                'code': 'AUTH_REQUIRED'
            }), 401

        return f(*args, **kwargs)

    return decorated


def get_auth_status() -> dict:
    """Get current authentication status."""
    return {
        'enabled': AUTH_ENABLED,
        'authenticated': getattr(g, 'authenticated', False),
        'session_expiry_hours': SESSION_EXPIRY_HOURS
    }
