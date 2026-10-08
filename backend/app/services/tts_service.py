import os
import re
import uuid
import shutil
import hashlib
import time
import unicodedata
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from fastapi import HTTPException, BackgroundTasks
from pydub import AudioSegment
from pydub.effects import normalize as pydub_normalize

from app.core.config import (
    BASE_DIR,
    OUTPUTS_DIR,
    CAPTIONS_DIR,
    AUDIOS_DIR,
    PRESETS_DIR,
    CUSTOM_VOICES_DIR,
    CUSTOM_VOICES_JSON,
    DEFAULT_NUM_STEP,
    logger,
    export_file_to_custom_directory,
)
from app.schemas.tts import (
    TTSRequest,
    TTSResponse,
    CleanupOrphansRequest,
    CleanupOrphansResponse,
    StitchRequest,
    StitchResponse,
    StitchSegmentItem,
)
from model_handler import (
    generate_audio,
    create_voice_prompt,
    VoiceClonePrompt,
)
from audio_processor import apply_ebur128_loudnorm
from app.core.storage_r2 import (
    upload_audio_to_r2,
    delete_audio_from_r2,
    delete_session_from_r2,
    delete_multiple_from_r2,
    cleanup_orphan_r2_files,
)


def slugify_vietnamese(text: str, max_chars: int = 24) -> str:
    """
    Chuyển đổi chuỗi (tiếng Việt có dấu, ký tự đặc biệt) thành dạng slug ASCII an toàn,
    dễ đọc cho tên file âm thanh và tương thích hoàn toàn với hệ điều hành và S3/R2.
    """
    if not text:
        return ""
    # 1. Bỏ các thẻ phi ngôn ngữ như [laughter], [chuckle], [sigh], etc.
    s = re.sub(r"\[.*?\]", "", text)

    # 2. Thay thế ký tự đ/Đ
    s = s.replace("đ", "d").replace("Đ", "d")

    # 3. Chuẩn hóa NFKD và loại bỏ dấu tiếng Việt (combining marks)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))

    # 4. Chuyển chữ thường và thay mọi ký tự không phải chữ/số thành dấu gạch ngang '-'
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")

    # 5. Cắt ngắn tối đa max_chars ký tự mà không làm gãy giữa từ
    if len(s) > max_chars:
        trimmed = s[:max_chars]
        last_dash = trimmed.rfind("-")
        if last_dash > max_chars // 2:
            s = trimmed[:last_dash]
        else:
            s = trimmed
        s = s.rstrip("-")

    return s


def cleanup_old_files(keep_latest: int = 200) -> None:
    """
    Dọn dẹp outputs/:
    - Xoá các file preview ngẫu nhiên 'random_preview_*' không được lưu (> 10 phút).
    - Xoá các file TTS cũ nếu vượt quá keep_latest.
    """
    now = time.time()
    try:
        orphan_previews = [
            f
            for f in OUTPUTS_DIR.glob("random_preview_*.*")
            if f.is_file() and (now - f.stat().st_mtime) > 600
        ]
        for f in orphan_previews:
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

        audio_files = sorted(
            [
                f
                for f in OUTPUTS_DIR.iterdir()
                if f.is_file() and f.suffix.lower() in [".wav", ".mp3"]
            ],
            key=lambda x: x.stat().st_mtime,
            reverse=True,
        )
        if len(audio_files) > keep_latest:
            for old_file in audio_files[keep_latest:]:
                try:
                    old_file.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Lỗi khi dọn dẹp outputs/: {e}")


def format_srt_time(seconds: float) -> str:
    """Chuyển đổi số giây thành định dạng thời gian SRT: 00:00:00,000"""
    millis = int(round(seconds * 1000))
    hours = millis // 3600000
    millis %= 3600000
    minutes = millis // 60000
    millis %= 60000
    secs = millis // 1000
    millis %= 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


