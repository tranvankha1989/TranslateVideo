"""
backend/app/routers/admin_license.py
=====================================
API quản trị nội bộ dành cho Admin: Cấp key, Kiểm tra key, Reset trạng thái.
Bảo vệ bằng header X-Admin-Secret (chỉ dành cho môi trường phát triển).
"""

import os
import sys
import time
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

import json
import uuid
from datetime import datetime, timezone

from app.core.config import PROJECT_ROOT, logger

# Thêm thư mục tools vào sys.path để import keygen_cli
TOOLS_DIR = PROJECT_ROOT / "tools"
ISSUED_LICENSES_FILE = TOOLS_DIR / "issued_licenses.json"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from keygen_cli import issue_license, verify_license, ensure_keypair

router = APIRouter(prefix="/api/admin/license", tags=["Admin License"])

# Secret bảo vệ API admin (đọc từ biến môi trường, mặc định cho dev)
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "OMNIDEV2026")


# ─── Quản lý file lưu trữ key đã cấp (tools/issued_licenses.json) ─────────────
def _read_license_history() -> List[dict]:
    """Đọc toàn bộ lịch sử key đã cấp từ tools/issued_licenses.json."""
    if not ISSUED_LICENSES_FILE.exists():
        return []
    try:
        with open(ISSUED_LICENSES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"❌ Không thể đọc file issued_licenses.json: {e}")
        return []


def _save_license_history(records: List[dict]) -> None:
    """Lưu lịch sử key vào file tools/issued_licenses.json."""
    try:
        ISSUED_LICENSES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(ISSUED_LICENSES_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"❌ Không thể ghi file issued_licenses.json: {e}")


def _record_issued_license(
    hwid: str,
    license_key: str,
    tier: str,
    days: int,
    is_lifetime: bool,
    client_name: str = "",
) -> dict:
    """Tạo và lưu 1 bản ghi key mới vào lịch sử."""
    now_utc = datetime.now(timezone.utc)
    issued_at_str = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")

    # Tính expiry_date hiển thị
    if is_lifetime or days <= 0:
        expiry_date = "2099-12-31"
    else:
        from datetime import timedelta
        expiry_date = (now_utc + timedelta(days=days)).strftime("%Y-%m-%d")

    record = {
        "id": f"lic_{uuid.uuid4().hex[:8]}",
        "license_key": license_key,
        "hwid": hwid.strip().upper(),
        "tier": tier.upper(),
        "days": days,
        "is_lifetime": is_lifetime,
        "expiry_date": expiry_date,
        "client_name": client_name.strip(),
        "issued_at": issued_at_str,
    }

    records = _read_license_history()
    records.append(record)
    _save_license_history(records)
    return record


# ─── Dependency kiểm tra quyền Admin ──────────────────────────────────────────
def _check_admin_secret(x_admin_secret: str = Header(default="")):
    """Kiểm tra header X-Admin-Secret để xác thực quyền Admin."""
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Không có quyền truy cập. Vui lòng cung cấp X-Admin-Secret hợp lệ.",
        )


# ─── Request / Response Schemas ───────────────────────────────────────────────
class LicenseItem(BaseModel):
    id: str
    license_key: str
    hwid: str
    tier: str
    days: int
    is_lifetime: bool
    expiry_date: str
    client_name: str
    issued_at: str


class DeviceGroup(BaseModel):
    hwid: str
    client_name: str
    total_keys: int
    latest_issued_at: str
    has_active_lifetime: bool
    keys: List[LicenseItem]


class ListLicensesResponse(BaseModel):
    ok: bool
    total_devices: int
    total_keys: int
    total_lifetime: int
    devices: List[DeviceGroup]


class DeleteLicenseResponse(BaseModel):
    ok: bool
    deleted_id: str
    message: str


class IssueLicenseRequest(BaseModel):
    hwid: str = Field(..., description="Mã thiết bị (VD: TTS-XXXX-XXXX-XXXX-XXXX)")
    days: int = Field(default=0, description="Số ngày sử dụng (0 = Vĩnh viễn PRO)")
    tier: str = Field(default="PRO", description="Gói bản quyền (PRO, ENTERPRISE)")
    client_name: str = Field(default="", description="Tên hoặc ghi chú khách hàng")


class IssueLicenseResponse(BaseModel):
    ok: bool
    license_key: Optional[str] = None
    hwid: str
    tier: str
    days: int
    is_lifetime: bool
    message: str


class VerifyLicenseRequest(BaseModel):
    license_key: str = Field(..., description="License Key cần kiểm tra")


class VerifyLicenseResponse(BaseModel):
    ok: bool
    payload: Optional[dict] = None
    message: str


