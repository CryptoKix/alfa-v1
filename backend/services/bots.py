#!/usr/bin/env python3
"""Bot scheduler service for DCA, TWAP, VWAP, and Grid strategies."""
import json
import time
import threading
import logging
from flask import current_app

from extensions import db, socketio
from services.trading import execute_trade_logic
from services.notifications import notify_bot_completion

logger = logging.getLogger("bots")

# Global dictionary of locks, one per bot_id
bot_locks = {}
bot_locks_lock = threading.Lock()

# Global cache for throttling performance updates
last_performance_update = {}

def get_bot_lock(bot_id):
    with bot_locks_lock:
        if bot_id not in bot_locks:
            bot_locks[bot_id] = threading.Lock()
        return bot_locks[bot_id]

def get_formatted_bots():
    formatted = []
    for b in db.get_all_bots(include_deleted=False):
        bot_dict = dict(b)
        db_status = bot_dict.get('status')
        
        if 'config_json' in bot_dict and bot_dict['config_json']:
            try: bot_dict.update(json.loads(bot_dict.pop('config_json', '{}')))
            except: pass
        if 'state_json' in bot_dict and bot_dict['state_json']:
            try: bot_dict.update(json.loads(bot_dict.pop('state_json', '{}')))
            except: pass
            
        bot_dict['status'] = db_status
        formatted.append(bot_dict)
    return formatted

def process_grid_logic(bot, current_price):
    bot_id = bot['id']
    lock = get_bot_lock(bot_id)
    
    if not lock.acquire(blocking=False):
        return

    try:
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot or fresh_bot['status'] != 'active':
            return

        config = json.loads(fresh_bot['config_json'])
        state = json.loads(fresh_bot['state_json'])
        levels = state.get('grid_levels', [])
        changed = False
        
        bot_alias = config.get('alias') or bot_id
        
        # --- CIRCUIT BREAKER: CONSECUTIVE FAILURES ---
        if state.get('consecutive_failures', 0) >= 3:
            print(f"⚠️ CIRCUIT BREAKER: Pausing bot {bot_alias} due to repeated failures.")
            state['status'] = 'paused'
            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
            socketio.emit('notification', {'title': 'Circuit Breaker', 'message': f"Bot {bot_alias} paused after 3 failures.", 'type': 'error'}, namespace='/bots')
            return

        # --- RISK CONTROL: STOP LOSS ---
        stop_loss = config.get('stop_loss_price')
        if stop_loss and current_price <= stop_loss:
            print(f"🛑 GRID STOP LOSS TRIGGERED: {bot_alias} (Price: {current_price} <= {stop_loss})")
            state['status'] = 'completed'
            state['completion_reason'] = 'stop_loss'
            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
            notify_bot_completion("GRID", bot_alias, state.get('profit_realized', 0))
            return

        # --- PROFIT TARGET: USD YIELD ---
        tp_yield = config.get('take_profit_yield_usd')
        if tp_yield and state.get('grid_yield', 0) >= tp_yield:
            print(f"💰 GRID PROFIT TARGET REACHED: {bot_alias} (Yield: ${state['grid_yield']:.2f} >= ${tp_yield:.2f})")
            state['status'] = 'completed'
            state['completion_reason'] = 'take_profit'
            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
            notify_bot_completion("GRID", bot_alias, state.get('profit_realized', 0))
            return

        h_pct = config.get('hysteresis_pct', 0.05) / 100.0
        hysteresis = current_price * h_pct

        for i in range(len(levels)):
            level = levels[i]
            
            # 1. SELL LOGIC
            if current_price >= (level['price'] + hysteresis) and level.get('has_position'):
                token_amount = level.get('token_amount', 0)
                cost_basis = level.get('cost_usd', 0)
                
                if token_amount > 0:
                    # --- ON-CHAIN RECONCILIATION ---
                    from services.portfolio import get_cached_balance
                    wallet_bal = get_cached_balance(fresh_bot['output_mint'])
                    if wallet_bal < token_amount:
                        print(f"⚠️ RECONCILIATION ERROR: {bot_alias} | Level {i+1} needs {token_amount:.4f}, but wallet has {wallet_bal:.4f}. Syncing...")
                        level['token_amount'] = wallet_bal
                        token_amount = wallet_bal
                        if token_amount < 1e-9: # Effectively empty
                            level['has_position'] = False
                            changed = True
                            continue

                    print(f"🚀 GRID SELL TRIGGER: {bot_alias} | Level {i+1} @ {level['price']:.2f}")
                    try:
                        res = execute_trade_logic(fresh_bot['output_mint'], fresh_bot['input_mint'], token_amount, f"Grid Sell @ {level['price']:.2f}", priority_fee=0)
                        
                        realized_val = res.get('usd_value', token_amount * current_price)
                        profit = realized_val - cost_basis
                        state['grid_yield'] = state.get('grid_yield', 0) + profit
                        state['profit_realized'] = state.get('grid_yield', 0)
                        state['run_count'] = state.get('run_count', 0) + 1
                        state['consecutive_failures'] = 0
                        
                        level['has_position'] = False
                        level['token_amount'] = 0
                        level['cost_usd'] = 0
                        changed = True
                        print(f"✅ GRID SELL SUCCESS: {bot_alias} | Profit: ${profit:.4f}")
                    except Exception as e:
                        state['consecutive_failures'] = state.get('consecutive_failures', 0) + 1
                        print(f"❌ GRID SELL ERROR: {bot_alias} | {e}")

            # 2. BUY LOGIC
            elif current_price <= (level['price'] - hysteresis) and not level.get('has_position'):
                print(f"🚀 GRID BUY TRIGGER: {bot_alias} | Level {i+1} @ {level['price']:.2f}")
                try:
                    # Support Pyramid Allocations
                    amount_to_spend = level.get('allocation_usd') or config.get('amount_per_level')
                    res = execute_trade_logic(fresh_bot['input_mint'], fresh_bot['output_mint'], amount_to_spend, f"Grid Buy @ {level['price']:.2f}", priority_fee=0)
                    
                    level['has_position'] = True
                    level['token_amount'] = res.get('amount_out', amount_to_spend / current_price)
                    level['cost_usd'] = res.get('usd_value', amount_to_spend)
                    state['run_count'] = state.get('run_count', 0) + 1
                    state['consecutive_failures'] = 0
                    changed = True
                    print(f"✅ GRID BUY SUCCESS: {bot_alias} | Amount: {level['token_amount']:.4f}")
                except Exception as e:
                    state['consecutive_failures'] = state.get('consecutive_failures', 0) + 1
                    print(f"❌ GRID BUY ERROR: {bot_alias} | {e}")

        if changed:
            if config.get('trailing_enabled') and current_price >= config.get('upper_bound', 0):
                step_size = (config['upper_bound'] - config['lower_bound']) / (config['steps'] - 1)
                config['lower_bound'] += step_size
                config['upper_bound'] += step_size
                for lvl in levels: lvl['price'] += step_size
                socketio.emit('notification', {'title': 'Grid Trailing Active', 'message': f"Bot {bot_alias} shifted up.", 'type': 'info'}, namespace='/bots')
            
            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

    except Exception as e:
        print(f"❌ GRID LOGIC CRITICAL ERROR: {e}")
    finally:
        lock.release()

