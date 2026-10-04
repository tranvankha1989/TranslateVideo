"""
app/services/video_translation_pipeline.py
──────────────────────────────────────────
Pipeline điều phối dịch và lồng tiếng video tự động khép kín (End-to-End):
  1. Tách audio WAV & trích xuất nhạc nền BGM (FFmpeg).
  2. Bóc tách phụ đề gốc (Faster-Whisper STT).
  3. Dịch phụ đề sang ngôn ngữ đích (TranslationService).
  4. Lồng tiếng tự động cho từng câu thoại (DubbingService - Edge-TTS / OmniVoice).
  5. Cân chỉnh tốc độ câu nói và ráp dải âm thanh khớp timeline (AlignmentService).
  6. Xuất phụ đề (Đơn ngữ / Song ngữ) và dùng FFmpeg render Video MP4 thành phẩm.
"""

import os
import re
import time
import json
import uuid
import asyncio
import subprocess
import shutil
from pathlib import Path
from typing import Any

from app.core.config import OUTPUTS_DIR, logger, log_verbose_step, is_verbose_logging
from app.services.dubbing_service import DubbingService, get_audio_duration, DUBBING_OUTPUT_DIR
from app.services.translator_service import TranslationService, GoogleTranslator
from app.services.alignment_service import AlignmentService
from app.services.ad_filter_service import AdFilterService
import model_handler
from caption_handler import (
    extract_audio,
    get_whisper_model,
    transcribe_with_remote_or_local,
    sanitize_word_timestamps,
    separate_vocals_demucs,
    heal_and_merge_segments,
    resegment_words,
)

TRANSLATE_OUTPUT_DIR = OUTPUTS_DIR / "video_translate"
TRANSLATE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Bộ nhớ lưu trạng thái tiến trình các tác vụ dịch video
_TASK_STORE: dict[str, dict[str, Any]] = {}


def is_cloud_gpu_active() -> bool:
    try:
        import model_handler
        return model_handler.is_remote_gpu_enabled()
    except Exception:
        pass
    import os
    return os.getenv("USE_REMOTE_GPU", "").lower() in ("true", "1", "yes")


def format_duration_vietnamese(total_seconds: float) -> str:
    """Định dạng thời gian tính bằng giây thành chuỗi tiếng Việt dễ đọc (vd: 2 phút 15 giây)."""
    sec = int(round(total_seconds))
    mins = sec // 60
    rem_sec = sec % 60
    if mins > 0:
        return f"{mins} phút {rem_sec:02d} giây" if rem_sec > 0 else f"{mins} phút"
    return f"{rem_sec} giây"


def format_srt_time(seconds: float) -> str:
    """Chuyển đổi số giây thành định dạng thời gian chuẩn SRT: HH:MM:SS,mmm"""
    total_ms = int(round(max(0.0, float(seconds)) * 1000))
    hours = total_ms // 3600000
    minutes = (total_ms % 3600000) // 60000
    secs = (total_ms % 60000) // 1000
    millis = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def generate_srt_file(segments: list[dict[str, Any]], output_srt_path: Path, mode: str = "hard_target") -> Path:
    """Tạo file phụ đề SRT (hỗ trợ đơn ngữ hoặc song ngữ), tự động bỏ qua các phân đoạn rác rỗng."""
    output_srt_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    seg_idx = 1

    for seg in segments:
        start_str = format_srt_time(float(seg.get("start", 0.0)))
        end_str = format_srt_time(float(seg.get("end", 0.0)))
        text_target = seg.get("text", "").strip()
        text_orig = seg.get("original_text", "").strip()

        if mode == "hard_dual" and text_orig:
            display_text = f"{text_target}\n{text_orig}".strip()
        else:
            display_text = text_target

        if not display_text:
            continue

        lines.append(f"{seg_idx}")
        lines.append(f"{start_str} --> {end_str}")
        lines.append(display_text)
        lines.append("")
        seg_idx += 1

    content = "\n".join(lines)
    output_srt_path.write_text(content, encoding="utf-8-sig")
    return output_srt_path

def get_ffmpeg_scale_filter(resolution: str | None) -> str | None:
    """Trả về bộ lọc scale FFmpeg theo độ phân giải mong muốn."""
    res = (resolution or "720p").lower().strip()
    if res in ["720p", "720"]:
        return "scale=-2:720"
    elif res in ["1080p", "1080"]:
        return "scale=-2:1080"
    elif res in ["480p", "480"]:
        return "scale=-2:480"
    return None  # Giữ nguyên độ phân giải gốc



def cleanup_task_temp_files(task_dir: Path | str) -> None:
    """
    Chỉ xóa các file nháp dung lượng lớn, giữ nguyên tài nguyên để người dùng sửa từng câu.

    - XÓA các file trung gian nặng:
      + `raw_audio.wav`, `vocals.wav`, `no_vocals.wav` (file tách âm gốc rất nặng)
      + `voice_timeline_raw.wav`, `input_trimmed.mp4`
      + Các file nén upload tạm: `compressed_*.opus`, `compressed_*.mp3`, `vocals_compressed.*`
      + Thư mục tạm `alignment/chunks` và `task_dir/chunks`
    - TUYỆT ĐỐI GIỮ LẠI:
      + Thư mục `dubbing/` (chứa các file seg_xxxx.mp3 phục vụ nghe thử và chỉnh sửa từng câu lẻ)
      + File âm thanh tổng hợp: `final_audio.wav` (để ráp lại nhanh khi sửa câu)
      + File video hoàn thiện: `final_translated.mp4`
      + Toàn bộ file phụ đề: `subtitles.srt`, `subtitles_original.srt`, `subtitles_ai_initial.srt`
      + Metadata: `task_meta.json`
      + Video gốc tải lên: `input_*.mp4`
    """
    if not task_dir:
        return

    task_path = Path(task_dir)
    if not task_path.exists():
        return

    task_id = task_path.name
    logger.info(f"🧹 [Cleanup] Bắt đầu dọn dẹp file nháp tạm thời cho task: {task_id}")

    # 1. Danh sách các file nháp trung gian cần xóa trực tiếp trong thư mục task
    # TUYỆT ĐỐI BẢO VỆ: input_trimmed.mp4 (video cắt), no_vocals.wav (nhạc nền), raw_audio.wav (audio chuẩn)
    files_to_remove = [
        "vocals.wav",
        "voice_timeline_raw.wav",
        "chunks_list.txt",
    ]

    total_freed_bytes = 0

    for fname in files_to_remove:
        fpath = task_path / fname
        if fpath.exists() and fpath.is_file():
            try:
                sz = fpath.stat().st_size
                fpath.unlink()
                total_freed_bytes += sz
                logger.debug(f"  - Đã xóa file nháp: {fpath.name} ({sz / (1024 * 1024):.1f} MB)")
            except Exception as e:
                logger.warning(f"  ! Không thể xóa {fpath.name}: {e}")

    # 2. Xóa các file nén tạm (compressed_*.opus, compressed_*.mp3, vocals_compressed.*)
    for pattern in ["compressed_*.opus", "compressed_*.mp3", "compressed_*.*", "vocals_compressed.*", "*_compressed.*"]:
        for fpath in task_path.glob(pattern):
            if fpath.exists() and fpath.is_file() and not fpath.name.startswith("final_"):
                try:
                    sz = fpath.stat().st_size
                    fpath.unlink()
                    total_freed_bytes += sz
                    logger.debug(f"  - Đã xóa file nén tạm: {fpath.name} ({sz / (1024 * 1024):.1f} MB)")
                except Exception as e:
                    logger.warning(f"  ! Không thể xóa {fpath.name}: {e}")

    # 3. Dọn dẹp trong thư mục alignment tương ứng (OUTPUTS_DIR / 'alignment' / task_id)
    alignment_dir = OUTPUTS_DIR / "alignment" / task_id
    if alignment_dir.exists():
        for afname in ["voice_timeline_raw.wav", "chunks_list.txt"]:
            afpath = alignment_dir / afname
            if afpath.exists() and afpath.is_file():
                try:
                    sz = afpath.stat().st_size
                    afpath.unlink()
                    total_freed_bytes += sz
                except Exception as e:
                    logger.warning(f"  ! Không thể xóa {afpath.name}: {e}")

        # Xóa thư mục tạm alignment/chunks
        chunks_dir = alignment_dir / "chunks"
        if chunks_dir.exists() and chunks_dir.is_dir():
            try:
                shutil.rmtree(chunks_dir, ignore_errors=True)
                logger.debug(f"  - Đã xóa thư mục chunks trong: {alignment_dir.name}")
            except Exception as e:
                logger.warning(f"  ! Không thể xóa thư mục chunks: {e}")

    # 4. Dọn dẹp thư mục chunks trong task_path nếu có
    task_chunks = task_path / "chunks"
    if task_chunks.exists() and task_chunks.is_dir():
        try:
            shutil.rmtree(task_chunks, ignore_errors=True)
        except Exception:
            pass

    freed_mb = total_freed_bytes / (1024 * 1024)
    logger.info(f"✨ [Cleanup] Hoàn tất dọn dẹp task {task_id}, giải phóng {freed_mb:.1f} MB đĩa cứng.")


