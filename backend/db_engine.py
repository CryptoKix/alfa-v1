"""SQLAlchemy engine factory for TacTix.

Provides a process-level engine singleton shared by all threads/consumers
within a single process. Each separate process (price_server, sniper_outrider)
creates its own engine via get_engine().
"""
import sqlalchemy as sa

_engines = {}


def get_engine(url: str = None, pool_size: int = 10, max_overflow: int = 20) -> sa.Engine:
    """Get or create a process-level engine singleton.

    Args:
        url: Database URL. If None, reads from config.DATABASE_URL.
        pool_size: Number of persistent connections in the pool.
        max_overflow: Additional connections allowed on burst.

    Returns:
        SQLAlchemy Engine with QueuePool.
    """
    if url is None:
        from config import DATABASE_URL
        url = DATABASE_URL

    if url not in _engines:
        _engines[url] = sa.create_engine(
            url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=30,
            pool_recycle=1800,
            pool_pre_ping=True,
            echo=False,
        )
    return _engines[url]
