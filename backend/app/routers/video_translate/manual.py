"""
app/routers/video_translate/manual.py
─────────────────────────────────────
Router xử lý quy trình dịch thủ công (Manual SRT Workflow):
- Giai đoạn 1: Tạo phụ đề gốc Whisper (start-transcribe)
- Nạp bản dịch phụ đề từ người dùng (upload-translated-srt)
- Giai đoạn 2: Tiếp tục lồng tiếng & render video (resume-pipeline)
- Xem / Lưu nội dung phụ đề (subtitles-content, subtitles-original-content)
- Lồng tiếng lại từ phụ đề đã chỉnh sửa (redub)
"""

import time
import uuid
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app.core.config import logger
from app.schemas.video_translate import (
    RedubTaskRequest,
    SaveSubtitlesRequest,
)
from app.services.translation_memory_service import TranslationMemoryService
from app.services.video_translation_pipeline import (
    VideoTranslationPipeline,
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
    generate_srt_file,
)
from app.routers.video_translate.helpers import form_val, BACKGROUND_TASKS

router = APIRouter()


@router.post("/manual/start-transcribe")
async def start_manual_transcription(
    video: UploadFile = File(..., description="File video cần tạo phụ đề gốc"),
    source_lang: str = Form("en"),
    target_lang: str = Form("vi"),
    whisper_model: str = Form("large-v3"),
    start_time: float = Form(0.0),
    end_time: float | None = Form(None),
    vad_threshold: float = Form(0.35),
    speech_pad_ms: int = Form(500),
    min_speech_duration_ms: int = Form(150),
    min_silence_duration_ms: int = Form(500),
    beam_size: int = Form(5),
):
    """Giai đoạn 1 (Chế độ thủ công): Tách audio -> Whisper tạo subtitles_original.srt."""
    s_lang = str(form_val(source_lang, "en"))
    t_lang = str(form_val(target_lang, "vi"))
    w_model = str(form_val(whisper_model, "large-v3"))
    c_start = float(form_val(start_time, 0.0))
    raw_end = form_val(end_time, None)
    c_end = float(raw_end) if raw_end is not None and str(raw_end).strip() != "" else None
    v_thresh = float(form_val(vad_threshold, 0.35))
    s_pad = int(form_val(speech_pad_ms, 500))
    m_speech = int(form_val(min_speech_duration_ms, 150))
    m_silence = int(form_val(min_silence_duration_ms, 500))
    b_size = int(form_val(beam_size, 5))

    task_id = uuid.uuid4().hex[:12]
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = video.filename or f"upload_{task_id}.mp4"
    input_video_path = task_dir / f"input_{safe_filename}"

    def _save_video():
        with open(input_video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

    await asyncio.to_thread(_save_video)

    now_ts = time.time()
    _TASK_STORE[task_id] = {
        "task_id": task_id,
        "status": "processing",
        "progress": 5,
        "current_step": "extracting",
        "message": "Đang tiếp nhận video và bắt đầu trích xuất âm thanh...",
        "source_lang": s_lang,
        "target_lang": t_lang,
        "total_segments": 0,
        "is_manual_mode": True,
        "start_time": c_start,
        "end_time": c_end,
        "video_url": None,
        "audio_url": None,
        "subtitles_srt_url": None,
        "subtitles_original_srt_url": None,
        "_start_time": now_ts,
        "created_at": now_ts,
        "elapsed_time": 0.0,
        "elapsed_str": "0 giây",
        "error": None,
    }

    bg_task = asyncio.create_task(
        VideoTranslationPipeline.run_manual_transcribe(
            task_id=task_id,
            video_path=input_video_path,
            source_lang=s_lang,
            target_lang=t_lang,
            whisper_model=w_model,
            clip_start=c_start,
            clip_end=c_end,
            vad_threshold=v_thresh,
            speech_pad_ms=s_pad,
            min_speech_duration_ms=m_speech,
            min_silence_duration_ms=m_silence,
            beam_size=b_size,
        )
    )
    BACKGROUND_TASKS.add(bg_task)
    bg_task.add_done_callback(BACKGROUND_TASKS.discard)

    return {
        "task_id": task_id,
        "status": "processing",
        "message": "Đã bắt đầu tạo phụ đề gốc bằng Faster-Whisper.",
    }


@router.post("/manual/upload-translated-srt/{task_id}")
async def upload_manual_translated_srt(
    task_id: str,
    srt_file: UploadFile | None = File(None),
    srt_content: str | None = Form(None),
):
    """Nạp file hoặc nội dung phụ đề .srt đã dịch từ người dùng vào thư mục tác vụ."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tác vụ '{task_id}'.")

    content = ""
    if srt_file is not None:
        raw_bytes = await srt_file.read()
        try:
            content = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content = raw_bytes.decode("utf-8-sig", errors="ignore")
    elif srt_content:
        content = srt_content.strip()

    if not content.strip():
        raise HTTPException(status_code=400, detail="Nội dung file phụ đề .srt rỗng hoặc không hợp lệ.")

    parsed = VideoTranslationPipeline.parse_srt_content(content)
    if not parsed:
        raise HTTPException(
            status_code=400,
            detail="File phụ đề không đúng định dạng SRT chuẩn (cần có số thứ tự, mốc thời gian 00:00:00,000 --> 00:00:00,000 và văn bản).",
        )

    target_srt = task_dir / "subtitles.srt"
    generate_srt_file(parsed, target_srt, mode="hard_target")

    VideoTranslationPipeline.update_task(
        task_id,
        progress=50,
        current_step="waiting_manual_translation",
        message=f"✅ Đã nạp {len(parsed)} câu thoại phụ đề dịch. Hãy chọn giọng đọc ở Bước 4 và bấm 'Tiếp Tục Lồng Tiếng & Render Video' để xuất phim.",
        subtitles_srt_url=f"/outputs/video_translate/{task_id}/subtitles.srt",
        total_segments=len(parsed),
    )

    return {
        "status": "ok",
        "message": f"Nạp phụ đề thành công! Nhận diện {len(parsed)} câu thoại hợp lệ.",
        "segments_count": len(parsed),
        "subtitles_srt_url": f"/outputs/video_translate/{task_id}/subtitles.srt",
    }


@router.post("/manual/resume-pipeline/{task_id}")
async def resume_manual_pipeline(
    task_id: str,
    voice_id: str = Form("vi-VN-HoaiMyNeural"),
    engine: str = Form("edge-tts"),
    voice_rate: str = Form("+0%"),
    voice_pitch: str = Form("+0Hz"),
    voice_volume: float = Form(1.0),
    preserve_bgm: bool = Form(True),
    bgm_type: str = Form("bgm"),
    bgm_volume: float = Form(0.30),
    subtitle_mode: str = Form("hard_target"),
    max_speed_rate: float = Form(1.35),
    output_resolution: str = Form("720p"),
    font_size: int = Form(20),
    margin_v: int = Form(30),
    alignment: int = Form(2),
    srt_file: UploadFile | None = File(None),
    srt_content: str | None = Form(None),
):
    """Giai đoạn 2 (Chế độ thủ công): Tiếp nhận bản dịch SRT và cấu hình giọng đọc, kích hoạt Lồng tiếng TTS -> Render Video."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tác vụ '{task_id}'.")

    if srt_file is not None:
        raw_bytes = await srt_file.read()
        try:
            content = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content = raw_bytes.decode("utf-8-sig", errors="ignore")
        if content.strip():
            parsed_new = VideoTranslationPipeline.parse_srt_content(content)
            if parsed_new:
                generate_srt_file(parsed_new, task_dir / "subtitles.srt", mode="hard_target")
    elif srt_content and srt_content.strip():
        parsed_new = VideoTranslationPipeline.parse_srt_content(srt_content)
        if parsed_new:
            generate_srt_file(parsed_new, task_dir / "subtitles.srt", mode="hard_target")

    if not (task_dir / "subtitles.srt").exists():
        if (task_dir / "subtitles_original.srt").exists():
            shutil.copyfile(task_dir / "subtitles_original.srt", task_dir / "subtitles.srt")
        else:
            raise HTTPException(
                status_code=400,
                detail="Chưa có file phụ đề dịch subtitles.srt. Vui lòng tải lên file phụ đề đã dịch trước khi tiếp tục.",
            )

    v_id = str(form_val(voice_id, "vi-VN-HoaiMyNeural"))
    eng = str(form_val(engine, "edge-tts"))
    v_rate = str(form_val(voice_rate, "+0%"))
    v_pitch = str(form_val(voice_pitch, "+0Hz"))
    v_vol = float(form_val(voice_volume, 1.0))
    p_bgm_raw = form_val(preserve_bgm, True)
    p_bgm = p_bgm_raw if isinstance(p_bgm_raw, bool) else str(p_bgm_raw).lower() in ("true", "1", "yes")
    b_type = str(form_val(bgm_type, "bgm"))
    bgm_vol = float(form_val(bgm_volume, 0.30))
    sub_mode = str(form_val(subtitle_mode, "hard_target"))
    max_speed = float(form_val(max_speed_rate, 1.35))
    out_res = str(form_val(output_resolution, "720p"))
    f_size = int(form_val(font_size, 20))
    m_v = int(form_val(margin_v, 30))
    align = int(form_val(alignment, 2))

    VideoTranslationPipeline.update_task(
        task_id,
        status="processing",
        progress=20,
        current_step="dubbing",
        message="Đang khởi tạo lồng tiếng và render video...",
        output_resolution=out_res,
        font_size=f_size,
        margin_v=m_v,
        alignment=align,
        error=None,
    )

    bg_task = asyncio.create_task(
        VideoTranslationPipeline.run_redub(
            task_id=task_id,
            srt_file=task_dir / "subtitles.srt",
            voice_id=v_id,
            engine=eng,
            voice_rate=v_rate,
            voice_pitch=v_pitch,
            voice_volume=v_vol,
            preserve_bgm=p_bgm,
            bgm_type=b_type,
            bgm_volume=bgm_vol,
            subtitle_mode=sub_mode,
            max_speed_rate=max_speed,
            output_resolution=out_res,
            font_size=f_size,
            margin_v=m_v,
            alignment=align,
        )
    )
    BACKGROUND_TASKS.add(bg_task)
    bg_task.add_done_callback(BACKGROUND_TASKS.discard)

    return {
        "task_id": task_id,
        "status": "processing",
        "message": "Đang tiến hành lồng tiếng và ghép hoàn tất video thành phẩm.",
    }


