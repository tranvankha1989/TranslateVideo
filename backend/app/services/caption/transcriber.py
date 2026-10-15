"""
app/services/caption/transcriber.py
───────────────────────────────────
Bóc tách giọng nói STT (Faster-Whisper local hoặc Cloud GPU) kết hợp Silero VAD và Demucs.
"""

import os
import logging
import subprocess
from pathlib import Path
from typing import Any

from app.services.caption.whisper_engine import get_whisper_model, WHISPER_MODEL_SIZE
from app.services.caption.demucs_separator import separate_vocals_demucs
from app.services.caption.alignment import (
    sanitize_word_timestamps,
    resegment_words,
    align_words_with_reference,
)

logger = logging.getLogger(__name__)


def transcribe_with_remote_or_local(
    audio_path: Path,
    language: str | None = None,
    model_size: str | None = None,
    initial_prompt: str | None = None,
    vad_filter: bool = True,
    vad_threshold: float = 0.35,
    min_speech_duration_ms: int = 150,
    min_silence_duration_ms: int = 500,
    speech_pad_ms: int = 500,
    beam_size: int = 5,
    word_timestamps: bool = True,
    task_dir: Path | None = None,
    download_bgm: bool = True,
) -> tuple[list[dict[str, Any]], str, Path | None]:
    """
    Nhận diện giọng nói STT thông minh kết hợp tách Demucs AI:
    - Nếu USE_REMOTE_GPU=True: Gửi audio lên Cloud GPU (Tesla T4 / NVIDIA A100) qua endpoint
      /api/remote/transcribe_with_demucs để vừa bóc tách thoại sạch (Vocals), vừa tách nhạc nền (BGM),
      vừa chạy Faster-Whisper, giải phóng 100% tài nguyên CPU/VRAM máy local.
      Tự động tải file nhạc nền no_vocals.wav về lưu vào thư mục task.
    - Nếu mất kết nối hoặc USE_REMOTE_GPU=False: Tự động dùng Faster-Whisper local.
    Trả về: (segments_list, detected_language, bgm_path)
    """
    from model_handler import (
        is_remote_gpu_enabled,
        get_remote_gpu_url,
        _remote_url,
        _remote_headers,
    )

    target_size = model_size or WHISPER_MODEL_SIZE
    lang_arg = None if (not language or language == "auto") else language.split("-")[0]
    if lang_arg == "zh" and (not initial_prompt or not initial_prompt.strip()):
        initial_prompt = "以下是普通话的句子，请用简体中文输出。"

    effective_task_dir = task_dir or audio_path.parent

    # 1. Gửi lên Remote GPU Worker (Hugging Face ZeroGPU A100 hoặc Google Colab T4)
    if is_remote_gpu_enabled():
        remote_url = get_remote_gpu_url()
        endpoint = _remote_url("transcribe_with_demucs")
        headers = _remote_headers()

        # Nén audio trước khi tải lên Cloud GPU để giảm 90-95% dung lượng upload, chống timeout và đứt kết nối mạng
        compressed_audio_path = None
        upload_path = audio_path
        upload_mime = "audio/wav"

        try:
            compressed_candidate = effective_task_dir / f"compressed_{audio_path.stem}.opus"
            cmd_opus = [
                "ffmpeg", "-y", "-i", str(audio_path),
                "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-c:a", "libopus", "-b:a", "96k",
                "-ar", "16000", "-ac", "1",
                str(compressed_candidate),
            ]
            comp_res = subprocess.run(cmd_opus, capture_output=True, text=True)
            if comp_res.returncode == 0 and compressed_candidate.exists() and compressed_candidate.stat().st_size > 500:
                compressed_audio_path = compressed_candidate
                upload_path = compressed_candidate
                upload_mime = "audio/opus"
                orig_kb = round(audio_path.stat().st_size / 1024, 1)
                comp_kb = round(compressed_candidate.stat().st_size / 1024, 1)
                reduction = round((1.0 - (comp_kb / max(1.0, orig_kb))) * 100, 1)
                logger.info(f"🗜️ [Audio Compression] Nén audio & Loudnorm thành công: {orig_kb}KB -> {comp_kb}KB (-{reduction}%) [Opus 96kbps mono]")
            else:
                # Fallback qua MP3 128kbps nếu hệ thống thiếu libopus
                compressed_mp3 = effective_task_dir / f"compressed_{audio_path.stem}.mp3"
                cmd_mp3 = [
                    "ffmpeg", "-y", "-i", str(audio_path),
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-c:a", "libmp3lame", "-b:a", "128k",
                    "-ar", "16000", "-ac", "1",
                    str(compressed_mp3),
                ]
                comp_res2 = subprocess.run(cmd_mp3, capture_output=True, text=True)
                if comp_res2.returncode == 0 and compressed_mp3.exists() and compressed_mp3.stat().st_size > 500:
                    compressed_audio_path = compressed_mp3
                    upload_path = compressed_mp3
                    upload_mime = "audio/mpeg"
                    orig_kb = round(audio_path.stat().st_size / 1024, 1)
                    comp_kb = round(compressed_mp3.stat().st_size / 1024, 1)
                    reduction = round((1.0 - (comp_kb / max(1.0, orig_kb))) * 100, 1)
                    logger.info(f"🗜️ [Audio Compression] Nén audio & Loudnorm thành công: {orig_kb}KB -> {comp_kb}KB (-{reduction}%) [MP3 128kbps mono]")
        except Exception as comp_err:
            logger.warning(f"⚠️ Nén audio gặp lỗi ({comp_err}), giữ nguyên file gốc để gửi: {audio_path.name}")
            upload_path = audio_path
            upload_mime = "audio/wav"

        logger.info(
            f"🌐 [Remote STT + Demucs] Gửi audio '{upload_path.name}' lên Cloud GPU: {endpoint} (Lang={lang_arg or 'auto'}, Model={target_size})..."
        )
        remote_error = None
        try:
            import httpx
            with open(upload_path, "rb") as af:
                files = {"audio_file": (upload_path.name, af, upload_mime)}
                data = {
                    "language": lang_arg or "",
                    "model_size": target_size,
                    "initial_prompt": initial_prompt or "",
                    "vad_filter": "true" if vad_filter else "false",
                    "vad_threshold": str(vad_threshold),
                    "min_speech_duration_ms": str(min_speech_duration_ms),
                    "min_silence_duration_ms": str(min_silence_duration_ms),
                    "speech_pad_ms": str(speech_pad_ms),
                    "beam_size": str(beam_size),
                }
                with httpx.Client(timeout=600.0) as client:
                    resp = client.post(endpoint, files=files, data=data, headers=headers)
                    # Nếu endpoint transcribe_with_demucs trả về 404 (worker cũ chưa cập nhật), fallback về /transcribe
                    if resp.status_code == 404:
                        logger.warning(f"⚠️ Endpoint '{endpoint}' trả về 404. Tự động fallback sang endpoint tiêu chuẩn 'transcribe'...")
                        af.seek(0)
                        fallback_endpoint = _remote_url("transcribe")
                        resp = client.post(fallback_endpoint, files={"audio_file": (upload_path.name, af, upload_mime)}, data=data, headers=headers)

            if resp.status_code == 200:
                res_data = resp.json()
                detected_lang = res_data.get("language") or lang_arg or "vi"
                segments = res_data.get("segments", [])
                bgm_filename = res_data.get("bgm_filename")
                bgm_download_url = res_data.get("bgm_download_url")

                bgm_path: Path | None = None
                # Tải file nhạc nền (BGM) về nếu worker đã bóc tách thành công bằng Demucs AI VÀ tác vụ cần giữ BGM
                if download_bgm and (bgm_filename or bgm_download_url):
                    effective_task_dir.mkdir(parents=True, exist_ok=True)
                    bgm_local_path = effective_task_dir / "no_vocals.wav"

                    download_endpoint = _remote_url(f"download_bgm/{bgm_filename}") if bgm_filename else (
                        f"{remote_url.rstrip('/')}{bgm_download_url}"
                    )
                    logger.info(f"📥 [Remote BGM] Đang tải nhạc nền tách bởi Demucs từ worker: {download_endpoint}...")
                    try:
                        with httpx.Client(timeout=180.0) as dl_client:
                            bgm_resp = dl_client.get(download_endpoint, headers=headers)
                            if bgm_resp.status_code == 200 and len(bgm_resp.content) > 1000:
                                with open(bgm_local_path, "wb") as bf:
                                    bf.write(bgm_resp.content)
                                bgm_path = bgm_local_path
                                size_mb = round(bgm_local_path.stat().st_size / (1024 * 1024), 2)
                                logger.info(f"✨ [Remote BGM] Tải thành công nhạc nền về máy: {bgm_local_path.name} ({size_mb} MB)")
                            else:
                                logger.warning(f"⚠️ Không thể tải BGM từ worker (HTTP Status: {bgm_resp.status_code})")
                    except Exception as dl_err:
                        logger.warning(f"⚠️ Lỗi khi tải file BGM từ worker ({dl_err}), fallback sang audio gốc")
                elif not download_bgm and (bgm_filename or bgm_download_url):
                    logger.info(f"⚡ [BGM Skipped] Bỏ qua bước tải file nhạc nền nặng ({bgm_filename or 'worker BGM'}) do tác vụ chỉ cần trích xuất phụ đề, tiết kiệm 100% băng thông!")

                # Tự động chia nhỏ câu theo word_timestamps thành các phân đoạn 3.0s - 6.0s (5-9 từ)
                all_words_flat = []
                for s in segments:
                    w_list = s.get("words", []) if isinstance(s, dict) else getattr(s, "words", None)
                    if w_list and isinstance(w_list, list):
                        all_words_flat.extend(w_list)
                if all_words_flat:
                    segments = resegment_words(
                        all_words_flat,
                        max_words=8,
                        min_duration=3.0,
                        max_duration=6.0,
                        min_words=5,
                        min_silence_split=0.40,
                    )
                    logger.info(f"✂️ [Cloud STT] Đã chia nhỏ phụ đề thành {len(segments)} phân đoạn (3-6s/câu)")

                logger.info(
                    f"🎉 [Remote STT + Demucs] Nhận diện thành công {len(segments)} câu trên Cloud GPU (Ngôn ngữ: {detected_lang}, BGM: {bool(bgm_path)})!"
                )
                return segments, detected_lang, bgm_path
            else:
                remote_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                logger.error(f"❌ [Remote STT] Cloud GPU Worker ({endpoint}) trả về lỗi: {remote_error}")
        except Exception as e:
            remote_error = str(e)
            logger.error(f"❌ [Remote STT] Lỗi kết nối Cloud GPU ({endpoint}): {remote_error}")
        finally:
            if compressed_audio_path and compressed_audio_path.exists():
                try:
                    os.remove(compressed_audio_path)
                    logger.debug(f"🧹 Đã xóa file nén tạm thời: {compressed_audio_path.name}")
                except OSError:
                    pass

        # Khi người dùng đã BẬT Cloud GPU: Tuyệt đối KHÔNG tự ý tải mô hình nặng lên máy local vì máy có thể không có GPU
        raise RuntimeError(
            f"Chế độ Cloud GPU đang BẬT nhưng không thể kết nối tới Cloud GPU Worker tại '{remote_url}' (Chi tiết: {remote_error}). "
            f"Để bảo vệ máy tính của bạn (tránh treo CPU, đơ máy hoặc tràn RAM), hệ thống không tự ý tải mô hình AI nặng lên máy tính. "
            f"Vui lòng kiểm tra lại kết nối Cloud GPU hoặc kiểm tra trạng thái Hugging Face / Colab trong phần Cài đặt."
        )

    # 2. Chạy Faster-Whisper trên máy tính với Silero VAD nhạy bén (Chỉ khi Chế độ Cloud GPU TẮT)
    logger.info(f"💻 [Local STT] Đang chạy Faster-Whisper '{target_size}' trên máy tính (VAD Threshold={vad_threshold}, Pad={speech_pad_ms}ms)...")
    model = get_whisper_model(target_size)
    segments_gen, info = model.transcribe(
        str(audio_path),
        language=lang_arg,
        initial_prompt=initial_prompt,
        beam_size=beam_size,
        condition_on_previous_text=False,  # Ngăn chặn hallucination kéo dài giữa các chunk 30s
        repetition_penalty=1.0,            # BẮT BUỘC 1.0: Không làm biến dạng phân phối âm học (tránh đảo số 10/7 thành 7/10)
        
        # --- VÙNG CÂN BẰNG TỐI ƯU (BẮT TIẾNG THÌ THÀO & CHỐNG TỪ MA) ---
        no_speech_threshold=0.45,
        log_prob_threshold=-1.4,
        compression_ratio_threshold=2.4,
        
        temperature=0.0,
        vad_filter=vad_filter,
        vad_parameters=dict(
            threshold=vad_threshold,
            min_speech_duration_ms=min_speech_duration_ms,
            min_silence_duration_ms=min_silence_duration_ms,
            speech_pad_ms=speech_pad_ms,
        ) if vad_filter else None,
        word_timestamps=word_timestamps,
    )

    result_segments = []
    for i, s in enumerate(segments_gen):
        txt = s.text.strip()
        words_data = []
        if getattr(s, "words", None):
            for w in s.words:
                w_text = getattr(w, "word", "").strip()
                if not w_text:
                    continue
                words_data.append({
                    "word": w_text,
                    "start": round(getattr(w, "start", 0.0), 3),
                    "end": round(getattr(w, "end", 0.0), 3),
                    "probability": round(getattr(w, "probability", 1.0), 2),
                })

        if not txt and not words_data:
            continue

        # Lấy mốc thời gian chuẩn xác từ từ vựng (Word timestamps) để khớp 100% với giọng nói thực tế
        if words_data:
            words_data = sanitize_word_timestamps(words_data)
            valid_w = [w for w in words_data if w.get("word", "").strip()]
            if valid_w:
                seg_start = valid_w[0]["start"]
                seg_end = valid_w[-1]["end"]
            else:
                seg_start = round(s.start, 3)
                seg_end = round(s.end, 3)
        else:
            seg_start = round(s.start, 3)
            seg_end = round(s.end, 3)

        if seg_end <= seg_start:
            seg_end = round(seg_start + 0.3, 3)

        result_segments.append({
            "id": len(result_segments) + 1,
            "start": round(seg_start, 3),
            "end": round(seg_end, 3),
            "text": txt,
            "words": words_data,
        })

    # Tự động chia nhỏ câu theo word_timestamps thành các phân đoạn 3.0s - 6.0s (5-9 từ)
    all_words_flat = []
    for s in result_segments:
        w_list = s.get("words", []) if isinstance(s, dict) else getattr(s, "words", None)
        if w_list and isinstance(w_list, list):
            all_words_flat.extend(w_list)
    if all_words_flat:
        result_segments = resegment_words(
            all_words_flat,
            max_words=8,
            min_duration=3.0,
            max_duration=6.0,
            min_words=5,
            min_silence_split=0.40,
        )
        logger.info(f"✂️ [Local STT] Đã chia nhỏ phụ đề thành {len(result_segments)} phân đoạn (3-6s/câu)")

    return result_segments, info.language, None


