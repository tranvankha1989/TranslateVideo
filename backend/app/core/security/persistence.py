"""
backend/app/core/security/persistence.py
========================================
Module phân tán dấu vết Trial & chống gỡ cài đặt (Anti-Reinstall Persistence)
theo chuẩn thương mại an toàn (Commercial AppData Standards - Safe Persistence).

Đặc điểm an toàn:
1. TUYỆT ĐỐI KHÔNG CAN THIỆP REGISTRY (Tránh bị Antivirus gắn cờ COM Hijacking / Persistence Malware).
2. TUYỆT ĐỐI KHÔNG DÙNG NTFS ADS (Tránh bị Antivirus gắn cờ Hidden Stream Steganography).
3. Sử dụng các thư mục AppData chuẩn của Windows được Microsoft khuyến nghị:
   - Vị trí 1 (Local AppData): %LOCALAPPDATA%\\OmniVoice\\Data\\lic_cache.dat
   - Vị trí 2 (Roaming AppData): %APPDATA%\\OmniVoice\\Config\\app_state.dat
   - Vị trí 3 (ProgramData / Shared): %ProgramData%\\OmniVoice\\shared_lic.dat (hoặc ~/.omnivoice/shared_lic.dat)
4. Dữ liệu được mã hóa AES-256-GCM với khóa dẫn xuất từ HWID vật lý (PBKDF2 100.000 rounds).
5. Cơ chế đồng thuận (Consensus Engine) + Tự phục hồi (Self-healing).
6. Tự động dọn dẹp các tàn dư Registry / ADS cũ nếu còn sót lại từ các bản build trước.
"""

import os
import sys
import json
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger("Security.Persistence")

PERSISTENCE_SALT = "TTS_TRIAL_SECURITY_PERSISTENCE_SALT_2026_OFFLINE_GCM"

# Đường dẫn tàn dư cũ (Legacy) để dọn dẹp tránh bị AV quét lại
LEGACY_REG_COM_PATH = r"Software\Classes\CLSID\{8A7D4C12-65B3-4E89-9F12-3B4A5D6E7F80}"
LEGACY_REG_VALUE_NAME = "Data"
LEGACY_ADS_NAME = "ntuser.ini:tts_metrics"
_LEGACY_CLEANED = False