async def synthesize_speech(request: TTSRequest, background_tasks: BackgroundTasks) -> TTSResponse:
    env_step = int(os.getenv("DEFAULT_NUM_STEP", str(DEFAULT_NUM_STEP)))
    steps = request.inference_timesteps or request.num_step or env_step

    cache_str = (
        f"{request.engine}_{request.text}_{request.mode}_{request.instruct}_{request.voice_id}_"
        f"{request.cfg_value}_{steps}_{request.seed}_{request.speed}_{request.pitch}_{request.format}_{request.enhance_audio}"
    )
    file_hash = hashlib.md5(cache_str.encode("utf-8")).hexdigest()

    ext = ".mp3" if request.format == "mp3" else ".wav"
    text_slug = slugify_vietnamese(request.text, max_chars=24)
    voice_slug = slugify_vietnamese(request.voice_id or "default", max_chars=20) or "voice"
    hash_short = file_hash[:8]

    if text_slug:
        filename = f"tts_{text_slug}_{voice_slug}_{hash_short}{ext}"
    else:
        filename = f"tts_{file_hash[:12]}{ext}"

    target_dir = OUTPUTS_DIR
    url_prefix = "http://localhost:8000/outputs"
    r2_key = f"outputs/{filename}"
    session_id = None

    if request.session_id and request.session_id.strip():
        session_id = os.path.basename(request.session_id.strip())
        target_dir = AUDIOS_DIR / session_id
        target_dir.mkdir(parents=True, exist_ok=True)
        url_prefix = f"http://localhost:8000/outputs/audios/{session_id}"
        r2_key = f"outputs/audios/{session_id}/{filename}"

    output_path = target_dir / filename
    legacy_output_path = target_dir / f"tts_{file_hash}{ext}"
    root_fallback_path = OUTPUTS_DIR / filename

    if output_path.exists():
        logger.info(f"⚡ CACHE HIT: Tái sử dụng {filename}")
        output_path.touch()
        r2_url = upload_audio_to_r2(output_path, object_key=r2_key)
        return TTSResponse(
            message="Tổng hợp thành công (Cache Hit)!",
            filename=filename,
            audio_url=r2_url or f"{url_prefix}/{filename}",
            session_id=session_id,
        )
    elif root_fallback_path.exists() and session_id:
        logger.info(f"⚡ CACHE HIT (Root Cache): Tái sử dụng {filename} từ cache chung")
        try:
            shutil.copy2(root_fallback_path, output_path)
            r2_url = upload_audio_to_r2(output_path, object_key=r2_key)
            return TTSResponse(
                message="Tổng hợp thành công (Cache Hit)!",
                filename=filename,
                audio_url=r2_url or f"{url_prefix}/{filename}",
                session_id=session_id,
            )
        except Exception as ce:
            logger.warning(f"Không thể copy từ root cache: {ce}")
    elif legacy_output_path.exists():
        logger.info(f"⚡ CACHE HIT (Legacy): Đổi tên {legacy_output_path.name} -> {filename}")
        try:
            legacy_output_path.rename(output_path)
            output_path.touch()
            r2_url = upload_audio_to_r2(output_path, object_key=r2_key)
            return TTSResponse(
                message="Tổng hợp thành công (Cache Hit)!",
                filename=filename,
                audio_url=r2_url or f"{url_prefix}/{filename}",
                session_id=session_id,
            )
        except Exception as e:
            logger.warning(f"Không thể đổi tên legacy cache file: {e}")
            output_path = legacy_output_path
            filename = legacy_output_path.name
            legacy_output_path.touch()
            r2_url = upload_audio_to_r2(output_path, object_key=r2_key)
            return TTSResponse(
                message="Tổng hợp thành công (Cache Hit)!",
                filename=filename,
                audio_url=r2_url or f"{url_prefix}/{filename}",
                session_id=session_id,
            )

    logger.info(f"⏳ CACHE MISS: Bắt đầu sinh mới {filename}")

    voice_clone_prompt = None
    ref_audio = request.prompt_wav_path
    ref_text = request.prompt_text

    if request.mode == "clone":
        if request.voice_id:
            custom_pt = CUSTOM_VOICES_DIR / f"{request.voice_id}.pt"
            preset_pt = PRESETS_DIR / f"{request.voice_id}.pt"

            if custom_pt.exists():
                try:
                    voice_clone_prompt = VoiceClonePrompt.load(str(custom_pt))
                    logger.info(f"⚡ Đã nạp cache VoiceClonePrompt từ: {custom_pt.name}")
                except Exception as e:
                    logger.warning(f"Không thể nạp prompt .pt: {e}")

            elif preset_pt.exists():
                try:
                    voice_clone_prompt = VoiceClonePrompt.load(str(preset_pt))
                    logger.info(f"⚡ Đã nạp cache VoiceClonePrompt preset từ: {preset_pt.name}")
                except Exception as e:
                    logger.warning(f"Không thể nạp prompt .pt preset: {e}")

            if voice_clone_prompt is None:
                import json
                voices_json = PRESETS_DIR / "voices.json"
                all_voices = []
                if voices_json.exists():
                    with open(voices_json, "r", encoding="utf-8") as f:
                        all_voices.extend(json.load(f))
                if CUSTOM_VOICES_JSON.exists():
                    with open(CUSTOM_VOICES_JSON, "r", encoding="utf-8") as f:
                        all_voices.extend(json.load(f))

                for v in all_voices:
                    if v["id"] == request.voice_id:
                        if request.voice_id.startswith("custom_"):
                            wav_candidate = CUSTOM_VOICES_DIR / f"{v['id']}.wav"
                        else:
                            wav_candidate = PRESETS_DIR / f"{v['id']}.wav"

                        if wav_candidate.exists():
                            ref_audio = str(wav_candidate)
                            ref_text = v.get("prompt_text")

                            try:
                                prompt_save_path = (
                                    CUSTOM_VOICES_DIR / f"{v['id']}.pt"
                                    if request.voice_id.startswith("custom_")
                                    else PRESETS_DIR / f"{v['id']}.pt"
                                )
                                voice_clone_prompt = await asyncio.to_thread(
                                    create_voice_prompt,
                                    ref_audio=ref_audio,
                                    ref_text=ref_text,
                                )
                                voice_clone_prompt.save(str(prompt_save_path))
                                logger.info(f"✨ Đã tự động tạo và lưu cache {prompt_save_path.name}")
                            except Exception as pe:
                                logger.warning(f"Không thể tạo trước cache prompt: {pe}")
                        break

    try:
        await asyncio.to_thread(
            generate_audio,
            text=request.text,
            output_path=output_path,
            mode=request.mode,
            voice_clone_prompt=voice_clone_prompt,
            ref_audio=ref_audio,
            ref_text=ref_text,
            instruct=request.instruct,
            cfg_value=request.cfg_value,
            num_step=steps,
            seed=request.seed,
            speed=request.speed,
            pitch=request.pitch,
            audio_format=request.format,
            enhance_audio=request.enhance_audio,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("❌ Lỗi khi tổng hợp giọng nói")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi tổng hợp: {str(exc)}",
        ) from exc

    background_tasks.add_task(cleanup_old_files)

    duration_val = None
    try:
        duration_val = round(AudioSegment.from_file(str(output_path)).duration_seconds, 2)
    except Exception:
        pass

    r2_url = upload_audio_to_r2(output_path, object_key=r2_key)
    export_file_to_custom_directory(output_path, sub_dir="audios")

    return TTSResponse(
        message="Tổng hợp thành công!",
        filename=filename,
        audio_url=r2_url or f"{url_prefix}/{filename}",
        duration=duration_val,
        session_id=session_id,
    )