# Alias hỗ trợ gọi đồng bộ/tương thích
transcribe_with_remote_gpu = transcribe_with_remote_or_local


def transcribe_video_audio(
    audio_path: Path,
    language: str = "vi",
    model_size: str | None = None,
    reference_script: str | None = None,
    vad_threshold: float = 0.35,
    min_speech_duration_ms: int = 150,
    min_silence_duration_ms: int = 500,
    speech_pad_ms: int = 500,
    beam_size: int = 5,
) -> list[dict[str, Any]]:
    """
    Phân tích âm thanh và trích xuất mốc thời gian chi tiết từng từ (Word-level timestamps).
    Hỗ trợ kịch bản đối chiếu (reference_script) để Whisper nhận diện chính xác 100% chính tả.
    """
    prompt_hint = "Phụ đề video tiếng Việt có dấu, chuẩn ngữ pháp và chính tả." if (language == "vi" or str(language).startswith("vi")) else None

    # Kiểm tra cấu hình Cloud GPU
    from model_handler import is_remote_gpu_enabled
    if is_remote_gpu_enabled():
        whisper_audio = audio_path
        logger.info("⚡ [AutoCaption] Chế độ Cloud GPU đang hoạt động -> Chuyển toàn bộ tác vụ tách âm & Whisper lên Cloud GPU.")
    else:
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except Exception:
            has_cuda = False
        vocal_res = separate_vocals_demucs(audio_path, audio_path.parent, enable_demucs=has_cuda)
        whisper_audio = vocal_res.get("vocals", audio_path)

    stt_res = transcribe_with_remote_or_local(
        audio_path=whisper_audio,
        language=language,
        model_size=model_size,
        initial_prompt=prompt_hint,
        vad_filter=True,
        vad_threshold=vad_threshold,
        min_speech_duration_ms=min_speech_duration_ms,
        min_silence_duration_ms=min_silence_duration_ms,
        speech_pad_ms=speech_pad_ms,
        beam_size=beam_size,
        word_timestamps=True,
        download_bgm=False,
    )
    result_segments = stt_res[0] if isinstance(stt_res, (list, tuple)) else stt_res

    # Nếu có kịch bản đối chiếu, tự động so khớp và chia nhỏ câu
    if reference_script and reference_script.strip():
        result_segments = align_words_with_reference(result_segments, reference_script)
    else:
        all_words_flat = []
        for s in result_segments:
            all_words_flat.extend(s.get("words", []))
        if all_words_flat:
            result_segments = resegment_words(all_words_flat, max_words=7, max_chars=36)

    # Tự động lọc quảng cáo, watermark và danh sách từ/câu dạy cho AI bỏ qua
    try:
        from app.services.ad_filter_service import AdFilterService
        result_segments, removed_cnt = AdFilterService.filter_subtitle_segments(result_segments)
        if removed_cnt > 0:
            logger.info(f"🛡️ [Ad Filter] Đã loại bỏ {removed_cnt} câu quảng cáo/rác/câu bỏ qua.")
    except Exception as e:
        logger.warning(f"⚠️ Bỏ qua lọc quảng cáo ({e})")

    logger.info(f"Nhận diện hoàn tất: {len(result_segments)} câu có phụ đề chi tiết.")
    return result_segments
