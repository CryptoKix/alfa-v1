#!/usr/bin/env python3
"""General API routes for SolanaAutoTrade."""
import json
import time
import uuid
from datetime import datetime
from decimal import Decimal
from flask import Blueprint, render_template, jsonify, request, current_app

from extensions import db, socketio, price_cache, price_cache_lock, last_price_update
from services.tokens import get_known_tokens, get_token_symbol
from services.trading import execute_trade_logic
from services.bots import process_grid_logic, update_bot_performance
from services.notifications import notify_bot_completion
from middleware.rate_limit import rate_limit
from services.trade_guard import trade_guard, TradeGuardError

api_bp = Blueprint('api', __name__)

# Price sanity check constants (Issue 4)
PRICE_DEVIATION_THRESHOLD = 0.10  # 10% max deviation

@api_bp.route('/api/system/restart', methods=['POST'])
def api_system_restart():
    import subprocess
    import os
    script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'restart_services.sh')
    try:
        subprocess.Popen(['/bin/bash', script_path], start_new_session=True)
        return jsonify({"success": True, "message": "System restart initiated"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route('/api/tokens')
def api_tokens():
    known = get_known_tokens()
    return jsonify([{"mint": m, "symbol": i["symbol"], "logoURI": i.get("logo_uri"), "decimals": i.get("decimals", 9)} for m, i in known.items()])


@api_bp.route('/api/tokens/top')
def api_top_tokens():
    """Get top 100 tokens by market cap for dropdowns."""
    limit = request.args.get('limit', 100, type=int)
    tokens = db.get_top_tokens(min(limit, 200))
    return jsonify(tokens)

@api_bp.route('/api/health')
def api_health():
    import extensions
    return jsonify({
        "web_server": "up",
        "price_server": "up" if (time.time() - extensions.last_price_update) < 10 else "down"
    })


@api_bp.route('/api/system/services')
def api_system_services():
    """Get status of all backend services."""
    import subprocess
    import os
    import extensions

    services = [
        {
            "id": "backend",
            "name": "Backend API",
            "description": "Flask API & Socket.IO server",
            "port": 5001,
            "log_file": "backend/server.log"
        },
        {
            "id": "price_server",
            "name": "Price Server",
            "description": "Real-time price feed updates",
            "port": None,
            "log_file": "backend/price_server.log"
        },
        {
            "id": "sniper_outrider",
            "name": "Sniper Outrider",
            "description": "New token discovery scanner",
            "port": None,
            "log_file": "backend/sniper_outrider.log"
        },
        {
            "id": "meteora_sidecar",
            "name": "Meteora Sidecar",
            "description": "DLMM SDK transaction builder",
            "port": 5002,
            "log_file": "backend/meteora_sidecar.log"
        },
        {
            "id": "orca_sidecar",
            "name": "Orca Sidecar",
            "description": "Whirlpools SDK transaction builder",
            "port": 5003,
            "log_file": "backend/meteora_sidecar/orca_sidecar.log"
        }
    ]

    results = []
    for svc in services:
        status = "unknown"
        last_log = ""

        # Check if service is running by process name
        try:
            if svc["id"] == "backend":
                status = "running"  # We're responding, so backend is running
            elif svc["id"] == "price_server":
                # Check last price update timestamp
                status = "running" if (time.time() - extensions.last_price_update) < 15 else "stopped"
            elif svc["id"] == "meteora_sidecar":
                # Check if sidecar responds
                import requests
                try:
                    r = requests.get("http://localhost:5002/health", timeout=2)
                    status = "running" if r.status_code == 200 else "stopped"
                except:
                    status = "stopped"
            elif svc["id"] == "orca_sidecar":
                # Check if Orca sidecar responds
                import requests
                try:
                    r = requests.get("http://localhost:5003/health", timeout=2)
                    status = "running" if r.status_code == 200 else "stopped"
                except:
                    status = "stopped"
            elif svc["id"] == "sniper_outrider":
                # Check if process is running
                result = subprocess.run(
                    ["pgrep", "-f", "sniper_outrider.py"],
                    capture_output=True, text=True
                )
                status = "running" if result.returncode == 0 else "stopped"
        except Exception as e:
            status = "error"

        # Get last few log lines
        try:
            log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', svc["log_file"])
            if os.path.exists(log_path):
                with open(log_path, 'r') as f:
                    lines = f.readlines()
                    last_log = ''.join(lines[-5:]) if lines else ""
        except:
            last_log = ""

        results.append({
            **svc,
            "status": status,
            "last_log": last_log[-500:] if last_log else ""  # Limit log size
        })

    return jsonify({
        "success": True,
        "services": results,
        "timestamp": time.time()
    })


@api_bp.route('/api/system/services/<service_id>/logs')
def api_service_logs(service_id: str):
    """Get recent logs for a specific service."""
    import os

    log_files = {
        "backend": "backend/server.log",
        "price_server": "backend/price_server.log",
        "sniper_outrider": "backend/sniper_outrider.log",
        "meteora_sidecar": "backend/meteora_sidecar.log",
        "orca_sidecar": "backend/meteora_sidecar/orca_sidecar.log"
    }

    if service_id not in log_files:
        return jsonify({"success": False, "error": "Unknown service"}), 404

    lines_param = request.args.get('lines', 50, type=int)
    lines_param = min(lines_param, 200)  # Cap at 200 lines

    try:
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', log_files[service_id])
        if os.path.exists(log_path):
            with open(log_path, 'r') as f:
                all_lines = f.readlines()
                recent = all_lines[-lines_param:] if all_lines else []
                return jsonify({
                    "success": True,
                    "service_id": service_id,
                    "logs": ''.join(recent),
                    "line_count": len(recent)
                })
        else:
            return jsonify({"success": True, "service_id": service_id, "logs": "", "line_count": 0})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route('/api/history')
def api_history():
    return jsonify(db.get_history(50))

@api_bp.route('/api/portfolio/history')
def api_portfolio_history():
    return jsonify(db.get_snapshots(168)) # Get last 7 days (hourly)



# --- Sniper APIs ---

@api_bp.route('/api/sniper/tracked')
def api_get_tracked_tokens():
    return jsonify(db.get_tracked_tokens(50))


@api_bp.route('/api/sniper/settings')
def api_get_sniper_settings():
    settings = db.get_setting('sniper_settings', {
        "autoSnipe": False,
        "buyAmount": 0.1,
        "slippage": 15,
        "priorityFee": 0.005,
        "minLiquidity": 5,
        "requireMintRenounced": True,
        "requireLPBurned": True,
        "requireSocials": False
    })
    return jsonify(settings)


@api_bp.route('/api/sniper/settings/update', methods=['POST'])
def api_update_sniper_settings():
    data = request.json
    db.save_setting('sniper_settings', data)
    # Notify sniper engine of settings change if needed
    from services.sniper import sniper_engine
    sniper_engine.update_settings(data)
    return jsonify({"success": True})


@api_bp.route('/api/sniper/test_signal', methods=['POST'])
def api_sniper_test_signal():
    """Simulate a new token detection for UI testing."""
    test_token = {
        "mint": f"TEST{uuid.uuid4().hex[:8].upper()}",
        "symbol": "TACTIX",
        "name": "TacTix Test Token",
        "pool_address": "3fXKDRJy5NX4Nt3cHgvjiq9ixg2bokMD3Qoni9b3Jyjg",
        "dex_id": "Raydium",
        "initial_liquidity": 69.42,
        "socials": {"twitter": "https://x.com/tactix_sol"},
        "status": "tracking",
        "detected_at": datetime.now().isoformat()
    }
    # Save to DB so it shows in the tracked list
    db.save_sniped_token(test_token)
    # Broadcast to UI
    socketio.emit('new_token_detected', test_token, namespace='/sniper')
    return jsonify({"success": True, "token": test_token})


@api_bp.route('/api/sniper/engine/status')
def api_sniper_engine_status():
    import subprocess
    try:
        # Check if outrider process is running
        output = subprocess.check_output(['pgrep', '-f', 'sniper_outrider.py'])
        is_running = len(output) > 0
    except:
        is_running = False
    return jsonify({"isRunning": is_running})


@api_bp.route('/api/sniper/engine/toggle', methods=['POST'])
def api_sniper_engine_toggle():
    import subprocess
    import os
    action = request.json.get('action') # 'start' or 'stop'
    
    if action == 'stop':
        subprocess.run(['pkill', '-f', 'sniper_outrider.py'])
        return jsonify({"success": True, "isRunning": False})
    else:
        # Start Outrider
        script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sniper_outrider.py')
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sniper_outrider.log')
        subprocess.Popen(['python3', '-u', script_path], 
                         stdout=open(log_path, 'a'), 
                         stderr=subprocess.STDOUT,
                         start_new_session=True)
        return jsonify({"success": True, "isRunning": True})


# --- Wolf Pack APIs ---

@api_bp.route('/api/wolfpack/status')
def api_wolfpack_status():
    from services.wolfpack import wolf_pack
    return jsonify(wolf_pack.get_status())

@api_bp.route('/api/wolfpack/update', methods=['POST'])
def api_wolfpack_update():
    from services.wolfpack import wolf_pack
    wolf_pack.update_config(request.json)
    return jsonify({"success": True})


# --- Address Book APIs ---

@api_bp.route('/api/addressbook')
def api_get_address_book():
    return jsonify(db.get_address_book())


@api_bp.route('/api/addressbook/save', methods=['POST'])
def api_save_address():
    data = request.json
    address = data.get('address')
    alias = data.get('alias')
    notes = data.get('notes')
    
    if not address or not alias:
        return jsonify({"success": False, "error": "Missing address or alias"}), 400
        
    db.save_address(address, alias, notes)
    return jsonify({"success": True})


@api_bp.route('/api/addressbook/delete', methods=['POST'])
def api_delete_address():
    address = request.json.get('address')
    if not address:
        return jsonify({"success": False, "error": "Missing address"}), 400
        
    db.delete_address(address)
    return jsonify({"success": True})


# --- DCA/Bot APIs ---

@api_bp.route('/api/dca/list')
def api_dca_list():
    from services.bots import get_formatted_bots
    return jsonify(get_formatted_bots())

@api_bp.route('/api/dca/add', methods=['POST'])
def api_dca_add():
    from services.bots import get_formatted_bots
    from services.strategies import INDICATOR_BOT_TYPES

    data = request.json
    bot_id = str(uuid.uuid4())[:8]
    bot_type = data.get('strategy', 'DCA')

    # Issue 18: Input validation
    steps = int(data.get('steps') or 1)
    lower_bound = float(data.get('lowerBound') or 0)
    upper_bound = float(data.get('upperBound') or 0)
    total_investment = float(data.get('totalInvestment') or 0)
    amount = float(data.get('amount') or 0)

    # Validate steps (2-50 for grid strategies)
    if bot_type in ['GRID', 'LIMIT_GRID']:
        if steps < 2 or steps > 50:
            return jsonify({"success": False, "error": "Steps must be between 2 and 50"}), 400
        # Validate price range
        if lower_bound <= 0 or upper_bound <= 0:
            return jsonify({"success": False, "error": "Price bounds must be greater than 0"}), 400
        if lower_bound >= upper_bound:
            return jsonify({"success": False, "error": "Lower bound must be less than upper bound"}), 400
        # Validate investment amount
        if total_investment <= 0:
            return jsonify({"success": False, "error": "Total investment must be greater than 0"}), 400
    elif bot_type in INDICATOR_BOT_TYPES:
        # Indicator bot validation
        position_size = float(data.get('positionSize') or 0)
        if position_size <= 0:
            return jsonify({"success": False, "error": "Position size must be greater than 0"}), 400
    else:
        # DCA/TWAP/VWAP validation
        if bot_type != 'VWAP' and amount <= 0:
            return jsonify({"success": False, "error": "Amount must be greater than 0"}), 400

    # VWAP-specific validation
    if bot_type == 'VWAP':
        total_amount = float(data.get('totalAmount') or 0)
        if total_amount <= 0:
            return jsonify({"success": False, "error": "Total amount must be greater than 0 for VWAP"}), 400

        vwap_window = int(data.get('vwapWindow', 24))
        if vwap_window not in [1, 4, 24, 168]:
            return jsonify({"success": False, "error": "VWAP window must be 1, 4, 24, or 168 hours"}), 400

        max_deviation = float(data.get('maxDeviation', 0))
        if max_deviation < 0 or max_deviation > 50:
            return jsonify({"success": False, "error": "Max deviation must be between 0 and 50%"}), 400

        duration_hours = int(data.get('durationHours', 24))
        if duration_hours < 1 or duration_hours > 720:
            return jsonify({"success": False, "error": "Duration must be between 1 and 720 hours"}), 400

    # Validate floor_price if provided (Issue 1)
    raw_floor_price = data.get('floorPrice')
    floor_price = float(raw_floor_price) if raw_floor_price is not None else 0
    floor_price = floor_price or None

    if floor_price is not None and floor_price <= 0:
        return jsonify({"success": False, "error": "Floor price must be greater than 0"}), 400
    if floor_price is not None and floor_price >= lower_bound:
        return jsonify({"success": False, "error": "Floor price must be below lower bound"}), 400

    # Validate stop_loss_pct if provided (for DCA/TWAP)
    raw_stop_loss = data.get('stopLossPct')
    stop_loss_pct = float(raw_stop_loss) if raw_stop_loss is not None else None

    if stop_loss_pct is not None:
        if stop_loss_pct <= 0 or stop_loss_pct >= 100:
            return jsonify({"success": False, "error": "Stop loss percentage must be between 0 and 100"}), 400

    config = {
        "alias": data.get('alias'),
        "interval": int(data.get('interval', 60)),
        "max_runs": int(data.get('maxRuns', 0)) if data.get('maxRuns') is not None else None,
        "amount": amount,
        "total_amount": float(data.get('totalAmount') or 0),
        "take_profit": float(data.get('takeProfit') or 0) or None,
        "lower_bound": lower_bound,
        "upper_bound": upper_bound,
        "steps": steps,
        "amount_per_level": (total_investment / (steps - 1)) if steps > 1 else total_investment,
        "trailing_enabled": bool(data.get('trailingEnabled', False)),
        # Hysteresis: percentage buffer to prevent price jitter triggers (default 0.01% = 0.0001)
        "hysteresis": float(data.get('hysteresis', 0.0001)),
        # Issue 1: Floor protection
        "floor_price": floor_price,
        "floor_action": data.get('floorAction', 'sell_all'),  # 'sell_all' or 'pause'
        # Issue 9: Trailing max cycles (0 = unlimited)
        "trailing_max_cycles": int(data.get('trailingMaxCycles', 0)),
        # Issue 10: Configurable slippage in basis points (default 50 = 0.5%)
        "slippage_bps": int(data.get('slippageBps', 50)),
        # Stop-loss for DCA/TWAP: percentage below avg_buy_price to trigger exit
        "stop_loss_pct": stop_loss_pct,
        "stop_loss_action": data.get('stopLossAction', 'sell_all'),  # 'sell_all' or 'pause'
        # VWAP-specific config
        "vwap_window": int(data.get('vwapWindow', 24)),
        "max_deviation_pct": float(data.get('maxDeviation', 0)),
        "duration_hours": int(data.get('durationHours', 24)),
        # Indicator bot config
        "timeframe": data.get('timeframe', '1H'),
        "position_size": float(data.get('positionSize') or 0),
        "cooldown_minutes": int(data.get('cooldownMinutes', 60)),
        # RSI config
        "rsi_period": int(data.get('rsiPeriod', 14)),
        "buy_threshold": float(data.get('buyThreshold', 30)),
        "sell_threshold": float(data.get('sellThreshold', 70)),
        # MACD config
        "macd_fast": int(data.get('macdFast', 12)),
        "macd_slow": int(data.get('macdSlow', 26)),
        "macd_signal": int(data.get('macdSignal', 9)),
        "require_histogram_confirm": bool(data.get('requireHistogramConfirm', True)),
        # Bollinger config
        "bb_period": int(data.get('bbPeriod', 20)),
        "bb_std": float(data.get('bbStd', 2.0)),
        "entry_mode": data.get('entryMode', 'touch'),  # 'touch' or 'close_beyond'
        "exit_target": data.get('exitTarget', 'middle'),  # 'middle' or 'upper'
        # EMA config
        "ema_fast": int(data.get('emaFast', 9)),
        "ema_slow": int(data.get('emaSlow', 21)),
        # Multi-indicator config
        "indicators": data.get('indicators', ['RSI', 'MACD', 'BB']),
        "min_confluence": int(data.get('minConfluence', 2)),
    }

    state = {
        "status": "active",
        "run_count": 0,
        "total_bought": 0.0,
        "total_cost": 0.0,
        "profit_realized": 0.0,
        "grid_yield": 0.0,
        "next_run": time.time() + 5,
        # Indicator bot state
        "position": "none",
        "position_amount": 0.0,
        "entry_price": 0.0,
        "entry_cost": 0.0,
        "last_trade_time": 0,
    }

    if bot_type in ['GRID', 'LIMIT_GRID']:
        lb, ub, s = config['lower_bound'], config['upper_bound'], config['steps']
        current_price = 0
        with price_cache_lock:
            if data['outputMint'] in price_cache:
                current_price = price_cache[data['outputMint']][0]

        if current_price <= 0:
            return jsonify({"error": "Cannot create grid bot without current price"}), 400

        levels = []
        # Find which levels should be pre-filled based on current price position
        # Grid trading logic:
        # - Levels ABOVE current price = have positions (ready to SELL when price rises)
        # - Levels BELOW current price = no positions (ready to BUY when price drops)
        # This way we profit from price oscillations: buy low, sell high
        for i in range(s):
            price_level = lb + (i * (ub - lb) / (s - 1))
            # A level has a position if it's ABOVE current price (ready to sell high)
            # The highest level (i == s-1) is the ceiling, don't pre-fill
            should_have_position = (i < s - 1) and (price_level > current_price)

            levels.append({
                "price": price_level,
                "has_position": should_have_position,
                "token_amount": 0,  # Will be set after initial rebalance
                "cost_usd": 0,
                "order_id": None
            })

        state['grid_levels'] = levels

        # Count levels that need to be filled (positions ABOVE current price, ready to sell)
        fill_levels = [lvl for lvl in levels if lvl['has_position']]
        fill_count = len(fill_levels)

        if fill_count > 0:
            # Execute initial rebalance to buy tokens for levels above current price
            # These tokens will be sold when price rises to each level
            initial_buy_amount = config['amount_per_level'] * fill_count
            try:
                res = execute_trade_logic(
                    data['inputMint'], data['outputMint'],
                    initial_buy_amount, f"{bot_type} Initial Rebalance"
                )
                actual_tokens = res.get('amount_out', 0)
                if actual_tokens > 0:
                    tokens_per_level = actual_tokens / fill_count
                    for lvl in levels:
                        if lvl['has_position']:
                            lvl['token_amount'] = tokens_per_level
                            lvl['cost_usd'] = config['amount_per_level']
            except Exception as e:
                print(f"Initial rebalance failed: {e}")
                # Don't fail bot creation, just start with empty levels
                for lvl in levels:
                    lvl['has_position'] = False
                    lvl['token_amount'] = 0
                    lvl['cost_usd'] = 0

        # Place initial Limit Orders if mode is LIMIT_GRID
        if bot_type == 'LIMIT_GRID':
            from services.trading import create_limit_order
            for idx, lvl in enumerate(state['grid_levels']):
                try:
                    if lvl['has_position']:
                        # SELL Order: Sell tokens for USDC/SOL at lvl['price']
                        # Jupiter: Sell outputMint for inputMint
                        # takingAmount = makingAmount * price? 
                        # Wait, create_limit_order(input, output, amount, price)
                        # Input is what you SELL (makingAmount), Output is what you GET (takingAmount)
                        # So for SELL: input=outputMint, output=inputMint, price=1/lvl['price']
                        order = create_limit_order(data['outputMint'], data['inputMint'], lvl['token_amount'], 1/lvl['price'])
                        lvl['order_id'] = order.get('orderAddress')
                    elif idx < len(state['grid_levels']) - 1:
                        # BUY Order: Buy tokens with USDC/SOL at lvl['price']
                        # Input is inputMint, Output is outputMint, price=lvl['price']
                        order = create_limit_order(data['inputMint'], data['outputMint'], config['amount_per_level'], lvl['price'])
                        lvl['order_id'] = order.get('orderAddress')
                except Exception as e:
                    print(f"Failed to place initial limit order for level {idx}: {e}")

    # user_wallet: If provided, bot uses session key delegation for browser wallet users
    user_wallet = data.get('userWallet')
    db.save_bot(bot_id, bot_type, data['inputMint'], data['outputMint'], get_token_symbol(data['inputMint']), get_token_symbol(data['outputMint']), config, state, user_wallet)
    socketio.emit('bots_update', {'bots': get_formatted_bots(), 'timestamp': time.time()}, namespace='/bots')
    return jsonify({"success": True, "id": bot_id})

@api_bp.route('/api/dca/delete', methods=['POST'])
def api_dca_delete():
    from services.bots import get_formatted_bots
    bot_id = request.json.get('id')
    with db._get_connection() as conn:
        conn.row_factory = __import__('sqlite3').Row
        cursor = conn.execute("SELECT * FROM bots WHERE id = ?", (bot_id,))
        bot = cursor.fetchone()
        if bot:
            config = json.loads(bot['config_json'])
            state = json.loads(bot['state_json'])
            notify_bot_completion(bot['type'], config.get('alias') or bot['id'], state.get('profit_realized', 0))
            conn.execute("UPDATE bots SET status = 'completed' WHERE id = ?", (bot_id,))
            conn.commit()
    socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
    return jsonify({"success": True})

@api_bp.route('/api/dca/pause', methods=['POST'])
def api_dca_pause():
    from services.bots import get_formatted_bots
    bot_id = request.json.get('id')
    status = request.json.get('status')
    with db._get_connection() as conn:
        conn.execute("UPDATE bots SET status = ? WHERE id = ?", (status, bot_id))
    socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
    return jsonify({"success": True})

@api_bp.route('/api/dca/rename', methods=['POST'])
def api_dca_rename():
    from services.bots import get_formatted_bots
    bot_id = request.json.get('id')
    new_alias = request.json.get('alias')
    with db._get_connection() as conn:
        conn.row_factory = __import__('sqlite3').Row
        cursor = conn.execute("SELECT config_json FROM bots WHERE id = ?", (bot_id,))
        row = cursor.fetchone()
        if row:
            config = json.loads(row['config_json'])
            config['alias'] = new_alias
            conn.execute("UPDATE bots SET config_json = ? WHERE id = ?", (json.dumps(config), bot_id))
            conn.commit()
    socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
    return jsonify({"success": True})

@api_bp.route('/api/dca/update', methods=['POST'])
def api_dca_update():
    from services.bots import get_formatted_bots
    bot_id = request.json.get('id')
    updates = request.json.get('updates', {})
    with db._get_connection() as conn:
        conn.row_factory = __import__('sqlite3').Row
        cursor = conn.execute("SELECT config_json FROM bots WHERE id = ?", (bot_id,))
        row = cursor.fetchone()
        if row:
            config = json.loads(row['config_json'])
            for key, value in updates.items(): config[key] = value
            conn.execute("UPDATE bots SET config_json = ? WHERE id = ?", (json.dumps(config), bot_id))
            conn.commit()
    socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
    return jsonify({"success": True})

@api_bp.route('/api/trade', methods=['POST'])
@rate_limit('trade')
def api_trade():
    data = request.json
    try:
        result = execute_trade_logic(
            data['inputMint'],
            data['outputMint'],
            float(data['amount']),
            data.get('strategy', 'Manual Swap'),
            data.get('slippageBps', 50),
            data.get('priorityFee', 0.001)
        )

        # Check if trade requires confirmation
        if result.get('requires_confirmation'):
            return jsonify({
                "success": False,
                "requires_confirmation": True,
                "confirmation_id": result['confirmation_id'],
                "usd_value": result['usd_value'],
                "message": result['message']
            }), 200

        return jsonify({"success": True, "signature": result['signature']})
    except TradeGuardError as e:
        return jsonify({"error": str(e), "code": e.code}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route('/api/trade/confirm', methods=['POST'])
@rate_limit('trade')
def api_trade_confirm():
    """Confirm a large trade that requires approval."""
    data = request.json
    confirmation_id = data.get('confirmation_id')

    if not confirmation_id:
        return jsonify({"error": "confirmation_id required"}), 400

    try:
        # Validate and get trade details
        trade_details = trade_guard.confirm_trade(confirmation_id)

        # Execute the trade with skip_guard since it was already validated
        result = execute_trade_logic(
            trade_details['input_mint'],
            trade_details['output_mint'],
            trade_details['amount'],
            trade_details['source'],
            trade_details['slippage_bps'],
            skip_guard=True
        )

        return jsonify({"success": True, "signature": result['signature']})
    except TradeGuardError as e:
        return jsonify({"error": str(e), "code": e.code}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route('/api/trade/limits', methods=['GET'])
def api_trade_limits():
    """Get current trade guard configuration and daily stats."""
    return jsonify({
        "config": trade_guard.get_config(),
        "daily_stats": trade_guard.get_daily_stats()
    })


@api_bp.route('/api/limit/create', methods=['POST'])
def api_limit_create():
    data = request.json
    try:
        from services.trading import create_limit_order
        res = create_limit_order(
            data['inputMint'],
            data['outputMint'],
            float(data['amount']),
            float(data['price']),
            data.get('priorityFee', 0.001)
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route('/api/limit/cancel', methods=['POST'])
def api_limit_cancel():
    data = request.json
    try:
        from services.trading import cancel_limit_order
        res = cancel_limit_order(data['orderAddress'])
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route('/api/limit/list')
def api_limit_list():
    try:
        from services.trading import get_open_limit_orders
        orders = get_open_limit_orders()
        return jsonify(orders)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route('/api/transfer', methods=['POST'])
def api_transfer():
    data = request.json
    try:
        from services.trading import execute_transfer
        sig = execute_transfer(
            data['recipient'],
            float(data['amount']),
            data.get('mint', "So11111111111111111111111111111111111111112")
        )
        return jsonify({
            "success": True,
            "signature": sig,
            "explorer_url": f"https://solscan.io/tx/{sig}"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@api_bp.route('/api/webhook/price', methods=['POST'])
def internal_webhook():
    import extensions
    data = request.json
    mint, price = data.get('mint'), data.get('price')

    if mint and price:
        # Issue 4: Price sanity check - reject >10% deviation from last known price
        with price_cache_lock:
            last_price_entry = price_cache.get(mint)
            if last_price_entry:
                last_price, last_time = last_price_entry
                if last_price > 0:
                    deviation = abs(price - last_price) / last_price
                    if deviation > PRICE_DEVIATION_THRESHOLD:
                        current_app.logger.warning(
                            f"Price sanity check failed for {mint}: "
                            f"New price ${price:.4f} deviates {deviation*100:.1f}% from last price ${last_price:.4f}"
                        )
                        return jsonify({
                            "status": "rejected",
                            "reason": "price_deviation",
                            "deviation": deviation,
                            "threshold": PRICE_DEVIATION_THRESHOLD
                        }), 400

            # Update price cache
            price_cache[mint] = (price, time.time())

        extensions.last_price_update = time.time()
        socketio.emit('price_update', {'mint': mint, 'price': price}, namespace='/prices')

        # Trigger grid bots
        active_bots = db.get_all_bots()
        bots_changed = False
        
        for bot in active_bots:
            if bot['status'] == 'active' and bot['output_mint'] == mint:
                if bot['type'] == 'GRID':
                    # process_grid_logic returns True if it triggered a trade and saved to DB
                    # but we want to update performance anyway for unrealized PNL
                    process_grid_logic(bot, price)
                    update_bot_performance(bot['id'], price)
                    bots_changed = True
                elif bot['type'] in ['DCA', 'TWAP', 'VWAP']:
                    update_bot_performance(bot['id'], price)
                    bots_changed = True

        # Ensure UI gets the latest performance metrics immediately
        if bots_changed:
            from services.bots import get_formatted_bots
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

    return jsonify({"status": "success"}), 200


@api_bp.route('/api/vwap/data')
def api_vwap_data():
    """
    Get VWAP and volume profile data for a token.
    Query params: ?mint=<mint>&window=<hours>
    Returns: { vwap, hourly_weights[24], candle_count, window_hours }
    """
    from services.volume import get_vwap_for_token, fetch_ohlcv_data

    mint = request.args.get('mint')
    window = int(request.args.get('window', 24))

    if not mint:
        return jsonify({"error": "Missing mint parameter"}), 400

    if window not in [1, 4, 24, 168]:
        return jsonify({"error": "Window must be 1, 4, 24, or 168 hours"}), 400

    try:
        vwap, hourly_weights = get_vwap_for_token(mint, window)

        # Get candle count for info
        timeframe = "1H" if window >= 4 else "15m"
        candles = fetch_ohlcv_data(mint, timeframe, window)

        return jsonify({
            "success": True,
            "vwap": vwap,
            "hourly_weights": hourly_weights,
            "candle_count": len(candles),
            "window_hours": window
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Technical Indicator APIs ---

@api_bp.route('/api/indicators/<mint>')
def api_get_indicators(mint):
    """
    Get technical indicators for a token.
    Query params: ?timeframe=1H&indicators=rsi,macd,bb,ema_cross
    Returns all requested indicator values and signals.
    """
    try:
        from services.indicators import get_indicator_service

        timeframe = request.args.get('timeframe', '1H')
        requested = request.args.get('indicators', 'rsi,macd,bb,ema_cross')

        indicator_service = get_indicator_service()
        all_indicators = indicator_service.get_all_indicators(mint, timeframe)

        # Filter to requested indicators
        indicator_map = {
            'rsi': 'rsi',
            'macd': 'macd',
            'bb': 'bollinger',
            'bollinger': 'bollinger',
            'ema_cross': 'ema_cross',
            'ema': 'ema_cross'
        }

        results = {}
        for ind in requested.split(','):
            ind = ind.strip().lower()
            key = indicator_map.get(ind)
            if key and key in all_indicators:
                result = all_indicators[key]
                results[ind] = {
                    'value': result.value,
                    'signal': result.signal,
                    'strength': result.strength,
                    'data': result.raw_data
                }

        return jsonify({
            "success": True,
            "mint": mint,
            "timeframe": timeframe,
            "indicators": results
        })
    except ImportError as e:
        return jsonify({"error": "Indicator service not available. Install pandas-ta.", "details": str(e)}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Backtesting APIs ---

@api_bp.route('/api/backtest/run', methods=['POST'])
def api_backtest_run():
    """
    Run a backtest simulation for an indicator strategy.

    POST body:
    {
        "strategy": "RSI_BOT" | "MACD_BOT" | "BB_BOT" | "EMA_CROSS_BOT" | "MULTI_IND_BOT",
        "config": { strategy-specific config },
        "mint": "token_mint_address",
        "symbol": "SOL",
        "timeframe": "1H" | "4H",
        "hours_back": 168,
        "initial_balance": 10000
    }
    """
    try:
        from services.backtester import Backtester

        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400

        strategy = data.get('strategy')
        config = data.get('config', {})
        mint = data.get('mint')
        symbol = data.get('symbol', '')
        timeframe = data.get('timeframe', '1H')
        hours_back = int(data.get('hours_back', 168))
        initial_balance = float(data.get('initial_balance', 10000))

        if not strategy:
            return jsonify({"error": "Missing strategy parameter"}), 400
        if not mint:
            return jsonify({"error": "Missing mint parameter"}), 400

        # Validate strategy type
        valid_strategies = ['RSI_BOT', 'MACD_BOT', 'BB_BOT', 'EMA_CROSS_BOT', 'MULTI_IND_BOT']
        if strategy not in valid_strategies:
            return jsonify({"error": f"Invalid strategy. Must be one of: {valid_strategies}"}), 400

        # Add symbol to config for result
        config['symbol'] = symbol

        # Run backtest
        backtester = Backtester(
            strategy_type=strategy,
            config=config,
            mint=mint,
            timeframe=timeframe
        )

        result = backtester.run(
            hours_back=hours_back,
            initial_balance=initial_balance
        )

        # Save to database
        result_dict = result.to_dict()
        result_id = db.save_backtest_result(result_dict)
        result_dict['id'] = result_id

        return jsonify({
            "success": True,
            "result": result_dict
        })

    except ImportError as e:
        return jsonify({"error": "Backtester not available. Install pandas-ta.", "details": str(e)}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api_bp.route('/api/backtest/history')
def api_backtest_history():
    """
    Get backtest result history.
    Query params: ?mint=<mint>&strategy=<strategy>&limit=50
    """
    mint = request.args.get('mint')
    strategy = request.args.get('strategy')
    limit = int(request.args.get('limit', 50))

    results = db.get_backtest_results(mint=mint, strategy_type=strategy, limit=limit)

    return jsonify({
        "success": True,
        "results": results
    })


@api_bp.route('/api/backtest/<int:result_id>')
def api_backtest_detail(result_id):
    """Get detailed backtest result including trades and equity curve."""
    result = db.get_backtest_result(result_id)

    if not result:
        return jsonify({"error": "Backtest result not found"}), 404

    return jsonify({
        "success": True,
        "result": result
    })


@api_bp.route('/api/backtest/<int:result_id>', methods=['DELETE'])
def api_backtest_delete(result_id):
    """Delete a backtest result."""
    db.delete_backtest_result(result_id)
    return jsonify({"success": True})



@api_bp.route('/api/webhook/sniper', methods=['POST'])





def internal_sniper_webhook():





    """Handle real-time token detections from the outrider process."""





    token_data = request.json





    if not token_data: return jsonify({"error": "No data"}), 400





    





    symbol = token_data.get('symbol', '???')





    mint = token_data.get('mint', '???')





    actual_liq = float(token_data.get('initial_liquidity', 0))





    





    # Load current settings to check filters





    settings = db.get_setting('sniper_settings', {})





    min_liq = float(settings.get('minLiquidity', 0))











    if actual_liq < min_liq:





        current_app.logger.info(f"⏳ Sniper Filter: {symbol} ({mint[:8]}) dropped. Liq {actual_liq:.2f} < threshold {min_liq:.2f}")





        return jsonify({"status": "filtered", "threshold": min_liq}), 200











    current_app.logger.info(f"🎯 Sniper Broadcast: {symbol} ({mint[:8]}) passed filters with {actual_liq:.2f} SOL. Emitting to UI...")











    # Broadcast to UI





    socketio.emit('new_token_detected', token_data, namespace='/sniper')





    





    # Check Auto-Snipe settings





    if settings.get('autoSnipe'):





        current_app.logger.info(f"🤖 Auto-Snipe: Triggering execution for {symbol}")





        from services.sniper import sniper_engine





        sniper_engine.attempt_auto_snipe(token_data)





            





    return jsonify({"status": "ok"})












