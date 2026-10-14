import os
import sys
import time
import json
import hmac
import hashlib
import math
from pathlib import Path
from typing import Dict, Any, Optional

from app.core.config import PROJECT_ROOT, logger

SECRET_SALT = "VT_AI_SECRET_LICENSE_SALT_2026_PRO_KEY_PROTECTION"
LICENSE_FILE = PROJECT_ROOT / "backend" / ".license_store.dat"
MASTER_KEYS = {"AIMABIET", "AIMABIETPRO", "OMNIPRO2026"}
GLOBAL_APP_FEATURE_ID = "app_global"

GENERIC_INVALID_MSG = "Mã kích hoạt không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ Admin để nhận mã mới."

# Thư mục sao lưu dự phòng ẩn trong %APPDATA% (Roaming)
APPDATA_DIR = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "VoiceSyncAI"
APPDATA_LICENSE_FILE = APPDATA_DIR / ".sys_lic.dat"
REG_KEY_PATH = r"Software\VoiceSyncAI\License"


def get_machine_id() -> str:
    """
    Lấy định danh duy nhất của phần cứng máy tính (Machine Fingerprint).
    Kết hợp Windows MachineGuid hoặc node UUID.
    """
    raw_id = ""
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
                raw_id, _ = winreg.QueryValueEx(key, "MachineGuid")
        except Exception:
            pass

    if not raw_id:
        import uuid
        raw_id = f"{uuid.getnode()}_{os.environ.get('COMPUTERNAME', 'DEFAULT')}"

    # Băm thành chuỗi ngắn định dạng VT-XXXX-XXXX
    h = hashlib.sha256(f"{raw_id}_{SECRET_SALT}".encode()).hexdigest().upper()
    return f"VT-{h[:4]}-{h[4:8]}"


def _compute_daily_keys() -> list[str]:
    """
    Tính mã cơ sở theo ngày chuẩn đồng bộ 100% với bộ cài đặt Inno Setup.
    Thuật toán: Với mỗi chữ số x trong ddmmyyyy -> Chữ số = (x mod 4) + 1
    Ví dụ: Ngày 14/10/2026 (14102026) -> 21213134
    """
    valid_keys = []
    now = time.time()
    # Kiểm tra hôm nay, hôm qua và ngày mai (tránh lệch múi giờ +-1 ngày)
    for offset in [0, -86400, 86400]:
        t_struct = time.localtime(now + offset)
        date_str = time.strftime("%d%m%Y", t_struct)
        key = "".join(str((int(ch) % 4) + 1) for ch in date_str if ch.isdigit())
        valid_keys.append(key)
    return valid_keys


def _sign_data(data_dict: dict) -> str:
    """Tạo chữ ký HMAC cho dữ liệu để chống chỉnh sửa file."""
    raw = json.dumps(data_dict, sort_keys=True)
    return hmac.new(SECRET_SALT.encode(), raw.encode(), hashlib.sha256).hexdigest()


def _read_from_registry() -> Optional[dict]:
    """Đọc dữ liệu bản quyền lưu trong Windows Registry (HKCU)."""
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY_PATH) as key:
            val, _ = winreg.QueryValueEx(key, "Payload")
            store = json.loads(val)
            sig = store.get("_signature")
            payload = {k: v for k, v in store.items() if k != "_signature"}
            if _sign_data(payload) == sig:
                return payload
    except Exception:
        pass
    return None


def _save_to_registry(payload: dict) -> None:
    """Lưu dữ liệu bản quyền vào Windows Registry (HKCU)."""
    if sys.platform != "win32":
        return
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_KEY_PATH) as key:
            sig = _sign_data(payload)
            full_data = {**payload, "_signature": sig}
            winreg.SetValueEx(key, "Payload", 0, winreg.REG_SZ, json.dumps(full_data))
    except Exception as e:
        logger.debug(f"Không thể ghi Registry HKCU: {e}")


