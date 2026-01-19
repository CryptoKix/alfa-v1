#!/usr/bin/env python3
"""Bot scheduler service for DCA, TWAP, VWAP, and Grid strategies."""
import json
import time
import threading
from decimal import Decimal, ROUND_DOWN
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import current_app

from extensions import db, socketio
from services.trading import execute_trade_logic
from services.notifications import notify_bot_completion, send_discord_notification

# Thread pool for concurrent bot processing (Issue 5)
BOT_EXECUTOR = ThreadPoolExecutor(max_workers=4)


def execute_bot_trade(
    input_mint: str,
    output_mint: str,
    amount: float,
    source: str,
    slippage_bps: int = 50,
    priority_fee: float = 0,
    user_wallet: str = None
):
    """
    Execute a bot trade, using session key signing if available for browser wallets.

    Args:
        user_wallet: If provided, attempts to use session key delegation for this browser wallet.
                    If None or no active session, falls back to server keypair.
    """
    # Check if we should use session key signing
    if user_wallet:
        try:
            from services.session_keys import get_session_keypair, execute_trade_with_session_key
            keypair = get_session_keypair(user_wallet)
            if keypair:
                # Use session key for browser wallet user
                print(f"🔑 Using session key for {user_wallet[:8]}... to execute {source}")
                return execute_trade_with_session_key(
                    user_wallet=user_wallet,
                    input_mint=input_mint,
                    output_mint=output_mint,
                    amount=amount,
                    source=source,
                    slippage_bps=slippage_bps
                )
        except ImportError:
            print("Session keys module not available, falling back to server keypair")
        except Exception as e:
            print(f"Session key trade failed: {e}, falling back to server keypair")

    # Fall back to server keypair (legacy mode)
    return execute_trade_logic(
        input_mint=input_mint,
        output_mint=output_mint,
        amount=amount,
        source=source,
        slippage_bps=slippage_bps,
        priority_fee=priority_fee
    )

