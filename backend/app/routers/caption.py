import os
import json
import uuid
import shutil
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse

from app.core.config import CAPTIONS_DIR, OUTPUTS_DIR, logger
from app.schemas.caption import (
    AlignScriptRequest,
    OptimizeChunksRequest,
    ExportCaptionRequest,
    TrimSilencesRequest,
)
from caption_handler import (
    extract_audio,
    transcribe_video_audio,
    align_words_with_reference,
    resegment_words,
    generate_ass_subtitles,
    render_video_with_captions,
    trim_video_by_ranges,
)

router = APIRouter(prefix="/api/caption", tags=["Caption & Video"])


@router.post("/align-script")
async def align_script_endpoint(request: AlignScriptRequest):
    """
    So khớp danh sách segment hiện tại với kịch bản đối chiếu người dùng cung cấp.
    Giúp sửa toàn bộ lỗi nghe nhầm / chính tả tức thì trong <0.1s mà không cần chạy lại Whisper.
    """
    try:
        aligned_segments = align_words_with_reference(request.segments, request.reference_script)
        return {"segments": aligned_segments}
    except Exception as exc:
        logger.error(f"Lỗi khi so khớp kịch bản: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Không thể so khớp kịch bản: {str(exc)}") from exc


@router.post("/optimize-chunks")
async def optimize_chunks_endpoint(request: OptimizeChunksRequest):
    """
    Tự động chia nhỏ lại các câu phụ đề quá dài thành các câu 4-7 từ chuẩn ngắn gọn (Shorts/Reels) hiển thị 1 hàng.
    """
    try:
        all_words = []
        for s in request.segments:
            all_words.extend(s.get("words", []))
        new_segments = resegment_words(all_words, max_words=request.max_words)
        return {"segments": new_segments}
    except Exception as exc:
        logger.error(f"Lỗi khi chia nhỏ câu phụ đề: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Không thể chia nhỏ câu: {str(exc)}") from exc


def cleanup_caption_sessions(exclude_session_id: str | None = None) -> tuple[int, int]:
    """
    Dọn dẹp các thư mục session video trong outputs/captions/,
    chỉ giữ lại session đang hoạt động gần nhất (exclude_session_id).
    Trả về (số session đã xóa, số byte đã giải phóng).
    """
    deleted_count = 0
    freed_bytes = 0
    if not CAPTIONS_DIR.exists():
        return 0, 0

    for item in CAPTIONS_DIR.iterdir():
        if item.is_dir() and item.name != exclude_session_id:
            try:
                dir_size = sum(f.stat().st_size for f in item.rglob("*") if f.is_file())
                shutil.rmtree(item, ignore_errors=True)
                deleted_count += 1
                freed_bytes += dir_size
                logger.info(
                    f"🗑️ [AutoCaption Auto-Cleanup] Đã dọn session cũ: {item.name} "
                    f"({dir_size / (1024 * 1024):.2f} MB)"
                )
            except Exception as e:
                logger.warning(f"Không thể xóa session cũ {item.name}: {e}")

    return deleted_count, freed_bytes


@router.post("/transcribe")
async def transcribe_video(
    video: UploadFile = File(...),
    language: str = Form("vi"),
    model_size: str = Form("large-v3"),
    reference_script: str | None = Form(None),
    vad_threshold: float = Form(0.35),
    speech_pad_ms: int = Form(500),
    min_speech_duration_ms: int = Form(150),
    min_silence_duration_ms: int = Form(500),
    beam_size: int = Form(5),
):
    session_id = uuid.uuid4().hex[:12]

    # Tự động dọn sạch tất cả các session video cũ trước đó, chỉ giữ lại session duy nhất này
    try:
        cleanup_caption_sessions(exclude_session_id=session_id)
    except Exception as ce:
        logger.warning(f"Lỗi khi dọn dẹp session cũ: {ce}")

    session_dir = CAPTIONS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    video_suffix = Path(video.filename).suffix if video.filename else ".mp4"
    if not video_suffix:
        video_suffix = ".mp4"
    video_path = session_dir / f"video_raw{video_suffix}"
    audio_path = session_dir / "audio.wav"

    try:
        with open(video_path, "wb") as buffer:
            shutil.copyfileobj(video.file, buffer)

        extract_audio(video_path, audio_path)

        segments = transcribe_video_audio(
            audio_path,
            language=language,
            model_size=model_size,
            reference_script=reference_script,
            vad_threshold=vad_threshold,
            min_speech_duration_ms=min_speech_duration_ms,
            min_silence_duration_ms=min_silence_duration_ms,
            speech_pad_ms=speech_pad_ms,
            beam_size=beam_size,
        )

        raw_json_path = session_dir / "subtitles_raw.json"
        with open(raw_json_path, "w", encoding="utf-8") as f:
            json.dump(segments, f, ensure_ascii=False, indent=2)

        return {
            "session_id": session_id,
            "video_url": f"http://localhost:8000/outputs/captions/{session_id}/video_raw{video_suffix}",
            "filename": video.filename,
            "segments": segments,
        }
    except Exception as exc:
        logger.error(f"Lỗi khi xử lý video transcribe: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Không thể xử lý video: {str(exc)}"
        ) from exc


