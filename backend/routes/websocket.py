#!/usr/bin/env python3
"""WebSocket (SocketIO) event handlers for TacTix.

NOTE: These handlers are now registered in main.py using python-socketio's
@sio.on() decorators. This file is kept for backward compatibility with
the old app.py entry point but is NOT used by the FastAPI server.
"""


def register_websocket_handlers():
    """Legacy stub — handlers now live in main.py as @sio.on() handlers."""
    pass
