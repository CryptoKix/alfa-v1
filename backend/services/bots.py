#!/usr/bin/env python3
"""Bot scheduler service for DCA, TWAP, VWAP, and Grid strategies."""
import json
import time
import threading
from flask import current_app

from extensions import db, socketio
from services.trading import execute_trade_logic

bot_processing_lock = threading.Lock()

def get_formatted_bots():
    formatted = []
    for b in db.get_all_bots():
        bot_dict = dict(b)
        if 'config_json' in bot_dict and bot_dict['config_json']:
            try: bot_dict.update(json.loads(bot_dict.pop('config_json', '{}')))
            except: pass
        if 'state_json' in bot_dict and bot_dict['state_json']:
            try: bot_dict.update(json.loads(bot_dict.pop('state_json', '{}')))
            except: pass
        formatted.append(bot_dict)
    return formatted

def process_grid_logic(bot, current_price):
    acquired = bot_processing_lock.acquire(timeout=5)
    if not acquired: return
    try:
        config = json.loads(bot['config_json'])
        state = json.loads(bot['state_json'])
        levels = state.get('grid_levels', [])
        changed = False
        for i in range(1, len(levels)):
            level = levels[i]
            prev_level = levels[i-1]
            if current_price >= level['price'] and level.get('has_position'):
                current_app.logger.info(f"GRID SELL: {bot['output_symbol']} @ {current_price}")
                try:
                    token_amount = level.get('token_amount', config['amount_per_level'] / prev_level['price'])
                    execute_trade_logic(bot['output_mint'], bot['input_mint'], token_amount, f"Grid Sell @ {level['price']:.2f}", priority_fee=0)
                    state['profit_realized'] = state.get('profit_realized', 0) + (token_amount * current_price) - config['amount_per_level']
                    state['run_count'] = state.get('run_count', 0) + 1
                    level['has_position'] = False
                    changed = True
                except Exception as e: current_app.logger.error(f"Grid Sell Error: {e}")
            elif current_price <= prev_level['price'] and not level.get('has_position'):
                current_app.logger.info(f"GRID BUY: {bot['output_symbol']} @ {current_price}")
                try:
                    execute_trade_logic(bot['input_mint'], bot['output_mint'], config['amount_per_level'], f"Grid Buy @ {prev_level['price']:.2f}", priority_fee=0)
                    level['token_amount'] = config['amount_per_level'] / current_price
                    level['has_position'] = True
                    state['run_count'] = state.get('run_count', 0) + 1
                    changed = True
                except Exception as e: current_app.logger.error(f"Grid Buy Error: {e}")

        if changed:
            if config.get('trailing_enabled') and current_price >= config.get('upper_bound', 0):
                lb, ub, steps = config.get('lower_bound', 0), config.get('upper_bound', 0), config.get('steps', 10)
                step_size = (ub - lb) / (steps - 1) if steps > 1 else 0
                if step_size > 0:
                    config['lower_bound'] += step_size
                    config['upper_bound'] += step_size
                    for lvl in state.get('grid_levels', []): lvl['price'] += step_size
                    socketio.emit('notification', {'title': 'Grid Trailing Active', 'message': f"Bot {bot['output_symbol']} shifted range up.", 'type': 'info'}, namespace='/bots')
            all_sold = all(not l.get('has_position') for l in state.get('grid_levels', []))
            if all_sold and current_price >= config.get('upper_bound', 0) and not config.get('trailing_enabled'):
                state['status'] = 'completed'
                socketio.emit('notification', {'title': 'Strategy Completed', 'message': f"Grid Bot {bot['output_symbol']} terminated.", 'type': 'success'}, namespace='/bots')
            db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
    except Exception as e: current_app.logger.error(f"Error: {e}")
    finally: bot_processing_lock.release()

