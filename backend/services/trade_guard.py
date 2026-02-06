#!/usr/bin/env python3
"""
Trade Guard - Centralized trade validation and safety checks.

This module provides defense-in-depth protection for all trading operations,
regardless of authentication state. It enforces:
- Maximum single trade limits
- Daily volume limits
- Slippage bounds
- Trade cooldowns
- Token blocklists
- Large trade confirmations
- Transaction introspection
"""
import os
import time
import logging
import threading
from datetime import datetime, date
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger("trade_guard")

# Configuration from environment with sensible defaults
MAX_SINGLE_TRADE_USD = float(os.getenv('MAX_SINGLE_TRADE_USD', '2500'))
MAX_DAILY_VOLUME_USD = float(os.getenv('MAX_DAILY_VOLUME_USD', '10000'))
REQUIRE_CONFIRM_USD = float(os.getenv('REQUIRE_CONFIRM_USD', '1000'))
MIN_SLIPPAGE_BPS = int(os.getenv('MIN_SLIPPAGE_BPS', '10'))  # 0.1%
MAX_SLIPPAGE_BPS = int(os.getenv('MAX_SLIPPAGE_BPS', '300'))  # 3%
SNIPER_MAX_AMOUNT_SOL = float(os.getenv('SNIPER_MAX_AMOUNT_SOL', '0.5'))
SNIPER_MAX_SLIPPAGE_PCT = float(os.getenv('SNIPER_MAX_SLIPPAGE_PCT', '5'))
TRADE_COOLDOWN_SECONDS = int(os.getenv('TRADE_COOLDOWN_SECONDS', '5'))

# Known scam/honeypot tokens (add to this list as needed)
TOKEN_BLOCKLIST = set(os.getenv('TOKEN_BLOCKLIST', '').split(',')) - {''}

# Common stablecoins (exempt from some checks)
STABLECOINS = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  # USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  # USDT
}

# SOL mint
SOL_MINT = 'So11111111111111111111111111111111111111112'


@dataclass
class TradeGuardError(Exception):
    """Raised when a trade is rejected by the guard."""
    code: str
    message: str
    details: Dict[str, Any] = field(default_factory=dict)

    def __str__(self):
        return f"[{self.code}] {self.message}"


@dataclass
class DailyVolume:
    """Track daily trading volume."""
    date: str
    volume_usd: float = 0.0
    trade_count: int = 0


