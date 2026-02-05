#!/usr/bin/env python3
"""
Unified Liquidity API routes.
Supports both Meteora DLMM and Orca Whirlpools protocols.
"""

import time
import logging
from flask import Blueprint, jsonify, request

import sio_bridge
from extensions import db
from services.liquidity import (
    OrcaClient,
    UnifiedPositionManager,
    RebalanceEngine,
    PositionMonitor,
    orca_client
)
from services.meteora_dlmm import DLMMClient

logger = logging.getLogger("tactix.liquidity.routes")

liquidity_bp = Blueprint('liquidity', __name__)

# Initialize clients
meteora_client = DLMMClient()
position_manager = None
rebalance_engine = None
position_monitor = None


def init_liquidity_services(session_key_service=None):
    """Initialize liquidity services."""
    global position_manager, rebalance_engine, position_monitor

    position_manager = UnifiedPositionManager(db, meteora_client, orca_client)
    rebalance_engine = RebalanceEngine(db, position_manager, session_key_service)
    position_monitor = PositionMonitor(db, position_manager)

    logger.info("[Liquidity] Services initialized")


# ==================== Pool Routes ====================

@liquidity_bp.route('/api/liquidity/pools')
def api_liquidity_pools():
    """Get pools from all protocols or a specific one."""
    try:
        protocol = request.args.get('protocol')  # 'meteora', 'orca', or None for all
        min_liquidity = request.args.get('min_liquidity', type=float)
        min_tvl = request.args.get('min_tvl', type=float)
        search = request.args.get('search', '')
        limit = request.args.get('limit', 100, type=int)

        pools = position_manager.get_all_pools(
            protocol=protocol,
            min_liquidity=min_liquidity or 0,
            min_tvl=min_tvl or 0,
            search=search
        )

        return jsonify({
            "success": True,
            "pools": [p.to_dict() for p in pools[:limit]],
            "total": len(pools),
            "protocol": protocol or 'all',
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get pools error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/pools/<protocol>/<address>')
def api_liquidity_pool(protocol: str, address: str):
    """Get a specific pool."""
    try:
        if protocol not in ('meteora', 'orca'):
            return jsonify({"success": False, "error": "Invalid protocol"}), 400

        pool = position_manager.get_pool(protocol, address)
        pool_dict = pool.to_dict() if pool else None

        # Get chain info from sidecar
        if protocol == 'meteora':
            chain_info = meteora_client.get_pool_info_from_sidecar(address)
            bin_data = meteora_client.get_bin_liquidity(address)
        else:
            chain_info = orca_client.get_pool_info_from_sidecar(address)
            bin_data = orca_client.get_tick_data(address)

        # If pool not in cache or has incomplete data, build from sidecar/API response
        needs_enrichment = (
            not pool_dict or
            pool_dict.get('price', 0) == 0 or
            not pool_dict.get('tokenX', {}).get('symbol') or
            pool_dict.get('tvl', 0) == 0
        )
        if needs_enrichment:
            if protocol == 'orca':
                # Check cache first (non-blocking) - populated by get_all_pools()
                cached_pool = orca_client._pools_cache.get(address)
                if cached_pool:
                    pool_dict = {
                        'protocol': 'orca',
                        'address': address,
                        'name': cached_pool.name,
                        'tokenX': {
                            'mint': cached_pool.token_a_mint,
                            'symbol': cached_pool.token_a_symbol,
                            'decimals': chain_info.get('tokenA', {}).get('decimals', 9) if chain_info else 9
                        },
                        'tokenY': {
                            'mint': cached_pool.token_b_mint,
                            'symbol': cached_pool.token_b_symbol,
                            'decimals': chain_info.get('tokenB', {}).get('decimals', 6) if chain_info else 6
                        },
                        'priceSpacing': cached_pool.tick_spacing,
                        'feeRate': cached_pool.fee_rate / 1000000,  # Convert from bps
                        'liquidity': cached_pool.liquidity,
                        'volume24h': cached_pool.volume_24h,
                        'fees24h': cached_pool.fees_24h,
                        'apr': cached_pool.apr,
                        'price': cached_pool.price if cached_pool.price else (float(chain_info.get('currentPrice', 0)) if chain_info else 0),
                        'tvl': cached_pool.tvl,
                        'currentPriceIndex': chain_info.get('currentTick', 0) if chain_info else 0
                    }
                elif chain_info:
                    # Fallback to sidecar-only data if not in cache
                    # Derive symbols from known mints (sidecar doesn't return symbols)
                    mint_a = chain_info.get('tokenA', {}).get('mint', '')
                    mint_b = chain_info.get('tokenB', {}).get('mint', '')
                    symbol_a = 'SOL' if 'So11111111111111111111111111111111111111112' in mint_a else '?'
                    symbol_b = 'USDC' if 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' in mint_b else '?'

                    pool_dict = {
                        'protocol': 'orca',
                        'address': address,
                        'name': f"{symbol_a}/{symbol_b}",
                        'tokenX': {
                            'mint': mint_a,
                            'symbol': symbol_a,
                            'decimals': chain_info.get('tokenA', {}).get('decimals', 9)
                        },
                        'tokenY': {
                            'mint': mint_b,
                            'symbol': symbol_b,
                            'decimals': chain_info.get('tokenB', {}).get('decimals', 6)
                        },
                        'priceSpacing': chain_info.get('tickSpacing', 0),
                        'feeRate': chain_info.get('feeRate', 0) / 1000000,
                        'liquidity': float(chain_info.get('liquidity', 0)),
                        'volume24h': 0,
                        'fees24h': 0,
                        'apr': 0,
                        'price': float(chain_info.get('currentPrice', 0)),
                        'tvl': 0,
                        'currentPriceIndex': chain_info.get('currentTick', 0)
                    }
            elif chain_info:  # meteora
                pool_dict = {
                    'protocol': 'meteora',
                    'address': address,
                    'name': chain_info.get('name', '?-?'),
                    'tokenX': {
                        'mint': chain_info.get('tokenXMint', ''),
                        'symbol': chain_info.get('tokenXSymbol', '?'),
                        'decimals': chain_info.get('tokenXDecimals', 9)
                    },
                    'tokenY': {
                        'mint': chain_info.get('tokenYMint', ''),
                        'symbol': chain_info.get('tokenYSymbol', '?'),
                        'decimals': chain_info.get('tokenYDecimals', 6)
                    },
                    'priceSpacing': chain_info.get('binStep', 0),
                    'feeRate': chain_info.get('baseFee', 0) / 10000,
                    'liquidity': float(chain_info.get('liquidity', 0)),
                    'volume24h': 0,
                    'fees24h': 0,
                    'apr': 0,
                    'price': float(chain_info.get('activePrice', 0)),
                    'tvl': 0,
                    'currentPriceIndex': chain_info.get('activeBinId', 0)
                }

        if not pool_dict:
            return jsonify({"success": False, "error": "Pool not found"}), 404

        return jsonify({
            "success": True,
            "pool": pool_dict,
            "chainInfo": chain_info,
            "priceData": bin_data,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get pool error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Position Lifecycle Routes ====================

@liquidity_bp.route('/api/liquidity/position/create', methods=['POST'])
def api_liquidity_create_position():
    """Build create position transaction for either protocol."""
    data = request.json

    required = ['protocol', 'pool_address', 'user_wallet', 'amount_x', 'amount_y']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    protocol = data['protocol']
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    try:
        result = position_manager.prepare_create_position(
            protocol=protocol,
            pool_address=data['pool_address'],
            user_wallet=data['user_wallet'],
            risk_profile=data.get('risk_profile', 'medium'),
            amount_x=float(data['amount_x']),
            amount_y=float(data['amount_y']),
            token_x_decimals=data.get('token_x_decimals', 9),
            token_y_decimals=data.get('token_y_decimals', 6),
            auto_rebalance=data.get('auto_rebalance', False)
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[Liquidity] Create position error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/position/close', methods=['POST'])
def api_liquidity_close_position():
    """Build close position transaction."""
    data = request.json

    required = ['protocol', 'pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    protocol = data['protocol']
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    try:
        result = position_manager.prepare_close_position(
            protocol=protocol,
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet']
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[Liquidity] Close position error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/position/add-liquidity', methods=['POST'])
def api_liquidity_add_liquidity():
    """Build add liquidity transaction."""
    data = request.json

    required = ['protocol', 'pool_address', 'position_pubkey', 'user_wallet', 'amount_x', 'amount_y']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    protocol = data['protocol']
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    try:
        result = position_manager.prepare_add_liquidity(
            protocol=protocol,
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet'],
            amount_x=float(data['amount_x']),
            amount_y=float(data['amount_y']),
            token_x_decimals=data.get('token_x_decimals', 9),
            token_y_decimals=data.get('token_y_decimals', 6)
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[Liquidity] Add liquidity error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/position/remove-liquidity', methods=['POST'])
def api_liquidity_remove_liquidity():
    """Build remove liquidity transaction."""
    data = request.json

    required = ['protocol', 'pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    protocol = data['protocol']
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    try:
        result = position_manager.prepare_remove_liquidity(
            protocol=protocol,
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet'],
            percentage=data.get('percentage', 100)
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[Liquidity] Remove liquidity error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/position/claim-fees', methods=['POST'])
def api_liquidity_claim_fees():
    """Build claim fees transaction."""
    data = request.json

    required = ['protocol', 'pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    protocol = data['protocol']
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    try:
        result = position_manager.prepare_claim_fees(
            protocol=protocol,
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet']
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[Liquidity] Claim fees error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/position/claim-rewards', methods=['POST'])
def api_liquidity_claim_rewards():
    """Build claim rewards transaction (Orca only)."""
    data = request.json

    required = ['pool_address', 'position_pubkey', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        result = position_manager.prepare_claim_rewards(
            pool_address=data['pool_address'],
            position_pubkey=data['position_pubkey'],
            user_wallet=data['user_wallet'],
            reward_index=data.get('reward_index')
        )

        return jsonify(result)
    except Exception as e:
        logger.error(f"[Liquidity] Claim rewards error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/position/submit-signed', methods=['POST'])
def api_liquidity_submit_signed():
    """Submit signed transaction and record to database."""
    data = request.json

    required = ['action', 'protocol', 'signature', 'user_wallet']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        action = data['action']
        protocol = data['protocol']
        signature = data['signature']
        user_wallet = data['user_wallet']

        if action == 'create':
            position_id = position_manager.record_position_created(
                protocol=protocol,
                position_pubkey=data['position_pubkey'],
                position_nft_mint=data.get('position_nft_mint'),
                pool_address=data['pool_address'],
                user_wallet=user_wallet,
                signature=signature,
                risk_profile=data.get('risk_profile', 'medium'),
                range_min=data.get('range_min', 0),
                range_max=data.get('range_max', 0),
                deposit_x=float(data.get('deposit_x', 0)),
                deposit_y=float(data.get('deposit_y', 0)),
                deposit_usd=float(data.get('deposit_usd', 0)),
                auto_rebalance=data.get('auto_rebalance', False)
            )
            return jsonify({
                "success": True,
                "action": "create",
                "position_id": position_id,
                "signature": signature
            })

        elif action == 'close':
            position_manager.record_position_closed(
                position_pubkey=data['position_pubkey'],
                signature=signature
            )
            return jsonify({
                "success": True,
                "action": "close",
                "signature": signature
            })

        else:
            return jsonify({
                "success": True,
                "action": action,
                "signature": signature
            })

    except Exception as e:
        logger.error(f"[Liquidity] Submit signed error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Position Query Routes ====================

@liquidity_bp.route('/api/liquidity/positions')
def api_liquidity_positions():
    """Get user's positions across all protocols."""
    wallet = request.args.get('wallet')
    protocol = request.args.get('protocol')
    status = request.args.get('status', 'active')

    if not wallet:
        return jsonify({"success": False, "error": "Missing wallet parameter"}), 400

    try:
        positions = position_manager.get_positions(wallet, protocol, status)

        return jsonify({
            "success": True,
            "positions": positions,
            "count": len(positions),
            "protocol": protocol or 'all',
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get positions error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/positions/<protocol>/<position_pubkey>')
def api_liquidity_position(protocol: str, position_pubkey: str):
    """Get a specific position with chain data."""
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    pool_address = request.args.get('pool_address')
    if not pool_address:
        return jsonify({"success": False, "error": "Missing pool_address parameter"}), 400

    try:
        chain_info = position_manager.get_position_info(protocol, pool_address, position_pubkey)
        if not chain_info:
            return jsonify({"success": False, "error": "Position not found"}), 404

        return jsonify({
            "success": True,
            "position": chain_info,
            "protocol": protocol,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get position error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/positions/<position_pubkey>/settings', methods=['POST'])
def api_liquidity_position_settings(position_pubkey: str):
    """Update position settings (e.g., auto-rebalance)."""
    data = request.json

    try:
        if 'auto_rebalance' in data:
            position_manager.update_position_auto_rebalance(
                position_pubkey,
                data['auto_rebalance']
            )

        return jsonify({
            "success": True,
            "position_pubkey": position_pubkey,
            "updated": list(data.keys())
        })
    except Exception as e:
        logger.error(f"[Liquidity] Update position settings error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Strategy Routes ====================

@liquidity_bp.route('/api/liquidity/strategy/calculate', methods=['POST'])
def api_liquidity_calculate_strategy():
    """Calculate range for a risk profile."""
    data = request.json

    required = ['protocol', 'pool_address']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    protocol = data['protocol']
    if protocol not in ('meteora', 'orca'):
        return jsonify({"success": False, "error": "Invalid protocol"}), 400

    try:
        range_info = position_manager.calculate_range(
            protocol=protocol,
            pool_address=data['pool_address'],
            risk_profile=data.get('risk_profile', 'medium')
        )

        if not range_info:
            return jsonify({"success": False, "error": "Failed to calculate range"}), 500

        return jsonify({
            "success": True,
            "protocol": protocol,
            **range_info,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Calculate strategy error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Rebalance Routes ====================

@liquidity_bp.route('/api/liquidity/rebalance/settings', methods=['GET', 'POST'])
def api_liquidity_rebalance_settings():
    """Get or update rebalance engine settings."""
    try:
        if request.method == 'GET':
            settings = rebalance_engine.get_settings()
            return jsonify({
                "success": True,
                "settings": settings,
                "timestamp": time.time()
            })
        else:
            # Update settings
            data = request.json or {}
            rebalance_engine.update_settings(data)
            settings = rebalance_engine.get_settings()
            return jsonify({
                "success": True,
                "settings": settings,
                "updated": True,
                "timestamp": time.time()
            })
    except Exception as e:
        logger.error(f"[Liquidity] Rebalance settings error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/stats')
def api_liquidity_rebalance_stats():
    """Get rebalance stats for all positions or a specific one."""
    position_pubkey = request.args.get('position_pubkey')

    try:
        if position_pubkey:
            stats = rebalance_engine.get_position_stats(position_pubkey)
            if not stats:
                return jsonify({"success": False, "error": "No stats for position"}), 404
            return jsonify({
                "success": True,
                "stats": stats,
                "timestamp": time.time()
            })
        else:
            all_stats = rebalance_engine.get_all_stats()
            return jsonify({
                "success": True,
                "stats": all_stats,
                "count": len(all_stats),
                "timestamp": time.time()
            })
    except Exception as e:
        logger.error(f"[Liquidity] Get rebalance stats error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/suggestions')
def api_liquidity_rebalance_suggestions():
    """Get pending rebalance suggestions."""
    wallet = request.args.get('wallet')

    try:
        suggestions = rebalance_engine.get_pending_suggestions(wallet)
        return jsonify({
            "success": True,
            "suggestions": suggestions,
            "count": len(suggestions),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get suggestions error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/approve', methods=['POST'])
def api_liquidity_approve_rebalance():
    """Approve a rebalance suggestion and get transaction to sign."""
    data = request.json
    position_pubkey = data.get('position_pubkey')

    if not position_pubkey:
        return jsonify({"success": False, "error": "Missing position_pubkey"}), 400

    try:
        result = rebalance_engine.approve_rebalance(position_pubkey)
        if not result:
            return jsonify({"success": False, "error": "No pending suggestion found"}), 404

        return jsonify({
            "success": True,
            **result,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Approve rebalance error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/dismiss', methods=['POST'])
def api_liquidity_dismiss_suggestion():
    """Dismiss a rebalance suggestion."""
    data = request.json
    position_pubkey = data.get('position_pubkey')

    if not position_pubkey:
        return jsonify({"success": False, "error": "Missing position_pubkey"}), 400

    try:
        rebalance_engine.dismiss_suggestion(position_pubkey)
        return jsonify({
            "success": True,
            "position_pubkey": position_pubkey,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Dismiss suggestion error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/history')
def api_liquidity_rebalance_history():
    """Get rebalance history."""
    wallet = request.args.get('wallet')
    limit = request.args.get('limit', 50, type=int)

    try:
        history = rebalance_engine.get_rebalance_history(wallet, limit)
        return jsonify({
            "success": True,
            "history": history,
            "count": len(history),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get rebalance history error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/execute', methods=['POST'])
def api_liquidity_execute_rebalance():
    """Manually execute a rebalance (submit signed transaction pair)."""
    data = request.json

    required = ['position_pubkey', 'close_signature', 'open_signature', 'new_position_pubkey']
    for field in required:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        # Record the rebalance in database
        db.record_rebalance({
            'position_pubkey': data['position_pubkey'],
            'old_position_pubkey': data['position_pubkey'],
            'new_position_pubkey': data['new_position_pubkey'],
            'close_signature': data['close_signature'],
            'open_signature': data['open_signature'],
            'old_range_min': data.get('old_range_min', 0),
            'old_range_max': data.get('old_range_max', 0),
            'new_range_min': data.get('new_range_min', 0),
            'new_range_max': data.get('new_range_max', 0),
            'timestamp': time.time()
        })

        # Clear the suggestion
        rebalance_engine.dismiss_suggestion(data['position_pubkey'])

        # Emit completion event
        sio_bridge.emit('rebalance_completed', {
            'oldPositionPubkey': data['position_pubkey'],
            'newPositionPubkey': data['new_position_pubkey'],
            'timestamp': time.time()
        }, namespace='/liquidity')

        return jsonify({
            "success": True,
            "old_position": data['position_pubkey'],
            "new_position": data['new_position_pubkey'],
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Execute rebalance error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Health Check ====================

@liquidity_bp.route('/api/liquidity/health')
def api_liquidity_health():
    """Check liquidity service health."""
    try:
        sidecar_health = position_manager.check_sidecar_health()

        return jsonify({
            "success": True,
            "sidecar": sidecar_health,
            "rebalance_engine_running": rebalance_engine._running if rebalance_engine else False,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Health check error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Service Control ====================

@liquidity_bp.route('/api/liquidity/rebalance/start', methods=['POST'])
def api_liquidity_start_rebalance_engine():
    """Start the rebalance monitoring engine."""
    try:
        rebalance_engine.start()
        return jsonify({
            "success": True,
            "running": True,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Start rebalance engine error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/rebalance/stop', methods=['POST'])
def api_liquidity_stop_rebalance_engine():
    """Stop the rebalance monitoring engine."""
    try:
        rebalance_engine.stop()
        return jsonify({
            "success": True,
            "running": False,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Stop rebalance engine error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ==================== Monitor Settings Routes ====================

@liquidity_bp.route('/api/liquidity/monitor/settings', methods=['GET', 'POST'])
def api_liquidity_monitor_settings():
    """Get or update position monitor settings."""
    try:
        if request.method == 'GET':
            return jsonify({
                "success": True,
                "settings": position_monitor.settings.to_dict(),
                "running": position_monitor.is_running(),
                "timestamp": time.time()
            })
        else:
            data = request.json or {}

            # Update settings
            updated_settings = position_monitor.update_settings(data)

            return jsonify({
                "success": True,
                "settings": updated_settings.to_dict(),
                "timestamp": time.time()
            })
    except Exception as e:
        logger.error(f"[Liquidity] Monitor settings error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/monitor/start', methods=['POST'])
def api_liquidity_start_monitor():
    """Start the position monitor."""
    try:
        position_monitor.start()
        return jsonify({
            "success": True,
            "running": True,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Start monitor error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/monitor/stop', methods=['POST'])
def api_liquidity_stop_monitor():
    """Stop the position monitor."""
    try:
        position_monitor.stop()
        return jsonify({
            "success": True,
            "running": False,
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Stop monitor error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@liquidity_bp.route('/api/liquidity/monitor/position/<position_pubkey>')
def api_liquidity_monitor_position_status(position_pubkey: str):
    """Get current status for a specific position."""
    try:
        status = position_monitor.get_position_status(position_pubkey)
        if not status:
            return jsonify({"success": False, "error": "Position not found"}), 404

        return jsonify({
            "success": True,
            "status": status.to_dict(),
            "timestamp": time.time()
        })
    except Exception as e:
        logger.error(f"[Liquidity] Get position status error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# Socket.IO handlers for liquidity namespace are registered in main.py
