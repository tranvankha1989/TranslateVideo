"""
backend/app/core/security/persistence.py
========================================
Module phân tán dấu vết Trial & chống gỡ cài đặt (Anti-Reinstall Persistence).
Bảo vệ trạng thái dùng thử (30 ngày) bằng cơ chế:
1. Mã hóa AES-256-GCM với khóa dẫn xuất từ HWID (PBKDF2HMAC 100.000 rounds).
2. Ghi song song vào 3 vị trí độc lập trên Windows:
   - Vị trí 1 (Registry ẩn): HKCU\Software\Classes\CLSID\{8A7D4C12-65B3-4E89-9F12-3B4A5D6E7F80}\Data
   - Vị trí 2 (File hệ thống ẩn): %ProgramData%\Microsoft\Vault\syscache.bin (hoặc %LOCALAPPDATA%\Microsoft\Vault\syscache.bin)
   - Vị trí 3 (Alternate Data Stream - NTFS): %USERPROFILE%\ntuser.ini:tts_metrics
3. Cơ chế đồng thuận (Consensus):
   - Nếu bất kỳ 1 trong 3 vị trí báo hết hạn hoặc > 30 ngày -> Khóa Trial.
   - Tự động phục hồi (Self-healing) vị trí bị xóa từ các vị trí còn lại.
"""

import os
import sys
import json
import base64
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger("Security.Persistence")

PERSISTENCE_SALT = "TTS_TRIAL_SECURITY_PERSISTENCE_SALT_2026_OFFLINE_GCM"
REG_COM_PATH = r"Software\Classes\CLSID\{8A7D4C12-65B3-4E89-9F12-3B4A5D6E7F80}"
REG_COM_VALUE_NAME = "Data"

ADS_STREAM_NAME = "ntuser.ini:tts_metrics"


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


# ─── 1. VỊ TRÍ 1: REGISTRY COM CLSID NGỤY TRANG ─────────────────────────────
def _read_from_registry(hwid: str) -> Optional[dict]:
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_COM_PATH) as k:
            val, _ = winreg.QueryValueEx(k, REG_COM_VALUE_NAME)
            return decrypt_payload(val, hwid)
    except Exception:
        return None


def _write_to_registry(data: dict, hwid: str) -> bool:
    if sys.platform != "win32":
        return False
    try:
        import winreg
        encrypted = encrypt_payload(data, hwid)
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_COM_PATH) as k:
            winreg.SetValueEx(k, REG_COM_VALUE_NAME, 0, winreg.REG_SZ, encrypted)
        return True
    except Exception as e:
        logger.debug(f"Không thể ghi Registry CLSID ẩn: {e}")
        return False


# ─── 2. VỊ TRÍ 2: FILE HỆ THỐNG ẨN SYSCACHE.BIN ──────────────────────────────
def _get_system_cache_paths() -> list[Path]:
    paths = []
    # Thử %ProgramData%
    pd = os.environ.get("ProgramData")
    if pd:
        paths.append(Path(pd) / "Microsoft" / "Vault" / "syscache.bin")
    # Thử %LOCALAPPDATA%
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        paths.append(Path(local_appdata) / "Microsoft" / "Vault" / "syscache.bin")
    # Thử %APPDATA%
    appdata = os.environ.get("APPDATA")
    if appdata:
        paths.append(Path(appdata) / "Microsoft" / "Crypto" / "syscache.bin")
    return paths


def _read_from_system_cache(hwid: str) -> Optional[dict]:
    for p in _get_system_cache_paths():
        if p.exists():
            try:
                content = p.read_text(encoding="ascii").strip()
                decrypted = decrypt_payload(content, hwid)
                if decrypted:
                    return decrypted
            except Exception:
                pass
    return None


def _write_to_system_cache(data: dict, hwid: str) -> bool:
    encrypted = encrypt_payload(data, hwid)
    written = False
    for p in _get_system_cache_paths():
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(encrypted, encoding="ascii")
            written = True
        except Exception:
            pass
    return written


# ─── 3. VỊ TRÍ 3: ALTERNATE DATA STREAM (NTFS ADS) ─────────────────────────
def _get_ads_path() -> Optional[Path]:
    if sys.platform != "win32":
        return None
    user_home = Path.home()
    return user_home / ADS_STREAM_NAME