class TradeGuard:
    """
    Centralized trade safety and validation.

    Thread-safe singleton that tracks trade history and enforces limits.
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
        """Initialize instance state."""
        self._daily_volume = DailyVolume(date=str(date.today()))
        self._recent_trades: Dict[str, float] = {}  # mint -> last_trade_timestamp
        self._pending_confirmations: Dict[str, Dict] = {}  # trade_id -> trade_details
        self._volume_lock = threading.Lock()

    def _get_daily_volume(self) -> DailyVolume:
        """Get today's volume, resetting if date changed."""
        today = str(date.today())
        if self._daily_volume.date != today:
            self._daily_volume = DailyVolume(date=today)
        return self._daily_volume

    def validate_trade(
        self,
        input_mint: str,
        output_mint: str,
        amount: float,
        usd_value: float,
        slippage_bps: int,
        source: str = "Manual",
        require_confirmation: bool = True
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate a trade against all safety rules.

        Args:
            input_mint: Token being sold
            output_mint: Token being bought
            amount: Amount of input token
            usd_value: Estimated USD value of trade
            slippage_bps: Slippage tolerance in basis points
            source: Trade source identifier
            require_confirmation: Whether to require confirmation for large trades

        Returns:
            Tuple of (is_valid, confirmation_id or None)

        Raises:
            TradeGuardError: If trade violates any safety rule
        """
        # 1. Check token blocklist
        if input_mint in TOKEN_BLOCKLIST:
            raise TradeGuardError(
                code="BLOCKED_TOKEN",
                message=f"Token {input_mint[:8]}... is blocklisted",
                details={"mint": input_mint}
            )
        if output_mint in TOKEN_BLOCKLIST:
            raise TradeGuardError(
                code="BLOCKED_TOKEN",
                message=f"Token {output_mint[:8]}... is blocklisted",
                details={"mint": output_mint}
            )

        # 2. Check slippage bounds
        if slippage_bps < MIN_SLIPPAGE_BPS:
            raise TradeGuardError(
                code="SLIPPAGE_TOO_LOW",
                message=f"Slippage {slippage_bps/100:.2f}% below minimum {MIN_SLIPPAGE_BPS/100:.2f}%",
                details={"slippage_bps": slippage_bps, "min_bps": MIN_SLIPPAGE_BPS}
            )
        if slippage_bps > MAX_SLIPPAGE_BPS:
            raise TradeGuardError(
                code="SLIPPAGE_TOO_HIGH",
                message=f"Slippage {slippage_bps/100:.2f}% exceeds maximum {MAX_SLIPPAGE_BPS/100:.2f}%",
                details={"slippage_bps": slippage_bps, "max_bps": MAX_SLIPPAGE_BPS}
            )

        # 3. Check single trade limit
        if usd_value > MAX_SINGLE_TRADE_USD:
            raise TradeGuardError(
                code="TRADE_SIZE_EXCEEDED",
                message=f"Trade ${usd_value:.2f} exceeds maximum ${MAX_SINGLE_TRADE_USD:.2f}",
                details={"usd_value": usd_value, "max_usd": MAX_SINGLE_TRADE_USD}
            )

        # 4. Check daily volume limit
        with self._volume_lock:
            daily = self._get_daily_volume()
            projected_volume = daily.volume_usd + usd_value
            if projected_volume > MAX_DAILY_VOLUME_USD:
                raise TradeGuardError(
                    code="DAILY_LIMIT_EXCEEDED",
                    message=f"Trade would exceed daily limit: ${daily.volume_usd:.2f} + ${usd_value:.2f} > ${MAX_DAILY_VOLUME_USD:.2f}",
                    details={
                        "current_volume": daily.volume_usd,
                        "trade_value": usd_value,
                        "max_daily": MAX_DAILY_VOLUME_USD
                    }
                )

        # 5. Check trade cooldown (prevent rapid-fire trades on same token)
        trade_key = f"{input_mint}:{output_mint}"
        now = time.time()
        if trade_key in self._recent_trades:
            elapsed = now - self._recent_trades[trade_key]
            if elapsed < TRADE_COOLDOWN_SECONDS:
                raise TradeGuardError(
                    code="TRADE_COOLDOWN",
                    message=f"Trade on this pair too soon. Wait {TRADE_COOLDOWN_SECONDS - elapsed:.1f}s",
                    details={
                        "elapsed": elapsed,
                        "cooldown": TRADE_COOLDOWN_SECONDS,
                        "pair": trade_key
                    }
                )

        # 6. Large trade confirmation (for non-automated sources)
        confirmation_id = None
        if require_confirmation and usd_value >= REQUIRE_CONFIRM_USD:
            import uuid
            confirmation_id = str(uuid.uuid4())[:8]
            self._pending_confirmations[confirmation_id] = {
                "input_mint": input_mint,
                "output_mint": output_mint,
                "amount": amount,
                "usd_value": usd_value,
                "slippage_bps": slippage_bps,
                "source": source,
                "created_at": now,
                "expires_at": now + 300  # 5 minute expiry
            }
            logger.info(f"Large trade requires confirmation: ${usd_value:.2f} (ID: {confirmation_id})")

        return True, confirmation_id

    def validate_sniper_trade(
        self,
        amount_sol: float,
        slippage_pct: float,
        token_mint: str
    ) -> bool:
        """
        Validate a sniper trade with stricter limits.

        Args:
            amount_sol: SOL amount to spend
            slippage_pct: Slippage percentage (not basis points)
            token_mint: Token being sniped

        Returns:
            True if valid

        Raises:
            TradeGuardError: If trade violates sniper safety rules
        """
        # Check token blocklist
        if token_mint in TOKEN_BLOCKLIST:
            raise TradeGuardError(
                code="BLOCKED_TOKEN",
                message=f"Token {token_mint[:8]}... is blocklisted for sniping",
                details={"mint": token_mint}
            )

        # Check amount limit
        if amount_sol > SNIPER_MAX_AMOUNT_SOL:
            raise TradeGuardError(
                code="SNIPER_AMOUNT_EXCEEDED",
                message=f"Sniper amount {amount_sol} SOL exceeds max {SNIPER_MAX_AMOUNT_SOL} SOL",
                details={"amount": amount_sol, "max": SNIPER_MAX_AMOUNT_SOL}
            )

        # Check slippage limit
        if slippage_pct > SNIPER_MAX_SLIPPAGE_PCT:
            raise TradeGuardError(
                code="SNIPER_SLIPPAGE_EXCEEDED",
                message=f"Sniper slippage {slippage_pct}% exceeds max {SNIPER_MAX_SLIPPAGE_PCT}%",
                details={"slippage": slippage_pct, "max": SNIPER_MAX_SLIPPAGE_PCT}
            )

        return True

    def validate_token_safety(
        self,
        token_data: dict,
        sniper_settings: dict,
    ) -> bool:
        """
        Validate a token against sniper safety settings before auto-sniping.

        Checks (in order):
        1. Freeze authority — ALWAYS blocks (can freeze your tokens)
        2. Mint authority — blocks if requireMintRenounced is enabled
        3. is_rug flag — ALWAYS blocks, auto-adds to blocklist
        4. Socials — blocks if requireSocials is enabled and no links found

        Args:
            token_data: Token dict with mint, is_rug, mint_authority/mint_auth,
                        freeze_authority/freeze_auth, socials
            sniper_settings: User settings dict with requireMintRenounced,
                             requireLPBurned, requireSocials

        Returns:
            True if safe

        Raises:
            TradeGuardError: If token fails any safety check
        """
        mint = token_data.get('mint', '???')
        mint_short = mint[:8]

        # 1. Freeze authority — ALWAYS block. No legitimate new token needs this.
        freeze_auth = token_data.get('freeze_authority') or token_data.get('freeze_auth')
        if freeze_auth:
            self.add_to_blocklist(mint)
            logger.warning(f"🛡️ BLOCKED: {mint_short}... has freeze authority ({freeze_auth[:8]}...) — auto-blocklisted")
            raise TradeGuardError(
                code="FREEZE_AUTHORITY_ACTIVE",
                message=f"Token {mint_short}... has active freeze authority — can freeze your tokens at any time",
                details={"freeze_authority": freeze_auth, "mint": mint}
            )

        # 2. Mint authority — block if setting enabled (default: True)
        mint_auth = token_data.get('mint_authority') or token_data.get('mint_auth')
        if mint_auth and sniper_settings.get('requireMintRenounced', True):
            logger.warning(f"🛡️ BLOCKED: {mint_short}... has active mint authority ({mint_auth[:8]}...)")
            raise TradeGuardError(
                code="MINT_NOT_RENOUNCED",
                message=f"Token {mint_short}... has active mint authority — can inflate supply at any time",
                details={"mint_authority": mint_auth, "mint": mint}
            )

        # 3. is_rug flag — ALWAYS block and auto-blocklist
        if token_data.get('is_rug'):
            self.add_to_blocklist(mint)
            logger.warning(f"🛡️ BLOCKED: {mint_short}... flagged as rug — auto-blocklisted")
            raise TradeGuardError(
                code="RUG_DETECTED",
                message=f"Token {mint_short}... flagged as rug pull risk",
                details={"mint": mint}
            )

        # 4. Socials check — block if setting enabled
        if sniper_settings.get('requireSocials', False):
            socials = token_data.get('socials', {})
            if isinstance(socials, str):
                try:
                    import json
                    socials = json.loads(socials) if socials else {}
                except (ValueError, TypeError):
                    socials = {}
            has_socials = bool(
                socials.get('twitter') or socials.get('telegram') or socials.get('website')
            )
            if not has_socials:
                logger.warning(f"🛡️ BLOCKED: {mint_short}... has no social links")
                raise TradeGuardError(
                    code="NO_SOCIALS",
                    message=f"Token {mint_short}... has no social links (Twitter/Telegram/Website)",
                    details={"mint": mint}
                )

        # 5. LP burn check — log warning if setting enabled but we can't verify
        if sniper_settings.get('requireLPBurned', True):
            # LP burn verification requires on-chain LP token analysis.
            # For Pump.fun: bonding curve IS the liquidity (no LP tokens).
            # For Raydium: would need to check LP token holders vs burn address.
            # Currently: allow through with warning — full LP burn check is TODO.
            dex = token_data.get('dex_id', '')
            if dex != 'Pump.fun':
                logger.info(f"⚠️ LP burn check requested but not yet verifiable for {dex} — proceeding")

        return True

    def confirm_trade(self, confirmation_id: str) -> Dict:
        """
        Confirm a pending large trade.

        Args:
            confirmation_id: The ID returned from validate_trade

        Returns:
            The trade details if valid

        Raises:
            TradeGuardError: If confirmation is invalid or expired
        """
        if confirmation_id not in self._pending_confirmations:
            raise TradeGuardError(
                code="INVALID_CONFIRMATION",
                message=f"Unknown or expired confirmation ID: {confirmation_id}",
                details={"confirmation_id": confirmation_id}
            )

        trade = self._pending_confirmations[confirmation_id]

        if time.time() > trade["expires_at"]:
            del self._pending_confirmations[confirmation_id]
            raise TradeGuardError(
                code="CONFIRMATION_EXPIRED",
                message="Trade confirmation has expired. Please try again.",
                details={"confirmation_id": confirmation_id}
            )

        # Remove from pending
        del self._pending_confirmations[confirmation_id]
        return trade

    def record_trade(
        self,
        input_mint: str,
        output_mint: str,
        usd_value: float
    ) -> None:
        """
        Record a completed trade for tracking.

        Call this AFTER successful trade execution.
        """
        with self._volume_lock:
            daily = self._get_daily_volume()
            daily.volume_usd += usd_value
            daily.trade_count += 1

        # Update cooldown tracker
        trade_key = f"{input_mint}:{output_mint}"
        self._recent_trades[trade_key] = time.time()

        # Clean up old cooldown entries
        cutoff = time.time() - TRADE_COOLDOWN_SECONDS * 2
        self._recent_trades = {
            k: v for k, v in self._recent_trades.items()
            if v > cutoff
        }

        logger.info(f"Trade recorded: ${usd_value:.2f} (Daily total: ${daily.volume_usd:.2f})")

    def get_daily_stats(self) -> Dict:
        """Get current daily trading statistics."""
        with self._volume_lock:
            daily = self._get_daily_volume()
            return {
                "date": daily.date,
                "volume_usd": daily.volume_usd,
                "trade_count": daily.trade_count,
                "remaining_usd": MAX_DAILY_VOLUME_USD - daily.volume_usd,
                "limit_usd": MAX_DAILY_VOLUME_USD
            }

    def get_config(self) -> Dict:
        """Get current guard configuration."""
        return {
            "max_single_trade_usd": MAX_SINGLE_TRADE_USD,
            "max_daily_volume_usd": MAX_DAILY_VOLUME_USD,
            "require_confirm_usd": REQUIRE_CONFIRM_USD,
            "min_slippage_bps": MIN_SLIPPAGE_BPS,
            "max_slippage_bps": MAX_SLIPPAGE_BPS,
            "sniper_max_amount_sol": SNIPER_MAX_AMOUNT_SOL,
            "sniper_max_slippage_pct": SNIPER_MAX_SLIPPAGE_PCT,
            "trade_cooldown_seconds": TRADE_COOLDOWN_SECONDS,
            "blocklist_count": len(TOKEN_BLOCKLIST)
        }

    def add_to_blocklist(self, mint: str) -> None:
        """Add a token to the blocklist."""
        TOKEN_BLOCKLIST.add(mint)
        logger.warning(f"Token added to blocklist: {mint}")

    def remove_from_blocklist(self, mint: str) -> None:
        """Remove a token from the blocklist."""
        TOKEN_BLOCKLIST.discard(mint)
        logger.info(f"Token removed from blocklist: {mint}")


# Singleton instance
trade_guard = TradeGuard()


def validate_and_guard_trade(
    input_mint: str,
    output_mint: str,
    amount: float,
    usd_value: float,
    slippage_bps: int,
    source: str = "Manual"
) -> Tuple[bool, Optional[str]]:
    """
    Convenience function for trade validation.

    Returns:
        Tuple of (is_valid, confirmation_id or None)
    """
    return trade_guard.validate_trade(
        input_mint=input_mint,
        output_mint=output_mint,
        amount=amount,
        usd_value=usd_value,
        slippage_bps=slippage_bps,
        source=source
    )
