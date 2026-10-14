"""
app/services/caption/whisper_engine.py
──────────────────────────────────────
Quản lý nạp và cache mô hình Faster-Whisper.
"""

import os
import logging
import torch
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Singleton Whisper Model
_whisper_model: WhisperModel | None = None
_current_model_size: str | None = None

# Đọc cấu hình Whisper từ .env (Kích hoạt large-v3 làm mô hình chuẩn cao cấp 1.55 tỷ tham số)
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "large-v3").strip().lower()


def get_whisper_model(model_size: str | None = None) -> WhisperModel:
    """Khởi tạo hoặc trả về instance Faster-Whisper đã cache."""
    global _whisper_model, _current_model_size

    target_size = model_size or WHISPER_MODEL_SIZE
    if _whisper_model is not None and _current_model_size == target_size:
        return _whisper_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    cpu_threads = max(1, os.cpu_count() or 4)

    logger.info(
        f"🎙️ Đang tải Faster-Whisper model '{target_size}' trên {device} (compute={compute_type}, cpu_threads={cpu_threads}) …"
    )
    _whisper_model = WhisperModel(
        target_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=2 if device == "cpu" else 1,
    )
    _current_model_size = target_size
    logger.info("✅ Tải Faster-Whisper thành công.")
    return _whisper_model
