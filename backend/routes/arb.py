from flask import Blueprint, jsonify, request
from extensions import socketio, db, helius
from services.tokens import get_token_symbol

arb_bp = Blueprint('arb', __name__)

# Arb engine reference (set by app.py)
arb_engine = None

def set_arb_engine(engine):
    global arb_engine
    arb_engine = engine

@arb_bp.route('/api/arb/start', methods=['POST'])
def api_arb_start():
    if arb_engine:
        data = request.json or {}
        auto_strike = data.get('autoStrike', False)
        jito_tip = float(data.get('jitoTip', 0.001))
        min_profit = float(data.get('minProfit', 0.1))
        
        arb_engine.update_config(auto_strike, jito_tip, min_profit)
        arb_engine.start()
        return jsonify({"success": True, "message": "Arb Engine Configured & Initialized"})
    return jsonify({"success": False, "error": "Arb Engine not found"}), 500

@arb_bp.route('/api/arb/status')
def api_arb_status():
    if arb_engine:
        return jsonify({
            "running": arb_engine._running,
            "pairs": len(arb_engine.monitored_pairs)
        })
    return jsonify({"running": False}), 404

# --- Pair Management ---

@arb_bp.route('/api/arb/pairs')
def api_arb_pairs():
    return jsonify(db.get_arb_pairs())

@arb_bp.route('/api/arb/pairs/add', methods=['POST'])
def api_arb_pairs_add():
    data = request.json
    input_mint = data.get('inputMint')
    output_mint = data.get('outputMint')
    amount = float(data.get('amount', 1.0))
    
    # Resolve symbols
    input_symbol = get_token_symbol(input_mint)
    output_symbol = get_token_symbol(output_mint)
    
    # Decimals fix for amount (lamports)
    input_decimals = 9
    if input_symbol == "USDC" or input_symbol == "USDT":
        input_decimals = 6
    
    # Convert ui amount to raw lamports/atoms
    raw_amount = amount * (10 ** input_decimals)
    
    db.save_arb_pair(input_mint, output_mint, input_symbol, output_symbol, raw_amount)
    
    if arb_engine:
        arb_engine.refresh()
        
    return jsonify({"success": True})

@arb_bp.route('/api/arb/pairs/delete', methods=['POST'])
def api_arb_pairs_delete():
    pair_id = request.json.get('id')
    db.delete_arb_pair(pair_id)

    if arb_engine:
        arb_engine.refresh()

    return jsonify({"success": True})


@arb_bp.route('/api/arb/strike', methods=['POST'])
def api_arb_strike():
    """Manually trigger an arb strike for a specific opportunity."""
    if not arb_engine:
        return jsonify({"success": False, "error": "Arb Engine not initialized"}), 500

    data = request.json
    if not data:
        return jsonify({"success": False, "error": "No opportunity data provided"}), 400

    # Build opportunity object from request
    opp = {
        'input_mint': data.get('input_mint'),
        'output_mint': data.get('output_mint'),
        'input_symbol': data.get('input_symbol'),
        'output_symbol': data.get('output_symbol'),
        'best_venue': data.get('best_venue'),
        'worst_venue': data.get('worst_venue'),
        'best_amount': int(data.get('best_amount', 0)),
        'worst_amount': int(data.get('worst_amount', 0)),
        'spread_pct': float(data.get('spread_pct', 0)),
        'input_amount': int(data.get('input_amount', 0)),
    }

    # Execute the strike
    try:
        arb_engine.execute_atomic_strike(opp)
        return jsonify({"success": True, "message": "Strike executed"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