def _derive_aes_key(hwid: str) -> bytes:
    """Dẫn xuất khóa AES-256 (32 bytes) từ HWID thông qua PBKDF2."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=PERSISTENCE_SALT.encode("utf-8"),
        iterations=100_000,
    )
    return kdf.derive(hwid.strip().upper().encode("utf-8"))


def encrypt_payload(data: dict, hwid: str) -> str:
    """Mã hóa dictionary data thành chuỗi Base64 bằng AES-256-GCM ràng buộc HWID."""
    key = _derive_aes_key(hwid)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    raw_data = json.dumps(data, sort_keys=True).encode("utf-8")
    # Gắn hwid vào associated_data để chống chuyển đổi file giữa các máy
    aad = hwid.strip().upper().encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, raw_data, aad)
    # Ghép nonce + ciphertext và bọc Base64
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode("ascii")


def decrypt_payload(b64_str: str, hwid: str) -> Optional[dict]:
    """Giải mã chuỗi Base64 bằng AES-256-GCM. Trả về dict nếu toàn vẹn, None nếu bị can thiệp."""
    if not b64_str:
        return None
    try:
        combined = base64.b64decode(b64_str.encode("ascii"))
        if len(combined) < 28:  # 12 nonce + 16 tag
            return None
        nonce = combined[:12]
        ciphertext = combined[12:]
        key = _derive_aes_key(hwid)
        aesgcm = AESGCM(key)
        aad = hwid.strip().upper().encode("utf-8")
        plaintext = aesgcm.decrypt(nonce, ciphertext, aad)
        return json.loads(plaintext.decode("utf-8"))
    except Exception as e:
        logger.debug(f"Không thể giải mã payload (sai HWID hoặc file bị can thiệp): {e}")
        return None


# ─── 1. CÁC ĐƯỜNG DẪN LƯU TRỮ CHUẨN APPDATA (100% AN TOÀN VỚI ANTIVIRUS) ─────
def _get_localappdata_path() -> Path:
    """Vị trí 1: %LOCALAPPDATA%\\OmniVoice\\Data\\lic_cache.dat"""
    local = os.environ.get("LOCALAPPDATA")
    if local:
        base = Path(local)
    else:
        base = Path.home() / "AppData" / "Local"
    return base / "OmniVoice" / "Data" / "lic_cache.dat"


def _get_roamingappdata_path() -> Path:
    """Vị trí 2: %APPDATA%\\OmniVoice\\Config\\app_state.dat"""
    roaming = os.environ.get("APPDATA")
    if roaming:
        base = Path(roaming)
    else:
        base = Path.home() / "AppData" / "Roaming"
    return base / "OmniVoice" / "Config" / "app_state.dat"


def _get_shared_data_paths() -> List[Path]:
    """
    Vị trí 3: %ProgramData%\\OmniVoice\\shared_lic.dat
    Fallback sang ~/.omnivoice/shared_lic.dat nếu không có quyền ghi ProgramData.
    """
    paths = []
    pd = os.environ.get("ProgramData")
    if pd:
        paths.append(Path(pd) / "OmniVoice" / "shared_lic.dat")
    paths.append(Path.home() / ".omnivoice" / "shared_lic.dat")
    return paths


def _read_file_payload(file_path: Path, hwid: str) -> Optional[dict]:
    """Đọc và giải mã payload từ một đường dẫn file."""
    if not file_path.exists():
        return None
    try:
        content = file_path.read_text(encoding="ascii").strip()
        return decrypt_payload(content, hwid)
    except Exception:
        return None


def _write_file_payload(file_path: Path, data: dict, hwid: str) -> bool:
    """Mã hóa và ghi payload vào đường dẫn file."""
    try:
        encrypted = encrypt_payload(data, hwid)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(encrypted, encoding="ascii")
        return True
    except Exception as e:
        logger.debug(f"Không thể ghi file {file_path}: {e}")
        return False


# ─── 2. DỌN DẸP TÀN DƯ CŨ TRÁNH BỊ AV QUÉT (SILENT CLEANUP) ────────────────
def _cleanup_legacy_traces():
    """
    Âm thầm dọn dẹp các dấu vết Registry CLSID / NTFS ADS / file ngụy trang cũ
    để các máy đã từng chạy bản cũ không còn bị phần mềm diệt virus quét trúng.
    """
    global _LEGACY_CLEANED
    if _LEGACY_CLEANED:
        return
    _LEGACY_CLEANED = True

    if sys.platform != "win32":
        return

    # 1. Dọn dẹp Registry cũ
    try:
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, LEGACY_REG_COM_PATH, 0, winreg.KEY_SET_VALUE) as k:
                winreg.DeleteValue(k, LEGACY_REG_VALUE_NAME)
        except Exception:
            pass

        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, LEGACY_REG_COM_PATH)
        except Exception:
            pass
    except Exception:
        pass

    # 2. Dọn dẹp ADS cũ
    try:
        ads_path = Path.home() / LEGACY_ADS_NAME
        if os.path.exists(str(ads_path)):
            try:
                os.remove(str(ads_path))
            except Exception:
                pass
    except Exception:
        pass

    # 3. Dọn dẹp các file giả mạo Microsoft cũ
    legacy_files = [
        Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "Microsoft" / "Vault" / "syscache.bin",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Vault" / "syscache.bin",
        Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Crypto" / "syscache.bin",
    ]
    for lf in legacy_files:
        try:
            if lf.exists():
                lf.unlink()
        except Exception:
            pass


# ─── 3. ĐỒNG THUẬN (CONSENSUS ENGINE) ──────────────────────────────────────────
def load_trial_state(hwid: str) -> Optional[Dict[str, Any]]:
    """
    Đọc đồng thời từ 3 vị trí độc lập đạt chuẩn Windows AppData:
    1. %LOCALAPPDATA%\\OmniVoice\\Data\\lic_cache.dat
    2. %APPDATA%\\OmniVoice\\Config\\app_state.dat
    3. %ProgramData%\\OmniVoice\\shared_lic.dat (hoặc ~/.omnivoice/shared_lic.dat)

    Áp dụng thuật toán đồng thuận bảo mật:
    - Tự động dọn dẹp các tàn dư registry/ADS cũ nếu có.
    - Nếu 1 trong 3 vị trí báo is_expired = True -> Bắt buộc hết hạn.
    - Lấy install_timestamp nhỏ nhất (mốc bắt đầu sớm nhất).
    - Lấy last_run_timestamp lớn nhất (mốc chạy mới nhất).
    - Tự động phục hồi (Self-heal) các vị trí bị mất.
    """
    _cleanup_legacy_traces()

    p1 = _get_localappdata_path()
    p2 = _get_roamingappdata_path()
    shared_paths = _get_shared_data_paths()

    s1 = _read_file_payload(p1, hwid)
    s2 = _read_file_payload(p2, hwid)
    
    s3 = None
    for sp in shared_paths:
        s3 = _read_file_payload(sp, hwid)
        if s3:
            break

    states = [s for s in (s1, s2, s3) if s and isinstance(s, dict)]
    if not states:
        return None

    any_expired = any(s.get("is_expired") for s in states)
    any_tampered = any(s.get("tampered") for s in states)

    # Lấy install_timestamp xa nhất trong quá khứ để chống reset ngày
    install_ts = min(s.get("install_timestamp", float("inf")) for s in states)
    last_run_ts = max(s.get("last_run_timestamp", 0) for s in states)
    accumulated = max(s.get("accumulated_run_seconds", 0) for s in states)

    unified_state = {
        "install_timestamp": install_ts,
        "last_run_timestamp": last_run_ts,
        "accumulated_run_seconds": accumulated,
        "is_expired": any_expired,
        "tampered": any_tampered,
    }

    # Tự động đồng bộ phục hồi nếu có vị trí bị thiếu (Self-healing)
    if not (s1 and s2 and s3):
        logger.info("🛡️ [Persistence] Tự động phục hồi dấu vết bản quyền vào các vị trí bị thiếu.")
        save_trial_state(hwid, unified_state)

    return unified_state


def save_trial_state(hwid: str, data: dict) -> bool:
    """Ghi đồng bộ dữ liệu vào cả 3 vị trí an toàn."""
    p1 = _get_localappdata_path()
    p2 = _get_roamingappdata_path()
    shared_paths = _get_shared_data_paths()

    r1 = _write_file_payload(p1, data, hwid)
    r2 = _write_file_payload(p2, data, hwid)
    
    r3 = False
    for sp in shared_paths:
        if _write_file_payload(sp, data, hwid):
            r3 = True
            break

    return r1 or r2 or r3


def clear_all_trial_traces() -> List[str]:
    """
    Xóa sạch hoàn toàn toàn bộ dấu vết bản quyền ở cả 3 vị trí chuẩn
    và dọn sạch luôn các tàn dư cũ (Registry/ADS).
    Trả về danh sách các mục đã xóa thành công.
    """
    cleared = []

    # 1. Dọn dẹp tàn dư cũ (Registry & ADS)
    _cleanup_legacy_traces()
    cleared.append("Legacy Registry & ADS Cleanup: Complete")

    # 2. Xóa các vị trí AppData chuẩn
    target_files = [
        _get_localappdata_path(),
        _get_roamingappdata_path(),
    ] + _get_shared_data_paths()

    for p in target_files:
        try:
            if p.exists():
                p.unlink()
                cleared.append(f"AppData File: {p}")
        except Exception as e:
            logger.debug(f"Không thể xóa file {p}: {e}")

    return cleared
