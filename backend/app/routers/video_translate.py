"""
app/routers/video_translate.py
──────────────────────────────
API Router cho dịch và lồng tiếng video trọn gói:
- Khởi chạy tác vụ dịch video bất đồng bộ (Background Task)
- Tra cứu trạng thái tiến độ thời gian thực (Progress 0% -> 100%)
- Hỗ trợ chế độ 2-bước tương tác (Duyệt/sửa phụ đề dịch trước khi render video)
"""

import json
import uuid
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks, Query
import subprocess
import os
from fastapi.responses import FileResponse
from app.core.config import OUTPUTS_DIR, logger
from app.schemas.video_translate import (
    TranslationTaskStatus,
    RedubTaskRequest,
    SaveSubtitlesRequest,
    VerifyKeyRequest,
    ContinueTranslationRequest,
    SaveBilingualRequest,
    BilingualSegmentItem,
    StudioRedubSegmentRequest,
    StudioRemuxRequest,
)
from app.services.translator_service import GoogleAIStudioTranslator, GoogleTranslator
from app.services.translation_memory_service import TranslationMemoryService
from app.services.video_translation_pipeline import (
    VideoTranslationPipeline,
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
    format_duration_vietnamese,
)

router = APIRouter(prefix="/api/video-translate", tags=["Video Translation"])


_BACKGROUND_TASKS: set[asyncio.Task] = set()


@router.post("/verify-gemini-key")
async def verify_gemini_key_endpoint(req: VerifyKeyRequest):
    """Xác thực API Key Google AI Studio (Gemini)."""
    return await GoogleAIStudioTranslator.verify_api_key(req.api_key)