async def delete_audio_session(session_id: str, background_tasks: BackgroundTasks | None = None):
    """
    Xóa trọn gói thư mục session trong outputs/audios/{session_id}/ và trên Cloudflare R2.
    """
    safe_session_id = os.path.basename(session_id.strip())
    if not safe_session_id:
        return {"message": "session_id không hợp lệ", "deleted": False}

    session_dir = AUDIOS_DIR / safe_session_id
    deleted_local = False
    if session_dir.exists() and session_dir.is_dir():
        try:
            shutil.rmtree(session_dir, ignore_errors=True)
            deleted_local = True
            logger.info(f"🗑️ [Session] Đã xóa trọn gói thư mục session cục bộ: {safe_session_id}")
        except Exception as e:
            logger.error(f"Lỗi khi xóa thư mục session {safe_session_id}: {e}")

    # Xóa trọn gói trên Cloudflare R2
    if background_tasks:
        background_tasks.add_task(delete_session_from_r2, safe_session_id)
        return {
            "message": f"Đã xóa session cục bộ và lên lịch dọn dẹp R2 cho session {safe_session_id}",
            "deleted": True,
            "session_id": safe_session_id,
        }
    else:
        deleted_r2_count = delete_session_from_r2(safe_session_id)
        if not deleted_local and deleted_r2_count == 0:
            return {"message": f"Session {safe_session_id} không tồn tại hoặc đã được xóa trước đó", "deleted": False}

        return {
            "message": f"Đã xóa trọn gói session {safe_session_id} ({deleted_r2_count} files R2)",
            "deleted": True,
            "session_id": safe_session_id,
        }


