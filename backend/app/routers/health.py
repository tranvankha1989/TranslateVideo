import os
import time
import asyncio
from typing import Dict
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app.core.config import OUTPUTS_DIR, APP_VERSION, logger
from app.schemas.common import HealthResponse

router = APIRouter(tags=["System"])

# Quản lý trạng thái tab trình duyệt đang mở
_active_tabs: Dict[str, float] = {}  # tab_id -> last_seen timestamp
_has_received_heartbeat: bool = False
_no_tab_since: float = 0.0
_should_shutdown: bool = False


@router.post("/api/system/heartbeat", summary="Heartbeat từ tab trình duyệt")
@router.post("/api/system/tab-closed", summary="Thông báo tab trình duyệt vừa đóng")
async def receive_heartbeat(request: Request):
    """Ghi nhận tín hiệu hoạt động từ giao diện frontend để theo dõi trạng thái."""
    global _has_received_heartbeat, _no_tab_since
    tab_id = "default"
    action = "heartbeat"

    try:
        data = await request.json()
        tab_id = str(data.get("tab_id", "default"))
        action = str(data.get("action", "heartbeat"))
    except Exception:
        pass

    now = time.time()
    if action == "close" or "tab-closed" in request.url.path:
        _active_tabs.pop(tab_id, None)
    else:
        _has_received_heartbeat = True
        _active_tabs[tab_id] = now
        _no_tab_since = 0.0

    return {
        "status": "ok",
        "active_tabs": len(_active_tabs),
        "has_heartbeat": _has_received_heartbeat,
    }


@router.get("/api/system/status", summary="Kiểm tra trạng thái hệ thống và tab trình duyệt")
async def get_system_status():
    """Endpoint kiểm tra trạng thái hoạt động của hệ thống."""
    global _has_received_heartbeat, _no_tab_since, _should_shutdown
    now = time.time()

    # Dọn dẹp tab đã quá hạn 60 giây không gửi heartbeat
    expired = [tid for tid, t in _active_tabs.items() if now - t > 60.0]
    for tid in expired:
        _active_tabs.pop(tid, None)

    return {
        "status": "ok",
        "has_received_heartbeat": _has_received_heartbeat,
        "active_tabs_count": len(_active_tabs),
        "should_shutdown": False,
        "no_tab_seconds": 0.0,
    }


async def monitor_browser_lifetime():
    """Vòng lặp giám sát nhẹ nhàng duy trì trạng thái máy chủ."""
    logger.info("🛡️ Giám sát máy chủ hoạt động liên tục (Chế độ ổn định không ngắt kết nối).")
    while True:
        await asyncio.sleep(10.0)
        now = time.time()
        expired = [tid for tid, t in _active_tabs.items() if now - t > 60.0]
        for tid in expired:
            _active_tabs.pop(tid, None)




@router.get(
    "/api/health",
    response_model=HealthResponse,
    summary="Kiểm tra trạng thái máy chủ và mô hình",
)
@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Kiểm tra trạng thái máy chủ và mô hình (hỗ trợ Tray Manager)",
)
async def health_check():
    """Kiểm tra server đang hoạt động và OmniVoice đã sẵn sàng (local hoặc Remote GPU)."""
    import model_handler
    is_remote = getattr(model_handler, "USE_REMOTE_GPU", False)
    is_loaded = getattr(model_handler, "_model", None) is not None or is_remote
    return HealthResponse(
        status="ok",
        model_loaded=is_loaded,
        version=APP_VERSION,
    )


@router.get(
    "/api/download/{filename}",
    summary="Tải trực tiếp file âm thanh",
)
async def download_file(filename: str):
    """
    Tải file âm thanh (mp3/wav) về máy từ thư mục outputs/.
    Header Content-Disposition: attachment sẽ kích hoạt popup lưu file trên trình duyệt.
    """
    safe_filename = os.path.basename(filename.split("?")[0])
    file_path = OUTPUTS_DIR / safe_filename

    if not file_path.exists() or not file_path.is_file():
        # Tìm kiếm trong toàn bộ thư mục con của OUTPUTS_DIR (như outputs/audios/...)
        found = list(OUTPUTS_DIR.glob(f"**/{safe_filename}"))
        if found and found[0].is_file():
            file_path = found[0]
        else:
            raise HTTPException(status_code=404, detail="File không tồn tại")

    ext = file_path.suffix.lower()
    media_types = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
        ".srt": "text/plain; charset=utf-8",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=safe_filename,
    )


@router.get(
    "/api/tts/engines",
    summary="Danh sách các mô hình TTS được hỗ trợ",
    tags=["TTS"],
)
@router.get(
    "/api/engines",
    summary="Danh sách các mô hình TTS (alias)",
    tags=["TTS"],
)
async def get_tts_engines():
    """Trả về danh sách các engine TTS khả dụng trong hệ thống."""
    return [
        {
            "id": "omnivoice",
            "name": "OmniVoice 24kHz",
            "tagline": "Đa năng & Tự thiết kế giọng",
            "provider": "k2-fsa",
            "sample_rate": 24000,
            "supported_modes": ["clone", "design", "auto"],
            "description": "Mô hình đa năng hỗ trợ cả sao chép giọng mẫu và tự thiết kế độ tuổi, giới tính, phong cách qua prompt.",
        },
    ]
