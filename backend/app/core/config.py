import os
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

APP_VERSION: str = "3.9.0"

# Đường dẫn thư mục gốc backend (thư mục chứa main.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent if (BASE_DIR.parent / "bin").exists() or (BASE_DIR.parent / "frontend").exists() else BASE_DIR

# 1. Tự động liên kết FFmpeg trong thư mục nội bộ bin/
BIN_DIR = PROJECT_ROOT / "bin"
if not BIN_DIR.exists():
    BIN_DIR = BASE_DIR / "bin"

if BIN_DIR.is_dir():
    os.environ["PATH"] = str(BIN_DIR) + os.pathsep + os.environ.get("PATH", "")
    ffmpeg_exe = BIN_DIR / "ffmpeg.exe"
    if ffmpeg_exe.is_file():
        os.environ["FFMPEG_BINARY"] = str(ffmpeg_exe)

# 2. Cấu hình nhận diện thư mục frontend tĩnh (Production dist)
POSSIBLE_DIST_PATHS = [
    PROJECT_ROOT / "frontend" / "dist",
    BASE_DIR / "frontend" / "dist",
    PROJECT_ROOT / "dist",
    BASE_DIR / "dist",
    PROJECT_ROOT / "resources" / "app" / "dist",
    PROJECT_ROOT / "resources" / "app.asar.unpacked" / "dist",
]
FRONTEND_DIST = next((p for p in POSSIBLE_DIST_PATHS if p.is_dir()), None)

OUTPUTS_DIR = BASE_DIR / "outputs"
OUTPUTS_DIR.mkdir(exist_ok=True)

CAPTIONS_DIR = OUTPUTS_DIR / "captions"
CAPTIONS_DIR.mkdir(exist_ok=True)

AUDIOS_DIR = OUTPUTS_DIR / "audios"
AUDIOS_DIR.mkdir(exist_ok=True)

PRESETS_DIR = BASE_DIR / "presets"
PRESETS_DIR.mkdir(exist_ok=True)

CUSTOM_VOICES_DIR = PRESETS_DIR / "custom"
CUSTOM_VOICES_DIR.mkdir(exist_ok=True)

CUSTOM_VOICES_JSON = PRESETS_DIR / "custom_voices.json"
if not CUSTOM_VOICES_JSON.exists():
    with open(CUSTOM_VOICES_JSON, "w", encoding="utf-8") as f:
        f.write("[]")

# File lưu trữ danh sách giọng cá nhân do khách hàng tự tạo (không bị Git ghi đè khi pull)
USER_CUSTOM_VOICES_JSON = PRESETS_DIR / "custom_voices_user.json"
if not USER_CUSTOM_VOICES_JSON.exists():
    with open(USER_CUSTOM_VOICES_JSON, "w", encoding="utf-8") as f:
        f.write("[]")

# Thư mục logs hệ thống tại thư mục gốc dự án
LOGS_DIR = PROJECT_ROOT / "logs" if PROJECT_ROOT.exists() else BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
APP_LOG_FILE = LOGS_DIR / "app.log"

DEFAULT_NUM_STEP = int(os.getenv("DEFAULT_NUM_STEP", "32"))

# Cấu hình Đồng bộ Đa thiết bị (Cloud Storage & Database)
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "omnivoice").strip()

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip()
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "").strip()
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "").strip().rstrip("/")

import sys
from logging.handlers import RotatingFileHandler

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ─── Cấu hình Ghi Nhật Ký Chi Tiết Từng Bước (Verbose / Debug Logging) ─────────
VERBOSE_LOGGING: bool = os.getenv("VERBOSE_LOGGING", "false").lower() in ("true", "1", "yes")

_initial_log_level = logging.DEBUG if VERBOSE_LOGGING else logging.INFO

# ─── Cấu hình Logging Đa Kênh (Console + Rotating File Log UTF-8) ─────────────
_log_format = logging.Formatter(
    "%(asctime)s [%(levelname)s] [%(name)s] — %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
)

# 1. Console Stream Handler
_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(_log_format)
_stream_handler.setLevel(_initial_log_level)

# 2. File Handler (Tự động xoay vòng: 10MB x 5 bản backup, chuẩn UTF-8)
_file_handler = RotatingFileHandler(
    APP_LOG_FILE,
    maxBytes=10 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(_log_format)
_file_handler.setLevel(_initial_log_level)

logging.basicConfig(
    level=_initial_log_level,
    handlers=[_stream_handler, _file_handler],
)

# Gắn handler cho cả uvicorn logging để bắt toàn bộ request/lỗi HTTP
for uvicorn_logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    uv_logger = logging.getLogger(uvicorn_logger_name)
    uv_logger.setLevel(_initial_log_level)
    if _file_handler not in uv_logger.handlers:
        uv_logger.addHandler(_file_handler)

logger = logging.getLogger("omnivoice")
logger.setLevel(_initial_log_level)


def is_verbose_logging() -> bool:
    """Kiểm tra xem chế độ ghi log chi tiết từng bước có đang bật hay không."""
    return VERBOSE_LOGGING


def set_verbose_logging(enabled: bool) -> bool:
    """
    Bật hoặc tắt chế độ ghi nhật ký chi tiết từng bước cho toàn bộ ứng dụng.
    - enabled=True: Đổi log level thành DEBUG, ghi lại tất cả các bước FFmpeg, Demucs, Whisper, LLM, TTS, Alignment.
    - enabled=False: Đổi log level thành INFO, ghi nhận như chế độ tiêu chuẩn bình thường.
    """
    global VERBOSE_LOGGING
    VERBOSE_LOGGING = enabled
    new_level = logging.DEBUG if enabled else logging.INFO

    root_log = logging.getLogger()
    root_log.setLevel(new_level)
    _stream_handler.setLevel(new_level)
    _file_handler.setLevel(new_level)
    logger.setLevel(new_level)

    for uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(uv_name).setLevel(new_level)

    if enabled:
        logger.info("🐞 [DEBUG-MODE] ĐÃ BẬT CHẾ ĐỘ GHI NHẬT KÝ CHI TIẾT TỪNG BƯỚC (VERBOSE LOGGING). Toàn bộ quá trình chạy sẽ được lưu vào app.log.")
    else:
        logger.info("ℹ️ [NORMAL-MODE] ĐÃ TẮT CHẾ ĐỘ GHI NHẬT KÝ CHI TIẾT. Hệ thống quay về mức ghi log tiêu chuẩn (INFO).")

    return VERBOSE_LOGGING


def log_verbose_step(step_name: str, message: str, details: dict | None = None) -> None:
    """
    Ghi nhật ký chi tiết từng bước của ứng dụng khi chế độ Verbose Logging được bật.
    Hỗ trợ in chi tiết payload, cấu hình, thời gian và dữ liệu trung gian để dễ dàng debug lỗi.
    """
    if not VERBOSE_LOGGING:
        return
    log_text = f"🔍 [DEBUG-STEP] [{step_name}] {message}"
    if details:
        try:
            import json
            detail_str = json.dumps(details, ensure_ascii=False, indent=2, default=str)
            log_text += f"\n    ↳ Dữ liệu chi tiết:\n{detail_str}"
        except Exception:
            log_text += f"\n    ↳ Dữ liệu: {details}"
    logger.info(log_text)