async def delete_single_audio(filename: str, background_tasks: BackgroundTasks | None = None):
    # Nếu filename chính là một session ID hoặc đường dẫn thư mục session
    clean_name = filename.strip().replace("\\", "/").rstrip("/")
    if clean_name.startswith("audios/") or (AUDIOS_DIR / os.path.basename(clean_name)).is_dir():
        sess_name = os.path.basename(clean_name)
        if (AUDIOS_DIR / sess_name).is_dir():
            return await delete_audio_session(sess_name, background_tasks=background_tasks)

    safe_filename = os.path.basename(filename)
    # Tìm kiếm cả ở root OUTPUTS_DIR lẫn các thư mục con trong AUDIOS_DIR
    file_path = OUTPUTS_DIR / safe_filename
    if not file_path.exists():
        # Kiểm tra xem có file nào trong AUDIOS_DIR trùng tên không
        for s_dir in AUDIOS_DIR.iterdir():
            if s_dir.is_dir() and (s_dir / safe_filename).exists():
                file_path = s_dir / safe_filename
                break

    deleted_local = False
    if file_path.exists() and file_path.is_file():
        try:
            file_path.unlink()
            deleted_local = True
            logger.info(f"🗑️ Đã xóa file theo yêu cầu: {safe_filename}")
        except Exception as e:
            logger.error(f"Lỗi khi xóa file {safe_filename}: {e}")
            raise HTTPException(status_code=500, detail=f"Không thể xóa file: {str(e)}")

    # Xóa kèm file phụ đề .srt nếu có
    base_name = os.path.splitext(safe_filename)[0]
    srt_candidate = file_path.parent / f"{base_name}.srt"
    if srt_candidate.exists() and srt_candidate.is_file():
        try:
            srt_candidate.unlink()
            logger.info(f"🗑️ Đã xóa kèm file phụ đề: {srt_candidate.name}")
        except Exception as e:
            logger.warning(f"Không thể xóa file SRT {srt_candidate.name}: {e}")

    # Xóa trên Cloudflare R2 bucket nếu có cấu hình
    if background_tasks:
        background_tasks.add_task(delete_audio_from_r2, safe_filename)
        return {"message": f"Đã xóa thành công file {safe_filename}", "deleted": True}
    else:
        deleted_r2 = delete_audio_from_r2(safe_filename)
        if not deleted_local and not deleted_r2:
            return {"message": "File không tồn tại hoặc đã được xóa trước đó", "deleted": False}
        return {"message": f"Đã xóa thành công file {safe_filename}", "deleted": True}


async def delete_multiple_audios(filenames: list[str], background_tasks: BackgroundTasks | None = None):
    """Xóa danh sách nhiều file âm thanh nhanh chóng cục bộ và xóa hàng loạt trên R2"""
    unique_filenames = list(dict.fromkeys([f for f in filenames if f]))
    deleted_count = 0
    r2_keys_to_delete = []

    for fn in unique_filenames:
        clean_name = fn.strip().replace("\\", "/").rstrip("/")
        safe_name = os.path.basename(clean_name)
        if not safe_name:
            continue
        r2_keys_to_delete.append(safe_name)

        # Xóa cục bộ
        file_path = OUTPUTS_DIR / safe_name
        if not file_path.exists():
            for s_dir in AUDIOS_DIR.iterdir():
                if s_dir.is_dir() and (s_dir / safe_name).exists():
                    file_path = s_dir / safe_name
                    break

        if file_path.exists() and file_path.is_file():
            try:
                file_path.unlink(missing_ok=True)
                deleted_count += 1
            except Exception as e:
                logger.warning(f"Không thể xóa file {safe_name}: {e}")

            # Xóa file phụ đề srt kèm theo
            srt_candidate = file_path.with_suffix(".srt")
            if srt_candidate.exists() and srt_candidate.is_file():
                try:
                    srt_candidate.unlink(missing_ok=True)
                except Exception:
                    pass

    # Xóa trên R2 bằng batch (hàng loạt trong 1 request)
    if r2_keys_to_delete:
        if background_tasks:
            background_tasks.add_task(delete_multiple_from_r2, r2_keys_to_delete)
        else:
            delete_multiple_from_r2(r2_keys_to_delete)

    return {
        "message": f"Đã xử lý xóa {len(unique_filenames)} file (xóa cục bộ & dọn dẹp R2 tức thì)",
        "deleted_count": len(unique_filenames),
        "total": len(unique_filenames),
    }