class ResetStateResponse(BaseModel):
    ok: bool
    hwid: str
    reset_timestamp: str
    message: str


class MachineInfoResponse(BaseModel):
    hwid: str


class WipeMachineResponse(BaseModel):
    ok: bool
    hwid: str
    cleared_items: List[str]
    message: str


# ─── Endpoints ────────────────────────────────────────────────────────────────
@router.get(
    "/machine-id",
    response_model=MachineInfoResponse,
    summary="Lấy HWID máy hiện tại (cho admin tiện điền form)",
)
async def get_current_machine_id(x_admin_secret: str = Header(default="")):
    _check_admin_secret(x_admin_secret)
    from app.services.license_service import get_machine_id
    return MachineInfoResponse(hwid=get_machine_id())


@router.post(
    "/issue",
    response_model=IssueLicenseResponse,
    summary="Cấp mã bản quyền mới (ký số Ed25519)",
)
async def admin_issue_license(
    req: IssueLicenseRequest,
    x_admin_secret: str = Header(default=""),
):
    _check_admin_secret(x_admin_secret)

    try:
        license_key = issue_license(
            hwid=req.hwid,
            days=req.days,
            tier=req.tier,
            client_name=req.client_name,
        )
        is_lifetime = req.days <= 0

        # Tự động lưu vào lịch sử key đã cấp (tools/issued_licenses.json)
        _record_issued_license(
            hwid=req.hwid,
            license_key=license_key,
            tier=req.tier,
            days=req.days,
            is_lifetime=is_lifetime,
            client_name=req.client_name,
        )

        logger.info(
            f"🔑 [Admin] Đã cấp key cho HWID={req.hwid}, "
            f"Tier={req.tier}, Days={'Vĩnh viễn' if is_lifetime else req.days}, "
            f"Client={req.client_name or 'N/A'}"
        )
        return IssueLicenseResponse(
            ok=True,
            license_key=license_key,
            hwid=req.hwid.strip().upper(),
            tier=req.tier.upper(),
            days=req.days,
            is_lifetime=is_lifetime,
            message=f"🎉 Đã tạo mã bản quyền {req.tier.upper()} thành công!",
        )
    except Exception as e:
        logger.error(f"❌ [Admin] Lỗi cấp key: {e}")
        return IssueLicenseResponse(
            ok=False,
            hwid=req.hwid,
            tier=req.tier,
            days=req.days,
            is_lifetime=req.days <= 0,
            message=f"Lỗi khi tạo key: {str(e)}",
        )


@router.get(
    "/list",
    response_model=ListLicensesResponse,
    summary="Lấy danh sách các key đã cấp, nhóm và sắp xếp theo Mã Thiết Bị (HWID)",
)
async def admin_list_licenses(x_admin_secret: str = Header(default="")):
    _check_admin_secret(x_admin_secret)
    records = _read_license_history()

    # Gom nhóm theo HWID
    grouped: dict[str, list[dict]] = {}
    for r in records:
        h = r.get("hwid", "UNKNOWN").strip().upper()
        grouped.setdefault(h, []).append(r)

    # Xây dựng danh sách DeviceGroup, sắp xếp theo HWID alphabet tăng dần
    devices: List[DeviceGroup] = []
    total_keys = len(records)
    total_lifetime = 0

    for h in sorted(grouped.keys()):
        device_records = grouped[h]
        # Trong mỗi thiết bị, xếp key mới nhất lên đầu
        device_records.sort(key=lambda x: x.get("issued_at", ""), reverse=True)

        recent_client = ""
        has_lifetime = False
        for rec in device_records:
            if rec.get("is_lifetime"):
                has_lifetime = True
                total_lifetime += 1
            if not recent_client and rec.get("client_name"):
                recent_client = rec.get("client_name")

        keys_items = [
            LicenseItem(
                id=rec.get("id", f"lic_{idx}"),
                license_key=rec.get("license_key", ""),
                hwid=h,
                tier=rec.get("tier", "PRO"),
                days=rec.get("days", 0),
                is_lifetime=rec.get("is_lifetime", False),
                expiry_date=rec.get("expiry_date", ""),
                client_name=rec.get("client_name", ""),
                issued_at=rec.get("issued_at", ""),
            )
            for idx, rec in enumerate(device_records)
        ]

        devices.append(
            DeviceGroup(
                hwid=h,
                client_name=recent_client or "N/A",
                total_keys=len(keys_items),
                latest_issued_at=device_records[0].get("issued_at", "") if device_records else "",
                has_active_lifetime=has_lifetime,
                keys=keys_items,
            )
        )

    return ListLicensesResponse(
        ok=True,
        total_devices=len(devices),
        total_keys=total_keys,
        total_lifetime=total_lifetime,
        devices=devices,
    )


