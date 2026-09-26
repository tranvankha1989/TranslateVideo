"""
app/routers/dubbing.py
──────────────────────
API Router cho lồng tiếng (Dubbing) video:
- Lấy danh sách giọng đọc tuyển chọn theo ngôn ngữ (Edge-TTS & OmniVoice)
- Sinh âm thanh lồng tiếng cho câu đơn lẻ
- Sinh âm thanh lồng tiếng hàng loạt theo danh sách phụ đề đã dịch
- Tách nhạc nền BGM từ video gốc
"""

from fastapi import APIRouter, HTTPException, Query
from app.core.config import logger
from app.schemas.dubbing import (
    VoiceItem,
    DubbingSegmentRequest,
    DubbingSegmentResponse,
    BatchDubbingRequest,
    BatchDubbingResponse,
    SeparateVocalRequest,
)
from app.services.dubbing_service import DubbingService

router = APIRouter(prefix="/api/dubbing", tags=["Dubbing & Voices"])


@router.get("/voices")
async def list_voices(lang: str = Query("all", description="Mã ngôn ngữ (all, vi, en, zh-cn, ja, ko, ...)")):
    """Trả về danh sách giọng đọc chất lượng cao được tuyển chọn sẵn cho lồng tiếng video."""
    try:
        voices = DubbingService.get_voices(lang=lang)
        return {"voices": voices, "total": len(voices)}
    except Exception as e:
        logger.error(f"[Dubbing Voices API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/synthesize-segment", response_model=DubbingSegmentResponse)
async def synthesize_segment_endpoint(req: DubbingSegmentRequest):
    """Sinh âm thanh lồng tiếng cho một câu thoại đơn lẻ và đo thời lượng thực tế."""
    try:
        res = await DubbingService.synthesize_single(
            text=req.text,
            voice_id=req.voice_id,
            engine=req.engine,
            rate=req.rate,
            pitch=req.pitch,
            volume=req.volume,
            target_duration=req.target_duration,
        )
        return DubbingSegmentResponse(**res)
    except Exception as e:
        logger.error(f"[Dubbing Single API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi lồng tiếng câu: {str(e)}") from e


@router.post("/synthesize-batch", response_model=BatchDubbingResponse)
async def synthesize_batch_endpoint(req: BatchDubbingRequest):
    """Lồng tiếng hàng loạt cho toàn bộ danh sách phụ đề đã dịch của video."""
    try:
        res = await DubbingService.synthesize_batch(
            segments=req.segments,
            voice_id=req.voice_id,
            engine=req.engine,
            rate=req.rate,
            pitch=req.pitch,
            volume=req.volume,
            session_id=req.session_id,
        )
        return BatchDubbingResponse(**res)
    except Exception as e:
        logger.error(f"[Dubbing Batch API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi lồng tiếng hàng loạt: {str(e)}") from e


@router.post("/separate-vocal")
async def separate_vocal_endpoint(req: SeparateVocalRequest):
    """Tách nhạc nền (BGM) và giọng gốc của video để chuẩn bị ghép lồng tiếng."""
    try:
        res = DubbingService.separate_vocal_bgm(
            input_media_path=req.video_or_audio_path,
            session_id=req.session_id,
        )
        return res
    except Exception as e:
        logger.error(f"[Separate Vocal API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi tách âm thanh: {str(e)}") from e