async def cleanup_orphan_files(request: CleanupOrphansRequest) -> CleanupOrphansResponse:
    now = time.time()
    active_set = {os.path.basename(f) for f in request.active_filenames if f}
    protected_files = {"demo_voice.wav", ".gitkeep"}

    deleted_count = 0
    freed_bytes = 0

    for p in OUTPUTS_DIR.iterdir():
        if not p.is_file() or p.name in protected_files:
            continue

        if not p.name.lower().endswith((".mp3", ".wav", ".srt", ".ass", ".vtt")):
            continue

        if p.name not in active_set:
            file_age_sec = now - p.stat().st_mtime
            min_age_sec = request.max_age_minutes * 60

            if request.force or file_age_sec >= min_age_sec:
                try:
                    f_size = p.stat().st_size
                    p.unlink(missing_ok=True)
                    deleted_count += 1
                    freed_bytes += f_size
                    logger.info(f"🗑️ Đã dọn dẹp file rác cục bộ: {p.name} ({f_size / 1024:.1f} KB)")
                except Exception as e:
                    logger.warning(f"Không thể xoá file {p.name}: {e}")

    # Dọn dẹp các thư mục video session cũ trong outputs/captions/ (chỉ giữ lại session mới nhất)
    try:
        if CAPTIONS_DIR.exists():
            cap_dirs = sorted(
                [d for d in CAPTIONS_DIR.iterdir() if d.is_dir()],
                key=lambda d: d.stat().st_mtime,
                reverse=True,
            )
            # Luôn giữ lại 1 session mới nhất (cap_dirs[0]), dọn các session cũ hơn
            for old_cap in cap_dirs[1:]:
                cap_age_sec = now - old_cap.stat().st_mtime
                if request.force or cap_age_sec >= 3600:
                    try:
                        dir_size = sum(f.stat().st_size for f in old_cap.rglob("*") if f.is_file())
                        shutil.rmtree(old_cap, ignore_errors=True)
                        deleted_count += 1
                        freed_bytes += dir_size
                        logger.info(
                            f"🗑️ [AutoCaption] Đã dọn dẹp video session cũ: {old_cap.name} "
                            f"({dir_size / (1024 * 1024):.2f} MB)"
                        )
                    except Exception as de:
                        logger.warning(f"Không thể xóa session cũ {old_cap.name}: {de}")
    except Exception as ce:
        logger.warning(f"Lỗi khi dọn dẹp video session trong captions: {ce}")

    # Dọn dẹp các thư mục audio session cũ không còn trong active_session_ids
    active_sessions = set(request.active_session_ids or [])
    try:
        if AUDIOS_DIR.exists():
            for s_dir in AUDIOS_DIR.iterdir():
                if not s_dir.is_dir():
                    continue
                if s_dir.name not in active_sessions:
                    dir_age_sec = now - s_dir.stat().st_mtime
                    min_age_sec = request.max_age_minutes * 60
                    if request.force or dir_age_sec >= min_age_sec:
                        try:
                            dir_size = sum(f.stat().st_size for f in s_dir.rglob("*") if f.is_file())
                            shutil.rmtree(s_dir, ignore_errors=True)
                            deleted_count += 1
                            freed_bytes += dir_size
                            logger.info(
                                f"🗑️ [AudioSession] Đã dọn dẹp thư mục session rác: {s_dir.name} "
                                f"({dir_size / 1024:.1f} KB)"
                            )
                            # Xóa trên R2 nếu có
                            delete_session_from_r2(s_dir.name)
                        except Exception as se:
                            logger.warning(f"Không thể xóa thư mục session {s_dir.name}: {se}")
    except Exception as ae:
        logger.warning(f"Lỗi khi dọn dẹp thư mục audios: {ae}")

    # Dọn dẹp các thư mục video translation, dubbing và alignment cũ
    try:
        translate_dir = OUTPUTS_DIR / "video_translate"
        dubbing_dir = OUTPUTS_DIR / "dubbing"
        alignment_dir = OUTPUTS_DIR / "alignment"

        for target_d in [translate_dir, dubbing_dir, alignment_dir]:
            if target_d.exists():
                for sub_item in target_d.iterdir():
                    if not sub_item.is_dir():
                        if sub_item.is_file():
                            try:
                                f_size = sub_item.stat().st_size
                                sub_item.unlink(missing_ok=True)
                                deleted_count += 1
                                freed_bytes += f_size
                            except Exception:
                                pass
                        continue
                    # Bỏ qua nếu là session đang mở
                    if sub_item.name in active_sessions:
                        continue
                    item_age = now - sub_item.stat().st_mtime
                    if request.force or item_age >= (request.max_age_minutes * 60):
                        try:
                            d_size = sum(f.stat().st_size for f in sub_item.rglob("*") if f.is_file())
                            shutil.rmtree(sub_item, ignore_errors=True)
                            deleted_count += 1
                            freed_bytes += d_size
                            logger.info(f"🗑️ [VideoTranslate/Dubbing] Đã dọn dẹp thư mục: {sub_item.name} ({d_size / (1024*1024):.2f} MB)")
                        except Exception as d_err:
                            logger.warning(f"Không thể xóa thư mục {sub_item.name}: {d_err}")
    except Exception as vte:
        logger.warning(f"Lỗi khi dọn dẹp video translate/dubbing: {vte}")

    # Dọn dẹp trên Cloudflare R2 bucket nếu có cấu hình
    try:
        r2_deleted, r2_bytes = await asyncio.to_thread(
            cleanup_orphan_r2_files,
            active_set,
            active_sessions,
            request.max_age_minutes,
            request.force,
        )
        deleted_count += r2_deleted
        freed_bytes += r2_bytes
    except Exception as re:
        logger.warning(f"Lỗi khi dọn dẹp file rác trên R2: {re}")

    freed_mb = round(freed_bytes / (1024 * 1024), 2)
    return CleanupOrphansResponse(
        message=f"Đã dọn dẹp {deleted_count} file rác, giải phóng {freed_mb} MB.",
        deleted_count=deleted_count,
        freed_bytes=freed_bytes,
        freed_mb=freed_mb,
    )



