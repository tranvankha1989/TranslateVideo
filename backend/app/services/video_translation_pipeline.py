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
from pathlib import Path
from typing import Any

from app.core.config import OUTPUTS_DIR, logger
from app.services.dubbing_service import DubbingService, get_audio_duration, DUBBING_OUTPUT_DIR
from app.services.translator_service import TranslationService, GoogleTranslator
from app.services.alignment_service import AlignmentService
from caption_handler import extract_audio, get_whisper_model

TRANSLATE_OUTPUT_DIR = OUTPUTS_DIR / "video_translate"
TRANSLATE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Bộ nhớ lưu trạng thái tiến trình các tác vụ dịch video
_TASK_STORE: dict[str, dict[str, Any]] = {}


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
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
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
    output_srt_path.write_text(content, encoding="utf-8")
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
        """Quét toàn bộ thư mục outputs/video_translate để trả về danh sách dự án dịch video."""
        projects = []
        if not TRANSLATE_OUTPUT_DIR.exists():
            return []

        for folder in TRANSLATE_OUTPUT_DIR.iterdir():
            if not folder.is_dir():
                continue
            task_id = folder.name
            meta_file = folder / "task_meta.json"
            meta = {}
            if meta_file.exists():
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                except Exception:
                    pass

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

            projects.append({
                "task_id": task_id,
                "video_name": video_name,
                "source_lang": meta.get("source_lang", meta.get("detected_source_lang", "auto")),
                "target_lang": meta.get("target_lang", "vi"),
                "voice_id": meta.get("voice_id", "vi-VN-HoaiMyNeural"),
                "engine": meta.get("engine", "edge-tts"),
                "status": status,
                "progress": meta.get("progress", 100 if final_video.exists() else 0),
                "created_at": float(created_at),
                "duration": float(meta.get("video_duration", 0.0)),
                "elapsed_str": meta.get("elapsed_str"),
                "output_resolution": meta.get("output_resolution", "720p"),
                "video_url": f"/api/video-translate/stream/{task_id}" if final_video.exists() else None,
                "subtitles_srt_url": f"/outputs/video_translate/{task_id}/{srt_target.name}" if srt_target.exists() else None,
                "subtitles_original_srt_url": f"/outputs/video_translate/{task_id}/{srt_orig.name}" if srt_orig.exists() else None,
                "file_size_mb": file_size_mb,
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
        source_lang: str = "auto",
        target_lang: str = "vi",
        voice_id: str = "vi-VN-HoaiMyNeural",
        engine: str = "edge-tts",
        voice_rate: str = "+0%",
        voice_pitch: str = "+0Hz",
        voice_volume: float = 1.0,
        preserve_bgm: bool = True,
        bgm_volume: float = 0.25,
        subtitle_mode: str = "hard_target",
        max_speed_rate: float = 1.35,
        translation_provider: str = "google",
        translation_api_key: str | None = None,
        translation_style: str = "auto",
        translation_model: str = "gemini-2.5-flash",
        translation_temperature: float = 0.2,
        whisper_model: str = "large-v3",
        output_resolution: str = "720p",
        clip_start: float = 0.0,
        clip_end: float | None = None,
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

                if preserve_bgm:
                    bgm_raw = task_dir / "bgm.wav"
                    # Trích xuất đồng thời BGM 44.1kHz stereo và raw_audio 16kHz mono trong 1 lệnh duy nhất
                    cmd_single_pass = [
                        "ffmpeg", "-y",
                        "-threads", "0",
                        "-i", str(video_path),
                        "-vn", "-sn", "-dn",
                        "-map", "0:a:0?",
                        "-acodec", "pcm_s16le",
                        "-ar", "44100",
                        "-ac", "2",
                        str(bgm_raw),
                        "-map", "0:a:0?",
                        "-acodec", "pcm_s16le",
                        "-ar", "16000",
                        "-ac", "1",
                        str(raw_audio),
                    ]
                    res = subprocess.run(cmd_single_pass, capture_output=True, text=True)
                    if res.returncode != 0 or not raw_audio.exists() or raw_audio.stat().st_size == 0:
                        # Fallback nếu video thiếu stream phức tạp
                        extract_audio(video_path, raw_audio)
                        if raw_audio.exists() and raw_audio.stat().st_size > 0:
                            import shutil
                            shutil.copyfile(raw_audio, bgm_raw)

                    bgm = bgm_raw if bgm_raw.exists() else None
                else:
                    extract_audio(video_path, raw_audio)

                dur = get_audio_duration(raw_audio)
                return raw_audio, bgm, dur

            cls.update_task(
                task_id,
                progress=10,
                current_step="extracting",
                message="Đang trích xuất luồng âm thanh và phân tích nhạc nền từ video (FFmpeg)...",
            )

            raw_audio_path, bgm_path, video_duration = await asyncio.to_thread(do_extract_and_prepare_audio)
            cls.update_task(
                task_id,
                video_duration=video_duration,
                raw_audio_path=str(raw_audio_path) if raw_audio_path else None,
                bgm_path=str(bgm_path) if bgm_path else None,
            )

            # ── BƯỚC 2: BÓC BĂNG PHỤ ĐỀ GỐC BẰNG WHISPER (15% -> 40%) ──────
            cls.update_task(
                task_id,
                progress=18,
                current_step="transcribing",
                message=f"Đã trích xuất âm thanh ({round(video_duration, 1)}s). Đang khởi chạy Faster-Whisper ({whisper_model.upper()}) bóc tách thoại gốc...",
            )

            lang_arg = None if source_lang == "auto" else source_lang.split("-")[0]

            # Chạy whisper và nạp mô hình trong thread riêng để không block event loop
            def run_whisper():
                logger.info(
                    f"🎙️ [Whisper STT] Bắt đầu bóc băng video gốc '{video_path.name}' bằng mô hình '{whisper_model.upper()}' (Audio: {raw_audio_path.name}, Lang: {lang_arg or 'auto'})"
                )
                whisper = get_whisper_model(whisper_model)
                initial_prompt = None
                if lang_arg == "zh":
                    initial_prompt = "这是一段影视对白，包含口语、人名与专有名词。请使用简体中文和正确的现代标点符号完整记录。"
                elif lang_arg == "vi":
                    initial_prompt = "Đây là đoạn hội thoại video tiếng Việt, xin hãy ghi lại đầy đủ và chính xác với dấu câu."
                elif lang_arg == "en":
                    initial_prompt = "This is a movie dialogue. Please transcribe accurately with proper capitalization and punctuation."

                segs, info = whisper.transcribe(
                    str(raw_audio_path),
                    language=lang_arg,
                    initial_prompt=initial_prompt,
                    beam_size=3,
                    best_of=3,
                    condition_on_previous_text=False,
                    repetition_penalty=1.2,
                    no_speech_threshold=0.6,
                    compression_ratio_threshold=2.4,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400),
                )
                return list(segs), info.language

            cls.update_task(
                task_id,
                progress=22,
                current_step="transcribing",
                message="Faster-Whisper AI đang lắng nghe và bóc tách từng mốc thời gian câu thoại...",
            )

            segments_raw, detected_lang = await asyncio.to_thread(run_whisper)
            detected_source_lang = source_lang if source_lang != "auto" else detected_lang

            original_segments = []
            for s in segments_raw:
                txt = s.text.strip()
                if not txt:
                    continue
                # Chống ảo giác lặp lại liên tiếp (Whisper Hallucination Repetition Loop)
                if original_segments and txt.lower() == original_segments[-1]["text"].lower():
                    logger.warning(f"[Whisper Hallucination Filter] Bỏ qua câu lặp ảo giác liên tiếp: '{txt}' tại [{s.start:.2f}s -> {s.end:.2f}s]")
                    continue

                original_segments.append({
                    "id": len(original_segments) + 1,
                    "start": round(s.start, 3),
                    "end": round(s.end, 3),
                    "text": txt,
                })

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
                message=f"Đã nhận diện {len(original_segments)} câu thoại gốc.",
            )

            # ── BƯỚC 3: DỊCH PHỤ ĐỀ SANG NGÔN NGỮ ĐÍCH (40% -> 55%) ────────
            cls.update_task(
                task_id,
                progress=40,
                current_step="translating",
                message=f"Đang chuẩn bị gửi AI dịch {len(original_segments)} câu thoại...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

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

            for i, ts in enumerate(translated_segments):
                if i < len(original_segments):
                    ts["original_text"] = original_segments[i].get("text", "")

            # ── BƯỚC 4: LỒNG TIẾNG TỰ ĐỘNG (55% -> 75%) ───────────────────
            cls.update_task(
                task_id,
                progress=55,
                current_step="dubbing",
                message=f"Bắt đầu lồng tiếng {len(translated_segments)} câu bằng giọng '{voice_id}'...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

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
            )

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
                "bgm_volume": bgm_volume,
                "bgm_path": str(bgm_path) if bgm_path else None,
                "subtitle_mode": subtitle_mode,
                "max_speed_rate": max_speed_rate,
                "detected_source_lang": detected_source_lang,
                "target_lang": target_lang,
                "output_resolution": output_resolution,
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

            timeline_res = AlignmentService.build_full_timeline(
                segments=dub_res["dubbed_segments"],
                total_video_duration=video_duration,
                max_speed_rate=max_speed_rate,
                bgm_path=bgm_path if preserve_bgm else None,
                bgm_volume=bgm_volume,
                voice_volume=voice_volume,
                session_id=task_id,
            )
            final_audio_path = Path(timeline_res["final_audio_path"])

            # ── BƯỚC 6: XUẤT PHỤ ĐỀ VÀ RENDER VIDEO MP4 (85% -> 100%) ───────
            cls.update_task(
                task_id,
                progress=85,
                current_step="rendering",
                message=f"Đang nén chuẩn H.264 và render video MP4 ({output_resolution.upper()}) hoàn chỉnh (FFmpeg)...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            # Xuất đồng thời cả file phụ đề dịch và file phụ đề gốc để đối chiếu kiểm tra
            srt_orig_file = task_dir / "subtitles_original.srt"
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")

            srt_file = task_dir / "subtitles.srt"
            generate_srt_file(translated_segments, srt_file, mode=subtitle_mode)

            # Lưu bản chụp phụ đề AI dịch ban đầu để làm căn cứ học tập khi người dùng chỉnh sửa
            srt_initial_file = task_dir / "subtitles_ai_initial.srt"
            generate_srt_file(translated_segments, srt_initial_file, mode=subtitle_mode)

            output_video_path = task_dir / "final_translated.mp4"

            # Xây dựng lệnh FFmpeg ghép video + âm thanh mới + phụ đề (nếu bật) + scale theo độ phân giải
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(final_audio_path),
            ]

            scale_filter = get_ffmpeg_scale_filter(output_resolution)

            if subtitle_mode in ["hard_target", "hard_dual"]:
                # Chuẩn hóa đường dẫn cho bộ lọc subtitles của FFmpeg trên Windows
                srt_escaped = str(srt_file.resolve()).replace("\\", "/").replace(":", "\\:")
                style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30"
                sub_filter = f"subtitles='{srt_escaped}':force_style='{style_str}'"
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
                    # Siêu tốc (Stream Copy): Khi không khắc phụ đề và giữ nguyên độ phân giải
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

            logger.info(f"[VideoTranslationPipeline] Chạy FFmpeg render: {' '.join(ffmpeg_cmd)}")
            res = await asyncio.to_thread(subprocess.run, ffmpeg_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg render thất bại: {res.stderr}")

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
            logger.info(f"✅ [Task {task_id}] Hoàn tất video translation ({total_elapsed_str}): {output_video_path}")

        except Exception as e:
            logger.error(f"❌ [Task {task_id}] Thất bại: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi: {str(e)}",
                error=str(e),
            )

    @classmethod
    async def run_manual_transcribe(
        cls,
        task_id: str,
        video_path: Path,
        source_lang: str = "auto",
        whisper_model: str = "large-v3",
        clip_start: float = 0.0,
        clip_end: float | None = None,
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
                "target_lang": "vi",
                "whisper_model": whisper_model,
                "start_time": clip_start,
                "end_time": clip_end,
                "is_manual_mode": True,
            }
            cls.update_task(task_id, **task_config)

            # BƯỚC 1: Trích xuất âm thanh
            raw_audio = task_dir / "raw_audio.wav"
            bgm_raw = task_dir / "bgm_raw.wav"

            def do_extract():
                extract_audio(video_path, raw_audio)
                if raw_audio.exists() and raw_audio.stat().st_size > 0:
                    import shutil
                    shutil.copyfile(raw_audio, bgm_raw)
                dur = get_audio_duration(raw_audio)
                return raw_audio, bgm_raw, dur

            cls.update_task(
                task_id,
                progress=15,
                current_step="extracting",
                message="Đang trích xuất luồng âm thanh từ video...",
                _start_time=start_time,
                created_at=start_time,
            )
            raw_audio_path, bgm_path, video_duration = await asyncio.to_thread(do_extract)
            cls.update_task(
                task_id,
                video_duration=video_duration,
                raw_audio_path=str(raw_audio_path),
                bgm_path=str(bgm_path),
            )

            # BƯỚC 2: Whisper tạo phụ đề gốc
            cls.update_task(
                task_id,
                progress=35,
                current_step="transcribing",
                message=f"Đang tạo phụ đề thoại gốc bằng Faster-Whisper ({whisper_model.upper()})...",
            )
            lang_arg = None if source_lang == "auto" else source_lang.split("-")[0]

            def run_whisper():
                logger.info(f"🎙️ [Manual Whisper STT] Bắt đầu tạo phụ đề gốc video '{video_path.name}' bằng '{whisper_model}'")
                whisper = get_whisper_model(whisper_model)
                initial_prompt = None
                if lang_arg == "zh":
                    initial_prompt = "这是一段影视对白，包含口语、人名与专有名词。请使用简体中文和正确的现代标点符号完整记录。"
                elif lang_arg == "vi":
                    initial_prompt = "Đây là đoạn hội thoại video tiếng Việt, xin hãy ghi lại đầy đủ và chính xác với dấu câu."
                elif lang_arg == "en":
                    initial_prompt = "This is a movie dialogue. Please transcribe accurately with proper capitalization and punctuation."

                segs, info = whisper.transcribe(
                    str(raw_audio_path),
                    language=lang_arg,
                    initial_prompt=initial_prompt,
                    beam_size=3,
                    best_of=3,
                    condition_on_previous_text=False,
                    repetition_penalty=1.2,
                    no_speech_threshold=0.6,
                    compression_ratio_threshold=2.4,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=400),
                )
                return list(segs), info.language

            segments_raw, detected_lang = await asyncio.to_thread(run_whisper)
            detected_source_lang = source_lang if source_lang != "auto" else detected_lang

            original_segments = []
            for s in segments_raw:
                txt = s.text.strip()
                if not txt:
                    continue
                if original_segments and txt.lower() == original_segments[-1]["text"].lower():
                    continue
                original_segments.append({
                    "id": len(original_segments) + 1,
                    "start": round(s.start, 3),
                    "end": round(s.end, 3),
                    "text": txt,
                })

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
            logger.info(f"✅ [Task {task_id}] Hoàn tất tạo phụ đề gốc thủ công ({total_elapsed_str}): {srt_orig_file}")
        except Exception as e:
            logger.error(f"❌ [Task {task_id}] Lỗi tạo phụ đề gốc: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi tạo phụ đề gốc: {str(e)}",
                error=str(e),
            )

    @classmethod
    def clean_subtitle_text(cls, text: str) -> str:
        """Làm sạch văn bản phụ đề: loại bỏ citation [cite: 3], [1], 【...】, markdown bold/italic."""
        if not text:
            return ""
        # 1. Bỏ trích dẫn AI [cite: 3], [cite: 1, 2], [1], 【3†source】
        text = re.sub(r"\[cite:\s*[\d,\s]+\]", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\[\d+\]", "", text)
        text = re.sub(r"【[^】]+】", "", text)
        # 2. Bỏ định dạng markdown bold / italic
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        text = re.sub(r"\*([^*]+)\*", r"\1", text)
        text = re.sub(r"`([^`]+)`", r"\1", text)
        # 3. Chuẩn hóa khoảng trắng
        text = " ".join(text.split())
        return text.strip()

    @classmethod
    def parse_srt_content(cls, content: str) -> list[dict[str, Any]]:
        """
        Phân tích nội dung file SRT siêu mạnh mẽ:
        - Tự động gỡ bỏ UTF-8 BOM, ký tự xuống dòng Windows CRLF / CR.
        - Tự động bóc tách và loại bỏ code block markdown (```srt ... ```) và lời bình luận mở đầu/kết thúc của AI.
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
        bgm_volume: float | None = None,
        subtitle_mode: str | None = None,
        max_speed_rate: float | None = None,
        output_resolution: str | None = None,
    ) -> None:
        """
        Lồng tiếng và render lại video từ file phụ đề .srt (Chế độ thủ công hoặc Re-dub từ Studio).
        Tối ưu siêu tốc vì tái sử dụng audio/video gốc đã có sẵn.
        """
        start_time = time.time()
        try:
            task = cls.get_task(task_id) or {}
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            if not task_dir.exists():
                raise RuntimeError(f"Tác vụ {task_id} không tồn tại trên hệ thống.")

            srt_file = task_dir / "subtitles.srt"
            if srt_content is not None and srt_content.strip():
                srt_file.write_text(srt_content.strip(), encoding="utf-8")

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
            b_vol = bgm_volume if bgm_volume is not None else float(task.get("bgm_volume", 0.25))
            sub_mode = subtitle_mode or task.get("subtitle_mode", "hard_target")
            max_speed = max_speed_rate if max_speed_rate is not None else float(task.get("max_speed_rate", 1.35))
            out_res = output_resolution or task.get("output_resolution", "720p")

            # Tìm video gốc
            video_path_str = task.get("video_path")
            video_path = Path(video_path_str) if video_path_str else None
            if not video_path or not video_path.exists():
                for f in task_dir.glob("input_*.*"):
                    if f.is_file():
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
                "bgm_volume": b_vol,
                "subtitle_mode": sub_mode,
                "max_speed_rate": max_speed,
                "output_resolution": out_res,
            }
            try:
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

            bgm_path = DUBBING_OUTPUT_DIR / task_id / "bgm.wav"
            if not bgm_path.exists() and (task_dir / "bgm_raw.wav").exists():
                bgm_path = task_dir / "bgm_raw.wav"
            elif not bgm_path.exists() and (task_dir / "bgm.wav").exists():
                bgm_path = task_dir / "bgm.wav"
            elif not bgm_path.exists() and p_bgm:
                vocal_res = await asyncio.to_thread(DubbingService.separate_vocal_bgm, video_path, session_id=task_id)
                bgm_path = Path(vocal_res.get("bgm_audio", ""))

            timeline_res = AlignmentService.build_full_timeline(
                segments=dub_res["dubbed_segments"],
                total_video_duration=video_duration,
                max_speed_rate=max_speed,
                bgm_path=str(bgm_path) if (p_bgm and bgm_path and bgm_path.exists()) else None,
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
                style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30"
                sub_filter = f"subtitles='{srt_escaped}':force_style='{style_str}'"
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
                        "-c:v", "copy",
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
        except Exception as e:
            logger.error(f"❌ [Task {task_id}] Lồng tiếng / Render thất bại: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi: {str(e)}",
                error=str(e),
            )

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
            "audio_url": task.get("audio_url"),
            "segments": segments,
            "meta": {
                "voice_id": task_meta.get("voice_id") or task.get("voice_id", "vi-VN-HoaiMyNeural"),
                "engine": task_meta.get("engine") or task.get("engine", "edge-tts"),
                "preserve_bgm": task_meta.get("preserve_bgm", task.get("preserve_bgm", True)),
                "bgm_volume": task_meta.get("bgm_volume", task.get("bgm_volume", 0.25)),
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

        initial_len = len(segments)
        segments = [s for s in segments if s.get("id") != segment_id]
        if len(segments) == initial_len:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id} để xóa")

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
    async def quick_remux_video(
        cls,
        task_id: str,
        subtitle_mode: str | None = None,
        preserve_bgm: bool | None = None,
        bgm_volume: float | None = None,
        voice_volume: float | None = None,
        max_speed_rate: float | None = None,
        output_resolution: str | None = None,
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
        b_vol = bgm_volume if bgm_volume is not None else float(task_meta.get("bgm_volume", 0.25))
        v_vol = voice_volume if voice_volume is not None else float(task_meta.get("voice_volume", 1.0))
        max_speed = max_speed_rate if max_speed_rate is not None else float(task_meta.get("max_speed_rate", 1.35))
        out_res = output_resolution or task_meta.get("output_resolution", "720p")

        bgm_path = task_dir / "bgm.wav"
        if not bgm_path.exists():
            bgm_path = DUBBING_OUTPUT_DIR / task_id / "bgm.wav"
        if not bgm_path.exists() and p_bgm:
            vocal_res = await asyncio.to_thread(DubbingService.separate_vocal_bgm, video_path, session_id=task_id)
            bgm_path = Path(vocal_res.get("bgm_audio", ""))

        # 1. Ráp timeline audio siêu nhanh từ các file seg_xxxx.mp3 đã có
        timeline_res = AlignmentService.build_full_timeline(
            segments=segments,
            total_video_duration=video_duration,
            max_speed_rate=max_speed,
            bgm_path=str(bgm_path) if (p_bgm and bgm_path.exists()) else None,
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
            style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30"
            vf_filters = []
            if scale_filter:
                vf_filters.append(scale_filter)
            vf_filters.append(f"subtitles='{srt_escaped}':force_style='{style_str}'")

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

