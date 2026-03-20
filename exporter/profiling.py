# exporter/profiling.py

"""
Profiling utilities for the exporter module.

This module provides a combined profiler that supports both:
- Context manager-based section profiling (for code blocks)
- Decorator-based function profiling (for frequently-called functions)

Usage:
    from exporter.profiling import profiler

    # Enable profiling
    profiler.enabled = True

    # Decorator for functions
    @profiler.profile()
    def analyze_rule(...):
        ...

    # Context manager for sections
    def export_game_rules(...):
        with profiler.section("prepare_data"):
            data = prepare_export_data(...)

    # Get report
    print(profiler.report())
"""

import time
import functools
import os
from contextlib import contextmanager
from collections import defaultdict
from typing import Optional, Dict, Any, Callable


class ExporterProfiler:
    """
    Combined profiler supporting both context managers and decorators.

    Features:
    - Hierarchical section timing with context managers
    - Function profiling with decorators
    - Min/max/avg statistics
    - Single-instance pattern for global access
    - Toggle via `enabled` property
    """

    _instance: Optional['ExporterProfiler'] = None

    def __init__(self):
        self.timings: Dict[str, Dict[str, Any]] = defaultdict(
            lambda: {"count": 0, "total": 0.0, "min": float('inf'), "max": 0.0}
        )
        self.stack: list = []
        self._enabled: bool = False

    @classmethod
    def get(cls) -> 'ExporterProfiler':
        """Get the singleton profiler instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def enabled(self) -> bool:
        """Check if profiling is enabled."""
        return self._enabled

    @enabled.setter
    def enabled(self, value: bool):
        """Enable or disable profiling."""
        self._enabled = value
        if value:
            self.reset()  # Clear previous data when enabling

    def _record(self, name: str, elapsed: float):
        """Record a timing measurement."""
        entry = self.timings[name]
        entry["count"] += 1
        entry["total"] += elapsed
        entry["min"] = min(entry["min"], elapsed)
        entry["max"] = max(entry["max"], elapsed)

    @contextmanager
    def section(self, name: str):
        """
        Profile a code block using a context manager.

        Creates hierarchical timing when nested (e.g., "parent > child").

        Usage:
            with profiler.section("my_section"):
                # code to profile
        """
        if not self._enabled:
            yield
            return

        # Create hierarchical name if nested
        parent = self.stack[-1] if self.stack else None
        full_name = f"{parent} > {name}" if parent else name
        self.stack.append(full_name)

        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed = time.perf_counter() - start
            self._record(full_name, elapsed)
            self.stack.pop()

    def profile(self, name: Optional[str] = None) -> Callable:
        """
        Decorator to profile a function.

        Usage:
            @profiler.profile()
            def my_function():
                ...

            @profiler.profile("custom_name")
            def another_function():
                ...
        """
        def decorator(func: Callable) -> Callable:
            func_name = name or func.__qualname__

            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                if not self._enabled:
                    return func(*args, **kwargs)

                start = time.perf_counter()
                try:
                    return func(*args, **kwargs)
                finally:
                    elapsed = time.perf_counter() - start
                    self._record(func_name, elapsed)

            return wrapper
        return decorator

    def report(self) -> str:
        """
        Generate a human-readable profiling report.

        Returns a formatted string with timing statistics sorted by total time.
        """
        if not self.timings:
            return "No profiling data collected."

        lines = [
            "",
            "=" * 70,
            "EXPORTER PROFILING REPORT",
            "=" * 70,
            ""
        ]

        # Sort by total time descending
        sorted_items = sorted(
            self.timings.items(),
            key=lambda x: -x[1]["total"]
        )

        for name, data in sorted_items:
            avg = data["total"] / data["count"] if data["count"] else 0
            min_val = data["min"] if data["min"] != float('inf') else 0

            lines.append(f"{name}:")
            lines.append(
                f"  total: {data['total']:.3f}s | "
                f"calls: {data['count']} | "
                f"avg: {avg*1000:.2f}ms | "
                f"min: {min_val*1000:.2f}ms | "
                f"max: {data['max']*1000:.2f}ms"
            )
            lines.append("")

        lines.append("=" * 70)
        return "\n".join(lines)

    def report_dict(self) -> Dict[str, Dict[str, Any]]:
        """
        Return profiling data as a dictionary.

        Useful for programmatic analysis or JSON export.
        """
        result = {}
        for name, data in self.timings.items():
            avg = data["total"] / data["count"] if data["count"] else 0
            result[name] = {
                "total_seconds": data["total"],
                "count": data["count"],
                "avg_ms": avg * 1000,
                "min_ms": data["min"] * 1000 if data["min"] != float('inf') else 0,
                "max_ms": data["max"] * 1000
            }
        return result

    def reset(self):
        """Clear all profiling data."""
        self.timings.clear()
        self.stack.clear()


# Singleton instance for easy import
profiler = ExporterProfiler.get()


def is_profiling_enabled() -> bool:
    """
    Check if profiling should be enabled based on environment variable.

    Set EXPORTER_PROFILING=1 to enable profiling.
    """
    return os.environ.get('EXPORTER_PROFILING', '').lower() in ('1', 'true', 'yes')


def auto_enable_from_env():
    """
    Automatically enable profiling if EXPORTER_PROFILING env var is set.

    Call this at module load time if desired.
    """
    if is_profiling_enabled():
        profiler.enabled = True
