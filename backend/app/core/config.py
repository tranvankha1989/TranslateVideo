import os
import logging
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

import re
import shutil

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent if (BASE_DIR.parent / "bin").exists() or (BASE_DIR.parent / "frontend").exists() else BASE_DIR

def _sync_env_file(env_path: Path, example_path: Path) -> None:
    """
    Tự động đồng bộ các biến/cấu hình mới từ .env.example vào file .env của người dùng.
    - Bảo vệ 100% các giá trị người dùng đã thiết lập.
    - Tự động bổ sung các biến mới (TELEGRAM_BOT_TOKEN, MONGODB, R2,...) nếu chưa có.
    """
    if not example_path.exists():
        return
    if not env_path.exists():
        try:
            shutil.copyfile(str(example_path), str(env_path))
            return
        except Exception:
            return

    try:
        env_content = env_path.read_text(encoding="utf-8")
    except Exception:
        try:
            env_content = env_path.read_text(encoding="latin-1")
        except Exception:
            return

    try:
        example_content = example_path.read_text(encoding="utf-8")
    except Exception:
        try:
            example_content = example_path.read_text(encoding="latin-1")
        except Exception:
            return

    existing_keys = set(re.findall(r"^([A-Za-z0-9_]+)=", env_content, re.MULTILINE))
    example_lines = example_content.splitlines()

    missing_blocks = []
    current_block = []
    block_has_missing_key = False

    for line in example_lines:
        current_block.append(line)
        key_match = re.match(r"^([A-Za-z0-9_]+)=", line)
        if key_match:
            k = key_match.group(1)
            if k not in existing_keys:
                block_has_missing_key = True

        if not line.strip():
            if block_has_missing_key:
                missing_blocks.extend(current_block)
            current_block = []
            block_has_missing_key = False

    if block_has_missing_key and current_block:
        missing_blocks.extend(current_block)

    if missing_blocks:
        new_append = "\n" + "\n".join(missing_blocks) + "\n"
        try:
            updated_content = env_content.rstrip() + "\n" + new_append.lstrip()
            env_path.write_text(updated_content, encoding="utf-8")
        except Exception:
            pass

# Tự động đồng bộ và nạp biến môi trường .env một cách an toàn
for _b in [BASE_DIR, PROJECT_ROOT, BASE_DIR.parent]:
    _env_f = _b / ".env"
    _ex_f = _b / ".env.example"
    if _ex_f.exists():
        _sync_env_file(_env_f, _ex_f)
    if _env_f.exists():
        try:
            load_dotenv(str(_env_f), override=True)
            break
        except Exception:
            pass

POSSIBLE_VERSION_FILES = [
    PROJECT_ROOT / "version.json",
    BASE_DIR / "version.json",
    BASE_DIR.parent / "version.json",
]

def _resolve_app_version() -> str:
    for _v_path in POSSIBLE_VERSION_FILES:
        if _v_path.exists():
            try:
                import json
                with open(_v_path, "r", encoding="utf-8") as _f:
                    _d = json.load(_f)
                    if _d.get("version"):
                        return str(_d["version"]).strip()
            except Exception:
                pass
    return "3.10.4"

APP_VERSION: str = _resolve_app_version()

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


def get_custom_output_dir() -> Optional[Path]:
    """Lấy thư mục xuất file tùy chọn do người dùng cấu hình (nếu có và hợp lệ)."""
    custom = os.getenv("CUSTOM_OUTPUT_DIR", "").strip()
    if custom:
        try:
            p = Path(custom)
            if not p.exists():
                p.mkdir(parents=True, exist_ok=True)
            return p
        except Exception as e:
            logger.warning(f"Không thể truy cập thư mục CUSTOM_OUTPUT_DIR ({custom}): {e}")
            return None
    return None


def export_file_to_custom_directory(
    source_path: Path,
    sub_dir: str = "",
    custom_filename: Optional[str] = None,
) -> Optional[Path]:
    """
    Tự động sao chép file đầu ra vào thư mục lưu trữ tùy chọn của người dùng (nếu được kích hoạt).
    Sao chép kèm cả file phụ đề .srt tương ứng nếu tồn tại cùng thư mục.
    """
    if os.getenv("AUTO_SAVE_TO_CUSTOM_DIR", "true").lower() not in ("true", "1", "yes"):
        return None

    target_root = get_custom_output_dir()
    if not target_root:
        return None

    try:
        dest_dir = target_root / sub_dir if sub_dir else target_root
        dest_dir.mkdir(parents=True, exist_ok=True)

        target_name = custom_filename or source_path.name
        dest_file = dest_dir / target_name
        shutil.copy2(str(source_path), str(dest_file))
        logger.info(f"📂 [AUTO-SAVE] Đã tự động lưu file vào thư mục đích: {dest_file}")

        # Sao chép kèm file .srt nếu có
        base_stem = source_path.stem
        srt_candidate = source_path.parent / f"{base_stem}.srt"
        if srt_candidate.exists():
            dest_srt = dest_dir / f"{Path(target_name).stem}.srt"
            shutil.copy2(str(srt_candidate), str(dest_srt))
            logger.info(f"📂 [AUTO-SAVE] Đã tự động lưu file phụ đề kèm theo: {dest_srt}")

        return dest_file
    except Exception as e:
        logger.warning(f"⚠️ [AUTO-SAVE] Lỗi khi sao chép file vào {target_root}: {e}")
        return None



