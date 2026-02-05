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


class BotTradeError(Exception):
    """Raised when a bot trade fails and should not fall back."""
    pass


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

    SECURITY: No longer silently falls back to server keypair.
    If user_wallet is specified and session key fails, the trade is rejected.

    Args:
        user_wallet: If provided, REQUIRES session key delegation for this browser wallet.
                    If session key unavailable or fails, raises BotTradeError.
                    If None, uses server keypair (for server-owned bots).
    """
    # Session key mode for browser wallet bots
    if user_wallet:
        try:
            from services.session_keys import get_session_keypair, execute_trade_with_session_key, SessionPermissionError
            keypair = get_session_keypair(user_wallet)
            if not keypair:
                raise BotTradeError(
                    f"No active session key for wallet {user_wallet[:8]}... "
                    "Session may have expired. Please reconnect your wallet."
                )

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
            raise BotTradeError("Session keys module not available")
        except SessionPermissionError as e:
            raise BotTradeError(f"Session permission denied: {e}")
        except BotTradeError:
            raise  # Re-raise our own errors
        except Exception as e:
            raise BotTradeError(f"Session key trade failed: {e}")

    # Server keypair mode (for bots not linked to a browser wallet)
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

def notify_twap_error(bot_alias, error_type, error_msg, run_info=None):
    """Notify about TWAP/DCA bot errors via Discord and Socket.IO."""
    try:
        fields = [
            {"name": "Bot", "value": str(bot_alias), "inline": True},
            {"name": "Error Type", "value": error_type, "inline": True},
        ]
        if run_info:
            fields.append({"name": "Run Info", "value": str(run_info), "inline": False})

        send_discord_notification(
            title=f"⚠️ TWAP ERROR: {bot_alias}",
            message=str(error_msg)[:500],
            color=0xFF6600,  # Orange for TWAP
            fields=fields
        )
    except Exception as e:
        print(f"Failed to send TWAP error notification: {e}")

    try:
        socketio.emit('bot_error', {
            'bot_alias': bot_alias,
            'error_type': error_type,
            'error_msg': str(error_msg),
            'run_info': run_info,
            'timestamp': time.time()
        }, namespace='/bots')
    except Exception as e:
        print(f"Failed to emit TWAP error socket event: {e}")

def notify_vwap_error(bot_alias, error_type, error_msg, run_info=None):
    """Notify about VWAP bot errors via Discord and Socket.IO."""
    try:
        fields = [
            {"name": "Bot", "value": str(bot_alias), "inline": True},
            {"name": "Error Type", "value": error_type, "inline": True},
        ]
        if run_info:
            fields.append({"name": "Run Info", "value": str(run_info), "inline": False})

        send_discord_notification(
            title=f"⚠️ VWAP ERROR: {bot_alias}",
            message=str(error_msg)[:500],
            color=0x00CED1,  # Cyan for VWAP
            fields=fields
        )
    except Exception as e:
        print(f"Failed to send VWAP error notification: {e}")

    try:
        socketio.emit('bot_error', {
            'bot_alias': bot_alias,
            'error_type': error_type,
            'error_msg': str(error_msg),
            'run_info': run_info,
            'timestamp': time.time()
        }, namespace='/bots')
    except Exception as e:
        print(f"Failed to emit VWAP error socket event: {e}")

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
            # Bidirectional trailing grid logic with max cycles check
            if config.get('trailing_enabled'):
                trailing_max_cycles = config.get('trailing_max_cycles', 0)  # 0 = unlimited
                trailing_cycle_count = state.get('trailing_cycle_count', 0)
                step_size = (config['upper_bound'] - config['lower_bound']) / (config['steps'] - 1)
                trail_direction = None

                # Trail UP when price breaks above upper bound
                if current_price >= config.get('upper_bound', 0):
                    trail_direction = 'up'
                # Trail DOWN when price breaks below lower bound
                elif current_price <= config.get('lower_bound', 0):
                    trail_direction = 'down'

                if trail_direction:
                    if trailing_max_cycles == 0 or trailing_cycle_count < trailing_max_cycles:
                        if trail_direction == 'up':
                            config['lower_bound'] += step_size
                            config['upper_bound'] += step_size
                            for lvl in state.get('grid_levels', []):
                                lvl['price'] += step_size
                        else:  # down
                            config['lower_bound'] -= step_size
                            config['upper_bound'] -= step_size
                            for lvl in state.get('grid_levels', []):
                                lvl['price'] -= step_size

                        state['trailing_cycle_count'] = trailing_cycle_count + 1
                        socketio.emit('notification', {
                            'title': 'Grid Trailing Active',
                            'message': f"Bot {bot_alias} shifted {trail_direction}. Cycle {state['trailing_cycle_count']}/{trailing_max_cycles or '∞'}",
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
    """Process TWAP/DCA bot logic with proper concurrency control."""
    bot_id = bot['id']

    # Atomic check-and-add using lock
    with bot_processing_lock:
        if bot_id in in_flight_bots:
            return  # Already processing in this process
        in_flight_bots.add(bot_id)

    try:
        # Fetch fresh state from DB
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot or fresh_bot['status'] != 'active':
            return

        # Check DB-level processing flag
        if fresh_bot.get('is_processing', 0) == 1:
            print(f"⚠️ Bot {bot_id} already processing (DB flag), skipping")
            return

        # Set processing flag
        db.set_bot_processing(bot_id, True)

        config = json.loads(fresh_bot['config_json'])
        state = json.loads(fresh_bot['state_json'])
        bot_alias = config.get('alias') or bot_id
        slippage_bps = config.get('slippage_bps', 50)
        user_wallet = fresh_bot.get('user_wallet')

        # Validate price
        if current_price <= 0:
            print(f"⚠️ TWAP {bot_alias}: Invalid price {current_price}, skipping")
            return

        # --- STOP-LOSS CHECK ---
        stop_loss_pct = config.get('stop_loss_pct')
        if stop_loss_pct and not state.get('stop_triggered'):
            avg_price = state.get('avg_buy_price', 0)
            total_tokens = state.get('total_bought', 0)

            if avg_price > 0 and total_tokens > 0:
                stop_price = avg_price * (1 - (stop_loss_pct / 100))

                if current_price <= stop_price:
                    print(f"🚨 STOP-LOSS TRIGGERED: {bot_alias} | Price: {current_price:.4f} <= Stop: {stop_price:.4f}")
                    state['stop_triggered'] = True
                    stop_action = config.get('stop_loss_action', 'sell_all')

                    if stop_action == 'sell_all':
                        try:
                            res = execute_bot_trade(
                                fresh_bot['output_mint'], fresh_bot['input_mint'],
                                total_tokens, f"TWAP Stop-Loss @ {current_price:.4f}",
                                slippage_bps=slippage_bps, priority_fee=0.005,
                                user_wallet=user_wallet
                            )
                            state['status'] = 'stopped'
                            state['profit_realized'] = res.get('usd_value', 0) - state.get('total_cost', 0)
                            notify_twap_error(bot_alias, "STOP_LOSS_EXIT",
                                              f"Liquidated at ${current_price:.4f}. P&L: ${state['profit_realized']:.2f}")
                        except Exception as e:
                            notify_twap_error(bot_alias, "STOP_LOSS_FAILED", str(e))
                    else:  # pause
                        state['status'] = 'paused'
                        notify_twap_error(bot_alias, "STOP_LOSS_PAUSE",
                                          f"Paused at ${current_price:.4f}. Stop: ${stop_price:.4f}")

                    db.save_bot(fresh_bot['id'], fresh_bot['type'],
                                fresh_bot['input_mint'], fresh_bot['output_mint'],
                                fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                                config, state, user_wallet)
                    socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                    return

        # --- TAKE-PROFIT MONITORING PHASE ---
        if state.get('phase') == 'monitoring_profit':
            avg_price = state.get('avg_buy_price', 0)
            take_profit_pct = config.get('take_profit')

            if avg_price > 0 and take_profit_pct and take_profit_pct > 0:
                target_price = avg_price * (1 + (take_profit_pct / 100))

                if current_price >= target_price:
                    total_tokens = state.get('total_bought', 0)
                    if total_tokens > 0:
                        try:
                            res = execute_bot_trade(
                                fresh_bot['output_mint'], fresh_bot['input_mint'],
                                total_tokens, "TWAP Take-Profit Exit",
                                slippage_bps=slippage_bps, priority_fee=0.005,
                                user_wallet=user_wallet
                            )
                            state['status'] = 'completed'
                            state['phase'] = 'completed'
                            state['profit_realized'] = res.get('usd_value', 0) - state.get('total_cost', 0)
                            socketio.emit('notification', {
                                'title': 'Take-Profit Hit',
                                'message': f"Sold {total_tokens:.4f} {fresh_bot['output_symbol']} @ ${current_price:.2f}",
                                'type': 'success'
                            }, namespace='/bots')
                            notify_bot_completion("TWAP", fresh_bot['output_symbol'], state['profit_realized'])
                            db.save_bot(fresh_bot['id'], fresh_bot['type'],
                                        fresh_bot['input_mint'], fresh_bot['output_mint'],
                                        fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                                        config, state, user_wallet)
                            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                        except Exception as e:
                            notify_twap_error(bot_alias, "TAKE_PROFIT_EXIT", str(e),
                                              f"Attempted to sell {total_tokens:.4f} tokens")
            return

        # --- REGULAR EXECUTION PHASE ---
        now = time.time()
        if now >= state.get('next_run', 0):
            try:
                res = execute_bot_trade(
                    fresh_bot['input_mint'], fresh_bot['output_mint'],
                    config['amount'], f"{fresh_bot['type']} Execution",
                    slippage_bps=slippage_bps, priority_fee=0,
                    user_wallet=user_wallet
                )
                state['run_count'] += 1
                state['total_cost'] += res.get('usd_value', 0)
                state['total_bought'] += res.get('amount_out', 0)

                if state['total_bought'] > 0:
                    state['avg_buy_price'] = state['total_cost'] / state['total_bought']

                if config.get('max_runs') and state['run_count'] >= config['max_runs']:
                    if config.get('take_profit') and config['take_profit'] > 0:
                        state['phase'] = 'monitoring_profit'
                    else:
                        state['status'] = 'completed'
                        notify_bot_completion(fresh_bot['type'], fresh_bot['output_symbol'],
                                              state.get('profit_realized', 0))
                else:
                    state['next_run'] = now + (config['interval'] * 60)

                db.save_bot(fresh_bot['id'], fresh_bot['type'],
                            fresh_bot['input_mint'], fresh_bot['output_mint'],
                            fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                            config, state, user_wallet)
                socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

            except Exception as e:
                notify_twap_error(bot_alias, "EXECUTION", str(e),
                                  f"Run {state['run_count']+1}/{config.get('max_runs', '∞')}")
                state['next_run'] = now + 60
                # Save state so retry delay persists across restarts
                db.save_bot(fresh_bot['id'], fresh_bot['type'],
                            fresh_bot['input_mint'], fresh_bot['output_mint'],
                            fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                            config, state, user_wallet)

    except Exception as e:
        bot_alias = bot.get('id', 'unknown')
        try:
            config = json.loads(bot.get('config_json', '{}'))
            bot_alias = config.get('alias') or bot_alias
        except:
            pass
        notify_twap_error(bot_alias, "CRITICAL", str(e))
        print(f"❌ TWAP LOGIC CRITICAL ERROR: {e}")

    finally:
        try:
            db.set_bot_processing(bot_id, False)
        except Exception as e:
            print(f"Error clearing processing flag: {e}")
        in_flight_bots.discard(bot_id)

def process_vwap_logic(bot, current_price):
    """Process VWAP bot logic with volume-weighted execution amounts."""
    from datetime import datetime
    from services.volume import get_vwap_for_token, calculate_vwap_execution_amount

    bot_id = bot['id']

    # Atomic check-and-add using lock
    with bot_processing_lock:
        if bot_id in in_flight_bots:
            return  # Already processing in this process
        in_flight_bots.add(bot_id)

    try:
        # Fetch fresh state from DB
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot or fresh_bot['status'] != 'active':
            return

        # Check DB-level processing flag
        if fresh_bot.get('is_processing', 0) == 1:
            print(f"⚠️ VWAP Bot {bot_id} already processing (DB flag), skipping")
            return

        # Set processing flag
        db.set_bot_processing(bot_id, True)

        config = json.loads(fresh_bot['config_json'])
        state = json.loads(fresh_bot['state_json'])
        bot_alias = config.get('alias') or bot_id
        slippage_bps = config.get('slippage_bps', 50)
        user_wallet = fresh_bot.get('user_wallet')

        # VWAP-specific config
        vwap_window = config.get('vwap_window', 24)
        max_deviation_pct = config.get('max_deviation_pct', 0)
        duration_hours = config.get('duration_hours', 24)
        interval_minutes = config.get('interval', 15)
        runs_per_hour = 60 // interval_minutes if interval_minutes > 0 else 4
        total_amount = config.get('total_amount', 0)

        # Validate price
        if current_price <= 0:
            print(f"⚠️ VWAP {bot_alias}: Invalid price {current_price}, skipping")
            return

        # --- FETCH VWAP AND VOLUME PROFILE ---
        vwap_price, hourly_weights = get_vwap_for_token(fresh_bot['output_mint'], vwap_window)

        # Store VWAP data in state for UI display
        state['current_vwap'] = vwap_price
        state['volume_profile'] = hourly_weights

        # --- MAX DEVIATION CHECK ---
        if max_deviation_pct > 0 and vwap_price > 0:
            deviation = abs(current_price - vwap_price) / vwap_price * 100
            state['price_deviation'] = deviation

            if deviation > max_deviation_pct:
                print(f"⏸️ VWAP {bot_alias}: Price deviation {deviation:.2f}% > max {max_deviation_pct}%, skipping execution")
                # Save state to persist deviation info
                db.save_bot(fresh_bot['id'], fresh_bot['type'],
                            fresh_bot['input_mint'], fresh_bot['output_mint'],
                            fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                            config, state, user_wallet)
                return

        # --- STOP-LOSS CHECK ---
        stop_loss_pct = config.get('stop_loss_pct')
        if stop_loss_pct and not state.get('stop_triggered'):
            avg_price = state.get('avg_buy_price', 0)
            total_tokens = state.get('total_bought', 0)

            if avg_price > 0 and total_tokens > 0:
                stop_price = avg_price * (1 - (stop_loss_pct / 100))

                if current_price <= stop_price:
                    print(f"🚨 VWAP STOP-LOSS TRIGGERED: {bot_alias} | Price: {current_price:.4f} <= Stop: {stop_price:.4f}")
                    state['stop_triggered'] = True
                    stop_action = config.get('stop_loss_action', 'sell_all')

                    if stop_action == 'sell_all':
                        try:
                            res = execute_bot_trade(
                                fresh_bot['output_mint'], fresh_bot['input_mint'],
                                total_tokens, f"VWAP Stop-Loss @ {current_price:.4f}",
                                slippage_bps=slippage_bps, priority_fee=0.005,
                                user_wallet=user_wallet
                            )
                            state['status'] = 'stopped'
                            state['profit_realized'] = res.get('usd_value', 0) - state.get('total_cost', 0)
                            notify_vwap_error(bot_alias, "STOP_LOSS_EXIT",
                                              f"Liquidated at ${current_price:.4f}. P&L: ${state['profit_realized']:.2f}")
                        except Exception as e:
                            notify_vwap_error(bot_alias, "STOP_LOSS_FAILED", str(e))
                    else:  # pause
                        state['status'] = 'paused'
                        notify_vwap_error(bot_alias, "STOP_LOSS_PAUSE",
                                          f"Paused at ${current_price:.4f}. Stop: ${stop_price:.4f}")

                    db.save_bot(fresh_bot['id'], fresh_bot['type'],
                                fresh_bot['input_mint'], fresh_bot['output_mint'],
                                fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                                config, state, user_wallet)
                    socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                    return

        # --- TAKE-PROFIT MONITORING PHASE ---
        if state.get('phase') == 'monitoring_profit':
            avg_price = state.get('avg_buy_price', 0)
            take_profit_pct = config.get('take_profit')

            if avg_price > 0 and take_profit_pct and take_profit_pct > 0:
                target_price = avg_price * (1 + (take_profit_pct / 100))

                if current_price >= target_price:
                    total_tokens = state.get('total_bought', 0)
                    if total_tokens > 0:
                        try:
                            res = execute_bot_trade(
                                fresh_bot['output_mint'], fresh_bot['input_mint'],
                                total_tokens, "VWAP Take-Profit Exit",
                                slippage_bps=slippage_bps, priority_fee=0.005,
                                user_wallet=user_wallet
                            )
                            state['status'] = 'completed'
                            state['phase'] = 'completed'
                            state['profit_realized'] = res.get('usd_value', 0) - state.get('total_cost', 0)
                            socketio.emit('notification', {
                                'title': 'VWAP Take-Profit Hit',
                                'message': f"Sold {total_tokens:.4f} {fresh_bot['output_symbol']} @ ${current_price:.2f}",
                                'type': 'success'
                            }, namespace='/bots')
                            notify_bot_completion("VWAP", fresh_bot['output_symbol'], state['profit_realized'])
                            db.save_bot(fresh_bot['id'], fresh_bot['type'],
                                        fresh_bot['input_mint'], fresh_bot['output_mint'],
                                        fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                                        config, state, user_wallet)
                            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')
                        except Exception as e:
                            notify_vwap_error(bot_alias, "TAKE_PROFIT_EXIT", str(e),
                                              f"Attempted to sell {total_tokens:.4f} tokens")
            return

        # --- REGULAR EXECUTION PHASE ---
        now = time.time()
        if now >= state.get('next_run', 0):
            try:
                # Calculate volume-weighted execution amount
                current_hour = datetime.utcnow().hour
                weighted_amount = calculate_vwap_execution_amount(
                    total_amount=total_amount,
                    hourly_weights=hourly_weights,
                    current_hour=current_hour,
                    duration_hours=duration_hours,
                    runs_per_hour=runs_per_hour
                )

                # Store execution info for logging
                state['last_weighted_amount'] = weighted_amount
                state['last_hour_weight'] = hourly_weights[current_hour]

                print(f"📊 VWAP {bot_alias}: Executing {weighted_amount:.6f} (hour {current_hour}, weight {hourly_weights[current_hour]:.4f})")

                res = execute_bot_trade(
                    fresh_bot['input_mint'], fresh_bot['output_mint'],
                    weighted_amount, f"VWAP Execution (h{current_hour})",
                    slippage_bps=slippage_bps, priority_fee=0,
                    user_wallet=user_wallet
                )
                state['run_count'] += 1
                state['total_cost'] += res.get('usd_value', 0)
                state['total_bought'] += res.get('amount_out', 0)

                if state['total_bought'] > 0:
                    state['avg_buy_price'] = state['total_cost'] / state['total_bought']

                if config.get('max_runs') and state['run_count'] >= config['max_runs']:
                    if config.get('take_profit') and config['take_profit'] > 0:
                        state['phase'] = 'monitoring_profit'
                    else:
                        state['status'] = 'completed'
                        notify_bot_completion("VWAP", fresh_bot['output_symbol'],
                                              state.get('profit_realized', 0))
                else:
                    state['next_run'] = now + (interval_minutes * 60)

                db.save_bot(fresh_bot['id'], fresh_bot['type'],
                            fresh_bot['input_mint'], fresh_bot['output_mint'],
                            fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                            config, state, user_wallet)
                socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

            except Exception as e:
                notify_vwap_error(bot_alias, "EXECUTION", str(e),
                                  f"Run {state['run_count']+1}/{config.get('max_runs', '∞')}")
                state['next_run'] = now + 60
                # Save state so retry delay persists across restarts
                db.save_bot(fresh_bot['id'], fresh_bot['type'],
                            fresh_bot['input_mint'], fresh_bot['output_mint'],
                            fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                            config, state, user_wallet)

    except Exception as e:
        bot_alias = bot.get('id', 'unknown')
        try:
            config = json.loads(bot.get('config_json', '{}'))
            bot_alias = config.get('alias') or bot_alias
        except:
            pass
        notify_vwap_error(bot_alias, "CRITICAL", str(e))
        print(f"❌ VWAP LOGIC CRITICAL ERROR: {e}")

    finally:
        try:
            db.set_bot_processing(bot_id, False)
        except Exception as e:
            print(f"Error clearing processing flag: {e}")
        in_flight_bots.discard(bot_id)

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

def notify_indicator_error(bot_alias, error_type, error_msg, run_info=None):
    """Notify about indicator bot errors via Discord and Socket.IO."""
    try:
        fields = [
            {"name": "Bot", "value": str(bot_alias), "inline": True},
            {"name": "Error Type", "value": error_type, "inline": True},
        ]
        if run_info:
            fields.append({"name": "Run Info", "value": str(run_info), "inline": False})

        send_discord_notification(
            title=f"⚠️ INDICATOR BOT ERROR: {bot_alias}",
            message=str(error_msg)[:500],
            color=0x9B59B6,  # Purple for indicator bots
            fields=fields
        )
    except Exception as e:
        print(f"Failed to send indicator bot error notification: {e}")

    try:
        socketio.emit('bot_error', {
            'bot_alias': bot_alias,
            'error_type': error_type,
            'error_msg': str(error_msg),
            'run_info': run_info,
            'timestamp': time.time()
        }, namespace='/bots')
    except Exception as e:
        print(f"Failed to emit indicator bot error socket event: {e}")


def process_indicator_bot_logic(bot, current_price):
    """Process indicator-based bot logic (RSI, MACD, BB, EMA Cross, Multi)."""
    from services.strategies import process_indicator_bot, is_indicator_bot, INDICATOR_BOT_TYPES

    bot_id = bot['id']

    # Atomic check-and-add using lock
    with bot_processing_lock:
        if bot_id in in_flight_bots:
            return  # Already processing in this process
        in_flight_bots.add(bot_id)

    try:
        # Fetch fresh state from DB
        fresh_bot = db.get_bot(bot_id)
        if not fresh_bot or fresh_bot['status'] != 'active':
            return

        # Check DB-level processing flag
        if fresh_bot.get('is_processing', 0) == 1:
            print(f"⚠️ Indicator Bot {bot_id} already processing (DB flag), skipping")
            return

        # Set processing flag
        db.set_bot_processing(bot_id, True)

        config = json.loads(fresh_bot['config_json'])
        state = json.loads(fresh_bot['state_json'])
        bot_alias = config.get('alias') or bot_id
        slippage_bps = config.get('slippage_bps', 50)
        user_wallet = fresh_bot.get('user_wallet')

        # Validate price
        if current_price <= 0:
            print(f"⚠️ {fresh_bot['type']} {bot_alias}: Invalid price {current_price}, skipping")
            return

        # Get trade signal from strategy
        signal = process_indicator_bot(fresh_bot, current_price)

        if signal is None:
            # No trade signal, just update last check time
            state['last_check'] = time.time()
            db.save_bot(fresh_bot['id'], fresh_bot['type'],
                        fresh_bot['input_mint'], fresh_bot['output_mint'],
                        fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                        config, state, user_wallet)
            return

        # Execute trade based on signal
        action = signal.get('action')
        amount = signal.get('amount', 0)
        reason = signal.get('reason', '')

        if amount <= 0:
            print(f"⚠️ {fresh_bot['type']} {bot_alias}: Signal has zero amount, skipping")
            return

        print(f"📊 {fresh_bot['type']} {bot_alias}: {action.upper()} signal - {reason}")

        try:
            if action == 'buy':
                # Buy: input_mint (USDC/SOL) -> output_mint (token)
                res = execute_bot_trade(
                    fresh_bot['input_mint'], fresh_bot['output_mint'],
                    amount, f"{fresh_bot['type']} {reason}",
                    slippage_bps=slippage_bps, priority_fee=0,
                    user_wallet=user_wallet
                )

                # Update position state
                tokens_received = res.get('amount_out', 0)
                state['position'] = 'long'
                state['position_amount'] = tokens_received
                state['entry_price'] = current_price
                state['entry_cost'] = res.get('usd_value', amount)
                state['last_trade_time'] = time.time()
                state['run_count'] = state.get('run_count', 0) + 1
                state['total_cost'] = state.get('total_cost', 0) + res.get('usd_value', amount)
                state['total_bought'] = state.get('total_bought', 0) + tokens_received

                print(f"✅ {fresh_bot['type']} BUY SUCCESS: {bot_alias} | Got {tokens_received:.6f} tokens @ ${current_price:.4f}")

                socketio.emit('notification', {
                    'title': f'{fresh_bot["type"]} Buy Executed',
                    'message': f"{bot_alias}: {reason}",
                    'type': 'success'
                }, namespace='/bots')

            elif action == 'sell':
                # Sell: output_mint (token) -> input_mint (USDC/SOL)
                res = execute_bot_trade(
                    fresh_bot['output_mint'], fresh_bot['input_mint'],
                    amount, f"{fresh_bot['type']} {reason}",
                    slippage_bps=slippage_bps, priority_fee=0,
                    user_wallet=user_wallet
                )

                # Calculate profit
                entry_cost = state.get('entry_cost', 0)
                sell_value = res.get('usd_value', amount * current_price)
                profit = sell_value - entry_cost

                # Update position state
                state['position'] = 'none'
                state['position_amount'] = 0
                state['last_trade_time'] = time.time()
                state['run_count'] = state.get('run_count', 0) + 1
                state['profit_realized'] = state.get('profit_realized', 0) + profit

                print(f"✅ {fresh_bot['type']} SELL SUCCESS: {bot_alias} | Profit: ${profit:.4f}")

                socketio.emit('notification', {
                    'title': f'{fresh_bot["type"]} Sell Executed',
                    'message': f"{bot_alias}: {reason} | P&L: ${profit:.2f}",
                    'type': 'success' if profit >= 0 else 'warning'
                }, namespace='/bots')

            # Save updated state
            db.save_bot(fresh_bot['id'], fresh_bot['type'],
                        fresh_bot['input_mint'], fresh_bot['output_mint'],
                        fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                        config, state, user_wallet)
            socketio.emit('bots_update', {'bots': get_formatted_bots()}, namespace='/bots')

        except BotTradeError as e:
            notify_indicator_error(bot_alias, "TRADE_EXECUTION", str(e),
                                   f"{action.upper()}: {reason}")
        except Exception as e:
            notify_indicator_error(bot_alias, "EXECUTION", str(e),
                                   f"Run {state.get('run_count', 0)+1}")
            # Save state with error info
            state['last_error'] = str(e)
            state['last_error_time'] = time.time()
            db.save_bot(fresh_bot['id'], fresh_bot['type'],
                        fresh_bot['input_mint'], fresh_bot['output_mint'],
                        fresh_bot['input_symbol'], fresh_bot['output_symbol'],
                        config, state, user_wallet)

    except Exception as e:
        bot_alias = bot.get('id', 'unknown')
        try:
            config = json.loads(bot.get('config_json', '{}'))
            bot_alias = config.get('alias') or bot_alias
        except:
            pass
        notify_indicator_error(bot_alias, "CRITICAL", str(e))
        print(f"❌ INDICATOR BOT LOGIC CRITICAL ERROR: {e}")

    finally:
        try:
            db.set_bot_processing(bot_id, False)
        except Exception as e:
            print(f"Error clearing processing flag: {e}")
        in_flight_bots.discard(bot_id)


def process_bot_safe(app, bot):
    """Process a single bot with Flask app context (for ThreadPoolExecutor)."""
    try:
        with app.app_context():
            from extensions import price_cache, price_cache_lock
            from services.strategies import INDICATOR_BOT_TYPES

            if bot['type'] in ['DCA', 'TWAP']:
                # Issue 6: Use price_cache_lock for thread safety
                with price_cache_lock:
                    current_price = price_cache.get(bot['output_mint'], (0,))[0]
                process_twap_logic(bot, current_price)
            elif bot['type'] == 'VWAP':
                # VWAP uses dedicated logic with volume-weighted execution
                with price_cache_lock:
                    current_price = price_cache.get(bot['output_mint'], (0,))[0]
                process_vwap_logic(bot, current_price)
            elif bot['type'] == 'LIMIT_GRID':
                process_limit_grid_logic(bot)
            elif bot['type'] in INDICATOR_BOT_TYPES:
                # Indicator-based strategies (RSI, MACD, BB, EMA Cross, Multi)
                with price_cache_lock:
                    current_price = price_cache.get(bot['output_mint'], (0,))[0]
                process_indicator_bot_logic(bot, current_price)
    except Exception as e:
        bot_alias = bot.get('id', 'unknown')
        try:
            config = json.loads(bot.get('config_json', '{}'))
            bot_alias = config.get('alias') or bot_alias
        except:
            pass
        notify_grid_error(bot_alias, "SCHEDULER", str(e))

def dca_scheduler(app):
    """DCA/TWAP/LIMIT_GRID/Indicator scheduler with concurrent bot processing (Issue 5)."""
    from services.strategies import INDICATOR_BOT_TYPES

    # All supported bot types
    SUPPORTED_BOT_TYPES = {'DCA', 'TWAP', 'VWAP', 'LIMIT_GRID'} | INDICATOR_BOT_TYPES

    while True:
        try:
            with app.app_context():
                active_bots = [
                    bot for bot in db.get_all_bots()
                    if bot['status'] == 'active' and bot['type'] in SUPPORTED_BOT_TYPES
                ]

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
        time.sleep(15)  # Poll every 15s
