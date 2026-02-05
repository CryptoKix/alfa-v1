import sqlite3
import json
import os
from datetime import datetime

class TactixDB:
    def __init__(self, db_path=None):
        if db_path is None:
            # Use absolute path relative to this file
            base_dir = os.path.dirname(os.path.abspath(__file__))
            self.db_path = os.path.join(base_dir, "tactix_data.db")
        else:
            self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        # check_same_thread=False is needed for Flask/SocketIO multi-threading
        return sqlite3.connect(self.db_path, check_same_thread=False)

    def _init_db(self):
        """Initialize the database schema."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Trades Table (Execution Log)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    wallet_address TEXT,
                    source TEXT,
                    input_symbol TEXT,
                    output_symbol TEXT,
                    input_mint TEXT,
                    output_mint TEXT,
                    amount_in REAL,
                    amount_out REAL,
                    usd_value REAL,
                    slippage_bps INTEGER,
                    priority_fee REAL,
                    swap_fee REAL,
                    swap_fee_currency TEXT,
                    signature TEXT UNIQUE,
                    status TEXT,
                    error TEXT
                )
            ''')
            
            # Migration for existing databases
            try:
                cursor.execute('ALTER TABLE trades ADD COLUMN swap_fee REAL')
                cursor.execute('ALTER TABLE trades ADD COLUMN swap_fee_currency TEXT')
            except sqlite3.OperationalError:
                pass # Already exists
            
            try:
                cursor.execute('ALTER TABLE trades ADD COLUMN wallet_address TEXT')
            except sqlite3.OperationalError:
                pass # Already exists

            try:
                cursor.execute('ALTER TABLE trades ADD COLUMN usd_value REAL')
            except sqlite3.OperationalError:
                pass # Already exists

            # 2. Bots Table (Strategy Management)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS bots (
                    id TEXT PRIMARY KEY,
                    type TEXT, -- 'DCA', 'GRID', 'TWAP', 'VWAP'
                    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'deleted'
                    input_mint TEXT,
                    output_mint TEXT,
                    input_symbol TEXT,
                    output_symbol TEXT,
                    config_json TEXT, -- Flexible JSON for strategy-specific params
                    state_json TEXT, -- Flexible JSON for current progress/state
                    user_wallet TEXT, -- Browser wallet address for session key delegation (NULL = server wallet)
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_run DATETIME
                )
            ''')

            # Migration: Add user_wallet column if it doesn't exist
            try:
                cursor.execute('ALTER TABLE bots ADD COLUMN user_wallet TEXT')
            except sqlite3.OperationalError:
                pass  # Column already exists

            # Migration: Add is_processing column if it doesn't exist
            try:
                cursor.execute('ALTER TABLE bots ADD COLUMN is_processing INTEGER DEFAULT 0')
            except sqlite3.OperationalError:
                pass  # Column already exists

            # 3. Snapshots Table (Portfolio Analytics)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    total_value_usd REAL,
                    wallet_address TEXT,
                    holdings_json TEXT -- Detailed breakdown at snapshot time
                )
            ''')

            # 4. Tokens Table (Discovery & Metadata)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS tokens (
                    mint TEXT PRIMARY KEY,
                    symbol TEXT,
                    name TEXT,
                    decimals INTEGER,
                    logo_uri TEXT,
                    market_cap REAL DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            try:
                cursor.execute('ALTER TABLE tokens ADD COLUMN logo_uri TEXT')
            except sqlite3.OperationalError:
                pass # Already exists

            try:
                cursor.execute('ALTER TABLE tokens ADD COLUMN name TEXT')
            except sqlite3.OperationalError:
                pass # Already exists

            try:
                cursor.execute('ALTER TABLE tokens ADD COLUMN market_cap REAL DEFAULT 0')
            except sqlite3.OperationalError:
                pass # Already exists

            # 6. Signals Table (Copy Trader Detections)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signature TEXT UNIQUE,
                    wallet_address TEXT,
                    type TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    details_json TEXT
                )
            ''')

            # 7. User Wallets Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_wallets (
                    address TEXT PRIMARY KEY,
                    alias TEXT,
                    is_default BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 8. Copy Trade Targets Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS targets (
                    address TEXT PRIMARY KEY,
                    alias TEXT,
                    tags TEXT, -- JSON list
                    config_json TEXT, -- JSON config
                    performance_json TEXT, -- JSON performance stats
                    status TEXT DEFAULT 'active', -- 'active', 'paused', 'deleted'
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 9. Arb Pairs Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS arb_pairs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    input_mint TEXT,
                    output_mint TEXT,
                    input_symbol TEXT,
                    output_symbol TEXT,
                    amount REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 10. Address Book Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS address_book (
                    address TEXT PRIMARY KEY,
                    alias TEXT,
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 11. Sniped Tokens Table (Detection & Analysis)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sniped_tokens (
                    mint TEXT PRIMARY KEY,
                    symbol TEXT,
                    name TEXT,
                    pool_address TEXT,
                    dex_id TEXT, -- 'Raydium', 'Meteora', 'Pump.fun'
                    initial_liquidity REAL,
                    is_rug BOOLEAN DEFAULT 0,
                    socials_json TEXT,
                    signature TEXT,
                    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'tracking' -- 'tracking', 'sniped', 'ignored'
                )
            ''')
            
            try:
                cursor.execute('ALTER TABLE sniped_tokens ADD COLUMN signature TEXT')
            except sqlite3.OperationalError:
                pass # Already exists

            # 12. App Settings Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 13. Session Keys Table (Browser Wallet Delegation)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS session_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_wallet TEXT NOT NULL,
                    session_pubkey TEXT NOT NULL,
                    session_secret_encrypted TEXT NOT NULL,
                    permissions TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    revoked INTEGER DEFAULT 0,
                    UNIQUE(user_wallet, session_pubkey)
                )
            ''')

            # 14. OHLCV Cache Table (VWAP Volume Data)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ohlcv_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mint TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    timeframe TEXT NOT NULL,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume REAL,
                    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(mint, timestamp, timeframe)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ohlcv_mint_time ON ohlcv_cache(mint, timestamp DESC)')

            # 15. Yield Positions Table (DeFi Yield Tracking)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS yield_positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    wallet_address TEXT NOT NULL,
                    protocol TEXT NOT NULL,
                    vault_address TEXT NOT NULL,
                    vault_name TEXT,
                    deposit_mint TEXT NOT NULL,
                    deposit_symbol TEXT,
                    deposit_amount REAL NOT NULL,
                    shares_received REAL,
                    entry_apy REAL,
                    deposit_signature TEXT,
                    deposit_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    withdraw_amount REAL,
                    withdraw_signature TEXT,
                    withdraw_timestamp DATETIME,
                    status TEXT DEFAULT 'active',
                    UNIQUE(wallet_address, vault_address, deposit_signature)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_yield_wallet ON yield_positions(wallet_address, status)')

            # 16. DLMM Positions Table (Meteora DLMM)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dlmm_positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    position_pubkey TEXT UNIQUE NOT NULL,
                    pool_address TEXT NOT NULL,
                    pool_name TEXT,
                    token_x_mint TEXT NOT NULL,
                    token_y_mint TEXT NOT NULL,
                    token_x_symbol TEXT,
                    token_y_symbol TEXT,
                    wallet_address TEXT NOT NULL,
                    risk_profile TEXT,
                    strategy_type TEXT,
                    min_bin_id INTEGER,
                    max_bin_id INTEGER,
                    bin_step INTEGER,
                    deposit_x_amount REAL,
                    deposit_y_amount REAL,
                    deposit_usd_value REAL,
                    current_x_amount REAL,
                    current_y_amount REAL,
                    current_usd_value REAL,
                    unclaimed_fees_x REAL DEFAULT 0,
                    unclaimed_fees_y REAL DEFAULT 0,
                    total_fees_claimed_x REAL DEFAULT 0,
                    total_fees_claimed_y REAL DEFAULT 0,
                    create_signature TEXT,
                    close_signature TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'active'
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_dlmm_wallet ON dlmm_positions(wallet_address, status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_dlmm_pool ON dlmm_positions(pool_address)')

            # 17. DLMM Sniper Settings Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dlmm_sniper_settings (
                    id INTEGER PRIMARY KEY,
                    enabled BOOLEAN DEFAULT 0,
                    risk_profile_filter TEXT DEFAULT 'all',
                    min_bin_step INTEGER DEFAULT 1,
                    max_bin_step INTEGER DEFAULT 100,
                    auto_create_position BOOLEAN DEFAULT 0,
                    default_strategy_type TEXT DEFAULT 'spot',
                    default_range_width_pct REAL DEFAULT 20.0,
                    deposit_amount_sol REAL DEFAULT 0.1,
                    max_positions INTEGER DEFAULT 5
                )
            ''')
            # Initialize default settings row if not exists
            cursor.execute('''
                INSERT OR IGNORE INTO dlmm_sniper_settings (id) VALUES (1)
            ''')

            # 18. DLMM Sniped Pools Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS dlmm_sniped_pools (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pool_address TEXT UNIQUE NOT NULL,
                    token_x_mint TEXT,
                    token_y_mint TEXT,
                    token_x_symbol TEXT,
                    token_y_symbol TEXT,
                    bin_step INTEGER,
                    base_fee_bps INTEGER,
                    initial_price REAL,
                    detected_signature TEXT,
                    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sniped BOOLEAN DEFAULT 0,
                    snipe_position_pubkey TEXT,
                    status TEXT DEFAULT 'detected'
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_dlmm_sniped_status ON dlmm_sniped_pools(status)')

            # 19. Unified Liquidity Positions Table (Meteora + Orca)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS liquidity_positions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    protocol TEXT NOT NULL,
                    position_pubkey TEXT UNIQUE NOT NULL,
                    position_nft_mint TEXT,
                    pool_address TEXT NOT NULL,
                    user_wallet TEXT NOT NULL,
                    risk_profile TEXT,
                    range_min INTEGER,
                    range_max INTEGER,
                    price_spacing INTEGER,
                    deposit_x REAL,
                    deposit_y REAL,
                    deposit_usd REAL,
                    auto_rebalance BOOLEAN DEFAULT 0,
                    create_signature TEXT,
                    close_signature TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    closed_at DATETIME,
                    status TEXT DEFAULT 'active'
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_liq_wallet ON liquidity_positions(user_wallet, protocol, status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_liq_pool ON liquidity_positions(pool_address)')

            # 20. Rebalance History Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS rebalance_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    old_position_pubkey TEXT NOT NULL,
                    new_position_pubkey TEXT NOT NULL,
                    protocol TEXT NOT NULL,
                    pool_address TEXT,
                    user_wallet TEXT,
                    old_range_min INTEGER,
                    old_range_max INTEGER,
                    new_range_min INTEGER,
                    new_range_max INTEGER,
                    close_signature TEXT,
                    open_signature TEXT,
                    reason TEXT,
                    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_rebal_wallet ON rebalance_history(user_wallet)')

            # 21. Yield Strategies Table (Automated yield optimization)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS yield_strategies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    strategy_type TEXT NOT NULL,
                    wallet_address TEXT NOT NULL,
                    name TEXT,
                    description TEXT,
                    status TEXT DEFAULT 'active',
                    config_json TEXT,
                    state_json TEXT,
                    performance_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_run DATETIME,
                    next_run DATETIME,
                    run_count INTEGER DEFAULT 0,
                    total_profit REAL DEFAULT 0,
                    UNIQUE(wallet_address, strategy_type, name)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_yield_strat_wallet ON yield_strategies(wallet_address, status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_yield_strat_type ON yield_strategies(strategy_type, status)')

            # 22. Yield Strategy Logs Table (Execution history)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS yield_strategy_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    strategy_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    protocol TEXT,
                    vault_address TEXT,
                    amount REAL,
                    signature TEXT,
                    result TEXT,
                    details_json TEXT,
                    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (strategy_id) REFERENCES yield_strategies(id)
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_yield_log_strategy ON yield_strategy_logs(strategy_id)')

            # 23. Backtest Results Table (Indicator Strategy Backtesting)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS backtest_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    strategy_type TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    mint TEXT NOT NULL,
                    symbol TEXT,
                    timeframe TEXT NOT NULL,
                    start_date TEXT,
                    end_date TEXT,
                    initial_balance REAL,
                    final_balance REAL,
                    total_trades INTEGER,
                    winning_trades INTEGER,
                    losing_trades INTEGER,
                    profit_pct REAL,
                    profit_usd REAL,
                    max_drawdown_pct REAL,
                    max_drawdown_usd REAL,
                    sharpe_ratio REAL,
                    sortino_ratio REAL,
                    win_rate REAL,
                    profit_factor REAL,
                    avg_win REAL,
                    avg_loss REAL,
                    largest_win REAL,
                    largest_loss REAL,
                    total_fees_paid REAL,
                    avg_trade_duration REAL,
                    trades_per_day REAL,
                    equity_curve_json TEXT,
                    trades_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_backtest_mint ON backtest_results(mint)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON backtest_results(strategy_type)')

            # SKR Staking Events Table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS skr_staking_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signature TEXT UNIQUE NOT NULL,
                    event_type TEXT NOT NULL,
                    wallet_address TEXT NOT NULL,
                    amount REAL NOT NULL,
                    guardian TEXT,
                    slot INTEGER,
                    block_time INTEGER,
                    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_skr_events_wallet ON skr_staking_events(wallet_address)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_skr_events_time ON skr_staking_events(block_time DESC)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_skr_events_type ON skr_staking_events(event_type)')

            # SKR Staking Snapshots Table (for time-series chart)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS skr_staking_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    total_staked REAL NOT NULL,
                    total_stakers INTEGER NOT NULL,
                    net_change_since_last REAL
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_skr_snap_time ON skr_staking_snapshots(timestamp DESC)')

            conn.commit()

    def save_setting(self, key, value):
        """Save a general setting (JSON encoded)."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), datetime.now())
            )

    def get_setting(self, key, default=None):
        """Retrieve a general setting."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT value_json FROM settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            return json.loads(row['value_json']) if row else default

    def save_sniped_token(self, token_data):
        """Record a newly detected token launch."""
        sql = '''
            INSERT OR REPLACE INTO sniped_tokens (
                mint, symbol, name, pool_address, dex_id, initial_liquidity, socials_json, signature, status, is_rug
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                token_data.get('mint'),
                token_data.get('symbol'),
                token_data.get('name'),
                token_data.get('pool_address'),
                token_data.get('dex_id'),
                token_data.get('initial_liquidity'),
                json.dumps(token_data.get('socials', {})),
                token_data.get('signature'),
                token_data.get('status', 'tracking'),
                token_data.get('is_rug', False)
            ))

    def get_tracked_tokens(self, limit=50):
        """Fetch recently detected tokens."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM sniped_tokens ORDER BY detected_at DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]

    def save_address(self, address, alias, notes=None):
        """Save or update an address in the address book."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO address_book (address, alias, notes) VALUES (?, ?, ?)",
                (address, alias, notes)
            )

    def get_address_book(self):
        """Fetch all saved addresses."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM address_book ORDER BY alias ASC")
            return [dict(row) for row in cursor.fetchall()]

    def delete_address(self, address):
        """Remove an address from the address book."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM address_book WHERE address = ?", (address,))

    def save_user_wallet(self, address, alias, is_default=0):
        """Save or update a user's own wallet."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO user_wallets (address, alias, is_default) VALUES (?, ?, ?)",
                (address, alias, is_default)
            )

    def get_user_wallets(self):
        """Fetch all user wallets."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM user_wallets")
            return [dict(row) for row in cursor.fetchall()]

    def get_wallet_alias(self, address):
        """Get alias for a specific user wallet address."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT alias FROM user_wallets WHERE address = ?", (address,))
            row = cursor.fetchone()
            return row[0] if row else None

    def save_signal(self, signature, wallet, signal_type, details=None):
        """Record a detected copy trader signal."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO signals (signature, wallet_address, type, details_json) VALUES (?, ?, ?, ?)",
                (signature, wallet, signal_type, json.dumps(details or {}))
            )

    def get_signals(self, limit=50, wallet=None):
        """Fetch recent signals."""
        query = "SELECT * FROM signals"
        params = []
        if wallet:
            query += " WHERE wallet_address = ?"
            params.append(wallet)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, tuple(params))
            return [dict(row) for row in cursor.fetchall()]

    def save_token(self, mint, symbol, decimals, logo_uri=None, name=None, market_cap=0):
        """Save or update token metadata."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO tokens (mint, symbol, decimals, logo_uri, name, market_cap, last_updated) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
                (mint, symbol, decimals, logo_uri, name, market_cap)
            )

    def get_known_tokens(self):
        """Fetch all discovered tokens."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM tokens WHERE is_active = 1")
            return {row['mint']: {'symbol': row['symbol'], 'decimals': row['decimals'], 'logo_uri': row['logo_uri']} for row in cursor.fetchall()}

    def get_top_tokens(self, limit=100):
        """Fetch top tokens by market cap."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT mint, symbol, name, decimals, logo_uri, market_cap FROM tokens WHERE is_active = 1 ORDER BY market_cap DESC LIMIT ?",
                (limit,)
            )
            return [dict(row) for row in cursor.fetchall()]

    def bulk_save_tokens(self, tokens):
        """Bulk insert/update tokens."""
        with self._get_connection() as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO tokens (mint, symbol, name, decimals, logo_uri, market_cap, last_updated) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
                [(t['mint'], t['symbol'], t.get('name'), t.get('decimals', 9), t.get('logo_uri'), t.get('market_cap', 0)) for t in tokens]
            )

    def log_trade(self, trade_data):
        """Record a trade execution."""
        sql = '''
            INSERT INTO trades (
                wallet_address, source, input_symbol, output_symbol, input_mint, output_mint, 
                amount_in, amount_out, usd_value, slippage_bps, priority_fee, swap_fee, swap_fee_currency,
                signature, status, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                trade_data.get('wallet_address'),
                trade_data.get('source'),
                trade_data.get('input'),
                trade_data.get('output'),
                trade_data.get('input_mint'),
                trade_data.get('output_mint'),
                trade_data.get('amount_in'),
                trade_data.get('amount_out'),
                trade_data.get('usd_value'),
                trade_data.get('slippage_bps'),
                trade_data.get('priority_fee'),
                trade_data.get('swap_fee'),
                trade_data.get('swap_fee_currency'),
                trade_data.get('signature'),
                trade_data.get('status'),
                trade_data.get('error')
            ))

    def save_bot(self, bot_id, bot_type, input_m, output_m, in_sym, out_sym, config, state, user_wallet=None):
        """Create or update a bot strategy."""
        sql = '''
            INSERT OR REPLACE INTO bots (
                id, type, input_mint, output_mint, input_symbol, output_symbol, config_json, state_json, status, user_wallet
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                bot_id, bot_type, input_m, output_m, in_sym, out_sym,
                json.dumps(config), json.dumps(state), state.get('status', 'active'), user_wallet
            ))

    def get_all_bots(self, include_deleted=False):
        """Fetch all bots."""
        query = "SELECT * FROM bots" if include_deleted else "SELECT * FROM bots WHERE status != 'deleted'"
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query)
            return [dict(row) for row in cursor.fetchall()]

    def get_bot(self, bot_id):
        """Fetch a single bot by ID."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM bots WHERE id = ?", (bot_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def set_bot_processing(self, bot_id, is_processing=True):
        """Set bot processing flag atomically."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE bots SET is_processing = ? WHERE id = ?",
                (1 if is_processing else 0, bot_id)
            )

    def clear_stale_processing_flags(self):
        """Clear any stale is_processing flags on startup."""
        with self._get_connection() as conn:
            conn.execute("UPDATE bots SET is_processing = 0")

    def get_history(self, limit=50, wallet_address=None):
        """Fetch recent trade history."""
        query = """
            SELECT 
                id, timestamp, wallet_address, source, 
                input_symbol AS input, 
                output_symbol AS output, 
                input_mint, output_mint, 
                amount_in, amount_out, usd_value,
                slippage_bps, priority_fee, 
                swap_fee, swap_fee_currency, 
                signature, status, error 
            FROM trades 
        """
        params = []
        if wallet_address:
            query += " WHERE wallet_address = ?"
            params.append(wallet_address)
            
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, tuple(params))
            return [dict(row) for row in cursor.fetchall()]

    def record_snapshot(self, total_value, wallet, holdings):
        """Save a portfolio snapshot for historical charting."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO snapshots (total_value_usd, wallet_address, holdings_json) VALUES (?, ?, ?)",
                (total_value, wallet, json.dumps(holdings))
            )

    def get_snapshots(self, limit=168): # Default to 1 week (168 hours)
        """Fetch historical portfolio snapshots."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            # Fetch descending to get latest, then reverse in code or sort in SQL
            cursor = conn.execute("SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?", (limit,))
            rows = [dict(row) for row in cursor.fetchall()]
            return sorted(rows, key=lambda x: x['timestamp']) # Return chronological order


    def save_target(self, address, alias, tags=None, config=None, performance=None, status='active'):
        """Create or update a copy-trade target wallet."""
        sql = '''
            INSERT OR REPLACE INTO targets (
                address, alias, tags, config_json, performance_json, status
            ) VALUES (?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                address, alias, 
                json.dumps(tags or []), 
                json.dumps(config or {}), 
                json.dumps(performance or {}),
                status
            ))

    def get_target(self, address):
        """Fetch a single target by address."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM targets WHERE address = ?", (address,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_target_config(self, address, config):
        """Update target configuration."""
        with self._get_connection() as conn:
            conn.execute("UPDATE targets SET config_json = ? WHERE address = ?", (json.dumps(config), address))

    def update_target_status(self, address, status):
        """Update target status."""
        with self._get_connection() as conn:
            conn.execute("UPDATE targets SET status = ? WHERE address = ?", (status, address))

    def get_all_targets(self, include_deleted=False):
        """Fetch all tracked wallets."""
        query = "SELECT * FROM targets" if include_deleted else "SELECT * FROM targets WHERE status != 'deleted'"
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query)
            return [dict(row) for row in cursor.fetchall()]

    def delete_target(self, address):
        """Mark a target as deleted."""
        with self._get_connection() as conn:
            conn.execute("UPDATE targets SET status = 'deleted' WHERE address = ?", (address,))

    def update_target_alias(self, address, new_alias):
        """Update the alias of a target wallet."""
        with self._get_connection() as conn:
            conn.execute("UPDATE targets SET alias = ? WHERE address = ?", (new_alias, address))
    def save_arb_pair(self, input_mint, output_mint, input_symbol, output_symbol, amount):
        """Save a new arb pair monitoring target."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO arb_pairs (input_mint, output_mint, input_symbol, output_symbol, amount) VALUES (?, ?, ?, ?, ?)",
                (input_mint, output_mint, input_symbol, output_symbol, amount)
            )

    def get_arb_pairs(self):
        """Fetch all monitored arb pairs."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM arb_pairs")
            return [dict(row) for row in cursor.fetchall()]

    def delete_arb_pair(self, pair_id):
        """Remove an arb pair from monitoring."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM arb_pairs WHERE id = ?", (pair_id,))

    # --- Session Key Methods ---

    def save_session_key(self, user_wallet, session_pubkey, session_secret_encrypted, permissions, expires_at):
        """Store a new session key delegation."""
        sql = '''
            INSERT OR REPLACE INTO session_keys (
                user_wallet, session_pubkey, session_secret_encrypted, permissions, expires_at, revoked
            ) VALUES (?, ?, ?, ?, ?, 0)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                user_wallet,
                session_pubkey,
                session_secret_encrypted,
                json.dumps(permissions),
                expires_at
            ))

    def get_active_session_key(self, user_wallet):
        """Get active (non-revoked, non-expired) session key for a wallet."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT * FROM session_keys
                WHERE user_wallet = ?
                  AND revoked = 0
                  AND expires_at > datetime('now')
                ORDER BY created_at DESC
                LIMIT 1
            ''', (user_wallet,))
            row = cursor.fetchone()
            if row:
                result = dict(row)
                result['permissions'] = json.loads(result['permissions'])
                return result
            return None

    def revoke_session_key(self, user_wallet, session_pubkey=None):
        """Revoke session key(s) for a wallet."""
        with self._get_connection() as conn:
            if session_pubkey:
                conn.execute(
                    "UPDATE session_keys SET revoked = 1 WHERE user_wallet = ? AND session_pubkey = ?",
                    (user_wallet, session_pubkey)
                )
            else:
                # Revoke all session keys for this wallet
                conn.execute(
                    "UPDATE session_keys SET revoked = 1 WHERE user_wallet = ?",
                    (user_wallet,)
                )

    def extend_session_key(self, user_wallet, session_pubkey, new_expires_at):
        """Extend expiration of a session key."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE session_keys SET expires_at = ? WHERE user_wallet = ? AND session_pubkey = ? AND revoked = 0",
                (new_expires_at, user_wallet, session_pubkey)
            )

    def get_all_active_session_keys(self):
        """Get all active session keys (for bot scheduler)."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT * FROM session_keys
                WHERE revoked = 0 AND expires_at > datetime('now')
            ''')
            return [dict(row) for row in cursor.fetchall()]

    # --- Yield Position Methods ---

    def save_yield_position(self, wallet_address, protocol, vault_address, vault_name,
                           deposit_token, deposit_symbol, amount, shares, apy_at_deposit,
                           deposit_signature):
        """Record a new yield deposit position."""
        with self._get_connection() as conn:
            cursor = conn.execute('''
                INSERT INTO yield_positions (
                    wallet_address, protocol, vault_address, vault_name,
                    deposit_mint, deposit_symbol, deposit_amount, shares_received,
                    entry_apy, deposit_signature, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            ''', (
                wallet_address, protocol, vault_address, vault_name,
                deposit_token, deposit_symbol, amount, shares,
                apy_at_deposit, deposit_signature
            ))
            return cursor.lastrowid

    def get_yield_positions(self, wallet_address, status='active'):
        """Get yield positions for a wallet."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT * FROM yield_positions
                WHERE wallet_address = ? AND status = ?
                ORDER BY deposit_timestamp DESC
            ''', (wallet_address, status))
            return [dict(row) for row in cursor.fetchall()]

    def update_yield_position_withdraw(self, wallet_address, vault_address,
                                       withdraw_amount, withdraw_signature):
        """Update a yield position with withdrawal info."""
        with self._get_connection() as conn:
            conn.execute('''
                UPDATE yield_positions
                SET withdraw_amount = ?, withdraw_signature = ?,
                    withdraw_timestamp = datetime('now'), status = 'closed'
                WHERE wallet_address = ? AND vault_address = ? AND status = 'active'
            ''', (withdraw_amount, withdraw_signature, wallet_address, vault_address))

    def get_yield_position_by_id(self, position_id):
        """Get a specific yield position by ID."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT * FROM yield_positions WHERE id = ?', (position_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    # --- DLMM Position Methods ---

    def save_dlmm_position(self, position_data):
        """Create a new DLMM position record."""
        sql = '''
            INSERT INTO dlmm_positions (
                position_pubkey, pool_address, pool_name,
                token_x_mint, token_y_mint, token_x_symbol, token_y_symbol,
                wallet_address, risk_profile, strategy_type,
                min_bin_id, max_bin_id, bin_step,
                deposit_x_amount, deposit_y_amount, deposit_usd_value,
                current_x_amount, current_y_amount, current_usd_value,
                create_signature, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                position_data['position_pubkey'],
                position_data['pool_address'],
                position_data.get('pool_name'),
                position_data['token_x_mint'],
                position_data['token_y_mint'],
                position_data.get('token_x_symbol'),
                position_data.get('token_y_symbol'),
                position_data['wallet_address'],
                position_data.get('risk_profile'),
                position_data.get('strategy_type'),
                position_data.get('min_bin_id'),
                position_data.get('max_bin_id'),
                position_data.get('bin_step'),
                position_data.get('deposit_x_amount', 0),
                position_data.get('deposit_y_amount', 0),
                position_data.get('deposit_usd_value', 0),
                position_data.get('current_x_amount', 0),
                position_data.get('current_y_amount', 0),
                position_data.get('current_usd_value', 0),
                position_data.get('create_signature'),
                position_data.get('status', 'active')
            ))
            return cursor.lastrowid

    def get_dlmm_positions(self, wallet_address, status='active'):
        """Get DLMM positions for a wallet."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT * FROM dlmm_positions
                WHERE wallet_address = ? AND status = ?
                ORDER BY created_at DESC
            ''', (wallet_address, status))
            return [dict(row) for row in cursor.fetchall()]

    def get_dlmm_position_by_pubkey(self, position_pubkey):
        """Get a DLMM position by its public key."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM dlmm_positions WHERE position_pubkey = ?',
                (position_pubkey,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_dlmm_position(self, position_pubkey, updates):
        """Update a DLMM position."""
        allowed_fields = [
            'current_x_amount', 'current_y_amount', 'current_usd_value',
            'unclaimed_fees_x', 'unclaimed_fees_y',
            'total_fees_claimed_x', 'total_fees_claimed_y',
            'status', 'close_signature', 'last_updated'
        ]
        fields = []
        values = []
        for key, val in updates.items():
            if key in allowed_fields:
                fields.append(f"{key} = ?")
                values.append(val)

        if not fields:
            return

        values.append(position_pubkey)
        sql = f"UPDATE dlmm_positions SET {', '.join(fields)} WHERE position_pubkey = ?"

        with self._get_connection() as conn:
            conn.execute(sql, values)

    def close_dlmm_position(self, position_pubkey, close_signature):
        """Mark a DLMM position as closed."""
        with self._get_connection() as conn:
            conn.execute('''
                UPDATE dlmm_positions
                SET status = 'closed', close_signature = ?, last_updated = datetime('now')
                WHERE position_pubkey = ?
            ''', (close_signature, position_pubkey))

    # --- DLMM Sniper Settings Methods ---

    def get_dlmm_sniper_settings(self):
        """Get DLMM sniper settings."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT * FROM dlmm_sniper_settings WHERE id = 1')
            row = cursor.fetchone()
            return dict(row) if row else {}

    def update_dlmm_sniper_settings(self, settings):
        """Update DLMM sniper settings."""
        allowed_fields = [
            'enabled', 'risk_profile_filter', 'min_bin_step', 'max_bin_step',
            'auto_create_position', 'default_strategy_type', 'default_range_width_pct',
            'deposit_amount_sol', 'max_positions'
        ]
        fields = []
        values = []
        for key, val in settings.items():
            if key in allowed_fields:
                fields.append(f"{key} = ?")
                values.append(val)

        if not fields:
            return

        sql = f"UPDATE dlmm_sniper_settings SET {', '.join(fields)} WHERE id = 1"

        with self._get_connection() as conn:
            conn.execute(sql, values)

    # --- DLMM Sniped Pools Methods ---

    def save_dlmm_sniped_pool(self, pool_data):
        """Record a newly detected DLMM pool."""
        sql = '''
            INSERT OR REPLACE INTO dlmm_sniped_pools (
                pool_address, token_x_mint, token_y_mint,
                token_x_symbol, token_y_symbol, bin_step,
                base_fee_bps, initial_price, detected_signature, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                pool_data['pool_address'],
                pool_data.get('token_x_mint'),
                pool_data.get('token_y_mint'),
                pool_data.get('token_x_symbol'),
                pool_data.get('token_y_symbol'),
                pool_data.get('bin_step'),
                pool_data.get('base_fee_bps'),
                pool_data.get('initial_price'),
                pool_data.get('detected_signature'),
                pool_data.get('status', 'detected')
            ))
            return cursor.lastrowid

    def get_dlmm_sniped_pools(self, status=None, limit=50):
        """Get detected DLMM pools."""
        query = "SELECT * FROM dlmm_sniped_pools"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY detected_at DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def update_dlmm_sniped_pool(self, pool_address, updates):
        """Update a sniped pool record."""
        allowed_fields = ['sniped', 'snipe_position_pubkey', 'status']
        fields = []
        values = []
        for key, val in updates.items():
            if key in allowed_fields:
                fields.append(f"{key} = ?")
                values.append(val)

        if not fields:
            return

        values.append(pool_address)
        sql = f"UPDATE dlmm_sniped_pools SET {', '.join(fields)} WHERE pool_address = ?"

        with self._get_connection() as conn:
            conn.execute(sql, values)

    # --- Unified Liquidity Position Methods ---

    def save_liquidity_position(self, position_data):
        """Save a new liquidity position (Meteora or Orca)."""
        sql = '''
            INSERT INTO liquidity_positions (
                protocol, position_pubkey, position_nft_mint, pool_address,
                user_wallet, risk_profile, range_min, range_max, price_spacing,
                deposit_x, deposit_y, deposit_usd, auto_rebalance,
                create_signature, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                position_data['protocol'],
                position_data['position_pubkey'],
                position_data.get('position_nft_mint'),
                position_data['pool_address'],
                position_data['user_wallet'],
                position_data.get('risk_profile'),
                position_data.get('range_min'),
                position_data.get('range_max'),
                position_data.get('price_spacing'),
                position_data.get('deposit_x', 0),
                position_data.get('deposit_y', 0),
                position_data.get('deposit_usd', 0),
                position_data.get('auto_rebalance', False),
                position_data.get('create_signature'),
                position_data.get('status', 'active')
            ))
            return cursor.lastrowid

    def get_liquidity_positions(self, user_wallet, protocol=None, status='active'):
        """Get liquidity positions for a wallet, optionally filtered by protocol."""
        query = 'SELECT * FROM liquidity_positions WHERE user_wallet = ? AND status = ?'
        params = [user_wallet, status]

        if protocol:
            query += ' AND protocol = ?'
            params.append(protocol)

        query += ' ORDER BY created_at DESC'

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def get_all_active_liquidity_positions(self):
        """Get all active positions across all users (for rebalance monitoring)."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT * FROM liquidity_positions WHERE status = 'active'
            ''')
            return [dict(row) for row in cursor.fetchall()]

    def get_liquidity_position_by_pubkey(self, position_pubkey):
        """Get a liquidity position by its public key."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM liquidity_positions WHERE position_pubkey = ?',
                (position_pubkey,)
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_liquidity_position(self, position_pubkey, updates):
        """Update a liquidity position."""
        allowed_fields = [
            'auto_rebalance', 'status', 'close_signature', 'closed_at',
            'range_min', 'range_max'
        ]
        fields = []
        values = []
        for key, val in updates.items():
            if key in allowed_fields:
                fields.append(f"{key} = ?")
                values.append(val)

        if not fields:
            return

        values.append(position_pubkey)
        sql = f"UPDATE liquidity_positions SET {', '.join(fields)} WHERE position_pubkey = ?"

        with self._get_connection() as conn:
            conn.execute(sql, values)

    # --- Rebalance History Methods ---

    def record_rebalance(self, rebalance_data):
        """Record a rebalance event."""
        sql = '''
            INSERT INTO rebalance_history (
                old_position_pubkey, new_position_pubkey, protocol,
                pool_address, user_wallet, old_range_min, old_range_max,
                new_range_min, new_range_max, close_signature, open_signature, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                rebalance_data['old_position_pubkey'],
                rebalance_data['new_position_pubkey'],
                rebalance_data.get('protocol'),
                rebalance_data.get('pool_address'),
                rebalance_data.get('user_wallet'),
                rebalance_data.get('old_range_min'),
                rebalance_data.get('old_range_max'),
                rebalance_data.get('new_range_min'),
                rebalance_data.get('new_range_max'),
                rebalance_data.get('close_signature'),
                rebalance_data.get('open_signature'),
                rebalance_data.get('reason')
            ))
            return cursor.lastrowid

    def get_rebalance_history(self, user_wallet=None, limit=50):
        """Get rebalance history, optionally filtered by wallet."""
        query = 'SELECT * FROM rebalance_history'
        params = []

        if user_wallet:
            query += ' WHERE user_wallet = ?'
            params.append(user_wallet)

        query += ' ORDER BY triggered_at DESC LIMIT ?'
        params.append(limit)

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    # --- Yield Strategy Methods ---

    def save_yield_strategy(self, strategy_type, wallet_address, name, description=None,
                           config=None, state=None):
        """Create a new yield strategy."""
        sql = '''
            INSERT INTO yield_strategies (
                strategy_type, wallet_address, name, description,
                config_json, state_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'active')
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                strategy_type, wallet_address, name, description,
                json.dumps(config or {}), json.dumps(state or {})
            ))
            return cursor.lastrowid

    def get_yield_strategy(self, strategy_id):
        """Get a yield strategy by ID."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT * FROM yield_strategies WHERE id = ?', (strategy_id,))
            row = cursor.fetchone()
            if row:
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                result['state'] = json.loads(result.get('state_json') or '{}')
                result['performance'] = json.loads(result.get('performance_json') or '{}')
                return result
            return None

    def get_yield_strategies(self, wallet_address=None, strategy_type=None, status='active'):
        """Get yield strategies with optional filters."""
        query = 'SELECT * FROM yield_strategies WHERE status = ?'
        params = [status]

        if wallet_address:
            query += ' AND wallet_address = ?'
            params.append(wallet_address)

        if strategy_type:
            query += ' AND strategy_type = ?'
            params.append(strategy_type)

        query += ' ORDER BY created_at DESC'

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            results = []
            for row in cursor.fetchall():
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
        allowed_fields = ['status', 'config_json', 'state_json', 'performance_json',
                         'last_run', 'next_run', 'run_count', 'total_profit', 'name', 'description']
        fields = []
        values = []

        for key, val in updates.items():
            if key in allowed_fields:
                if key in ['config', 'state', 'performance']:
                    key = f'{key}_json'
                    val = json.dumps(val)
                elif key.endswith('_json') and not isinstance(val, str):
                    val = json.dumps(val)
                fields.append(f"{key} = ?")
                values.append(val)

        if not fields:
            return

        values.append(strategy_id)
        sql = f"UPDATE yield_strategies SET {', '.join(fields)} WHERE id = ?"

        with self._get_connection() as conn:
            conn.execute(sql, values)

    def update_yield_strategy_state(self, strategy_id, state):
        """Update strategy state JSON."""
        with self._get_connection() as conn:
            conn.execute(
                'UPDATE yield_strategies SET state_json = ?, last_run = datetime("now") WHERE id = ?',
                (json.dumps(state), strategy_id)
            )

    def increment_yield_strategy_run(self, strategy_id, profit=0):
        """Increment run count and add profit."""
        with self._get_connection() as conn:
            conn.execute('''
                UPDATE yield_strategies
                SET run_count = run_count + 1,
                    total_profit = total_profit + ?,
                    last_run = datetime('now')
                WHERE id = ?
            ''', (profit, strategy_id))

    def delete_yield_strategy(self, strategy_id):
        """Mark a yield strategy as deleted."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE yield_strategies SET status = 'deleted' WHERE id = ?",
                (strategy_id,)
            )

    def pause_yield_strategy(self, strategy_id):
        """Pause a yield strategy."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE yield_strategies SET status = 'paused' WHERE id = ?",
                (strategy_id,)
            )

    def resume_yield_strategy(self, strategy_id):
        """Resume a paused yield strategy."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE yield_strategies SET status = 'active' WHERE id = ?",
                (strategy_id,)
            )

    # --- Yield Strategy Log Methods ---

    def log_yield_strategy_action(self, strategy_id, action, protocol=None,
                                  vault_address=None, amount=None, signature=None,
                                  result=None, details=None):
        """Log a yield strategy action."""
        sql = '''
            INSERT INTO yield_strategy_logs (
                strategy_id, action, protocol, vault_address,
                amount, signature, result, details_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                strategy_id, action, protocol, vault_address,
                amount, signature, result, json.dumps(details or {})
            ))
            return cursor.lastrowid

    def get_yield_strategy_logs(self, strategy_id, limit=50):
        """Get logs for a specific strategy."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('''
                SELECT * FROM yield_strategy_logs
                WHERE strategy_id = ?
                ORDER BY executed_at DESC
                LIMIT ?
            ''', (strategy_id, limit))
            results = []
            for row in cursor.fetchall():
                result = dict(row)
                result['details'] = json.loads(result.get('details_json') or '{}')
                results.append(result)
            return results

    def get_recent_strategy_logs(self, wallet_address=None, limit=100):
        """Get recent strategy logs across all strategies."""
        query = '''
            SELECT l.*, s.wallet_address, s.strategy_type, s.name as strategy_name
            FROM yield_strategy_logs l
            JOIN yield_strategies s ON l.strategy_id = s.id
        '''
        params = []

        if wallet_address:
            query += ' WHERE s.wallet_address = ?'
            params.append(wallet_address)

        query += ' ORDER BY l.executed_at DESC LIMIT ?'
        params.append(limit)

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            results = []
            for row in cursor.fetchall():
                result = dict(row)
                result['details'] = json.loads(result.get('details_json') or '{}')
                results.append(result)
            return results

    # --- Backtest Results Methods ---

    def save_backtest_result(self, result_data):
        """Save a backtest result."""
        sql = '''
            INSERT INTO backtest_results (
                strategy_type, config_json, mint, symbol, timeframe,
                start_date, end_date, initial_balance, final_balance,
                total_trades, winning_trades, losing_trades,
                profit_pct, profit_usd, max_drawdown_pct, max_drawdown_usd,
                sharpe_ratio, sortino_ratio, win_rate, profit_factor,
                avg_win, avg_loss, largest_win, largest_loss,
                total_fees_paid, avg_trade_duration, trades_per_day,
                equity_curve_json, trades_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            cursor = conn.execute(sql, (
                result_data['strategy_type'],
                json.dumps(result_data.get('config', {})),
                result_data['mint'],
                result_data.get('symbol'),
                result_data['timeframe'],
                result_data.get('start_date'),
                result_data.get('end_date'),
                result_data.get('initial_balance', 10000),
                result_data.get('final_balance', 0),
                result_data.get('total_trades', 0),
                result_data.get('winning_trades', 0),
                result_data.get('losing_trades', 0),
                result_data.get('profit_pct', 0),
                result_data.get('profit_usd', 0),
                result_data.get('max_drawdown_pct', 0),
                result_data.get('max_drawdown_usd', 0),
                result_data.get('sharpe_ratio', 0),
                result_data.get('sortino_ratio', 0),
                result_data.get('win_rate', 0),
                result_data.get('profit_factor', 0),
                result_data.get('avg_win', 0),
                result_data.get('avg_loss', 0),
                result_data.get('largest_win', 0),
                result_data.get('largest_loss', 0),
                result_data.get('total_fees_paid', 0),
                result_data.get('avg_trade_duration', 0),
                result_data.get('trades_per_day', 0),
                json.dumps(result_data.get('equity_curve', [])),
                json.dumps(result_data.get('trades', []))
            ))
            return cursor.lastrowid

    def get_backtest_result(self, result_id):
        """Get a backtest result by ID."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT * FROM backtest_results WHERE id = ?', (result_id,))
            row = cursor.fetchone()
            if row:
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                result['equity_curve'] = json.loads(result.get('equity_curve_json') or '[]')
                result['trades'] = json.loads(result.get('trades_json') or '[]')
                return result
            return None

    def get_backtest_results(self, mint=None, strategy_type=None, limit=50):
        """Get backtest results with optional filters."""
        query = 'SELECT * FROM backtest_results WHERE 1=1'
        params = []

        if mint:
            query += ' AND mint = ?'
            params.append(mint)

        if strategy_type:
            query += ' AND strategy_type = ?'
            params.append(strategy_type)

        query += ' ORDER BY created_at DESC LIMIT ?'
        params.append(limit)

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            results = []
            for row in cursor.fetchall():
                result = dict(row)
                result['config'] = json.loads(result.get('config_json') or '{}')
                # Don't include full trades/equity in list view for performance
                results.append(result)
            return results

    def delete_backtest_result(self, result_id):
        """Delete a backtest result."""
        with self._get_connection() as conn:
            conn.execute('DELETE FROM backtest_results WHERE id = ?', (result_id,))

    # ─── SKR Staking Methods ────────────────────────────────────────────

    def save_skr_staking_event(self, event_data):
        """Record a stake/unstake event. Ignores duplicates by signature."""
        sql = '''
            INSERT OR IGNORE INTO skr_staking_events (
                signature, event_type, wallet_address, amount,
                guardian, slot, block_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                event_data['signature'],
                event_data['event_type'],
                event_data['wallet_address'],
                event_data['amount'],
                event_data.get('guardian'),
                event_data.get('slot'),
                event_data.get('block_time')
            ))

    def get_skr_staking_events(self, limit=100, event_type=None, wallet=None):
        """Get recent staking events with optional filters."""
        query = 'SELECT * FROM skr_staking_events WHERE 1=1'
        params = []
        if event_type:
            query += ' AND event_type = ?'
            params.append(event_type)
        if wallet:
            query += ' AND wallet_address = ?'
            params.append(wallet)
        query += ' ORDER BY block_time DESC LIMIT ?'
        params.append(limit)
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def save_skr_staking_snapshot(self, total_staked, total_stakers, net_change):
        """Save a periodic staking snapshot for the time-series chart."""
        with self._get_connection() as conn:
            conn.execute(
                '''INSERT INTO skr_staking_snapshots
                   (total_staked, total_stakers, net_change_since_last)
                   VALUES (?, ?, ?)''',
                (total_staked, total_stakers, net_change)
            )

    def get_skr_staking_snapshots(self, limit=168):
        """Get historical staking snapshots. Default ~28 days of 4h snapshots."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                'SELECT * FROM skr_staking_snapshots ORDER BY timestamp DESC LIMIT ?',
                (limit,)
            )
            rows = [dict(row) for row in cursor.fetchall()]
            return sorted(rows, key=lambda x: x['timestamp'])

    def get_skr_whale_leaderboard(self, limit=50):
        """Get top stakers by net staked amount."""
        query = '''
            SELECT
                wallet_address,
                SUM(CASE WHEN event_type = 'stake' THEN amount ELSE 0 END) as total_staked,
                SUM(CASE WHEN event_type = 'unstake' THEN amount ELSE 0 END) as total_unstaked,
                SUM(CASE WHEN event_type = 'stake' THEN amount ELSE -amount END) as net_staked,
                COUNT(*) as event_count,
                MAX(block_time) as last_activity
            FROM skr_staking_events
            GROUP BY wallet_address
            HAVING net_staked > 0
            ORDER BY net_staked DESC
            LIMIT ?
        '''
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, (limit,))
            return [dict(row) for row in cursor.fetchall()]
