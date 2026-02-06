"""TactixDB — PostgreSQL backend via SQLAlchemy Core.

Drop-in replacement for the SQLite TactixDB. All method signatures
and return types are identical. Internal storage moved to PostgreSQL
via SQLAlchemy Core engine and connection pooling.
"""
import json

import sqlalchemy as sa
from sqlalchemy import func, case
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db_engine import get_engine
from models import (
    trades, bots, snapshots, tokens, signals, user_wallets, targets,
    arb_pairs, address_book, sniped_tokens, settings, session_keys,
    yield_positions, dlmm_positions, dlmm_sniper_settings,
    dlmm_sniped_pools, liquidity_positions, rebalance_history,
    yield_strategies, yield_strategy_logs, backtest_results,
    skr_staking_events, skr_staking_snapshots,
)


class TactixDB:
    def __init__(self, engine=None, pool_size=10):
        if engine is not None:
            self.engine = engine
        else:
            self.engine = get_engine(pool_size=pool_size)

    # ─── Settings ──────────────────────────────────────────────────────────

    def save_setting(self, key, value):
        """Save a general setting (JSON encoded)."""
        stmt = pg_insert(settings).values(
            key=key, value_json=json.dumps(value), updated_at=func.now(),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=['key'],
            set_={'value_json': stmt.excluded.value_json, 'updated_at': func.now()},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_setting(self, key, default=None):
        """Retrieve a general setting."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(settings.c.value_json).where(settings.c.key == key)
            ).mappings().fetchone()
            return json.loads(row['value_json']) if row else default

    # ─── Sniped Tokens ─────────────────────────────────────────────────────

    def save_sniped_token(self, token_data):
        """Record a newly detected token launch."""
        vals = {
            'mint': token_data.get('mint'),
            'symbol': token_data.get('symbol'),
            'name': token_data.get('name'),
            'pool_address': token_data.get('pool_address'),
            'dex_id': token_data.get('dex_id'),
            'initial_liquidity': token_data.get('initial_liquidity'),
            'socials_json': json.dumps(token_data.get('socials', {})),
            'signature': token_data.get('signature'),
            'status': token_data.get('status', 'tracking'),
            'is_rug': token_data.get('is_rug', False),
            'mint_authority': token_data.get('mint_authority') or token_data.get('mint_auth'),
            'freeze_authority': token_data.get('freeze_authority') or token_data.get('freeze_auth'),
        }
        stmt = pg_insert(sniped_tokens).values(**vals)
        stmt = stmt.on_conflict_do_update(
            index_elements=['mint'],
            set_={k: stmt.excluded[k] for k in vals if k != 'mint'},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_tracked_tokens(self, limit=50):
        """Fetch recently detected tokens."""
        q = sa.select(sniped_tokens).order_by(
            sniped_tokens.c.detected_at.desc()
        ).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    # ─── Address Book ──────────────────────────────────────────────────────

    def save_address(self, address, alias, notes=None):
        """Save or update an address in the address book."""
        stmt = pg_insert(address_book).values(
            address=address, alias=alias, notes=notes,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=['address'],
            set_={'alias': stmt.excluded.alias, 'notes': stmt.excluded.notes},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_address_book(self):
        """Fetch all saved addresses."""
        with self.engine.connect() as conn:
            rows = conn.execute(
                sa.select(address_book).order_by(address_book.c.alias.asc())
            ).mappings().fetchall()
            return [dict(r) for r in rows]

    def delete_address(self, address):
        """Remove an address from the address book."""
        with self.engine.begin() as conn:
            conn.execute(
                address_book.delete().where(address_book.c.address == address)
            )

    # ─── User Wallets ──────────────────────────────────────────────────────

    def save_user_wallet(self, address, alias, is_default=0):
        """Save or update a user's own wallet."""
        stmt = pg_insert(user_wallets).values(
            address=address, alias=alias, is_default=bool(is_default),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=['address'],
            set_={'alias': stmt.excluded.alias, 'is_default': stmt.excluded.is_default},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_user_wallets(self):
        """Fetch all user wallets."""
        with self.engine.connect() as conn:
            rows = conn.execute(sa.select(user_wallets)).mappings().fetchall()
            return [dict(r) for r in rows]

    def get_wallet_alias(self, address):
        """Get alias for a specific user wallet address."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(user_wallets.c.alias).where(
                    user_wallets.c.address == address
                )
            ).fetchone()
            return row[0] if row else None

    # ─── Signals (Copy Trader Detections) ──────────────────────────────────

    def save_signal(self, signature, wallet, signal_type, details=None):
        """Record a detected copy trader signal."""
        stmt = pg_insert(signals).values(
            signature=signature, wallet_address=wallet,
            type=signal_type, details_json=json.dumps(details or {}),
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=['signature'])
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_signals(self, limit=50, wallet=None):
        """Fetch recent signals."""
        q = sa.select(signals)
        if wallet:
            q = q.where(signals.c.wallet_address == wallet)
        q = q.order_by(signals.c.id.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    # ─── Tokens ────────────────────────────────────────────────────────────

    def save_token(self, mint, symbol, decimals, logo_uri=None, name=None, market_cap=0):
        """Save or update token metadata."""
        vals = {
            'mint': mint, 'symbol': symbol, 'decimals': decimals,
            'logo_uri': logo_uri, 'name': name, 'market_cap': market_cap,
            'last_updated': func.now(),
        }
        stmt = pg_insert(tokens).values(**vals)
        stmt = stmt.on_conflict_do_update(
            index_elements=['mint'],
            set_={k: stmt.excluded[k] for k in vals if k != 'mint'},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_known_tokens(self):
        """Fetch all discovered tokens."""
        with self.engine.connect() as conn:
            rows = conn.execute(
                sa.select(tokens).where(tokens.c.is_active == True)  # noqa: E712
            ).mappings().fetchall()
            return {
                row['mint']: {
                    'symbol': row['symbol'],
                    'decimals': row['decimals'],
                    'logo_uri': row['logo_uri'],
                }
                for row in rows
            }

    def get_top_tokens(self, limit=100):
        """Fetch top tokens by market cap."""
        q = sa.select(
            tokens.c.mint, tokens.c.symbol, tokens.c.name,
            tokens.c.decimals, tokens.c.logo_uri, tokens.c.market_cap,
        ).where(
            tokens.c.is_active == True  # noqa: E712
        ).order_by(tokens.c.market_cap.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def bulk_save_tokens(self, token_list):
        """Bulk insert/update tokens."""
        if not token_list:
            return
        with self.engine.begin() as conn:
            for t in token_list:
                vals = {
                    'mint': t['mint'], 'symbol': t['symbol'],
                    'name': t.get('name'), 'decimals': t.get('decimals', 9),
                    'logo_uri': t.get('logo_uri'),
                    'market_cap': t.get('market_cap', 0),
                    'last_updated': func.now(),
                }
                stmt = pg_insert(tokens).values(**vals)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['mint'],
                    set_={k: stmt.excluded[k] for k in vals if k != 'mint'},
                )
                conn.execute(stmt)

    # ─── Trades ────────────────────────────────────────────────────────────

    def log_trade(self, trade_data):
        """Record a trade execution."""
        with self.engine.begin() as conn:
            conn.execute(trades.insert().values(
                wallet_address=trade_data.get('wallet_address'),
                source=trade_data.get('source'),
                input_symbol=trade_data.get('input'),
                output_symbol=trade_data.get('output'),
                input_mint=trade_data.get('input_mint'),
                output_mint=trade_data.get('output_mint'),
                amount_in=trade_data.get('amount_in'),
                amount_out=trade_data.get('amount_out'),
                usd_value=trade_data.get('usd_value'),
                slippage_bps=trade_data.get('slippage_bps'),
                priority_fee=trade_data.get('priority_fee'),
                swap_fee=trade_data.get('swap_fee'),
                swap_fee_currency=trade_data.get('swap_fee_currency'),
                signature=trade_data.get('signature'),
                status=trade_data.get('status'),
                error=trade_data.get('error'),
            ))

    # ─── Bots ──────────────────────────────────────────────────────────────

    def save_bot(self, bot_id, bot_type, input_m, output_m, in_sym, out_sym, config, state, user_wallet=None):
        """Create or update a bot strategy."""
        vals = {
            'id': bot_id, 'type': bot_type,
            'input_mint': input_m, 'output_mint': output_m,
            'input_symbol': in_sym, 'output_symbol': out_sym,
            'config_json': json.dumps(config), 'state_json': json.dumps(state),
            'status': state.get('status', 'active'),
            'user_wallet': user_wallet,
        }
        stmt = pg_insert(bots).values(**vals)
        stmt = stmt.on_conflict_do_update(
            index_elements=['id'],
            set_={k: stmt.excluded[k] for k in vals if k != 'id'},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_all_bots(self, include_deleted=False):
        """Fetch all bots."""
        q = sa.select(bots)
        if not include_deleted:
            q = q.where(bots.c.status != 'deleted')
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def get_bot(self, bot_id):
        """Fetch a single bot by ID."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(bots).where(bots.c.id == bot_id)
            ).mappings().fetchone()
            return dict(row) if row else None

    def set_bot_processing(self, bot_id, is_processing=True):
        """Set bot processing flag atomically."""
        with self.engine.begin() as conn:
            conn.execute(
                bots.update().where(bots.c.id == bot_id).values(
                    is_processing=1 if is_processing else 0
                )
            )

    def clear_stale_processing_flags(self):
        """Clear any stale is_processing flags on startup."""
        with self.engine.begin() as conn:
            conn.execute(bots.update().values(is_processing=0))

    def update_bot_status(self, bot_id, status):
        """Update a bot's status field."""
        with self.engine.begin() as conn:
            conn.execute(
                bots.update().where(bots.c.id == bot_id).values(status=status)
            )

    def update_bot_config_json(self, bot_id, config_json):
        """Update a bot's config JSON."""
        val = config_json if isinstance(config_json, str) else json.dumps(config_json)
        with self.engine.begin() as conn:
            conn.execute(
                bots.update().where(bots.c.id == bot_id).values(config_json=val)
            )

    # ─── Trade History ─────────────────────────────────────────────────────

    def get_history(self, limit=50, wallet_address=None):
        """Fetch recent trade history."""
        q = sa.select(
            trades.c.id, trades.c.timestamp, trades.c.wallet_address,
            trades.c.source,
            trades.c.input_symbol.label('input'),
            trades.c.output_symbol.label('output'),
            trades.c.input_mint, trades.c.output_mint,
            trades.c.amount_in, trades.c.amount_out, trades.c.usd_value,
            trades.c.slippage_bps, trades.c.priority_fee,
            trades.c.swap_fee, trades.c.swap_fee_currency,
            trades.c.signature, trades.c.status, trades.c.error,
        )
        if wallet_address:
            q = q.where(trades.c.wallet_address == wallet_address)
        q = q.order_by(trades.c.timestamp.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def get_snipe_positions(self, limit=50):
        """Fetch successful snipe buys that haven't been sold yet."""
        # Subquery: mints that have a successful sell trade
        sold_mints = sa.select(trades.c.input_mint).where(
            trades.c.source.like('Snipe Sell%'),
            trades.c.status == 'success',
        ).scalar_subquery()

        q = sa.select(
            trades.c.id, trades.c.timestamp,
            trades.c.output_symbol.label('symbol'),
            trades.c.output_mint.label('mint'),
            trades.c.amount_in.label('sol_spent'),
            trades.c.amount_out.label('tokens_received'),
            trades.c.usd_value,
            trades.c.source, trades.c.signature,
        ).where(
            trades.c.source.like('Snipe%'),
            ~trades.c.source.like('Snipe Sell%'),
            trades.c.status == 'success',
            ~trades.c.output_mint.in_(sold_mints),
        ).order_by(trades.c.timestamp.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    # ─── Snapshots ─────────────────────────────────────────────────────────

    def record_snapshot(self, total_value, wallet, holdings):
        """Save a portfolio snapshot for historical charting."""
        with self.engine.begin() as conn:
            conn.execute(snapshots.insert().values(
                total_value_usd=total_value,
                wallet_address=wallet,
                holdings_json=json.dumps(holdings),
            ))

    def get_last_snapshot_timestamp(self):
        """Get the timestamp of the most recent snapshot (for throttling)."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(snapshots.c.timestamp).order_by(
                    snapshots.c.timestamp.desc()
                ).limit(1)
            ).fetchone()
            return row[0] if row else None

    def get_snapshot_24h_ago(self):
        """Get the snapshot closest to 24 hours ago."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(
                    snapshots.c.total_value_usd, snapshots.c.holdings_json,
                ).where(
                    snapshots.c.timestamp <= func.now() - sa.text("INTERVAL '24 hours'")
                ).order_by(snapshots.c.timestamp.desc()).limit(1)
            ).mappings().fetchone()
            return dict(row) if row else None

    def get_snapshots(self, limit=168):
        """Fetch historical portfolio snapshots."""
        q = sa.select(snapshots).order_by(
            snapshots.c.timestamp.desc()
        ).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            result = [dict(r) for r in rows]
            return sorted(result, key=lambda x: x['timestamp'])

    # ─── Targets (Copy Trade) ─────────────────────────────────────────────

    def save_target(self, address, alias, tags=None, config=None, performance=None, status='active'):
        """Create or update a copy-trade target wallet."""
        vals = {
            'address': address, 'alias': alias,
            'tags': json.dumps(tags or []),
            'config_json': json.dumps(config or {}),
            'performance_json': json.dumps(performance or {}),
            'status': status,
        }
        stmt = pg_insert(targets).values(**vals)
        stmt = stmt.on_conflict_do_update(
            index_elements=['address'],
            set_={k: stmt.excluded[k] for k in vals if k != 'address'},
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_target(self, address):
        """Fetch a single target by address."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(targets).where(targets.c.address == address)
            ).mappings().fetchone()
            return dict(row) if row else None

    def update_target_config(self, address, config):
        """Update target configuration."""
        with self.engine.begin() as conn:
            conn.execute(
                targets.update().where(targets.c.address == address).values(
                    config_json=json.dumps(config)
                )
            )

    def update_target_status(self, address, status):
        """Update target status."""
        with self.engine.begin() as conn:
            conn.execute(
                targets.update().where(targets.c.address == address).values(
                    status=status
                )
            )

    def get_all_targets(self, include_deleted=False):
        """Fetch all tracked wallets."""
        q = sa.select(targets)
        if not include_deleted:
            q = q.where(targets.c.status != 'deleted')
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def delete_target(self, address):
        """Mark a target as deleted."""
        with self.engine.begin() as conn:
            conn.execute(
                targets.update().where(targets.c.address == address).values(
                    status='deleted'
                )
            )

    def update_target_alias(self, address, new_alias):
        """Update the alias of a target wallet."""
        with self.engine.begin() as conn:
            conn.execute(
                targets.update().where(targets.c.address == address).values(
                    alias=new_alias
                )
            )

    # ─── Arb Pairs ─────────────────────────────────────────────────────────

    def save_arb_pair(self, input_mint, output_mint, input_symbol, output_symbol, amount):
        """Save a new arb pair monitoring target."""
        with self.engine.begin() as conn:
            conn.execute(arb_pairs.insert().values(
                input_mint=input_mint, output_mint=output_mint,
                input_symbol=input_symbol, output_symbol=output_symbol,
                amount=amount,
            ))

    def get_arb_pairs(self):
        """Fetch all monitored arb pairs."""
        with self.engine.connect() as conn:
            rows = conn.execute(sa.select(arb_pairs)).mappings().fetchall()
            return [dict(r) for r in rows]

    def delete_arb_pair(self, pair_id):
        """Remove an arb pair from monitoring."""
        with self.engine.begin() as conn:
            conn.execute(
                arb_pairs.delete().where(arb_pairs.c.id == pair_id)
            )

    # ─── Session Keys ─────────────────────────────────────────────────────

    def save_session_key(self, user_wallet, session_pubkey, session_secret_encrypted, permissions, expires_at):
        """Store a new session key delegation."""
        vals = {
            'user_wallet': user_wallet,
            'session_pubkey': session_pubkey,
            'session_secret_encrypted': session_secret_encrypted,
            'permissions': json.dumps(permissions),
            'expires_at': expires_at,
            'revoked': 0,
        }
        stmt = pg_insert(session_keys).values(**vals)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_session_keys_wallet_pubkey',
            set_={
                'session_secret_encrypted': stmt.excluded.session_secret_encrypted,
                'permissions': stmt.excluded.permissions,
                'expires_at': stmt.excluded.expires_at,
                'revoked': stmt.excluded.revoked,
            },
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_active_session_key(self, user_wallet):
        """Get active (non-revoked, non-expired) session key for a wallet."""
        q = sa.select(session_keys).where(
            session_keys.c.user_wallet == user_wallet,
            session_keys.c.revoked == 0,
            session_keys.c.expires_at > func.now(),
        ).order_by(session_keys.c.created_at.desc()).limit(1)
        with self.engine.connect() as conn:
            row = conn.execute(q).mappings().fetchone()
            if row:
                result = dict(row)
                result['permissions'] = json.loads(result['permissions'])
                return result
            return None

    def revoke_session_key(self, user_wallet, session_pubkey=None):
        """Revoke session key(s) for a wallet."""
        with self.engine.begin() as conn:
            if session_pubkey:
                conn.execute(
                    session_keys.update().where(
                        session_keys.c.user_wallet == user_wallet,
                        session_keys.c.session_pubkey == session_pubkey,
                    ).values(revoked=1)
                )
            else:
                conn.execute(
                    session_keys.update().where(
                        session_keys.c.user_wallet == user_wallet,
                    ).values(revoked=1)
                )

    def extend_session_key(self, user_wallet, session_pubkey, new_expires_at):
        """Extend expiration of a session key."""
        with self.engine.begin() as conn:
            conn.execute(
                session_keys.update().where(
                    session_keys.c.user_wallet == user_wallet,
                    session_keys.c.session_pubkey == session_pubkey,
                    session_keys.c.revoked == 0,
                ).values(expires_at=new_expires_at)
            )

    def get_all_active_session_keys(self):
        """Get all active session keys (for bot scheduler)."""
        q = sa.select(session_keys).where(
            session_keys.c.revoked == 0,
            session_keys.c.expires_at > func.now(),
        )
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    # ─── Yield Positions ───────────────────────────────────────────────────

    def save_yield_position(self, wallet_address, protocol, vault_address, vault_name,
                           deposit_token, deposit_symbol, amount, shares, apy_at_deposit,
                           deposit_signature):
        """Record a new yield deposit position."""
        with self.engine.begin() as conn:
            result = conn.execute(
                yield_positions.insert().values(
                    wallet_address=wallet_address, protocol=protocol,
                    vault_address=vault_address, vault_name=vault_name,
                    deposit_mint=deposit_token, deposit_symbol=deposit_symbol,
                    deposit_amount=amount, shares_received=shares,
                    entry_apy=apy_at_deposit, deposit_signature=deposit_signature,
                    status='active',
                ).returning(yield_positions.c.id)
            )
            return result.scalar_one()

    def get_yield_positions(self, wallet_address, status='active'):
        """Get yield positions for a wallet."""
        q = sa.select(yield_positions).where(
            yield_positions.c.wallet_address == wallet_address,
            yield_positions.c.status == status,
        ).order_by(yield_positions.c.deposit_timestamp.desc())
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def update_yield_position_withdraw(self, wallet_address, vault_address,
                                       withdraw_amount, withdraw_signature):
        """Update a yield position with withdrawal info."""
        with self.engine.begin() as conn:
            conn.execute(
                yield_positions.update().where(
                    yield_positions.c.wallet_address == wallet_address,
                    yield_positions.c.vault_address == vault_address,
                    yield_positions.c.status == 'active',
                ).values(
                    withdraw_amount=withdraw_amount,
                    withdraw_signature=withdraw_signature,
                    withdraw_timestamp=func.now(),
                    status='closed',
                )
            )

    def get_yield_position_by_id(self, position_id):
        """Get a specific yield position by ID."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(yield_positions).where(
                    yield_positions.c.id == position_id
                )
            ).mappings().fetchone()
            return dict(row) if row else None

    # ─── DLMM Positions ───────────────────────────────────────────────────

    def save_dlmm_position(self, position_data):
        """Create a new DLMM position record."""
        with self.engine.begin() as conn:
            result = conn.execute(
                dlmm_positions.insert().values(
                    position_pubkey=position_data['position_pubkey'],
                    pool_address=position_data['pool_address'],
                    pool_name=position_data.get('pool_name'),
                    token_x_mint=position_data['token_x_mint'],
                    token_y_mint=position_data['token_y_mint'],
                    token_x_symbol=position_data.get('token_x_symbol'),
                    token_y_symbol=position_data.get('token_y_symbol'),
                    wallet_address=position_data['wallet_address'],
                    risk_profile=position_data.get('risk_profile'),
                    strategy_type=position_data.get('strategy_type'),
                    min_bin_id=position_data.get('min_bin_id'),
                    max_bin_id=position_data.get('max_bin_id'),
                    bin_step=position_data.get('bin_step'),
                    deposit_x_amount=position_data.get('deposit_x_amount', 0),
                    deposit_y_amount=position_data.get('deposit_y_amount', 0),
                    deposit_usd_value=position_data.get('deposit_usd_value', 0),
                    current_x_amount=position_data.get('current_x_amount', 0),
                    current_y_amount=position_data.get('current_y_amount', 0),
                    current_usd_value=position_data.get('current_usd_value', 0),
                    create_signature=position_data.get('create_signature'),
                    status=position_data.get('status', 'active'),
                ).returning(dlmm_positions.c.id)
            )
            return result.scalar_one()

    def get_dlmm_positions(self, wallet_address, status='active'):
        """Get DLMM positions for a wallet."""
        q = sa.select(dlmm_positions).where(
            dlmm_positions.c.wallet_address == wallet_address,
            dlmm_positions.c.status == status,
        ).order_by(dlmm_positions.c.created_at.desc())
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def get_dlmm_position_by_pubkey(self, position_pubkey):
        """Get a DLMM position by its public key."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(dlmm_positions).where(
                    dlmm_positions.c.position_pubkey == position_pubkey
                )
            ).mappings().fetchone()
            return dict(row) if row else None

    def update_dlmm_position(self, position_pubkey, updates):
        """Update a DLMM position."""
        allowed_fields = {
            'current_x_amount', 'current_y_amount', 'current_usd_value',
            'unclaimed_fees_x', 'unclaimed_fees_y',
            'total_fees_claimed_x', 'total_fees_claimed_y',
            'status', 'close_signature', 'last_updated',
        }
        filtered = {k: v for k, v in updates.items() if k in allowed_fields}
        if not filtered:
            return
        with self.engine.begin() as conn:
            conn.execute(
                dlmm_positions.update().where(
                    dlmm_positions.c.position_pubkey == position_pubkey
                ).values(**filtered)
            )

    def close_dlmm_position(self, position_pubkey, close_signature):
        """Mark a DLMM position as closed."""
        with self.engine.begin() as conn:
            conn.execute(
                dlmm_positions.update().where(
                    dlmm_positions.c.position_pubkey == position_pubkey
                ).values(
                    status='closed',
                    close_signature=close_signature,
                    last_updated=func.now(),
                )
            )

    # ─── DLMM Sniper Settings ─────────────────────────────────────────────

    def get_dlmm_sniper_settings(self):
        """Get DLMM sniper settings."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(dlmm_sniper_settings).where(
                    dlmm_sniper_settings.c.id == 1
                )
            ).mappings().fetchone()
            return dict(row) if row else {}

    def update_dlmm_sniper_settings(self, settings_dict):
        """Update DLMM sniper settings."""
        allowed_fields = {
            'enabled', 'risk_profile_filter', 'min_bin_step', 'max_bin_step',
            'auto_create_position', 'default_strategy_type',
            'default_range_width_pct', 'deposit_amount_sol', 'max_positions',
        }
        filtered = {k: v for k, v in settings_dict.items() if k in allowed_fields}
        if not filtered:
            return
        with self.engine.begin() as conn:
            conn.execute(
                dlmm_sniper_settings.update().where(
                    dlmm_sniper_settings.c.id == 1
                ).values(**filtered)
            )

    # ─── DLMM Sniped Pools ────────────────────────────────────────────────

    def save_dlmm_sniped_pool(self, pool_data):
        """Record a newly detected DLMM pool."""
        vals = {
            'pool_address': pool_data['pool_address'],
            'token_x_mint': pool_data.get('token_x_mint'),
            'token_y_mint': pool_data.get('token_y_mint'),
            'token_x_symbol': pool_data.get('token_x_symbol'),
            'token_y_symbol': pool_data.get('token_y_symbol'),
            'bin_step': pool_data.get('bin_step'),
            'base_fee_bps': pool_data.get('base_fee_bps'),
            'initial_price': pool_data.get('initial_price'),
            'detected_signature': pool_data.get('detected_signature'),
            'status': pool_data.get('status', 'detected'),
        }
        stmt = pg_insert(dlmm_sniped_pools).values(**vals)
        stmt = stmt.on_conflict_do_update(
            index_elements=['pool_address'],
            set_={k: stmt.excluded[k] for k in vals if k != 'pool_address'},
        )
        with self.engine.begin() as conn:
            result = conn.execute(stmt.returning(dlmm_sniped_pools.c.id))
            return result.scalar_one()

    def get_dlmm_sniped_pools(self, status=None, limit=50):
        """Get detected DLMM pools."""
        q = sa.select(dlmm_sniped_pools)
        if status:
            q = q.where(dlmm_sniped_pools.c.status == status)
        q = q.order_by(dlmm_sniped_pools.c.detected_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def update_dlmm_sniped_pool(self, pool_address, updates):
        """Update a sniped pool record."""
        allowed_fields = {'sniped', 'snipe_position_pubkey', 'status'}
        filtered = {k: v for k, v in updates.items() if k in allowed_fields}
        if not filtered:
            return
        with self.engine.begin() as conn:
            conn.execute(
                dlmm_sniped_pools.update().where(
                    dlmm_sniped_pools.c.pool_address == pool_address
                ).values(**filtered)
            )

    # ─── Unified Liquidity Positions ───────────────────────────────────────

    def save_liquidity_position(self, position_data):
        """Save a new liquidity position (Meteora or Orca)."""
        with self.engine.begin() as conn:
            result = conn.execute(
                liquidity_positions.insert().values(
                    protocol=position_data['protocol'],
                    position_pubkey=position_data['position_pubkey'],
                    position_nft_mint=position_data.get('position_nft_mint'),
                    pool_address=position_data['pool_address'],
                    user_wallet=position_data['user_wallet'],
                    risk_profile=position_data.get('risk_profile'),
                    range_min=position_data.get('range_min'),
                    range_max=position_data.get('range_max'),
                    price_spacing=position_data.get('price_spacing'),
                    deposit_x=position_data.get('deposit_x', 0),
                    deposit_y=position_data.get('deposit_y', 0),
                    deposit_usd=position_data.get('deposit_usd', 0),
                    auto_rebalance=position_data.get('auto_rebalance', False),
                    create_signature=position_data.get('create_signature'),
                    status=position_data.get('status', 'active'),
                ).returning(liquidity_positions.c.id)
            )
            return result.scalar_one()

    def get_liquidity_positions(self, user_wallet, protocol=None, status='active'):
        """Get liquidity positions for a wallet, optionally filtered by protocol."""
        q = sa.select(liquidity_positions).where(
            liquidity_positions.c.user_wallet == user_wallet,
            liquidity_positions.c.status == status,
        )
        if protocol:
            q = q.where(liquidity_positions.c.protocol == protocol)
        q = q.order_by(liquidity_positions.c.created_at.desc())
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def get_all_active_liquidity_positions(self):
        """Get all active positions across all users (for rebalance monitoring)."""
        with self.engine.connect() as conn:
            rows = conn.execute(
                sa.select(liquidity_positions).where(
                    liquidity_positions.c.status == 'active'
                )
            ).mappings().fetchall()
            return [dict(r) for r in rows]

    def get_liquidity_position_by_pubkey(self, position_pubkey):
        """Get a liquidity position by its public key."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(liquidity_positions).where(
                    liquidity_positions.c.position_pubkey == position_pubkey
                )
            ).mappings().fetchone()
            return dict(row) if row else None

    def update_liquidity_position(self, position_pubkey, updates):
        """Update a liquidity position."""
        allowed_fields = {
            'auto_rebalance', 'status', 'close_signature', 'closed_at',
            'range_min', 'range_max',
        }
        filtered = {k: v for k, v in updates.items() if k in allowed_fields}
        if not filtered:
            return
        with self.engine.begin() as conn:
            conn.execute(
                liquidity_positions.update().where(
                    liquidity_positions.c.position_pubkey == position_pubkey
                ).values(**filtered)
            )

    # ─── Rebalance History ─────────────────────────────────────────────────

    def record_rebalance(self, rebalance_data):
        """Record a rebalance event."""
        with self.engine.begin() as conn:
            result = conn.execute(
                rebalance_history.insert().values(
                    old_position_pubkey=rebalance_data['old_position_pubkey'],
                    new_position_pubkey=rebalance_data['new_position_pubkey'],
                    protocol=rebalance_data.get('protocol'),
                    pool_address=rebalance_data.get('pool_address'),
                    user_wallet=rebalance_data.get('user_wallet'),
                    old_range_min=rebalance_data.get('old_range_min'),
                    old_range_max=rebalance_data.get('old_range_max'),
                    new_range_min=rebalance_data.get('new_range_min'),
                    new_range_max=rebalance_data.get('new_range_max'),
                    close_signature=rebalance_data.get('close_signature'),
                    open_signature=rebalance_data.get('open_signature'),
                    reason=rebalance_data.get('reason'),
                ).returning(rebalance_history.c.id)
            )
            return result.scalar_one()

    def get_rebalance_history(self, user_wallet=None, limit=50):
        """Get rebalance history, optionally filtered by wallet."""
        q = sa.select(rebalance_history)
        if user_wallet:
            q = q.where(rebalance_history.c.user_wallet == user_wallet)
        q = q.order_by(rebalance_history.c.triggered_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    # ─── Yield Strategies ──────────────────────────────────────────────────

    def save_yield_strategy(self, strategy_type, wallet_address, name, description=None,
                           config=None, state=None):
        """Create a new yield strategy."""
        with self.engine.begin() as conn:
            result = conn.execute(
                yield_strategies.insert().values(
                    strategy_type=strategy_type,
                    wallet_address=wallet_address,
                    name=name, description=description,
                    config_json=json.dumps(config or {}),
                    state_json=json.dumps(state or {}),
                    status='active',
                ).returning(yield_strategies.c.id)
            )
            return result.scalar_one()

    def get_yield_strategy(self, strategy_id):
        """Get a yield strategy by ID."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(yield_strategies).where(
                    yield_strategies.c.id == strategy_id
                )
            ).mappings().fetchone()
            if row:
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                result['state'] = json.loads(result.get('state_json') or '{}')
                result['performance'] = json.loads(result.get('performance_json') or '{}')
                return result
            return None

    def get_yield_strategies(self, wallet_address=None, strategy_type=None, status='active'):
        """Get yield strategies with optional filters."""
        q = sa.select(yield_strategies).where(
            yield_strategies.c.status == status
        )
        if wallet_address:
            q = q.where(yield_strategies.c.wallet_address == wallet_address)
        if strategy_type:
            q = q.where(yield_strategies.c.strategy_type == strategy_type)
        q = q.order_by(yield_strategies.c.created_at.desc())
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            results = []
            for row in rows:
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                result['state'] = json.loads(result.get('state_json') or '{}')
                result['performance'] = json.loads(result.get('performance_json') or '{}')
                results.append(result)
            return results

    def get_all_active_yield_strategies(self):
        """Get all active yield strategies (for scheduler)."""
        return self.get_yield_strategies(status='active')

    def update_yield_strategy(self, strategy_id, updates):
        """Update a yield strategy."""
        allowed_fields = {
            'status', 'config_json', 'state_json', 'performance_json',
            'last_run', 'next_run', 'run_count', 'total_profit',
            'name', 'description',
        }
        filtered = {}
        for key, val in updates.items():
            if key in ('config', 'state', 'performance'):
                filtered[f'{key}_json'] = json.dumps(val)
            elif key in allowed_fields:
                if key.endswith('_json') and not isinstance(val, str):
                    filtered[key] = json.dumps(val)
                else:
                    filtered[key] = val
        if not filtered:
            return
        with self.engine.begin() as conn:
            conn.execute(
                yield_strategies.update().where(
                    yield_strategies.c.id == strategy_id
                ).values(**filtered)
            )

    def update_yield_strategy_state(self, strategy_id, state):
        """Update strategy state JSON."""
        with self.engine.begin() as conn:
            conn.execute(
                yield_strategies.update().where(
                    yield_strategies.c.id == strategy_id
                ).values(state_json=json.dumps(state), last_run=func.now())
            )

    def increment_yield_strategy_run(self, strategy_id, profit=0):
        """Increment run count and add profit."""
        with self.engine.begin() as conn:
            conn.execute(
                yield_strategies.update().where(
                    yield_strategies.c.id == strategy_id
                ).values(
                    run_count=yield_strategies.c.run_count + 1,
                    total_profit=yield_strategies.c.total_profit + profit,
                    last_run=func.now(),
                )
            )

    def delete_yield_strategy(self, strategy_id):
        """Mark a yield strategy as deleted."""
        with self.engine.begin() as conn:
            conn.execute(
                yield_strategies.update().where(
                    yield_strategies.c.id == strategy_id
                ).values(status='deleted')
            )

    def pause_yield_strategy(self, strategy_id):
        """Pause a yield strategy."""
        with self.engine.begin() as conn:
            conn.execute(
                yield_strategies.update().where(
                    yield_strategies.c.id == strategy_id
                ).values(status='paused')
            )

    def resume_yield_strategy(self, strategy_id):
        """Resume a paused yield strategy."""
        with self.engine.begin() as conn:
            conn.execute(
                yield_strategies.update().where(
                    yield_strategies.c.id == strategy_id
                ).values(status='active')
            )

    # ─── Yield Strategy Logs ───────────────────────────────────────────────

    def log_yield_strategy_action(self, strategy_id, action, protocol=None,
                                  vault_address=None, amount=None, signature=None,
                                  result=None, details=None):
        """Log a yield strategy action."""
        with self.engine.begin() as conn:
            r = conn.execute(
                yield_strategy_logs.insert().values(
                    strategy_id=strategy_id, action=action,
                    protocol=protocol, vault_address=vault_address,
                    amount=amount, signature=signature,
                    result=result, details_json=json.dumps(details or {}),
                ).returning(yield_strategy_logs.c.id)
            )
            return r.scalar_one()

    def get_yield_strategy_logs(self, strategy_id, limit=50):
        """Get logs for a specific strategy."""
        q = sa.select(yield_strategy_logs).where(
            yield_strategy_logs.c.strategy_id == strategy_id
        ).order_by(yield_strategy_logs.c.executed_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            results = []
            for row in rows:
                result = dict(row)
                result['details'] = json.loads(result.get('details_json') or '{}')
                results.append(result)
            return results

    def get_recent_strategy_logs(self, wallet_address=None, limit=100):
        """Get recent strategy logs across all strategies."""
        j = yield_strategy_logs.join(
            yield_strategies,
            yield_strategy_logs.c.strategy_id == yield_strategies.c.id,
        )
        q = sa.select(
            yield_strategy_logs,
            yield_strategies.c.wallet_address,
            yield_strategies.c.strategy_type,
            yield_strategies.c.name.label('strategy_name'),
        ).select_from(j)
        if wallet_address:
            q = q.where(yield_strategies.c.wallet_address == wallet_address)
        q = q.order_by(yield_strategy_logs.c.executed_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            results = []
            for row in rows:
                result = dict(row)
                result['details'] = json.loads(result.get('details_json') or '{}')
                results.append(result)
            return results

    # ─── Backtest Results ──────────────────────────────────────────────────

    def save_backtest_result(self, result_data):
        """Save a backtest result."""
        with self.engine.begin() as conn:
            r = conn.execute(
                backtest_results.insert().values(
                    strategy_type=result_data['strategy_type'],
                    config_json=json.dumps(result_data.get('config', {})),
                    mint=result_data['mint'],
                    symbol=result_data.get('symbol'),
                    timeframe=result_data['timeframe'],
                    start_date=result_data.get('start_date'),
                    end_date=result_data.get('end_date'),
                    initial_balance=result_data.get('initial_balance', 10000),
                    final_balance=result_data.get('final_balance', 0),
                    total_trades=result_data.get('total_trades', 0),
                    winning_trades=result_data.get('winning_trades', 0),
                    losing_trades=result_data.get('losing_trades', 0),
                    profit_pct=result_data.get('profit_pct', 0),
                    profit_usd=result_data.get('profit_usd', 0),
                    max_drawdown_pct=result_data.get('max_drawdown_pct', 0),
                    max_drawdown_usd=result_data.get('max_drawdown_usd', 0),
                    sharpe_ratio=result_data.get('sharpe_ratio', 0),
                    sortino_ratio=result_data.get('sortino_ratio', 0),
                    win_rate=result_data.get('win_rate', 0),
                    profit_factor=result_data.get('profit_factor', 0),
                    avg_win=result_data.get('avg_win', 0),
                    avg_loss=result_data.get('avg_loss', 0),
                    largest_win=result_data.get('largest_win', 0),
                    largest_loss=result_data.get('largest_loss', 0),
                    total_fees_paid=result_data.get('total_fees_paid', 0),
                    avg_trade_duration=result_data.get('avg_trade_duration', 0),
                    trades_per_day=result_data.get('trades_per_day', 0),
                    equity_curve_json=json.dumps(result_data.get('equity_curve', [])),
                    trades_json=json.dumps(result_data.get('trades', [])),
                ).returning(backtest_results.c.id)
            )
            return r.scalar_one()

    def get_backtest_result(self, result_id):
        """Get a backtest result by ID."""
        with self.engine.connect() as conn:
            row = conn.execute(
                sa.select(backtest_results).where(
                    backtest_results.c.id == result_id
                )
            ).mappings().fetchone()
            if row:
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                result['equity_curve'] = json.loads(result.get('equity_curve_json') or '[]')
                result['trades'] = json.loads(result.get('trades_json') or '[]')
                return result
            return None

    def get_backtest_results(self, mint=None, strategy_type=None, limit=50):
        """Get backtest results with optional filters."""
        q = sa.select(backtest_results)
        if mint:
            q = q.where(backtest_results.c.mint == mint)
        if strategy_type:
            q = q.where(backtest_results.c.strategy_type == strategy_type)
        q = q.order_by(backtest_results.c.created_at.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            results = []
            for row in rows:
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                results.append(result)
            return results

    def delete_backtest_result(self, result_id):
        """Delete a backtest result."""
        with self.engine.begin() as conn:
            conn.execute(
                backtest_results.delete().where(
                    backtest_results.c.id == result_id
                )
            )

    # ─── SKR Staking ───────────────────────────────────────────────────────

    def save_skr_staking_event(self, event_data):
        """Record a stake/unstake event. Ignores duplicates by signature."""
        stmt = pg_insert(skr_staking_events).values(
            signature=event_data['signature'],
            event_type=event_data['event_type'],
            wallet_address=event_data['wallet_address'],
            amount=event_data['amount'],
            guardian=event_data.get('guardian'),
            slot=event_data.get('slot'),
            block_time=event_data.get('block_time'),
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=['signature'])
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def get_skr_staking_events(self, limit=100, event_type=None, wallet=None):
        """Get recent staking events with optional filters."""
        q = sa.select(skr_staking_events)
        if event_type:
            q = q.where(skr_staking_events.c.event_type == event_type)
        if wallet:
            q = q.where(skr_staking_events.c.wallet_address == wallet)
        q = q.order_by(skr_staking_events.c.block_time.desc()).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]

    def save_skr_staking_snapshot(self, total_staked, total_stakers, net_change):
        """Save a periodic staking snapshot for the time-series chart."""
        with self.engine.begin() as conn:
            conn.execute(skr_staking_snapshots.insert().values(
                total_staked=total_staked,
                total_stakers=total_stakers,
                net_change_since_last=net_change,
            ))

    def get_skr_staking_snapshots(self, limit=168):
        """Get historical staking snapshots. Default ~28 days of 4h snapshots."""
        q = sa.select(skr_staking_snapshots).order_by(
            skr_staking_snapshots.c.timestamp.desc()
        ).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            result = [dict(r) for r in rows]
            return sorted(result, key=lambda x: x['timestamp'])

    def get_skr_whale_leaderboard(self, limit=50):
        """Get top stakers by net staked amount."""
        t = skr_staking_events
        net_staked = func.sum(
            case(
                (t.c.event_type == 'stake', t.c.amount),
                else_=-t.c.amount,
            )
        )
        total_staked = func.sum(
            case(
                (t.c.event_type == 'stake', t.c.amount),
                else_=0,
            )
        )
        total_unstaked = func.sum(
            case(
                (t.c.event_type == 'unstake', t.c.amount),
                else_=0,
            )
        )
        q = sa.select(
            t.c.wallet_address,
            total_staked.label('total_staked'),
            total_unstaked.label('total_unstaked'),
            net_staked.label('net_staked'),
            func.count().label('event_count'),
            func.max(t.c.block_time).label('last_activity'),
        ).group_by(
            t.c.wallet_address
        ).having(
            net_staked > 0
        ).order_by(
            net_staked.desc()
        ).limit(limit)
        with self.engine.connect() as conn:
            rows = conn.execute(q).mappings().fetchall()
            return [dict(r) for r in rows]
