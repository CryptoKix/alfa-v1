#!/usr/bin/env python3
"""Meteora DLMM API routes."""

import time
import base64
import logging
from flask import Blueprint, jsonify, request

import sio_bridge
from extensions import db
from services.meteora_dlmm import DLMMClient, StrategyCalculator, RiskProfile, PositionManager
from services.meteora_dlmm.strategy_calculator import StrategyType

logger = logging.getLogger("tactix.dlmm.routes")

dlmm_bp = Blueprint('dlmm', __name__)

# Initialize services
dlmm_client = DLMMClient()
position_manager = None  # Initialized by init_dlmm_services()


def init_dlmm_services():
    """Initialize DLMM services."""
    global position_manager
    position_manager = PositionManager(db, dlmm_client)


# ==================== Pool Routes ====================

@dlmm_bp.route('/api/dlmm/pools')
def api_dlmm_pools():
    """Get all DLMM pools."""
    try:
        refresh = request.args.get('refresh', 'false').lower() == 'true'
        pools = dlmm_client.get_all_pools(refresh=refresh)

        # Optional filtering
        min_liquidity = request.args.get('min_liquidity', type=float)
        min_apr = request.args.get('min_apr', type=float)
        search = request.args.get('search', '').lower()

        filtered_pools = pools
        if min_liquidity:
            filtered_pools = [p for p in filtered_pools if p.liquidity >= min_liquidity]
        if min_apr:
            filtered_pools = [p for p in filtered_pools if p.apr >= min_apr]
        if search:
            filtered_pools = [p for p in filtered_pools if search in p.name.lower()]

        # Sort by liquidity descending
        filtered_pools.sort(key=lambda p: p.liquidity, reverse=True)

        return jsonify({
            "success": True,
            "pools": [p.to_dict() for p in filtered_pools[:100]],  # Limit to 100
            "total": len(filtered_pools),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[DLMM] Get pools error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/pools/<address>')
def api_dlmm_pool(address: str):
    """Get a specific pool."""
    try:
        pool = dlmm_client.get_pool(address)
        if not pool:
            return jsonify({"success": False, "error": "Pool not found"}), 404

        # Get additional info from sidecar
        pool_info = dlmm_client.get_pool_info_from_sidecar(address)

        return jsonify({
            "success": True,
            "pool": pool.to_dict(),
            "chain_info": pool_info,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[DLMM] Get pool error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/pools/<address>/bins')
def api_dlmm_pool_bins(address: str):
    """Get bin liquidity distribution for a pool."""
    try:
        bins_left = request.args.get('left', 35, type=int)
        bins_right = request.args.get('right', 35, type=int)

        bin_data = dlmm_client.get_bin_liquidity(address, bins_left, bins_right)
        if not bin_data:
            return jsonify({"success": False, "error": "Failed to fetch bin data"}), 500

        return jsonify({
            "success": True,
            "activeBinId": bin_data['activeBinId'],
            "bins": bin_data['bins'],
            "binStep": bin_data['binStep'],
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[DLMM] Get pool bins error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Strategy Routes ====================

@dlmm_bp.route('/api/dlmm/strategy/calculate', methods=['POST'])
def api_dlmm_calculate_strategy():
    """Calculate bin range for a risk profile."""
    data = request.json
    pool_address = data.get('pool_address')
    risk_profile = data.get('risk_profile', 'medium')
    strategy_type = data.get('strategy_type', 'spot')
    deposit_usd = data.get('deposit_usd', 100)

    if not pool_address:
        return jsonify({"success": False, "error": "Missing pool_address"}), 400

    try:
        # Get pool info from sidecar
        pool_info = dlmm_client.get_pool_info_from_sidecar(pool_address)
        if not pool_info:
            return jsonify({"success": False, "error": "Failed to get pool info"}), 500

        # Calculate bin range
        profile = RiskProfile(risk_profile)
        bin_range = StrategyCalculator.calculate_bin_range(
            pool_info['activeBinId'],
            pool_info['binStep'],
            profile
        )

        # Get price impact metrics
        price_impact = StrategyCalculator.calculate_price_impact(
            pool_info['binStep'],
            bin_range['num_bins']
        )

        # Get pool for APR
        pool = dlmm_client.get_pool(pool_address)
        pool_apr = pool.apr if pool else 0

        # Estimate fee potential
        fee_potential = StrategyCalculator.estimate_fee_potential(
            pool_apr,
            profile,
            deposit_usd
        )

        # Get strategy description
        strat_type = StrategyType(strategy_type)
        description = StrategyCalculator.get_strategy_description(profile, strat_type)

        return jsonify({
            "success": True,
            "bin_range": bin_range,
            "price_impact": price_impact,
            "fee_potential": fee_potential,
            "description": description,
            "pool_info": {
                "active_bin_id": pool_info['activeBinId'],
                "bin_step": pool_info['binStep'],
                "current_price": pool_info.get('activePrice')
            },
            "timestamp": time.time()
        })
    except ValueError as e:
        return jsonify({"success": False, "error": f"Invalid parameter: {e}"}), 400
    except Exception as e:
        logger.error(f"[DLMM] Calculate strategy error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Position Lifecycle Routes ====================

@dlmm_bp.route('/api/dlmm/position/create', methods=['POST'])
def api_dlmm_create_position():
    """Build create position transaction."""
    data = request.json

    required = ['pool_address', 'user_wallet', 'amount_x', 'amount_y']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        result = position_manager.prepare_create_position(
            pool_address=data['pool_address'],
            user_wallet=data['user_wallet'],
            risk_profile=data.get('risk_profile', 'medium'),
            strategy_type=data.get('strategy_type', 'spot'),
            amount_x=float(data['amount_x']),
            amount_y=float(data['amount_y']),
            token_x_decimals=data.get('token_x_decimals', 9),
            token_y_decimals=data.get('token_y_decimals', 6)
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[DLMM] Create position error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/position/add-liquidity', methods=['POST'])
def api_dlmm_add_liquidity():
    """Build add liquidity transaction."""
    data = request.json

    required = ['pool_address', 'position_pubkey', 'user_wallet', 'amount_x', 'amount_y']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        result = position_manager.prepare_add_liquidity(
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet'],
            amount_x=float(data['amount_x']),
            amount_y=float(data['amount_y']),
            strategy_type=data.get('strategy_type', 'spot'),
            token_x_decimals=data.get('token_x_decimals', 9),
            token_y_decimals=data.get('token_y_decimals', 6)
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[DLMM] Add liquidity error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/position/remove-liquidity', methods=['POST'])
def api_dlmm_remove_liquidity():
    """Build remove liquidity transaction."""
    data = request.json

    required = ['pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        result = position_manager.prepare_remove_liquidity(
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet'],
            percentage=data.get('percentage', 100)
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[DLMM] Remove liquidity error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/position/claim-fees', methods=['POST'])
def api_dlmm_claim_fees():
    """Build claim fees transaction."""
    data = request.json

    required = ['pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        result = position_manager.prepare_claim_fees(
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet']
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[DLMM] Claim fees error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/position/close', methods=['POST'])
def api_dlmm_close_position():
    """Build close position transaction."""
    data = request.json

    required = ['pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        result = position_manager.prepare_close_position(
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet']
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[DLMM] Close position error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/position/submit-signed', methods=['POST'])
def api_dlmm_submit_signed():
    """
    Submit signed transaction and record to database.
    Called after frontend signs the transaction.
    """
    data = request.json

    required = ['action', 'signature', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        action = data['action']
        signature = data['signature']
        user_wallet = data['user_wallet']

        if action == 'create':
            # Record new position
            position_id = position_manager.record_position_created(
                position_pubkey=data['position_pubkey'],
                pool_address=data['pool_address'],
                user_wallet=user_wallet,
                create_signature=signature,
                risk_profile=data.get('risk_profile', 'medium'),
                strategy_type=data.get('strategy_type', 'spot'),
                bin_range=data.get('bin_range', {}),
                deposit_x=float(data.get('deposit_x', 0)),
                deposit_y=float(data.get('deposit_y', 0)),
                deposit_usd=float(data.get('deposit_usd', 0)),
                pool_info=data.get('pool_info')
            )
            return jsonify({
                "success": True,
                "action": "create",
                "position_id": position_id,
                "signature": signature
            })

        elif action == 'close':
            # Record position closure
            position_manager.record_position_closed(
                position_pubkey=data['position_pubkey'],
                close_signature=signature
            )
            return jsonify({
                "success": True,
                "action": "close",
                "signature": signature
            })

        elif action == 'claim_fees':
            # Update fees
            position_manager.update_position_fees(
                position_pubkey=data['position_pubkey'],
                claimed_x=float(data.get('claimed_x', 0)),
                claimed_y=float(data.get('claimed_y', 0))
            )
            return jsonify({
                "success": True,
                "action": "claim_fees",
                "signature": signature
            })

        else:
            return jsonify({
                "success": True,
                "action": action,
                "signature": signature
            })

    except Exception as e:
        logger.error(f"[DLMM] Submit signed error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/positions')
def api_dlmm_positions():
    """Get user's DLMM positions."""
    wallet = request.args.get('wallet')
    status = request.args.get('status', 'active')

    if not wallet:
        return jsonify({"success": False, "error": "Missing wallet parameter"}), 400

    try:
        positions = position_manager.get_positions(wallet, status)

        # Add ROI calculations
        for pos in positions:
            pos['roi'] = position_manager.calculate_position_roi(pos)

        return jsonify({
            "success": True,
            "positions": positions,
            "count": len(positions),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[DLMM] Get positions error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/positions/<position_pubkey>/refresh', methods=['POST'])
def api_dlmm_refresh_position(position_pubkey: str):
    """Refresh a position's data from chain."""
    try:
        position = position_manager.refresh_position(position_pubkey)
        if not position:
            return jsonify({"success": False, "error": "Position not found"}), 404

        position['roi'] = position_manager.calculate_position_roi(position)

        return jsonify({
            "success": True,
            "position": position,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[DLMM] Refresh position error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Sniper Routes ====================

@dlmm_bp.route('/api/dlmm/sniper/settings')
def api_dlmm_sniper_settings():
    """Get DLMM sniper settings."""
    try:
        settings = db.get_dlmm_sniper_settings()
        return jsonify({
            "success": True,
            "settings": settings
        })
    except Exception as e:
        logger.error(f"[DLMM] Get sniper settings error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/sniper/settings', methods=['POST'])
def api_dlmm_update_sniper_settings():
    """Update DLMM sniper settings."""
    data = request.json

    try:
        db.update_dlmm_sniper_settings(data)
        settings = db.get_dlmm_sniper_settings()

        # Broadcast settings update
        sio_bridge.emit('sniper_settings_update', {
            'settings': settings
        }, namespace='/dlmm')

        return jsonify({
            "success": True,
            "settings": settings
        })
    except Exception as e:
        logger.error(f"[DLMM] Update sniper settings error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/sniper/detected')
def api_dlmm_detected_pools():
    """Get detected DLMM pools from sniper."""
    status = request.args.get('status')
    limit = request.args.get('limit', 50, type=int)

    try:
        pools = db.get_dlmm_sniped_pools(status=status, limit=limit)
        return jsonify({
            "success": True,
            "pools": pools,
            "count": len(pools),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[DLMM] Get detected pools error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/health')
def api_dlmm_health():
    """Check DLMM service health."""
    sidecar_healthy = dlmm_client.check_sidecar_health()

    return jsonify({
        "success": True,
        "sidecar_healthy": sidecar_healthy,
        "timestamp": time.time()
    })


# Socket.IO handlers for dlmm namespace are registered in main.py


# ==================== Favorites Routes ====================

@dlmm_bp.route('/api/dlmm/favorites')
def api_dlmm_favorites():
    """Get favorite DLMM pools."""
    try:
        favorites = db.get_setting('dlmm_favorites', [])
        return jsonify({
            "success": True,
            "favorites": favorites,
            "count": len(favorites)
        })
    except Exception as e:
        logger.error(f"[DLMM] Get favorites error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/favorites/add', methods=['POST'])
def api_dlmm_add_favorite():
    """Add a pool to favorites."""
    data = request.json
    pool_address = data.get('pool_address')

    if not pool_address:
        return jsonify({"success": False, "error": "Missing pool_address"}), 400

    try:
        favorite_entry = None

        # Try to get pool info, but don't fail if parsing errors occur
        try:
            pool = dlmm_client.get_pool(pool_address)
            if pool:
                favorite_entry = {
                    "address": pool_address,
                    "name": pool.name,
                    "token_x_symbol": pool.token_x_symbol,
                    "token_y_symbol": pool.token_y_symbol,
                    "bin_step": pool.bin_step,
                    "liquidity": pool.liquidity,
                    "apr": pool.apr,
                    "added_at": time.time()
                }
        except Exception as pool_err:
            logger.warning(f"[DLMM] Could not get pool from cache: {pool_err}")

        # Try sidecar if pool not found
        if not favorite_entry:
            try:
                pool_info = dlmm_client.get_pool_info_from_sidecar(pool_address)
                if pool_info:
                    favorite_entry = {
                        "address": pool_address,
                        "name": data.get('name', f"Pool {pool_address[:8]}"),
                        "token_x_symbol": pool_info.get('tokenXSymbol', '?'),
                        "token_y_symbol": pool_info.get('tokenYSymbol', '?'),
                        "bin_step": pool_info.get('binStep', 0),
                        "added_at": time.time()
                    }
            except Exception as sidecar_err:
                logger.warning(f"[DLMM] Could not get pool from sidecar: {sidecar_err}")

        # Fallback: just save with the address
        if not favorite_entry:
            favorite_entry = {
                "address": pool_address,
                "name": data.get('name', f"Pool {pool_address[:8]}..."),
                "token_x_symbol": "?",
                "token_y_symbol": "?",
                "bin_step": 0,
                "added_at": time.time()
            }

        # Get existing favorites and add new one
        favorites = db.get_setting('dlmm_favorites', [])

        # Check if already exists
        if any(f['address'] == pool_address for f in favorites):
            return jsonify({"success": False, "error": "Pool already in favorites"}), 400

        favorites.insert(0, favorite_entry)
        db.save_setting('dlmm_favorites', favorites)

        # Broadcast update
        sio_bridge.emit('favorites_update', {
            'favorites': favorites
        }, namespace='/dlmm')

        return jsonify({
            "success": True,
            "favorite": favorite_entry,
            "count": len(favorites)
        })
    except Exception as e:
        logger.error(f"[DLMM] Add favorite error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/favorites/remove', methods=['POST'])
def api_dlmm_remove_favorite():
    """Remove a pool from favorites."""
    data = request.json
    pool_address = data.get('pool_address')

    if not pool_address:
        return jsonify({"success": False, "error": "Missing pool_address"}), 400

    try:
        favorites = db.get_setting('dlmm_favorites', [])
        favorites = [f for f in favorites if f['address'] != pool_address]
        db.save_setting('dlmm_favorites', favorites)

        # Broadcast update
        sio_bridge.emit('favorites_update', {
            'favorites': favorites
        }, namespace='/dlmm')

        return jsonify({
            "success": True,
            "count": len(favorites)
        })
    except Exception as e:
        logger.error(f"[DLMM] Remove favorite error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@dlmm_bp.route('/api/dlmm/favorites/refresh', methods=['POST'])
def api_dlmm_refresh_favorites():
    """Refresh all favorites with updated data from API."""
    try:
        favorites = db.get_setting('dlmm_favorites', [])
        updated_favorites = []

        for fav in favorites:
            address = fav.get('address')
            if not address:
                continue

            # Try to fetch fresh pool data
            pool = dlmm_client.get_pool(address)
            if pool:
                updated_favorites.append({
                    "address": address,
                    "name": pool.name,
                    "token_x_symbol": pool.token_x_symbol,
                    "token_y_symbol": pool.token_y_symbol,
                    "bin_step": pool.bin_step,
                    "liquidity": pool.liquidity,
                    "apr": pool.apr,
                    "added_at": fav.get('added_at', time.time())
                })
            else:
                # Keep existing data if fetch fails
                updated_favorites.append(fav)

        db.save_setting('dlmm_favorites', updated_favorites)

        # Broadcast update
        sio_bridge.emit('favorites_update', {
            'favorites': updated_favorites
        }, namespace='/dlmm')

        return jsonify({
            "success": True,
            "favorites": updated_favorites,
            "count": len(updated_favorites)
        })
    except Exception as e:
        logger.error(f"[DLMM] Refresh favorites error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
