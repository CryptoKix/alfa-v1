#!/usr/bin/env python3
"""One-time migration script: SQLite → PostgreSQL.

Reads all rows from the SQLite database and inserts them into Postgres
using ON CONFLICT DO NOTHING (idempotent — safe to re-run).

Usage:
    cd backend
    docker compose up -d postgres          # ensure Postgres is running
    alembic upgrade head                   # create schema
    python scripts/migrate_sqlite_to_pg.py # migrate data
"""
import os
import sys
import json
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from config import DATABASE_URL
from db_engine import get_engine
from models import (
    metadata, trades, bots, snapshots, tokens, signals, user_wallets, targets,
    arb_pairs, address_book, sniped_tokens, settings, session_keys,
    ohlcv_cache, yield_positions, dlmm_positions, dlmm_sniper_settings,
    dlmm_sniped_pools, liquidity_positions, rebalance_history,
    yield_strategies, yield_strategy_logs, backtest_results,
    skr_staking_events, skr_staking_snapshots,
)

# Order matters: tables with foreign keys come after their parents
TABLE_ORDER = [
    ('trades', trades),
    ('bots', bots),
    ('snapshots', snapshots),
    ('tokens', tokens),
    ('signals', signals),
    ('user_wallets', user_wallets),
    ('targets', targets),
    ('arb_pairs', arb_pairs),
    ('address_book', address_book),
    ('sniped_tokens', sniped_tokens),
    ('settings', settings),
    ('session_keys', session_keys),
    ('ohlcv_cache', ohlcv_cache),
    ('yield_positions', yield_positions),
    ('dlmm_positions', dlmm_positions),
    ('dlmm_sniper_settings', dlmm_sniper_settings),
    ('dlmm_sniped_pools', dlmm_sniped_pools),
    ('liquidity_positions', liquidity_positions),
    ('rebalance_history', rebalance_history),
    ('yield_strategies', yield_strategies),
    ('yield_strategy_logs', yield_strategy_logs),  # FK → yield_strategies
    ('backtest_results', backtest_results),
    ('skr_staking_events', skr_staking_events),
    ('skr_staking_snapshots', skr_staking_snapshots),
]


def migrate():
    # Find SQLite database
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sqlite_path = os.path.join(base_dir, 'tactix_data.db')
    if not os.path.exists(sqlite_path):
        print(f"SQLite database not found at {sqlite_path}")
        print("Nothing to migrate.")
        return

    print(f"Source: {sqlite_path}")
    print(f"Target: {DATABASE_URL}")
    print()

    # Connect to SQLite
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row

    # Connect to Postgres
    engine = get_engine(pool_size=5)

    total_migrated = 0
    total_skipped = 0

    for table_name, sa_table in TABLE_ORDER:
        try:
            cursor = sqlite_conn.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()
        except sqlite3.OperationalError:
            print(f"  {table_name}: table not found in SQLite (skipping)")
            continue

        if not rows:
            print(f"  {table_name}: 0 rows (empty)")
            continue

        # Get column names from SQLite result
        col_names = [desc[0] for desc in cursor.description]
        # Filter to only columns that exist in the SA table
        sa_col_names = {c.name for c in sa_table.columns}
        valid_cols = [c for c in col_names if c in sa_col_names]

        migrated = 0
        with engine.begin() as conn:
            for row in rows:
                row_dict = {col: row[col] for col in valid_cols}

                # Convert SQLite boolean ints to Python bools for Boolean columns
                for col in sa_table.columns:
                    if isinstance(col.type, sa.Boolean) and col.name in row_dict:
                        val = row_dict[col.name]
                        if val is not None:
                            row_dict[col.name] = bool(val)

                try:
                    stmt = pg_insert(sa_table).values(**row_dict)
                    stmt = stmt.on_conflict_do_nothing()
                    conn.execute(stmt)
                    migrated += 1
                except Exception as e:
                    print(f"    Warning: {table_name} row error: {e}")
                    total_skipped += 1

        total_migrated += migrated
        print(f"  {table_name}: {migrated}/{len(rows)} rows migrated")

    # Reset SERIAL/IDENTITY sequences to match migrated data
    print("\nResetting sequences...")
    with engine.begin() as conn:
        for table_name, sa_table in TABLE_ORDER:
            # Find integer identity/serial primary key columns
            for col in sa_table.columns:
                if col.primary_key and isinstance(col.type, sa.Integer):
                    seq_name = f"{table_name}_{col.name}_seq"
                    try:
                        result = conn.execute(
                            sa.text(f"SELECT MAX({col.name}) FROM {table_name}")
                        ).scalar()
                        if result:
                            conn.execute(
                                sa.text(f"SELECT setval('{seq_name}', :val)")
                                .bindparams(val=result)
                            )
                            print(f"  {seq_name} → {result}")
                    except Exception:
                        pass  # Table might not have a sequence

    sqlite_conn.close()
    print(f"\nDone! Migrated {total_migrated} rows total, {total_skipped} skipped.")


if __name__ == '__main__':
    migrate()