def process_twap_logic(bot, current_price):
    """Process logic for active TWAP/DCA bots, including Snipe Profit."""
    try:
        config = json.loads(bot['config_json'])
        state = json.loads(bot['state_json'])
        
        # 1. Monitoring Phase (Buy logic completed, waiting for Snipe)
        if state.get('phase') == 'monitoring_profit':
            avg_price = state.get('avg_buy_price', 0)
            take_profit_pct = config.get('take_profit')
            
            if avg_price > 0 and take_profit_pct and take_profit_pct > 0:
                target_price = avg_price * (1 + (take_profit_pct / 100))
                
                # Check trigger
                if current_price >= target_price:
                    current_app.logger.info(f"TWAP SNIPE TRIGGERED: {bot['output_symbol']} @ {current_price} (Target: {target_price})")
                    total_tokens = state.get('total_bought', 0)
                    
                    if total_tokens > 0:
                        try:
                            # Sell ALL
                            res = execute_trade_logic(bot['output_mint'], bot['input_mint'], total_tokens, "TWAP Snipe Exit", priority_fee=0.005)
                            
                            # Update State
                            state['status'] = 'completed'
                            state['phase'] = 'completed'
                            state['profit_realized'] = res.get('usd_value', 0) - state.get('total_cost', 0)
                            
                            socketio.emit('notification', {
                                'title': 'Snipe Profit Hit', 
                                'message': f"Sold {total_tokens:.4f} {bot['output_symbol']} @ ${current_price:.2f}. Profit secured.", 
                                'type': 'success'
                            }, namespace='/bots')
                            
                            db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
                            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                            
                        except Exception as e:
                            current_app.logger.error(f"Snipe Sell Error: {e}")
            return

        # 2. Standard Execution Loop
        now = time.time()
        if now >= state.get('next_run', 0):
            try:
                res = execute_trade_logic(bot['input_mint'], bot['output_mint'], config['amount'], f"{bot['type']} Execution", priority_fee=0)
                state['run_count'] += 1
                state['total_cost'] += res.get('usd_value', 0)
                state['total_bought'] += res.get('amount_out', 0)
                
                # Update Average Price
                if state['total_bought'] > 0:
                    state['avg_buy_price'] = state['total_cost'] / state['total_bought']

                # Check for completion
                if config.get('max_runs') and state['run_count'] >= config['max_runs']:
                    # If Snipe Profit is set, switch to Monitoring Mode
                    if config.get('take_profit') and config['take_profit'] > 0:
                        state['phase'] = 'monitoring_profit'
                        socketio.emit('notification', {
                            'title': 'TWAP Accumulation Done', 
                            'message': f"Entering Snipe Mode. Target: +{config['take_profit']}%", 
                            'type': 'info'
                        }, namespace='/bots')
                    else:
                        state['status'] = 'completed'
                        socketio.emit('notification', {'title': 'Strategy Completed', 'message': f"{bot['type']} finished.", 'type': 'success'}, namespace='/bots')
                else:
                    state['next_run'] = now + (config['interval'] * 60)
                
                db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
                socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
            except Exception as e:
                current_app.logger.error(f"Execution Error: {e}")
                state['next_run'] = now + 60 # Retry in 1 minute

    except Exception as e: current_app.logger.error(f"TWAP Logic Error: {e}")

def update_bot_performance(bot, current_price):
    try:
        config, state = json.loads(bot['config_json']), json.loads(bot['state_json'])
        total_bought, total_cost = state.get('total_bought', 0), state.get('total_cost', 0)
        
        # Calculate unrealized PnL
        current_val = total_bought * current_price
        state['profit_realized'] = current_val - total_cost
        
        db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
    except Exception as e: current_app.logger.error(f"Error: {e}")

def dca_scheduler(app):
    while True:
        try:
            with app.app_context():
                from extensions import price_cache 
                
                for bot in db.get_all_bots():
                    if bot['status'] == 'active' and bot['type'] in ['DCA', 'TWAP', 'VWAP']:
                        current_price = 0
                        if bot['output_mint'] in price_cache:
                            current_price = price_cache[bot['output_mint']][0]
                        
                        process_twap_logic(bot, current_price)
                        
        except Exception as e: app.logger.error(f"Scheduler Error: {e}")
        time.sleep(10)