def update_bot_performance(bot_id, current_price):
    try:
        now = time.time()
        if bot_id in last_performance_update and (now - last_performance_update[bot_id]) < 1.0:
            return
        last_performance_update[bot_id] = now
        
        lock = get_bot_lock(bot_id)
        if not lock.acquire(blocking=False): return

        try:
            fresh_bot = db.get_bot(bot_id)
            if not fresh_bot or fresh_bot['status'] != 'active': return
            
            config, state = json.loads(fresh_bot['config_json']), json.loads(fresh_bot['state_json'])
            
            if fresh_bot['type'] == 'GRID':
                grid_yield = state.get('grid_yield', 0)
                unrealized_appreciation = 0
                levels = state.get('grid_levels', [])
                for lvl in levels:
                    if lvl.get('has_position') and lvl.get('token_amount'):
                        current_val = lvl['token_amount'] * current_price
                        basis = lvl.get('cost_usd', 0)
                        if basis > 0:
                            unrealized_appreciation += (current_val - basis)
                
                state['profit_realized'] = grid_yield + unrealized_appreciation
            else:
                total_bought, total_cost = state.get('total_bought', 0), state.get('total_cost', 0)
                state['profit_realized'] = (total_bought * current_price) - total_cost
            
            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
        finally:
            lock.release()
    except Exception as e:
        print(f"Error updating bot performance: {e}")

