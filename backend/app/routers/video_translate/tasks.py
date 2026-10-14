"""
app/routers/video_translate/tasks.py
───────────────────────────────────
Router quản lý vòng đời tác vụ dịch video:
- Khởi chạy tác vụ (start)
- Tra cứu trạng thái tiến trình (status, active-task)
- Quản lý danh sách dự án (tasks)
- Dọn dẹp cache rác và dự án hết hạn (cleanup-cache, cleanup-expired)
- Xác thực key Gemini & warmup Faster-Whisper
"""

import os
import time
import uuid
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query

from app.core.config import OUTPUTS_DIR, logger
from app.schemas.video_translate import (
    TranslationTaskStatus,
    VerifyKeyRequest,
)
from app.services.translator_service import GoogleAIStudioTranslator
from app.services.video_translation_pipeline import (
    VideoTranslationPipeline,
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
    format_duration_vietnamese,
)
from app.routers.video_translate.helpers import form_val, BACKGROUND_TASKS

router = APIRouter()


@router.post("/verify-gemini-key")
async def verify_gemini_key_endpoint(req: VerifyKeyRequest):
    """Xác thực API Key Google AI Studio (Gemini)."""
    return await GoogleAIStudioTranslator.verify_api_key(req.api_key)


@router.get("/warmup")
async def warmup_whisper():
    """Endpoint cho phép kiểm tra hoặc kích hoạt nạp trước Faster-Whisper."""
    from model_handler import is_remote_gpu_enabled
    if is_remote_gpu_enabled():
        return {"status": "ready", "message": "Chế độ GPU Online đang bật (Whisper sẽ chạy trên Cloud GPU)"}
    try:
        from caption_handler import get_whisper_model
        await asyncio.to_thread(get_whisper_model)
        return {"status": "ready", "message": "Faster-Whisper đã sẵn sàng trong bộ nhớ"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/start")
async def start_video_translation(
    video: UploadFile = File(..., description="File video MP4 / MKV / MOV cần dịch"),
    source_lang: str = Form("en"),
    target_lang: str = Form("vi"),
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
    translation_provider: str = Form("google"),
    translation_api_key: str | None = Form(None),
    translation_style: str = Form("auto"),
    translation_model: str = Form("gemini-3.5-flash-lite"),
    translation_temperature: float = Form(0.2),
    whisper_model: str = Form("large-v3"),
    output_resolution: str = Form("720p"),
    start_time: float = Form(0.0),
    end_time: float | None = Form(None),
    vad_threshold: float = Form(0.35),
    speech_pad_ms: int = Form(500),
    min_speech_duration_ms: int = Form(150),
    min_silence_duration_ms: int = Form(500),
    beam_size: int = Form(5),
    font_size: int = Form(20),
    margin_v: int = Form(30),
    alignment: int = Form(2),
):
    """Tiếp nhận video tải lên và kích hoạt Pipeline dịch & lồng tiếng tự động chạy ngầm."""
    s_lang = str(form_val(source_lang, "en"))
    t_lang = str(form_val(target_lang, "vi"))
    v_id = str(form_val(voice_id, "vi-VN-HoaiMyNeural"))
    eng = str(form_val(engine, "edge-tts"))
    v_rate = str(form_val(voice_rate, "+0%"))
    v_pitch = str(form_val(voice_pitch, "+0Hz"))
    v_vol = float(form_val(voice_volume, 1.0))
    p_bgm = bool(form_val(preserve_bgm, True))
    b_type = str(form_val(bgm_type, "bgm"))
    bgm_vol = float(form_val(bgm_volume, 0.30))
    sub_mode = str(form_val(subtitle_mode, "hard_target"))
    max_speed = float(form_val(max_speed_rate, 1.35))
    trans_provider = str(form_val(translation_provider, "google"))
    raw_key = form_val(translation_api_key, None)
    trans_key = str(raw_key).strip() if raw_key else None
    trans_style = str(form_val(translation_style, "auto"))
    trans_model = str(form_val(translation_model, "gemini-3.5-flash-lite"))
    trans_temp = float(form_val(translation_temperature, 0.2))
    w_model = str(form_val(whisper_model, "large-v3"))
    out_res = str(form_val(output_resolution, "720p"))
    c_start = float(form_val(start_time, 0.0))
    raw_end = form_val(end_time, None)
    c_end = float(raw_end) if raw_end is not None and str(raw_end).strip() != "" else None
    v_thresh = float(form_val(vad_threshold, 0.35))
    s_pad = int(form_val(speech_pad_ms, 500))
    m_speech = int(form_val(min_speech_duration_ms, 150))
    m_silence = int(form_val(min_silence_duration_ms, 500))
    b_size = int(form_val(beam_size, 5))
    f_size = int(form_val(font_size, 20))
    m_v = int(form_val(margin_v, 30))
    align = int(form_val(alignment, 2))

    if trans_provider.lower() in ["gemini", "google_ai_studio", "google-ai-studio"]:
        effective_key = trans_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_STUDIO_API_KEY")
        if not effective_key or not effective_key.strip():
            raise HTTPException(
                status_code=400,
                detail="Bạn đã chọn 'Google AI Studio (Gemini)' nhưng chưa nhập API Key. Vui lòng nhập API Key để dịch chuẩn ngữ cảnh phim, hoặc chọn kênh 'Google Dịch (Miễn phí)'.",
            )

    task_id = uuid.uuid4().hex[:12]
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = video.filename or f"upload_{task_id}.mp4"
    input_video_path = task_dir / f"input_{safe_filename}"

    def _save_uploaded_video():
        with open(input_video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

    await asyncio.to_thread(_save_uploaded_video)

    now_ts = time.time()
    _TASK_STORE[task_id] = {
        "task_id": task_id,
        "status": "processing",
        "progress": 3,
        "current_step": "extracting",
        "message": "Đang tiếp nhận video và khởi tạo pipeline xử lý...",
        "source_lang": s_lang,
        "target_lang": t_lang,
        "total_segments": 0,
        "output_resolution": out_res,
        "start_time": c_start,
        "end_time": c_end,
        "font_size": f_size,
        "margin_v": m_v,
        "alignment": align,
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
        VideoTranslationPipeline.run_pipeline(
            task_id=task_id,
            video_path=input_video_path,
            source_lang=s_lang,
            target_lang=t_lang,
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
            translation_provider=trans_provider,
            translation_api_key=trans_key,
            translation_style=trans_style,
            translation_model=trans_model,
            translation_temperature=trans_temp,
            whisper_model=w_model,
            output_resolution=out_res,
            clip_start=c_start,
            clip_end=c_end,
            vad_threshold=v_thresh,
            speech_pad_ms=s_pad,
            min_speech_duration_ms=m_speech,
            min_silence_duration_ms=m_silence,
            beam_size=b_size,
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
        "message": "Tác vụ dịch video đã được khởi chạy thành công.",
    }


@router.get("/tasks")
async def list_translation_tasks():
    """Lấy danh sách toàn bộ các dự án dịch video đã thực hiện trong thư viện."""
    tasks = VideoTranslationPipeline.list_all_tasks()
    return {"total": len(tasks), "tasks": tasks}


@router.delete("/tasks/{task_id}")
async def delete_translation_task(task_id: str):
    """Xóa dự án dịch video và giải phóng dung lượng ổ đĩa."""
    success = VideoTranslationPipeline.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự án hoặc không thể xóa.")
    return {"status": "ok", "message": f"Đã xóa dự án {task_id} thành công."}


@router.delete("/tasks")
async def clear_all_video_translate_tasks():
    """Xóa toàn bộ lịch sử và file của tất cả các dự án dịch video."""
    deleted_count = 0
    total_freed_bytes = 0
    if TRANSLATE_OUTPUT_DIR.exists():
        for folder in TRANSLATE_OUTPUT_DIR.iterdir():
            if folder.is_dir():
                try:
                    for sub in folder.rglob("*"):
                        if sub.is_file():
                            total_freed_bytes += sub.stat().st_size
                    shutil.rmtree(folder, ignore_errors=True)
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f"Lỗi khi xóa folder {folder}: {e}")
    
    _TASK_STORE.clear()
    freed_mb = round(total_freed_bytes / (1024 * 1024), 2)
    return {
        "status": "ok",
        "deleted_count": deleted_count,
        "freed_mb": freed_mb,
        "message": f"Đã xóa toàn bộ {deleted_count} dự án dịch video và giải phóng {freed_mb} MB dung lượng!"
    }


@router.get("/active-task")
async def get_active_task():
    """Trả về tác vụ dịch video đang chạy hoặc vừa hoàn thành gần nhất."""
    for t_id, task in reversed(list(_TASK_STORE.items())):
        if task.get("status") in ["queued", "processing"]:
            return task

    if _TASK_STORE:
        last_id = list(_TASK_STORE.keys())[-1]
        return _TASK_STORE[last_id]

    if TRANSLATE_OUTPUT_DIR.exists():
        dirs = sorted(
            [d for d in TRANSLATE_OUTPUT_DIR.iterdir() if d.is_dir()],
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )
        for d in dirs:
            meta_file = d / "task_meta.json"
            if meta_file.exists():
                try:
                    import json
                    with open(meta_file, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
    return None


@router.get("/status/{task_id}", response_model=TranslationTaskStatus)
async def get_translation_status(task_id: str):
    """Tra cứu trạng thái và tiến độ xử lý của tác vụ dịch video theo task_id."""
    task = VideoTranslationPipeline.get_task(task_id)
    if not task:
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if task_dir.exists():
            meta_file = task_dir / "task_meta.json"
            if meta_file.exists():
                import json
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        task = json.load(f)
                except Exception:
                    pass

            if not task:
                mp4s = [f for f in task_dir.glob("*.mp4") if not f.name.startswith("input_")]
                if mp4s:
                    task = {
                        "task_id": task_id,
                        "status": "completed",
                        "progress": 100,
                        "current_step": "completed",
                        "message": "🎉 Quá trình dịch và lồng tiếng video đã hoàn tất!",
                        "video_url": f"/api/video-translate/stream/{task_id}",
                        "audio_url": None,
                        "subtitles_srt_url": f"/outputs/video_translate/{task_id}/subtitles.srt",
                        "elapsed_time": None,
                        "elapsed_str": "Đã hoàn thành",
                        "error": None,
                    }

    if not task:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tác vụ với mã '{task_id}'")

    if task.get("status") in ["processing", "queued"]:
        st = task.get("_start_time") or task.get("created_at")
        if st:
            current_elapsed = round(time.time() - float(st), 1)
            task["elapsed_time"] = current_elapsed
            task["elapsed_str"] = format_duration_vietnamese(current_elapsed)

    return TranslationTaskStatus(**task)


@router.post("/cleanup-cache")
async def cleanup_temporary_cache_endpoint():
    """Dọn dẹp các tệp tin rác và thư mục đệm tạm thời."""
    total_freed_bytes = 0
    deleted_files_count = 0
    deleted_dirs_count = 0

    active_task_ids = {
        t_id for t_id, t in _TASK_STORE.items()
        if t.get("status") in ["queued", "processing"]
    }

    # 1. Dọn dẹp outputs/alignment/
    alignment_dir = OUTPUTS_DIR / "alignment"
    if alignment_dir.exists():
        for item in alignment_dir.iterdir():
            if item.name in active_task_ids:
                continue
            try:
                if item.is_file():
                    total_freed_bytes += item.stat().st_size
                    item.unlink(missing_ok=True)
                    deleted_files_count += 1
                elif item.is_dir():
                    for sub in item.rglob("*"):
                        if sub.is_file():
                            total_freed_bytes += sub.stat().st_size
                            deleted_files_count += 1
                    shutil.rmtree(item, ignore_errors=True)
                    deleted_dirs_count += 1
            except Exception as e:
                logger.warning(f"Không thể xoá cache alignment {item}: {e}")

    # 2. Dọn dẹp outputs/dubbing/
    dubbing_dir = OUTPUTS_DIR / "dubbing"
    if dubbing_dir.exists():
        for item in dubbing_dir.iterdir():
            if item.name in active_task_ids:
                continue
            try:
                if item.is_file():
                    total_freed_bytes += item.stat().st_size
                    item.unlink(missing_ok=True)
                    deleted_files_count += 1
                elif item.is_dir():
                    for sub in item.rglob("*"):
                        if sub.is_file():
                            total_freed_bytes += sub.stat().st_size
                            deleted_files_count += 1
                    shutil.rmtree(item, ignore_errors=True)
                    deleted_dirs_count += 1
            except Exception as e:
                logger.warning(f"Không thể xoá cache dubbing {item}: {e}")

    # 3. Dọn dẹp outputs/audios/
    audios_dir = OUTPUTS_DIR / "audios"
    if audios_dir.exists():
        for item in audios_dir.iterdir():
            try:
                if item.is_file():
                    total_freed_bytes += item.stat().st_size
                    item.unlink(missing_ok=True)
                    deleted_files_count += 1
                elif item.is_dir():
                    for sub in item.rglob("*"):
                        if sub.is_file():
                            total_freed_bytes += sub.stat().st_size
                            deleted_files_count += 1
                    shutil.rmtree(item, ignore_errors=True)
                    deleted_dirs_count += 1
            except Exception as e:
                logger.warning(f"Không thể xoá audio phòng thu {item}: {e}")

    # 4. Dọn dẹp outputs/captions/
    captions_dir = OUTPUTS_DIR / "captions"
    if captions_dir.exists():
        for item in captions_dir.iterdir():
            try:
                if item.is_file():
                    total_freed_bytes += item.stat().st_size
                    item.unlink(missing_ok=True)
                    deleted_files_count += 1
                elif item.is_dir():
                    for sub in item.rglob("*"):
                        if sub.is_file():
                            total_freed_bytes += sub.stat().st_size
                            deleted_files_count += 1
                    shutil.rmtree(item, ignore_errors=True)
                    deleted_dirs_count += 1
            except Exception as e:
                logger.warning(f"Không thể xoá cache caption {item}: {e}")

    # 5. Dọn dẹp outputs/ temp
    if OUTPUTS_DIR.exists():
        for pattern in ["random_preview_*.*", "temp_*.*"]:
            for item in OUTPUTS_DIR.glob(pattern):
                try:
                    if item.is_file():
                        total_freed_bytes += item.stat().st_size
                        item.unlink(missing_ok=True)
                        deleted_files_count += 1
                except Exception:
                    pass

    # 6. Dọn dẹp outputs/video_translate/
    if TRANSLATE_OUTPUT_DIR.exists():
        for item in TRANSLATE_OUTPUT_DIR.iterdir():
            if item.is_dir():
                task_id = item.name
                if task_id in active_task_ids:
                    continue

                for pattern in ["compressed_*.*", "*_compressed.*", "voice_timeline_raw.wav", "chunks_list.txt", "*.tmp"]:
                    for junk_file in item.glob(pattern):
                        try:
                            if junk_file.is_file() and not junk_file.name.startswith("final_"):
                                total_freed_bytes += junk_file.stat().st_size
                                junk_file.unlink(missing_ok=True)
                                deleted_files_count += 1
                        except Exception:
                            pass

    freed_mb = round(total_freed_bytes / (1024 * 1024), 2)
    logger.info(f"🧹 [Cache Cleanup] Đã giải phóng {freed_mb} MB ({deleted_files_count} files, {deleted_dirs_count} folders)")

    return {
        "message": f"Đã dọn dẹp các tệp tạm và giải phóng thành công {freed_mb} MB dung lượng đĩa!",
        "freed_mb": freed_mb,
        "deleted_files_count": deleted_files_count,
        "deleted_dirs_count": deleted_dirs_count,
    }


@router.post("/cleanup-expired")
async def cleanup_expired_video_translate_tasks_endpoint(days: int = Query(7, ge=1, le=365)):
    """Tự động xóa các dự án dịch video cũ hơn số ngày chỉ định."""
    cutoff_time = time.time() - (days * 86400)
    deleted_count = 0
    total_freed_bytes = 0

    if TRANSLATE_OUTPUT_DIR.exists():
        for folder in list(TRANSLATE_OUTPUT_DIR.iterdir()):
            if not folder.is_dir():
                continue
            task_id = folder.name
            meta_file = folder / "task_meta.json"
            created_at = None
            if meta_file.exists():
                try:
                    import json
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                        created_at = meta.get("created_at") or meta.get("_start_time")
                except Exception:
                    pass
            if created_at is None:
                created_at = folder.stat().st_mtime

            try:
                created_at = float(created_at)
            except (ValueError, TypeError):
                created_at = folder.stat().st_mtime

            if created_at < cutoff_time:
                try:
                    for sub in folder.rglob("*"):
                        if sub.is_file():
                            total_freed_bytes += sub.stat().st_size
                    VideoTranslationPipeline.delete_task(task_id)
                    deleted_count += 1
                except Exception as e:
                    logger.warning(f"Lỗi khi tự động xóa task cũ {task_id}: {e}")

    freed_mb = round(total_freed_bytes / (1024 * 1024), 2)
    return {
        "status": "ok",
        "deleted_count": deleted_count,
        "freed_mb": freed_mb,
        "days": days,
        "message": f"Đã tự động xóa {deleted_count} dự án cũ hơn {days} ngày và giải phóng {freed_mb} MB!"
    }
