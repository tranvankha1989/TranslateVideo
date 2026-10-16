"""
app/services/video_translation/pipeline_runner.py
─────────────────────────────────────────────────
Điều phối và thực thi toàn bộ quy trình dịch và lồng tiếng video tự động khép kín (End-to-End):
  1. Tách audio WAV & trích xuất nhạc nền BGM (FFmpeg / Demucs AI).
  2. Bóc tách phụ đề gốc (Faster-Whisper STT).
  3. Dịch phụ đề sang ngôn ngữ đích (TranslationService).
  4. Lồng tiếng tự động cho từng câu thoại (DubbingService - Edge-TTS / OmniVoice).
  5. Cân chỉnh tốc độ câu nói và ráp dải âm thanh khớp timeline (AlignmentService).
  6. Xuất phụ đề (Đơn ngữ / Song ngữ) và dùng FFmpeg render Video MP4 thành phẩm.
"""

import time
import json
import asyncio
import subprocess
from pathlib import Path
from typing import Any

from app.core.config import logger, log_verbose_step
from app.services.dubbing_service import DubbingService, get_audio_duration
from app.services.translator_service import TranslationService
from app.services.alignment_service import AlignmentService
from app.services.ad_filter_service import AdFilterService
from caption_handler import (
    extract_audio,
    separate_vocals_demucs,
    heal_and_merge_segments,
    resegment_words,
    transcribe_with_remote_or_local,
)
from app.services.video_translation.constants import (
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
    is_cloud_gpu_active,
    format_duration_vietnamese,
    get_ffmpeg_scale_filter,
    cleanup_task_temp_files,
)
from app.services.video_translation.subtitles import (
    generate_srt_file,
)
from app.services.video_translation.task_manager import VideoTranslationTaskManager


from app.services.license_service import get_video_dubbing_max_duration, should_apply_audio_watermark
from audio_processor import apply_watermark_to_file

class AutomatedPipelineRunner:
    """Điều phối quy trình dịch và lồng tiếng video tự động khép kín."""

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
        vad_threshold: float = 0.35,
        speech_pad_ms: int = 500,
        min_speech_duration_ms: int = 150,
        min_silence_duration_ms: int = 500,
        beam_size: int = 5,
        font_size: int = 20,
        margin_v: int = 30,
        alignment: int = 2,
    ) -> None:
        start_time = time.time()
        try:
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)

            # Feature Gating: Chế độ Trial giới hạn tối đa 2 phút (120s) đầu của video
            max_trial_dur = get_video_dubbing_max_duration()
            if max_trial_dur:
                if clip_end is None or clip_end > max_trial_dur:
                    clip_end = max_trial_dur
                    logger.info(f"🛡️ [Feature Gate] Chế độ Trial tự động giới hạn xử lý tối đa {max_trial_dur}s đầu của video.")

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
            VideoTranslationTaskManager.update_task(task_id, **task_config)
            log_verbose_step("PIPELINE_INIT", f"Khởi tạo tác vụ dịch video [{task_id}]", task_config)

            # ── BƯỚC 1: TÁCH ÂM THANH & NHẠC NỀN (0% -> 15%) ──────────────
            VideoTranslationTaskManager.update_task(
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

            VideoTranslationTaskManager.update_task(
                task_id,
                progress=10,
                current_step="extracting",
                message="Đang trích xuất luồng âm thanh và phân tích tách giọng nói sạch (Demucs AI / FFmpeg)...",
            )

            raw_audio_path, whisper_audio_path, bgm_path, video_duration = await asyncio.to_thread(do_extract_and_prepare_audio)
            VideoTranslationTaskManager.update_task(
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
            VideoTranslationTaskManager.update_task(
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

            VideoTranslationTaskManager.update_task(
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
                VideoTranslationTaskManager.update_task(task_id, bgm_path=str(bgm_path))
                logger.info(f"🎶 [BGM Sync] Đã nhận file nhạc nền từ Demucs: {bgm_path.name}")
            elif bgm_path and Path(bgm_path).exists():
                VideoTranslationTaskManager.update_task(task_id, bgm_path=str(bgm_path))
                logger.info(f"🎶 [BGM Sync] Sử dụng file nhạc nền cục bộ: {Path(bgm_path).name}")
            else:
                fallback_bgm = str(raw_audio_path) if (preserve_bgm and raw_audio_path and Path(raw_audio_path).exists()) else None
                bgm_path = Path(fallback_bgm) if fallback_bgm else None
                VideoTranslationTaskManager.update_task(task_id, bgm_path=fallback_bgm)
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

            VideoTranslationTaskManager.update_task(
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
            VideoTranslationTaskManager.update_task(
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
                VideoTranslationTaskManager.update_task(
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
            VideoTranslationTaskManager.update_task(
                task_id,
                progress=55,
                current_step="dubbing",
                message=f"Bắt đầu lồng tiếng {len(translated_segments)} câu bằng giọng '{voice_id}'...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            clean_vocal_ref = None
            is_clone_mode = (
                engine.lower() == "omnivoice"
                or "clone" in voice_id.lower()
                or voice_id.startswith("omnivoice:")
            )
            if is_clone_mode:
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
                VideoTranslationTaskManager.update_task(
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
            VideoTranslationTaskManager.update_task(
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
            task_data = VideoTranslationTaskManager.get_task(task_id) or {}
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

            VideoTranslationTaskManager.update_task(
                task_id,
                progress=85,
                current_step="rendering",
                message=step_msg,
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            srt_orig_file = task_dir / "subtitles_original.srt"
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")

            effective_srt_mode = "hard_dual" if sub_mode in ["hard_dual", "soft_dual"] else "hard_target"
            srt_file = task_dir / "subtitles.srt"
            generate_srt_file(translated_segments, srt_file, mode=effective_srt_mode)

            srt_initial_file = task_dir / "subtitles_ai_initial.srt"
            generate_srt_file(translated_segments, srt_initial_file, mode=effective_srt_mode)

            output_video_path = task_dir / "final_translated.mp4"

            if is_stream_copy:
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

                # Feature Gating: Chèn audio watermark mỗi 45s nếu đang ở chế độ Trial
                if should_apply_audio_watermark() and final_audio_path.exists():
                    apply_watermark_to_file(final_audio_path, interval_sec=45.0)

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

            total_elapsed_sec = round(time.time() - start_time, 1)
            total_elapsed_str = format_duration_vietnamese(total_elapsed_sec)
            rel_video_url = f"/api/video-translate/stream/{task_id}"
            rel_audio_url = f"/outputs/alignment/{task_id}/{final_audio_path.name}"
            rel_srt_url = f"/outputs/video_translate/{task_id}/{srt_file.name}"
            rel_orig_srt_url = f"/outputs/video_translate/{task_id}/{srt_orig_file.name}"

            VideoTranslationTaskManager.update_task(
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

            cleanup_task_temp_files(task_dir)

        except Exception as e:
            log_verbose_step("PIPELINE_EXCEPTION", f"Lỗi xảy ra trong quá trình chạy pipeline: {e}", {
                "task_id": task_id,
                "error_type": type(e).__name__,
                "error_message": str(e),
                "current_step": _TASK_STORE.get(task_id, {}).get("current_step"),
            })
            logger.error(f"❌ [Task {task_id}] Thất bại: {e}", exc_info=True)
            VideoTranslationTaskManager.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi: {str(e)}",
                error=str(e),
            )
        finally:
            if "task_dir" in locals() and task_dir:
                cleanup_task_temp_files(task_dir)
