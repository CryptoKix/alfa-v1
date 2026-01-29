#!/usr/bin/env python3
"""
Security Audit Logging Service for TacTix.

Provides centralized logging of security-relevant events including:
- Authentication attempts
- Trade executions
- Configuration changes
- Rate limit violations
- Error events
"""
import os
import json
import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from enum import Enum
from logging.handlers import RotatingFileHandler

# Configuration
AUDIT_LOG_DIR = os.getenv('TACTIX_AUDIT_LOG_DIR', 'logs')
AUDIT_LOG_FILE = os.getenv('TACTIX_AUDIT_LOG_FILE', 'audit.log')
AUDIT_LOG_MAX_BYTES = int(os.getenv('TACTIX_AUDIT_LOG_MAX_BYTES', str(10 * 1024 * 1024)))  # 10MB
AUDIT_LOG_BACKUP_COUNT = int(os.getenv('TACTIX_AUDIT_LOG_BACKUP_COUNT', '5'))
AUDIT_LOG_ENABLED = os.getenv('TACTIX_AUDIT_ENABLED', 'true').lower() == 'true'


class AuditEventType(Enum):
    """Types of security events."""
    # Authentication
    AUTH_LOGIN_SUCCESS = "auth.login.success"
    AUTH_LOGIN_FAILED = "auth.login.failed"
    AUTH_LOGOUT = "auth.logout"
    AUTH_SESSION_EXPIRED = "auth.session.expired"

    # Trading
    TRADE_EXECUTED = "trade.executed"
    TRADE_BLOCKED = "trade.blocked"
    TRADE_GUARD_VIOLATION = "trade.guard.violation"
    TRADE_CONFIRMED = "trade.confirmed"

    # Sniping
    SNIPE_DETECTED = "snipe.detected"
    SNIPE_EXECUTED = "snipe.executed"
    SNIPE_BLOCKED = "snipe.blocked"

    # Copy Trading
    COPY_SIGNAL_DETECTED = "copy.signal.detected"
    COPY_TRADE_EXECUTED = "copy.trade.executed"
    COPY_TRADE_BLOCKED = "copy.trade.blocked"

    # Bots
    BOT_CREATED = "bot.created"
    BOT_STARTED = "bot.started"
    BOT_STOPPED = "bot.stopped"
    BOT_TRADE_EXECUTED = "bot.trade.executed"
    BOT_ERROR = "bot.error"

    # Security
    RATE_LIMIT_EXCEEDED = "security.rate_limit"
    BLOCKED_TOKEN_ATTEMPT = "security.blocked_token"
    PERMISSION_DENIED = "security.permission_denied"
    SUSPICIOUS_ACTIVITY = "security.suspicious"

    # Configuration
    CONFIG_CHANGED = "config.changed"
    KEYSTORE_ACCESS = "config.keystore.access"

    # System
    SYSTEM_START = "system.start"
    SYSTEM_STOP = "system.stop"
    SYSTEM_ERROR = "system.error"


