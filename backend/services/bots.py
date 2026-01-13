#!/usr/bin/env python3
"""Bot scheduler service for DCA, TWAP, VWAP, and Grid strategies."""
import json
import time
import threading
from flask import current_app

from extensions import db, socketio
from services.trading import execute_trade_logic

# Global lock for bot processing to prevent race conditions
bot_processing_lock = threading.Lock()

def get_formatted_bots():
    """Fetch all bots with parsed JSON config/state."""
    formatted = []
    for b in db.get_all_bots():
        bot_dict = dict(b)
        if 'config_json' in bot_dict and bot_dict['config_json']:
            try:
                bot_dict.update(json.loads(bot_dict.pop('config_json', '{}')))
            except:
                pass
        if 'state_json' in bot_dict and bot_dict['state_json']:
            try:
                bot_dict.update(json.loads(bot_dict.pop('state_json', '{}')))
            except:
                pass
        formatted.append(bot_dict)
    return formatted

def process_grid_logic(bot, current_price):
    """Process grid trading logic for a bot.

    Args:
        bot: Bot configuration dict
        current_price: Current price of the output token
    """
    acquired = bot_processing_lock.acquire(timeout=5)
    if not acquired:
        return

    try:
        config = json.loads(bot['config_json'])
        state = json.loads(bot['state_json'])
        changed = False

        levels = state.get('grid_levels', [])
        for i in range(len(levels)):
            level = levels[i]
            is_last = (i == len(levels) - 1)
            
            # Sell target is the next level's price. 
            # For the last level, the target is its own price (the upper bound).
            sell_target = levels[i+1]['price'] if not is_last else level['price']

            # Sell condition: price above target and has position
            if current_price >= sell_target and level.get('has_position'):
                current_app.logger.info(f"GRID SELL: {bot['output_symbol']} @ {current_price} (Target: {sell_target})")
                try:
                    token_amount = level.get('token_amount', config['amount_per_level'] / level['price'])
                    execute_trade_logic(
                        bot['output_mint'],
                        bot['input_mint'],
                        token_amount,
                        f"Grid Sell @ {current_price:.2f}",
                        priority_fee=0
                    )
                    state['profit_realized'] = state.get('profit_realized', 0) + (token_amount * current_price) - config['amount_per_level']
                    state['run_count'] = state.get('run_count', 0) + 1
                    level['has_position'] = False
                    changed = True
                except Exception as e:
                    current_app.logger.error(f"Grid Sell Error: {e}")

            # Buy condition: price below level and no position. 
            # SKIP buying at the absolute last level (upper bound) as it has no sell target.
            elif not is_last and current_price <= level['price'] and not level.get('has_position'):
                current_app.logger.info(f"GRID BUY: {bot['output_symbol']} @ {current_price}")
                try:
                    execute_trade_logic(
                        bot['input_mint'],
                        bot['output_mint'],
                        config['amount_per_level'],
                        f"Grid Buy @ {current_price:.2f}",
                        priority_fee=0
                    )
                    level['token_amount'] = config['amount_per_level'] / current_price
                    level['has_position'] = True
                    state['run_count'] = state.get('run_count', 0) + 1
                    changed = True
                except Exception as e:
                    current_app.logger.error(f"Grid Buy Error: {e}")

        if changed:
            # Trailing Logic: Shift grid up if price exceeds upper bound
            if config.get('trailing_enabled') and current_price >= config.get('upper_bound', 0):
                lb = config.get('lower_bound', 0)
                ub = config.get('upper_bound', 0)
                steps = config.get('steps', 10)
                step_size = (ub - lb) / (steps - 1) if steps > 1 else 0
                
                if step_size > 0:
                    config['lower_bound'] += step_size
                    config['upper_bound'] += step_size
                    for lvl in state.get('grid_levels', []):
                        lvl['price'] += step_size
                    
                    current_app.logger.info(f"GRID TRAILING: Bot {bot['id']} shifted range to {config['lower_bound']:.2f} - {config['upper_bound']:.2f}")
                    socketio.emit('notification', {
                        'title': 'Grid Trailing Active',
                        'message': f"Bot {bot['output_symbol']} range shifted up to ${config['upper_bound']:.2f} to track upside.",
                        'type': 'info',
                        'bot_id': bot['id']
                    }, namespace='/bots')

            # Completion Check: Terminate if all levels sold and price is above range
            # (Only if trailing is NOT enabled or if we want a hard cap - user asked to scale with upside, so trailing overrides)
            all_sold = all(not l.get('has_position') for l in state.get('grid_levels', []))
            if all_sold and current_price >= config.get('upper_bound', 0) and not config.get('trailing_enabled') and state.get('status') != 'completed':
                state['status'] = 'completed'
                current_app.logger.info(f"GRID BOT {bot['id']} COMPLETED: All levels sold at range exit ({current_price})")
                socketio.emit('notification', {
                    'title': 'Strategy Completed',
                    'message': f"Grid Bot {bot['output_symbol']} has exited the range at the top and sold all positions. Bot terminated.",
                    'type': 'success',
                    'bot_id': bot['id']
                }, namespace='/bots')

            db.save_bot(
                bot['id'], bot['type'],
                bot['input_mint'], bot['output_mint'],
                bot['input_symbol'], bot['output_symbol'],
                config, state
            )
            socketio.emit('bots_update', {'bots': get_formatted_bots(), 'timestamp': time.time()}, namespace='/bots')

    except Exception as e:
        current_app.logger.error(f"Error in process_grid_logic: {e}")
    finally:
        bot_processing_lock.release()