def _read_from_ads(hwid: str) -> Optional[dict]:
    ads_file = _get_ads_path()
    if not ads_file:
        return None
    try:
        if os.path.exists(str(ads_file)):
            with open(str(ads_file), "r", encoding="ascii") as f:
                content = f.read().strip()
            return decrypt_payload(content, hwid)
    except Exception:
        pass
    return None


def _write_to_ads(data: dict, hwid: str) -> bool:
    ads_file = _get_ads_path()
    if not ads_file:
        return False
    try:
        encrypted = encrypt_payload(data, hwid)
        with open(str(ads_file), "w", encoding="ascii") as f:
            f.write(encrypted)
        return True
    except Exception as e:
        logger.debug(f"Không thể ghi NTFS ADS: {e}")
        return False


# ─── ĐỒNG THUẬN (CONSENSUS ENGINE) ──────────────────────────────────────────
def load_trial_state(hwid: str) -> Optional[Dict[str, Any]]:
    """
    Đọc đồng thời từ 3 vị trí độc lập:
    1. Registry CLSID
    2. File hệ thống ẩn syscache.bin
    3. Alternate Data Stream NTFS

    Áp dụng thuật toán đồng thuận bảo mật:
    - Nếu 1 trong 3 vị trí báo is_expired = True -> Bắt buộc hết hạn.
    - Lấy install_timestamp nhỏ nhất (mốc bắt đầu sớm nhất).
    - Lấy last_run_timestamp lớn nhất (mốc chạy mới nhất).
    - Tự động phục hồi (Self-heal) các vị trí bị mất.
    """
    s1 = _read_from_registry(hwid)
    s2 = _read_from_system_cache(hwid)
    s3 = _read_from_ads(hwid)

    states = [s for s in (s1, s2, s3) if s and isinstance(s, dict)]
    if not states:
        return None

    any_expired = any(s.get("is_expired") for s in states)
    any_tampered = any(s.get("tampered") for s in states)

    # Lấy install_timestamp xa nhất trong quá khứ để chống cài lại win lùi ngày
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

    # Tự động đồng bộ phục hồi nếu có vị trí bị thiếu
    if not (s1 and s2 and s3):
        logger.info("🛡️ [Persistence] Tự động phục hồi dấu vết bản quyền vào các vị trí bị thiếu.")
        save_trial_state(hwid, unified_state)

    return unified_state


def save_trial_state(hwid: str, data: dict) -> bool:
    """Ghi đồng bộ dữ liệu vào cả 3 vị trí."""
    r1 = _write_to_registry(data, hwid)
    r2 = _write_to_system_cache(data, hwid)
    r3 = _write_to_ads(data, hwid)
    return r1 or r2 or r3


def clear_all_trial_traces() -> list[str]:
    """
    Xóa sạch hoàn toàn toàn bộ dấu vết bản quyền ở cả 3 vị trí độc lập:
    1. Registry CLSID
    2. File hệ thống ẩn syscache.bin
    3. Alternate Data Stream NTFS (ADS)
    Trả về danh sách các mục đã xóa thành công.
    """
    cleared = []

    # 1. Xóa Registry
    if sys.platform == "win32":
        try:
            import winreg
            try:
                # Xóa value Data trước
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_COM_PATH, 0, winreg.KEY_SET_VALUE) as k:
                    winreg.DeleteValue(k, REG_COM_VALUE_NAME)
                cleared.append(f"Registry Value: {REG_COM_PATH}\\{REG_COM_VALUE_NAME}")
            except Exception:
                pass

            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, REG_COM_PATH)
                cleared.append(f"Registry Key: {REG_COM_PATH}")
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"Lỗi khi xóa Registry: {e}")

    # 2. Xóa các file syscache.bin
    for p in _get_system_cache_paths():
        try:
            if p.exists():
                p.unlink()
                cleared.append(f"System File: {p}")
        except Exception as e:
            logger.debug(f"Không thể xóa file {p}: {e}")

    # 3. Xóa NTFS ADS stream
    if sys.platform == "win32":
        ads_path = _get_ads_path()
        if ads_path:
            try:
                if os.path.exists(str(ads_path)):
                    # Ghi rỗng hoặc xóa
                    try:
                        os.remove(str(ads_path))
                    except Exception:
                        with open(str(ads_path), "w", encoding="ascii") as f:
                            f.write("")
                    cleared.append(f"NTFS ADS: {ads_path}")
            except Exception as e:
                logger.debug(f"Không thể xóa ADS stream: {e}")

    return cleared
