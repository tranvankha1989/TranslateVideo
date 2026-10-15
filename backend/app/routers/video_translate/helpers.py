"""
app/routers/video_translate/helpers.py
──────────────────────────────────────
Shared background tasks set and form value helpers.
"""

import asyncio
from typing import Any

BACKGROUND_TASKS: set[asyncio.Task] = set()


def form_val(val: Any, default: Any = None) -> Any:
    """Trích xuất giá trị an toàn từ FastAPI Form."""
    if hasattr(val, "default"):
        return val.default
    return val if val is not None else default
