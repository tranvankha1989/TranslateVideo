"""
backend/app/services/license_service.py
=======================================
Dịch vụ Quản lý Bản quyền & Bảo mật Hệ thống (OmniVoice License & Security Service).
Tích hợp:
1. HWID Engine bất biến (CPU + Motherboard + Disk 0)
2. Ed25519 Asymmetric Verification Engine
3. Anti-Clock Rollback (GetTickCount64, Heartbeat 120s, FS Logs check)
4. Tripple-Breadcrumbs Persistence (Registry CLSID + syscache.bin + NTFS ADS)
5. Feature Gating Interceptors (TTS 2.000 ký tự, Dubbing 2 phút + watermark 45s, AutoCaption .srt 2 phút, Voice Clone 1 profile)
"""

import os
import sys
import time
import math
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

from app.core.config import PROJECT_ROOT, logger
from app.core.licensing.hwid import get_hardware_id, get_hwid_full_hash
from app.core.licensing.verifier import verify_license_key, get_public_key_fingerprint
from app.core.security.clock_monitor import (
    is_clock_tampered,
    get_tamper_reason,
    verify_against_last_run,
    start_heartbeat_monitor,
    stop_heartbeat_monitor,
)
from app.core.security.persistence import (
    load_trial_state,
    save_trial_state,
    encrypt_payload,
    decrypt_payload,
)

GLOBAL_APP_FEATURE_ID = "app_global"
TRIAL_DURATION_DAYS = 30
TRIAL_DURATION_SECONDS = TRIAL_DURATION_DAYS * 86400

# File lưu trạng thái bản quyền local
LICENSE_STORE_FILE = PROJECT_ROOT / "backend" / ".license_store.dat"
MASTER_KEYS = {"AIMABIETPRO", "OMNIPRO2026", "DEVELOPER_BYPASS_DEBUG"}


def _read_local_store() -> dict:
    """Đọc file lưu license local được mã hóa theo HWID."""
    if not LICENSE_STORE_FILE.exists():
        return {}
    try:
        hwid = get_hardware_id()
        raw = LICENSE_STORE_FILE.read_text(encoding="utf-8").strip()
        data = decrypt_payload(raw, hwid)
        return data or {}
    except Exception as e:
        logger.debug(f"Không thể đọc file local license: {e}")
        return {}


def _save_local_store(data: dict) -> bool:
    """Ghi file lưu license local mã hóa theo HWID."""
    try:
        hwid = get_hardware_id()
        enc = encrypt_payload(data, hwid)
        LICENSE_STORE_FILE.parent.mkdir(parents=True, exist_ok=True)
        LICENSE_STORE_FILE.write_text(enc, encoding="utf-8")
        return True
    except Exception as e:
        logger.error(f"Lỗi ghi file local license: {e}")
        return False


def get_machine_id() -> str:
    """Trả về HWID chuẩn TTS-XXXX-XXXX-XXXX-XXXX."""
    return get_hardware_id()


def _ensure_heartbeat_running(hwid: str):
    """Khởi động luồng Heartbeat nền (120s) cập nhật mốc last_run_timestamp."""
    def _read_last():
        st = load_trial_state(hwid)
        return st.get("last_run_timestamp", 0) if st else 0

    def _update_last(ts: float):
        st = load_trial_state(hwid)
        if st:
            st["last_run_timestamp"] = ts
            save_trial_state(hwid, st)

    start_heartbeat_monitor(
        read_last_run_func=_read_last,
        update_last_run_func=_update_last,
        interval_seconds=120,
    )


