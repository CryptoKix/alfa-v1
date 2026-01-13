import sqlite3
import json
import os
from datetime import datetime

class TactixDB:
    def __init__(self, db_path="tactix_data.db"):
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
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_run DATETIME
                )
            ''')

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
            
            conn.commit()

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

    def save_bot(self, bot_id, bot_type, input_m, output_m, in_sym, out_sym, config, state):
        """Create or update a bot strategy."""
        sql = '''
            INSERT OR REPLACE INTO bots (
                id, type, input_mint, output_mint, input_symbol, output_symbol, config_json, state_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        with self._get_connection() as conn:
            conn.execute(sql, (
                bot_id, bot_type, input_m, output_m, in_sym, out_sym,
                json.dumps(config), json.dumps(state), state.get('status', 'active')
            ))

    def get_all_bots(self, include_deleted=False):
        """Fetch all bots."""
        query = "SELECT * FROM bots" if include_deleted else "SELECT * FROM bots WHERE status != 'deleted'"
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query)
            return [dict(row) for row in cursor.fetchall()]

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