def update_bot_performance(bot, current_price):
    """Update Unrealized PnL for DCA/TWAP/VWAP bots based on current price."""
    try:
        config = json.loads(bot['config_json'])
        state = json.loads(bot['state_json'])
        
        total_bought = state.get('total_bought', 0)
        total_cost = state.get('total_cost', 0)
        
        if total_bought > 0:
            # PnL = (Current Value) - (Total Cost Basis)
            new_pnl = (total_bought * current_price) - total_cost
            
            # Update state
            state['profit_realized'] = new_pnl
            
            db.save_bot(
                bot['id'], bot['type'],
                bot['input_mint'], bot['output_mint'],
                bot['input_symbol'], bot['output_symbol'],
                config, state
            )
            # No need to emit here, the price_update event already informs the frontend
            # and the next request_bots will have the updated values.
    except Exception as e:
        current_app.logger.error(f"Error in update_bot_performance: {e}")


def dca_scheduler(app):
    """Background thread for DCA/TWAP/VWAP bot execution.

    Args:
        app: Flask application instance for context
    """
    while True:
        try:
            with app.app_context():
                now = time.time()
                for bot in db.get_all_bots():
                    if bot['status'] == 'active' and bot['type'] in ['DCA', 'TWAP', 'VWAP']:
                        config = json.loads(bot['config_json'])
                        state = json.loads(bot['state_json'])

                        if now >= state.get('next_run', 0):
                            try:
                                res = execute_trade_logic(
                                    bot['input_mint'],
                                    bot['output_mint'],
                                    config['amount'],
                                    f"{bot['type']} Execution",
                                    priority_fee=0
                                )
                                state['run_count'] = state.get('run_count', 0) + 1
                                state['total_cost'] = state.get('total_cost', 0) + res.get('usd_value', 0)
                                state['total_bought'] = state.get('total_bought', 0) + res.get('amount_out', 0)

                                if config.get('max_runs') and state['run_count'] >= config['max_runs']:
                                    state['status'] = 'completed'
                                    current_app.logger.info(f"{bot['type']} BOT {bot['id']} COMPLETED")
                                    socketio.emit('notification', {
                                        'title': 'Strategy Completed',
                                        'message': f"{bot['type']} Bot {bot['output_symbol']} has finished all {config['max_runs']} executions.",
                                        'type': 'success',
                                        'bot_id': bot['id']
                                    }, namespace='/bots')
                                else:
                                    state['next_run'] = now + (config['interval'] * 60)

                                db.save_bot(
                                    bot['id'], bot['type'],
                                    bot['input_mint'], bot['output_mint'],
                                    bot['input_symbol'], bot['output_symbol'],
                                    config, state
                                )
                                socketio.emit('bots_update', {'bots': get_formatted_bots(), 'timestamp': time.time()}, namespace='/bots')

                            except Exception as e:
                                app.logger.error(f"Bot {bot['id']} Error: {e}")

        except Exception as e:
            app.logger.error(f"Scheduler Error: {e}")

        time.sleep(10)