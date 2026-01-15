#!/usr/bin/env python3
"""General API routes for SolanaAutoTrade."""
import json
import time
import uuid
from datetime import datetime
from flask import Blueprint, render_template, jsonify, request, current_app

from extensions import db, socketio, price_cache, price_cache_lock, last_price_update
from services.tokens import get_known_tokens, get_token_symbol
from services.trading import execute_trade_logic
from services.bots import process_grid_logic, update_bot_performance
from services.notifications import notify_bot_completion

api_bp = Blueprint('api', __name__)

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

@api_bp.route('/api/health')
def api_health():
    import extensions
    return jsonify({
        "web_server": "up",
        "price_server": "up" if (time.time() - extensions.last_price_update) < 10 else "down"
    })

@api_bp.route('/api/history')
def api_history():
    return jsonify(db.get_history(50))


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
    data = request.json
    bot_id = str(uuid.uuid4())[:8]
    bot_type = data.get('strategy', 'DCA')

    config = {
        "alias": data.get('alias'),
        "interval": int(data.get('interval', 60)),
        "max_runs": int(data.get('maxRuns', 0)) or None,
        "amount": float(data.get('amount', 0)),
        "total_amount": float(data.get('totalAmount', 0)),
        "take_profit": float(data.get('takeProfit', 0)) or None,
        "lower_bound": float(data.get('lowerBound', 0)),
        "upper_bound": float(data.get('upperBound', 0)),
        "steps": int(data.get('steps', 1)),
        "amount_per_level": (float(data.get('totalInvestment', 0)) / (int(data.get('steps', 1)) - 1)) if int(data.get('steps', 1)) > 1 else float(data.get('totalInvestment', 0)),
        "trailing_enabled": bool(data.get('trailingEnabled', False))
    }

    state = {
        "status": "active",
        "run_count": 0,
        "total_bought": 0.0,
        "total_cost": 0.0,
        "profit_realized": 0.0,
        "grid_yield": 0.0,
        "next_run": time.time() + 5
    }

    if bot_type in ['GRID', 'LIMIT_GRID']:
        lb, ub, s = config['lower_bound'], config['upper_bound'], config['steps']
        current_price = 0
        with price_cache_lock:
            if data['outputMint'] in price_cache:
                current_price = price_cache[data['outputMint']][0]
        
        levels = []
        sell_levels_count = 0
        for i in range(s):
            price_level = lb + (i * (ub - lb) / (s - 1))
            is_sell_level = (i > 0) and (price_level > current_price)
            levels.append({
                "price": price_level,
                "has_position": is_sell_level,
                "token_amount": config['amount_per_level'] / current_price if is_sell_level and current_price > 0 else 0,
                "cost_usd": config['amount_per_level'] if is_sell_level else 0,
                "order_id": None
            })
            if is_sell_level: sell_levels_count += 1
        
        state['grid_levels'] = levels
        
        # Initial funding for sell side
        if sell_levels_count > 0:
            initial_buy_amount = config['amount_per_level'] * sell_levels_count
            try:
                res = execute_trade_logic(data['inputMint'], data['outputMint'], initial_buy_amount, f"{bot_type} Initial Rebalance")
                actual_tokens = res.get('amount_out', 0)
                if actual_tokens > 0:
                    tokens_per_level = actual_tokens / sell_levels_count
                    for lvl in state['grid_levels']:
                        if lvl['has_position']:
                            lvl['token_amount'] = tokens_per_level
                            lvl['cost_usd'] = config['amount_per_level']
            except Exception as e:
                print(f"Initial rebalance failed: {e}")
                for lvl in state['grid_levels']:
                    if lvl['has_position']:
                        lvl['has_position'] = False
                        lvl['token_amount'] = 0

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

    db.save_bot(bot_id, bot_type, data['inputMint'], data['outputMint'], get_token_symbol(data['inputMint']), get_token_symbol(data['outputMint']), config, state)
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
def api_trade():
    data = request.json
    try:
        sig = execute_trade_logic(data['inputMint'], data['outputMint'], float(data['amount']), data.get('strategy', 'Manual Swap'), data.get('slippageBps', 50), data.get('priorityFee', 0.001))
        return jsonify({"success": True, "signature": sig['signature']})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        extensions.last_price_update = time.time()
        with price_cache_lock:
            price_cache[mint] = (price, time.time())
        
        socketio.emit('price_update', {'mint': mint, 'price': price}, namespace='/prices')

        # Trigger grid bots
        for bot in db.get_all_bots():
            if bot['status'] == 'active' and bot['output_mint'] == mint:
                if bot['type'] == 'GRID':
                    process_grid_logic(bot, price)
                    update_bot_performance(bot['id'], price)
                elif bot['type'] in ['DCA', 'TWAP', 'VWAP']:
                    update_bot_performance(bot['id'], price)

    return jsonify({"status": "success"}), 200





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