def _find_audio_file(filename: str, session_id: str | None = None) -> Path | None:
    """Tìm file audio an toàn: kiểm tra session_id, thư mục outputs, và quét đệ quy các thư mục session con."""
    safe_name = os.path.basename(filename)
    if not safe_name:
        return None

    # 1. Kiểm tra theo session_id truyền lên
    if session_id and session_id.strip():
        safe_sess = os.path.basename(session_id.strip())
        candidate = AUDIOS_DIR / safe_sess / safe_name
        if candidate.exists():
            return candidate

    # 2. Kiểm tra trực tiếp trong OUTPUTS_DIR và AUDIOS_DIR
    if (OUTPUTS_DIR / safe_name).exists():
        return OUTPUTS_DIR / safe_name
    if (AUDIOS_DIR / safe_name).exists():
        return AUDIOS_DIR / safe_name

    # 3. Tìm trong toàn bộ các session con của AUDIOS_DIR (ví dụ outputs/audios/*/<safe_name>)
    matches = list(AUDIOS_DIR.glob(f"*/{safe_name}"))
    if matches:
        return max(matches, key=os.path.getmtime)

    return None


def _sync_stitch_audio(
    blocks,
    audio_format: str,
    crossfade_ms: int = 15,
    loudness_standard: str = "ebu_r128",
    project_name: str | None = None,
    session_id: str | None = None,
) -> tuple[str, str | None, str | None, float, list[dict], str, str, Path]:
    """Hàm đồng bộ xử lý ghép nối audio, khử pop/click bằng micro-fade/crossfade, chuẩn hóa âm lượng EBU R128 và xuất file SRT trên worker thread."""
    combined = AudioSegment.empty()
    srt_entries: list[str] = []
    segments: list[dict] = []
    current_time_sec = 0.0

    target_dir = OUTPUTS_DIR
    url_prefix = "http://localhost:8000/outputs"
    r2_prefix = "outputs/"
    if session_id and session_id.strip():
        safe_sess = os.path.basename(session_id.strip())
        target_dir = AUDIOS_DIR / safe_sess
        target_dir.mkdir(parents=True, exist_ok=True)
        url_prefix = f"http://localhost:8000/outputs/audios/{safe_sess}"
        r2_prefix = f"outputs/audios/{safe_sess}/"
    elif blocks:
        # Tự động suy luận thư mục session từ block đầu tiên tìm thấy nếu session_id rỗng
        first_file = _find_audio_file(blocks[0].filename)
        if first_file and first_file.parent.parent == AUDIOS_DIR:
            safe_sess = first_file.parent.name
            target_dir = first_file.parent
            url_prefix = f"http://localhost:8000/outputs/audios/{safe_sess}"
            r2_prefix = f"outputs/audios/{safe_sess}/"

    for idx, block in enumerate(blocks):
        safe_name = os.path.basename(block.filename)
        file_p = _find_audio_file(block.filename, session_id) or (target_dir / safe_name)
        if not file_p.exists():
            file_p = OUTPUTS_DIR / safe_name

        segment_audio = AudioSegment.from_file(str(file_p))
        duration_sec = len(segment_audio) / 1000.0

        # 1. Khử DC Offset & Zero-Crossing Impulse bằng micro fade-in/fade-out (10-20ms)
        edge_fade_ms = max(0, min(crossfade_ms, int(len(segment_audio) * 0.15)))
        if edge_fade_ms > 0:
            segment_audio = segment_audio.fade_in(edge_fade_ms).fade_out(edge_fade_ms)

        # 2. Ghép nối vào luồng chính (Crossfade hoặc Silent Gap)
        if len(combined) > 0 and block.pause_after <= 0 and crossfade_ms > 0:
            fade_overlap = min(crossfade_ms, len(combined), len(segment_audio))
            combined = combined.append(segment_audio, crossfade=fade_overlap)
            start_sec = max(0.0, current_time_sec - (fade_overlap / 1000.0))
            end_sec = start_sec + duration_sec
            current_time_sec = end_sec
        else:
            start_sec = current_time_sec
            end_sec = current_time_sec + duration_sec
            combined += segment_audio
            current_time_sec = end_sec

            if block.pause_after > 0:
                pause_ms = int(block.pause_after * 1000)
                combined += AudioSegment.silent(duration=pause_ms)
                current_time_sec += block.pause_after

        segments.append({
            "index": idx,
            "filename": safe_name,
            "start": round(start_sec, 2),
            "end": round(end_sec, 2),
            "duration": round(duration_sec, 2),
        })

        clean_text = block.text.strip()
        if clean_text:
            start_str = format_srt_time(start_sec)
            end_str = format_srt_time(end_sec)
            srt_entries.append(f"{len(srt_entries) + 1}\n{start_str} --> {end_str}\n{clean_text}\n")

    proj_slug = ""
    if project_name and project_name.strip():
        proj_slug = slugify_vietnamese(project_name, max_chars=28)
    if not proj_slug and blocks and getattr(blocks[0], "text", None):
        proj_slug = slugify_vietnamese(blocks[0].text, max_chars=20)
    if not proj_slug:
        proj_slug = "audio"

    now_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    short_id = uuid.uuid4().hex[:6]
    out_ext = ".mp3" if audio_format.lower() == "mp3" else ".wav"
    export_format = "mp3" if audio_format.lower() == "mp3" else "wav"
    out_filename = f"master_{proj_slug}_{now_str}_{short_id}{out_ext}"
    out_path = target_dir / out_filename

    combined = combined.set_frame_rate(44100)

    # 3. Chuẩn hóa âm lượng phát thanh quốc tế ITU-R BS.1770-4 / EBU R128 (-16 LUFS Podcast / -14 LUFS Web)
    norm_applied = False
    if loudness_standard in ("ebu_r128", "youtube"):
        target_i = -16.0 if loudness_standard == "ebu_r128" else -14.0
        temp_raw_path = target_dir / f"temp_raw_{short_id}.wav"
        try:
            combined.export(str(temp_raw_path), format="wav")
            norm_applied = apply_ebur128_loudnorm(
                input_path=str(temp_raw_path),
                output_path=str(out_path),
                target_i=target_i,
                target_tp=-1.5,
                sample_rate=44100,
                export_format=export_format,
                bitrate="320k",
            )
        except Exception as e:
            logger.warning(f"⚠️ Lỗi khi áp dụng EBU R128 loudnorm ({e}), dùng fallback Peak Normalization")
        finally:
            temp_raw_path.unlink(missing_ok=True)

    if not norm_applied:
        # Fallback Peak Normalization (-1.0 dBFS)
        combined = pydub_normalize(combined, headroom=1.0)
        combined.export(
            str(out_path),
            format=export_format,
            bitrate="320k" if export_format == "mp3" else None,
        )
        logger.info(f"🎉 Ghép nối master audio thành công (Peak Normalization -1.0 dBFS, 44.1kHz 320k): {out_filename} (Thời lượng: {combined.duration_seconds:.2f}s)")
    else:
        logger.info(f"🎉 Ghép nối master audio thành công (Chuẩn phát thanh EBU R128 {loudness_standard}, 44.1kHz 320k): {out_filename} (Thời lượng: {combined.duration_seconds:.2f}s)")

    srt_filename = None
    srt_url = None
    if srt_entries:
        srt_filename = f"master_{proj_slug}_{now_str}_{short_id}.srt"
        srt_path = target_dir / srt_filename
        with open(srt_path, "w", encoding="utf-8") as sf:
            sf.write("\n".join(srt_entries))
        srt_url = f"{url_prefix}/{srt_filename}"
        logger.info(f"📝 Đã tạo file phụ đề SRT đồng bộ: {srt_filename}")

    return out_filename, srt_filename, srt_url, round(combined.duration_seconds, 2), segments, r2_prefix, url_prefix, target_dir


