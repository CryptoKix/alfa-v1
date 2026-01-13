#!/usr/bin/env python3
"""General API routes for SolanaAutoTrade."""
import json
import time
import uuid
from flask import Blueprint, render_template, jsonify, request, current_app

from extensions import db, socketio, price_cache, price_cache_lock, last_price_update
from services.tokens import get_known_tokens, get_token_symbol
from services.trading import execute_trade_logic
from services.bots import process_grid_logic, update_bot_performance

api_bp = Blueprint('api', __name__)


# --- Token & Health APIs ---

@api_bp.route('/api/tokens')
def api_tokens():
    known = get_known_tokens()
    return jsonify([{"mint": m, "symbol": i["symbol"]} for m, i in known.items()])


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


# --- DCA/Bot APIs ---

@api_bp.route('/api/dca/list')
def api_dca_list():
    from services.bots import get_formatted_bots
    return jsonify(get_formatted_bots())


@api_bp.route('/api/dca/add', methods=['POST'])
def api_dca_add():
    from services.bots import get_formatted_bots
    data = request.json
    print(f"DEBUG: api_dca_add received data: {data}")
    bot_id = str(uuid.uuid4())[:8]
    bot_type = data.get('strategy', 'DCA')

    config = {
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
        "avg_buy_price": 0.0,
        "profit_realized": 0.0,
        "next_run": time.time() + 5
    }

    if bot_type == 'GRID':
        lb, ub, s = config['lower_bound'], config['upper_bound'], config['steps']
        
        # Get current price for smart initialization
        current_price = 0
        with price_cache_lock:
            if data['outputMint'] in price_cache:
                current_price = price_cache[data['outputMint']][0]
        
        print(f"DEBUG: Initializing GRID bot at price {current_price}")
        levels = []
        sell_levels_count = 0
        for i in range(s):
            price_level = lb + (i * (ub - lb) / (s - 1))
            # New Interval Model: level[i] manages interval [level[i-1], level[i]].
            # Position on level[i] means bought at level[i-1], waiting to sell at level[i].
            is_sell_level = (i > 0) and (price_level > current_price)
            if is_sell_level:
                sell_levels_count += 1
            
            levels.append({
                "price": price_level,
                "has_position": is_sell_level,
                "token_amount": config['amount_per_level'] / price_level if is_sell_level else 0
            })
        
        state['grid_levels'] = levels
        
        # Execute initial buy to fund the SELL levels
        if sell_levels_count > 0:
            initial_buy_amount = config['amount_per_level'] * sell_levels_count
            print(f"DEBUG: GRID INIT: Buying {initial_buy_amount} worth of {get_token_symbol(data['outputMint'])}")
            current_app.logger.info(f"GRID INIT: Buying {initial_buy_amount} worth of {get_token_symbol(data['outputMint'])} to fund {sell_levels_count} sell levels.")
            
            try:
                execute_trade_logic(
                    data['inputMint'],
                    data['outputMint'],
                    initial_buy_amount,
                    "Grid Initial Rebalance"
                )
            except Exception as e:
                print(f"DEBUG: GRID INIT FAILED: {e}")
                current_app.logger.error(f"Grid Initial Rebalance Failed: {e}")
                # Log failure to DB so it shows in UI
                db.log_trade({
                    "wallet_address": __import__('config').WALLET_ADDRESS,
                    "source": "Grid Initial Rebalance",
                    "input": get_token_symbol(data['inputMint']),
                    "output": get_token_symbol(data['outputMint']),
                    "input_mint": data['inputMint'],
                    "output_mint": data['outputMint'],
                    "amount_in": initial_buy_amount,
                    "status": "failed",
                    "error": str(e)
                })
                socketio.emit('history_update', {'history': db.get_history(50, wallet_address=__import__('config').WALLET_ADDRESS)}, namespace='/history')
                
                # Revert 'has_position' since trade failed
                for lvl in state['grid_levels']:
                    if lvl['has_position']:
                        lvl['has_position'] = False
                        lvl['token_amount'] = 0

    print(f"DEBUG: Saving bot {bot_id}")
    db.save_bot(
        bot_id, bot_type,
        data['inputMint'], data['outputMint'],
        get_token_symbol(data['inputMint']), get_token_symbol(data['outputMint']),
        config, state
    )
    socketio.emit('bots_update', {'bots': get_formatted_bots(), 'timestamp': time.time()}, namespace='/bots')
    return jsonify({"success": True, "id": bot_id})


@api_bp.route('/api/dca/delete', methods=['POST'])
def api_dca_delete():
    from services.bots import get_formatted_bots
    with db._get_connection() as conn:
        conn.execute("UPDATE bots SET status = 'deleted' WHERE id = ?", (request.json.get('id'),))
    socketio.emit('bots_update', {'bots': get_formatted_bots(), 'timestamp': time.time()}, namespace='/bots')
    return jsonify({"success": True})


@api_bp.route('/api/dca/pause', methods=['POST'])
def api_dca_pause():
    from services.bots import get_formatted_bots
    bot_id = request.json.get('id')
    status = request.json.get('status') # 'active' or 'paused'
    
    if status not in ['active', 'paused']:
        return jsonify({"error": "Invalid status"}), 400

    with db._get_connection() as conn:
        conn.execute("UPDATE bots SET status = ? WHERE id = ?", (status, bot_id))
    
    socketio.emit('bots_update', {'bots': get_formatted_bots(), 'timestamp': time.time()}, namespace='/bots')
    return jsonify({"success": True})


# --- Trade API ---

@api_bp.route('/api/trade', methods=['POST'])
def api_trade():
    data = request.json
    try:
        sig = execute_trade_logic(
            data['inputMint'],
            data['outputMint'],
            float(data['amount']),
            data.get('strategy', 'Manual Swap'),
            data.get('slippageBps', 50),
            data.get('priorityFee', 0.001)
        )
        return jsonify({
            "success": True,
            "signature": sig,
            "explorer_url": f"https://solscan.io/tx/{sig}"
        })
    except Exception as e:
        db.log_trade({
            "wallet_address": __import__('config').WALLET_ADDRESS,
            "source": data.get('strategy', 'Manual'),
            "input": "???",
            "output": "???",
            "amount_in": data.get('amount', 0),
            "status": "failed",
            "error": str(e)
        })
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



# --- Price Webhook ---

@api_bp.route('/api/webhook/price', methods=['POST'])
def internal_webhook():
    import extensions
    data = request.json
    mint, price = data.get('mint'), data.get('price')
    print(f"DEBUG: Webhook received price for {mint}: {price}")

    if mint and price:
        extensions.last_price_update = time.time()
        with price_cache_lock:
            price_cache[mint] = (price, time.time())
            price_cache[mint] = (price, time.time())

        socketio.emit('price_update', {'mint': mint, 'price': price}, namespace='/prices')
        print(f'DEBUG: Emitted price_update for {mint}')

        # Trigger grid bots
        for bot in db.get_all_bots():
            if bot['type'] == 'GRID' and bot['status'] == 'active' and bot['output_mint'] == mint:
                from services.bots import process_grid_logic
                process_grid_logic(bot, price)
            elif bot['type'] in ['DCA', 'TWAP', 'VWAP'] and bot['status'] == 'active' and bot['output_mint'] == mint:
                from services.bots import update_bot_performance
                update_bot_performance(bot, price)

    return jsonify({"status": "ok"})