def _read_from_appdata() -> Optional[dict]:
    """Đọc dữ liệu bản quyền từ thư mục Roaming AppData ẩn."""
    try:
        if not APPDATA_LICENSE_FILE.exists():
            return None
        with open(APPDATA_LICENSE_FILE, "r", encoding="utf-8") as f:
            store = json.load(f)
        sig = store.get("_signature")
        payload = {k: v for k, v in store.items() if k != "_signature"}
        if _sign_data(payload) == sig:
            return payload
    except Exception:
        pass
    return None


def _save_to_appdata(payload: dict) -> None:
    """Lưu dữ liệu bản quyền vào thư mục Roaming AppData ẩn."""
    try:
        APPDATA_DIR.mkdir(parents=True, exist_ok=True)
        sig = _sign_data(payload)
        full_data = {**payload, "_signature": sig}
        with open(APPDATA_LICENSE_FILE, "w", encoding="utf-8") as f:
            json.dump(full_data, f, indent=2)
    except Exception as e:
        logger.debug(f"Không thể ghi AppData backup: {e}")


def _load_store() -> dict:
    """
    Đọc dữ liệu license với cơ chế Tam giác phòng thủ:
    1. Kiểm tra File local (.license_store.dat)
    2. Nếu mất, khôi phục từ AppData Roaming hoặc Windows Registry
    """
    # 1. Đọc từ file local
    if LICENSE_FILE.exists():
        try:
            with open(LICENSE_FILE, "r", encoding="utf-8") as f:
                store = json.load(f)
            sig = store.get("_signature")
            payload = {k: v for k, v in store.items() if k != "_signature"}
            if _sign_data(payload) == sig:
                return payload
            else:
                logger.warning("⚠️ File local license bị can thiệp trái phép!")
        except Exception as e:
            logger.error(f"Lỗi đọc file local license: {e}")

    # 2. Khôi phục từ AppData hoặc Registry nếu file local bị xoá
    recovered = _read_from_appdata() or _read_from_registry()
    if recovered:
        logger.info("🛡️ Đã tự động khôi phục dữ liệu bản quyền từ bản sao lưu hệ thống.")
        _save_local_file(recovered)
        return recovered

    return {}


