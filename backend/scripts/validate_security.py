#!/usr/bin/env python3
"""
TacTix Security Configuration Validator

Run this script before starting TacTix to verify security settings.

Usage:
    python scripts/validate_security.py
    python scripts/validate_security.py --strict  # Fail on warnings too
"""
import os
import sys
import secrets
from pathlib import Path
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment
load_dotenv(Path(__file__).parent.parent / '.env')


class SecurityValidator:
    def __init__(self, strict: bool = False):
        self.strict = strict
        self.errors = []
        self.warnings = []

    def error(self, message: str):
        self.errors.append(f"  ✗ {message}")
        print(f"  ✗ {message}")

    def warning(self, message: str):
        self.warnings.append(f"  ⚠ {message}")
        print(f"  ⚠ {message}")

    def success(self, message: str):
        print(f"  ✓ {message}")

    def section(self, title: str):
        print(f"\n[{title}]")

    def validate_network(self):
        """Validate network isolation settings."""
        self.section("Network Isolation")

        host = os.getenv('TACTIX_HOST', '127.0.0.1')
        if host == '0.0.0.0':
            self.error("TACTIX_HOST is 0.0.0.0 - services exposed to network!")
        elif host in ('127.0.0.1', 'localhost'):
            self.success(f"TACTIX_HOST bound to localhost ({host})")
        else:
            self.warning(f"TACTIX_HOST is {host} - verify this is intentional")

        origins = os.getenv('TACTIX_ALLOWED_ORIGINS', '')
        if '*' in origins:
            self.error("TACTIX_ALLOWED_ORIGINS contains wildcard - all origins allowed!")
        elif origins:
            self.success(f"CORS restricted to: {origins}")
        else:
            self.success("CORS using default localhost origins")

    def validate_auth(self):
        """Validate authentication settings."""
        self.section("Authentication")

        auth_enabled = os.getenv('TACTIX_AUTH_ENABLED', 'true').lower() == 'true'
        if not auth_enabled:
            self.warning("Authentication is DISABLED (TACTIX_AUTH_ENABLED=false)")
        else:
            self.success("Authentication is enabled")

        session_secret = os.getenv('TACTIX_SESSION_SECRET', '')
        if not session_secret:
            self.warning("TACTIX_SESSION_SECRET not set - ephemeral sessions (reset on restart)")
        elif len(session_secret) < 32:
            self.warning("TACTIX_SESSION_SECRET is short - use at least 32 characters")
        else:
            self.success("Session secret is configured")

    def validate_keystore(self):
        """Validate keystore encryption settings."""
        self.section("Keystore Encryption")

        base_dir = Path(__file__).parent.parent
        keystore_path = base_dir / '.keystore.enc'
        plaintext_path = base_dir / 'keypair.json'

        if keystore_path.exists():
            self.success("Encrypted keystore found (.keystore.enc)")

            password = os.getenv('TACTIX_KEYSTORE_PASSWORD', '')
            if not password:
                self.error("TACTIX_KEYSTORE_PASSWORD not set - cannot decrypt keystore!")
            else:
                self.success("Keystore password is configured")

            if plaintext_path.exists():
                self.warning("Plaintext keypair.json still exists - delete after migration")
        else:
            if plaintext_path.exists():
                self.warning("Using plaintext keypair.json - encrypt with: python -m services.keystore migrate")
            else:
                self.warning("No keypair found - create keypair.json or .keystore.enc")

    def validate_session_keys(self):
        """Validate session key encryption."""
        self.section("Session Key Encryption")

        secret = os.getenv('SESSION_KEY_SECRET', '')
        if not secret:
            self.warning("SESSION_KEY_SECRET not set - session keys will not be secure")
        elif secret == 'tactix-session-key-secret-change-in-production':
            self.error("SESSION_KEY_SECRET is using INSECURE default value!")
        elif len(secret) < 32:
            self.warning("SESSION_KEY_SECRET is short - use at least 32 characters")
        else:
            self.success("Session key secret is configured")

    def validate_trade_limits(self):
        """Validate trade limit settings."""
        self.section("Trade Limits")

        max_single = float(os.getenv('MAX_SINGLE_TRADE_USD', '2500'))
        max_daily = float(os.getenv('MAX_DAILY_VOLUME_USD', '10000'))

        if max_single > 10000:
            self.warning(f"MAX_SINGLE_TRADE_USD is high (${max_single})")
        else:
            self.success(f"Max single trade: ${max_single}")

        if max_daily > 50000:
            self.warning(f"MAX_DAILY_VOLUME_USD is high (${max_daily})")
        else:
            self.success(f"Max daily volume: ${max_daily}")

        max_slippage = int(os.getenv('MAX_SLIPPAGE_BPS', '300'))
        if max_slippage > 500:
            self.warning(f"MAX_SLIPPAGE_BPS is very high ({max_slippage/100}%)")
        else:
            self.success(f"Max slippage: {max_slippage/100}%")

        sniper_max = float(os.getenv('SNIPER_MAX_AMOUNT_SOL', '0.5'))
        sniper_slip = float(os.getenv('SNIPER_MAX_SLIPPAGE_PCT', '5'))

        if sniper_max > 1.0:
            self.warning(f"SNIPER_MAX_AMOUNT_SOL is high ({sniper_max} SOL)")
        else:
            self.success(f"Sniper max amount: {sniper_max} SOL")

        if sniper_slip > 10:
            self.warning(f"SNIPER_MAX_SLIPPAGE_PCT is very high ({sniper_slip}%)")
        else:
            self.success(f"Sniper max slippage: {sniper_slip}%")

    def validate_rate_limiting(self):
        """Validate rate limiting settings."""
        self.section("Rate Limiting")

        enabled = os.getenv('TACTIX_RATE_LIMIT_ENABLED', 'true').lower() == 'true'
        if not enabled:
            self.warning("Rate limiting is DISABLED")
        else:
            self.success("Rate limiting is enabled")

        trade_limit = int(os.getenv('TACTIX_RATE_LIMIT_TRADE', '5'))
        if trade_limit > 20:
            self.warning(f"Trade rate limit is high ({trade_limit}/min)")
        else:
            self.success(f"Trade rate limit: {trade_limit}/min")

    def validate_audit(self):
        """Validate audit logging settings."""
        self.section("Audit Logging")

        enabled = os.getenv('TACTIX_AUDIT_ENABLED', 'true').lower() == 'true'
        if not enabled:
            self.warning("Audit logging is DISABLED")
        else:
            self.success("Audit logging is enabled")

            log_dir = os.getenv('TACTIX_AUDIT_LOG_DIR', 'logs')
            self.success(f"Audit logs in: {log_dir}/")

    def validate_api_keys(self):
        """Validate API key configuration."""
        self.section("API Keys")

        helius = os.getenv('HELIUS_API_KEY', '')
        if not helius:
            self.error("HELIUS_API_KEY not set - RPC will fail!")
        else:
            self.success("Helius API key is configured")

    def run(self) -> bool:
        """Run all validations and return success status."""
        print("=" * 60)
        print("TacTix Security Configuration Validator")
        print("=" * 60)

        self.validate_network()
        self.validate_auth()
        self.validate_keystore()
        self.validate_session_keys()
        self.validate_trade_limits()
        self.validate_rate_limiting()
        self.validate_audit()
        self.validate_api_keys()

        print("\n" + "=" * 60)
        print("Summary")
        print("=" * 60)

        if self.errors:
            print(f"\n{len(self.errors)} ERRORS (must fix):")
            for e in self.errors:
                print(e)

        if self.warnings:
            print(f"\n{len(self.warnings)} WARNINGS (review recommended):")
            for w in self.warnings:
                print(w)

        if not self.errors and not self.warnings:
            print("\n✓ All security checks passed!")
            return True
        elif not self.errors:
            print(f"\n⚠ {len(self.warnings)} warnings - review recommended")
            return not self.strict
        else:
            print(f"\n✗ {len(self.errors)} errors - fix before running!")
            return False


def main():
    strict = '--strict' in sys.argv

    validator = SecurityValidator(strict=strict)
    success = validator.run()

    print("\nUsage tips:")
    print("  - Copy .env.example to .env and configure")
    print("  - Run: python -m services.keystore migrate")
    print("  - Generate secrets: python -c \"import secrets; print(secrets.token_urlsafe(32))\"")

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