@router.delete(
    "/records/{license_id}",
    response_model=DeleteLicenseResponse,
    summary="Xóa một mã key khỏi lịch sử quản lý",
)
async def admin_delete_license(
    license_id: str,
    x_admin_secret: str = Header(default=""),
):
    _check_admin_secret(x_admin_secret)
    records = _read_license_history()
    initial_count = len(records)
    records = [r for r in records if r.get("id") != license_id]
    if len(records) == initial_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã key này trong lịch sử")
    _save_license_history(records)
    return DeleteLicenseResponse(
        ok=True,
        deleted_id=license_id,
        message=f"Đã xoá bản ghi {license_id} thành công",
    )


@router.post(
    "/verify",
    response_model=VerifyLicenseResponse,
    summary="Kiểm tra tính hợp lệ của License Key",
)
async def admin_verify_license(
    req: VerifyLicenseRequest,
    x_admin_secret: str = Header(default=""),
):
    _check_admin_secret(x_admin_secret)

    try:
        _, public_key = ensure_keypair()
        payload = verify_license(req.license_key, public_key)
        return VerifyLicenseResponse(
            ok=True,
            payload=payload,
            message="✅ License hợp lệ! Chữ ký Ed25519 xác thực thành công.",
        )
    except Exception as e:
        return VerifyLicenseResponse(
            ok=False,
            message=f"❌ License không hợp lệ: {str(e)}",
        )


@router.post(
    "/reset-state",
    response_model=ResetStateResponse,
    summary="Reset mốc thời gian last_run và cờ tampered (dành cho QA test)",
)
async def admin_reset_state(x_admin_secret: str = Header(default="")):
    _check_admin_secret(x_admin_secret)

    try:
        from app.services.license_service import (
            _read_local_store,
            _save_local_store,
            get_machine_id,
        )
        from app.core.security.persistence import load_trial_state, save_trial_state

        hwid = get_machine_id()
        store = _read_local_store()
        trial = load_trial_state(hwid)
        now = time.time()

        if store:
            store["last_run_timestamp"] = now
            _save_local_store(store)

        if trial:
            trial["tampered"] = False
            trial["last_run_timestamp"] = now
            save_trial_state(hwid, trial)

        reset_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now))
        logger.info(f"✨ [Admin] Reset trạng thái cho HWID={hwid} tại {reset_time_str}")

        return ResetStateResponse(
            ok=True,
            hwid=hwid,
            reset_timestamp=reset_time_str,
            message=f"✨ Đã reset trạng thái kiểm tra thời gian về hiện tại ({reset_time_str}). Cờ tampered đã được giải phóng.",
        )
    except Exception as e:
        logger.error(f"❌ [Admin] Lỗi reset state: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi reset state: {str(e)}")


@router.post(
    "/wipe-machine",
    response_model=WipeMachineResponse,
    summary="Xóa sạch toàn bộ key và dấu vết trên máy (giống như cài lại Win)",
)
async def admin_wipe_machine(x_admin_secret: str = Header(default="")):
    """
    Xóa sạch hoàn toàn:
    1. File bản quyền đã kích hoạt (backend/.license_store.dat)
    2. Registry CLSID ẩn
    3. File hệ thống ẩn syscache.bin
    4. Alternate Data Stream NTFS (ntuser.ini:tts_metrics)
    Đưa máy trở về trạng thái máy mới tinh 100%.
    """
    _check_admin_secret(x_admin_secret)

    try:
        from app.services.license_service import (
            LICENSE_STORE_FILE,
            get_machine_id,
        )
        from app.core.security.persistence import clear_all_trial_traces

        hwid = get_machine_id()
        cleared_items = []

        # 1. Xóa file lưu license đã kích hoạt của máy
        if LICENSE_STORE_FILE.exists():
            try:
                LICENSE_STORE_FILE.unlink()
                cleared_items.append(f"License Key File: {LICENSE_STORE_FILE.name}")
            except Exception as e:
                logger.error(f"Lỗi khi xóa file license_store: {e}")

        # 2. Xóa tripple persistence traces
        traces = clear_all_trial_traces()
        cleared_items.extend(traces)

        logger.info(f"🧹 [Admin] Factory Reset toàn bộ bản quyền & dấu vết máy HWID={hwid}")

        return WipeMachineResponse(
            ok=True,
            hwid=hwid,
            cleared_items=cleared_items,
            message="🎉 Đã xóa sạch toàn bộ bản quyền và dấu vết trên máy hiện tại! Ứng dụng đã trở về trạng thái như vừa cài lại Windows.",
        )
    except Exception as e:
        logger.error(f"❌ [Admin] Lỗi wipe machine: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi khi dọn dẹp máy: {str(e)}")

