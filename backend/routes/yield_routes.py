#!/usr/bin/env python3
"""Yield Hunter API routes."""
import time
from flask import Blueprint, jsonify, request

from extensions import db, socketio
from services.yield_hunter import get_all_opportunities, get_opportunities_by_protocol, YieldOpportunity

yield_bp = Blueprint('yield', __name__)


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
