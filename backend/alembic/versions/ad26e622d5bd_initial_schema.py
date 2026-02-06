"""initial_schema

Revision ID: ad26e622d5bd
Revises:
Create Date: 2026-02-06 11:35:31.709281
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'ad26e622d5bd'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALL_TABLES = [
    'trades', 'bots', 'snapshots', 'tokens', 'signals', 'user_wallets',
    'targets', 'arb_pairs', 'address_book', 'sniped_tokens', 'settings',
    'session_keys', 'ohlcv_cache', 'yield_positions', 'dlmm_positions',
    'dlmm_sniper_settings', 'dlmm_sniped_pools', 'liquidity_positions',
    'rebalance_history', 'yield_strategies', 'yield_strategy_logs',
    'backtest_results', 'skr_staking_events', 'skr_staking_snapshots',
]


def upgrade() -> None:
    # 1. Trades
    op.create_table('trades',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('wallet_address', sa.Text),
        sa.Column('source', sa.Text),
        sa.Column('input_symbol', sa.Text),
        sa.Column('output_symbol', sa.Text),
        sa.Column('input_mint', sa.Text),
        sa.Column('output_mint', sa.Text),
        sa.Column('amount_in', sa.Float),
        sa.Column('amount_out', sa.Float),
        sa.Column('usd_value', sa.Float),
        sa.Column('slippage_bps', sa.Integer),
        sa.Column('priority_fee', sa.Float),
        sa.Column('swap_fee', sa.Float),
        sa.Column('swap_fee_currency', sa.Text),
        sa.Column('signature', sa.Text, unique=True),
        sa.Column('status', sa.Text),
        sa.Column('error', sa.Text),
    )

    # 2. Bots
    op.create_table('bots',
        sa.Column('id', sa.Text, primary_key=True),
        sa.Column('type', sa.Text),
        sa.Column('status', sa.Text, server_default='active'),
        sa.Column('input_mint', sa.Text),
        sa.Column('output_mint', sa.Text),
        sa.Column('input_symbol', sa.Text),
        sa.Column('output_symbol', sa.Text),
        sa.Column('config_json', sa.Text),
        sa.Column('state_json', sa.Text),
        sa.Column('user_wallet', sa.Text),
        sa.Column('is_processing', sa.Integer, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_run', sa.DateTime(timezone=True)),
    )

    # 3. Snapshots
    op.create_table('snapshots',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('total_value_usd', sa.Float),
        sa.Column('wallet_address', sa.Text),
        sa.Column('holdings_json', sa.Text),
    )

    # 4. Tokens
    op.create_table('tokens',
        sa.Column('mint', sa.Text, primary_key=True),
        sa.Column('symbol', sa.Text),
        sa.Column('name', sa.Text),
        sa.Column('decimals', sa.Integer),
        sa.Column('logo_uri', sa.Text),
        sa.Column('market_cap', sa.Float, server_default='0'),
        sa.Column('is_active', sa.Boolean, server_default=sa.text('true')),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 5. Signals
    op.create_table('signals',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('signature', sa.Text, unique=True),
        sa.Column('wallet_address', sa.Text),
        sa.Column('type', sa.Text),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('details_json', sa.Text),
    )

    # 6. User Wallets
    op.create_table('user_wallets',
        sa.Column('address', sa.Text, primary_key=True),
        sa.Column('alias', sa.Text),
        sa.Column('is_default', sa.Boolean, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 7. Targets
    op.create_table('targets',
        sa.Column('address', sa.Text, primary_key=True),
        sa.Column('alias', sa.Text),
        sa.Column('tags', sa.Text),
        sa.Column('config_json', sa.Text),
        sa.Column('performance_json', sa.Text),
        sa.Column('status', sa.Text, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 8. Arb Pairs
    op.create_table('arb_pairs',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('input_mint', sa.Text),
        sa.Column('output_mint', sa.Text),
        sa.Column('input_symbol', sa.Text),
        sa.Column('output_symbol', sa.Text),
        sa.Column('amount', sa.Float),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 9. Address Book
    op.create_table('address_book',
        sa.Column('address', sa.Text, primary_key=True),
        sa.Column('alias', sa.Text),
        sa.Column('notes', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 10. Sniped Tokens
    op.create_table('sniped_tokens',
        sa.Column('mint', sa.Text, primary_key=True),
        sa.Column('symbol', sa.Text),
        sa.Column('name', sa.Text),
        sa.Column('pool_address', sa.Text),
        sa.Column('dex_id', sa.Text),
        sa.Column('initial_liquidity', sa.Float),
        sa.Column('is_rug', sa.Boolean, server_default=sa.text('false')),
        sa.Column('socials_json', sa.Text),
        sa.Column('signature', sa.Text),
        sa.Column('detected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('status', sa.Text, server_default='tracking'),
    )

    # 11. Settings
    op.create_table('settings',
        sa.Column('key', sa.Text, primary_key=True),
        sa.Column('value_json', sa.Text),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 12. Session Keys
    op.create_table('session_keys',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('user_wallet', sa.Text, nullable=False),
        sa.Column('session_pubkey', sa.Text, nullable=False),
        sa.Column('session_secret_encrypted', sa.Text, nullable=False),
        sa.Column('permissions', sa.Text, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked', sa.Integer, server_default='0'),
        sa.UniqueConstraint('user_wallet', 'session_pubkey', name='uq_session_keys_wallet_pubkey'),
    )

    # 13. OHLCV Cache
    op.create_table('ohlcv_cache',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('mint', sa.Text, nullable=False),
        sa.Column('timestamp', sa.Integer, nullable=False),
        sa.Column('timeframe', sa.Text, nullable=False),
        sa.Column('open', sa.Float),
        sa.Column('high', sa.Float),
        sa.Column('low', sa.Float),
        sa.Column('close', sa.Float),
        sa.Column('volume', sa.Float),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('mint', 'timestamp', 'timeframe', name='uq_ohlcv_mint_ts_tf'),
    )
    op.create_index('idx_ohlcv_mint_time', 'ohlcv_cache', ['mint', sa.text('timestamp DESC')])

    # 14. Yield Positions
    op.create_table('yield_positions',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('wallet_address', sa.Text, nullable=False),
        sa.Column('protocol', sa.Text, nullable=False),
        sa.Column('vault_address', sa.Text, nullable=False),
        sa.Column('vault_name', sa.Text),
        sa.Column('deposit_mint', sa.Text, nullable=False),
        sa.Column('deposit_symbol', sa.Text),
        sa.Column('deposit_amount', sa.Float, nullable=False),
        sa.Column('shares_received', sa.Float),
        sa.Column('entry_apy', sa.Float),
        sa.Column('deposit_signature', sa.Text),
        sa.Column('deposit_timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('withdraw_amount', sa.Float),
        sa.Column('withdraw_signature', sa.Text),
        sa.Column('withdraw_timestamp', sa.DateTime(timezone=True)),
        sa.Column('status', sa.Text, server_default='active'),
        sa.UniqueConstraint('wallet_address', 'vault_address', 'deposit_signature',
                            name='uq_yield_pos_wallet_vault_sig'),
    )
    op.create_index('idx_yield_wallet', 'yield_positions', ['wallet_address', 'status'])

    # 15. DLMM Positions
    op.create_table('dlmm_positions',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('position_pubkey', sa.Text, unique=True, nullable=False),
        sa.Column('pool_address', sa.Text, nullable=False),
        sa.Column('pool_name', sa.Text),
        sa.Column('token_x_mint', sa.Text, nullable=False),
        sa.Column('token_y_mint', sa.Text, nullable=False),
        sa.Column('token_x_symbol', sa.Text),
        sa.Column('token_y_symbol', sa.Text),
        sa.Column('wallet_address', sa.Text, nullable=False),
        sa.Column('risk_profile', sa.Text),
        sa.Column('strategy_type', sa.Text),
        sa.Column('min_bin_id', sa.Integer),
        sa.Column('max_bin_id', sa.Integer),
        sa.Column('bin_step', sa.Integer),
        sa.Column('deposit_x_amount', sa.Float),
        sa.Column('deposit_y_amount', sa.Float),
        sa.Column('deposit_usd_value', sa.Float),
        sa.Column('current_x_amount', sa.Float),
        sa.Column('current_y_amount', sa.Float),
        sa.Column('current_usd_value', sa.Float),
        sa.Column('unclaimed_fees_x', sa.Float, server_default='0'),
        sa.Column('unclaimed_fees_y', sa.Float, server_default='0'),
        sa.Column('total_fees_claimed_x', sa.Float, server_default='0'),
        sa.Column('total_fees_claimed_y', sa.Float, server_default='0'),
        sa.Column('create_signature', sa.Text),
        sa.Column('close_signature', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('status', sa.Text, server_default='active'),
    )
    op.create_index('idx_dlmm_wallet', 'dlmm_positions', ['wallet_address', 'status'])
    op.create_index('idx_dlmm_pool', 'dlmm_positions', ['pool_address'])

    # 16. DLMM Sniper Settings
    op.create_table('dlmm_sniper_settings',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('enabled', sa.Boolean, server_default=sa.text('false')),
        sa.Column('risk_profile_filter', sa.Text, server_default='all'),
        sa.Column('min_bin_step', sa.Integer, server_default='1'),
        sa.Column('max_bin_step', sa.Integer, server_default='100'),
        sa.Column('auto_create_position', sa.Boolean, server_default=sa.text('false')),
        sa.Column('default_strategy_type', sa.Text, server_default='spot'),
        sa.Column('default_range_width_pct', sa.Float, server_default='20.0'),
        sa.Column('deposit_amount_sol', sa.Float, server_default='0.1'),
        sa.Column('max_positions', sa.Integer, server_default='5'),
    )
    # Seed default settings row
    op.execute("INSERT INTO dlmm_sniper_settings (id) VALUES (1) ON CONFLICT DO NOTHING")

    # 17. DLMM Sniped Pools
    op.create_table('dlmm_sniped_pools',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('pool_address', sa.Text, unique=True, nullable=False),
        sa.Column('token_x_mint', sa.Text),
        sa.Column('token_y_mint', sa.Text),
        sa.Column('token_x_symbol', sa.Text),
        sa.Column('token_y_symbol', sa.Text),
        sa.Column('bin_step', sa.Integer),
        sa.Column('base_fee_bps', sa.Integer),
        sa.Column('initial_price', sa.Float),
        sa.Column('detected_signature', sa.Text),
        sa.Column('detected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('sniped', sa.Boolean, server_default=sa.text('false')),
        sa.Column('snipe_position_pubkey', sa.Text),
        sa.Column('status', sa.Text, server_default='detected'),
    )
    op.create_index('idx_dlmm_sniped_status', 'dlmm_sniped_pools', ['status'])

    # 18. Liquidity Positions
    op.create_table('liquidity_positions',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('protocol', sa.Text, nullable=False),
        sa.Column('position_pubkey', sa.Text, unique=True, nullable=False),
        sa.Column('position_nft_mint', sa.Text),
        sa.Column('pool_address', sa.Text, nullable=False),
        sa.Column('user_wallet', sa.Text, nullable=False),
        sa.Column('risk_profile', sa.Text),
        sa.Column('range_min', sa.Integer),
        sa.Column('range_max', sa.Integer),
        sa.Column('price_spacing', sa.Integer),
        sa.Column('deposit_x', sa.Float),
        sa.Column('deposit_y', sa.Float),
        sa.Column('deposit_usd', sa.Float),
        sa.Column('auto_rebalance', sa.Boolean, server_default=sa.text('false')),
        sa.Column('create_signature', sa.Text),
        sa.Column('close_signature', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('closed_at', sa.DateTime(timezone=True)),
        sa.Column('status', sa.Text, server_default='active'),
    )
    op.create_index('idx_liq_wallet', 'liquidity_positions', ['user_wallet', 'protocol', 'status'])
    op.create_index('idx_liq_pool', 'liquidity_positions', ['pool_address'])

    # 19. Rebalance History
    op.create_table('rebalance_history',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('old_position_pubkey', sa.Text, nullable=False),
        sa.Column('new_position_pubkey', sa.Text, nullable=False),
        sa.Column('protocol', sa.Text, nullable=False),
        sa.Column('pool_address', sa.Text),
        sa.Column('user_wallet', sa.Text),
        sa.Column('old_range_min', sa.Integer),
        sa.Column('old_range_max', sa.Integer),
        sa.Column('new_range_min', sa.Integer),
        sa.Column('new_range_max', sa.Integer),
        sa.Column('close_signature', sa.Text),
        sa.Column('open_signature', sa.Text),
        sa.Column('reason', sa.Text),
        sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_rebal_wallet', 'rebalance_history', ['user_wallet'])

    # 20. Yield Strategies
    op.create_table('yield_strategies',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('strategy_type', sa.Text, nullable=False),
        sa.Column('wallet_address', sa.Text, nullable=False),
        sa.Column('name', sa.Text),
        sa.Column('description', sa.Text),
        sa.Column('status', sa.Text, server_default='active'),
        sa.Column('config_json', sa.Text),
        sa.Column('state_json', sa.Text),
        sa.Column('performance_json', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_run', sa.DateTime(timezone=True)),
        sa.Column('next_run', sa.DateTime(timezone=True)),
        sa.Column('run_count', sa.Integer, server_default='0'),
        sa.Column('total_profit', sa.Float, server_default='0'),
        sa.UniqueConstraint('wallet_address', 'strategy_type', 'name',
                            name='uq_yield_strat_wallet_type_name'),
    )
    op.create_index('idx_yield_strat_wallet', 'yield_strategies', ['wallet_address', 'status'])
    op.create_index('idx_yield_strat_type', 'yield_strategies', ['strategy_type', 'status'])

    # 21. Yield Strategy Logs
    op.create_table('yield_strategy_logs',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('strategy_id', sa.Integer, sa.ForeignKey('yield_strategies.id'), nullable=False),
        sa.Column('action', sa.Text, nullable=False),
        sa.Column('protocol', sa.Text),
        sa.Column('vault_address', sa.Text),
        sa.Column('amount', sa.Float),
        sa.Column('signature', sa.Text),
        sa.Column('result', sa.Text),
        sa.Column('details_json', sa.Text),
        sa.Column('executed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_yield_log_strategy', 'yield_strategy_logs', ['strategy_id'])

    # 22. Backtest Results
    op.create_table('backtest_results',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('strategy_type', sa.Text, nullable=False),
        sa.Column('config_json', sa.Text, nullable=False),
        sa.Column('mint', sa.Text, nullable=False),
        sa.Column('symbol', sa.Text),
        sa.Column('timeframe', sa.Text, nullable=False),
        sa.Column('start_date', sa.Text),
        sa.Column('end_date', sa.Text),
        sa.Column('initial_balance', sa.Float),
        sa.Column('final_balance', sa.Float),
        sa.Column('total_trades', sa.Integer),
        sa.Column('winning_trades', sa.Integer),
        sa.Column('losing_trades', sa.Integer),
        sa.Column('profit_pct', sa.Float),
        sa.Column('profit_usd', sa.Float),
        sa.Column('max_drawdown_pct', sa.Float),
        sa.Column('max_drawdown_usd', sa.Float),
        sa.Column('sharpe_ratio', sa.Float),
        sa.Column('sortino_ratio', sa.Float),
        sa.Column('win_rate', sa.Float),
        sa.Column('profit_factor', sa.Float),
        sa.Column('avg_win', sa.Float),
        sa.Column('avg_loss', sa.Float),
        sa.Column('largest_win', sa.Float),
        sa.Column('largest_loss', sa.Float),
        sa.Column('total_fees_paid', sa.Float),
        sa.Column('avg_trade_duration', sa.Float),
        sa.Column('trades_per_day', sa.Float),
        sa.Column('equity_curve_json', sa.Text),
        sa.Column('trades_json', sa.Text),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_backtest_mint', 'backtest_results', ['mint'])
    op.create_index('idx_backtest_strategy', 'backtest_results', ['strategy_type'])

    # 23. SKR Staking Events
    op.create_table('skr_staking_events',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('signature', sa.Text, unique=True, nullable=False),
        sa.Column('event_type', sa.Text, nullable=False),
        sa.Column('wallet_address', sa.Text, nullable=False),
        sa.Column('amount', sa.Float, nullable=False),
        sa.Column('guardian', sa.Text),
        sa.Column('slot', sa.Integer),
        sa.Column('block_time', sa.Integer),
        sa.Column('detected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_skr_events_wallet', 'skr_staking_events', ['wallet_address'])
    op.create_index('idx_skr_events_time', 'skr_staking_events', [sa.text('block_time DESC')])
    op.create_index('idx_skr_events_type', 'skr_staking_events', ['event_type'])

    # 24. SKR Staking Snapshots
    op.create_table('skr_staking_snapshots',
        sa.Column('id', sa.Integer, sa.Identity(), primary_key=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('total_staked', sa.Float, nullable=False),
        sa.Column('total_stakers', sa.Integer, nullable=False),
        sa.Column('net_change_since_last', sa.Float),
    )
    op.create_index('idx_skr_snap_time', 'skr_staking_snapshots', [sa.text('timestamp DESC')])


def downgrade() -> None:
    for table in reversed(ALL_TABLES):
        op.drop_table(table)