def decimal_to_float(obj):
    """JSON encoder helper for Decimal types."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def notify_grid_error(bot_alias, error_type, error_msg, level_info=None):
    """Notify about grid bot errors via Discord and Socket.IO (Issue 2)."""
    try:
        fields = [
            {"name": "Bot", "value": str(bot_alias), "inline": True},
            {"name": "Error Type", "value": error_type, "inline": True},
        ]
        if level_info:
            fields.append({"name": "Level Info", "value": str(level_info), "inline": False})

        send_discord_notification(
            title=f"⚠️ GRID ERROR: {bot_alias}",
            message=str(error_msg)[:500],  # Truncate long errors
            color=0xFF0000,
            fields=fields
        )
    except Exception as e:
        print(f"Failed to send grid error notification: {e}")

    try:
        socketio.emit('bot_error', {
            'bot_alias': bot_alias,
            'error_type': error_type,
            'error_msg': str(error_msg),
            'level_info': level_info,
            'timestamp': time.time()
        }, namespace='/bots')
    except Exception as e:
        print(f"Failed to emit grid error socket event: {e}")

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
    """Process grid bot logic with proper concurrency control."""
    bot_id = bot['id']

    # Atomic check-and-add using lock
    with bot_processing_lock:
        if bot_id in in_flight_bots:
            return  # Already processing in this process
        in_flight_bots.add(bot_id)

    try:
        # Check DB-level flag (survives restarts)
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot or fresh_bot['status'] != 'active':
            return

        # Check if another process is handling this bot
        if fresh_bot.get('is_processing', 0) == 1:
            print(f"⚠️ Bot {bot_id} already processing (DB flag), skipping")
            return

        # Set DB processing flag BEFORE any operations
        db.set_bot_processing(bot_id, True)

        config = json.loads(fresh_bot['config_json'])
        state = json.loads(fresh_bot['state_json'])
        levels = state.get('grid_levels', [])
        changed = False

        bot_alias = config.get('alias') or bot_id
        # Configurable hysteresis - default 0.01% (0.0001)
        hysteresis_pct = Decimal(str(config.get('hysteresis', 0.0001)))
        current_price_d = Decimal(str(current_price))
        hysteresis = current_price_d * hysteresis_pct

        # Get configurable slippage (Issue 10) - default 50 bps (0.5%)
        slippage_bps = config.get('slippage_bps', 50)

        # Floor protection check (Issue 1)
        floor_price = config.get('floor_price')
        floor_action = config.get('floor_action', 'sell_all')
        if floor_price and not state.get('floor_triggered'):
            floor_price_d = Decimal(str(floor_price))
            if current_price_d <= floor_price_d:
                print(f"🚨 FLOOR STOP-LOSS TRIGGERED: {bot_alias} | Price: {current_price} <= Floor: {floor_price}")
                state['floor_triggered'] = True

                if floor_action == 'sell_all':
                    # Liquidate all positions with higher priority fee
                    for level in levels:
                        if level.get('has_position') and level.get('token_amount', 0) > 0:
                            try:
                                res = execute_trade_logic(
                                    fresh_bot['output_mint'],
                                    fresh_bot['input_mint'],
                                    level['token_amount'],
                                    f"Floor Stop-Loss @ {current_price:.2f}",
                                    slippage_bps=slippage_bps,
                                    priority_fee=0.005
                                )
                                realized_val = Decimal(str(res.get('usd_value', level['token_amount'] * current_price)))
                                cost_basis = Decimal(str(level.get('cost_usd', config['amount_per_level'])))
                                profit = realized_val - cost_basis
                                state['grid_yield'] = float(Decimal(str(state.get('grid_yield', 0))) + profit)
                                level['has_position'] = False
                                level['token_amount'] = 0
                                level['cost_usd'] = 0
                                changed = True
                            except Exception as e:
                                notify_grid_error(bot_alias, "FLOOR_LIQUIDATION", str(e), f"Level @ {level.get('price')}")

                    state['status'] = 'stopped'
                    notify_grid_error(bot_alias, "FLOOR_STOP_LOSS", f"Bot stopped. All positions liquidated at ${current_price:.4f}")

                elif floor_action == 'pause':
                    state['status'] = 'paused'
                    notify_grid_error(bot_alias, "FLOOR_PAUSE", f"Bot paused at ${current_price:.4f}. Floor: ${floor_price}")

                db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
                socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                return  # Exit early after floor action

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

        upper_bound = Decimal(str(config.get('upper_bound', 0)))
        if current_price_d >= (upper_bound + hysteresis):
            # Check for ANY level that still has a position and sell it
            for i, level in enumerate(levels):
                if level.get('has_position') and not level.get('pending_sell'):
                    print(f"🚀 GRID CEILING SELL TRIGGER: {bot_alias} | Level {i+1} @ {level['price']} (Price: {current_price})")
                    try:
                        token_amount = Decimal(str(level.get('token_amount', 0)))
                        if token_amount > 0:
                            level['has_position'] = False
                            level['pending_sell'] = True
                            # Save state immediately to prevent re-triggers
                            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)

                            res = execute_trade_logic(
                                fresh_bot['output_mint'],
                                fresh_bot['input_mint'],
                                float(token_amount),
                                f"Grid Ceiling Sell @ {level['price']:.2f}",
                                slippage_bps=slippage_bps,
                                priority_fee=0
                            )
                            realized_val = Decimal(str(res.get('usd_value', float(token_amount) * current_price)))
                            cost_basis = Decimal(str(level.get('cost_usd', config['amount_per_level'])))
                            profit = realized_val - cost_basis
                            state['grid_yield'] = float(Decimal(str(state.get('grid_yield', 0))) + profit)
                            state['profit_realized'] = state.get('grid_yield', 0)
                            state['run_count'] = state.get('run_count', 0) + 1
                            level['token_amount'] = 0
                            level['cost_usd'] = 0
                            level.pop('pending_sell', None)
                            changed = True
                            print(f"✅ GRID CEILING SELL SUCCESS: {bot_alias} | Profit: ${float(profit):.4f}")
                            # We don't break here, we might want to sell all levels above ceiling
                        else:
                            level['has_position'] = False # No tokens, just clear it
                    except Exception as e:
                        level['has_position'] = True  # Revert on failure
                        level.pop('pending_sell', None)
                        db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
                        notify_grid_error(bot_alias, "CEILING_SELL", str(e), f"Level {i+1} @ {level['price']}")

        for i in range(1, len(levels)):
            level = levels[i]
            prev_level = levels[i-1]
            level_price_d = Decimal(str(level['price']))
            prev_level_price_d = Decimal(str(prev_level['price']))

            # 1. SELL LOGIC
            if current_price_d >= (level_price_d + hysteresis) and level.get('has_position'):
                level['has_position'] = False
                level['pending_sell'] = True  # Mark as pending to prevent re-triggers

                token_amount = Decimal(str(level.get('token_amount', 0)))
                cost_basis = Decimal(str(level.get('cost_usd', config['amount_per_level'])))
                est_profit = (token_amount * current_price_d) - cost_basis

                print(f"🚀 GRID SELL TRIGGER: {bot_alias} | Level {i+1} @ {level['price']} (Price: {current_price})")
                print(f"DEBUG: Attempting to sell {float(token_amount):.4f} {fresh_bot['output_symbol']} for estimated profit ${float(est_profit):.4f}")
                try:
                    if token_amount <= 0:
                        print(f"⚠️ GRID SELL SKIPPED: {bot_alias} | Level {i+1} @ {level['price']} - No tokens to sell.")
                        level['has_position'] = True  # Revert has_position as no sell occurred
                        level.pop('pending_sell', None)
                        continue  # Skip to next level if no tokens to sell

                    # Save state immediately to prevent re-triggers during trade execution
                    db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)

                    res = execute_trade_logic(
                        fresh_bot['output_mint'],
                        fresh_bot['input_mint'],
                        float(token_amount),
                        f"Grid Sell @ {level['price']:.2f}",
                        slippage_bps=slippage_bps,
                        priority_fee=0
                    )

                    realized_val = Decimal(str(res.get('usd_value', float(token_amount) * current_price)))
                    profit = realized_val - cost_basis

                    state['grid_yield'] = float(Decimal(str(state.get('grid_yield', 0))) + profit)
                    state['profit_realized'] = state.get('grid_yield', 0)
                    state['run_count'] = state.get('run_count', 0) + 1
                    level['token_amount'] = 0
                    level['cost_usd'] = 0
                    level.pop('pending_sell', None)  # Clear pending flag on success
                    changed = True
                    print(f"✅ GRID SELL SUCCESS: {bot_alias} | Profit: ${float(profit):.4f}")
                    # Continue to check other levels (no break - allows multiple sells per tick)

                except Exception as e:
                    level['has_position'] = True
                    level.pop('pending_sell', None)  # Clear pending flag on failure
                    # Save state after failure to allow retry on next tick
                    db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
                    notify_grid_error(bot_alias, "SELL_EXECUTION", str(e), f"Level {i+1} @ {level['price']}")

            # 2. BUY LOGIC
            elif current_price_d <= (prev_level_price_d - hysteresis) and not level.get('has_position'):
                level['has_position'] = True
                level['pending_buy'] = True  # Mark as pending to prevent re-triggers

                # Save state immediately to prevent re-triggers during trade execution
                db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)

                amount_per_level = Decimal(str(config['amount_per_level']))
                print(f"🚀 GRID BUY TRIGGER: {bot_alias} | Level {i} @ {prev_level['price']} (Price: {current_price})")
                print(f"DEBUG: Attempting to buy with {float(amount_per_level):.4f} {fresh_bot['input_symbol']}")
                try:
                    res = execute_trade_logic(
                        fresh_bot['input_mint'],
                        fresh_bot['output_mint'],
                        float(amount_per_level),
                        f"Grid Buy @ {prev_level['price']:.2f}",
                        slippage_bps=slippage_bps,
                        priority_fee=0
                    )

                    level['token_amount'] = res.get('amount_out', float(amount_per_level / current_price_d))
                    # Get USD value - if not provided, calculate using input token price
                    if 'usd_value' in res:
                        level['cost_usd'] = res['usd_value']
                    else:
                        # Fallback: get input token price from cache
                        from extensions import price_cache, price_cache_lock
                        with price_cache_lock:
                            input_price = price_cache.get(fresh_bot['input_mint'], (1.0,))[0]  # Default to 1.0 for stables
                        level['cost_usd'] = float(amount_per_level * Decimal(str(input_price)))
                    level.pop('pending_buy', None)  # Clear pending flag on success
                    state['run_count'] = state.get('run_count', 0) + 1
                    changed = True
                    print(f"✅ GRID BUY SUCCESS: {bot_alias} | Amount: {level['token_amount']:.4f}")
                    # Continue to check other levels (no break - allows multiple buys per tick)

                except Exception as e:
                    level['has_position'] = False
                    level.pop('pending_buy', None)  # Clear pending flag on failure
                    # Save state after failure to allow retry on next tick
                    db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
                    notify_grid_error(bot_alias, "BUY_EXECUTION", str(e), f"Level {i} @ {prev_level['price']}")

        if changed:
            # Trailing grid logic with max cycles check (Issue 9)
            if config.get('trailing_enabled') and current_price >= config.get('upper_bound', 0):
                # Check if max trailing cycles reached
                trailing_max_cycles = config.get('trailing_max_cycles', 0)  # 0 = unlimited
                trailing_cycle_count = state.get('trailing_cycle_count', 0)

                if trailing_max_cycles == 0 or trailing_cycle_count < trailing_max_cycles:
                    step_size = (config['upper_bound'] - config['lower_bound']) / (config['steps'] - 1)
                    config['lower_bound'] += step_size
                    config['upper_bound'] += step_size
                    for lvl in state.get('grid_levels', []):
                        lvl['price'] += step_size
                    state['trailing_cycle_count'] = trailing_cycle_count + 1
                    socketio.emit('notification', {
                        'title': 'Grid Trailing Active',
                        'message': f"Bot {bot_alias} shifted up. Cycle {state['trailing_cycle_count']}/{trailing_max_cycles or '∞'}",
                        'type': 'info'
                    }, namespace='/bots')
                else:
                    # Max cycles reached, complete the bot
                    state['status'] = 'completed'
                    notify_bot_completion("GRID", bot_alias, state.get('profit_realized', 0))
                    socketio.emit('notification', {
                        'title': 'Grid Trailing Complete',
                        'message': f"Bot {bot_alias} completed {trailing_max_cycles} trailing cycles.",
                        'type': 'success'
                    }, namespace='/bots')

            all_sold = all(not l.get('has_position') for l in state.get('grid_levels', []))
            if all_sold and current_price >= config.get('upper_bound', 0) and not config.get('trailing_enabled'):
                state['status'] = 'completed'
                notify_bot_completion("GRID", bot_alias, state.get('profit_realized', 0))

            db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
            # Socket emit removed here, handled by internal_webhook for better efficiency

    except Exception as e:
        # Issue 2: Proper error notification instead of silent catch
        bot_alias = bot.get('id', 'unknown')
        try:
            config = json.loads(bot.get('config_json', '{}'))
            bot_alias = config.get('alias') or bot_alias
        except:
            pass
        notify_grid_error(bot_alias, "CRITICAL", str(e))
        print(f"❌ GRID LOGIC CRITICAL ERROR: {e}")
    finally:
        # Clear DB flag first, then memory
        try:
            db.set_bot_processing(bot_id, False)
        except Exception as e:
            print(f"Error clearing processing flag: {e}")
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
        if not fresh_bot:
            return

        # Skip if bot is currently processing a trade
        if fresh_bot.get('is_processing', 0) == 1:
            return  # Don't update performance during active trade

        config, state = json.loads(fresh_bot['config_json']), json.loads(fresh_bot['state_json'])
        if fresh_bot['type'] == 'GRID':
            grid_yield = Decimal(str(state.get('grid_yield', 0)))
            unrealized_pnl = Decimal('0')
            levels = state.get('grid_levels', [])
            
            for lvl in levels:
                if lvl.get('has_position'):
                    token_amount = Decimal(str(lvl.get('token_amount', 0)))
                    cost_usd = Decimal(str(lvl.get('cost_usd', 0)))
                    if token_amount > 0 and cost_usd > 0:
                        current_val = token_amount * Decimal(str(current_price))
                        unrealized_pnl += (current_val - cost_usd)
            
            # Total PNL = Realized (grid_yield) + Unrealized (current positions)
            state['profit_realized'] = float(grid_yield + unrealized_pnl)
        else:
            total_bought = Decimal(str(state.get('total_bought', 0)))
            total_cost = Decimal(str(state.get('total_cost', 0)))
            if total_bought > 0:
                current_val = total_bought * Decimal(str(current_price))
                state['profit_realized'] = float(current_val - total_cost)
            else:
                state['profit_realized'] = state.get('profit_realized', 0)
                
        db.save_bot(fresh_bot['id'], fresh_bot['type'], fresh_bot['input_mint'], fresh_bot['output_mint'], fresh_bot['input_symbol'], fresh_bot['output_symbol'], config, state)
    except Exception as e:
        print(f"Error updating bot performance: {e}")

def process_limit_grid_logic(bot):
    """Process limit grid bot logic with proper level mapping (Issue 3 rewrite)."""
    bot_alias = bot.get('id', 'unknown')
    try:
        config, state = json.loads(bot['config_json']), json.loads(bot['state_json'])
        bot_alias = config.get('alias') or bot_alias
        levels = state.get('grid_levels', [])

        if not levels:
            return

        # Get all open orders for the wallet
        from services.trading import get_open_limit_orders, create_limit_order
        open_orders = get_open_limit_orders()
        open_order_pubkeys = {o['publicKey'] for o in open_orders}

        changed = False
        slippage_bps = config.get('slippage_bps', 50)
        amount_per_level = Decimal(str(config['amount_per_level']))

        for idx, lvl in enumerate(levels):
            order_id = lvl.get('order_id')
            if not order_id:
                continue

            # If order is no longer in open orders, it was filled
            if order_id not in open_order_pubkeys:
                level_price = Decimal(str(lvl['price']))
                print(f"🔔 LIMIT GRID FILL DETECTED: {bot_alias} | Level {idx} @ ${float(level_price):.4f}")

                if lvl.get('has_position'):
                    # SELL ORDER WAS FILLED at lvl['price']
                    # Calculate realized profit
                    token_amount = Decimal(str(lvl.get('token_amount', 0)))
                    cost_basis = Decimal(str(lvl.get('cost_usd', float(amount_per_level))))
                    realized_val = token_amount * level_price
                    profit = realized_val - cost_basis

                    state['grid_yield'] = float(Decimal(str(state.get('grid_yield', 0))) + profit)
                    state['profit_realized'] = state.get('grid_yield', 0)
                    state['run_count'] = state.get('run_count', 0) + 1

                    lvl['has_position'] = False
                    lvl['token_amount'] = 0
                    lvl['cost_usd'] = 0
                    lvl['order_id'] = None
                    changed = True

                    print(f"✅ LIMIT GRID SELL FILLED: {bot_alias} | Profit: ${float(profit):.4f}")

                    # Re-queue: Place BUY order at the level BELOW (idx-1)
                    if idx > 0:
                        buy_level = levels[idx - 1]
                        buy_price = Decimal(str(buy_level['price']))
                        if not buy_level.get('order_id'):  # Only if no existing order
                            try:
                                new_order = create_limit_order(
                                    bot['input_mint'],
                                    bot['output_mint'],
                                    float(amount_per_level),
                                    float(buy_price)
                                )
                                buy_level['order_id'] = new_order.get('orderAddress')
                                print(f"📝 LIMIT GRID BUY QUEUED: {bot_alias} | Level {idx-1} @ ${float(buy_price):.4f}")
                            except Exception as e:
                                notify_grid_error(bot_alias, "LIMIT_REQUEUE_BUY", str(e), f"Level {idx-1} @ {float(buy_price):.4f}")
                else:
                    # BUY ORDER WAS FILLED at lvl['price']
                    # We bought tokens, calculate token amount received
                    estimated_tokens = float(amount_per_level / level_price)

                    lvl['has_position'] = True
                    lvl['token_amount'] = estimated_tokens
                    lvl['cost_usd'] = float(amount_per_level)
                    lvl['order_id'] = None
                    state['run_count'] = state.get('run_count', 0) + 1
                    changed = True

                    print(f"✅ LIMIT GRID BUY FILLED: {bot_alias} | Got ~{estimated_tokens:.4f} tokens")

                    # Re-queue: Place SELL order at the level ABOVE (idx+1)
                    if idx < len(levels) - 1:
                        sell_level = levels[idx + 1]
                        sell_price = Decimal(str(sell_level['price']))
                        if not sell_level.get('order_id') and lvl.get('token_amount', 0) > 0:
                            try:
                                # For SELL: input is tokens, output is USDC/SOL
                                # Price is tokens per USDC (inverse of USDC per token)
                                new_order = create_limit_order(
                                    bot['output_mint'],  # Selling tokens
                                    bot['input_mint'],   # Getting USDC/SOL
                                    lvl['token_amount'],
                                    1 / float(sell_price)  # Price in output units
                                )
                                sell_level['order_id'] = new_order.get('orderAddress')
                                # Move position tracking to sell level
                                sell_level['has_position'] = True
                                sell_level['token_amount'] = lvl['token_amount']
                                sell_level['cost_usd'] = lvl['cost_usd']
                                lvl['has_position'] = False
                                lvl['token_amount'] = 0
                                lvl['cost_usd'] = 0
                                print(f"📝 LIMIT GRID SELL QUEUED: {bot_alias} | Level {idx+1} @ ${float(sell_price):.4f}")
                            except Exception as e:
                                notify_grid_error(bot_alias, "LIMIT_REQUEUE_SELL", str(e), f"Level {idx+1} @ {float(sell_price):.4f}")

        if changed:
            db.save_bot(bot['id'], bot['type'], bot['input_mint'], bot['output_mint'], bot['input_symbol'], bot['output_symbol'], config, state)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

    except Exception as e:
        notify_grid_error(bot_alias, "LIMIT_GRID_CRITICAL", str(e))
        print(f"❌ LIMIT GRID WATCHER ERROR: {e}")

def process_bot_safe(app, bot):
    """Process a single bot with Flask app context (for ThreadPoolExecutor)."""
    try:
        with app.app_context():
            from extensions import price_cache, price_cache_lock

            if bot['type'] in ['DCA', 'TWAP', 'VWAP']:
                # Issue 6: Use price_cache_lock for thread safety
                with price_cache_lock:
                    current_price = price_cache.get(bot['output_mint'], (0,))[0]
                process_twap_logic(bot, current_price)
            elif bot['type'] == 'LIMIT_GRID':
                process_limit_grid_logic(bot)
    except Exception as e:
        bot_alias = bot.get('id', 'unknown')
        try:
            config = json.loads(bot.get('config_json', '{}'))
            bot_alias = config.get('alias') or bot_alias
        except:
            pass
        notify_grid_error(bot_alias, "SCHEDULER", str(e))

def dca_scheduler(app):
    """DCA/TWAP/LIMIT_GRID scheduler with concurrent bot processing (Issue 5)."""
    while True:
        try:
            with app.app_context():
                active_bots = [bot for bot in db.get_all_bots() if bot['status'] == 'active' and bot['type'] in ['DCA', 'TWAP', 'VWAP', 'LIMIT_GRID']]

                if active_bots:
                    # Issue 5: Use ThreadPoolExecutor for concurrent processing
                    futures = [BOT_EXECUTOR.submit(process_bot_safe, app, bot) for bot in active_bots]
                    for future in as_completed(futures, timeout=30):
                        try:
                            future.result()
                        except Exception as e:
                            print(f"Bot processing error: {e}")
        except Exception as e:
            print(f"DCA Scheduler error: {e}")
        time.sleep(15)  # Poll limit orders every 15s