@router.get("/warmup")
async def warmup_whisper():
    """Endpoint cho phép kiểm tra hoặc kích hoạt nạp trước Faster-Whisper."""
    try:
        from caption_handler import get_whisper_model
        await asyncio.to_thread(get_whisper_model)
        return {"status": "ready", "message": "Faster-Whisper đã sẵn sàng trong bộ nhớ"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/start")
async def start_video_translation(
    video: UploadFile = File(..., description="File video MP4 / MKV / MOV cần dịch"),
    source_lang: str = Form("auto"),
    target_lang: str = Form("vi"),
    voice_id: str = Form("vi-VN-HoaiMyNeural"),
    engine: str = Form("edge-tts"),
    voice_rate: str = Form("+0%"),
    voice_pitch: str = Form("+0Hz"),
    voice_volume: float = Form(1.0),
    preserve_bgm: bool = Form(True),
    bgm_volume: float = Form(0.25),
    subtitle_mode: str = Form("hard_target"),
    max_speed_rate: float = Form(1.35),
    translation_provider: str = Form("google"),
    translation_api_key: str | None = Form(None),
    translation_style: str = Form("auto"),
    translation_model: str = Form("gemini-2.5-flash"),
    translation_temperature: float = Form(0.2),
    whisper_model: str = Form("large-v3"),
    pause_for_review: bool = Form(False),
):
    """
    Tiếp nhận video tải lên và kích hoạt Pipeline dịch & lồng tiếng tự động chạy ngầm.
    Trả về ngay task_id để client theo dõi tiến trình.
    """
    if translation_provider.lower() in ["gemini", "google_ai_studio", "google-ai-studio"]:
        effective_key = translation_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_STUDIO_API_KEY")
        if not effective_key or not effective_key.strip():
            raise HTTPException(
                status_code=400,
                detail="Bạn đã chọn 'Google AI Studio (Gemini)' nhưng chưa nhập API Key. Vui lòng nhập API Key để dịch chuẩn ngữ cảnh phim, hoặc chọn kênh 'Google Dịch (Miễn phí)'.",
            )

    task_id = uuid.uuid4().hex[:12]
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    task_dir.mkdir(parents=True, exist_ok=True)

    input_video_path = task_dir / f"input_{video.filename}"

    # Lưu file qua thread riêng để không block asyncio loop
    def _save_uploaded_video():
        with open(input_video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

    await asyncio.to_thread(_save_uploaded_video)

    # Khởi tạo trạng thái ban đầu
    now_ts = time.time()
    _TASK_STORE[task_id] = {
        "task_id": task_id,
        "status": "processing",
        "progress": 3,
        "current_step": "extracting",
        "message": "Đang tiếp nhận video và khởi tạo pipeline xử lý...",
        "source_lang": source_lang,
        "target_lang": target_lang,
        "total_segments": 0,
        "video_url": None,
        "audio_url": None,
        "subtitles_srt_url": None,
        "subtitles_original_srt_url": None,
        "pause_for_review": pause_for_review,
        "_start_time": now_ts,
        "created_at": now_ts,
        "elapsed_time": 0.0,
        "elapsed_str": "0 giây",
        "error": None,
    }

    # Chạy pipeline ngầm và lưu tham chiếu tránh garbage collection
    bg_task = asyncio.create_task(
        VideoTranslationPipeline.run_pipeline(
            task_id=task_id,
            video_path=input_video_path,
            source_lang=source_lang,
            target_lang=target_lang,
            voice_id=voice_id,
            engine=engine,
            voice_rate=voice_rate,
            voice_pitch=voice_pitch,
            voice_volume=voice_volume,
            preserve_bgm=preserve_bgm,
            bgm_volume=bgm_volume,
            subtitle_mode=subtitle_mode,
            max_speed_rate=max_speed_rate,
            translation_provider=translation_provider,
            translation_api_key=translation_api_key,
            translation_style=translation_style,
            translation_model=translation_model,
            translation_temperature=translation_temperature,
            whisper_model=whisper_model,
            pause_for_review=pause_for_review,
        )
    )
    _BACKGROUND_TASKS.add(bg_task)
    bg_task.add_done_callback(_BACKGROUND_TASKS.discard)

    return {
        "task_id": task_id,
        "status": "processing",
        "message": "Tác vụ dịch video đã được khởi chạy thành công.",
    }


@router.get("/active-task")
async def get_active_task():
    """
    Trả về tác vụ dịch video đang chạy hoặc vừa hoàn thành gần nhất
    giúp Frontend tự động khôi phục giao diện khi chuyển qua lại giữa các trang.
    """
    # 1. Tìm tác vụ đang trong tiến trình xử lý
    for t_id, task in reversed(list(_TASK_STORE.items())):
        if task.get("status") in ["queued", "processing"]:
            return task

    # 2. Nếu không có tác vụ đang chạy, lấy tác vụ vừa kết thúc gần nhất
    if _TASK_STORE:
        last_id = list(_TASK_STORE.keys())[-1]
        return _TASK_STORE[last_id]

    # 3. Fallback tìm từ thư mục lưu trữ gần nhất
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
        # Fallback đọc từ đĩa nếu server vừa reload
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

    # Tính toán thời gian thực tế tức thì (Live Elapsed Time) cho tiến trình đang chạy
    if task.get("status") in ["processing", "queued"]:
        st = task.get("_start_time") or task.get("created_at")
        if st:
            import time
            current_elapsed = round(time.time() - float(st), 1)
            task["elapsed_time"] = current_elapsed
            task["elapsed_str"] = format_duration_vietnamese(current_elapsed)

    return TranslationTaskStatus(**task)


@router.get("/stream/{task_id}")
async def stream_translated_video(task_id: str):
    """
    Endpoint phát luồng (Stream) video mượt mà cho trình phát web.
    Hỗ trợ chuẩn HTTP 206 Partial Content và Range Request của trình duyệt.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy video")

    candidates = [
        task_dir / "final_translated.mp4",
        *[f for f in task_dir.glob("*.mp4") if not f.name.startswith("input_")],
        *list(task_dir.glob("*.mp4")),
    ]
    for cand in candidates:
        if cand.exists() and cand.is_file():
            return FileResponse(path=str(cand), media_type="video/mp4")

    raise HTTPException(status_code=404, detail="File video chưa sẵn sàng")


@router.get("/download/{task_id}")
async def download_file_endpoint(
    task_id: str,
    file_type: str = Query("video", description="Loại file cần tải: 'video', 'srt', hoặc 'audio'"),
):
    """
    Endpoint tải file video / phụ đề / âm thanh trực tiếp về máy.
    Tự động gắn Content-Disposition: attachment giúp trình duyệt kích hoạt tải về trực tiếp.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail=f"Không tìm thấy thư mục xử lý của tác vụ '{task_id}'")

    if file_type.lower() in ["srt_original", "original_srt", "srt_source"]:
        orig_srt = task_dir / "subtitles_original.srt"
        if not orig_srt.exists():
            raise HTTPException(status_code=404, detail="Chưa có file phụ đề thoại gốc nào được tạo")
        return FileResponse(
            path=str(orig_srt),
            filename=f"original_subtitles_{task_id}.srt",
            media_type="text/plain; charset=utf-8",
        )

    if file_type.lower() == "srt":
        srt_file = task_dir / "subtitles.srt"
        if not srt_file.exists():
            srt_candidates = [f for f in task_dir.glob("*.srt") if not f.name.startswith("subtitles_original")]
            if not srt_candidates:
                raise HTTPException(status_code=404, detail="Chưa có file phụ đề SRT nào được tạo")
            srt_file = srt_candidates[0]
        return FileResponse(
            path=str(srt_file),
            filename=f"translated_subtitles_{task_id}.srt",
            media_type="text/plain; charset=utf-8",
        )

    if file_type.lower() == "audio":
        audio_candidates = list(task_dir.glob("final_*.wav")) or list(task_dir.glob("*.wav"))
        if not audio_candidates:
            raise HTTPException(status_code=404, detail="Chưa có file âm thanh nào được tạo")
        audio_file = audio_candidates[0]
        return FileResponse(
            path=str(audio_file),
            filename=f"dubbed_audio_{task_id}.wav",
            media_type="audio/wav",
        )

    # Mặc định file_type == 'video'
    candidates = [
        task_dir / "final_translated.mp4",
        *[f for f in task_dir.glob("*.mp4") if not f.name.startswith("input_")],
        *list(task_dir.glob("*.mp4")),
    ]
    for cand in candidates:
        if cand.exists() and cand.is_file():
            return FileResponse(
                path=str(cand),
                filename=f"translated_video_{task_id}.mp4",
                media_type="video/mp4",
            )
    raise HTTPException(status_code=404, detail="File video hoàn thiện chưa sẵn sàng hoặc render chưa hoàn tất")


@router.post("/cleanup-cache")
async def cleanup_temporary_cache_endpoint():
    """
    Dọn dẹp các tệp tin rác và thư mục đệm tạm thời:
    - BẢO VỆ TUYỆT ĐỐI các tác vụ đang xử lý (queued, processing) không bị gián đoạn hay mất file.
    - Xóa toàn bộ file audio phòng thu lịch sử trong outputs/audios/ để giải phóng ổ đĩa.
    - Xóa các file phụ đề tạm trong outputs/captions/.
    - Dọn dẹp các file đệm trong outputs/alignment/, outputs/dubbing/ của các tác vụ cũ.
    - Dọn dẹp outputs/video_translate/ của các tác vụ đã hoàn thành hoặc thất bại.
    """
    total_freed_bytes = 0
    deleted_files_count = 0
    deleted_dirs_count = 0

    # Danh sách các task_id đang chạy - BẤT KHẢ XÂM PHẠM
    active_task_ids = {
        t_id for t_id, t in _TASK_STORE.items()
        if t.get("status") in ["queued", "processing"]
    }

    # 1. Dọn dẹp outputs/alignment/ (Bỏ qua các task đang chạy)
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

    # 2. Dọn dẹp outputs/dubbing/ (Bỏ qua các task đang chạy)
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

    # 3. Dọn dẹp file âm thanh phòng thu lịch sử trong outputs/audios/
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

    # 5. Dọn dẹp các file rác preview / temp trong outputs/
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

    # 6. Dọn dẹp outputs/video_translate/ (Chỉ xoá các tác vụ đã kết thúc, bảo vệ tuyệt đối task đang chạy)
    if TRANSLATE_OUTPUT_DIR.exists():
        for item in TRANSLATE_OUTPUT_DIR.iterdir():
            if item.is_dir():
                task_id = item.name
                if task_id in active_task_ids:
                    continue  # Bỏ qua tác vụ đang chạy

                task_info = _TASK_STORE.get(task_id)
                if not task_info or task_info.get("status") in ["completed", "failed"]:
                    try:
                        for sub in item.rglob("*"):
                            if sub.is_file():
                                total_freed_bytes += sub.stat().st_size
                                deleted_files_count += 1
                        shutil.rmtree(item, ignore_errors=True)
                        deleted_dirs_count += 1
                        if task_id in _TASK_STORE:
                            _TASK_STORE.pop(task_id, None)
                    except Exception as e:
                        logger.warning(f"Không thể xoá thư mục task cũ {item}: {e}")

    freed_mb = round(total_freed_bytes / (1024 * 1024), 2)
    logger.info(f"🧹 [Cache Cleanup] Đã giải phóng {freed_mb} MB ({deleted_files_count} files, {deleted_dirs_count} folders)")

    return {
        "message": f"Đã dọn dẹp các tệp tạm và giải phóng thành công {freed_mb} MB dung lượng đĩa!",
        "freed_mb": freed_mb,
        "deleted_files_count": deleted_files_count,
        "deleted_dirs_count": deleted_dirs_count,
    }


@router.post("/open-editor/{task_id}")
async def open_subtitles_in_external_editor(task_id: str):
    """
    Mở trực tiếp file subtitles.srt bằng Notepad++ hoặc Notepad trên máy tính,
    đồng thời trả về nội dung để giao diện web hiển thị ngay lập tức.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    srt_file = task_dir / "subtitles.srt"
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="File phụ đề subtitles.srt chưa được tạo hoặc không tồn tại.")

    abs_path_str = str(srt_file.resolve())
    opened = False
    editor_name = "Notepad"

    # 1. Thử mở bằng Notepad++ nếu có
    npp_paths = [
        r"C:\Program Files\Notepad++\notepad++.exe",
        r"C:\Program Files (x86)\Notepad++\notepad++.exe",
    ]
    for p in npp_paths:
        if Path(p).exists():
            try:
                subprocess.Popen([p, abs_path_str])
                opened = True
                editor_name = "Notepad++"
                break
            except Exception:
                pass

    # 2. Thử mở bằng notepad.exe
    if not opened:
        try:
            subprocess.Popen(f'notepad.exe "{abs_path_str}"', shell=True)
            opened = True
            editor_name = "Notepad"
        except Exception:
            pass

    # 3. Fallback dùng shell mặc định của Windows
    if not opened:
        try:
            import os
            os.startfile(abs_path_str)
            opened = True
            editor_name = "Trình soạn thảo mặc định"
        except Exception as ex:
            logger.warning(f"Không thể startfile: {ex}")

    content = ""
    try:
        content = srt_file.read_text(encoding="utf-8")
    except Exception:
        pass

    logger.info(f"Đã mở file phụ đề {srt_file} bằng {editor_name}")
    return {
        "status": "ok",
        "message": f"Đã mở file phụ đề bằng {editor_name}. Bạn có thể sửa trực tiếp trên Notepad hoặc trên giao diện Web!",
        "editor": editor_name,
        "file_path": abs_path_str,
        "content": content,
    }


@router.get("/subtitles-content/{task_id}")
async def get_subtitles_content(task_id: str):
    """
    Lấy toàn bộ nội dung văn bản thô của file phụ đề subtitles.srt để hiển thị trực tiếp trên trình duyệt.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    srt_file = task_dir / "subtitles.srt"
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="File subtitles.srt không tồn tại.")
    try:
        content = srt_file.read_text(encoding="utf-8")
        return {"content": content, "file_path": str(srt_file)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file phụ đề: {str(e)}")


@router.post("/subtitles-content/{task_id}")
async def save_subtitles_content(task_id: str, req: SaveSubtitlesRequest):
    """
    Lưu nội dung chỉnh sửa phụ đề từ giao diện web vào file subtitles.srt,
    đồng thời tự động đối chiếu và nạp các câu sửa đổi vào Bộ nhớ học tập (Translation Memory).
    """
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

    # Tự động học các câu sửa đổi
    learned_items = []
    try:
        task = VideoTranslationPipeline.get_task(task_id)
        source_lang = task.source_lang if task and task.source_lang else "zh"
        target_lang = task.target_lang if task and task.target_lang else "vi"
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


@router.get("/subtitles-original-content/{task_id}")
async def get_subtitles_original_content(task_id: str):
    """
    Lấy toàn bộ nội dung văn bản thô của file phụ đề câu gốc subtitles_original.srt để người dùng xem và duyệt.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    srt_file = task_dir / "subtitles_original.srt"
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="File phụ đề câu gốc chưa được tạo hoặc không tồn tại.")
    try:
        content = srt_file.read_text(encoding="utf-8")
        return {"content": content, "file_path": str(srt_file)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc file phụ đề gốc: {str(e)}")


@router.post("/subtitles-original-content/{task_id}")
async def save_subtitles_original_content(task_id: str, req: SaveSubtitlesRequest):
    """
    Lưu nội dung chỉnh sửa câu gốc tiếng Trung vào file subtitles_original.srt trước khi bắt đầu dịch.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Thư mục tác vụ không tồn tại.")

    srt_file = task_dir / "subtitles_original.srt"
    try:
        srt_file.write_text(req.content.strip(), encoding="utf-8")
        return {
            "status": "ok",
            "message": "Đã lưu nội dung phụ đề câu gốc thành công.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi ghi file phụ đề gốc: {str(e)}")


@router.get("/bilingual-review/{task_id}")
async def get_bilingual_review_data(task_id: str):
    """
    Lấy danh sách các câu thoại song ngữ đối chiếu (Trung - Việt) để người dùng xem và chỉnh sửa.
    Nếu chưa có bản dịch nháp, hệ thống tự động dịch nhanh qua GoogleTranslator trong 1 giây.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Thư mục tác vụ không tồn tại.")

    bilingual_file = task_dir / "bilingual_review.json"
    if bilingual_file.exists():
        try:
            with open(bilingual_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"segments": data}
        except Exception:
            pass

    # Nếu chưa có file JSON, parse subtitles_original.srt và dịch nháp
    srt_orig = task_dir / "subtitles_original.srt"
    if not srt_orig.exists():
        raise HTTPException(status_code=404, detail="Phụ đề gốc chưa sẵn sàng.")

    orig_segs = VideoTranslationPipeline.parse_srt_file(srt_orig)
    if not orig_segs:
        return {"segments": []}

    task = VideoTranslationPipeline.get_task(task_id) or {}
    src_lang = task.get("detected_source_lang", task.get("source_lang", "zh-cn"))
    tgt_lang = task.get("target_lang", "vi")

    raw_texts = [s["text"] for s in orig_segs]
    try:
        draft_vi_texts = await GoogleTranslator.translate_batch_texts(
            raw_texts,
            source_lang=src_lang,
            target_lang=tgt_lang,
        )
    except Exception as e:
        logger.warning(f"Lỗi dịch nháp song ngữ: {e}")
        draft_vi_texts = raw_texts

    bilingual_data = []
    for s, vi_txt in zip(orig_segs, draft_vi_texts):
        bilingual_data.append({
            "id": s["id"],
            "start": s["start"],
            "end": s["end"],
            "source_text": s["text"],
            "target_text": vi_txt,
        })

    try:
        with open(bilingual_file, "w", encoding="utf-8") as f:
            json.dump(bilingual_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Lỗi lưu bilingual_review.json: {e}")

    return {"segments": bilingual_data}


@router.post("/bilingual-review/{task_id}")
async def save_bilingual_review_data(task_id: str, req: SaveBilingualRequest):
    """
    Lưu danh sách câu đối chiếu song ngữ do người dùng chỉnh sửa.
    """
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Thư mục tác vụ không tồn tại.")

    bilingual_file = task_dir / "bilingual_review.json"
    segments_dict = [s.model_dump() for s in req.segments]
    try:
        with open(bilingual_file, "w", encoding="utf-8") as f:
            json.dump(segments_dict, f, ensure_ascii=False, indent=2)

        # Cập nhật luôn file subtitles_original.srt
        srt_orig = task_dir / "subtitles_original.srt"
        orig_segs = [
            {
                "id": s["id"],
                "start": s["start"],
                "end": s["end"],
                "text": s["source_text"],
            }
            for s in segments_dict
        ]
        from app.services.video_translation_pipeline import generate_srt_file
        generate_srt_file(orig_segs, srt_orig, mode="hard_target")

        return {"status": "ok", "message": "Đã lưu bản đối chiếu song ngữ thành công!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi ghi file song ngữ: {str(e)}")


@router.post("/continue/{task_id}")
async def continue_video_translation(task_id: str, req: ContinueTranslationRequest | None = None):
    """
    Tiếp tục quy trình Dịch thuật & Lồng tiếng sau khi người dùng đã duyệt/sửa câu gốc tiếng Trung.
    """
    task = VideoTranslationPipeline.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tác vụ {task_id}.")

    srt_content = req.srt_content if req else None
    bilingual_segments = [s.model_dump() for s in req.bilingual_segments] if req and req.bilingual_segments else None
    use_user_translations = req.use_user_translations if req else False

    # Khởi chạy resume ngầm
    bg_task = asyncio.create_task(
        VideoTranslationPipeline.resume_pipeline(
            task_id=task_id,
            srt_content=srt_content,
            bilingual_segments=bilingual_segments,
            use_user_translations=use_user_translations,
        )
    )
    _BACKGROUND_TASKS.add(bg_task)
    bg_task.add_done_callback(_BACKGROUND_TASKS.discard)

    return {
        "status": "processing",
        "task_id": task_id,
        "message": "Đã xác nhận câu gốc thành công. Đang tiếp tục Dịch & Lồng tiếng...",
    }


@router.post("/redub/{task_id}")
async def redub_video_from_subtitles(task_id: str, req: RedubTaskRequest | None = None):
    """
    Thực hiện lồng tiếng và render lại video MP4 dựa theo file phụ đề subtitles.srt đã được người dùng chỉnh sửa.
    Tự động ghi nhớ các câu sửa đổi của người dùng vào Translation Memory.
    """
    task = VideoTranslationPipeline.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tác vụ {task_id}.")

    req_data = req.model_dump() if req else {}
    task_dir = TRANSLATE_OUTPUT_DIR / task_id

    # Tự động học các câu sửa đổi trước khi redub
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
                source_lang=task.source_lang or "zh",
                target_lang=task.target_lang or "vi",
            )
    except Exception as e:
        logger.warning(f"Lỗi học khi redub task {task_id}: {e}")

    # Đưa trạng thái về processing
    VideoTranslationPipeline.update_task(
        task_id,
        status="processing",
        progress=15,
        current_step="dubbing",
        message="Bắt đầu lồng tiếng lại từ phụ đề đã chỉnh sửa...",
    )

    # Chạy tác vụ ngầm
    asyncio.create_task(
        VideoTranslationPipeline.run_redub(
            task_id=task_id,
            srt_content=req_data.get("srt_content"),
            voice_id=req_data.get("voice_id"),
            engine=req_data.get("engine"),
            voice_rate=req_data.get("voice_rate"),
            voice_pitch=req_data.get("voice_pitch"),
            voice_volume=req_data.get("voice_volume"),
            preserve_bgm=req_data.get("preserve_bgm"),
            bgm_volume=req_data.get("bgm_volume"),
            subtitle_mode=req_data.get("subtitle_mode"),
            max_speed_rate=req_data.get("max_speed_rate"),
        )
    )

    return {
        "task_id": task_id,
        "status": "processing",
        "message": "Đã tiếp nhận yêu cầu lồng tiếng lại theo phụ đề mới.",
    }


# ── CÁC ENDPOINT QUẢN LÝ BỘ NHỚ HỌC TẬP (TRANSLATION MEMORY) ─────────────

@router.get("/memory")
async def get_translation_memory(source_lang: str | None = None, target_lang: str | None = None, limit: int = 150):
    """Lấy danh sách các câu thoại và thuật ngữ AI đã học từ người dùng."""
    items = TranslationMemoryService.get_all_memories(source_lang=source_lang, target_lang=target_lang, limit=limit)
    return {
        "status": "ok",
        "total": len(items),
        "items": items,
    }


@router.delete("/memory/{memory_id}")
async def delete_translation_memory_item(memory_id: str):
    """Xóa một câu kinh nghiệm khỏi bộ nhớ của AI."""
    ok = TranslationMemoryService.delete_memory(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục kinh nghiệm cần xóa.")
    return {"status": "ok", "message": "Đã xóa mục kinh nghiệm thành công."}


@router.delete("/memory")
async def clear_all_translation_memory():
    """Xóa toàn bộ bộ nhớ tự học của AI (Reset)."""
    TranslationMemoryService.clear_all_memories()
    return {"status": "ok", "message": "Đã làm trống toàn bộ bộ nhớ tự học của AI."}


@router.post("/memory/manual")
async def add_manual_translation_memory(req: dict):
    """Người dùng tự thêm thủ công 1 quy tắc dịch hoặc thuật ngữ mẫu."""
    src = req.get("source_text", "").strip()
    corrected = req.get("user_corrected", "").strip()
    ai_orig = req.get("ai_translated", "").strip()
    if not src or not corrected:
        raise HTTPException(status_code=400, detail="Vui lòng nhập câu gốc và bản dịch chuẩn.")
    item = TranslationMemoryService.add_or_update_memory(
        source_text=src,
        user_corrected=corrected,
        ai_translated=ai_orig,
        source_lang=req.get("source_lang", "zh"),
        target_lang=req.get("target_lang", "vi"),
    )
    return {"status": "ok", "message": "Đã thêm quy tắc dịch vào bộ nhớ của AI.", "item": item}


@router.post("/open-folder/{task_id}")
async def open_task_folder_endpoint(task_id: str):
    """Mở thư mục chứa video hoàn thiện trên Windows Explorer."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục tác vụ")

    video_file = task_dir / "final_translated.mp4"
    target = video_file if video_file.exists() else task_dir

    try:
        if os.name == "nt":
            import subprocess
            clean_path = str(target.resolve()).replace("/", "\\")
            subprocess.Popen(f'explorer /select,"{clean_path}"', shell=True)
        return {
            "status": "success",
            "message": f"Đã mở thư mục chứa video: {target}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/social-share-info/{task_id}")
