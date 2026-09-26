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
    """Tạo file phụ đề SRT (hỗ trợ đơn ngữ hoặc song ngữ)."""
    output_srt_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []

    for i, seg in enumerate(segments):
        start_str = format_srt_time(float(seg.get("start", 0.0)))
        end_str = format_srt_time(float(seg.get("end", 0.0)))
        text_target = seg.get("text", "").strip()
        text_orig = seg.get("original_text", "").strip()

        if mode == "hard_dual" and text_orig:
            display_text = f"{text_target}\n{text_orig}"
        else:
            display_text = text_target

        lines.append(f"{i + 1}")
        lines.append(f"{start_str} --> {end_str}")
        lines.append(display_text)
        lines.append("")

    content = "\n".join(lines)
    output_srt_path.write_text(content, encoding="utf-8")
    return output_srt_path


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
                    json.dump(_TASK_STORE[task_id], f, ensure_ascii=False, indent=2)
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
        pause_for_review: bool = False,
    ) -> None:
        start_time = time.time()
        try:
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)

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
                "pause_for_review": pause_for_review,
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
                message=f"Đã trích xuất âm thanh ({round(video_duration, 1)}s). Đang khởi chạy Faster-Whisper AI nhận dạng giọng nói...",
            )

            lang_arg = None if source_lang == "auto" else source_lang.split("-")[0]

            # Chạy whisper và nạp mô hình trong thread riêng để không block event loop
            def run_whisper():
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
                    beam_size=5,
                    best_of=5,
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

            # Nếu người dùng chọn Quy trình 2 bước: Tạm dừng để duyệt câu gốc trước khi dịch
            if pause_for_review:
                # Tự động tạo bản dịch nháp tiếng Việt nhanh (qua GoogleTranslator miễn phí, mất < 1 giây) để người dùng đối chiếu song ngữ
                try:
                    raw_texts = [seg["text"] for seg in original_segments]
                    draft_vi_texts = await GoogleTranslator.translate_batch_texts(
                        raw_texts,
                        source_lang=detected_source_lang,
                        target_lang=target_lang,
                    )
                    bilingual_data = []
                    for seg, vi_text in zip(original_segments, draft_vi_texts):
                        bilingual_data.append({
                            "id": seg["id"],
                            "start": seg["start"],
                            "end": seg["end"],
                            "source_text": seg["text"],
                            "target_text": vi_text,
                        })
                    bilingual_file = task_dir / "bilingual_review.json"
                    with open(bilingual_file, "w", encoding="utf-8") as f:
                        json.dump(bilingual_data, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    logger.warning(f"Lỗi tạo bản dịch nháp song ngữ đối chiếu: {e}")

                cls.update_task(
                    task_id,
                    status="paused_for_review",
                    progress=40,
                    current_step="review_original",
                    message=f"Đã bóc băng {len(original_segments)} câu gốc. Đang tạm dừng để bạn đối chiếu song ngữ Trung - Việt trước khi dịch.",
                    elapsed_time=round(time.time() - start_time, 1),
                    elapsed_str=format_duration_vietnamese(time.time() - start_time),
                )
                logger.info(f"⏸️ [Task {task_id}] Đã tạm dừng quy trình để người dùng đối chiếu song ngữ Trung - Việt.")
                return

            # ── BƯỚC 3: DỊCH PHỤ ĐỀ SANG NGÔN NGỮ ĐÍCH (40% -> 55%) ────────
            cls.update_task(task_id, progress=45, current_step="translating", message="Đang dịch phụ đề qua AI...")

            translated_segments = await TranslationService.translate_segments(
                segments=original_segments,
                source_lang=detected_source_lang,
                target_lang=target_lang,
                provider=translation_provider,
                api_key=translation_api_key,
                style=translation_style,
                model=translation_model,
                temperature=translation_temperature,
            )

            # ── BƯỚC 4: LỒNG TIẾNG TỰ ĐỘNG (55% -> 75%) ───────────────────
            cls.update_task(
                task_id,
                progress=55,
                current_step="dubbing",
                message=f"Đang lồng tiếng {len(translated_segments)} câu bằng giọng '{voice_id}'...",
            )

            dub_res = await DubbingService.synthesize_batch(
                segments=translated_segments,
                voice_id=voice_id,
                engine=engine,
                rate=voice_rate,
                pitch=voice_pitch,
                session_id=task_id,
            )

            # ── BƯỚC 5: CÂN CHỈNH TỐC ĐỘ VÀ RÁP NỐI TIMELINE (75% -> 85%) ───
            cls.update_task(
                task_id,
                progress=75,
                current_step="aligning",
                message="Đang cân chỉnh tốc độ (SpeedRate) và hòa âm dải âm thanh khớp khung hình...",
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
                message="Đang ghép âm thanh và render video MP4 hoàn chỉnh...",
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

            # Xây dựng lệnh FFmpeg ghép video + âm thanh mới + phụ đề (nếu bật)
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(final_audio_path),
            ]

            if subtitle_mode in ["hard_target", "hard_dual"]:
                # Chuẩn hóa đường dẫn cho bộ lọc subtitles của FFmpeg trên Windows
                srt_escaped = str(srt_file).replace("\\", "/").replace(":", "\\:")
                style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30"
                ffmpeg_cmd.extend(["-vf", f"subtitles='{srt_escaped}':force_style='{style_str}'"])
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
                # Siêu tốc (Stream Copy): Khi không khắc phụ đề, chỉ copy hình ảnh gốc (render xong trong 2-3s!)
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
    async def resume_pipeline(
        cls,
        task_id: str,
        srt_content: str | None = None,
        bilingual_segments: list[dict[str, Any]] | None = None,
        use_user_translations: bool = False,
    ) -> None:
        """
        Tiếp tục quy trình từ Bước 3 (Dịch thuật) sau khi người dùng đã duyệt và chỉnh sửa câu gốc.
        """
        task = cls.get_task(task_id)
        if not task:
            raise RuntimeError(f"Không tìm thấy thông tin tác vụ {task_id}")

        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        srt_orig_file = task_dir / "subtitles_original.srt"

        # Nếu người dùng gửi danh sách song ngữ đối chiếu đã sửa
        if bilingual_segments:
            bilingual_file = task_dir / "bilingual_review.json"
            try:
                with open(bilingual_file, "w", encoding="utf-8") as f:
                    json.dump(bilingual_segments, f, ensure_ascii=False, indent=2)
            except Exception as e:
                logger.warning(f"Lỗi lưu bilingual_review.json: {e}")

            original_segments = [
                {
                    "id": item.get("id", i + 1),
                    "start": float(item.get("start", 0.0)),
                    "end": float(item.get("end", 0.0)),
                    "text": str(item.get("source_text", "")).strip(),
                }
                for i, item in enumerate(bilingual_segments)
            ]
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")
        elif srt_content is not None and srt_content.strip():
            srt_orig_file.write_text(srt_content.strip(), encoding="utf-8")
            original_segments = cls.parse_srt_file(srt_orig_file)
        else:
            original_segments = cls.parse_srt_file(srt_orig_file)

        if not original_segments:
            raise RuntimeError("Nội dung phụ đề câu gốc rỗng hoặc không đúng định dạng SRT.")

        start_time = task.get("_start_time", time.time())
        video_path_str = task.get("video_path")
        if not video_path_str:
            raise RuntimeError("Không tìm thấy đường dẫn video trong tác vụ.")
        video_path = Path(video_path_str)

        video_duration = float(task.get("video_duration", 0.0))
        if video_duration <= 0 and video_path.exists():
            video_duration = get_audio_duration(video_path)

        bgm_path = Path(task.get("bgm_path")) if task.get("bgm_path") else None
        detected_source_lang = task.get("detected_source_lang", task.get("source_lang", "zh-cn"))
        target_lang = task.get("target_lang", "vi")
        voice_id = task.get("voice_id", "vi-VN-HoaiMyNeural")
        engine = task.get("engine", "edge-tts")
        voice_rate = task.get("voice_rate", "+0%")
        voice_pitch = task.get("voice_pitch", "+0Hz")
        voice_volume = float(task.get("voice_volume", 1.0))
        preserve_bgm = bool(task.get("preserve_bgm", True))
        bgm_volume = float(task.get("bgm_volume", 0.25))
        subtitle_mode = task.get("subtitle_mode", "hard_target")
        max_speed_rate = float(task.get("max_speed_rate", 1.35))
        translation_provider = task.get("translation_provider", "google")
        translation_api_key = task.get("translation_api_key")
        translation_style = task.get("translation_style", "auto")
        translation_model = task.get("translation_model", "gemini-2.5-flash")
        translation_temperature = float(task.get("translation_temperature", 0.2))

        try:
            cls.update_task(
                task_id,
                status="processing",
                progress=45,
                current_step="translating",
                total_segments=len(original_segments),
                message=f"Đang dịch {len(original_segments)} câu gốc đã duyệt sang {target_lang} qua AI...",
            )

            # ── BƯỚC 3: DỊCH PHỤ ĐỀ SANG NGÔN NGỮ ĐÍCH (45% -> 55%) ────────
            if use_user_translations and bilingual_segments:
                translated_segments = [
                    {
                        "id": item.get("id", i + 1),
                        "start": float(item.get("start", 0.0)),
                        "end": float(item.get("end", 0.0)),
                        "text": str(item.get("target_text") or item.get("source_text", "")).strip(),
                    }
                    for i, item in enumerate(bilingual_segments)
                ]
            else:
                translated_segments = await TranslationService.translate_segments(
                    segments=original_segments,
                    source_lang=detected_source_lang,
                    target_lang=target_lang,
                    provider=translation_provider,
                    api_key=translation_api_key,
                    style=translation_style,
                    model=translation_model,
                    temperature=translation_temperature,
                )

            # ── BƯỚC 4: LỒNG TIẾNG TỰ ĐỘNG (55% -> 75%) ───────────────────
            cls.update_task(
                task_id,
                progress=55,
                current_step="dubbing",
                message=f"Đang lồng tiếng {len(translated_segments)} câu bằng giọng '{voice_id}'...",
            )

            dub_res = await DubbingService.synthesize_batch(
                segments=translated_segments,
                voice_id=voice_id,
                engine=engine,
                rate=voice_rate,
                pitch=voice_pitch,
                session_id=task_id,
            )

            # ── BƯỚC 5: CÂN CHỈNH TỐC ĐỘ VÀ RÁP NỐI TIMELINE (75% -> 85%) ───
            cls.update_task(
                task_id,
                progress=75,
                current_step="aligning",
                message="Đang cân chỉnh tốc độ (SpeedRate) và hòa âm dải âm thanh khớp khung hình...",
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
                message="Đang ghép âm thanh và render video MP4 hoàn chỉnh...",
            )

            srt_file = task_dir / "subtitles.srt"
            generate_srt_file(translated_segments, srt_file, mode=subtitle_mode)

            srt_initial_file = task_dir / "subtitles_ai_initial.srt"
            generate_srt_file(translated_segments, srt_initial_file, mode=subtitle_mode)

            output_video_path = task_dir / "final_translated.mp4"

            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(final_audio_path),
            ]

            if subtitle_mode in ["hard_target", "hard_dual"]:
                srt_escaped = str(srt_file).replace("\\", "/").replace(":", "\\:")
                style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30"
                ffmpeg_cmd.extend(["-vf", f"subtitles='{srt_escaped}':force_style='{style_str}'"])
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

            logger.info(f"[VideoTranslationPipeline:Resume] Chạy FFmpeg render: {' '.join(ffmpeg_cmd)}")
            res = await asyncio.to_thread(subprocess.run, ffmpeg_cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg render thất bại: {res.stderr}")

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
            logger.info(f"✅ [Task {task_id}] Hoàn tất resume video translation ({total_elapsed_str}): {output_video_path}")

        except Exception as e:
            logger.error(f"❌ [Task {task_id}] Thất bại khi resume: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi: {str(e)}",
                error=str(e),
            )

    @classmethod
    def parse_srt_content(cls, content: str) -> list[dict[str, Any]]:
        """Phân tích nội dung file SRT thành danh sách segments với mốc thời gian (giây)."""
        entries = []
        blocks = re.split(r"\n\s*\n", content.strip())
        for block in blocks:
            lines = [line.strip() for line in block.split("\n") if line.strip()]
            if len(lines) >= 2:
                try:
                    if lines[0].isdigit():
                        seg_id = int(lines[0])
                        time_line = lines[1]
                        text = " ".join(lines[2:])
                    else:
                        seg_id = len(entries) + 1
                        time_line = lines[0]
                        text = " ".join(lines[1:])

                    times = time_line.split("-->")
                    if len(times) == 2:
                        def parse_t(t_str: str) -> float:
                            t_str = t_str.strip().replace(",", ".")
                            parts = t_str.split(":")
                            return round(float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2]), 3)

                        start = parse_t(times[0])
                        end = parse_t(times[1])
                        if text:
                            entries.append({"id": seg_id, "start": start, "end": end, "text": text})
                except Exception as e:
                    logger.warning(f"Lỗi parse đoạn SRT '{block[:30]}...': {e}")
        return entries

    @classmethod
    def parse_srt_file(cls, srt_path: Path) -> list[dict[str, Any]]:
        """Đọc và parse file phụ đề .srt."""
        if not srt_path.exists():
            return []
        content = srt_path.read_text(encoding="utf-8")
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
    ) -> None:
        """
        Lồng tiếng và render lại video từ file phụ đề .srt đã được người dùng chỉnh sửa trong Notepad/Notepad++.
        Tối ưu siêu nhanh (chỉ mất ~10-20s) vì bỏ qua khâu bóc băng Whisper và trích xuất.
        """
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
            raise RuntimeError("Nội dung file phụ đề không hợp lệ hoặc không có câu thoại nào.")

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

        start_time = time.time()
        cls.update_task(
            task_id,
            status="processing",
            progress=20,
            current_step="dubbing",
            message=f"Đang lồng tiếng lại {len(segments)} câu từ file phụ đề đã chỉnh sửa...",
            total_segments=len(segments),
            _start_time=start_time,
            created_at=start_time,
            elapsed_time=round(time.time() - start_time, 1),
            elapsed_str=format_duration_vietnamese(time.time() - start_time),
        )

        try:
            # 1. Thu âm lại theo danh sách phụ đề đã sửa
            dub_res = await DubbingService.synthesize_batch(
                segments=segments,
                voice_id=v_id,
                engine=eng,
                rate=v_rate,
                pitch=v_pitch,
                session_id=task_id,
            )

            # 2. Cân chỉnh tốc độ & hòa âm thuyết minh
            cls.update_task(
                task_id,
                progress=65,
                current_step="aligning",
                message="Đang cân chỉnh tốc độ và hòa âm thuyết minh phim...",
            )

            bgm_path = DUBBING_OUTPUT_DIR / task_id / "bgm.wav"
            if not bgm_path.exists() and p_bgm:
                vocal_res = await asyncio.to_thread(DubbingService.separate_vocal_bgm, video_path, session_id=task_id)
                bgm_path = Path(vocal_res.get("bgm_audio", ""))

            timeline_res = AlignmentService.build_full_timeline(
                segments=dub_res["dubbed_segments"],
                total_video_duration=video_duration,
                max_speed_rate=max_speed,
                bgm_path=str(bgm_path) if (p_bgm and bgm_path.exists()) else None,
                bgm_volume=b_vol,
                voice_volume=v_vol,
                session_id=task_id,
            )
            final_audio_path = Path(timeline_res["final_audio_path"])

            # 3. Render video MP4 với phụ đề đã sửa
            cls.update_task(
                task_id,
                progress=85,
                current_step="rendering",
                message="Đang render video MP4 với phụ đề và âm thanh thuyết minh mới...",
            )

            output_video_path = task_dir / "final_translated.mp4"
            ffmpeg_cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(final_audio_path),
            ]
            if sub_mode in ["hard_target", "hard_dual"]:
                srt_escaped = str(srt_file).replace("\\", "/").replace(":", "\\:")
                style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30"
                ffmpeg_cmd.extend(["-vf", f"subtitles='{srt_escaped}':force_style='{style_str}'"])
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
                message=f"🎉 Đã lồng tiếng lại thành công theo phụ đề mới trong {total_elapsed_str}!",
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
            )
            logger.info(f"✅ [Task {task_id}] Re-dub hoàn tất ({total_elapsed_str}): {output_video_path}")
        except Exception as e:
            logger.error(f"❌ [Task {task_id}] Re-dub thất bại: {e}", exc_info=True)
            cls.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi khi lồng tiếng lại: {str(e)}",
                error=str(e),
            )
