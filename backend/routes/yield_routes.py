#!/usr/bin/env python3
"""Yield Hunter API routes."""
import time
import base64
from flask import Blueprint, jsonify, request

from extensions import db, socketio
from services.yield_hunter import (
    get_all_opportunities,
    get_opportunities_by_protocol,
    YieldOpportunity,
    get_yield_manager
)
from services.yield_hunter.jupiter_lend import (
    build_jupiter_lend_deposit_ix,
    build_jupiter_lend_withdraw_ix,
    get_jupiter_lend_quote
)
from services.yield_hunter.loopscale import (
    build_loopscale_deposit_ix,
    build_loopscale_withdraw_ix
)

# Sidecar URLs
KAMINO_SIDECAR_URL = "http://127.0.0.1:5004"

yield_bp = Blueprint('yield', __name__)

# Initialize unified yield manager
_yield_manager = None

def get_manager():
    """Get or create the unified yield manager with db connection."""
    global _yield_manager
    if _yield_manager is None:
        _yield_manager = get_yield_manager(db)
    return _yield_manager


@yield_bp.route('/api/yield/opportunities')
def api_yield_opportunities():
    """
    Get aggregated yield opportunities from all protocols.

    Query params:
        risk: Filter by risk level ('low', 'medium', 'high')
        protocol: Filter by protocol ('kamino', 'jupiter_lend', 'loopscale', 'hylo')
        sort: Sort field ('apy', 'tvl', 'risk') - default 'apy'
        order: Sort order ('asc', 'desc') - default 'desc'
    """
    risk_filter = request.args.get('risk')
    protocol_filter = request.args.get('protocol')
    sort_by = request.args.get('sort', 'apy')
    order = request.args.get('order', 'desc')

    try:
        opportunities = get_all_opportunities(
            risk_filter=risk_filter,
            protocol_filter=protocol_filter
        )

        # Convert to dicts
        opps_data = [opp.to_dict() for opp in opportunities]

        # Additional sorting if requested
        if sort_by == 'tvl':
            opps_data.sort(key=lambda x: x['tvl'], reverse=(order == 'desc'))
        elif sort_by == 'risk':
            risk_order = {'low': 0, 'medium': 1, 'high': 2}
            opps_data.sort(
                key=lambda x: risk_order.get(x['risk_level'], 1),
                reverse=(order == 'desc')
            )
        # Default APY sort is already applied in get_all_opportunities

        return jsonify({
            "success": True,
            "opportunities": opps_data,
            "count": len(opps_data),
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/opportunities/<protocol>')
def api_yield_by_protocol(protocol: str):
    """Get yield opportunities from a specific protocol."""
    try:
        opportunities = get_opportunities_by_protocol(protocol.lower())
        opps_data = [opp.to_dict() for opp in opportunities]

        return jsonify({
            "success": True,
            "protocol": protocol,
            "opportunities": opps_data,
            "count": len(opps_data),
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/positions')
def api_yield_positions():
    """Get user's yield positions from database."""
    wallet = request.args.get('wallet')
    status = request.args.get('status', 'active')

    if not wallet:
        return jsonify({"success": False, "error": "Missing wallet parameter"}), 400

    try:
        positions = db.get_yield_positions(wallet, status)
        return jsonify({
            "success": True,
            "positions": positions,
            "count": len(positions),
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/positions/record', methods=['POST'])
def api_record_yield_position():
    """
    Record a new yield position (deposit or withdrawal).

    Body:
        wallet_address: User's wallet address
        protocol: Protocol name
        vault_address: Vault/pool address
        vault_name: Display name
        deposit_token: Token mint
        deposit_symbol: Token symbol
        amount: Deposit amount
        shares: Shares received
        apy_at_deposit: APY at time of deposit
        signature: Transaction signature
        action: 'deposit' or 'withdraw'
    """
    data = request.json

    required_fields = ['wallet_address', 'protocol', 'vault_address', 'amount', 'signature', 'action']
    for field in required_fields:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    try:
        if data['action'] == 'deposit':
            position_id = db.save_yield_position(
                wallet_address=data['wallet_address'],
                protocol=data['protocol'],
                vault_address=data['vault_address'],
                vault_name=data.get('vault_name', ''),
                deposit_token=data.get('deposit_token', ''),
                deposit_symbol=data.get('deposit_symbol', ''),
                amount=float(data['amount']),
                shares=float(data.get('shares', 0)),
                apy_at_deposit=float(data.get('apy_at_deposit', 0)),
                deposit_signature=data['signature']
            )

            # Broadcast position update
            socketio.emit('position_update', {
                'action': 'deposit',
                'wallet': data['wallet_address'],
                'position_id': position_id
            }, namespace='/yield')

            return jsonify({
                "success": True,
                "position_id": position_id,
                "action": "deposit"
            })

        elif data['action'] == 'withdraw':
            db.update_yield_position_withdraw(
                wallet_address=data['wallet_address'],
                vault_address=data['vault_address'],
                withdraw_amount=float(data['amount']),
                withdraw_signature=data['signature']
            )

            # Broadcast position update
            socketio.emit('position_update', {
                'action': 'withdraw',
                'wallet': data['wallet_address'],
                'vault_address': data['vault_address']
            }, namespace='/yield')

            return jsonify({
                "success": True,
                "action": "withdraw"
            })

        else:
            return jsonify({"success": False, "error": "Invalid action"}), 400

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/stats')
def api_yield_stats():
    """Get aggregated yield statistics."""
    wallet = request.args.get('wallet')

    try:
        opportunities = get_all_opportunities()

        stats = {
            "total_protocols": 4,
            "total_opportunities": len(opportunities),
            "avg_apy": sum(o.apy for o in opportunities) / len(opportunities) if opportunities else 0,
            "max_apy": max((o.apy for o in opportunities), default=0),
            "total_tvl": sum(o.tvl for o in opportunities),
            "by_risk": {
                "low": len([o for o in opportunities if o.risk_level == 'low']),
                "medium": len([o for o in opportunities if o.risk_level == 'medium']),
                "high": len([o for o in opportunities if o.risk_level == 'high'])
            }
        }

        # Add user's position stats if wallet provided
        if wallet:
            positions = db.get_yield_positions(wallet, 'active')
            stats["user_positions"] = len(positions)
            stats["user_total_deposited"] = sum(p.get('amount', 0) for p in positions)

        return jsonify({
            "success": True,
            "stats": stats,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/protocols/status')
def api_yield_protocol_status():
    """
    Get status of all yield protocol integrations.

    Returns:
        status: Dict of protocol status including sidecar availability
    """
    try:
        manager = get_manager()
        status = manager.get_protocol_status()

        return jsonify({
            "success": True,
            "protocols": status,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/best', methods=['GET'])
def api_yield_best_opportunity():
    """
    Get the best yield opportunity for a token.

    Query params:
        token: Token symbol (e.g., 'USDC', 'SOL')
        risk: Optional risk filter ('low', 'medium', 'high')

    Returns:
        opportunity: Best matching yield opportunity
    """
    token = request.args.get('token')
    risk_filter = request.args.get('risk')

    if not token:
        return jsonify({"success": False, "error": "Missing token parameter"}), 400

    try:
        manager = get_manager()
        best = manager.get_best_opportunity(token, risk_filter)

        if best:
            return jsonify({
                "success": True,
                "opportunity": best.to_dict(),
                "timestamp": time.time()
            })
        else:
            return jsonify({
                "success": True,
                "opportunity": None,
                "message": f"No opportunities found for {token}",
                "timestamp": time.time()
            })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/compare', methods=['GET'])
def api_yield_compare():
    """
    Compare yield opportunities for a token across risk levels.

    Query params:
        token: Token symbol (e.g., 'USDC', 'SOL')

    Returns:
        comparison: Dict with 'low', 'medium', 'high' risk opportunities
    """
    token = request.args.get('token')

    if not token:
        return jsonify({"success": False, "error": "Missing token parameter"}), 400

    try:
        manager = get_manager()
        comparison = manager.compare_opportunities(token)

        # Convert to dicts
        result = {
            risk: [o.to_dict() for o in opps]
            for risk, opps in comparison.items()
        }

        return jsonify({
            "success": True,
            "token": token,
            "comparison": result,
            "timestamp": time.time()
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/deposit', methods=['POST'])
def api_yield_deposit():
    """
    Build a deposit transaction for a yield protocol.

    Body:
        protocol: Protocol name ('jupiter_lend', 'loopscale', 'kamino', 'hylo')
        vault_address: Vault/reserve address to deposit into
        amount: Amount to deposit (in token units, will be converted to lamports)
        wallet_address: User's wallet address
        deposit_token: Token mint address (optional, for validation)

    Returns:
        transaction: Base64 encoded unsigned transaction
        quote: Estimated shares/output (if available)
    """
    data = request.json

    required_fields = ['protocol', 'vault_address', 'amount', 'wallet_address']
    for field in required_fields:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    protocol = data['protocol'].lower()
    vault_address = data['vault_address']
    amount = float(data['amount'])
    wallet = data['wallet_address']
    deposit_token = data.get('deposit_token', vault_address)

    try:
        if protocol == 'jupiter_lend':
            # Jupiter Lend uses token mint as vault address
            # Get quote first
            quote = get_jupiter_lend_quote(deposit_token, amount, 'deposit')

            # Build deposit transaction
            # Amount needs to be in smallest units (lamports/base units)
            # Assuming 9 decimals for most tokens, frontend should pass raw amount
            amount_raw = int(amount * 1_000_000_000)  # Adjust based on token decimals
            tx_data = build_jupiter_lend_deposit_ix(deposit_token, amount_raw, wallet)

            return jsonify({
                "success": True,
                "protocol": protocol,
                "transaction": tx_data.get('transaction'),
                "quote": quote,
                "vault_address": vault_address
            })

        elif protocol == 'loopscale':
            # Loopscale vault deposit
            amount_raw = int(amount * 1_000_000_000)
            tx_data = build_loopscale_deposit_ix(vault_address, amount_raw, wallet)

            return jsonify({
                "success": True,
                "protocol": protocol,
                "transaction": tx_data.get('transaction'),
                "vault_address": vault_address
            })

        elif protocol == 'kamino':
            # Kamino requires sidecar - check if available
            import requests
            try:
                response = requests.post(
                    f"{KAMINO_SIDECAR_URL}/build/deposit",
                    json={
                        "reserveAddress": vault_address,
                        "amount": amount,
                        "userWallet": wallet
                    },
                    timeout=15
                )
                if response.status_code == 200:
                    tx_data = response.json()
                    return jsonify({
                        "success": True,
                        "protocol": protocol,
                        "transaction": tx_data.get('transaction'),
                        "estimatedShares": tx_data.get('estimatedShares'),
                        "vault_address": vault_address
                    })
                else:
                    return jsonify({
                        "success": False,
                        "error": f"Kamino sidecar error: {response.text}"
                    }), 500
            except requests.exceptions.ConnectionError:
                return jsonify({
                    "success": False,
                    "error": "Kamino sidecar not available. Please start the Kamino sidecar service."
                }), 503

        elif protocol == 'hylo':
            # HyLo - try REST API first
            import requests
            try:
                response = requests.post(
                    "https://api.hylo.so/v1/transactions/deposit",
                    json={
                        "pool": vault_address,
                        "amount": str(amount),
                        "signer": wallet
                    },
                    timeout=15
                )
                if response.status_code == 200:
                    tx_data = response.json()
                    return jsonify({
                        "success": True,
                        "protocol": protocol,
                        "transaction": tx_data.get('transaction'),
                        "vault_address": vault_address
                    })
                else:
                    return jsonify({
                        "success": False,
                        "error": "HyLo deposit API not available"
                    }), 503
            except:
                return jsonify({
                    "success": False,
                    "error": "HyLo integration requires frontend SDK. API not available."
                }), 503
        else:
            return jsonify({
                "success": False,
                "error": f"Unknown protocol: {protocol}"
            }), 400

    except NotImplementedError as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 501
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@yield_bp.route('/api/yield/withdraw', methods=['POST'])
def api_yield_withdraw():
    """
    Build a withdraw transaction for a yield protocol.

    Body:
        protocol: Protocol name ('jupiter_lend', 'loopscale', 'kamino', 'hylo')
        vault_address: Vault/reserve address to withdraw from
        shares: Amount of shares/position to withdraw
        wallet_address: User's wallet address

    Returns:
        transaction: Base64 encoded unsigned transaction
    """
    data = request.json

    required_fields = ['protocol', 'vault_address', 'shares', 'wallet_address']
    for field in required_fields:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    protocol = data['protocol'].lower()
    vault_address = data['vault_address']
    shares = float(data['shares'])
    wallet = data['wallet_address']

    try:
        if protocol == 'jupiter_lend':
            shares_raw = int(shares * 1_000_000_000)
            tx_data = build_jupiter_lend_withdraw_ix(vault_address, shares_raw, wallet)

            return jsonify({
                "success": True,
                "protocol": protocol,
                "transaction": tx_data.get('transaction'),
                "vault_address": vault_address
            })

        elif protocol == 'loopscale':
            shares_raw = int(shares * 1_000_000_000)
            tx_data = build_loopscale_withdraw_ix(vault_address, shares_raw, wallet)

            return jsonify({
                "success": True,
                "protocol": protocol,
                "transaction": tx_data.get('transaction'),
                "vault_address": vault_address
            })

        elif protocol == 'kamino':
            import requests
            try:
                response = requests.post(
                    f"{KAMINO_SIDECAR_URL}/build/withdraw",
                    json={
                        "reserveAddress": vault_address,
                        "shares": shares,
                        "userWallet": wallet
                    },
                    timeout=15
                )
                if response.status_code == 200:
                    tx_data = response.json()
                    return jsonify({
                        "success": True,
                        "protocol": protocol,
                        "transaction": tx_data.get('transaction'),
                        "vault_address": vault_address
                    })
                else:
                    return jsonify({
                        "success": False,
                        "error": f"Kamino sidecar error: {response.text}"
                    }), 500
            except requests.exceptions.ConnectionError:
                return jsonify({
                    "success": False,
                    "error": "Kamino sidecar not available"
                }), 503

        elif protocol == 'hylo':
            return jsonify({
                "success": False,
                "error": "HyLo withdraw requires frontend SDK integration"
            }), 503
        else:
            return jsonify({
                "success": False,
                "error": f"Unknown protocol: {protocol}"
            }), 400

    except NotImplementedError as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 501
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@yield_bp.route('/api/yield/execute', methods=['POST'])
def api_yield_execute():
    """
    Execute a signed yield transaction and record the position.

    Body:
        signedTransaction: Base64 encoded signed transaction
        action: 'deposit' or 'withdraw'
        positionData: {
            protocol, vault_address, vault_name, deposit_token,
            deposit_symbol, amount, apy_at_deposit, wallet_address
        }

    Returns:
        signature: Transaction signature
    """
    from config import solana_client
    from solana.rpc.types import TxOpts

    data = request.json

    if 'signedTransaction' not in data:
        return jsonify({"success": False, "error": "Missing signedTransaction"}), 400

    action = data.get('action', 'deposit')
    position_data = data.get('positionData', {})

    try:
        # Decode and submit transaction
        tx_bytes = base64.b64decode(data['signedTransaction'])

        result = solana_client.send_raw_transaction(
            tx_bytes,
            opts=TxOpts(skip_preflight=False, preflight_commitment="confirmed")
        )
        signature = str(result.value)

        # Record position in database
        wallet = position_data.get('wallet_address', '')
        if wallet and action == 'deposit':
            position_id = db.save_yield_position(
                wallet_address=wallet,
                protocol=position_data.get('protocol', ''),
                vault_address=position_data.get('vault_address', ''),
                vault_name=position_data.get('vault_name', ''),
                deposit_token=position_data.get('deposit_token', ''),
                deposit_symbol=position_data.get('deposit_symbol', ''),
                amount=float(position_data.get('amount', 0)),
                shares=float(position_data.get('shares', 0)),
                apy_at_deposit=float(position_data.get('apy_at_deposit', 0)),
                deposit_signature=signature
            )

            # Broadcast position update
            socketio.emit('position_update', {
                'action': 'deposit',
                'wallet': wallet,
                'position_id': position_id,
                'signature': signature
            }, namespace='/yield')

        elif wallet and action == 'withdraw':
            db.update_yield_position_withdraw(
                wallet_address=wallet,
                vault_address=position_data.get('vault_address', ''),
                withdraw_amount=float(position_data.get('amount', 0)),
                withdraw_signature=signature
            )

            socketio.emit('position_update', {
                'action': 'withdraw',
                'wallet': wallet,
                'vault_address': position_data.get('vault_address', ''),
                'signature': signature
            }, namespace='/yield')

        return jsonify({
            "success": True,
            "signature": signature,
            "action": action
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# Socket.IO handlers for yield namespace
@socketio.on('connect', namespace='/yield')
def handle_yield_connect():
    """Handle yield socket connection."""
    print(f"[Yield] Client connected")


@socketio.on('request_opportunities', namespace='/yield')
def handle_request_opportunities():
    """Send current yield opportunities to requesting client."""
    try:
        opportunities = get_all_opportunities()
        opps_data = [opp.to_dict() for opp in opportunities]
        socketio.emit('opportunities_update', {
            'opportunities': opps_data,
            'timestamp': time.time()
        }, namespace='/yield')
    except Exception as e:
        print(f"[Yield] Error fetching opportunities: {e}")


@socketio.on('request_positions', namespace='/yield')
def handle_request_positions(data):
    """Send user's yield positions."""
    wallet = data.get('wallet') if data else None
    if not wallet:
        return

    try:
        positions = db.get_yield_positions(wallet, 'active')
        socketio.emit('positions_update', {
            'positions': positions,
            'timestamp': time.time()
        }, namespace='/yield')
    except Exception as e:
        print(f"[Yield] Error fetching positions: {e}")


# =============================================================================
# YIELD STRATEGY ROUTES
# =============================================================================

@yield_bp.route('/api/yield/strategies', methods=['GET'])
def api_yield_strategies():
    """
    Get yield strategies for a wallet.

    Query params:
        wallet: Wallet address
        strategy_type: Optional filter by type
        status: Status filter (default: 'active')
    """
    wallet = request.args.get('wallet')
    strategy_type = request.args.get('strategy_type')
    status = request.args.get('status', 'active')

    if not wallet:
        return jsonify({"success": False, "error": "Missing wallet parameter"}), 400

    try:
        strategies = db.get_yield_strategies(
            wallet_address=wallet,
            strategy_type=strategy_type,
            status=status
        )
        return jsonify({
            "success": True,
            "strategies": strategies,
            "count": len(strategies),
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies', methods=['POST'])
def api_create_yield_strategy():
    """
    Create a new yield strategy.

    Body:
        wallet_address: User's wallet
        strategy_type: 'yield_optimizer', 'risk_balanced', etc.
        name: Strategy display name
        description: Optional description
        config: Strategy configuration object
    """
    data = request.json

    required_fields = ['wallet_address', 'strategy_type', 'name']
    for field in required_fields:
        if field not in data:
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    try:
        strategy_id = db.save_yield_strategy(
            strategy_type=data['strategy_type'],
            wallet_address=data['wallet_address'],
            name=data['name'],
            description=data.get('description'),
            config=data.get('config', {}),
            state=data.get('state', {})
        )

        # Broadcast to WebSocket
        socketio.emit('strategy_created', {
            'strategy_id': strategy_id,
            'wallet': data['wallet_address'],
            'strategy_type': data['strategy_type']
        }, namespace='/yield')

        return jsonify({
            "success": True,
            "strategy_id": strategy_id,
            "message": f"Strategy '{data['name']}' created successfully"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/<int:strategy_id>', methods=['GET'])
def api_get_yield_strategy(strategy_id: int):
    """Get a specific yield strategy by ID."""
    try:
        strategy = db.get_yield_strategy(strategy_id)
        if not strategy:
            return jsonify({"success": False, "error": "Strategy not found"}), 404

        return jsonify({
            "success": True,
            "strategy": strategy,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/<int:strategy_id>', methods=['PUT'])
def api_update_yield_strategy(strategy_id: int):
    """
    Update a yield strategy.

    Body:
        config: Updated configuration
        status: New status ('active', 'paused')
        name: New name
        description: New description
    """
    data = request.json

    try:
        strategy = db.get_yield_strategy(strategy_id)
        if not strategy:
            return jsonify({"success": False, "error": "Strategy not found"}), 404

        updates = {}
        if 'config' in data:
            updates['config_json'] = data['config']
        if 'status' in data:
            updates['status'] = data['status']
        if 'name' in data:
            updates['name'] = data['name']
        if 'description' in data:
            updates['description'] = data['description']

        if updates:
            db.update_yield_strategy(strategy_id, updates)

        return jsonify({
            "success": True,
            "message": "Strategy updated"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/<int:strategy_id>', methods=['DELETE'])
def api_delete_yield_strategy(strategy_id: int):
    """Delete (mark as deleted) a yield strategy."""
    try:
        strategy = db.get_yield_strategy(strategy_id)
        if not strategy:
            return jsonify({"success": False, "error": "Strategy not found"}), 404

        db.delete_yield_strategy(strategy_id)

        return jsonify({
            "success": True,
            "message": "Strategy deleted"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/<int:strategy_id>/pause', methods=['POST'])
def api_pause_yield_strategy(strategy_id: int):
    """Pause a yield strategy."""
    try:
        db.pause_yield_strategy(strategy_id)
        return jsonify({"success": True, "message": "Strategy paused"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/<int:strategy_id>/resume', methods=['POST'])
def api_resume_yield_strategy(strategy_id: int):
    """Resume a paused yield strategy."""
    try:
        db.resume_yield_strategy(strategy_id)
        return jsonify({"success": True, "message": "Strategy resumed"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/<int:strategy_id>/logs', methods=['GET'])
def api_yield_strategy_logs(strategy_id: int):
    """Get execution logs for a yield strategy."""
    limit = request.args.get('limit', 50, type=int)

    try:
        logs = db.get_yield_strategy_logs(strategy_id, limit)
        return jsonify({
            "success": True,
            "logs": logs,
            "count": len(logs),
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@yield_bp.route('/api/yield/strategies/types', methods=['GET'])
def api_yield_strategy_types():
    """Get available strategy types and their configurations."""
    from services.yield_hunter.strategies import STRATEGY_REGISTRY

    types = []
    for name, cls in STRATEGY_REGISTRY.items():
        types.append({
            'type': name,
            'display_name': name.replace('_', ' ').title(),
            'default_config': cls.DEFAULT_CONFIG if hasattr(cls, 'DEFAULT_CONFIG') else {},
            'description': cls.__doc__.strip().split('\n')[0] if cls.__doc__ else ''
        })

    return jsonify({
        "success": True,
        "strategy_types": types,
        "timestamp": time.time()
    })
