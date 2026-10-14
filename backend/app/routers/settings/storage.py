"""
app/routers/settings/storage.py
───────────────────────────────
Router quản lý thư mục lưu trữ đầu ra (Custom Output Directory)
và tương tác với File Explorer / Folder Dialog Windows.
"""

import os
import sys
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import OUTPUTS_DIR, logger
from app.routers.settings.env_helper import update_env_file

router = APIRouter()


class UpdateOutputDirRequest(BaseModel):
    custom_output_dir: str
    auto_save_enabled: Optional[bool] = True


class OpenOutputDirRequest(BaseModel):
    path: Optional[str] = None


@router.get("/output-directory", summary="Lấy thông tin thư mục lưu trữ đầu ra")
async def get_output_directory():
    """Trả về thư mục lưu trữ hiện tại (mặc định hoặc tùy chọn do người dùng đặt)."""
    custom_dir = os.getenv("CUSTOM_OUTPUT_DIR", "").strip()
    default_dir = str(OUTPUTS_DIR.resolve())
    current_dir = custom_dir if (custom_dir and os.path.isdir(custom_dir)) else default_dir
    return {
        "custom_output_dir": custom_dir,
        "default_output_dir": default_dir,
        "current_output_dir": current_dir,
        "is_custom": bool(custom_dir and os.path.isdir(custom_dir)),
        "auto_save_enabled": os.getenv("AUTO_SAVE_TO_CUSTOM_DIR", "true").lower() in ("true", "1", "yes"),
    }


@router.post("/output-directory", summary="Cập nhật thư mục lưu trữ đầu ra tùy chọn")
async def update_output_directory(req: UpdateOutputDirRequest):
    """Cập nhật thư mục đích lưu trữ file audio/video xuất ra."""
    raw_path = req.custom_output_dir.strip()
    auto_save_str = "true" if req.auto_save_enabled else "false"

    if not raw_path:
        update_env_file({
            "CUSTOM_OUTPUT_DIR": "",
            "AUTO_SAVE_TO_CUSTOM_DIR": auto_save_str,
        })
        return {
            "status": "ok",
            "message": "Đã đặt lại về thư mục lưu trữ mặc định của hệ thống.",
            "current_output_dir": str(OUTPUTS_DIR.resolve()),
            "is_custom": False,
            "auto_save_enabled": req.auto_save_enabled,
        }

    target = Path(raw_path)
    try:
        target.mkdir(parents=True, exist_ok=True)
        test_file = target / ".write_test"
        test_file.touch()
        test_file.unlink()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Thư mục không hợp lệ hoặc không có quyền ghi: {e}",
        )

    resolved_path = str(target.resolve())
    update_env_file({
        "CUSTOM_OUTPUT_DIR": resolved_path,
        "AUTO_SAVE_TO_CUSTOM_DIR": auto_save_str,
    })
    logger.info(f"📂 Đã cập nhật thư mục xuất file tùy chọn: {resolved_path}")
    return {
        "status": "ok",
        "message": f"Đã lưu thư mục xuất file: {resolved_path}",
        "current_output_dir": resolved_path,
        "is_custom": True,
        "auto_save_enabled": req.auto_save_enabled,
    }


@router.post("/browse-directory", summary="Mở hộp thoại chọn thư mục gốc Windows")
async def browse_directory():
    """Mở Folder Browser Dialog của hệ điều hành Windows để người dùng chọn thư mục bằng chuột."""
    if sys.platform != "win32":
        return {"status": "unsupported", "selected_path": ""}

    ps_script = (
        "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; "
        "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
        "$f.Description = 'Chọn thư mục lưu trữ Audio & Video xuất ra'; "
        "$f.ShowNewFolderButton = $true; "
        "if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }"
    )
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=60,
        )
        selected = result.stdout.strip()
        if selected and os.path.isdir(selected):
            return {"status": "ok", "selected_path": selected}
        return {"status": "cancelled", "selected_path": ""}
    except Exception as e:
        logger.warning(f"Lỗi khi mở Folder Browser Dialog: {e}")
        return {"status": "error", "error": str(e), "selected_path": ""}


@router.post("/open-output-directory", summary="Mở thư mục lưu trữ trong Windows Explorer")
async def open_output_directory(req: Optional[OpenOutputDirRequest] = None):
    """Mở thư mục đích trực tiếp trong File Explorer."""
    target_path = None
    if req and req.path and req.path.strip():
        target_path = req.path.strip()
    else:
        custom_dir = os.getenv("CUSTOM_OUTPUT_DIR", "").strip()
        target_path = custom_dir if (custom_dir and os.path.isdir(custom_dir)) else str(OUTPUTS_DIR.resolve())

    if not target_path or not os.path.exists(target_path):
        target_path = str(OUTPUTS_DIR.resolve())

    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer.exe", target_path])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target_path])
        else:
            subprocess.Popen(["xdg-open", target_path])
        logger.info(f"📂 Đã mở thư mục {target_path} trong Explorer.")
        return {"status": "ok", "message": f"Đã mở thư mục: {target_path}"}
    except Exception as e:
        logger.error(f"Lỗi khi mở thư mục: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {e}")
