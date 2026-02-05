#!/usr/bin/env python3
"""Centralized service registry for TacTix backend.

Provides a single point for service registration, lifecycle management,
gRPC wiring, and status reporting. Adding a new service is a 1-line
registry.register() call in app.py.
"""
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

logger = logging.getLogger("service_registry")


@runtime_checkable
class TactixService(Protocol):
    """Protocol satisfied by all TacTix backend services."""
    def start(self) -> None: ...
    def stop(self) -> None: ...
    def is_running(self) -> bool: ...


@dataclass
class ServiceDescriptor:
    """Metadata for a registered service — drives UI and lifecycle."""
    key: str                          # "copy_trader"
    name: str                         # "Copy Trader"
    description: str                  # UI description string
    icon: str                         # Lucide icon name
    color: str                        # Theme color token
    toggleable: bool = True           # Can the user start/stop from UI?
    auto_start: bool = False          # Start automatically on boot?
    needs_stream: str | None = None   # Method name for gRPC wiring, e.g. "set_stream_manager"


class ServiceRegistry:
    """Singleton registry for all TacTix backend services."""

    def __init__(self):
        self._services: dict[str, Any] = {}
        self._descriptors: dict[str, ServiceDescriptor] = {}

    def register(self, descriptor: ServiceDescriptor, instance: Any) -> None:
        """Register a service instance with its descriptor."""
        key = descriptor.key
        if key in self._services:
            logger.warning(f"Service '{key}' already registered, overwriting")
        self._services[key] = instance
        self._descriptors[key] = descriptor
        logger.info(f"Registered service: {descriptor.name} ({key})")

    def get(self, key: str) -> Any | None:
        """Lookup a service by key. Returns None if not registered."""
        return self._services.get(key)

    def get_descriptor(self, key: str) -> ServiceDescriptor | None:
        """Lookup a service descriptor by key."""
        return self._descriptors.get(key)

    def keys(self) -> list[str]:
        """Return all registered service keys."""
        return list(self._services.keys())

    def set_stream_manager(self, stream_manager: Any) -> None:
        """Auto-wire gRPC stream manager into all services that declared needs_stream."""
        wired = []
        for key, desc in self._descriptors.items():
            if desc.needs_stream:
                svc = self._services[key]
                method = getattr(svc, desc.needs_stream, None)
                if method:
                    method(stream_manager)
                    wired.append(key)
                else:
                    logger.warning(f"Service '{key}' declared needs_stream='{desc.needs_stream}' but method not found")
        if wired:
            logger.info(f"gRPC stream wired to: {', '.join(wired)}")

    def start_all(self, auto_only: bool = True) -> None:
        """Start services. If auto_only=True, only start those with auto_start=True."""
        for key, desc in self._descriptors.items():
            if auto_only and not desc.auto_start:
                continue
            svc = self._services[key]
            try:
                if not svc.is_running():
                    svc.start()
                    logger.info(f"Auto-started service: {desc.name}")
            except Exception as e:
                logger.error(f"Failed to auto-start '{key}': {e}")

    def stop_all(self) -> None:
        """Gracefully stop all running services."""
        for key, svc in self._services.items():
            try:
                if svc.is_running():
                    svc.stop()
                    logger.info(f"Stopped service: {key}")
            except Exception as e:
                logger.error(f"Error stopping '{key}': {e}")

    def get_all_status(self) -> dict:
        """Build status dict for all registered services (for API endpoints)."""
        statuses = {}
        for key, desc in self._descriptors.items():
            svc = self._services.get(key)
            try:
                is_running = svc.is_running() if svc else False
                statuses[key] = {
                    'name': desc.name,
                    'description': desc.description,
                    'icon': desc.icon,
                    'color': desc.color,
                    'running': is_running,
                    'initialized': svc is not None,
                }
            except Exception as e:
                statuses[key] = {
                    'name': desc.name,
                    'description': desc.description,
                    'icon': desc.icon,
                    'color': desc.color,
                    'running': False,
                    'initialized': False,
                    'error': str(e),
                }
        return statuses


# Module-level singleton
registry = ServiceRegistry()
