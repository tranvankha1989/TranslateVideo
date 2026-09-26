"""
app/routers/alignment.py
────────────────────────
API Router cho Audio-Video Speed Alignment:
- Co giãn tốc độ một file âm thanh đơn lẻ theo thời lượng mong muốn (Speed Adjustment).
- Ráp nối toàn bộ các câu lồng tiếng lên trục thời gian video và hòa âm cùng BGM gốc.
"""

from fastapi import APIRouter, HTTPException
from app.core.config import logger
from app.schemas.alignment import (
    AdjustSpeedRequest,
    AdjustSpeedResponse,
    BuildTimelineAudioRequest,
    BuildTimelineAudioResponse,
)
from app.services.alignment_service import AlignmentService

router = APIRouter(prefix="/api/alignment", tags=["Audio Alignment & Timeline"])


@router.post("/adjust-speed", response_model=AdjustSpeedResponse)
async def adjust_speed_endpoint(req: AdjustSpeedRequest):
    """Co giãn tốc độ audio bằng FFmpeg atempo để vừa khít với thời lượng mục tiêu."""
    try:
        res = AlignmentService.adjust_speed(
            audio_path=req.audio_path,
            target_duration=req.target_duration,
            max_speed_rate=req.max_speed_rate,
            min_speed_rate=req.min_speed_rate,
        )
        return AdjustSpeedResponse(**res)
    except Exception as e:
        logger.error(f"[Adjust Speed API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi co giãn tốc độ: {str(e)}") from e


@router.post("/build-timeline", response_model=BuildTimelineAudioResponse)
async def build_timeline_endpoint(req: BuildTimelineAudioRequest):
    """
    Ráp nối toàn bộ các câu lồng tiếng vào đúng mốc thời gian trên video,
    hòa âm cùng BGM gốc để tạo dải âm thanh hoàn chỉnh sẵn sàng ghép vào video.
    """
    try:
        res = AlignmentService.build_full_timeline(
            segments=req.segments,
            total_video_duration=req.total_video_duration,
            max_speed_rate=req.max_speed_rate,
            bgm_path=req.bgm_path,
            bgm_volume=req.bgm_volume,
            voice_volume=req.voice_volume,
            session_id=req.session_id,
        )
        return BuildTimelineAudioResponse(**res)
    except Exception as e:
        logger.error(f"[Build Timeline API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi ráp nối timeline audio: {str(e)}") from e
