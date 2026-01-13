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
        arb_engine.start()
        return jsonify({"success": True, "message": "Arb Engine Initialized"})
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
