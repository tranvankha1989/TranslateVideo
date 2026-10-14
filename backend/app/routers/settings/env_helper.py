"""
app/routers/settings/env_helper.py
──────────────────────────────────
Tiện ích cập nhật và đồng bộ file .env an toàn.
"""

import os
import re
from pathlib import Path
from dotenv import load_dotenv

from app.core.config import (
    BASE_DIR,
    PROJECT_ROOT,
    logger,
)

ENV_FILE = BASE_DIR / ".env"


def update_env_file(updates: dict[str, str]) -> None:
    """Cập nhật các biến trong file .env an toàn mà không làm mất comment hay cấu trúc khác."""
    for key, val in updates.items():
        os.environ[key] = str(val)

    target_paths = []
    for candidate_dir in [BASE_DIR, PROJECT_ROOT, BASE_DIR.parent]:
        p = candidate_dir / ".env"
        if p.exists() or candidate_dir == BASE_DIR:
            if p not in target_paths:
                target_paths.append(p)

    for env_path in target_paths:
        content = ""
        if env_path.exists():
            try:
                content = env_path.read_text(encoding="utf-8")
            except Exception:
                try:
                    content = env_path.read_text(encoding="latin-1")
                except Exception:
                    content = ""

        for key, val in updates.items():
            pattern = rf"^{re.escape(key)}=.*$"
            replacement = f"{key}={val}"
            if re.search(pattern, content, flags=re.MULTILINE):
                content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
            else:
                if content and not content.endswith("\n"):
                    content += "\n"
                content += f"{replacement}\n"

        try:
            env_path.write_text(content, encoding="utf-8")
            load_dotenv(env_path, override=True)
        except Exception as e:
            logger.warning(f"Không thể ghi file .env tại {env_path}: {e}")
