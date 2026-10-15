"""
app/routers/settings/logs.py
────────────────────────────
Router quản lý và xem nhật ký hệ thống (Diagnostic & Log Management).
"""

import os
import sys
import subprocess
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import (
    LOGS_DIR,
    APP_LOG_FILE,
    logger,
    is_verbose_logging,
    set_verbose_logging,
)
from app.routers.settings.env_helper import update_env_file

router = APIRouter()


class VerboseLoggingRequest(BaseModel):
    enabled: bool


@router.get("/logs/content", summary="Đọc nội dung file log gần nhất")
async def get_log_content(lines: int = 300, order: str = "desc"):
    """
    Đọc N dòng cuối cùng từ logs/app.log để hiển thị trực tiếp lên giao diện người dùng.
    - order='desc' (mặc định): Đảo ngược thứ tự dòng để dòng mới nhất luôn hiển thị ở TRÊN CÙNG.
    - order='asc': Giữ thứ tự tự nhiên (cũ ở trên, mới ở dưới).
    """
    if not APP_LOG_FILE.exists():
        return {
            "content": "Chưa có file nhật ký nào được ghi. Hệ thống đang hoạt động bình thường.",
            "total_lines": 0,
            "file_size_kb": 0,
            "log_path": str(APP_LOG_FILE),
        }
    try:
        with open(APP_LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
            total = len(all_lines)
            selected = all_lines[-lines:] if total > lines else all_lines
            if order.lower() == "desc":
                selected.reverse()
            return {
                "content": "".join(selected),
                "total_lines": total,
                "returned_lines": len(selected),
                "file_size_kb": round(APP_LOG_FILE.stat().st_size / 1024, 1),
                "log_path": str(APP_LOG_FILE),
                "order": order,
            }
    except Exception as e:
        logger.error(f"Lỗi khi đọc file log: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể đọc file nhật ký: {e}")


@router.get("/logs/download", summary="Tải trực tiếp file log về máy")
async def download_log_file():
    """Tải toàn bộ file app.log về máy để gửi cho kỹ thuật viên hỗ trợ phân tích."""
    if not APP_LOG_FILE.exists():
        raise HTTPException(status_code=404, detail="File nhật ký chưa tồn tại.")
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    return FileResponse(
        path=str(APP_LOG_FILE),
        filename=f"voicesync_app_log_{timestamp_str}.log",
        media_type="text/plain; charset=utf-8",
    )


@router.post("/logs/open-folder", summary="Mở thư mục logs trong File Explorer")
async def open_logs_folder():
    """Mở thư mục chứa file logs trên Windows Explorer / Finder."""
    if not LOGS_DIR.exists():
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if sys.platform == "win32":
            os.startfile(str(LOGS_DIR))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(LOGS_DIR)])
        else:
            subprocess.Popen(["xdg-open", str(LOGS_DIR)])
        return {"ok": True, "message": f"Đã mở thư mục logs: {LOGS_DIR}"}
    except Exception as e:
        logger.error(f"Lỗi khi mở thư mục logs: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {e}")


@router.post("/logs/clear", summary="Xóa sạch nội dung log cũ")
async def clear_logs():
    """Xóa nội dung file app.log để bắt đầu phiên làm việc mới."""
    try:
        if APP_LOG_FILE.exists():
            with open(APP_LOG_FILE, "w", encoding="utf-8") as f:
                f.write(f"=== Nhật ký đã được làm mới lúc {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n")
        return {"ok": True, "message": "Đã xóa sạch nội dung nhật ký cũ thành công!"}
    except Exception as e:
        logger.error(f"Lỗi khi làm mới file log: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể xóa log: {e}")


@router.get("/logs/verbose", summary="Kiểm tra trạng thái chế độ ghi nhật ký chi tiết")
async def get_verbose_logging_status():
    """Kiểm tra xem chế độ ghi log chi tiết từng bước (debug) có đang hoạt động hay không."""
    enabled = is_verbose_logging()
    return {
        "ok": True,
        "enabled": enabled,
        "mode": "verbose" if enabled else "standard",
        "description": "Ghi nhận chi tiết từng bước (FFmpeg, Demucs, Whisper, LLM, Dubbing, Alignment) để debug lỗi." if enabled else "Ghi nhật ký tiêu chuẩn (INFO)."
    }


@router.post("/logs/verbose", summary="Bật hoặc tắt chế độ ghi nhật ký chi tiết")
async def toggle_verbose_logging(req: VerboseLoggingRequest):
    """Bật/tắt chế độ ghi log chi tiết từng bước và lưu cấu hình vào .env."""
    set_verbose_logging(req.enabled)
    try:
        update_env_file({"VERBOSE_LOGGING": "true" if req.enabled else "false"})
    except Exception as e:
        logger.warning(f"Không thể cập nhật VERBOSE_LOGGING vào file .env: {e}")

    status_str = "BẬT (ghi lại toàn bộ quá trình chạy từng bước để debug)" if req.enabled else "TẮT (ghi log tiêu chuẩn như hiện tại)"
    return {
        "ok": True,
        "enabled": req.enabled,
        "message": f"Đã {status_str} thành công!",
    }
