"""
app/services/video_translation/constants.py
───────────────────────────────────────────
Hằng số lưu trữ, trạng thái tác vụ và các tiện ích hệ thống cho video translation.
"""

import os
import shutil
from pathlib import Path
from typing import Any

from app.core.config import OUTPUTS_DIR, logger

TRANSLATE_OUTPUT_DIR = OUTPUTS_DIR / "video_translate"
TRANSLATE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Bộ nhớ lưu trạng thái tiến trình các tác vụ dịch video
_TASK_STORE: dict[str, dict[str, Any]] = {}


def is_cloud_gpu_active() -> bool:
    try:
        import model_handler
        return model_handler.is_remote_gpu_enabled()
    except Exception:
        pass
    return os.getenv("USE_REMOTE_GPU", "").lower() in ("true", "1", "yes")


def format_duration_vietnamese(total_seconds: float) -> str:
    """Định dạng thời gian tính bằng giây thành chuỗi tiếng Việt dễ đọc (vd: 2 phút 15 giây)."""
    sec = int(round(total_seconds))
    mins = sec // 60
    rem_sec = sec % 60
    hrs = mins // 60
    rem_mins = mins % 60

    if hrs > 0:
        return f"{hrs} giờ {rem_mins} phút {rem_sec} giây" if rem_sec > 0 else f"{hrs} giờ {rem_mins} phút"
    if mins > 0:
        return f"{mins} phút {rem_sec} giây" if rem_sec > 0 else f"{mins} phút"
    return f"{sec} giây"


def get_ffmpeg_scale_filter(resolution: str | None) -> str | None:
    """
    Tạo chuỗi scale filter an toàn cho FFmpeg (ép chiều rộng và chiều cao luôn là số chẵn).
    Tránh lỗi 'width not divisible by 2' của x264 encoder.
    """
    if not resolution or resolution == "source":
        return None
    res = resolution.lower().strip()
    if res in ["720p", "hd"]:
        return "scale='min(1280,iw)':-2"
    elif res in ["1080p", "fhd"]:
        return "scale='min(1920,iw)':-2"
    elif res in ["2k", "1440p"]:
        return "scale='min(2560,iw)':-2"
    elif res in ["480p", "sd"]:
        return "scale='min(854,iw)':-2"
    return None


def cleanup_task_temp_files(task_dir: Path | str) -> None:
    """
    Dọn dẹp triệt để các file WAV/temp khổng lồ chiếm hàng trăm MB/GB sau khi hoàn tất hoặc lỗi:
    - raw_audio.wav
    - input_trimmed.mp4
    - demucs_out/ (Thư mục Demucs tạm)
    - compressed_*.opus / compressed_*.mp3
    Giữ lại file thành phẩm quan trọng:
    - final_translated.mp4, subtitles.srt, subtitles_original.srt
    - task_meta.json, dubbed_segments.json
    - no_vocals.wav (nhạc nền sạch để phục vụ re-dub Studio tức thì)
    """
    t_dir = Path(task_dir)
    if not t_dir.exists():
        return

    task_id = t_dir.name
    logger.info(f"🧹 [Cleanup] Bắt đầu dọn dẹp các tệp tạm thời giải phóng ổ cứng cho task: {task_id}")

    total_freed_bytes = 0

    # 1. Xóa các file audio thô/tạm nặng nề
    temp_file_patterns = [
        "raw_audio.wav",
        "input_trimmed.mp4",
        "compressed_*.opus",
        "compressed_*.mp3",
        "temp_*.wav",
        "temp_*.mp4",
        "*_temp.*",
    ]

    for pattern in temp_file_patterns:
        for f in t_dir.glob(pattern):
            try:
                if f.is_file():
                    size = f.stat().st_size
                    f.unlink(missing_ok=True)
                    total_freed_bytes += size
                    logger.debug(f"  - Đã xóa tệp tạm: {f.name} ({size / (1024 * 1024):.2f} MB)")
            except Exception as e:
                logger.debug(f"Không thể xóa tệp tạm {f.name}: {e}")

    # 2. Xóa thư mục demucs_out nếu có
    demucs_dir = t_dir / "demucs_out"
    if demucs_dir.exists() and demucs_dir.is_dir():
        try:
            for root, dirs, files in os.walk(demucs_dir):
                for file in files:
                    fp = Path(root) / file
                    try:
                        total_freed_bytes += fp.stat().st_size
                    except Exception:
                        pass
            shutil.rmtree(demucs_dir, ignore_errors=True)
            logger.debug(f"  - Đã xóa thư mục tạm: {demucs_dir.name}")
        except Exception as e:
            logger.debug(f"Không thể xóa thư mục demucs_out: {e}")

    freed_mb = total_freed_bytes / (1024 * 1024)
    logger.info(f"✨ [Cleanup] Hoàn tất dọn dẹp task {task_id}, giải phóng {freed_mb:.1f} MB đĩa cứng.")