def process_twap_logic(bot, current_price):
    bot_id = bot['id']
    lock = get_bot_lock(bot_id)
    if not lock.acquire(blocking=False): return

    try:
        config = json.loads(bot['config_json'])
        state = json.loads(bot['state_json'])
        
        if state.get('phase') == 'monitoring_profit':
            avg_price = state.get('avg_buy_price', 0)
            take_profit_pct = config.get('take_profit')
            if avg_price > 0 and take_profit_pct and take_profit_pct > 0:
                target_price = avg_price * (1 + (take_profit_pct / 100))
                if current_price >= target_price:
                    total_tokens = state.get('total_bought', 0)
                    if total_tokens > 0:
                        try:
                            res = execute_trade_logic(bot['output_mint'], bot['input_mint'], total_tokens, "TWAP Snipe Exit", priority_fee=0.005)
                            state['status'] = 'completed'
                            state['phase'] = 'completed'
                            state['profit_realized'] = res.get('usd_value', 0) - state.get('total_cost', 0)
                            socketio.emit('notification', {'title': 'Snipe Profit Hit', 'message': f"Sold {total_tokens:.4f} {bot['output_symbol']} @ ${current_price:.2f}", 'type': 'success'}, namespace='/bots')
                            notify_bot_completion("TWAP", bot['output_symbol'], state['profit_realized'])
                            db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
                            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                        except Exception as e: print(f"Snipe Sell Error: {e}")
            return

        now = time.time()
        if now >= state.get('next_run', 0):
            try:
                res = execute_trade_logic(bot['input_mint'], bot['output_mint'], config['amount'], f"{bot['type']} Execution", priority_fee=0)
                state['run_count'] += 1
                state['total_cost'] += res.get('usd_value', 0)
                state['total_bought'] += res.get('amount_out', 0)
                if state['total_bought'] > 0: state['avg_buy_price'] = state['total_cost'] / state['total_bought']
                
                if config.get('max_runs') and state['run_count'] >= config['max_runs']:
                    if config.get('take_profit') and config['take_profit'] > 0: state['phase'] = 'monitoring_profit'
                    else:
                        state['status'] = 'completed'
                        notify_bot_completion(bot['type'], bot['output_symbol'], state.get('profit_realized', 0))
                else: state['next_run'] = now + (config['interval'] * 60)
                
                db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
                socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
            except Exception as e: state['next_run'] = now + 60
    finally:
        lock.release()

def process_limit_grid_logic(bot):
    bot_id = bot['id']
    lock = get_bot_lock(bot_id)
    if not lock.acquire(blocking=False): return

    try:
        config, state = json.loads(bot['config_json']), json.loads(bot['state_json'])
        levels = state.get('grid_levels', [])
        bot_alias = config.get('alias') or bot_id
        
        from services.trading import get_open_limit_orders, create_limit_order
        open_orders = get_open_limit_orders()
        open_order_pubkeys = [o['publicKey'] for o in open_orders]
        
        changed = False
        for idx, lvl in enumerate(levels):
            order_id = lvl.get('order_id')
            if not order_id: continue
            
            if order_id not in open_order_pubkeys:
                print(f"🔔 LIMIT GRID FILL DETECTED: {bot_alias} | Level {idx+1}")
                
                if lvl.get('has_position'):
                    lvl['has_position'] = False
                    lvl['token_amount'] = 0
                    lvl['order_id'] = None
                    try:
                        new_order = create_limit_order(bot['input_mint'], bot['output_mint'], lvl.get('allocation_usd') or config['amount_per_level'], lvl['price'])
                        lvl['order_id'] = new_order.get('orderAddress')
                        changed = True
                    except Exception as e: print(f"Limit Grid BUY Re-queue Error: {e}")
                else:
                    lvl['has_position'] = True
                    lvl['order_id'] = None
                    try:
                        alloc = lvl.get('allocation_usd') or config['amount_per_level']
                        token_amount = alloc / lvl['price']
                        lvl['token_amount'] = token_amount
                        lvl['cost_usd'] = alloc
                        
                        new_order = create_limit_order(bot['output_mint'], bot['input_mint'], token_amount, 1/lvl['price'])
                        lvl['order_id'] = new_order.get('orderAddress')
                        changed = True
                    except Exception as e: print(f"Limit Grid SELL Re-queue Error: {e}")

        if changed:
            db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
    finally:
        lock.release()

def dca_scheduler(app):
    while True:
        try:
            with app.app_context():
                from extensions import price_cache 
                for bot in db.get_all_bots():
                    if bot['status'] == 'active':
                        if bot['type'] in ['DCA', 'TWAP', 'VWAP']:
                            current_price = 0
                            if bot['output_mint'] in price_cache:
                                current_price = price_cache[bot['output_mint']][0]
                            process_twap_logic(bot, current_price)
                        elif bot['type'] == 'LIMIT_GRID':
                            process_limit_grid_logic(bot)
        except Exception as e: pass
        time.sleep(15)