async def get_social_share_info_endpoint(task_id: str):
    """Lấy thông tin tiêu đề, mô tả, thẻ hashtag AI và các liên kết đăng tải MXH (TikTok, YouTube, Facebook)."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục tác vụ")

    meta_file = task_dir / "task_meta.json"
    meta = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    segments = meta.get("segments", [])
    first_few = [s.get("text", "") for s in segments[:4] if s.get("text") and len(s.get("text")) > 5]
    sample_dialogue = " ".join(first_few)

    suggested_title = "Phim Ngắn: " + (first_few[0].rstrip(".?!") if first_few else "Tập Phim Lồng Tiếng Mới Nhất #Shorts")
    if len(suggested_title) > 90:
        suggested_title = suggested_title[:87] + "..."

    suggested_tags = "#phimngan #shorts #tiktokviral #reels #trending #douyin #phimhay #review"
    suggested_desc = (
        f"{suggested_title}\n\n"
        f"Trích đoạn: {sample_dialogue[:180]}...\n\n"
        f"Dịch & Lồng tiếng AI bởi VoiceSync Studio.\n"
        f"{suggested_tags}"
    )

    video_file = task_dir / "final_translated.mp4"

    return {
        "task_id": task_id,
        "title": suggested_title,
        "description": suggested_desc,
        "hashtags": suggested_tags,
        "video_filename": video_file.name if video_file.exists() else "final_translated.mp4",
        "video_absolute_path": str(video_file.resolve()) if video_file.exists() else "",
        "direct_links": {
            "tiktok": "https://www.tiktok.com/creator-center/upload",
            "youtube": "https://studio.youtube.com/channel/UC/videos/upload?d=pt",
            "facebook": "https://www.facebook.com/reels/create",
        },
        "login_links": {
            "tiktok": "https://www.tiktok.com/login",
            "youtube": "https://studio.youtube.com",
            "facebook": "https://www.facebook.com/login",
        },
    }


@router.get("/studio-segments/{task_id}")
async def get_studio_segments_endpoint(task_id: str):
    """
    Lấy danh sách các câu thoại kèm âm thanh và mốc thời gian để phát real-time đồng bộ với video.
    """
    try:
        return VideoTranslationPipeline.get_studio_segments(task_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studio-redub-segment/{task_id}")
async def studio_redub_segment_endpoint(task_id: str, req: StudioRedubSegmentRequest):
    """
    Thuyết minh lại CỤC BỘ cho duy nhất 1 câu thoại (In-place Single Segment Re-dubbing).
    Chỉ mất ~0.5s - 1s, cập nhật ngay file âm thanh câu đó.
    """
    try:
        return await VideoTranslationPipeline.redub_single_segment(
            task_id=task_id,
            segment_id=req.segment_id,
            new_text=req.text,
            voice_id=req.voice_id,
            engine=req.engine,
            rate=req.voice_rate,
            pitch=req.voice_pitch,
            volume=req.voice_volume,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/studio-quick-remux/{task_id}")
async def studio_quick_remux_endpoint(task_id: str, req: StudioRemuxRequest | None = None):
    """
    Ráp lại dải âm thanh và mux lại vào video siêu tốc (chỉ 2-5 giây) sau khi người dùng sửa câu trong Studio.
    """
    try:
        req_data = req.model_dump() if req else {}
        return await VideoTranslationPipeline.quick_remux_video(
            task_id=task_id,
            subtitle_mode=req_data.get("subtitle_mode"),
            preserve_bgm=req_data.get("preserve_bgm"),
            bgm_volume=req_data.get("bgm_volume"),
            voice_volume=req_data.get("voice_volume"),
            max_speed_rate=req_data.get("max_speed_rate"),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

