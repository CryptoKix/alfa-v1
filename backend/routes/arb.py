from flask import Blueprint, jsonify, request
from extensions import socketio

arb_bp = Blueprint('arb', __name__)

# Arb engine reference (set by app.py)
arb_engine = None

def set_arb_engine(engine):
    global arb_engine
    arb_engine = engine

@arb_bp.route('/api/arb/start', methods=['POST'])
def api_arb_start():
    if arb_engine:
        # If it's already running, we can treat it as a refresh/restart
        arb_engine.start() # start() handles its own "already running" check
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