def _save_local_file(payload: dict) -> bool:
    """Ghi dữ liệu license vào file local."""
    try:
        sig = _sign_data(payload)
        full_data = {**payload, "_signature": sig}
        LICENSE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LICENSE_FILE, "w", encoding="utf-8") as f:
            json.dump(full_data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Lỗi lưu file local license: {e}")
        return False


def _save_store(payload: dict) -> bool:
    """
    Ghi đồng thời dữ liệu bản quyền vào 3 điểm:
    1. Local File
    2. Roaming AppData
    3. Windows Registry HKCU
    """
    ok = _save_local_file(payload)
    _save_to_appdata(payload)
    _save_to_registry(payload)
    return ok


def get_feature_status(feature_id: str = "app_global") -> Dict[str, Any]:
    """
    Kiểm tra trạng thái kích hoạt của toàn app hoặc tính năng cụ thể.
    """
    machine_id = get_machine_id()
    store = _load_store()
    feat_data = store.get(feature_id, {})

    # Kiểm tra máy có khớp không
    saved_machine = feat_data.get("machine_id")
    if saved_machine and saved_machine != machine_id:
        return {
            "unlocked": False,
            "tier": "locked",
            "feature_id": feature_id,
            "machine_id": machine_id,
            "days_left": 0,
            "message": "Bản quyền không khớp với thiết bị này.",
        }

    tier = feat_data.get("tier")

    if tier == "lifetime":
        return {
            "unlocked": True,
            "tier": "lifetime",
            "feature_id": feature_id,
            "machine_id": machine_id,
            "days_left": None,
            "message": "Đã kích hoạt bản quyền Vĩnh viễn (PRO).",
        }

    if tier == "trial":
        now = time.time()
        start_time = feat_data.get("start_time", 0)
        expire_time = feat_data.get("expire_time", 0)
        last_check = feat_data.get("last_check_time", start_time)

        # Chống tua lùi đồng hồ máy tính quá 1 giờ
        if now < (last_check - 3600):
            logger.warning("Phát hiện tua lùi ngày giờ hệ thống!")
            return {
                "unlocked": False,
                "tier": "tampered",
                "feature_id": feature_id,
                "machine_id": machine_id,
                "days_left": 0,
                "message": "Phát hiện thời gian hệ thống không hợp lệ. Vui lòng hiệu chỉnh lại ngày giờ.",
            }

        if now <= expire_time:
            # Cập nhật mốc kiểm tra mới nhất
            feat_data["last_check_time"] = now
            store[feature_id] = feat_data
            _save_store(store)

            days_left = max(1, math.ceil((expire_time - now) / 86400))
            return {
                "unlocked": True,
                "tier": "trial",
                "feature_id": feature_id,
                "machine_id": machine_id,
                "days_left": days_left,
                "message": f"Bản quyền đang hoạt động (Còn {days_left} ngày).",
            }
        else:
            return {
                "unlocked": False,
                "tier": "expired",
                "feature_id": feature_id,
                "machine_id": machine_id,
                "days_left": 0,
                "trial_used": True,
                "message": "Thời hạn sử dụng đã kết thúc. Vui lòng nhập mã kích hoạt mới để tiếp tục.",
            }

    # Chưa kích hoạt
    trial_used = feat_data.get("trial_used", False)
    return {
        "unlocked": False,
        "tier": "locked",
        "feature_id": feature_id,
        "machine_id": machine_id,
        "days_left": 0,
        "trial_used": trial_used,
        "message": "Ứng dụng chưa được kích hoạt. Vui lòng nhập mã kích hoạt để sử dụng.",
    }


def activate_feature_key(key: str, feature_id: str = "app_global") -> Dict[str, Any]:
    """
    Xử lý kích hoạt bản quyền:
    - Nếu là tính năng đơn lẻ (feature_id != 'app_global'): Vẫn giữ nguyên mã DEMO30 dùng thử 30 ngày.
    - Nếu là toàn app (feature_id == 'app_global'): Không nhận DEMO30.
    - Nhập Base Key (8 số) -> Vĩnh viễn (Lifetime PRO).
    - Nhập Base Key (8 số) + N (với 1 <= N <= 180) -> Kích hoạt N ngày (hỗ trợ cộng dồn thời gian).
    - Nhập quá 180 ngày hoặc sai cú pháp -> Chỉ báo lỗi chung, KHÔNG tiết lộ quy luật.
    - Master Keys (AIMABIET, ...) -> Mở khóa Vĩnh viễn.
    """
    cleaned_key = key.strip().upper()
    machine_id = get_machine_id()
    store = _load_store()
    feat_data = store.get(feature_id, {})
    now = time.time()

    # 1. TRƯỜNG HỢP: MÃ DÙNG THỬ CŨ DEMO30
    if cleaned_key == "DEMO30":
        # Không chấp nhận DEMO30 cho toàn app
        if feature_id == "app_global":
            return {
                "ok": False,
                "message": GENERIC_INVALID_MSG,
            }

        # Áp dụng cho các tính năng đơn lẻ (như video_editor)
        if feat_data.get("trial_used") or feat_data.get("tier") in ["trial", "expired"]:
            return {
                "ok": False,
                "message": "Thiết bị này đã từng kích hoạt 30 ngày dùng thử trước đó. Mỗi máy chỉ được trải nghiệm 1 lần duy nhất. Vui lòng nhập Mã kích hoạt bản quyền chính thức!",
            }

        expire_time = now + (30 * 86400)
        store[feature_id] = {
            "machine_id": machine_id,
            "tier": "trial",
            "start_time": now,
            "expire_time": expire_time,
            "last_check_time": now,
            "trial_used": True,
            "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        _save_store(store)
        return {
            "ok": True,
            "tier": "trial",
            "days_left": 30,
            "message": "🎉 Chúc mừng bạn đã kích hoạt thành công 30 ngày trải nghiệm tính năng!",
        }

    # 2. TRƯỜNG HỢP: MASTER KEY VĨNH VIỄN
    if cleaned_key in MASTER_KEYS:
        store[feature_id] = {
            "machine_id": machine_id,
            "tier": "lifetime",
            "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "key_type": "MASTER_KEY",
        }
        _save_store(store)
        return {
            "ok": True,
            "tier": "lifetime",
            "days_left": None,
            "message": "🎉 Kích hoạt thành công bản quyền VĨNH VIỄN!",
        }

    # 3. TRƯỜNG HỢP: MÃ ĐỘNG THEO NGÀY (CÓ THỜI HẠN HOẶC VĨNH VIỄN)
    daily_keys = _compute_daily_keys()

    # TH 3.1: Đúng 8 chữ số -> VĨNH VIỄN
    if len(cleaned_key) == 8:
        if cleaned_key in daily_keys:
            store[feature_id] = {
                "machine_id": machine_id,
                "tier": "lifetime",
                "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "key_type": "DAILY_LIFETIME_KEY",
            }
            _save_store(store)
            return {
                "ok": True,
                "tier": "lifetime",
                "days_left": None,
                "message": "🎉 Kích hoạt thành công bản quyền VĨNH VIỄN!",
            }
        else:
            return {
                "ok": False,
                "message": GENERIC_INVALID_MSG,
            }

    # TH 3.2: Trên 8 chữ số -> Base Key (8 số) + Số ngày sử dụng (N)
    elif len(cleaned_key) > 8:
        base_key = cleaned_key[:8]
        suffix = cleaned_key[8:]

        # Base key không khớp ngày hôm nay/hôm qua/ngày mai HOẶC suffix không phải là số
        if (base_key not in daily_keys) or (not suffix.isdigit()):
            return {
                "ok": False,
                "message": GENERIC_INVALID_MSG,
            }

        days = int(suffix)
        # Giới hạn an toàn: Tối đa 180 ngày và phải > 0
        # Nếu người dùng tự bịa số ngày > 180 -> Từ chối và chỉ báo thông báo chung, KHÔNG tiết lộ số 180
        if days <= 0 or days > 180:
            return {
                "ok": False,
                "message": GENERIC_INVALID_MSG,
            }

        # Kích hoạt hợp lệ: Tính toán ngày hết hạn (hỗ trợ cộng dồn nếu đang còn hạn)
        current_expire = feat_data.get("expire_time", 0) if feat_data.get("tier") == "trial" else 0
        base_time = max(now, current_expire)
        new_expire_time = base_time + (days * 86400)

        calc_days = max(1, math.ceil((new_expire_time - now) / 86400))

        store[feature_id] = {
            "machine_id": machine_id,
            "tier": "trial",
            "start_time": feat_data.get("start_time", now),
            "expire_time": new_expire_time,
            "last_check_time": now,
            "trial_used": True,
            "days_granted": days,
            "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "key_type": "DAILY_DYNAMIC_KEY",
        }
        _save_store(store)

        if current_expire > now:
            msg = f"🎉 Gia hạn thành công thêm {days} ngày sử dụng! (Tổng thời hạn còn {calc_days} ngày)"
        else:
            msg = f"🎉 Kích hoạt thành công {days} ngày sử dụng bản quyền!"

        return {
            "ok": True,
            "tier": "trial",
            "days_left": calc_days,
            "message": msg,
        }

    return {
        "ok": False,
        "message": GENERIC_INVALID_MSG,
    }
