"""
app/services/video_translation/manual_runner.py
───────────────────────────────────────────────
Thực thi các bước trong quy trình dịch thủ công (Manual Workflow):
- run_manual_transcribe: trích xuất phụ đề gốc.
- run_redub: lồng tiếng và render lại từ file SRT.
- quick_remux_video: render lại video nhanh từ các phân cảnh audio có sẵn.
"""

import time
import json
import asyncio
import subprocess
from pathlib import Path
from typing import Any

from app.core.config import logger, log_verbose_step
from app.services.dubbing_service import DubbingService, get_audio_duration, DUBBING_OUTPUT_DIR
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
    is_cloud_gpu_active,
    format_duration_vietnamese,
    get_ffmpeg_scale_filter,
    cleanup_task_temp_files,
)
from app.services.video_translation.subtitles import (
    generate_srt_file,
    parse_srt_file,
)
from app.services.video_translation.task_manager import VideoTranslationTaskManager
from app.services.video_translation.studio_segment_service import StudioSegmentService


class ManualWorkflowRunner:
    """Điều phối quy trình dịch video thủ công và xuất bản nhanh từ Studio."""

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
        speech_pad_ms: int = 500,
        min_speech_duration_ms: int = 150,
        min_silence_duration_ms: int = 500,
        beam_size: int = 5,
    ) -> None:
        start_time = time.time()
        try:
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)

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
            VideoTranslationTaskManager.update_task(task_id, **task_config)
            log_verbose_step("MANUAL_INIT", f"Khởi tạo tác vụ tạo phụ đề gốc thủ công [{task_id}]", task_config)

            raw_audio = task_dir / "raw_audio.wav"

            def do_extract():
                extract_audio(video_path, raw_audio)
                dur = get_audio_duration(raw_audio)
                vocal_res = separate_vocals_demucs(raw_audio, task_dir, enable_demucs=True)
                whisper_audio = vocal_res.get("vocals", raw_audio)
                bgm = vocal_res.get("bgm", raw_audio)
                return raw_audio, whisper_audio, bgm, dur

            VideoTranslationTaskManager.update_task(
                task_id,
                progress=15,
                current_step="extracting",
                message="Đang trích xuất luồng âm thanh và phân tích tách giọng nói sạch (Demucs AI / FFmpeg)...",
                _start_time=start_time,
                created_at=start_time,
            )
            raw_audio_path, whisper_audio_path, bgm_path, video_duration = await asyncio.to_thread(do_extract)
            VideoTranslationTaskManager.update_task(
                task_id,
                video_duration=video_duration,
                raw_audio_path=str(raw_audio_path),
                bgm_path=str(bgm_path),
            )
            log_verbose_step("MANUAL_STEP_1_AUDIO", "Trích xuất âm thanh tách giọng hoàn tất", {
                "duration_seconds": round(video_duration, 2),
                "raw_audio": str(raw_audio_path),
                "whisper_audio": str(whisper_audio_path),
                "bgm_path": str(bgm_path),
            })

            whisper_tag = "trên Cloud GPU" if is_cloud_gpu_active() else f"Faster-Whisper ({whisper_model.upper()})"
            VideoTranslationTaskManager.update_task(
                task_id,
                progress=35,
                current_step="transcribing",
                message=f"Đang tạo phụ đề thoại gốc {whisper_tag}...",
            )
            lang_arg = None if source_lang == "auto" else source_lang.split("-")[0]
            prompt_to_use = None
            if (source_lang and source_lang.startswith("zh")) or lang_arg == "zh":
                prompt_to_use = "以下是普通话的句子，请用简体中文输出。"

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
                    VideoTranslationTaskManager.update_task(task_id, bgm_path=str(bgm_path))
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

            original_segments, removed_ad_cnt = AdFilterService.filter_subtitle_segments(original_segments)
            if removed_ad_cnt > 0:
                logger.info(f"🛡️ [Manual Pipeline] Đã loại bỏ {removed_ad_cnt} câu quảng cáo/rác/câu bỏ qua khỏi phụ đề gốc.")

            original_segments = heal_and_merge_segments(original_segments, max_gap=0.40, max_duration=6.0)

            if not original_segments:
                raise RuntimeError("Không phát hiện được câu thoại nào rõ ràng trong video.")

            srt_orig_file = task_dir / "subtitles_original.srt"
            generate_srt_file(original_segments, srt_orig_file, mode="hard_target")
            rel_orig_srt_url = f"/outputs/video_translate/{task_id}/{srt_orig_file.name}"

            total_elapsed_sec = round(time.time() - start_time, 1)
            total_elapsed_str = format_duration_vietnamese(total_elapsed_sec)

            VideoTranslationTaskManager.update_task(
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
            VideoTranslationTaskManager.update_task(
                task_id,
                status="failed",
                current_step="failed",
                message=f"Lỗi tạo phụ đề gốc: {str(e)}",
                error=str(e),
            )

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
        start_time = time.time()
        try:
            task = VideoTranslationTaskManager.get_task(task_id) or {}
            task_dir = TRANSLATE_OUTPUT_DIR / task_id
            task_dir.mkdir(parents=True, exist_ok=True)
            if not task_dir.exists():
                raise RuntimeError(f"Tác vụ {task_id} không tồn tại trên hệ thống.")

            srt_file = task_dir / "subtitles.srt"
            if srt_content is not None and srt_content.strip():
                srt_file.write_text(srt_content.strip(), encoding="utf-8-sig")

            if not srt_file.exists():
                raise RuntimeError(f"File phụ đề {srt_file.name} không tồn tại.")

            segments = parse_srt_file(srt_file)
            if not segments:
                raise RuntimeError("Không tìm thấy câu thoại hợp lệ trong file phụ đề .srt. Vui lòng kiểm tra lại định dạng mốc thời gian.")

            generate_srt_file(segments, srt_file, mode="hard_target")

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

            video_path_str = task.get("video_path")
            video_path = Path(video_path_str) if video_path_str else None

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

            VideoTranslationTaskManager.update_task(
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

            async def on_redub_progress(cur, total, cur_text):
                pct = 20 + int((cur / max(1, total)) * 45)
                VideoTranslationTaskManager.update_task(
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

            VideoTranslationTaskManager.update_task(
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

            VideoTranslationTaskManager.update_task(
                task_id,
                progress=85,
                current_step="rendering",
                message=f"Đang render video MP4 ({out_res.upper()}) hoàn thiện (FFmpeg)...",
                elapsed_time=round(time.time() - start_time, 1),
                elapsed_str=format_duration_vietnamese(time.time() - start_time),
            )

            render_srt_file = srt_file
            if sub_mode == "hard_dual" and (task_dir / "subtitles_original.srt").exists():
                orig_segments = parse_srt_file(task_dir / "subtitles_original.srt")
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

            VideoTranslationTaskManager.update_task(
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
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        studio_data = StudioSegmentService.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        video_path = None
        task = VideoTranslationTaskManager.get_task(task_id) or {}
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

        selected_bgm_path = None
        if p_bgm and b_type != "none":
            if b_type == "original" and raw_audio_path and raw_audio_path.exists():
                selected_bgm_path = str(raw_audio_path)
            elif bgm_path and bgm_path.exists():
                selected_bgm_path = str(bgm_path)

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

        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=sub_mode)

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
        VideoTranslationTaskManager.update_task(
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