class VideoTranslationPipeline:
    """Bộ điều phối toàn bộ quy trình dịch và lồng tiếng video."""

    @classmethod
    def get_task(cls, task_id: str) -> dict[str, Any] | None:
        task = _TASK_STORE.get(task_id)
        if not task:
            meta_file = TRANSLATE_OUTPUT_DIR / task_id / "task_meta.json"
            if meta_file.exists():
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        task = json.load(f)
                        _TASK_STORE[task_id] = task
                except Exception:
                    pass
        return task

    @classmethod
    def list_all_tasks(cls) -> list[dict[str, Any]]:
        """Quét toàn bộ thư mục outputs/video_translate và _TASK_STORE để trả về danh sách dự án dịch video."""
        projects = []
        seen_task_ids = set()

        if TRANSLATE_OUTPUT_DIR.exists():
            for folder in TRANSLATE_OUTPUT_DIR.iterdir():
                if not folder.is_dir():
                    continue
                task_id = folder.name
                seen_task_ids.add(task_id)
                meta_file = folder / "task_meta.json"
                meta = {}
                if meta_file.exists():
                    try:
                        with open(meta_file, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                    except Exception:
                        pass

                # Merge with in-memory task store if available
                mem_task = _TASK_STORE.get(task_id, {})
                for k, v in mem_task.items():
                    if k not in meta or meta[k] is None:
                        meta[k] = v

                final_video = folder / "final_translated.mp4"
                srt_target = folder / "subtitles.srt"
                srt_orig = folder / "subtitles_original.srt"

                created_at = meta.get("created_at") or meta.get("_start_time") or folder.stat().st_mtime

                file_size_mb = 0.0
                if final_video.exists():
                    file_size_mb = round(final_video.stat().st_size / (1024 * 1024), 2)

                video_path_str = meta.get("video_path", "")
                video_name = Path(video_path_str).name if video_path_str else f"Video_{task_id[:8]}"

                status = meta.get("status", "completed" if final_video.exists() else "processing")
                has_video = final_video.exists()
                has_srt = srt_target.exists()
                has_srt_orig = srt_orig.exists()

                projects.append({
                    "task_id": task_id,
                    "video_name": video_name,
                    "video_filename": video_name,
                    "source_lang": meta.get("source_lang", meta.get("detected_source_lang", "auto")),
                    "target_lang": meta.get("target_lang", "vi"),
                    "voice_id": meta.get("voice_id", "vi-VN-HoaiMyNeural"),
                    "engine": meta.get("engine", "edge-tts"),
                    "translation_engine": meta.get("engine", "edge-tts"),
                    "status": status,
                    "progress": meta.get("progress", 100 if has_video else 0),
                    "created_at": float(created_at),
                    "duration": float(meta.get("video_duration", 0.0)),
                    "video_duration": float(meta.get("video_duration", 0.0)),
                    "elapsed_str": meta.get("elapsed_str"),
                    "output_resolution": meta.get("output_resolution", "720p"),
                    "has_video": has_video,
                    "has_srt": has_srt,
                    "has_srt_original": has_srt_orig,
                    "video_url": f"/api/video-translate/stream/{task_id}" if has_video else None,
                    "srt_url": f"/outputs/video_translate/{task_id}/{srt_target.name}" if has_srt else None,
                    "srt_original_url": f"/outputs/video_translate/{task_id}/{srt_orig.name}" if has_srt_orig else None,
                    "subtitles_srt_url": f"/outputs/video_translate/{task_id}/{srt_target.name}" if has_srt else None,
                    "subtitles_original_srt_url": f"/outputs/video_translate/{task_id}/{srt_orig.name}" if has_srt_orig else None,
                    "file_size_mb": file_size_mb,
                    "video_size_mb": file_size_mb,
                })

        # Thêm các tác vụ trong memory chưa tạo xong thư mục
        for task_id, mem_task in _TASK_STORE.items():
            if task_id not in seen_task_ids:
                projects.append({
                    "task_id": task_id,
                    "video_name": mem_task.get("video_filename", f"Video_{task_id[:8]}"),
                    "video_filename": mem_task.get("video_filename", f"Video_{task_id[:8]}"),
                    "source_lang": mem_task.get("source_lang", "auto"),
                    "target_lang": mem_task.get("target_lang", "vi"),
                    "voice_id": mem_task.get("voice_id", "vi-VN-HoaiMyNeural"),
                    "engine": mem_task.get("engine", "edge-tts"),
                    "translation_engine": mem_task.get("engine", "edge-tts"),
                    "status": mem_task.get("status", "processing"),
                    "progress": mem_task.get("progress", 0),
                    "created_at": float(mem_task.get("created_at", time.time())),
                    "duration": 0.0,
                    "video_duration": 0.0,
                    "has_video": False,
                    "has_srt": False,
                    "has_srt_original": False,
                    "file_size_mb": 0.0,
                    "video_size_mb": 0.0,
                })

        projects.sort(key=lambda x: x["created_at"], reverse=True)
        return projects

    @classmethod
    def delete_task(cls, task_id: str) -> bool:
        """Xóa toàn bộ thư mục tác vụ và giải phóng bộ nhớ ổ cứng."""
        _TASK_STORE.pop(task_id, None)
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if task_dir.exists():
            import shutil
            shutil.rmtree(task_dir, ignore_errors=True)
            return True
        return False

    @classmethod
    def update_task(cls, task_id: str, **kwargs) -> None:
        kwargs.pop("task_id", None)
        if task_id not in _TASK_STORE:
            _TASK_STORE[task_id] = {"task_id": task_id}
        _TASK_STORE[task_id].update(kwargs)

        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if task_dir.exists():
            try:
                meta_file = task_dir / "task_meta.json"
                with open(meta_file, "w", encoding="utf-8") as f:
                    json.dump(_TASK_STORE[task_id], f, ensure_ascii=False, indent=2, default=str)
            except Exception as e:
                logger.warning(f"Không thể lưu task_meta.json: {e}")

    @classmethod
    async def run_pipeline(
        cls,
        task_id: str,
        video_path: Path,
        source_lang: str = "en",
        target_lang: str = "vi",
        voice_id: str = "vi-VN-HoaiMyNeural",
        engine: str = "edge-tts",
        voice_rate: str = "+0%",
        voice_pitch: str = "+0Hz",
        voice_volume: float = 1.0,
        preserve_bgm: bool = True,
        bgm_type: str = "bgm",
        bgm_volume: float = 0.30,
        subtitle_mode: str = "hard_target",
        max_speed_rate: float = 1.35,
        translation_provider: str = "google",
        translation_api_key: str | None = None,
        translation_style: str = "auto",
        translation_model: str = "gemini-3.5-flash-lite",
        translation_temperature: float = 0.2,
        whisper_model: str = "large-v3",
        output_resolution: str = "720p",
        clip_start: float = 0.0,
        clip_end: float | None = None,
        vad_threshold: float = 0.15,
        speech_pad_ms: int = 400,
        min_speech_duration_ms: int = 150,
        min_silence_duration_ms: int = 1000,
        beam_size: int = 5,
        font_size: int = 20,
        margin_v: int = 30,
        alignment: int = 2,
    ) -> None:
        start_time = time.time()
        try:
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)

            # Cắt đoạn video nếu người dùng chỉ định thời gian bắt đầu / kết thúc
            if (clip_start and clip_start > 0.0) or (clip_end and clip_end > 0.0):
                trimmed_video = task_dir / "input_trimmed.mp4"
                trim_cmd = ["ffmpeg", "-y"]
                if clip_start and clip_start > 0.0:
                    trim_cmd.extend(["-ss", str(clip_start)])
                trim_cmd.extend(["-i", str(video_path)])
                if clip_end and clip_end > 0.0:
                    dur = clip_end - (clip_start or 0.0)
                    if dur > 0:
                        trim_cmd.extend(["-t", str(dur)])
                trim_cmd.extend([
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-crf", "18",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    str(trimmed_video),
                ])
                logger.info(f"✂️ [Video Trim] Đang cắt video từ {clip_start}s đến {clip_end}s: {' '.join(trim_cmd)}")
                try:
                    await asyncio.to_thread(subprocess.run, trim_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    if trimmed_video.exists() and trimmed_video.stat().st_size > 0:
                        video_path = trimmed_video
                except Exception as e:
                    logger.warning(f"Lỗi khi cắt video clip ({e}), tiếp tục với video gốc.")

            task_config = {
                "video_path": str(video_path),
                "source_lang": source_lang,
                "target_lang": target_lang,
                "voice_id": voice_id,
                "engine": engine,
                "voice_rate": voice_rate,
                "voice_pitch": voice_pitch,
                "voice_volume": voice_volume,
                "preserve_bgm": preserve_bgm,
                "bgm_type": bgm_type,
                "bgm_volume": bgm_volume,
                "subtitle_mode": subtitle_mode,
                "max_speed_rate": max_speed_rate,
                "translation_provider": translation_provider,
                "translation_style": translation_style,
                "translation_model": translation_model,
                "translation_temperature": translation_temperature,
                "whisper_model": whisper_model,
                "output_resolution": output_resolution,
                "start_time": clip_start,
                "end_time": clip_end,
                "_start_time": start_time,
                "created_at": start_time,
            }
            cls.update_task(task_id, **task_config)
            log_verbose_step("PIPELINE_INIT", f"Khởi tạo tác vụ dịch video [{task_id}]", task_config)

            # ── BƯỚC 1: TÁCH ÂM THANH & NHẠC NỀN (0% -> 15%) ──────────────
            cls.update_task(
                task_id,
                status="processing",
                progress=5,
                current_step="extracting",
                message="Khởi tạo không gian xử lý và kiểm tra dữ liệu video...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            # Trích xuất âm thanh không khóa luồng async (Single-pass ultra-fast extraction)
            def do_extract_and_prepare_audio():
                raw_audio = task_dir / "raw_audio.wav"
                bgm = None

                extract_audio(video_path, raw_audio)
                dur = get_audio_duration(raw_audio)

                # Tách giọng nói sạch (Vocals) và Nhạc nền (BGM) bằng Demucs AI / FFmpeg filter
                vocal_res = separate_vocals_demucs(raw_audio, task_dir, enable_demucs=True)
                whisper_audio = vocal_res.get("vocals", raw_audio)
                bgm = vocal_res.get("bgm", raw_audio) if preserve_bgm else None

                return raw_audio, whisper_audio, bgm, dur

            cls.update_task(
                task_id,
                progress=10,
                current_step="extracting",
                message="Đang trích xuất luồng âm thanh và phân tích tách giọng nói sạch (Demucs AI / FFmpeg)...",
            )

            raw_audio_path, whisper_audio_path, bgm_path, video_duration = await asyncio.to_thread(do_extract_and_prepare_audio)
            cls.update_task(
                task_id,
                video_duration=video_duration,
                raw_audio_path=str(raw_audio_path) if raw_audio_path else None,
                bgm_path=str(bgm_path) if bgm_path else None,
            )
            log_verbose_step("STEP_1_AUDIO_EXTRACT", f"Trích xuất âm thanh & tách giọng Demucs thành công", {
                "duration_seconds": round(video_duration, 2),
                "raw_audio": str(raw_audio_path),
                "whisper_audio": str(whisper_audio_path),
                "bgm_path": str(bgm_path) if bgm_path else None,
                "preserve_bgm": preserve_bgm,
            })

            # ── BƯỚC 2: BÓC BĂNG PHỤ ĐỀ GỐC BẰNG WHISPER (15% -> 40%) ──────
            whisper_tag = "trên Cloud GPU" if is_cloud_gpu_active() else f"Faster-Whisper ({whisper_model.upper()})"
            cls.update_task(
                task_id,
                progress=18,
                current_step="transcribing",
                message=f"Đã trích xuất dải âm thanh ({round(video_duration, 1)}s). Đang bóc tách thoại gốc {whisper_tag}...",
            )

            lang_arg = None if source_lang == "auto" else source_lang.split("-")[0]
            prompt_to_use = None
            if (source_lang and source_lang.startswith("zh")) or lang_arg == "zh":
                prompt_to_use = "以下是普通话的句子，请用简体中文输出。"

            # Nếu dùng Cloud GPU, truyền raw_audio_path để Demucs trên worker bóc tách cả Vocals và BGM
            audio_for_stt = raw_audio_path if is_cloud_gpu_active() else whisper_audio_path

            def run_whisper():
                logger.info(
                    f"🎙️ [Whisper STT] Bắt đầu bóc băng video gốc '{video_path.name}' bằng mô hình '{whisper_model.upper()}' (Audio: {audio_for_stt.name}, Lang: {lang_arg or 'auto'}, VAD Thresh: {vad_threshold})"
                )
                return transcribe_with_remote_or_local(
                    audio_path=audio_for_stt,
                    language=source_lang,
                    model_size=whisper_model,
                    initial_prompt=prompt_to_use,
                    vad_filter=True,
                    vad_threshold=vad_threshold,
                    min_speech_duration_ms=min_speech_duration_ms,
                    min_silence_duration_ms=min_silence_duration_ms,
                    speech_pad_ms=speech_pad_ms,
                    beam_size=beam_size,
                    word_timestamps=True,
                    task_dir=task_dir,
                )

            log_verbose_step("STEP_2_WHISPER_START", f"Bắt đầu bóc tách phụ đề Faster-Whisper", {
                "whisper_model": whisper_model,
                "audio_input": str(audio_for_stt),
                "source_lang": source_lang,
                "vad_threshold": vad_threshold,
                "min_speech_duration_ms": min_speech_duration_ms,
                "min_silence_duration_ms": min_silence_duration_ms,
                "speech_pad_ms": speech_pad_ms,
                "beam_size": beam_size,
                "is_cloud_gpu": is_cloud_gpu_active(),
            })

            cls.update_task(
                task_id,
                progress=22,
                current_step="transcribing",
                message="Faster-Whisper AI đang lắng nghe và bóc tách từng mốc thời gian câu thoại...",
            )

            whisper_res = await asyncio.to_thread(run_whisper)
            if isinstance(whisper_res, (list, tuple)) and len(whisper_res) == 3:
                segments_raw, detected_lang, remote_bgm_path = whisper_res
            elif isinstance(whisper_res, (list, tuple)) and len(whisper_res) == 2:
                segments_raw, detected_lang = whisper_res
                remote_bgm_path = None
            else:
                segments_raw, detected_lang = whisper_res, (source_lang if source_lang != "auto" else "vi")
                remote_bgm_path = None

            detected_source_lang = source_lang if source_lang != "auto" else detected_lang
            log_verbose_step("STEP_2_WHISPER_DONE", f"Hoàn tất bóc tách Whisper STT", {
                "raw_segments_count": len(segments_raw),
                "detected_source_lang": detected_source_lang,
                "remote_bgm_received": bool(remote_bgm_path),
            })

            # Lưu bgm_path vào biến của task: nếu có file no_vocals.wav thì gán làm nhạc nền chính
            if remote_bgm_path and Path(remote_bgm_path).exists():
                bgm_path = Path(remote_bgm_path)
                cls.update_task(task_id, bgm_path=str(bgm_path))
                logger.info(f"🎶 [BGM Sync] Đã nhận file nhạc nền từ Demucs: {bgm_path.name}")
            elif bgm_path and Path(bgm_path).exists():
                cls.update_task(task_id, bgm_path=str(bgm_path))
                logger.info(f"🎶 [BGM Sync] Sử dụng file nhạc nền cục bộ: {Path(bgm_path).name}")
            else:
                # Nếu không có (bgm_path is None), fallback dùng audio gốc đã hạ âm lượng hoặc để None
                fallback_bgm = str(raw_audio_path) if (preserve_bgm and raw_audio_path and Path(raw_audio_path).exists()) else None
                bgm_path = Path(fallback_bgm) if fallback_bgm else None
                cls.update_task(task_id, bgm_path=fallback_bgm)
                if fallback_bgm:
                    logger.info("🎶 [BGM Sync] Fallback dùng audio gốc đã hạ âm lượng làm nhạc nền.")

            original_segments = []
            all_words_flat = []
            for s in segments_raw:
                w_list = s.get("words", []) if isinstance(s, dict) else getattr(s, "words", None)
                if w_list and isinstance(w_list, list):
                    for w in w_list:
                        if isinstance(w, dict):
                            all_words_flat.append(w)
                        else:
                            all_words_flat.append({
                                "word": str(getattr(w, "word", "")),
                                "start": float(getattr(w, "start", 0.0)),
                                "end": float(getattr(w, "end", 0.0)),
                                "probability": float(getattr(w, "probability", 1.0)),
                            })

            # 1. Nếu có word_timestamps, ưu tiên resegment_words để chia nhỏ câu 3.0s - 6.0s (5-9 từ)
            if all_words_flat:
                original_segments = resegment_words(
                    all_words_flat,
                    max_words=8,
                    min_duration=3.0,
                    max_duration=6.0,
                    min_words=5,
                    min_silence_split=0.40,
                )
                logger.info(f"✂️ [Pipeline Resegment] Đã chia nhỏ thành {len(original_segments)} câu chuẩn nhịp nói diễn viên (3-6s).")
            else:
                for s in segments_raw:
                    if isinstance(s, dict):
                        txt = str(s.get("text", "")).strip()
                        raw_start = float(s.get("start", 0.0))
                        raw_end = float(s.get("end", 0.0))
                    else:
                        txt = str(getattr(s, "text", "")).strip()
                        raw_start = float(getattr(s, "start", 0.0))
                        raw_end = float(getattr(s, "end", 0.0))

                    if not txt:
                        continue
                    if raw_end <= raw_start:
                        raw_end = round(raw_start + 0.3, 3)

                    original_segments.append({
                        "id": len(original_segments) + 1,
                        "start": round(raw_start, 3),
                        "end": round(raw_end, 3),
                        "text": txt,
                    })

            # Lọc sạch quảng cáo, watermark và các câu tùy chỉnh do người dùng dạy cho AI bỏ qua
            original_segments, removed_ad_cnt = AdFilterService.filter_subtitle_segments(original_segments)
            if removed_ad_cnt > 0:
                logger.info(f"🛡️ [Pipeline] Đã loại bỏ {removed_ad_cnt} câu quảng cáo/rác/câu bỏ qua khỏi phụ đề gốc.")

            # Tự động phát hiện và nối câu ngắt quãng với giới hạn tối đa 6.0s và khoảng lặng < 0.40s
            original_segments = heal_and_merge_segments(original_segments, max_gap=0.40, max_duration=6.0)

            if not original_segments:
                raise RuntimeError("Không phát hiện được câu thoại nào rõ ràng trong video.")

            # Xuất ngay file phụ đề câu gốc
            srt_orig_file = task_dir / "subtitles_original.srt"
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")
            rel_orig_srt_url = f"/outputs/video_translate/{task_id}/{srt_orig_file.name}"

            cls.update_task(
                task_id,
                progress=40,
                source_lang=detected_source_lang,
                detected_source_lang=detected_source_lang,
                total_segments=len(original_segments),
                subtitles_original_srt_url=rel_orig_srt_url,
                message=f"Đã nhận diện & chuẩn hóa {len(original_segments)} câu thoại gốc.",
            )
            log_verbose_step("STEP_2_SUBTITLES_READY", f"Chuẩn hóa phụ đề gốc hoàn tất", {
                "total_segments": len(original_segments),
                "ad_filtered_count": removed_ad_cnt,
                "srt_file": str(srt_orig_file),
                "sample_first_3": original_segments[:3] if original_segments else [],
            })

            # ── BƯỚC 3: DỊCH PHỤ ĐỀ SANG NGÔN NGỮ ĐÍCH (40% -> 55%) ────────
            cls.update_task(
                task_id,
                progress=40,
                current_step="translating",
                message=f"Đang chuẩn bị gửi AI dịch {len(original_segments)} câu thoại...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )
            log_verbose_step("STEP_3_TRANSLATE_START", f"Bắt đầu dịch thuật {len(original_segments)} câu thoại", {
                "provider": translation_provider,
                "model": translation_model,
                "style": translation_style,
                "temperature": translation_temperature,
                "target_lang": target_lang,
                "source_lang": detected_source_lang,
            })

            async def on_trans_progress(cur, total, msg):
                pct = 40 + int((cur / max(1, total)) * 15)
                cls.update_task(
                    task_id,
                    progress=min(54, pct),
                    current_step="translating",
                    message=f"{msg} ({pct}%)",
                    elapsed_time=round(time.time() - start_time, 1),
                    elapsed_str=format_duration_vietnamese(time.time() - start_time),
                )

            translated_segments = await TranslationService.translate_segments(
                segments=original_segments,
                source_lang=detected_source_lang,
                target_lang=target_lang,
                provider=translation_provider,
                api_key=translation_api_key,
                style=translation_style,
                model=translation_model,
                temperature=translation_temperature,
                progress_callback=on_trans_progress,
            )

            # Đồng bộ lại original_segments nếu LLM đã lọc bớt câu quảng cáo/CTA ở Bước 3
            if len(translated_segments) < len(original_segments):
                llm_removed_cnt = len(original_segments) - len(translated_segments)
                translated_ids = {s.get("id") for s in translated_segments}
                original_segments = [s for s in original_segments if s.get("id") in translated_ids]
                logger.info(f"🛡️ [Pipeline] LLM đã loại bỏ thêm {llm_removed_cnt} câu quảng cáo/CTA ngữ cảnh ở Bước 3.")
                try:
                    generate_srt_file(original_segments, srt_orig_file, mode="hard_target")
                except Exception as e:
                    logger.warning(f"Lỗi cập nhật lại srt_orig_file sau khi LLM lọc ad: {e}")

            orig_text_map = {s["id"]: s.get("text", "") for s in original_segments}
            for ts in translated_segments:
                seg_id = ts.get("id")
                if seg_id in orig_text_map and not ts.get("original_text"):
                    ts["original_text"] = orig_text_map[seg_id]

            log_verbose_step("STEP_3_TRANSLATE_DONE", f"Hoàn tất dịch thuật {len(translated_segments)} câu", {
                "total_translated": len(translated_segments),
                "sample_first_3": [
                    {"id": s.get("id"), "orig": s.get("original_text", ""), "trans": s.get("text", "")}
                    for s in translated_segments[:3]
                ],
            })

            # ── BƯỚC 4: LỒNG TIẾNG TỰ ĐỘNG (55% -> 75%) ───────────────────
            cls.update_task(
                task_id,
                progress=55,
                current_step="dubbing",
                message=f"Bắt đầu lồng tiếng {len(translated_segments)} câu bằng giọng '{voice_id}'...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            # Xác định ref_audio nếu sử dụng clone giọng với OmniVoice
            clean_vocal_ref = None
            is_clone_mode = (
                engine.lower() == "omnivoice"
                or "clone" in voice_id.lower()
                or voice_id.startswith("omnivoice:")
            )
            if is_clone_mode:
                # Ưu tiên lấy file vocal sạch (nếu có lưu) hoặc đoạn audio tương ứng làm ref_audio để giọng đọc clone không bị dính tạp âm/nhạc nền gốc
                candidates = [
                    task_dir / "vocals.wav",
                    task_dir / "vocals_clean.wav",
                    whisper_audio_path if (whisper_audio_path and Path(whisper_audio_path).exists() and Path(whisper_audio_path).name != "raw_audio.wav") else None,
                    raw_audio_path if (raw_audio_path and Path(raw_audio_path).exists()) else None,
                ]
                for cand in candidates:
                    if cand and Path(cand).exists() and Path(cand).stat().st_size > 1000:
                        clean_vocal_ref = str(cand)
                        logger.info(f"🎙️ [OmniVoice Clone] Ưu tiên sử dụng vocal sạch làm ref_audio: {Path(cand).name}")
                        break

            async def on_dub_progress(cur, total, cur_text):
                pct = 55 + int((cur / max(1, total)) * 20)
                cls.update_task(
                    task_id,
                    progress=min(74, pct),
                    current_step="dubbing",
                    message=f"Đang thu âm câu {cur}/{total} ({pct}%) - \"{cur_text[:35]}...\"",
                    elapsed_time=round(time.time() - start_time, 1),
                    elapsed_str=format_duration_vietnamese(time.time() - start_time),
                )

            dub_res = await DubbingService.synthesize_batch(
                segments=translated_segments,
                voice_id=voice_id,
                engine=engine,
                rate=voice_rate,
                pitch=voice_pitch,
                session_id=task_id,
                progress_callback=on_dub_progress,
                ref_audio=clean_vocal_ref,
            )

            log_verbose_step("STEP_4_DUBBING_DONE", f"Hoàn tất lồng tiếng AI cho {len(dub_res.get('dubbed_segments', []))} câu", {
                "engine": engine,
                "voice_id": voice_id,
                "total_segments_dubbed": len(dub_res.get("dubbed_segments", [])),
                "total_voice_duration": dub_res.get("total_duration"),
                "sample_dubbed": [
                    {"id": s.get("id"), "dur": s.get("audio_duration"), "text": s.get("text", "")[:30]}
                    for s in dub_res.get("dubbed_segments", [])[:3]
                ],
            })

            # Lưu checkpoint dữ liệu câu thoại & cấu hình để phục vụ Studio chỉnh sửa theo thời gian thực
            task_meta = {
                "task_id": task_id,
                "video_path": str(video_path),
                "video_duration": video_duration,
                "voice_id": voice_id,
                "engine": engine,
                "voice_rate": voice_rate,
                "voice_pitch": voice_pitch,
                "voice_volume": voice_volume,
                "preserve_bgm": preserve_bgm,
                "bgm_type": bgm_type,
                "bgm_volume": bgm_volume,
                "bgm_path": str(bgm_path) if bgm_path else None,
                "raw_audio_path": str(raw_audio_path) if raw_audio_path else None,
                "subtitle_mode": subtitle_mode,
                "max_speed_rate": max_speed_rate,
                "detected_source_lang": detected_source_lang,
                "target_lang": target_lang,
                "output_resolution": output_resolution,
                "font_size": font_size,
                "margin_v": margin_v,
                "alignment": alignment,
            }
            try:
                (task_dir / "task_meta.json").write_text(json.dumps(task_meta, ensure_ascii=False, indent=2), encoding="utf-8")
                (task_dir / "dubbed_segments.json").write_text(json.dumps(dub_res["dubbed_segments"], ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception as e:
                logger.warning(f"Lỗi ghi task_meta/dubbed_segments: {e}")

            # ── BƯỚC 5: CÂN CHỈNH TỐC ĐỘ VÀ RÁP NỐI TIMELINE (75% -> 85%) ───
            cls.update_task(
                task_id,
                progress=75,
                current_step="aligning",
                message="Đang phân tích timeline, co giãn thông minh không cắt lời và hòa âm BGM...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )
            log_verbose_step("STEP_5_ALIGNMENT_START", f"Bắt đầu cân chỉnh tốc độ & ráp nối timeline", {
                "max_speed_rate": max_speed_rate,
                "preserve_bgm": preserve_bgm,
                "bgm_type": bgm_type,
                "bgm_volume": bgm_volume,
                "total_video_duration": video_duration,
            })

            # Chọn nguồn âm thanh nền theo tùy chọn: "original" (âm thanh gốc), "bgm" (nhạc nền tách vocal), hoặc "none"
            selected_bgm_path = None
            if preserve_bgm:
                if bgm_type == "original" and raw_audio_path and Path(raw_audio_path).exists():
                    selected_bgm_path = str(raw_audio_path)
                elif bgm_type != "none" and bgm_path and Path(bgm_path).exists():
                    selected_bgm_path = str(bgm_path)
                elif bgm_path and Path(bgm_path).exists():
                    selected_bgm_path = str(bgm_path)

            timeline_res = AlignmentService.build_full_timeline(
                segments=dub_res["dubbed_segments"],
                total_video_duration=video_duration,
                max_speed_rate=max_speed_rate,
                bgm_path=selected_bgm_path,
                bgm_volume=task_meta.get("bgm_volume", 0.25),
                voice_volume=task_meta.get("voice_volume", 1.0),
                session_id=task_id,
            )
            final_audio_path = Path(timeline_res["final_audio_path"])
            log_verbose_step("STEP_5_ALIGNMENT_DONE", f"Hoàn tất ráp nối timeline âm thanh", {
                "final_audio": str(final_audio_path),
                "audio_exists": final_audio_path.exists(),
                "file_size_kb": round(final_audio_path.stat().st_size / 1024, 1) if final_audio_path.exists() else 0,
            })

            # ── BƯỚC 6: XUẤT PHỤ ĐỀ VÀ RENDER VIDEO MP4 (85% -> 100%) ───────
            # Đọc cấu hình phụ đề & kiểu dáng tùy chỉnh động
            task_data = cls.get_task(task_id) or {}
            sub_mode = str(
                task_data.get("subtitle_mode")
                or subtitle_mode
                or "hard_target"
            ).lower().strip()

            is_stream_copy = sub_mode in ["soft", "soft_target", "soft_dual", "none", "off", "no_sub"]
            step_msg = (
                "Đang xuất video siêu tốc (Stream Copy 0% CPU, bảo toàn 100% chất lượng gốc)..."
                if is_stream_copy
                else f"Đang nén chuẩn H.264 và render video MP4 ({output_resolution.upper()}) hoàn chỉnh (FFmpeg)..."
            )

            cls.update_task(
                task_id,
                progress=85,
                current_step="rendering",
                message=step_msg,
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            # Xuất đồng thời cả file phụ đề dịch và file phụ đề gốc để đối chiếu kiểm tra
            srt_orig_file = task_dir / "subtitles_original.srt"
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")

            # Xác định mode xuất file SRT (nếu soft_dual thì xuất song ngữ, ngược lại xuất bản dịch)
            effective_srt_mode = "hard_dual" if sub_mode in ["hard_dual", "soft_dual"] else "hard_target"
            srt_file = task_dir / "subtitles.srt"
            generate_srt_file(translated_segments, srt_file, mode=effective_srt_mode)

            # Lưu bản chụp phụ đề AI dịch ban đầu để làm căn cứ học tập khi người dùng chỉnh sửa
            srt_initial_file = task_dir / "subtitles_ai_initial.srt"
            generate_srt_file(translated_segments, srt_initial_file, mode=effective_srt_mode)

            output_video_path = task_dir / "final_translated.mp4"

            # ── Xây dựng lệnh FFmpeg theo kiểu phụ đề ──
            if is_stream_copy:
                # 1. Chế độ Siêu Tốc (Stream Copy 3-5 giây, không tốn CPU/RAM)
                if sub_mode in ["soft", "soft_target", "soft_dual"] and srt_file.exists():
                    logger.info(f"⚡ [FFmpeg Stream Copy] Nhúng phụ đề mềm (mov_text) vào MP4: {srt_file.name}")
                    ffmpeg_cmd = [
                        "ffmpeg", "-y",
                        "-i", str(video_path),
                        "-i", str(final_audio_path),
                        "-i", str(srt_file),
                        "-map", "0:v:0",
                        "-map", "1:a:0",
                        "-map", "2:s:0?",
                        "-c:v", "copy",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-c:s", "mov_text",
                        "-shortest",
                        "-movflags", "+faststart",
                        str(output_video_path),
                    ]
                else:
                    logger.info("⚡ [FFmpeg Stream Copy] Xuất video không kèm phụ đề (-c:v copy)")
                    ffmpeg_cmd = [
                        "ffmpeg", "-y",
                        "-i", str(video_path),
                        "-i", str(final_audio_path),
                        "-map", "0:v:0",
                        "-map", "1:a:0",
                        "-c:v", "copy",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-shortest",
                        "-movflags", "+faststart",
                        str(output_video_path),
                    ]
            else:
                # 2. Chế độ Khắc Phụ Đề Cứng (Hardsub Burn-in với force_style động)
                def _to_ass_color(color_val: Any, default_val: str) -> str:
                    if not color_val or not isinstance(color_val, str):
                        return default_val
                    val = color_val.strip()
                    if val.startswith("&H") or val.startswith("&h"):
                        return val
                    if val.startswith("#"):
                        h = val.lstrip("#")
                        if len(h) == 6:
                            return f"&H00{h[4:6]}{h[2:4]}{h[0:2]}".upper()
                        elif len(h) == 8:
                            return f"&H{h[0:2]}{h[6:8]}{h[4:6]}{h[2:4]}".upper()
                    return default_val

                font_name = str(task_data.get("font_name") or task_data.get("FontName") or "Arial")
                font_size = int(task_data.get("font_size") or task_data.get("FontSize") or 20)
                primary_col = _to_ass_color(task_data.get("primary_color") or task_data.get("PrimaryColour") or task_data.get("font_color"), "&H00FFFFFF")
                outline_col = _to_ass_color(task_data.get("outline_color") or task_data.get("OutlineColour"), "&H00000000")
                back_col = _to_ass_color(task_data.get("back_color") or task_data.get("BackColour"), "&H00000000")
                bold = int(task_data.get("bold") or task_data.get("Bold") or 0)
                outline_w = int(task_data.get("outline") or task_data.get("Outline") or task_data.get("outline_width") or 2)
                shadow_w = int(task_data.get("shadow") or task_data.get("Shadow") or 0)
                alignment = int(task_data.get("alignment") or task_data.get("Alignment") or 2)
                margin_v = int(task_data.get("margin_v") or task_data.get("MarginV") or 30)

                style_str = (
                    f"FontName={font_name},"
                    f"FontSize={font_size},"
                    f"PrimaryColour={primary_col},"
                    f"OutlineColour={outline_col},"
                    f"BackColour={back_col},"
                    f"Bold={bold},"
                    f"Outline={outline_w},"
                    f"Shadow={shadow_w},"
                    f"Alignment={alignment},"
                    f"MarginV={margin_v}"
                )

                srt_escaped = str(srt_file.resolve()).replace("\\", "/").replace(":", "\\:")
                sub_filter = f"subtitles='{srt_escaped}':charenc=UTF-8:force_style='{style_str}'"
                scale_filter = get_ffmpeg_scale_filter(output_resolution)
                vf_filter = f"{scale_filter},{sub_filter}" if scale_filter else sub_filter

                ffmpeg_cmd = [
                    "ffmpeg", "-y",
                    "-i", str(video_path),
                    "-i", str(final_audio_path),
                    "-vf", vf_filter,
                    "-threads", "0",
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-preset", "veryfast",
                    "-crf", "19",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    "-movflags", "+faststart",
                    str(output_video_path),
                ]

            logger.info(f"[VideoTranslationPipeline] Chạy FFmpeg render: {' '.join(ffmpeg_cmd)}")
            res = await asyncio.to_thread(subprocess.run, ffmpeg_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg render thất bại: {res.stderr}")

            log_verbose_step("STEP_6_RENDER_DONE", f"Render video MP4 thành công", {
                "output_video": str(output_video_path),
                "file_size_mb": round(output_video_path.stat().st_size / (1024 * 1024), 2) if output_video_path.exists() else 0,
                "ffmpeg_cmd": ffmpeg_cmd,
            })

            # Hoàn thành xuất sắc!
            total_elapsed_sec = round(time.time() - start_time, 1)
            total_elapsed_str = format_duration_vietnamese(total_elapsed_sec)
            rel_video_url = f"/api/video-translate/stream/{task_id}"
            rel_audio_url = f"/outputs/alignment/{task_id}/{final_audio_path.name}"
            rel_srt_url = f"/outputs/video_translate/{task_id}/{srt_file.name}"
            rel_orig_srt_url = f"/outputs/video_translate/{task_id}/{srt_orig_file.name}"

            cls.update_task(
                task_id,
                status="completed",
                progress=100,
                current_step="completed",
                message=f"🎉 Dịch và lồng tiếng video hoàn tất trong {total_elapsed_str}!",
                video_url=rel_video_url,
                audio_url=rel_audio_url,
                subtitles_srt_url=rel_srt_url,
                subtitles_original_srt_url=rel_orig_srt_url,
                elapsed_time=total_elapsed_sec,
                elapsed_str=total_elapsed_str,
            )
            log_verbose_step("PIPELINE_COMPLETE", f"Hoàn tất toàn bộ quy trình dịch video cho task {task_id}", {
                "task_id": task_id,
                "total_elapsed_sec": total_elapsed_sec,
                "total_elapsed_str": total_elapsed_str,
                "video_url": rel_video_url,
            })
            logger.info(f"✅ [Task {task_id}] Hoàn tất video translation ({total_elapsed_str}): {output_video_path}")

            # ── DỌN DẸP FILE TẠM NGAY SAU KHI BƯỚC 6 XUẤT VIDEO THÀNH CÔNG ──
            cleanup_task_temp_files(task_dir)

        except Exception as e:
            log_verbose_step("PIPELINE_EXCEPTION", f"Lỗi xảy ra trong quá trình chạy pipeline: {e}", {
                "task_id": task_id,
                "error_type": type(e).__name__,
                "error_message": str(e),
                "current_step": _TASK_STORE.get(task_id, {}).get("current_step"),
            })
            logger.error(f"❌ [Task {task_id}] Thất bại: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi: {str(e)}",
                error=str(e),
            )
        finally:
            # ── ĐẢM BẢO DỌN DẸP TRONG MỌI TRƯỜNG HỢP (THÀNH CÔNG HOẶC THẤT BẠI) ──
            if "task_dir" in locals() and task_dir:
                cleanup_task_temp_files(task_dir)

    @classmethod
    async def run_manual_transcribe(
        cls,
        task_id: str,
        video_path: Path,
        source_lang: str = "auto",
        target_lang: str = "vi",
        whisper_model: str = "large-v3",
        clip_start: float = 0.0,
        clip_end: float | None = None,
        vad_threshold: float = 0.35,
        speech_pad_ms: int = 400,
        min_speech_duration_ms: int = 150,
        min_silence_duration_ms: int = 1000,
        beam_size: int = 3,
    ) -> None:
        """
        Giai đoạn 1 của Chế độ Thủ công (Manual SRT Workflow):
        - Trích xuất luồng âm thanh từ video.
        - Tạo phụ đề gốc Whisper (subtitles_original.srt).
        - Đặt trạng thái task thành 'waiting_manual_translation' để người dùng tải file SRT về dịch hoặc nạp bản dịch.
        """
        start_time = time.time()
        try:
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)

            # Cắt đoạn video nếu người dùng chọn thời gian bắt đầu / kết thúc
            if (clip_start and clip_start > 0.0) or (clip_end and clip_end > 0.0):
                trimmed_video = task_dir / "input_trimmed.mp4"
                trim_cmd = ["ffmpeg", "-y"]
                if clip_start and clip_start > 0.0:
                    trim_cmd.extend(["-ss", str(clip_start)])
                trim_cmd.extend(["-i", str(video_path)])
                if clip_end and clip_end > 0.0:
                    dur = clip_end - (clip_start or 0.0)
                    if dur > 0:
                        trim_cmd.extend(["-t", str(dur)])
                trim_cmd.extend([
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-crf", "18",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    str(trimmed_video),
                ])
                logger.info(f"✂️ [Manual Trim] Đang cắt video từ {clip_start}s đến {clip_end}s: {' '.join(trim_cmd)}")
                try:
                    await asyncio.to_thread(subprocess.run, trim_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    if trimmed_video.exists() and trimmed_video.stat().st_size > 0:
                        video_path = trimmed_video
                except Exception as e:
                    logger.warning(f"Lỗi khi cắt video clip thủ công ({e}), tiếp tục với video gốc.")

            task_config = {
                "video_path": str(video_path),
                "source_lang": source_lang,
                "target_lang": target_lang,
                "whisper_model": whisper_model,
                "start_time": clip_start,
                "end_time": clip_end,
                "is_manual_mode": True,
            }
            cls.update_task(task_id, **task_config)
            log_verbose_step("MANUAL_INIT", f"Khởi tạo tác vụ tạo phụ đề gốc thủ công [{task_id}]", task_config)

            # BƯỚC 1: Trích xuất âm thanh và tách giọng nói sạch
            raw_audio = task_dir / "raw_audio.wav"

            def do_extract():
                extract_audio(video_path, raw_audio)
                dur = get_audio_duration(raw_audio)
                vocal_res = separate_vocals_demucs(raw_audio, task_dir, enable_demucs=True)
                whisper_audio = vocal_res.get("vocals", raw_audio)
                bgm = vocal_res.get("bgm", raw_audio)
                return raw_audio, whisper_audio, bgm, dur

            cls.update_task(
                task_id,
                progress=15,
                current_step="extracting",
                message="Đang trích xuất luồng âm thanh và phân tích tách giọng nói sạch (Demucs AI / FFmpeg)...",
                _start_time=start_time,
                created_at=start_time,
            )
            raw_audio_path, whisper_audio_path, bgm_path, video_duration = await asyncio.to_thread(do_extract)
            cls.update_task(
                task_id,
                video_duration=video_duration,
                raw_audio_path=str(raw_audio_path),
                bgm_path=str(bgm_path),
            )
            log_verbose_step("MANUAL_STEP_1_AUDIO", f"Trích xuất âm thanh tách giọng hoàn tất", {
                "duration_seconds": round(video_duration, 2),
                "raw_audio": str(raw_audio_path),
                "whisper_audio": str(whisper_audio_path),
                "bgm_path": str(bgm_path),
            })

            # BƯỚC 2: Whisper tạo phụ đề gốc
            whisper_tag = "trên Cloud GPU" if is_cloud_gpu_active() else f"Faster-Whisper ({whisper_model.upper()})"
            cls.update_task(
                task_id,
                progress=35,
                current_step="transcribing",
                message=f"Đang tạo phụ đề thoại gốc {whisper_tag}...",
            )
            lang_arg = None if source_lang == "auto" else source_lang.split("-")[0]
            prompt_to_use = None
            if (source_lang and source_lang.startswith("zh")) or lang_arg == "zh":
                prompt_to_use = "以下是普通话的句子，请用简体中文输出。"

            # Nếu dùng Cloud GPU, truyền raw_audio_path để Demucs trên worker bóc tách cả Vocals và BGM
            audio_for_stt = raw_audio_path if is_cloud_gpu_active() else whisper_audio_path

            def run_whisper():
                logger.info(f"🎙️ [Manual Whisper STT] Bắt đầu tạo phụ đề gốc video '{video_path.name}' bằng '{whisper_model}' (VAD Thresh={vad_threshold})")
                return transcribe_with_remote_or_local(
                    audio_path=audio_for_stt,
                    language=source_lang,
                    model_size=whisper_model,
                    initial_prompt=prompt_to_use,
                    vad_filter=True,
                    vad_threshold=vad_threshold,
                    min_speech_duration_ms=min_speech_duration_ms,
                    min_silence_duration_ms=min_silence_duration_ms,
                    speech_pad_ms=speech_pad_ms,
                    beam_size=beam_size,
                    word_timestamps=True,
                    task_dir=task_dir,
                )

            whisper_res = await asyncio.to_thread(run_whisper)
            if isinstance(whisper_res, (list, tuple)) and len(whisper_res) == 3:
                segments_raw, detected_lang, remote_bgm_path = whisper_res
                if remote_bgm_path and Path(remote_bgm_path).exists():
                    bgm_path = Path(remote_bgm_path)
                    cls.update_task(task_id, bgm_path=str(bgm_path))
            elif isinstance(whisper_res, (list, tuple)) and len(whisper_res) == 2:
                segments_raw, detected_lang = whisper_res
            else:
                segments_raw, detected_lang = whisper_res, (source_lang if source_lang != "auto" else "vi")
            detected_source_lang = source_lang if source_lang != "auto" else detected_lang

            original_segments = []
            all_words_flat = []
            for s in segments_raw:
                w_list = s.get("words", []) if isinstance(s, dict) else getattr(s, "words", None)
                if w_list and isinstance(w_list, list):
                    for w in w_list:
                        if isinstance(w, dict):
                            all_words_flat.append(w)
                        else:
                            all_words_flat.append({
                                "word": str(getattr(w, "word", "")),
                                "start": float(getattr(w, "start", 0.0)),
                                "end": float(getattr(w, "end", 0.0)),
                                "probability": float(getattr(w, "probability", 1.0)),
                            })

            # 1. Nếu có word_timestamps, ưu tiên resegment_words để chia nhỏ câu 3.0s - 6.0s (5-9 từ)
            if all_words_flat:
                original_segments = resegment_words(
                    all_words_flat,
                    max_words=8,
                    min_duration=3.0,
                    max_duration=6.0,
                    min_words=5,
                    min_silence_split=0.40,
                )
                logger.info(f"✂️ [Manual Pipeline Resegment] Đã chia nhỏ thành {len(original_segments)} câu chuẩn nhịp nói diễn viên (3-6s).")
            else:
                for s in segments_raw:
                    if isinstance(s, dict):
                        txt = str(s.get("text", "")).strip()
                        raw_start = float(s.get("start", 0.0))
                        raw_end = float(s.get("end", 0.0))
                    else:
                        txt = str(getattr(s, "text", "")).strip()
                        raw_start = float(getattr(s, "start", 0.0))
                        raw_end = float(getattr(s, "end", 0.0))

                    if not txt:
                        continue
                    if raw_end <= raw_start:
                        raw_end = round(raw_start + 0.3, 3)

                    original_segments.append({
                        "id": len(original_segments) + 1,
                        "start": round(raw_start, 3),
                        "end": round(raw_end, 3),
                        "text": txt,
                    })

            # Lọc sạch quảng cáo, watermark và các câu tùy chỉnh do người dùng dạy cho AI bỏ qua
            original_segments, removed_ad_cnt = AdFilterService.filter_subtitle_segments(original_segments)
            if removed_ad_cnt > 0:
                logger.info(f"🛡️ [Manual Pipeline] Đã loại bỏ {removed_ad_cnt} câu quảng cáo/rác/câu bỏ qua khỏi phụ đề gốc.")

            # Tự động phát hiện và nối câu ngắt quãng với giới hạn tối đa 6.0s và khoảng lặng < 0.40s
            original_segments = heal_and_merge_segments(original_segments, max_gap=0.40, max_duration=6.0)

            if not original_segments:
                raise RuntimeError("Không phát hiện được câu thoại nào rõ ràng trong video.")

            srt_orig_file = task_dir / "subtitles_original.srt"
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")
            rel_orig_srt_url = f"/outputs/video_translate/{task_id}/{srt_orig_file.name}"

            total_elapsed_sec = round(time.time() - start_time, 1)
            total_elapsed_str = format_duration_vietnamese(total_elapsed_sec)

            cls.update_task(
                task_id,
                status="waiting_manual_translation",
                progress=40,
                current_step="waiting_manual_translation",
                source_lang=detected_source_lang,
                detected_source_lang=detected_source_lang,
                total_segments=len(original_segments),
                subtitles_original_srt_url=rel_orig_srt_url,
                message=f"⏸️ [Đang chờ bản dịch] Đã tạo phụ đề gốc {len(original_segments)} câu thoại ({total_elapsed_str}). Hãy tải file SRT về dịch hoặc nạp file SRT dịch ở Bước 3 để hoàn thiện.",
                elapsed_time=total_elapsed_sec,
                elapsed_str=total_elapsed_str,
            )
            log_verbose_step("MANUAL_COMPLETE", f"Hoàn tất tạo phụ đề gốc thủ công cho task {task_id}", {
                "total_segments": len(original_segments),
                "srt_file": str(srt_orig_file),
                "total_elapsed_sec": total_elapsed_sec,
                "detected_source_lang": detected_source_lang,
            })
            logger.info(f"✅ [Task {task_id}] Hoàn tất tạo phụ đề gốc thủ công ({total_elapsed_str}): {srt_orig_file}")
        except Exception as e:
            log_verbose_step("MANUAL_EXCEPTION", f"Lỗi tạo phụ đề gốc thủ công task {task_id}: {e}", {
                "error": str(e),
                "error_type": type(e).__name__,
            })
            logger.error(f"❌ [Task {task_id}] Lỗi tạo phụ đề gốc: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi tạo phụ đề gốc: {str(e)}",
                error=str(e),
            )

    PROMPT_BOILERPLATE_PATTERNS = [
        r"Tôi muốn dịch file phụ đề.*",
        r"Hãy tuân thủ các quy tắc sau.*",
        r"\d+[\.\)]\s*Đọc và dịch nội dung bám sát kịch bản.*",
        r"\d+[\.\)]\s*Phân tích logic hội thoại.*",
        r"\d+[\.\)]\s*Kiểm tra mốc thời gian.*",
        r"\d+[\.\)]\s*Tối ưu độ dài câu.*",
        r"\d+[\.\)]\s*Lọc các câu mang tính chất quảng cáo.*",
        r"\d+[\.\)]\s*Nếu thấy có lời bài hát.*",
        r"Đây là file/nội dung phụ đề:?",
        r"(Dưới đây là|Đây là)\s+(bản dịch|phụ đề|nội dung|kịch bản).*",
        r"Chắc chắn rồi.*",
        r"Here (is|are) the (translated|subtitles|srt).*",
        r"Sure,?\s+(here is|below is).*",
        r"(Below is|Here is)\s+the\s+(translated|subtitles|srt).*",
        r"Quy tắc\s*\d+:?.*",
    ]

    @classmethod
    def clean_subtitle_text(cls, text: str) -> str:
        """Làm sạch văn bản phụ đề: loại bỏ citation, markdown, link spam và TỰ ĐỘNG BỎ CÁC CÂU PROMPT/CHAT LỜI CHÀO."""
        if not text:
            return ""
        # 1. Bỏ trích dẫn AI [cite: 3], [cite: 1, 2], [1], 【3†source】
        text = re.sub(r"\[cite:\s*[\d,\s]+\]", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\[\d+\]", "", text)
        text = re.sub(r"【[^】]+】", "", text)
        # 2. Bỏ định dạng markdown bold / italic / inline code
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        text = re.sub(r"\*([^*]+)\*", r"\1", text)
        text = re.sub(r"`([^`]+)`", r"\1", text)
        # 3. Lọc bỏ các dòng Prompt mẫu hoặc lời dẫn AI chat
        for pat in cls.PROMPT_BOILERPLATE_PATTERNS:
            text = re.sub(pat, "", text, flags=re.IGNORECASE)
        # 4. Lọc bỏ các link quảng cáo nhỏ lẻ trong câu
        text = AdFilterService.clean_text_ads(text)
        # 5. Chuẩn hóa khoảng trắng
        text = " ".join(text.split())
        return text.strip()

    @classmethod
    def parse_srt_content(cls, content: str) -> list[dict[str, Any]]:
        """
        Phân tích nội dung file SRT siêu mạnh mẽ:
        - Tự động gỡ bỏ UTF-8 BOM, ký tự xuống dòng Windows CRLF / CR.
        - Tự động bóc tách và loại bỏ code block markdown (```srt ... ```), prompt mẫu mở đầu và lời chào của AI.
        - Khớp mốc thời gian regex chịu lỗi mọi biến thể khoảng cách/dòng trống và dấu phân cách.
        - Lọc sạch toàn bộ citation [cite: x] do AI sinh ra để không bị đọc lẫn vào audio TTS.
        """
        if not content or not content.strip():
            return []

        # 1. Gỡ BOM và chuẩn hóa ngắt dòng
        norm_content = content.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
        # Gỡ code blocks markdown
        norm_content = re.sub(r"^```[a-zA-Z]*\n", "", norm_content, flags=re.MULTILINE)
        norm_content = re.sub(r"\n```\s*$", "", norm_content, flags=re.MULTILINE)
        norm_content = norm_content.replace("```srt", "").replace("```", "")

        # 2. TỰ ĐỘNG BỎ TOÀN BỘ PROMPT YÊU CẦU & LỜI DẪN CỦA AI TRƯỚC MỐC THỜI GIAN ĐẦU TIÊN
        first_time_match = re.search(
            r"\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3}",
            norm_content
        )
        if first_time_match:
            first_idx = first_time_match.start()
            preceding_text = norm_content[:first_idx]
            match_index = re.search(r"\n\s*(\d+)\s*$", preceding_text)
            if match_index:
                norm_content = norm_content[match_index.start():].lstrip()
            else:
                norm_content = norm_content[first_idx:]

        def parse_t(t_str: str) -> float:
            t_str = t_str.strip().replace(",", ".")
            parts = t_str.split(":")
            if len(parts) == 3:
                return round(float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2]), 3)
            elif len(parts) == 2:
                return round(float(parts[0]) * 60 + float(parts[1]), 3)
            return 0.0

        # Regex tìm mốc thời gian SRT chuẩn: 00:00:00,000 --> 00:00:00,000
        time_pat = re.compile(
            r"(?:(\d+)\s*\n\s*)?(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})",
            re.MULTILINE,
        )

        matches = list(time_pat.finditer(norm_content))
        entries = []

        if matches:
            for i, m in enumerate(matches):
                seg_idx = int(m.group(1)) if m.group(1) else (i + 1)
                start = parse_t(m.group(2))
                end = parse_t(m.group(3))

                text_start = m.end()
                text_end = matches[i + 1].start() if i + 1 < len(matches) else len(norm_content)
                raw_text_block = norm_content[text_start:text_end].strip()

                lines = [l.strip() for l in raw_text_block.split("\n") if l.strip()]
                # Nếu dòng cuối cùng là số thứ tự của phân đoạn tiếp theo, loại bỏ dòng đó
                if lines and i + 1 < len(matches) and lines[-1].isdigit():
                    next_idx = matches[i + 1].group(1)
                    if next_idx is None or int(lines[-1]) == int(next_idx):
                        lines.pop()

                text = cls.clean_subtitle_text(" ".join(lines))
                if text:
                    entries.append({"id": seg_idx, "start": start, "end": end, "text": text})

        # Fallback phân tách khối truyền thống nếu regex không có kết quả
        if not entries:
            blocks = re.split(r"\n\s*\n", norm_content.strip())
            for block in blocks:
                lines = [l.strip() for l in block.split("\n") if l.strip()]
                if len(lines) >= 2:
                    try:
                        if lines[0].isdigit():
                            seg_id = int(lines[0])
                            time_line = lines[1]
                            raw_txt = " ".join(lines[2:])
                        else:
                            seg_id = len(entries) + 1
                            time_line = lines[0]
                            raw_txt = " ".join(lines[1:])

                        times = time_line.split("-->")
                        if len(times) == 2:
                            start = parse_t(times[0])
                            end = parse_t(times[1])
                            txt = cls.clean_subtitle_text(raw_txt)
                            if txt:
                                entries.append({"id": seg_id, "start": start, "end": end, "text": txt})
                    except Exception as e:
                        logger.warning(f"Lỗi fallback parse block SRT: {e}")

        return entries

    @classmethod
    def parse_srt_file(cls, srt_path: Path) -> list[dict[str, Any]]:
        """Đọc và parse file phụ đề .srt với xử lý mã hóa linh hoạt."""
        if not srt_path.exists():
            return []
        try:
            content = srt_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                content = srt_path.read_text(encoding="utf-8-sig")
            except Exception:
                content = srt_path.read_bytes().decode("utf-8", errors="ignore")
        return cls.parse_srt_content(content)

    @classmethod
    async def run_redub(
        cls,
        task_id: str,
        srt_content: str | None = None,
        voice_id: str | None = None,
        engine: str | None = None,
        voice_rate: str | None = None,
        voice_pitch: str | None = None,
        voice_volume: float | None = None,
        preserve_bgm: bool | None = None,
        bgm_type: str | None = None,
        bgm_volume: float | None = None,
        subtitle_mode: str | None = None,
        max_speed_rate: float | None = None,
        output_resolution: str | None = None,
        font_size: int | None = None,
        margin_v: int | None = None,
        alignment: int | None = None,
    ) -> None:
        """
        Lồng tiếng và render lại video từ file phụ đề .srt (Chế độ thủ công hoặc Re-dub từ Studio).
        Tối ưu siêu tốc vì tái sử dụng audio/video gốc đã có sẵn.
        """
        start_time = time.time()
        try:
            task = cls.get_task(task_id) or {}
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)
            if not task_dir.exists():
                raise RuntimeError(f"Tác vụ {task_id} không tồn tại trên hệ thống.")

            srt_file = task_dir / "subtitles.srt"
            if srt_content is not None and srt_content.strip():
                srt_file.write_text(srt_content.strip(), encoding="utf-8-sig")

            if not srt_file.exists():
                raise RuntimeError(f"File phụ đề {srt_file.name} không tồn tại.")

            segments = cls.parse_srt_file(srt_file)
            if not segments:
                raise RuntimeError("Không tìm thấy câu thoại hợp lệ trong file phụ đề .srt. Vui lòng kiểm tra lại định dạng mốc thời gian.")

            # Ghi lại file subtitles.srt chuẩn hóa, sạch sẽ
            generate_srt_file(segments, srt_file, mode="hard_target")

            # Lấy các tham số cấu hình (từ request hoặc từ task_meta đã lưu)
            v_id = voice_id or task.get("voice_id", "vi-VN-HoaiMyNeural")
            eng = engine or task.get("engine", "edge-tts")
            v_rate = voice_rate or task.get("voice_rate", "+0%")
            v_pitch = voice_pitch or task.get("voice_pitch", "+0Hz")
            v_vol = voice_volume if voice_volume is not None else float(task.get("voice_volume", 1.0))
            p_bgm = preserve_bgm if preserve_bgm is not None else bool(task.get("preserve_bgm", True))
            b_type = bgm_type or task.get("bgm_type", "bgm")
            b_vol = bgm_volume if bgm_volume is not None else float(task.get("bgm_volume", 0.30))
            sub_mode = subtitle_mode or task.get("subtitle_mode", "hard_target")
            f_size = font_size if font_size is not None else int(task.get("font_size") or 20)
            m_v = margin_v if margin_v is not None else int(task.get("margin_v") or 30)
            align = alignment if alignment is not None else int(task.get("alignment") or 2)
            max_speed = max_speed_rate if max_speed_rate is not None else float(task.get("max_speed_rate", 1.35))
            out_res = output_resolution or task.get("output_resolution", "720p")

            # Tìm video gốc
            video_path_str = task.get("video_path")
            video_path = Path(video_path_str) if video_path_str else None

            # Phục hồi an toàn: nếu video_path là input_trimmed.mp4 mà bị thiếu trên đĩa (ví dụ bị cleanup nhầm)
            if (not video_path or not video_path.exists()) and video_path_str and "input_trimmed.mp4" in video_path_str:
                orig_candidates = [f for f in task_dir.glob("input_*.*") if f.name != "input_trimmed.mp4" and f.is_file()]
                if orig_candidates:
                    orig_v = orig_candidates[0]
                    c_start = task.get("clip_start")
                    c_end = task.get("clip_end")
                    if (c_start and float(c_start) > 0.0) or (c_end and float(c_end) > 0.0):
                        trimmed_v = task_dir / "input_trimmed.mp4"
                        trim_cmd = ["ffmpeg", "-y"]
                        if c_start and float(c_start) > 0.0:
                            trim_cmd.extend(["-ss", str(c_start)])
                        trim_cmd.extend(["-i", str(orig_v)])
                        if c_end and float(c_end) > 0.0:
                            dur = float(c_end) - (float(c_start) if c_start else 0.0)
                            if dur > 0:
                                trim_cmd.extend(["-t", str(dur)])
                        trim_cmd.extend([
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                            "-c:a", "aac", "-b:a", "192k", str(trimmed_v)
                        ])
                        try:
                            logger.info(f"✂️ [Auto Re-Trim] Đang tự động tạo lại {trimmed_v.name} từ {orig_v.name}...")
                            subprocess.run(trim_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                            if trimmed_v.exists() and trimmed_v.stat().st_size > 0:
                                video_path = trimmed_v
                        except Exception as te:
                            logger.warning(f"Không thể cắt lại video: {te}")
                    if not video_path or not video_path.exists():
                        video_path = orig_v

            if not video_path or not video_path.exists():
                for f in task_dir.glob("input_*.*"):
                    if f.is_file():
                        video_path = f
                        break
            if not video_path or not video_path.exists():
                for f in task_dir.glob("*.mp4"):
                    if f.is_file() and not f.name.startswith("final_"):
                        video_path = f
                        break

            if not video_path or not video_path.exists():
                raise RuntimeError("Không tìm thấy video gốc để render lại.")

            raw_audio_path = task_dir / "raw_audio.wav"
            if raw_audio_path.exists():
                video_duration = get_audio_duration(raw_audio_path)
            else:
                extract_audio(video_path, raw_audio_path)
                video_duration = get_audio_duration(raw_audio_path)

            cls.update_task(
                task_id,
                status="processing",
                progress=20,
                current_step="dubbing",
                message=f"Bắt đầu lồng tiếng {len(segments)} câu thoại bằng giọng '{v_id}'...",
                total_segments=len(segments),
                _start_time=start_time,
                created_at=start_time,
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            # 1. Thu âm lại theo danh sách phụ đề đã sửa với live progress
            async def on_redub_progress(cur, total, cur_text):
                pct = 20 + int((cur / max(1, total)) * 45)
                cls.update_task(
                    task_id,
                    progress=min(64, pct),
                    current_step="dubbing",
                    message=f"Đang thu âm câu {cur}/{total} ({pct}%) - \"{cur_text[:35]}...\"",
                    elapsed_time=round(time.time() - start_time, 1),
                    elapsed_str=format_duration_vietnamese(time.time() - start_time),
                )

            dub_res = await DubbingService.synthesize_batch(
                segments=segments,
                voice_id=v_id,
                engine=eng,
                rate=v_rate,
                pitch=v_pitch,
                session_id=task_id,
                progress_callback=on_redub_progress,
            )

            # Lưu checkpoint dữ liệu câu thoại & cấu hình sau khi redub
            task_meta = {
                "task_id": task_id,
                "video_path": str(video_path),
                "video_duration": video_duration,
                "voice_id": v_id,
                "engine": eng,
                "voice_rate": v_rate,
                "voice_pitch": v_pitch,
                "voice_volume": v_vol,
                "preserve_bgm": p_bgm,
                "bgm_type": b_type,
                "bgm_volume": b_vol,
                "subtitle_mode": sub_mode,
                "max_speed_rate": max_speed,
                "output_resolution": out_res,
                "font_size": f_size,
                "margin_v": m_v,
                "alignment": align,
            }
            try:
                task_dir.mkdir(parents=True, exist_ok=True)
                (task_dir / "task_meta.json").write_text(json.dumps(task_meta, ensure_ascii=False, indent=2), encoding="utf-8")
                (task_dir / "dubbed_segments.json").write_text(json.dumps(dub_res["dubbed_segments"], ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception as e:
                logger.warning(f"Lỗi ghi task_meta/dubbed_segments trong redub: {e}")

            # 2. Cân chỉnh tốc độ & hòa âm thuyết minh
            cls.update_task(
                task_id,
                progress=65,
                current_step="aligning",
                message="Đang cân chỉnh tốc độ và hòa âm thuyết minh...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            bgm_path = task_dir / "no_vocals.wav"
            if not bgm_path.exists():
                bgm_path = task_dir / "bgm.wav"
            if not bgm_path.exists():
                bgm_path = DUBBING_OUTPUT_DIR / task_id / "bgm.wav"
            if not bgm_path.exists() and (task_dir / "bgm_raw.wav").exists():
                bgm_path = task_dir / "bgm_raw.wav"
            if not bgm_path.exists() and p_bgm:
                raw_audio = task_dir / "raw_audio.wav"
                if not raw_audio.exists():
                    extract_audio(video_path, raw_audio)
                vocal_res = separate_vocals_demucs(raw_audio, task_dir, enable_demucs=True)
                bgm_path = vocal_res.get("bgm", raw_audio)

            # Chọn nguồn âm thanh nền phù hợp: "original" (âm thanh gốc), "bgm" (nhạc nền tách vocal), hoặc "none"
            selected_bgm_path = None
            if p_bgm and b_type != "none":
                if b_type == "original" and raw_audio_path and raw_audio_path.exists():
                    selected_bgm_path = str(raw_audio_path)
                elif bgm_path and bgm_path.exists():
                    selected_bgm_path = str(bgm_path)

            timeline_res = AlignmentService.build_full_timeline(
                segments=dub_res["dubbed_segments"],
                total_video_duration=video_duration,
                max_speed_rate=max_speed,
                bgm_path=selected_bgm_path,
                bgm_volume=b_vol,
                voice_volume=v_vol,
                session_id=task_id,
            )
            final_audio_path = Path(timeline_res["final_audio_path"])

            # 3. Render video MP4 với phụ đề đã sửa & scale theo chuẩn resolution
            cls.update_task(
                task_id,
                progress=85,
                current_step="rendering",
                message=f"Đang render video MP4 ({out_res.upper()}) hoàn thiện (FFmpeg)...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            # Chuẩn bị file phụ đề render (hỗ trợ hard_dual nếu có file phụ đề gốc)
            render_srt_file = srt_file
            if sub_mode == "hard_dual" and (task_dir / "subtitles_original.srt").exists():
                orig_segments = cls.parse_srt_file(task_dir / "subtitles_original.srt")
                orig_map = {s.get("id"): s.get("text", "") for s in orig_segments}
                dual_segments = []
                for s in segments:
                    d_s = dict(s)
                    d_s["original_text"] = orig_map.get(s.get("id"), "")
                    dual_segments.append(d_s)
                render_srt_file = task_dir / "subtitles_dual.srt"
                generate_srt_file(dual_segments, render_srt_file, mode="hard_dual")

            output_video_path = task_dir / "final_translated.mp4"
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(final_audio_path),
            ]

            scale_filter = get_ffmpeg_scale_filter(out_res)

            if sub_mode in ["hard_target", "hard_dual"]:
                srt_escaped = str(render_srt_file.resolve()).replace("\\", "/").replace(":", r"\:")
                style_str = f"FontSize={f_size},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment={align},MarginV={m_v}"
                sub_filter = f"subtitles='{srt_escaped}':charenc=UTF-8:force_style='{style_str}'"
                vf_filter = f"{scale_filter},{sub_filter}" if scale_filter else sub_filter

                ffmpeg_cmd.extend(["-vf", vf_filter])
                ffmpeg_cmd.extend([
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-preset", "fast",
                    "-crf", "19",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    "-movflags", "+faststart",
                    str(output_video_path),
                ])
            else:
                if scale_filter:
                    ffmpeg_cmd.extend([
                        "-vf", scale_filter,
                        "-map", "0:v:0",
                        "-map", "1:a:0",
                        "-c:v", "libx264",
                        "-pix_fmt", "yuv420p",
                        "-preset", "fast",
                        "-crf", "19",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-shortest",
                        "-movflags", "+faststart",
                        str(output_video_path),
                    ])
                else:
                    ffmpeg_cmd.extend([
                        "-map", "0:v:0",
                        "-map", "1:a:0",
                        "-c:v", "libx264",
                        "-pix_fmt", "yuv420p",
                        "-preset", "fast",
                        "-crf", "19",
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-shortest",
                        "-movflags", "+faststart",
                        str(output_video_path),
                    ])

            logger.info(f"[VideoTranslationPipeline Re-dub] Chạy FFmpeg render: {' '.join(ffmpeg_cmd)}")
            res = await asyncio.to_thread(subprocess.run, ffmpeg_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg render thất bại: {res.stderr}")

            total_elapsed_sec = round(time.time() - start_time, 1)
            total_elapsed_str = format_duration_vietnamese(total_elapsed_sec)
            rel_video_url = f"/api/video-translate/stream/{task_id}"
            rel_audio_url = f"/outputs/alignment/{task_id}/{final_audio_path.name}"
            rel_srt_url = f"/outputs/video_translate/{task_id}/{srt_file.name}"

            cls.update_task(
                task_id,
                status="completed",
                progress=100,
                current_step="completed",
                message=f"🎉 Hoàn tất lồng tiếng & render video trong {total_elapsed_str}!",
                video_url=rel_video_url,
                audio_url=rel_audio_url,
                subtitles_srt_url=rel_srt_url,
                elapsed_time=total_elapsed_sec,
                elapsed_str=total_elapsed_str,
                voice_id=v_id,
                engine=eng,
                voice_rate=v_rate,
                voice_pitch=v_pitch,
                voice_volume=v_vol,
                preserve_bgm=p_bgm,
                bgm_volume=b_vol,
                subtitle_mode=sub_mode,
                max_speed_rate=max_speed,
                output_resolution=out_res,
            )
            logger.info(f"✅ [Task {task_id}] Re-dub hoàn tất ({total_elapsed_str}): {output_video_path}")
            cleanup_task_temp_files(task_dir)
        except Exception as e:
            logger.error(f"❌ [Task {task_id}] Lồng tiếng / Render thất bại: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi: {str(e)}",
                error=str(e),
            )
        finally:
            if "task_dir" in locals() and task_dir:
                cleanup_task_temp_files(task_dir)

    @classmethod
    def get_studio_segments(cls, task_id: str) -> dict[str, Any]:
        """
        Lấy danh sách các câu thoại kèm file âm thanh và mốc thời gian phục vụ Studio Editor (Real-time Timeline Review).
        Nếu file dubbed_segments.json chưa có (ví dụ task chạy trước đó), tự động tái tạo từ subtitles.srt.
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Không tìm thấy thư mục của tác vụ {task_id}")

        dubbed_file = task_dir / "dubbed_segments.json"
        segments = []
        if dubbed_file.exists():
            try:
                segments = json.loads(dubbed_file.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Lỗi đọc dubbed_segments.json: {e}")

        if not segments:
            # Tái tạo từ subtitles.srt và subtitles_original.srt
            srt_path = task_dir / "subtitles.srt"
            parsed_sub = cls.parse_srt_file(srt_path) if srt_path.exists() else []
            orig_sub = cls.parse_srt_file(task_dir / "subtitles_original.srt") if (task_dir / "subtitles_original.srt").exists() else []
            orig_map = {item.get("id"): item.get("text", "") for item in orig_sub}

            dubbing_dir = DUBBING_OUTPUT_DIR / task_id
            for s in parsed_sub:
                s_id = s.get("id", 1)
                audio_file = dubbing_dir / f"seg_{s_id:04d}.mp3"
                audio_url = f"/outputs/dubbing/{task_id}/{audio_file.name}" if audio_file.exists() else None
                audio_dur = get_audio_duration(audio_file) if audio_file.exists() else 0.0
                segments.append({
                    "id": s_id,
                    "start": s.get("start", 0.0),
                    "end": s.get("end", 0.0),
                    "text": s.get("text", ""),
                    "original_text": orig_map.get(s_id, ""),
                    "audio_path": str(audio_file) if audio_file.exists() else None,
                    "audio_url": audio_url,
                    "audio_duration": audio_dur,
                    "target_duration": max(0.1, s.get("end", 0.0) - s.get("start", 0.0)),
                })

        meta_file = task_dir / "task_meta.json"
        task_meta = {}
        if meta_file.exists():
            try:
                task_meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        task = cls.get_task(task_id) or {}
        return {
            "task_id": task_id,
            "video_url": f"/api/video-translate/stream/{task_id}",
            "raw_video_url": f"/api/video-translate/stream-raw/{task_id}",
            "bgm_url": f"/api/video-translate/stream-bgm/{task_id}",
            "audio_url": task.get("audio_url"),
            "subtitles_srt_url": f"/outputs/video_translate/{task_id}/subtitles.srt",
            "segments": segments,
            "meta": {
                "voice_id": task_meta.get("voice_id") or task.get("voice_id", "vi-VN-HoaiMyNeural"),
                "engine": task_meta.get("engine") or task.get("engine", "edge-tts"),
                "preserve_bgm": task_meta.get("preserve_bgm", task.get("preserve_bgm", True)),
                "bgm_type": task_meta.get("bgm_type", task.get("bgm_type", "bgm")),
                "bgm_volume": task_meta.get("bgm_volume", task.get("bgm_volume", 0.30)),
                "voice_volume": task_meta.get("voice_volume", task.get("voice_volume", 1.0)),
                "subtitle_mode": task_meta.get("subtitle_mode", task.get("subtitle_mode", "hard_target")),
                "max_speed_rate": task_meta.get("max_speed_rate", task.get("max_speed_rate", 1.35)),
            },
        }

    @classmethod
    async def redub_single_segment(
        cls,
        task_id: str,
        segment_id: int,
        new_text: str,
        voice_id: str | None = None,
        engine: str | None = None,
        rate: str | None = None,
        pitch: str | None = None,
        volume: float | None = None,
    ) -> dict[str, Any]:
        """
        Thuyết minh lại CỤC BỘ cho duy nhất 1 câu thoại (In-place Single Segment Re-dubbing).
        Cực kỳ nhanh (chỉ mất ~0.5s - 1s).
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        target_seg = next((s for s in segments if s.get("id") == segment_id), None)
        if not target_seg:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id}")

        clean_text = new_text.strip()
        if not clean_text:
            raise RuntimeError("Nội dung câu nói không được để trống.")

        # Lấy cấu hình giọng
        v_id = voice_id or task_meta.get("voice_id", "vi-VN-HoaiMyNeural")
        eng = engine or task_meta.get("engine", "edge-tts")
        v_rate = rate or "+0%"
        v_pitch = pitch or "+0Hz"
        v_vol = f"+{int(volume*100)}%" if volume is not None else "+0%"

        session_dir = DUBBING_OUTPUT_DIR / task_id
        session_dir.mkdir(parents=True, exist_ok=True)
        seg_file = session_dir / f"seg_{segment_id:04d}.mp3"

        start = float(target_seg.get("start", 0.0))
        end = float(target_seg.get("end", 0.0))
        target_duration = max(0.1, end - start)

        # Gọi synthesize_single cho duy nhất câu này
        res = await DubbingService.synthesize_single(
            text=clean_text,
            voice_id=v_id,
            engine=eng,
            rate=v_rate,
            pitch=v_pitch,
            volume=v_vol,
            output_path=seg_file,
            target_duration=target_duration,
        )

        # Cập nhật thông tin segment
        target_seg["text"] = clean_text
        target_seg["audio_path"] = str(seg_file)
        # Gắn cache-buster để trình duyệt luôn phát âm thanh mới
        ts = int(time.time() * 1000)
        target_seg["audio_url"] = f"/outputs/dubbing/{task_id}/{seg_file.name}?t={ts}"
        target_seg["audio_duration"] = res["duration"]
        target_seg["target_duration"] = target_duration
        target_seg["rate_ratio"] = res["rate_ratio"]

        # Lưu lại dubbed_segments.json
        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

        # Cập nhật luôn file phụ đề subtitles.srt
        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"🎙️ [Studio Redub] Thu lại câu #{segment_id} thành công ({res['duration']}s): '{clean_text}'")
        return {
            "status": "ok",
            "segment_id": segment_id,
            "segment": target_seg,
            "audio_url": target_seg["audio_url"],
            "message": f"Đã thu lại câu #{segment_id} thành công!",
        }

    @classmethod
    async def update_segment(
        cls,
        task_id: str,
        segment_id: int,
        text: str | None = None,
        start: float | None = None,
        end: float | None = None,
    ) -> dict[str, Any]:
        """
        Cập nhật trực tiếp nội dung hoặc mốc thời gian bắt đầu/kết thúc của câu thoại.
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        target_seg = next((s for s in segments if s.get("id") == segment_id), None)
        if not target_seg:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id}")

        if text is not None:
            target_seg["text"] = text.strip()
        if start is not None:
            target_seg["start"] = max(0.0, round(float(start), 3))
        if end is not None:
            target_seg["end"] = max(target_seg.get("start", 0.0) + 0.1, round(float(end), 3))

        # Lưu lại dubbed_segments.json
        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

        # Cập nhật luôn file phụ đề subtitles.srt
        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"✏️ [Studio Update] Đã cập nhật câu #{segment_id}: start={target_seg['start']}s, end={target_seg['end']}s, text='{target_seg['text']}'")
        return {
            "status": "ok",
            "segment_id": segment_id,
            "segment": target_seg,
            "message": f"Đã cập nhật câu #{segment_id} thành công!",
        }

    @classmethod
    async def delete_segment(
        cls,
        task_id: str,
        segment_id: int,
    ) -> dict[str, Any]:
        """
        Xóa hoàn toàn một câu thoại/đoạn phụ đề khỏi timeline và danh sách Studio.
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        target_seg = next((s for s in segments if s.get("id") == segment_id), None)
        if not target_seg:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id} để xóa")

        # Xóa file âm thanh vật lý của câu này để giải phóng dung lượng đĩa
        audio_path_str = target_seg.get("audio_path")
        if audio_path_str:
            try:
                Path(audio_path_str).unlink(missing_ok=True)
            except Exception as e:
                logger.debug(f"Không thể xóa file audio câu {segment_id}: {e}")

        segments = [s for s in segments if s.get("id") != segment_id]

        # Lưu lại dubbed_segments.json
        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

        # Cập nhật lại file phụ đề subtitles.srt
        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"🗑️ [Studio Delete] Đã xóa câu #{segment_id} khỏi timeline tác vụ {task_id}")
        return {
            "status": "ok",
            "segment_id": segment_id,
            "remaining_segments": len(segments),
            "message": f"Đã xóa câu #{segment_id} thành công!",
        }

    @classmethod
    async def add_segment(
        cls,
        task_id: str,
        text: str,
        after_segment_id: int | None = None,
        start: float | None = None,
        end: float | None = None,
        voice_id: str | None = None,
        engine: str | None = None,
        voice_rate: str | None = None,
        voice_pitch: str | None = None,
        voice_volume: float | None = None,
    ) -> dict[str, Any]:
        """
        Chèn thêm 1 câu thoại mới vào timeline Studio tại vị trí bất kỳ,
        tự động sinh âm thanh thuyết minh AI ngay lập tức (~0.5s) và cập nhật phụ đề SRT.
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        clean_text = text.strip()
        if not clean_text:
            raise RuntimeError("Nội dung câu nói không được để trống.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        # 1. Xác định mốc thời gian start & end hợp lý nếu người dùng không chỉ định
        calc_start = float(start) if start is not None else None
        calc_end = float(end) if end is not None else None

        if calc_start is None:
            if after_segment_id:
                prev_s = next((s for s in segments if s.get("id") == after_segment_id), None)
                calc_start = float(prev_s.get("end", 0.0)) + 0.1 if prev_s else 0.0
            elif segments:
                calc_start = float(segments[-1].get("end", 0.0)) + 0.1
            else:
                calc_start = 0.0

        if calc_end is None or calc_end <= calc_start:
            # Ước lượng thời lượng theo độ dài từ vựng (trung bình ~0.35s/từ, tối thiểu 1.5s)
            word_count = len(clean_text.split())
            calc_end = round(calc_start + max(1.5, word_count * 0.35 + 0.3), 3)

        calc_start = max(0.0, round(calc_start, 3))
        calc_end = max(calc_start + 0.1, round(calc_end, 3))
        target_duration = max(0.1, calc_end - calc_start)

        # 2. Sinh ID mới cho segment và tạo file âm thanh
        new_id = max([s.get("id", 0) for s in segments], default=0) + 1
        session_dir = DUBBING_OUTPUT_DIR / task_id
        session_dir.mkdir(parents=True, exist_ok=True)
        seg_file = session_dir / f"seg_{new_id:04d}.mp3"

        v_id = voice_id or task_meta.get("voice_id", "vi-VN-HoaiMyNeural")
        eng = engine or task_meta.get("engine", "edge-tts")
        v_rate = voice_rate or "+0%"
        v_pitch = voice_pitch or "+0Hz"
        v_vol = f"+{int(voice_volume*100)}%" if voice_volume is not None else "+0%"

        # Gọi synthesize_single để tạo file âm thanh cho câu mới
        res = await DubbingService.synthesize_single(
            text=clean_text,
            voice_id=v_id,
            engine=eng,
            rate=v_rate,
            pitch=v_pitch,
            volume=v_vol,
            output_path=seg_file,
            target_duration=target_duration,
        )

        ts = int(time.time() * 1000)
        new_segment = {
            "id": new_id,
            "start": calc_start,
            "end": calc_end,
            "text": clean_text,
            "original_text": "",
            "audio_path": str(seg_file),
            "audio_url": f"/outputs/dubbing/{task_id}/{seg_file.name}?t={ts}",
            "audio_duration": res["duration"],
            "target_duration": target_duration,
            "rate_ratio": res.get("rate_ratio", 1.0),
        }

        # 3. Chèn vào danh sách và sắp xếp lại theo timeline start
        segments.append(new_segment)
        segments.sort(key=lambda s: float(s.get("start", 0.0)))

        # 4. Lưu lại dubbed_segments.json và subtitles.srt
        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")
        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"✨ [Studio Add] Đã chèn câu #{new_id} thành công tại [{calc_start}s -> {calc_end}s]: '{clean_text}'")
        return {
            "status": "ok",
            "segment_id": new_id,
            "segment": new_segment,
            "total_segments": len(segments),
            "message": f"Đã chèn câu thoại mới thành công!",
        }

    @classmethod
    async def quick_remux_video(
        cls,
        task_id: str,
        subtitle_mode: str | None = None,
        preserve_bgm: bool | None = None,
        bgm_type: str | None = None,
        bgm_volume: float | None = None,
        voice_volume: float | None = None,
        max_speed_rate: float | None = None,
        output_resolution: str | None = None,
        font_size: int | None = None,
        margin_v: int | None = None,
        alignment: int | None = None,
    ) -> dict[str, Any]:
        """
        Trộn lại âm thanh và ghép video siêu tốc (chỉ 2-5 giây) sau khi người dùng sửa câu trong Studio.
        Không cần chạy lại TTS toàn bộ, tận dụng các file audio đã có.
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        # Tìm video gốc
        video_path = None
        task = cls.get_task(task_id) or {}
        if task.get("video_path") and Path(task.get("video_path")).exists():
            video_path = Path(task.get("video_path"))
        else:
            for f in task_dir.glob("input_*.*"):
                if f.is_file():
                    video_path = f
                    break

        if not video_path or not video_path.exists():
            raise RuntimeError("Không tìm thấy video gốc để ráp nối.")

        raw_audio_path = task_dir / "raw_audio.wav"
        if raw_audio_path.exists():
            video_duration = get_audio_duration(raw_audio_path)
        else:
            video_duration = get_audio_duration(video_path)

        sub_mode = subtitle_mode or task_meta.get("subtitle_mode", "hard_target")
        p_bgm = preserve_bgm if preserve_bgm is not None else task_meta.get("preserve_bgm", True)
        b_type = bgm_type or task_meta.get("bgm_type", "bgm")
        b_vol = bgm_volume if bgm_volume is not None else float(task_meta.get("bgm_volume", 0.30))
        v_vol = voice_volume if voice_volume is not None else float(task_meta.get("voice_volume", 1.0))
        max_speed = max_speed_rate if max_speed_rate is not None else float(task_meta.get("max_speed_rate", 1.35))
        out_res = output_resolution or task_meta.get("output_resolution", "720p")
        f_size = font_size if font_size is not None else int(task_meta.get("font_size") or 20)
        m_v = margin_v if margin_v is not None else int(task_meta.get("margin_v") or 30)
        align = alignment if alignment is not None else int(task_meta.get("alignment") or 2)

        bgm_path = task_dir / "no_vocals.wav"
        if not bgm_path.exists():
            bgm_path = task_dir / "bgm.wav"
        if not bgm_path.exists():
            bgm_path = DUBBING_OUTPUT_DIR / task_id / "bgm.wav"
        if not bgm_path.exists() and (task_dir / "bgm_raw.wav").exists():
            bgm_path = task_dir / "bgm_raw.wav"
        if not bgm_path.exists() and p_bgm:
            raw_audio = task_dir / "raw_audio.wav"
            if not raw_audio.exists():
                extract_audio(video_path, raw_audio)
            vocal_res = separate_vocals_demucs(raw_audio, task_dir, enable_demucs=True)
            bgm_path = vocal_res.get("bgm", raw_audio)

        # Chọn dải âm thanh nền phù hợp: "original" (âm thanh gốc), "bgm" (nhạc nền tách vocal), hoặc "none"
        selected_bgm_path = None
        if p_bgm and b_type != "none":
            if b_type == "original" and raw_audio_path and raw_audio_path.exists():
                selected_bgm_path = str(raw_audio_path)
            elif bgm_path and bgm_path.exists():
                selected_bgm_path = str(bgm_path)

        # 1. Ráp timeline audio siêu nhanh từ các file seg_xxxx.mp3 đã có
        timeline_res = AlignmentService.build_full_timeline(
            segments=segments,
            total_video_duration=video_duration,
            max_speed_rate=max_speed,
            bgm_path=selected_bgm_path,
            bgm_volume=b_vol,
            voice_volume=v_vol,
            session_id=task_id,
        )
        final_audio_path = Path(timeline_res["final_audio_path"])

        # 2. Cập nhật lại file phụ đề subtitles.srt
        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=sub_mode)

        # 3. FFmpeg ghép nhanh
        output_video_path = task_dir / "final_translated.mp4"
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-i", str(final_audio_path),
        ]

        scale_filter = get_ffmpeg_scale_filter(out_res)

        if sub_mode in ["hard_target", "hard_dual"]:
            srt_escaped = str(srt_file).replace("\\", "/").replace(":", "\\:")
            style_str = f"FontSize={f_size},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment={align},MarginV={m_v}"
            vf_filters = []
            if scale_filter:
                vf_filters.append(scale_filter)
            vf_filters.append(f"subtitles='{srt_escaped}':charenc=UTF-8:force_style='{style_str}'")

            ffmpeg_cmd.extend(["-vf", ",".join(vf_filters)])
            ffmpeg_cmd.extend([
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "veryfast",
                "-crf", "20",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                "-movflags", "+faststart",
                str(output_video_path),
            ])
        else:
            if scale_filter:
                ffmpeg_cmd.extend([
                    "-vf", scale_filter,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-preset", "veryfast",
                    "-crf", "20",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    "-movflags", "+faststart",
                    str(output_video_path),
                ])
            else:
                ffmpeg_cmd.extend([
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    "-movflags", "+faststart",
                    str(output_video_path),
                ])

        logger.info(f"[Studio Remux] FFmpeg cmd: {' '.join(ffmpeg_cmd)}")
        res = await asyncio.to_thread(subprocess.run, ffmpeg_cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg remux thất bại: {res.stderr}")

        ts = int(time.time() * 1000)
        rel_video_url = f"/api/video-translate/stream/{task_id}?t={ts}"
        rel_audio_url = f"/outputs/alignment/{task_id}/{final_audio_path.name}?t={ts}"
        cls.update_task(
            task_id,
            video_url=rel_video_url,
            audio_url=rel_audio_url,
            output_resolution=out_res,
            message="🎉 Đã xuất bản video thành phẩm mới với các thiết lập tùy chỉnh!",
        )

        return {
            "status": "completed",
            "video_url": rel_video_url,
            "audio_url": rel_audio_url,
            "output_resolution": out_res,
            "message": "Xuất bản video thành công!",
        }

