"""
app/routers/video_translate/studio.py
─────────────────────────────────────
Router điều phối tương tác thời gian thực cho Studio Editor:
- Lấy danh sách segments
- Thuyết minh lại từng câu đơn lẻ
- Cập nhật, xóa, thêm câu thoại
- Quick remux video
"""

from fastapi import APIRouter, HTTPException
from app.schemas.video_translate import (
    StudioRedubSegmentRequest,
    StudioUpdateSegmentRequest,
    StudioAddSegmentRequest,
    StudioRemuxRequest,
)
from app.services.video_translation_pipeline import VideoTranslationPipeline

router = APIRouter()


@router.get("/studio-segments/{task_id}")
async def get_studio_segments_endpoint(task_id: str):
    """Lấy danh sách các câu thoại kèm âm thanh và mốc thời gian để phát real-time đồng bộ với video."""
    try:
        return VideoTranslationPipeline.get_studio_segments(task_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studio-redub-segment/{task_id}")
async def studio_redub_segment_endpoint(task_id: str, req: StudioRedubSegmentRequest):
    """Thuyết minh lại CỤC BỘ cho duy nhất 1 câu thoại (In-place Single Segment Re-dubbing)."""
    try:
        return await VideoTranslationPipeline.redub_single_segment(
            task_id=task_id,
            segment_id=req.segment_id,
            voice_id=req.voice_id,
            engine=req.engine,
            voice_rate=req.voice_rate,
            voice_pitch=req.voice_pitch,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studio-update-segment/{task_id}")
async def studio_update_segment_endpoint(task_id: str, req: StudioUpdateSegmentRequest):
    """Cập nhật trực tiếp nội dung hoặc mốc thời gian bắt đầu/kết thúc của câu thoại trong Studio."""
    try:
        updates = {
            "text": req.text,
            "start": req.start,
            "end": req.end,
        }
        return VideoTranslationPipeline.update_segment(
            task_id=task_id,
            segment_id=req.segment_id,
            updates=updates,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/studio-delete-segment/{task_id}/{segment_id}")
async def studio_delete_segment_endpoint(task_id: str, segment_id: int):
    """Xóa một câu thoại/phụ đề khỏi timeline Studio."""
    try:
        return VideoTranslationPipeline.delete_segment(
            task_id=task_id,
            segment_id=segment_id,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studio-add-segment/{task_id}")
async def studio_add_segment_endpoint(task_id: str, req: StudioAddSegmentRequest):
    """Chèn thêm 1 câu thoại mới vào timeline Studio tại vị trí bất kỳ và tự động sinh âm thanh TTS tức thì."""
    try:
        segment_data = {
            "text": req.text,
            "after_segment_id": req.after_segment_id,
            "start": req.start,
            "end": req.end,
            "voice_id": req.voice_id,
            "engine": req.engine,
            "voice_rate": req.voice_rate,
            "voice_pitch": req.voice_pitch,
            "voice_volume": req.voice_volume,
        }
        return VideoTranslationPipeline.add_segment(
            task_id=task_id,
            segment_data=segment_data,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studio-quick-remux/{task_id}")
async def studio_quick_remux_endpoint(task_id: str, req: StudioRemuxRequest | None = None):
    """Ráp lại dải âm thanh và mux lại vào video siêu tốc (chỉ 2-5 giây) sau khi người dùng sửa câu trong Studio."""
    try:
        req_data = req.model_dump() if req else {}
        return await VideoTranslationPipeline.quick_remux_video(
            task_id=task_id,
            subtitle_mode=req_data.get("subtitle_mode"),
            voice_volume=req_data.get("voice_volume"),
            bgm_volume=req_data.get("bgm_volume"),
            output_resolution=req_data.get("output_resolution"),
            font_name=req_data.get("font_name"),
            font_size=req_data.get("font_size"),
            font_color=req_data.get("font_color"),
            outline_color=req_data.get("outline_color"),
            back_color=req_data.get("back_color"),
            outline_width=req_data.get("outline_width"),
            shadow_width=req_data.get("shadow_width"),
            bold=req_data.get("bold"),
            alignment=req_data.get("alignment"),
            margin_v=req_data.get("margin_v"),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