@router.post("/upload-bgm")
async def upload_bgm(
    bgm: UploadFile = File(...),
    session_id: str = Form(...),
):
    session_dir = CAPTIONS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    bgm_suffix = Path(bgm.filename).suffix if bgm.filename else ".mp3"
    bgm_path = session_dir / f"bgm{bgm_suffix}"

    try:
        with open(bgm_path, "wb") as buffer:
            shutil.copyfileobj(bgm.file, buffer)

        return {
            "session_id": session_id,
            "bgm_url": f"http://localhost:8000/outputs/captions/{session_id}/bgm{bgm_suffix}",
            "bgm_filename": bgm.filename,
        }
    except Exception as exc:
        logger.error(f"Lỗi khi lưu file BGM: {exc}")
        raise HTTPException(status_code=500, detail=f"Không thể tải lên BGM: {str(exc)}") from exc


@router.post("/attach-voiceover")
async def attach_voiceover(
    session_id: str = Form(...),
    voice_audio: UploadFile | None = File(None),
    voice_url: str | None = Form(None),
    reference_script: str | None = Form(None),
    auto_transcribe: bool = Form(True),
):
    session_dir = CAPTIONS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    voice_path = session_dir / "voiceover.wav"

    try:
        if voice_audio:
            suffix = Path(voice_audio.filename).suffix if voice_audio.filename else ".wav"
            temp_path = session_dir / f"voice_raw{suffix}"
            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(voice_audio.file, buffer)

            convert_cmd = [
                "ffmpeg", "-y", "-i", str(temp_path),
                "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
                str(voice_path),
            ]
            subprocess.run(convert_cmd, capture_output=True, check=True)
            if temp_path != voice_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
        elif voice_url:
            parsed_filename = voice_url.split("/")[-1].split("?")[0]
            local_src = OUTPUTS_DIR / parsed_filename
            if not local_src.exists():
                found_files = list(OUTPUTS_DIR.glob(f"**/{parsed_filename}"))
                if found_files:
                    local_src = found_files[0]

            if local_src.exists():
                convert_cmd = [
                    "ffmpeg", "-y", "-i", str(local_src),
                    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
                    str(voice_path),
                ]
                subprocess.run(convert_cmd, capture_output=True, check=True)
            elif "localhost" in voice_url or "127.0.0.1" in voice_url:
                raise HTTPException(
                    status_code=404,
                    detail=f"File âm thanh '{parsed_filename}' không tìm thấy trên server. Hãy tạo giọng đọc mới trong Studio hoặc tải lên file âm thanh từ máy tính.",
                )
            else:
                import httpx
                temp_dl = session_dir / "temp_dl_voice"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(voice_url, timeout=30.0)
                    resp.raise_for_status()
                    with open(temp_dl, "wb") as f:
                        f.write(resp.content)
                convert_cmd = [
                    "ffmpeg", "-y", "-i", str(temp_dl),
                    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
                    str(voice_path),
                ]
                subprocess.run(convert_cmd, capture_output=True, check=True)
                if temp_dl.exists():
                    try:
                        temp_dl.unlink()
                    except Exception:
                        pass
        else:
            raise HTTPException(status_code=400, detail="Cần cung cấp voice_audio hoặc voice_url")

        segments = []
        if auto_transcribe and voice_path.exists():
            segments = transcribe_video_audio(
                voice_path,
                language="vi",
                model_size="base",
                reference_script=reference_script,
            )
            raw_json_path = session_dir / "subtitles_raw.json"
            with open(raw_json_path, "w", encoding="utf-8") as f:
                json.dump(segments, f, ensure_ascii=False, indent=2)

        return {
            "session_id": session_id,
            "status": "success",
            "voiceover_url": f"http://localhost:8000/outputs/captions/{session_id}/voiceover.wav",
            "segments": segments,
        }
    except Exception as exc:
        logger.error(f"Lỗi khi gắn voiceover vào session: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Không thể gắn giọng đọc: {str(exc)}") from exc