class AuditLogger:
    """
    Security audit logger with structured JSON output.

    Thread-safe singleton that writes to a dedicated audit log file.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initialize the audit logger."""
        self._enabled = AUDIT_LOG_ENABLED

        if not self._enabled:
            return

        # Create log directory
        log_dir = Path(AUDIT_LOG_DIR)
        log_dir.mkdir(parents=True, exist_ok=True)

        # Set up dedicated audit logger
        self._logger = logging.getLogger('tactix.audit')
        self._logger.setLevel(logging.INFO)
        self._logger.propagate = False  # Don't propagate to root logger

        # Rotating file handler
        log_path = log_dir / AUDIT_LOG_FILE
        handler = RotatingFileHandler(
            log_path,
            maxBytes=AUDIT_LOG_MAX_BYTES,
            backupCount=AUDIT_LOG_BACKUP_COUNT
        )
        handler.setFormatter(logging.Formatter('%(message)s'))
        self._logger.addHandler(handler)

        # Also add console handler for critical events
        console = logging.StreamHandler()
        console.setLevel(logging.WARNING)
        console.setFormatter(logging.Formatter('[AUDIT] %(message)s'))
        self._logger.addHandler(console)

    def log(
        self,
        event_type: AuditEventType,
        details: Optional[Dict[str, Any]] = None,
        severity: str = "info",
        user: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> None:
        """
        Log a security audit event.

        Args:
            event_type: Type of security event
            details: Additional event details
            severity: Event severity (info, warning, error, critical)
            user: User/wallet associated with event
            ip_address: Source IP address
        """
        if not self._enabled:
            return

        event = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "event_type": event_type.value,
            "severity": severity,
            "user": user,
            "ip_address": ip_address,
            "details": details or {}
        }

        # Log as JSON
        json_line = json.dumps(event, default=str)
        self._logger.log(
            self._get_log_level(severity),
            json_line
        )

    def _get_log_level(self, severity: str) -> int:
        """Map severity string to logging level."""
        return {
            "info": logging.INFO,
            "warning": logging.WARNING,
            "error": logging.ERROR,
            "critical": logging.CRITICAL
        }.get(severity, logging.INFO)

    # Convenience methods for common events
    def log_auth_success(self, ip_address: str):
        """Log successful authentication."""
        self.log(
            AuditEventType.AUTH_LOGIN_SUCCESS,
            severity="info",
            ip_address=ip_address
        )

    def log_auth_failed(self, ip_address: str, reason: str = None):
        """Log failed authentication attempt."""
        self.log(
            AuditEventType.AUTH_LOGIN_FAILED,
            details={"reason": reason},
            severity="warning",
            ip_address=ip_address
        )

    def log_trade(
        self,
        input_mint: str,
        output_mint: str,
        amount: float,
        usd_value: float,
        source: str,
        signature: str = None,
        user: str = None
    ):
        """Log trade execution."""
        self.log(
            AuditEventType.TRADE_EXECUTED,
            details={
                "input_mint": input_mint,
                "output_mint": output_mint,
                "amount": amount,
                "usd_value": usd_value,
                "source": source,
                "signature": signature
            },
            severity="info",
            user=user
        )

    def log_trade_blocked(
        self,
        input_mint: str,
        output_mint: str,
        amount: float,
        reason: str,
        user: str = None
    ):
        """Log blocked trade attempt."""
        self.log(
            AuditEventType.TRADE_BLOCKED,
            details={
                "input_mint": input_mint,
                "output_mint": output_mint,
                "amount": amount,
                "reason": reason
            },
            severity="warning",
            user=user
        )

    def log_rate_limit(self, ip_address: str, endpoint: str, count: int):
        """Log rate limit violation."""
        self.log(
            AuditEventType.RATE_LIMIT_EXCEEDED,
            details={"endpoint": endpoint, "request_count": count},
            severity="warning",
            ip_address=ip_address
        )

    def log_guard_violation(self, code: str, message: str, details: Dict = None):
        """Log trade guard violation."""
        self.log(
            AuditEventType.TRADE_GUARD_VIOLATION,
            details={"code": code, "message": message, **(details or {})},
            severity="warning"
        )

    def log_system_start(self):
        """Log system startup."""
        self.log(
            AuditEventType.SYSTEM_START,
            details={"version": "1.0.0"},  # Add actual version
            severity="info"
        )

    def log_system_error(self, error: str, context: Dict = None):
        """Log system error."""
        self.log(
            AuditEventType.SYSTEM_ERROR,
            details={"error": error, "context": context},
            severity="error"
        )


# Singleton instance
audit_logger = AuditLogger()


def audit_log(
    event_type: AuditEventType,
    details: Optional[Dict[str, Any]] = None,
    severity: str = "info",
    user: Optional[str] = None,
    ip_address: Optional[str] = None
) -> None:
    """Convenience function for audit logging."""
    audit_logger.log(event_type, details, severity, user, ip_address)