@router.get("/subtitles-content/{task_id}")
async def get_subtitles_content(task_id: str):
    """Lấy toàn bộ nội dung văn bản thô của file phụ đề subtitles.srt để hiển thị trực tiếp."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    srt_file = task_dir / "subtitles.srt"
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="File subtitles.srt không tồn tại.")
    try:
        content = srt_file.read_text(encoding="utf-8")
        return {"content": content, "file_path": str(srt_file)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file phụ đề: {str(e)}")


@router.get("/subtitles-original-content/{task_id}")
async def get_subtitles_original_content(task_id: str):
    """Lấy toàn bộ nội dung văn bản thô của file phụ đề gốc subtitles_original.srt."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    srt_file = task_dir / "subtitles_original.srt"
    if not srt_file.exists():
        srt_file = task_dir / "subtitles.srt"
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="File phụ đề gốc chưa được tạo.")
    try:
        content = srt_file.read_text(encoding="utf-8")
        prompt_content = (
            "Tôi muốn dịch file phụ đề này. Hãy tuân thủ các quy tắc sau:\n"
            "1. Đọc và dịch nội dung bám sát kịch bản, lưu nhớ và nhất quán các danh từ riêng, thuật ngữ.\n"
            "2. Phân tích logic hội thoại và quan hệ nhân vật để xưng hô chuẩn xác theo cốt truyện.\n"
            "3. Kiểm tra mốc thời gian và ngữ pháp để gộp các câu thoại bị ngắt dở dang thành câu hoàn chỉnh trước khi dịch.\n"
            "4. Tối ưu độ dài câu (CPS) và chèn dấu ngắt nghỉ phù hợp để làm giọng đọc AI/thuyết minh.\n"
            "5. Lọc các câu mang tính chất quảng cáo.\n"
            "Đây là file/nội dung phụ đề:\n\n"
            + content
        )
        return {
            "content": content,
            "prompt_content": prompt_content,
            "file_path": str(srt_file),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file phụ đề gốc: {str(e)}")


@router.post("/subtitles-content/{task_id}")
async def save_subtitles_content(task_id: str, req: SaveSubtitlesRequest):
    """Lưu nội dung chỉnh sửa phụ đề từ giao diện web vào file subtitles.srt và học vào Translation Memory."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Thư mục tác vụ không tồn tại.")

    srt_file = task_dir / "subtitles.srt"
    old_content = ""
    if srt_file.exists():
        try:
            old_content = srt_file.read_text(encoding="utf-8")
        except Exception:
            old_content = ""

    learned_items = []
    try:
        task = VideoTranslationPipeline.get_task(task_id) or {}
        source_lang = task.get("source_lang", "zh")
        target_lang = task.get("target_lang", "vi")
        learned_items = TranslationMemoryService.learn_from_srt_diff(
            task_id=task_id,
            new_srt_content=req.content.strip(),
            current_srt_content=old_content,
            source_lang=source_lang,
            target_lang=target_lang,
        )
    except Exception as e:
        logger.warning(f"Lỗi khi học từ phụ đề task {task_id}: {e}")

    try:
        srt_file.write_text(req.content.strip(), encoding="utf-8")
        msg = "Đã lưu nội dung phụ đề thành công."
        if learned_items:
            msg = f"Đã lưu phụ đề. AI đã tự động học được {len(learned_items)} câu bạn vừa chỉnh sửa!"
        return {
            "status": "ok",
            "message": msg,
            "learned_count": len(learned_items),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi ghi file phụ đề: {str(e)}")


@router.post("/redub/{task_id}")
async def redub_video_from_subtitles(task_id: str, req: RedubTaskRequest | None = None):
    """Thực hiện lồng tiếng và render lại video MP4 dựa theo file phụ đề subtitles.srt đã sửa."""
    task = VideoTranslationPipeline.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tác vụ {task_id}.")

    req_data = req.model_dump() if req else {}
    task_dir = TRANSLATE_OUTPUT_DIR / task_id

    try:
        new_content = req_data.get("srt_content")
        if not new_content and (task_dir / "subtitles.srt").exists():
            new_content = (task_dir / "subtitles.srt").read_text(encoding="utf-8")
        
        curr_snapshot = None
        if (task_dir / "subtitles_ai_initial.srt").exists():
            curr_snapshot = (task_dir / "subtitles_ai_initial.srt").read_text(encoding="utf-8")
            
        if new_content:
            TranslationMemoryService.learn_from_srt_diff(
                task_id=task_id,
                new_srt_content=new_content,
                current_srt_content=curr_snapshot,
                source_lang=task.get("source_lang", "zh"),
                target_lang=task.get("target_lang", "vi"),
            )
    except Exception as e:
        logger.warning(f"Lỗi học khi redub task {task_id}: {e}")

    VideoTranslationPipeline.update_task(
        task_id,
        status="processing",
        progress=15,
        current_step="dubbing",
        message="Bắt đầu lồng tiếng lại từ phụ đề đã chỉnh sửa...",
    )

    srt_file = task_dir / "subtitles.srt"
    bg_task = asyncio.create_task(
        VideoTranslationPipeline.run_redub(
            task_id=task_id,
            srt_file=srt_file,
            voice_id=req_data.get("voice_id", "vi-VN-HoaiMyNeural"),
            engine=req_data.get("engine", "edge-tts"),
            voice_rate=req_data.get("voice_rate", "+0%"),
            voice_pitch=req_data.get("voice_pitch", "+0Hz"),
            voice_volume=req_data.get("voice_volume", 1.0),
            preserve_bgm=req_data.get("preserve_bgm", True),
            bgm_type=req_data.get("bgm_type", "bgm"),
            bgm_volume=req_data.get("bgm_volume", 0.30),
            subtitle_mode=req_data.get("subtitle_mode", "hard_target"),
            max_speed_rate=req_data.get("max_speed_rate", 1.35),
            output_resolution=req_data.get("output_resolution", "720p"),
            font_size=req_data.get("font_size", 20),
            margin_v=req_data.get("margin_v", 30),
            alignment=req_data.get("alignment", 2),
        )
    )
    BACKGROUND_TASKS.add(bg_task)
    bg_task.add_done_callback(BACKGROUND_TASKS.discard)

    return {
        "task_id": task_id,
        "status": "processing",
        "message": "Đã tiếp nhận yêu cầu lồng tiếng lại theo phụ đề mới.",
    }
