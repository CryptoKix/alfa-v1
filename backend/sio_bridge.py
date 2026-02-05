"""Thread-safe Socket.IO emit bridge.

Provides a unified emit() function callable from any context:
- Async coroutines (FastAPI handlers)
- Sync background threads (gRPC callbacks, bot scheduler, etc.)

During migration: wraps flask_socketio.SocketIO.emit()
After migration: wraps python-socketio.AsyncServer.emit()
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger("sio_bridge")

# Will hold either flask_socketio.SocketIO or python-socketio.AsyncServer
_sio = None
_loop = None
_is_async = False


def init(sio_server, event_loop=None, is_async=False):
    """Initialize with the Socket.IO server instance.

    Args:
        sio_server: flask_socketio.SocketIO or python-socketio.AsyncServer
        event_loop: asyncio event loop (required for async mode)
        is_async: True if using python-socketio.AsyncServer
    """
    global _sio, _loop, _is_async
    _sio = sio_server
    _loop = event_loop
    _is_async = is_async
    logger.info(f"sio_bridge initialized (async={is_async})")


def emit(event: str, data: Any = None, namespace: str = '/', **kwargs):
    """Emit a Socket.IO event from any context.

    Thread-safe: can be called from background threads, gRPC callbacks,
    bot schedulers, etc. Automatically detects context and routes accordingly.
    """
    if _sio is None:
        logger.warning(f"sio_bridge.emit called before init: {event}")
        return

    if not _is_async:
        # Flask-SocketIO mode: direct emit (thread-safe in threading mode)
        return _sio.emit(event, data, namespace=namespace, **kwargs)

    # python-socketio AsyncServer mode
    try:
        loop = asyncio.get_running_loop()
        # We're in an async context — create task
        return loop.create_task(
            _sio.emit(event, data, namespace=namespace, **kwargs)
        )
    except RuntimeError:
        # We're in a sync thread — schedule on the main loop
        if _loop and _loop.is_running():
            asyncio.run_coroutine_threadsafe(
                _sio.emit(event, data, namespace=namespace, **kwargs),
                _loop
            )
        else:
            logger.warning(f"sio_bridge: event loop not running, dropping {event}")


def start_background_task(target, *args, **kwargs):
    """Start a background task (compatibility shim for flask_socketio).

    In Flask mode: delegates to socketio.start_background_task()
    In async mode: runs in a thread via the event loop
    """
    if _sio is None:
        logger.warning("sio_bridge.start_background_task called before init")
        return

    if not _is_async:
        return _sio.start_background_task(target, *args, **kwargs)

    # Async mode: run sync function in executor
    import threading
    t = threading.Thread(target=target, args=args, kwargs=kwargs, daemon=True)
    t.start()
    return t
