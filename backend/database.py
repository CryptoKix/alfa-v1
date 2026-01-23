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
                    decimals INTEGER,
                    logo_uri TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            try:
                cursor.execute('ALTER TABLE tokens ADD COLUMN logo_uri TEXT')
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

    def save_token(self, mint, symbol, decimals, logo_uri=None):
        """Save or update token metadata."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO tokens (mint, symbol, decimals, logo_uri) VALUES (?, ?, ?, ?)",
                (mint, symbol, decimals, logo_uri)
            )

    def get_known_tokens(self):
        """Fetch all discovered tokens."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM tokens WHERE is_active = 1")
            return {row['mint']: {'symbol': row['symbol'], 'decimals': row['decimals'], 'logo_uri': row['logo_uri']} for row in cursor.fetchall()}

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