@router.post("/upload-font")
async def upload_custom_font(
    font: UploadFile = File(...),
    session_id: str = Form(...),
):
    session_dir = CAPTIONS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    fonts_dir = session_dir / "fonts"
    fonts_dir.mkdir(exist_ok=True)

    font_filename = font.filename or "custom_font.ttf"
    font_path = fonts_dir / font_filename

    try:
        with open(font_path, "wb") as buffer:
            shutil.copyfileobj(font.file, buffer)

        font_family_name = Path(font_filename).stem
        logger.info(f"✅ Đã tải font tùy chỉnh: {font_family_name} ({font_filename})")

        return {
            "status": "success",
            "font_name": font_family_name,
            "filename": font_filename,
            "font_url": f"http://localhost:8000/outputs/captions/{session_id}/fonts/{font_filename}",
        }
    except Exception as exc:
        logger.error(f"Lỗi khi lưu font tùy chỉnh: {exc}")
        raise HTTPException(status_code=500, detail=f"Không thể tải font: {str(exc)}") from exc


@router.post("/export")
async def export_captioned_video(request: ExportCaptionRequest):
    session_dir = CAPTIONS_DIR / request.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Phiên làm việc (Session) không tồn tại")

    video_files = list(session_dir.glob("video_raw.*"))
    if not video_files:
        raise HTTPException(status_code=400, detail="Không tìm thấy video gốc trong session")
    video_path = video_files[0]

    voiceover_path = None
    if request.has_voiceover:
        voiceover_files = list(session_dir.glob("voiceover.*"))
        if voiceover_files:
            voiceover_path = voiceover_files[0]

    bgm_path = None
    if request.has_bgm:
        bgm_files = list(session_dir.glob("bgm.*"))
        if bgm_files:
            bgm_path = bgm_files[0]

    fonts_dir = session_dir / "fonts"
    fonts_dir_param = fonts_dir if (fonts_dir.exists() and any(fonts_dir.iterdir())) else None

    ass_path = session_dir / "subtitles.ass"
    output_path = session_dir / "output_final.mp4"

    if output_path.exists():
        try:
            output_path.unlink()
            logger.info(f"🗑️ Đã xóa video thành phẩm cũ của session {request.session_id} để tạo bản mới.")
        except Exception as e:
            logger.warning(f"Không thể xóa file cũ: {e}")

    try:
        generate_ass_subtitles(request.segments, request.style_config, ass_path, video_path=video_path)

        render_video_with_captions(
            video_path=video_path,
            ass_path=ass_path,
            output_path=output_path,
            voiceover_path=voiceover_path,
            voiceover_start_time=request.voiceover_start_time,
            audio_clips=request.audio_clips,
            bgm_path=bgm_path,
            bgm_volume=request.bgm_volume,
            fonts_dir=fonts_dir_param,
        )

        # Tự động dọn dẹp các file trung gian (audio.wav, video_trimmed_*.mp4) để tiết kiệm dung lượng
        try:
            for temp_trimmed in session_dir.glob("video_trimmed_*.mp4"):
                temp_trimmed.unlink(missing_ok=True)
            (session_dir / "audio.wav").unlink(missing_ok=True)
            logger.info(f"✨ [AutoCaption] Đã dọn dẹp file trung gian sau khi xuất video: {request.session_id}")
        except Exception as cle:
            logger.warning(f"Không thể dọn file trung gian: {cle}")

        return {
            "status": "success",
            "download_url": f"http://localhost:8000/api/caption/download/{request.session_id}",
            "filename": f"kinetic_{request.session_id[:8]}.mp4",
        }
    except Exception as exc:
        logger.error(f"Lỗi khi render video thành phẩm: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Render video thất bại: {str(exc)}"
        ) from exc


