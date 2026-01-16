#!/usr/bin/env python3
"""Bot scheduler service for DCA, TWAP, VWAP, and Grid strategies."""
import json
import time
import threading
from flask import current_app

from extensions import db, socketio
from services.trading import execute_trade_logic
from services.notifications import notify_bot_completion

bot_processing_lock = threading.Lock()
# In-memory guard to prevent concurrent trades for the same bot
in_flight_bots = set()

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
    acquired = bot_processing_lock.acquire(timeout=1)
    if not acquired: return
    
    bot_id = bot['id']
    if bot_id in in_flight_bots:
        bot_processing_lock.release()
        return
        
    try:
        in_flight_bots.add(bot_id)
    finally:
        bot_processing_lock.release()

    try:
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot or fresh_bot['status'] != 'active':
            return

        config = json.loads(fresh_bot['config_json'])
        state = json.loads(fresh_bot['state_json'])
        levels = state.get('grid_levels', [])
        changed = False
        
        bot_alias = config.get('alias') or bot_id
        hysteresis = current_price * 0.0001 

        # Calculate next targets for logging
        next_buy = None
        next_sell = None
        for i in range(1, len(levels)):
            lvl = levels[i]
            prev_lvl = levels[i-1]
            if not lvl.get('has_position'):
                if next_buy is None or prev_lvl['price'] > next_buy:
                    next_buy = prev_lvl['price']
            if lvl.get('has_position'):
                if next_sell is None or lvl['price'] < next_sell:
                    next_sell = lvl['price']

        buy_str = f"${next_buy:.2f}" if next_buy is not None else "NONE"
        sell_str = f"${next_sell:.2f}" if next_sell is not None else "NONE"
        print(f"DEBUG: GRID {bot_alias} | Price: {current_price:.4f} | Next Buy: {buy_str} | Next Sell: {sell_str}")

        upper_bound = config.get('upper_bound', 0)
        if current_price >= (upper_bound + hysteresis):
            # Check for ANY level that still has a position and sell it
            for i, level in enumerate(levels):
                if level.get('has_position'):
                    print(f"🚀 GRID CEILING SELL TRIGGER: {bot_alias} | Level {i+1} @ {level['price']} (Price: {current_price})")
                    try:
                        token_amount = level.get('token_amount', 0)
                        if token_amount > 0:
                            res = execute_trade_logic(
                                fresh_bot['output_mint'], 
                                fresh_bot['input_mint'], 
                                token_amount, 
                                f"Grid Ceiling Sell @ {level['price']:.2f}", 
                                priority_fee=0
                            )
                            realized_val = res.get('usd_value', token_amount * current_price)
                            cost_basis = level.get('cost_usd', config['amount_per_level'])
                            profit = realized_val - cost_basis
                            state['grid_yield'] = state.get('grid_yield', 0) + profit
                            state['profit_realized'] = state.get('grid_yield', 0)
                            state['run_count'] = state.get('run_count', 0) + 1
                            level['has_position'] = False
                            level['token_amount'] = 0
                            level['cost_usd'] = 0
                            changed = True
                            print(f"✅ GRID CEILING SELL SUCCESS: {bot_alias} | Profit: ${profit:.4f}")
                            # We don't break here, we might want to sell all levels above ceiling
                        else:
                            level['has_position'] = False # No tokens, just clear it
                    except Exception as e:
                        print(f"❌ GRID CEILING SELL ERROR: {bot_alias} | {e}")

        for i in range(1, len(levels)):
            level = levels[i] 
            prev_level = levels[i-1] 
            
            # print(f"DEBUG: Checking Level {i+1}: Price={level['price']:.2f}, HasPos={level.get('has_position')}")

            # 1. SELL LOGIC
            if current_price >= (level['price'] + hysteresis) and level.get('has_position'):
                level['has_position'] = False 
                
                print(f"🚀 GRID SELL TRIGGER: {bot_alias} | Level {i+1} @ {level['price']} (Price: {current_price})")
                print(f"DEBUG: Attempting to sell {token_amount:.4f} {fresh_bot['output_symbol']} for estimated profit ${est_profit:.4f}")
                try:
                    token_amount = level.get('token_amount', 0)
                    if token_amount <= 0:
                        print(f"⚠️ GRID SELL SKIPPED: {bot_alias} | Level {i+1} @ {level['price']} - No tokens to sell.")
                        level['has_position'] = True # Revert has_position as no sell occurred
                        continue # Skip to next level if no tokens to sell
                    
                    cost_basis = level.get('cost_usd', config['amount_per_level'])
                    est_profit = (token_amount * current_price) - cost_basis

                    res = execute_trade_logic(
                        fresh_bot['output_mint'], 
                        fresh_bot['input_mint'], 
                        token_amount, 
                        f"Grid Sell @ {level['price']:.2f}", 
                        priority_fee=0
                    )
                    
                    realized_val = res.get('usd_value', token_amount * current_price)
                    profit = realized_val - cost_basis
                    
                    state['grid_yield'] = state.get('grid_yield', 0) + profit
                    state['profit_realized'] = state.get('grid_yield', 0)
                    state['run_count'] = state.get('run_count', 0) + 1
                    level['token_amount'] = 0
                    level['cost_usd'] = 0
                    changed = True
                    print(f"✅ GRID SELL SUCCESS: {bot_alias} | Profit: ${profit:.4f}")
                    # Removed break to allow multiple sells per tick

                except Exception as e:
                    level['has_position'] = True
                    print(f"❌ GRID SELL ERROR: {bot_alias} | {e}")

            # 2. BUY LOGIC
            elif current_price <= (prev_level['price'] - hysteresis) and not level.get('has_position'):
                level['has_position'] = True 
                
                print(f"🚀 GRID BUY TRIGGER: {bot_alias} | Level {i} @ {prev_level['price']} (Price: {current_price})")
                print(f"DEBUG: Attempting to buy with {config['amount_per_level']:.4f} {fresh_bot['input_symbol']}")
                try:
                    res = execute_trade_logic(fresh_bot['input_mint'], fresh_bot['output_mint'], config['amount_per_level'], f"Grid Buy @ {prev_level['price']:.2f}", priority_fee=0)
                    
                    level['token_amount'] = res.get('amount_out', config['amount_per_level'] / current_price)
                    level['cost_usd'] = res.get('usd_value', config['amount_per_level'])
                    state['run_count'] = state.get('run_count', 0) + 1
                    changed = True
                    print(f"✅ GRID BUY SUCCESS: {bot_alias} | Amount: {level['token_amount']:.4f}")
                    # Removed break to allow multiple buys per tick

                except Exception as e:
                    level['has_position'] = False
                    print(f"❌ GRID BUY ERROR: {bot_alias} | {e}")

        if changed:
            if config.get('trailing_enabled') and current_price >= config.get('upper_bound', 0):
                step_size = (config['upper_bound'] - config['lower_bound']) / (config['steps'] - 1)
                config['lower_bound'] += step_size
                config['upper_bound'] += step_size
                for lvl in state.get('grid_levels', []): lvl['price'] += step_size
                socketio.emit('notification', {'title': 'Grid Trailing Active', 'message': f"Bot {bot_alias} shifted up.", 'type': 'info'}, namespace='/bots')
            
            all_sold = all(not l.get('has_position') for l in state.get('grid_levels', []))
            if all_sold and current_price >= config.get('upper_bound', 0) and not config.get('trailing_enabled'):
                state['status'] = 'completed'
                notify_bot_completion("GRID", bot_alias, state.get('profit_realized', 0))
            
            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

    except Exception as e:
        print(f"❌ GRID LOGIC CRITICAL ERROR: {e}")
    finally:
        in_flight_bots.discard(bot_id)

