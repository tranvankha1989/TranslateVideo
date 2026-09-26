import os
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

APP_VERSION: str = "2.8.3"

# Đường dẫn thư mục gốc backend (thư mục chứa main.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent
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
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Logging cấu hình chung
_log_handler = logging.StreamHandler(sys.stdout)
_log_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(levelname)s] %(name)s — %(message)s", datefmt="%H:%M:%S")
)
logging.basicConfig(
    level=logging.INFO,
    handlers=[_log_handler],
)
logger = logging.getLogger("omnivoice")