async def stitch_audio_blocks(request: StitchRequest, background_tasks: BackgroundTasks) -> StitchResponse:
    if not request.blocks:
        raise HTTPException(status_code=400, detail="Danh sách phân đoạn rỗng")

    for idx, block in enumerate(request.blocks):
        safe_name = os.path.basename(block.filename)
        found_path = _find_audio_file(block.filename, request.session_id)
        if not found_path:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy file audio ở phân đoạn {idx + 1}: {safe_name}",
            )

    try:
        out_filename, srt_filename, srt_url, total_dur, segments, r2_prefix, url_prefix, target_dir = await asyncio.to_thread(
            _sync_stitch_audio,
            request.blocks,
            request.format,
            request.crossfade_ms,
            request.loudness_standard,
            request.project_name,
            request.session_id,
        )
    except Exception as e:
        logger.error(f"Lỗi xuất file master audio: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi xuất audio: {str(e)}")

    background_tasks.add_task(cleanup_old_files)

    r2_url = upload_audio_to_r2(target_dir / out_filename, object_key=f"{r2_prefix}{out_filename}")
    r2_srt_url = None
    if srt_filename:
        r2_srt_url = upload_audio_to_r2(
            target_dir / srt_filename,
            object_key=f"{r2_prefix}{srt_filename}",
            content_type="text/plain; charset=utf-8",
        )

    export_file_to_custom_directory(target_dir / out_filename, sub_dir="audios")

    return StitchResponse(
        message="Ghép nối phân đoạn thành công!",
        filename=out_filename,
        audio_url=r2_url or f"{url_prefix}/{out_filename}",
        srt_filename=srt_filename,
        srt_url=r2_srt_url or srt_url,
        total_duration=total_dur,
        segments=[StitchSegmentItem(**s) for s in segments],
    )

