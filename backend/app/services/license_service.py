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
    Tính mã cài đặt / mở khóa theo ngày chuẩn đồng bộ 100% với bộ cài đặt Inno Setup.
    Thuật toán: Với mỗi chữ số x trong ddmmyyyy -> Chữ số = (x mod 4) + 1
    Ví dụ: Ngày 06/10/2026 (06102026) -> 13213133
    """
    valid_keys = []
    now = time.time()
    # Kiểm tra hôm nay, hôm qua và ngày mai (tránh lệch múi giờ)
    for offset in [0, -86400, 86400]:
        t_struct = time.localtime(now + offset)
        date_str = time.strftime("%d%m%Y", t_struct)  # VD: 06102026
        
        # Thuật toán chuẩn (x mod 4) + 1
        key = "".join(str((int(ch) % 4) + 1) for ch in date_str if ch.isdigit())
        valid_keys.append(key)
        
    return valid_keys


def _sign_data(data_dict: dict) -> str:
    """Tạo chữ ký HMAC cho dữ liệu để chống chỉnh sửa file."""
    raw = json.dumps(data_dict, sort_keys=True)
    return hmac.new(SECRET_SALT.encode(), raw.encode(), hashlib.sha256).hexdigest()


def _load_store() -> dict:
    """Đọc dữ liệu license từ file được bảo vệ."""
    if not LICENSE_FILE.exists():
        return {}
    try:
        with open(LICENSE_FILE, "r", encoding="utf-8") as f:
            store = json.load(f)
            
        sig = store.get("_signature")
        payload = {k: v for k, v in store.items() if k != "_signature"}
        if _sign_data(payload) != sig:
            logger.warning("⚠️ File license bị can thiệp trái phép!")
            return {}
        return payload
    except Exception as e:
        logger.error(f"Lỗi đọc file license: {e}")
        return {}


def _save_store(payload: dict) -> bool:
    """Ghi dữ liệu license có chữ ký số."""
    try:
        sig = _sign_data(payload)
        full_data = {**payload, "_signature": sig}
        with open(LICENSE_FILE, "w", encoding="utf-8") as f:
            json.dump(full_data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Lỗi lưu file license: {e}")
        return False


def get_feature_status(feature_id: str = "video_editor") -> Dict[str, Any]:
    """
    Kiểm tra trạng thái kích hoạt của tính năng.
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
                "message": f"Đang sử dụng bản Dùng thử (Còn {days_left} ngày).",
            }
        else:
            return {
                "unlocked": False,
                "tier": "expired",
                "feature_id": feature_id,
                "machine_id": machine_id,
                "days_left": 0,
                "trial_used": True,
                "message": "Thời hạn 30 ngày dùng thử đã kết thúc. Vui lòng nhập mã kích hoạt PRO để tiếp tục sử dụng.",
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
        "message": "Tính năng cao cấp PRO. Vui lòng nhập mã kích hoạt để sử dụng.",
    }


def activate_feature_key(key: str, feature_id: str = "video_editor") -> Dict[str, Any]:
    """
    Xử lý kích hoạt mã bản quyền hoặc mã dùng thử 'demo30'.
    """
    cleaned_key = key.strip().upper()
    machine_id = get_machine_id()
    store = _load_store()
    feat_data = store.get(feature_id, {})
    now = time.time()

    # 1. TRƯỜNG HỢP: MÃ DÙNG THỬ 30 NGÀY (DEMO30)
    if cleaned_key == "DEMO30":
        # Kiểm tra máy này đã từng dùng thử tính năng này chưa
        if feat_data.get("trial_used") or feat_data.get("tier") in ["trial", "expired"]:
            return {
                "ok": False,
                "message": "Thiết bị này đã từng kích hoạt 30 ngày dùng thử trước đó. Mỗi máy chỉ được trải nghiệm 1 lần duy nhất. Vui lòng nhập Mã kích hoạt bản quyền chính thức!",
            }
        
        # Kích hoạt 30 ngày dùng thử mới
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
            "message": "🎉 Chúc mừng bạn đã kích hoạt thành công 30 ngày trải nghiệm miễn phí tính năng Chỉnh Sửa Video PRO!",
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
            "message": "🎉 Kích hoạt thành công bản quyền VĨNH VIỄN tính năng PRO!",
        }

    # 3. TRƯỜNG HỢP: MÃ ĐỘNG THEO NGÀY
    daily_keys = _compute_daily_keys()
    if cleaned_key in daily_keys:
        store[feature_id] = {
            "machine_id": machine_id,
            "tier": "lifetime",
            "activated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "key_type": "DAILY_KEY",
        }
        _save_store(store)
        return {
            "ok": True,
            "tier": "lifetime",
            "days_left": None,
            "message": "🎉 Kích hoạt thành công bản quyền VĨNH VIỄN tính năng PRO!",
        }

    return {
        "ok": False,
        "message": "Mật mã kích hoạt không chính xác hoặc đã hết hạn trong ngày. Vui lòng liên hệ Admin để nhận mã mới.",
    }