def get_feature_status(feature_id: str = GLOBAL_APP_FEATURE_ID) -> Dict[str, Any]:
    """
    Kiểm tra trạng thái bản quyền toàn app hoặc tính năng:
    1. Kiểm tra mã kích hoạt Ed25519 đã lưu
    2. Nếu chưa kích hoạt -> Kiểm tra trạng thái Trial & Chống lùi ngày hệ thống
    """
    hwid = get_hardware_id()
    store = _read_local_store()
    trial_state = load_trial_state(hwid) or {}
    now = time.time()

    saved_key = store.get("license_key")
    key_payload = None
    key_issued_ts = 0

    # Nếu có mã kích hoạt Ed25519 đã lưu, giải mã payload để lấy mốc cấp key (issued_at)
    if saved_key and saved_key.startswith("ED25519."):
        is_valid, key_payload, _ = verify_license_key(saved_key, expected_hwid=hwid)
        if is_valid and key_payload:
            issued_str = key_payload.get("issued_at", "")
            if issued_str:
                try:
                    from datetime import datetime, timezone
                    clean_issued = issued_str.replace(" UTC", "").strip()
                    dt = datetime.strptime(clean_issued, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    key_issued_ts = dt.timestamp()
                except Exception:
                    pass

    # 1. KIỂM TRA PHÁT HIỆN LÙI NGÀY HỆ THỐNG (CLOCK TAMPERING) TOÀN CỤC
    last_run = max(trial_state.get("last_run_timestamp", 0), store.get("last_run_timestamp", 0))

    # Sanitize: Nếu last_run cách now quá xa về tương lai (>30 ngày),
    # đó là dấu hiệu last_run bị "ô nhiễm" bởi thời gian ảo (VD: user từng dời ngày sang tương lai rồi quay về).
    # Tự động reset last_run về hiện tại thay vì block user.
    MAX_FUTURE_DRIFT_SECONDS = 30 * 86400  # 30 ngày
    if last_run > 0 and (last_run - now) > MAX_FUTURE_DRIFT_SECONDS:
        logger.warning(
            f"⚠️ [License Guard] Phát hiện last_run_timestamp ({last_run:.0f}) cách hiện tại ({now:.0f}) "
            f"quá {MAX_FUTURE_DRIFT_SECONDS // 86400} ngày về tương lai. Tự động sanitize về hiện tại."
        )
        last_run = now
        # Cập nhật lại last_run đã sanitize vào cả trial_state và store
        if trial_state:
            trial_state["last_run_timestamp"] = now
            save_trial_state(hwid, trial_state)
        if store:
            store["last_run_timestamp"] = now
            _save_local_store(store)

    is_drifted = is_clock_tampered()
    is_before_key_issue = (key_issued_ts > 0 and (now < key_issued_ts - 180))

    # Kiểm tra lùi ngày so với last_run (mốc chạy hợp lệ gần nhất):
    is_before_last_run = (last_run > 0 and verify_against_last_run(last_run))

    is_currently_tampered = is_drifted or is_before_last_run or is_before_key_issue

    if is_currently_tampered:
        tamper_msg = get_tamper_reason()
        if is_before_last_run and not tamper_msg:
            from datetime import datetime
            last_dt = datetime.fromtimestamp(last_run).strftime("%d/%m/%Y %H:%M")
            tamper_msg = f"Phát hiện đồng hồ hệ thống bị tua ngược so với mốc sử dụng gần nhất ({last_dt})."
        elif is_before_key_issue and not tamper_msg:
            tamper_msg = f"Thời gian hệ thống bị chỉnh lùi về trước thời điểm cấp bản quyền ({key_payload.get('issued_at')})."
        logger.warning(f"🚨 [License Guard] Hệ thống phát hiện lùi ngày giờ hệ điều hành! ({tamper_msg})")
        if trial_state:
            trial_state["tampered"] = True
            save_trial_state(hwid, trial_state)
        return {
            "unlocked": False,
            "tier": "tampered",
            "feature_id": feature_id,
            "machine_id": hwid,
            "days_left": 0,
            "message": tamper_msg or "Phát hiện thời gian hệ điều hành bị điều chỉnh lùi. Vui lòng đồng bộ lại ngày giờ internet.",
        }

    # Nếu hiện tại đồng hồ đã chuẩn hóa lại: tự động gỡ bỏ cờ tampered
    if trial_state.get("tampered"):
        logger.info("✨ [License Guard] Đồng hồ hệ thống đã được đồng bộ chuẩn lại. Tự động khôi phục bản quyền.")
        trial_state["tampered"] = False
        trial_state["last_run_timestamp"] = now
        save_trial_state(hwid, trial_state)

    # 2. XỬ LÝ NẾU ĐÃ KÍCH HOẠT LICENSE KEY HỢP LỆ
    if saved_key:
        if saved_key in MASTER_KEYS:
            store["last_run_timestamp"] = now
            _save_local_store(store)
            _ensure_heartbeat_running(hwid)
            return {
                "unlocked": True,
                "tier": "lifetime",
                "feature_id": feature_id,
                "machine_id": hwid,
                "days_left": None,
                "trial_used": True,
                "message": "Đã kích hoạt bản quyền Vĩnh viễn (Master Key).",
            }

        if key_payload:
            is_lifetime = key_payload.get("is_lifetime", False)
            expiry_str = key_payload.get("expiry_date", "")

            if is_lifetime:
                store["last_run_timestamp"] = now
                _save_local_store(store)
                _ensure_heartbeat_running(hwid)
                return {
                    "unlocked": True,
                    "tier": "lifetime",
                    "feature_id": feature_id,
                    "machine_id": hwid,
                    "days_left": None,
                    "trial_used": True,
                    "message": "Đã kích hoạt bản quyền Vĩnh viễn (PRO).",
                }
            else:
                from datetime import datetime, timezone
                exp_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                today = datetime.now(timezone.utc).date()
                days_left = max(0, (exp_date - today).days)
                if days_left > 0:
                    # Chỉ cập nhật mốc chạy khi bản quyền hợp lệ và còn hạn
                    store["last_run_timestamp"] = now
                    _save_local_store(store)
                    _ensure_heartbeat_running(hwid)
                    return {
                        "unlocked": True,
                        "tier": "pro_licensed",
                        "feature_id": feature_id,
                        "machine_id": hwid,
                        "days_left": days_left,
                        "trial_used": True,
                        "message": f"Bản quyền PRO đang hoạt động (Còn {days_left} ngày).",
                    }
                else:
                    # Key hết hạn: Dừng heartbeat để ngừng ghi last_run với thời gian có thể sai
                    stop_heartbeat_monitor()
                    return {
                        "unlocked": False,
                        "tier": "expired",
                        "feature_id": feature_id,
                        "machine_id": hwid,
                        "days_left": 0,
                        "trial_used": True,
                        "message": f"Bản quyền PRO đã hết hạn vào ngày {expiry_str}. Vui lòng nhập mã mới.",
                    }

    # 3. XỬ LÝ CHẾ ĐỘ DÙNG THỬ (TRIAL 30 NGÀY)
    # Lần đầu tiên chạy app trên máy: Khởi tạo dùng thử 30 ngày
    if not trial_state or not trial_state.get("install_timestamp"):
        logger.info(f"✨ [License Service] Khởi tạo phiên dùng thử 30 ngày cho thiết bị mới: {hwid}")
        new_state = {
            "install_timestamp": now,
            "last_run_timestamp": now,
            "accumulated_run_seconds": 0,
            "is_expired": False,
            "tampered": False,
        }
        save_trial_state(hwid, new_state)
        return {
            "unlocked": True,
            "tier": "trial",
            "feature_id": feature_id,
            "machine_id": hwid,
            "days_left": TRIAL_DURATION_DAYS,
            "trial_used": False,
            "message": f"Đang trong thời hạn dùng thử ({TRIAL_DURATION_DAYS} ngày).",
        }

    if trial_state.get("is_expired"):
        return {
            "unlocked": False,
            "tier": "expired",
            "feature_id": feature_id,
            "machine_id": hwid,
            "days_left": 0,
            "trial_used": True,
            "message": "Thời hạn 30 ngày dùng thử của thiết bị đã kết thúc. Vui lòng nhập mã bản quyền PRO.",
        }

    # Tính toán thời hạn trial còn lại
    install_time = trial_state.get("install_timestamp", now)
    elapsed = now - install_time

    if elapsed > TRIAL_DURATION_SECONDS:
        trial_state["is_expired"] = True
        save_trial_state(hwid, trial_state)
        return {
            "unlocked": False,
            "tier": "expired",
            "feature_id": feature_id,
            "machine_id": hwid,
            "days_left": 0,
            "trial_used": True,
            "message": "Thời hạn 30 ngày dùng thử của thiết bị đã kết thúc. Vui lòng nhập mã bản quyền PRO.",
        }

    # Còn hạn dùng thử hợp lệ
    days_left = max(1, math.ceil((TRIAL_DURATION_SECONDS - elapsed) / 86400))
    trial_state["last_run_timestamp"] = now
    save_trial_state(hwid, trial_state)

    return {
        "unlocked": True,
        "tier": "trial",
        "feature_id": feature_id,
        "machine_id": hwid,
        "days_left": days_left,
        "trial_used": True,
        "message": f"Bản quyền dùng thử đang hoạt động (Còn {days_left} ngày).",
    }


def activate_feature_key(key: str, feature_id: str = GLOBAL_APP_FEATURE_ID) -> Dict[str, Any]:
    """
    Xử lý kích hoạt mã bản quyền:
    - Nhập mã Ed25519 (Bắt đầu bằng ED25519.) -> Kiểm tra chữ ký và HWID
    - Master Keys khẩn cấp cho Developer
    """
    cleaned_key = key.strip()
    hwid = get_hardware_id()
    store = _read_local_store()

    # 1. Master Key dành riêng cho Developer
    if cleaned_key in MASTER_KEYS:
        now_ts = time.time()
        store["license_key"] = cleaned_key
        store["activated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        store["last_run_timestamp"] = now_ts
        _save_local_store(store)
        trial_state = load_trial_state(hwid)
        if trial_state and trial_state.get("tampered"):
            trial_state["tampered"] = False
            trial_state["last_run_timestamp"] = now_ts
            save_trial_state(hwid, trial_state)
        return {
            "ok": True,
            "tier": "lifetime",
            "days_left": None,
            "message": "🎉 Kích hoạt thành công bản quyền VĨNH VIỄN (Master Key)!",
        }

    # 2. Mã bản quyền chuẩn Ed25519
    if cleaned_key.startswith("ED25519."):
        is_valid, payload, msg = verify_license_key(cleaned_key, expected_hwid=hwid)
        if not is_valid:
            return {
                "ok": False,
                "message": msg,
            }

        # Lưu mã hợp lệ vào store
        now_ts = time.time()
        store["license_key"] = cleaned_key
        store["payload"] = payload
        store["activated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        store["last_run_timestamp"] = now_ts
        _save_local_store(store)

        trial_state = load_trial_state(hwid)
        if trial_state:
            trial_state["tampered"] = False
            trial_state["last_run_timestamp"] = now_ts
            save_trial_state(hwid, trial_state)

        tier = payload.get("tier", "PRO")
        is_lifetime = payload.get("is_lifetime", False)
        days_left = None
        if not is_lifetime:
            from datetime import datetime, timezone
            exp_date = datetime.strptime(payload.get("expiry_date", ""), "%Y-%m-%d").date()
            today = datetime.now(timezone.utc).date()
            days_left = max(0, (exp_date - today).days)

        return {
            "ok": True,
            "tier": "lifetime" if is_lifetime else "pro_licensed",
            "days_left": days_left,
            "message": f"🎉 Kích hoạt thành công bản quyền {tier}!",
        }

    return {
        "ok": False,
        "message": "Mã kích hoạt không đúng định dạng Ed25519 hoặc không hợp lệ. Vui lòng liên hệ Admin để nhận mã chuẩn.",
    }


# ─── FEATURE GATING INTERCEPTOR HELPERS ──────────────────────────────────────
def is_pro_licensed() -> bool:
    """Trả về True nếu ứng dụng đã được kích hoạt bản quyền chính thức (Vĩnh viễn hoặc Gói Pro có hạn)."""
    status = get_feature_status(GLOBAL_APP_FEATURE_ID)
    return status.get("unlocked") is True and status.get("tier") in ("lifetime", "pro_licensed")


def assert_tts_character_limit(text: str) -> None:
    """
    Kiểm tra giới hạn ký tự TTS:
    - Trial: Tối đa 2.000 ký tự / lần xuất âm thanh.
    - Pro: Không giới hạn (hoặc theo schema tối đa).
    """
    if not is_pro_licensed():
        if len(text) > 2000:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail="Chế độ dùng thử (Trial) giới hạn tối đa 2.000 ký tự / lần xuất âm thanh. "
                       "Vui lòng rút ngắn văn bản hoặc kích hoạt bản quyền PRO để xuất không giới hạn.",
            )


def assert_voice_clone_limit(current_custom_count: int) -> None:
    """
    Kiểm tra giới hạn Clone giọng:
    - Trial: Cho phép tạo và lưu tối đa 1 profile voice.
    - Pro: Không giới hạn.
    """
    if not is_pro_licensed():
        if current_custom_count >= 1:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=403,
                detail="Chế độ dùng thử (Trial) chỉ cho phép lưu tối đa 1 profile giọng tự tạo. "
                       "Vui lòng xóa giọng cũ hoặc kích hoạt bản quyền PRO để lưu không giới hạn giọng nói.",
            )


def get_video_dubbing_max_duration() -> Optional[float]:
    """
    Trả về thời lượng tối đa cho phép xử lý video (giây):
    - Trial: 120.0s (2 phút).
    - Pro: None (Không giới hạn).
    """
    if is_pro_licensed():
        return None
    return 120.0  # 2 phút


def should_apply_audio_watermark() -> bool:
    """Trả về True nếu cần chèn audio watermark mỗi 45s (chỉ áp dụng ở chế độ Trial)."""
    return not is_pro_licensed()