def process_twap_logic(bot, current_price):
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
    except Exception as e: pass

def update_bot_performance(bot_id, current_price):
    try:
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot: return
        
        config, state = json.loads(fresh_bot['config_json']), json.loads(fresh_bot['state_json'])
        if fresh_bot['type'] == 'GRID':
            grid_yield = state.get('grid_yield', 0)
            unrealized_appreciation = 0
            levels = state.get('grid_levels', [])
            for lvl in levels:
                if lvl.get('has_position') and lvl.get('token_amount') and lvl.get('cost_usd'):
                    unrealized_appreciation += (lvl['token_amount'] * current_price - lvl['cost_usd'])
            state['profit_realized'] = grid_yield + unrealized_appreciation
        else:
            total_bought, total_cost = state.get('total_bought', 0), state.get('total_cost', 0)
            state['profit_realized'] = (total_bought * current_price) - total_cost
        db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
    except Exception as e:
        print(f"Error updating bot performance: {e}")

def process_limit_grid_logic(bot):
    try:
        config, state = json.loads(bot['config_json']), json.loads(bot['state_json'])
        levels = state.get('grid_levels', [])
        
        # Get all open orders for the wallet
        from services.trading import get_open_limit_orders, create_limit_order
        open_orders = get_open_limit_orders()
        open_order_pubkeys = [o['publicKey'] for o in open_orders]
        
        changed = False
        for idx, lvl in enumerate(levels):
            order_id = lvl.get('order_id')
            if not order_id: continue
            
            # If order is no longer in open orders, it was likely filled
            if order_id not in open_order_pubkeys:
                print(f"🔔 LIMIT GRID FILL DETECTED: {bot['id']} | Level {idx}")
                
                # RE-QUEUE LOGIC
                if lvl.get('has_position'):
                    # SELL ORDER WAS FILLED
                    # Now we have USDC/SOL, place a BUY order at the same level (which is lvl['price'])?
                    # No, usually you place a BUY at the level BELOW and a SELL at the level ABOVE.
                    # In our simplified logic: 
                    # If SELL at price P filled, we now want to BUY at price P-step (wait, our levels are fixed).
                    # Actually, if SELL at lvl[idx].price filled, we place a BUY at lvl[idx-1].price?
                    # Let's keep it simple: 
                    # If SELL filled -> lvl is now EMPTY. Place BUY order at THIS level? 
                    # Standard Grid: SELL at P, BUY at P-step.
                    lvl['has_position'] = False
                    lvl['token_amount'] = 0
                    lvl['order_id'] = None
                    
                    # Place BUY order at this same level price? 
                    # Wait, our BUY triggers are at prev_level['price'].
                    # Let's re-align with process_grid_logic:
                    # BUY is at index i-1, SELL is at index i.
                    # This needs careful mapping.
                    
                    # For now, let's just mark it as "needs new order" and we can refine later.
                    # Simple re-queue: replace what was filled.
                    try:
                        new_order = create_limit_order(bot['input_mint'], bot['output_mint'], config['amount_per_level'], lvl['price'])
                        lvl['order_id'] = new_order.get('orderAddress')
                        changed = True
                    except Exception as e: print(f"Limit Grid Re-queue Error: {e}")
                else:
                    # BUY ORDER WAS FILLED
                    lvl['has_position'] = True
                    lvl['order_id'] = None
                    # We bought tokens, now place a SELL order at this level price
                    try:
                        # amount = config['amount_per_level'] / lvl['price']
                        # price_in_output_units = 1 / lvl['price']
                        new_order = create_limit_order(bot['output_mint'], bot['input_mint'], config['amount_per_level'] / lvl['price'], 1/lvl['price'])
                        lvl['order_id'] = new_order.get('orderAddress')
                        changed = True
                    except Exception as e: print(f"Limit Grid Re-queue Error: {e}")

        if changed:
            db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

    except Exception as e:
        print(f"❌ LIMIT GRID WATCHER ERROR: {e}")

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
        time.sleep(15) # Poll limit orders every 15s