@router.get("/session/{session_id}/check")
async def check_caption_session(session_id: str):
    """Kiểm tra xem session có tồn tại trên server để khôi phục bản nháp không."""
    safe_id = os.path.basename(session_id)
    session_dir = CAPTIONS_DIR / safe_id
    if not session_dir.exists() or not session_dir.is_dir():
        return {"exists": False}

    video_files = list(session_dir.glob("video_raw.*"))
    if not video_files:
        return {"exists": False}

    video_file = video_files[0]
    output_final = session_dir / "output_final.mp4"

    return {
        "exists": True,
        "session_id": safe_id,
        "video_url": f"http://localhost:8000/outputs/captions/{safe_id}/{video_file.name}",
        "filename": video_file.name,
        "has_output": output_final.exists(),
        "download_url": f"http://localhost:8000/api/caption/download/{safe_id}" if output_final.exists() else None,
    }


@router.post("/session/clean-all")
async def clean_all_caption_sessions():
    """Xóa sạch tất cả các session trong outputs/captions/ để giải phóng ổ cứng."""
    deleted_count, freed_bytes = cleanup_caption_sessions(exclude_session_id=None)
    freed_mb = round(freed_bytes / (1024 * 1024), 2)
    return {
        "message": f"Đã dọn dẹp {deleted_count} phiên làm việc, giải phóng {freed_mb} MB.",
        "deleted_count": deleted_count,
        "freed_mb": freed_mb,
    }


@router.get("/download/{session_id}")
async def download_caption_video(session_id: str):
    safe_id = os.path.basename(session_id)
    video_path = CAPTIONS_DIR / safe_id / "output_final.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="File video thành phẩm không tồn tại")

    filename = f"kinetic_{safe_id[:8]}.mp4"
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=filename,
    )


@router.delete("/session/{session_id}")
@router.post("/session/{session_id}/delete")
async def delete_caption_session(session_id: str):
    safe_id = os.path.basename(session_id)
    session_dir = CAPTIONS_DIR / safe_id
    if session_dir.exists() and session_dir.is_dir():
        try:
            shutil.rmtree(session_dir)
            logger.info(f"🗑️ Đã dọn dẹp sạch thư mục session: {safe_id}")
            return {"message": "Đã dọn dẹp session thành công"}
        except Exception as e:
            logger.error(f"Lỗi khi xóa session {safe_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Không thể xóa session: {e}")
    return {"message": "Session không tồn tại hoặc đã bị xóa trước đó"}


@router.get("/session/{session_id}/restore-raw")
async def restore_raw_caption_segments(session_id: str):
    safe_id = os.path.basename(session_id)
    session_dir = CAPTIONS_DIR / safe_id
    raw_json_path = session_dir / "subtitles_raw.json"
    if not raw_json_path.exists():
        raise HTTPException(
            status_code=404, detail="Không tìm thấy bản sao lưu mốc phụ đề gốc trên server"
        )

    try:
        with open(raw_json_path, "r", encoding="utf-8") as f:
            segments = json.load(f)
        return {"session_id": safe_id, "segments": segments}
    except Exception as exc:
        logger.error(f"Lỗi khi đọc file mốc gốc: {exc}")
        raise HTTPException(status_code=500, detail="Lỗi khi đọc bản sao lưu mốc gốc")


@router.post("/trim-silences")
async def trim_silences_endpoint(body: TrimSilencesRequest):
    safe_id = os.path.basename(body.session_id)
    session_dir = CAPTIONS_DIR / safe_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    video_files = list(session_dir.glob("video_raw.*"))
    if not video_files:
        raise HTTPException(status_code=404, detail="Không tìm thấy video gốc trong session")

    input_video = video_files[0]
    trimmed_name = f"video_trimmed_{uuid.uuid4().hex[:8]}.mp4"
    output_video = session_dir / trimmed_name

    try:
        trim_video_by_ranges(input_video, body.keep_ranges, output_video)
        return {
            "session_id": safe_id,
            "trimmed_video_url": f"http://localhost:8000/outputs/captions/{safe_id}/{trimmed_name}",
            "filename": trimmed_name,
        }
    except Exception as exc:
        logger.error(f"Lỗi khi cắt gọt video bằng FFmpeg: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Cắt video thất bại: {str(exc)}"
        ) from exc
