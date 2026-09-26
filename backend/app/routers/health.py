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
    """
    Ghi nhận tín hiệu heartbeat hoặc đóng tab từ giao diện frontend.
    Nếu toàn bộ tab localhost bị đóng quá 5 giây, hệ thống sẽ kích hoạt tự đóng.
    """
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
        if len(_active_tabs) == 0 and _no_tab_since == 0.0:
            _no_tab_since = now
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
    """Endpoint cho Tray Manager hoặc script giám sát hỏi xem có nên tắt hệ thống không."""
    global _has_received_heartbeat, _no_tab_since, _should_shutdown
    now = time.time()

    # Dọn dẹp tab đã quá hạn 30 giây không gửi heartbeat (chống tab bị trình duyệt đưa vào sleep mode)
    expired = [tid for tid, t in _active_tabs.items() if now - t > 30.0]
    for tid in expired:
        _active_tabs.pop(tid, None)

    if _has_received_heartbeat:
        if len(_active_tabs) == 0:
            if _no_tab_since == 0.0:
                _no_tab_since = now
            elif now - _no_tab_since >= 600.0:
                _should_shutdown = True
        else:
            _no_tab_since = 0.0

    return {
        "status": "ok",
        "has_received_heartbeat": _has_received_heartbeat,
        "active_tabs_count": len(_active_tabs),
        "should_shutdown": _should_shutdown,
        "no_tab_seconds": (now - _no_tab_since) if _no_tab_since > 0.0 else 0.0,
    }


async def monitor_browser_lifetime():
    """
    Vòng lặp chạy ngầm trong server:
    Khi người dùng đã mở trình duyệt và sau đó đóng toàn bộ các tab localhost quá 10 phút,
    tiến trình backend sẽ tự động giải phóng tài nguyên (tránh ngắt kết nối đột ngột khi treo máy hoặc reload trang).
    """
    global _has_received_heartbeat, _no_tab_since, _should_shutdown
    logger.info("🛡️ Giám sát tab trình duyệt đã kích hoạt (Grace period: 10 phút chống tắt nhầm khi treo tab).")
    while True:
        await asyncio.sleep(3.0)
        now = time.time()

        # Dọn dẹp các tab mất kết nối quá 30 giây
        expired = [tid for tid, t in _active_tabs.items() if now - t > 30.0]
        for tid in expired:
            _active_tabs.pop(tid, None)

        if _has_received_heartbeat:
            if len(_active_tabs) == 0:
                if _no_tab_since == 0.0:
                    _no_tab_since = now
                elif now - _no_tab_since >= 600.0:
                    _should_shutdown = True
                    logger.info("🛑 Phát hiện người dùng đã đóng toàn bộ tab trình duyệt quá 10 phút.")
                    logger.info("👋 Đang tự động đóng hệ thống và tắt terminal...")
                    await asyncio.sleep(0.5)
                    import signal
                    try:
                        os.kill(os.getpid(), signal.SIGINT)
                    except Exception:
                        pass
                    await asyncio.sleep(0.5)
                    os._exit(0)
            else:
                _no_tab_since = 0.0



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
    safe_filename = os.path.basename(filename)
    file_path = OUTPUTS_DIR / safe_filename

    if not file_path.exists() or not file_path.is_file():
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
