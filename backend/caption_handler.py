"""
caption_handler.py
──────────────────
Xử lý toàn bộ logic cho tính năng Auto Kinetic Caption & Video Editing:
  1. Tách audio WAV từ video bằng FFmpeg.
  2. Bóc tách phụ đề chi tiết từng từ (Word-level timestamps) bằng Faster-Whisper & Silero VAD.
  3. Sinh file phụ đề Karaoke ASS (.ass) với styling tùy biến cao.
  4. Ghép phụ đề cứng và hòa âm nhạc nền (BGM) ra video MP4 thành phẩm qua FFmpeg.
"""

import os
import re
import logging
import subprocess
from pathlib import Path
from typing import Any

# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# ─── Singleton Whisper Model ────────────────────────────────────────────────
_whisper_model: WhisperModel | None = None
_current_model_size: str | None = None

# Đọc cấu hình Whisper từ .env (Kích hoạt large-v3 làm mô hình chuẩn cao cấp)
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "large-v3").strip().lower()


def get_whisper_model(model_size: str | None = None) -> WhisperModel:
    """Khởi tạo hoặc trả về instance Faster-Whisper đã cache."""
    global _whisper_model, _current_model_size

    target_size = model_size or WHISPER_MODEL_SIZE
    if _whisper_model is not None and _current_model_size == target_size:
        return _whisper_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    logger.info(
        f"🎙️ Đang tải Faster-Whisper model '{target_size}' trên {device} (compute={compute_type}) …"
    )
    _whisper_model = WhisperModel(target_size, device=device, compute_type=compute_type)
    _current_model_size = target_size
    logger.info("✅ Tải Faster-Whisper thành công.")
    return _whisper_model


def extract_audio(video_path: Path, output_audio_path: Path) -> Path:
    """
    Trích xuất âm thanh từ video sang định dạng WAV 16kHz Mono (chuẩn tối ưu cho Whisper).
    Nếu video không có luồng âm thanh nào (video câm), tự động tạo âm thanh im lặng (silent audio) để không crash.
    """
    output_audio_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-threads",
        "0",
        "-i",
        str(video_path),
        "-vn",
        "-sn",
        "-dn",
        "-af",
        "aresample=async=1",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(output_audio_path),
    ]
    logger.info(f"Trích xuất âm thanh từ {video_path.name} -> {output_audio_path.name}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        # Nếu video không có stream âm thanh (video câm), tạo file audio im lặng thay vì báo lỗi
        err_lower = res.stderr.lower()
        if "does not contain any stream" in err_lower or "output file is empty" in err_lower or "matches no streams" in err_lower:
            logger.warning(f"Video {video_path.name} không có luồng âm thanh gốc. Tạo file âm thanh im lặng...")
            silent_cmd = [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=16000:cl=mono",
                "-t",
                "1",
                "-acodec",
                "pcm_s16le",
                str(output_audio_path),
            ]
            subprocess.run(silent_cmd, capture_output=True, check=True)
            return output_audio_path

        logger.error(f"Lỗi khi trích xuất âm thanh: {res.stderr}")
        raise RuntimeError(f"FFmpeg extract audio thất bại: {res.stderr}")

    return output_audio_path


SENTENCE_ENDINGS = re.compile(r"[.!?]+['\"]?$")
CLAUSE_ENDINGS = re.compile(r"[,;:\-–—]+['\"]?$")


def resegment_words(
    all_words: list[dict[str, Any]],
    max_words: int = 7,
    max_chars: int = 36,
    min_silence_split: float = 0.38,
) -> list[dict[str, Any]]:
    """
    Chia nhỏ toàn bộ danh sách từ thành các câu phụ đề ngắn, chuẩn độ dài cho Shorts/Reels/Video (4-9 từ).
    Thuật toán ngắt thông minh:
    1. Ngắt ngay khi kết thúc câu bằng dấu chấm, hỏi chấm, chấm than (. ? !)
    2. Ngắt ở dấu phẩy hoặc dấu gạch nối khi câu đã đủ dài (>= 4 từ)
    3. Ngắt ở khoảng lặng tự nhiên giữa 2 từ >= 0.38s khi câu đã có từ 4 từ trở lên
    4. Giới hạn độ dài tối đa 9 từ hoặc 46 ký tự
    5. Chống từ mồ côi (orphan word prevention): nếu chỉ còn 1-2 từ là hết câu thì gộp nốt thay vì ngắt lơ lửng.
    """
    valid_words = [w for w in all_words if w.get("word", "").strip()]
    if not valid_words:
        return []

    new_segments: list[dict[str, Any]] = []
    current_words: list[dict[str, Any]] = []
    seg_id = 1

    for i, w in enumerate(valid_words):
        current_words.append(w)
        word_text = w.get("word", "").strip()
        has_next = i < len(valid_words) - 1
        next_w = valid_words[i + 1] if has_next else None

        # Kiểm tra khoảng cách tới dấu chấm hết câu gần nhất (lookahead)
        words_until_sentence_end = 999
        for lookahead in range(1, 3):
            if i + lookahead < len(valid_words):
                if SENTENCE_ENDINGS.search(valid_words[i + lookahead].get("word", "").strip()):
                    words_until_sentence_end = lookahead
                    break

        should_split = False

        if not has_next:
            should_split = True
        else:
            # 1. Kết thúc câu bằng dấu câu (. ! ?)
            if SENTENCE_ENDINGS.search(word_text):
                should_split = True

            # Nếu chỉ còn 1-2 từ nữa là kết thúc câu, gộp nốt thay vì ngắt lơ lửng (cho phép dãn max_words lên 11 từ)
            elif words_until_sentence_end <= 2 and len(current_words) < 11:
                should_split = False

            # 2. Khoảng lặng tự nhiên giữa 2 từ >= min_silence_split khi đã có ít nhất 4 từ
            elif (
                len(current_words) >= 4
                and next_w
                and (next_w["start"] - w["end"] >= min_silence_split)
            ):
                should_split = True

            # 3. Dấu phẩy khi câu đã có từ 4 từ trở lên
            elif len(current_words) >= 4 and CLAUSE_ENDINGS.search(word_text):
                should_split = True

            # 4. Quá giới hạn từ hoặc ký tự
            elif len(current_words) >= max_words:
                should_split = True
            elif (
                sum(len(cw.get("word", "")) for cw in current_words) + len(current_words) - 1 >= max_chars
                and len(current_words) >= 4
            ):
                should_split = True

        if should_split and current_words:
            seg_start = current_words[0]["start"]
            seg_end = current_words[-1]["end"]
            seg_text = " ".join(cw.get("word", "").strip() for cw in current_words)
            new_segments.append(
                {
                    "id": seg_id,
                    "start": round(seg_start, 2),
                    "end": round(seg_end, 2),
                    "text": seg_text,
                    "words": current_words,
                }
            )
            seg_id += 1
            current_words = []

    return new_segments


def align_words_with_reference(
    segments: list[dict[str, Any]], reference_text: str
) -> list[dict[str, Any]]:
    """
    So khớp danh sách từ nhận diện bởi Whisper với kịch bản gốc của người dùng bằng difflib.SequenceMatcher.
    Bảo toàn 100% các từ trong kịch bản tham chiếu (kể cả các từ ở đầu câu bị Whisper bỏ sót do VAD hoặc âm lượng nhỏ).
    Tự động nội suy mốc thời gian start & end hợp lý cho các từ được chèn thêm (insert) từ 0.0s.
    Sau đó tự động chia nhỏ thành các câu phụ đề 4-9 từ chuẩn ngắn gọn, không bị tràn màn hình.
    """
    import difflib

    if not reference_text or not reference_text.strip():
        return segments

    ref_words = reference_text.strip().split()
    if not ref_words:
        return segments

    # Thu thập toàn bộ từ từ các segments
    all_words: list[dict[str, Any]] = []
    for seg in segments:
        for w in seg.get("words", []):
            all_words.append(dict(w))

    if not all_words:
        synthetic_words: list[dict[str, Any]] = []
        cur_t = 0.0
        for w in ref_words:
            synthetic_words.append({
                "word": w,
                "start": round(cur_t, 2),
                "end": round(cur_t + 0.3, 2),
                "probability": 0.95,
            })
            cur_t += 0.3
        return resegment_words(synthetic_words, max_words=7, max_chars=36)

    def clean_token(w: str) -> str:
        return re.sub(r"[^\w\s]", "", w.lower()).strip()

    whisper_clean = [clean_token(w["word"]) for w in all_words]
    ref_clean = [clean_token(w) for w in ref_words]

    matcher = difflib.SequenceMatcher(None, whisper_clean, ref_clean)
    aligned_words: list[dict[str, Any]] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for idx in range(i2 - i1):
                w_item = dict(all_words[i1 + idx])
                w_item["word"] = ref_words[j1 + idx]
                aligned_words.append(w_item)

        elif tag == "replace":
            seg_start = all_words[i1]["start"]
            seg_end = all_words[i2 - 1]["end"]
            ref_sub = ref_words[j1:j2]
            num_sub = len(ref_sub)
            if num_sub > 0:
                step = (seg_end - seg_start) / num_sub
                if step < 0.15:
                    step = 0.25
                    seg_end = seg_start + step * num_sub
                for idx, rw in enumerate(ref_sub):
                    aligned_words.append({
                        "word": rw,
                        "start": round(seg_start + idx * step, 2),
                        "end": round(seg_start + (idx + 1) * step, 2),
                        "probability": 0.9,
                    })

        elif tag == "insert":
            ref_sub = ref_words[j1:j2]
            num_sub = len(ref_sub)
            if num_sub > 0:
                if i1 == 0:
                    # Chèn ở đầu danh sách (trước từ đầu tiên): đảm bảo phụ đề có ngay từ 0.0s
                    next_start = all_words[0]["start"]
                    if next_start > 0.2:
                        step = next_start / num_sub
                        for idx, rw in enumerate(ref_sub):
                            aligned_words.append({
                                "word": rw,
                                "start": round(idx * step, 2),
                                "end": round((idx + 1) * step, 2),
                                "probability": 0.95,
                            })
                    else:
                        cur_t = 0.0
                        for rw in ref_sub:
                            aligned_words.append({
                                "word": rw,
                                "start": round(cur_t, 2),
                                "end": round(cur_t + 0.25, 2),
                                "probability": 0.95,
                            })
                            cur_t += 0.25

                elif i1 >= len(all_words):
                    # Chèn ở cuối danh sách
                    prev_end = aligned_words[-1]["end"] if aligned_words else all_words[-1]["end"]
                    cur_t = prev_end
                    for rw in ref_sub:
                        aligned_words.append({
                            "word": rw,
                            "start": round(cur_t, 2),
                            "end": round(cur_t + 0.3, 2),
                            "probability": 0.9,
                        })
                        cur_t += 0.3

                else:
                    # Chèn ở giữa hai từ
                    prev_end = aligned_words[-1]["end"] if aligned_words else all_words[i1 - 1]["end"]
                    next_start = all_words[i1]["start"]
                    gap = next_start - prev_end
                    if gap >= num_sub * 0.15:
                        step = gap / num_sub
                        for idx, rw in enumerate(ref_sub):
                            aligned_words.append({
                                "word": rw,
                                "start": round(prev_end + idx * step, 2),
                                "end": round(prev_end + (idx + 1) * step, 2),
                                "probability": 0.9,
                            })
                    else:
                        cur_t = prev_end
                        for rw in ref_sub:
                            aligned_words.append({
                                "word": rw,
                                "start": round(cur_t, 2),
                                "end": round(cur_t + 0.2, 2),
                                "probability": 0.85,
                            })
                            cur_t += 0.2

        elif tag == "delete":
            # Giữ lại các từ Whisper nhận diện ngoài kịch bản nếu kịch bản đã kết thúc
            if j1 >= len(ref_words):
                for idx in range(i1, i2):
                    aligned_words.append(dict(all_words[idx]))

    if not aligned_words:
        return segments

    # Sắp xếp và đảm bảo tính liên tục của mốc thời gian
    for idx in range(len(aligned_words)):
        if idx > 0 and aligned_words[idx]["start"] < aligned_words[idx - 1]["start"]:
            aligned_words[idx]["start"] = aligned_words[idx - 1]["end"]
        if aligned_words[idx]["end"] <= aligned_words[idx]["start"]:
            aligned_words[idx]["end"] = round(aligned_words[idx]["start"] + 0.2, 2)

    # Tự động chia nhỏ lại các câu thành các đoạn 4-7 từ chuẩn ngắn gọn (hiển thị trọn vẹn 1 hàng)
    new_segments = resegment_words(aligned_words, max_words=7, max_chars=36)
    logger.info(f"✨ Đã đối chiếu và chia nhỏ thành {len(new_segments)} câu phụ đề chuẩn ngắn gọn ({len(aligned_words)} từ).")
    return new_segments


def transcribe_with_remote_or_local(
    audio_path: Path,
    language: str | None = None,
    model_size: str | None = None,
    initial_prompt: str | None = None,
    vad_filter: bool = False,
    beam_size: int = 3,
    word_timestamps: bool = True,
) -> tuple[list[dict[str, Any]], str]:
    """
    Nhận diện giọng nói STT thông minh:
    - Nếu USE_REMOTE_GPU=True: Gửi audio WAV lên Cloud GPU Colab (Tesla T4) để nhận diện,
      giải phóng 100% VRAM card đồ họa máy local.
    - Nếu mất kết nối hoặc USE_REMOTE_GPU=False: Tự động dùng Faster-Whisper local.
    Trả về: (segments_list, detected_language)
    """
    from model_handler import is_remote_gpu_enabled, get_remote_gpu_url

    target_size = model_size or WHISPER_MODEL_SIZE
    lang_arg = None if (not language or language == "auto") else language.split("-")[0]

    # 1. Thử gửi lên Remote GPU Worker nếu được bật
    if is_remote_gpu_enabled():
        remote_url = get_remote_gpu_url()
        logger.info(
            f"🌐 [Remote STT] Gửi audio '{audio_path.name}' lên Cloud GPU T4: {remote_url} (Lang={lang_arg or 'auto'}, Model={target_size})..."
        )
        try:
            import httpx
            with open(audio_path, "rb") as af:
                files = {"audio_file": (audio_path.name, af, "audio/wav")}
                data = {
                    "language": lang_arg or "",
                    "model_size": target_size,
                    "initial_prompt": initial_prompt or "",
                    "vad_filter": "true" if vad_filter else "false",
                    "beam_size": str(beam_size),
                }
                with httpx.Client(timeout=300.0) as client:
                    resp = client.post(f"{remote_url}/api/remote/transcribe", files=files, data=data)

            if resp.status_code == 200:
                res_data = resp.json()
                detected_lang = res_data.get("language") or lang_arg or "vi"
                segments = res_data.get("segments", [])
                logger.info(
                    f"🎉 [Remote STT] Nhận diện thành công {len(segments)} câu trên Cloud GPU (Ngôn ngữ: {detected_lang})!"
                )
                return segments, detected_lang
            else:
                logger.warning(
                    f"⚠️ [Remote STT] Cloud Colab trả về HTTP {resp.status_code}: {resp.text[:200]}, chuyển sang Whisper Local..."
                )
        except Exception as e:
            logger.warning(f"⚠️ [Remote STT] Không thể kết nối Cloud GPU ({e}), tự động chuyển sang Faster-Whisper Local...")

    # 2. Chạy Local nếu không dùng Remote hoặc Remote bị lỗi
    logger.info(f"💻 [Local STT] Đang chạy Faster-Whisper '{target_size}' trên máy tính...")
    model = get_whisper_model(target_size)
    segments_gen, info = model.transcribe(
        str(audio_path),
        language=lang_arg,
        initial_prompt=initial_prompt,
        beam_size=beam_size,
        best_of=beam_size,
        condition_on_previous_text=False,
        repetition_penalty=1.2,
        no_speech_threshold=0.85,
        log_prob_threshold=-1.5,
        compression_ratio_threshold=2.8,
        vad_filter=vad_filter,
        vad_parameters=dict(
            threshold=0.35,
            min_speech_duration_ms=200,
            min_silence_duration_ms=800,
            speech_pad_ms=400,
        ) if vad_filter else None,
        word_timestamps=word_timestamps,
    )

    result_segments = []
    for i, s in enumerate(segments_gen):
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
        txt = s.text.strip()
        if not txt and not words_data:
            continue

        # Lấy mốc thời gian chuẩn xác từ từ vựng (Word timestamps) để khớp 100% với giọng nói thực tế
        if words_data:
            seg_start = words_data[0]["start"]
            seg_end = words_data[-1]["end"]
        else:
            seg_start = round(s.start, 3)
            seg_end = round(s.end, 3)

        if seg_end <= seg_start:
            seg_end = round(seg_start + 0.3, 3)

        result_segments.append({
            "id": i + 1,
            "start": round(seg_start, 3),
            "end": round(seg_end, 3),
            "text": txt,
            "words": words_data,
        })

    return result_segments, info.language


def transcribe_video_audio(
    audio_path: Path,
    language: str = "vi",
    model_size: str | None = None,
    reference_script: str | None = None,
) -> list[dict[str, Any]]:
    """
    Phân tích âm thanh và trích xuất mốc thời gian chi tiết từng từ (Word-level timestamps).
    Hỗ trợ kịch bản đối chiếu (reference_script) để Whisper nhận diện chính xác 100% chính tả.
    """
    prompt_snippet = None
    if reference_script and reference_script.strip():
        prompt_snippet = reference_script.strip()[:450]

    result_segments, _ = transcribe_with_remote_or_local(
        audio_path=audio_path,
        language=language,
        model_size=model_size,
        initial_prompt=prompt_snippet,
        vad_filter=True,
        word_timestamps=True,
    )

    # Nếu có kịch bản đối chiếu, tự động so khớp và chia nhỏ câu
    if reference_script and reference_script.strip():
        result_segments = align_words_with_reference(result_segments, reference_script)
    else:
        # Nếu không có kịch bản, vẫn tự động chia nhỏ các câu quá dài của Whisper thành câu ngắn chuẩn Shorts/Reels
        all_words_flat = []
        for s in result_segments:
            all_words_flat.extend(s.get("words", []))
        if all_words_flat:
            result_segments = resegment_words(all_words_flat, max_words=7, max_chars=36)

    logger.info(f"Nhận diện hoàn tất: {len(result_segments)} câu có phụ đề chi tiết.")
    return result_segments


def rgb_to_ass_color(hex_color: str, alpha: int = 0) -> str:
    """
    Chuyển đổi mã màu hex thông dụng (#RRGGBB) sang định dạng màu ASS BGR (&H<AA><BB><GG><RR>).
    """
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join(c * 2 for c in hex_color)
    if len(hex_color) != 6:
        hex_color = "FFFFFF"

    r = hex_color[0:2]
    g = hex_color[2:4]
    b = hex_color[4:6]
    aa = f"{alpha:02X}"
    return f"&H{aa}{b}{g}{r}".upper()


def seconds_to_ass_time(seconds: float) -> str:
    """Chuyển đổi giây thành format thời gian của ASS (H:MM:SS.cs)."""
    if seconds < 0:
        seconds = 0.0
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 99
    return f"{hrs}:{mins:02d}:{secs:02d}.{cs:02d}"


def get_video_dimensions(video_path: Path) -> tuple[int, int]:
    """Lấy độ phân giải thực tế (Width x Height) của video qua ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            str(video_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        out = res.stdout.strip()
        if "x" in out:
            parts = out.split("x")
            return int(parts[0]), int(parts[1])
    except Exception as e:
        logger.warning(f"Không thể đọc kích thước video ({e}), dùng mặc định 1920x1080")
    return 1920, 1080


def generate_ass_subtitles(
    segments: list[dict[str, Any]],
    style_config: dict[str, Any],
    output_ass_path: Path,
    video_path: Path | None = None,
) -> Path:
    """
    Tạo file phụ đề ASS (.ass) với hiệu ứng Karaoke (\\k<centiseconds>) cho từng từ.
    Tự động chuẩn hóa kích thước chữ và viền theo đúng tỉ lệ xem trước trên Web và độ phân giải video gốc.
    """
    # 1. Xác định kích thước canvas theo video gốc
    video_w, video_h = (1920, 1080)
    if video_path and video_path.exists():
        video_w, video_h = get_video_dimensions(video_path)

    # 2. Tính tỉ lệ scale giữa khung hình video gốc và chiều cao hiển thị trên web
    preview_h = float(style_config.get("preview_height", 0))
    if preview_h > 50:
        scale_factor = video_h / preview_h
    else:
        scale_factor = video_h / 450.0  # fallback

    raw_font_size = float(style_config.get("font_size", 36))
    raw_outline = float(style_config.get("outline_size", 3))

    # Cỡ chữ và độ dày viền được scale chính xác để khi render lên video gốc sẽ khớp 100% mắt nhìn trên web
    ass_font_size = max(14, int(round(raw_font_size * scale_factor)))
    ass_outline_size = max(1, int(round(raw_outline * scale_factor)))

    font_name = style_config.get("font_name", "Montserrat")
    primary_color = rgb_to_ass_color(style_config.get("primary_color", "#FFFFFF"))
    highlight_color = rgb_to_ass_color(style_config.get("highlight_color", "#FFFF00"))
    outline_color = rgb_to_ass_color(style_config.get("outline_color", "#000000"))
    back_color = "&H80000000"
    
    # Tính toán vị trí hiển thị: hỗ trợ position_y (phần trăm từ đỉnh 0-100%)
    position_y = float(style_config.get("position_y", 80))
    if position_y >= 50:
        alignment = 2  # Bottom Center
        margin_v = max(10, int(round((100 - position_y) * video_h / 100)))
    else:
        alignment = 8  # Top Center
        margin_v = max(10, int(round(position_y * video_h / 100)))

    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {video_w}",
        f"PlayResY: {video_h}",
        "WrapStyle: 2",  # Cấm tuyệt đối libass tự động ngắt xuống 2 dòng, luôn ép trên 1 hàng duy nhất
        "ScaledBorderAndShadow: yes",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # ASS Karaoke \k: SecondaryColour là màu chữ TRƯỚC khi đọc (chưa đọc), PrimaryColour là màu chữ KHI/SAU khi đọc (được highlight)
        f"Style: KineticStyle,{font_name},{ass_font_size},{highlight_color},{primary_color},{outline_color},{back_color},1,0,0,0,100,100,0,0,1,{ass_outline_size},2,{alignment},20,20,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    for seg in segments:
        words = seg.get("words", [])
        start_time = seconds_to_ass_time(seg["start"])
        end_time = seconds_to_ass_time(seg["end"])

        # Tính toán tọa độ vị trí riêng (customPositionY) nếu có, fallback về position_y chung
        seg_pos_y = seg.get("customPositionY")
        if seg_pos_y is None:
            seg_pos_y = position_y
        else:
            try:
                seg_pos_y = float(seg_pos_y)
            except (ValueError, TypeError):
                seg_pos_y = position_y

        # Căn giữa theo bề ngang (video_w / 2) và theo tọa độ dọc tương ứng
        x_coord = int(round(video_w / 2))
        y_coord = int(round(seg_pos_y * video_h / 100))
        # \an5: Căn giữa trung tâm (middle-center) cả ngang và dọc, khớp 100% với CSS translate(-50%, -50%)
        pos_tag = f"{{\\an5\\pos({x_coord},{y_coord})}}"

        # Trích xuất văn bản thuần để đo độ dài câu
        plain_text = seg.get("text", "")
        if not plain_text and words:
            plain_text = " ".join(w.get("word", "").strip() for w in words)

        # Tính toán tự động co font size nếu câu dài, đảm bảo luôn vừa khít 1 hàng duy nhất (không rớt dòng, không tràn mép)
        max_safe_w = video_w * 0.90
        char_count = max(1, len(plain_text))
        estimated_w = char_count * (ass_font_size * 0.60)
        if estimated_w > max_safe_w:
            line_font_size = max(16, int(round(max_safe_w / (char_count * 0.60))))
            size_tag = f"{{\\fs{line_font_size}}}"
        else:
            size_tag = ""

        if words:
            karaoke_parts = []
            for i, w in enumerate(words):
                w_start = w["start"]
                # Kéo dài mốc kết thúc tới mốc bắt đầu của từ kế tiếp để hiệu ứng highlight chạy liền mạch
                if i < len(words) - 1:
                    next_start = words[i + 1]["start"]
                    effective_end = max(w["end"], next_start)
                else:
                    effective_end = max(w["end"], seg["end"])

                dur_cs = max(1, int(round((effective_end - w_start) * 100)))
                word_clean = w["word"].strip()
                karaoke_parts.append(f"{{\\k{dur_cs}}}{word_clean}")

            text_line = " ".join(karaoke_parts)
        else:
            # Fallback nếu câu không có word-level
            text_line = seg.get("text", "")

        ass_content.append(
            f"Dialogue: 0,{start_time},{end_time},KineticStyle,,0,0,0,,{pos_tag}{size_tag}{text_line}"
        )

    output_ass_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_ass_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_content) + "\n")

    logger.info(f"Đã tạo file phụ đề ASS: {output_ass_path.name}")
    return output_ass_path


def render_video_with_captions(
    video_path: Path,
    ass_path: Path,
    output_path: Path,
    voiceover_path: Path | None = None,
    voiceover_start_time: float = 0.0,
    audio_clips: list[dict[str, Any]] | None = None,
    bgm_path: Path | None = None,
    bgm_volume: float = 0.25,
    fonts_dir: Path | None = None,
) -> Path:
    """
    Sử dụng FFmpeg để ép cứng phụ đề ASS, lồng giọng đọc (Voiceover) theo danh sách clip đã cắt và hòa âm nhạc nền (BGM).
    Hỗ trợ tùy chọn thư mục font tùy biến (fontsdir), mốc bắt đầu voiceover_start_time và audio_clips (atrim + adelay).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Escape đường dẫn file ASS trên Windows cho FFmpeg filter
    escaped_ass = str(ass_path.resolve()).replace("\\", "/").replace(":", "\\:")
    ass_filter_str = f"ass='{escaped_ass}'"
    if fonts_dir and fonts_dir.exists():
        escaped_fonts = str(fonts_dir.resolve()).replace("\\", "/").replace(":", "\\:")
        ass_filter_str = f"ass='{escaped_ass}':fontsdir='{escaped_fonts}'"

    delay_ms = max(0, int(round(voiceover_start_time * 1000)))

    # Xây dựng chuỗi lọc audio cho Voiceover (hỗ trợ cắt nhiều đoạn audio_clips)
    if voiceover_path and voiceover_path.exists():
        if audio_clips and len(audio_clips) > 0:
            clip_filters = []
            clip_labels = []
            for i, c in enumerate(audio_clips):
                c_start = max(0.0, float(c.get("start", 0.0)))
                c_dur = max(0.1, float(c.get("duration", 1.0)))
                c_source = max(0.0, float(c.get("sourceStart", c.get("source_start", 0.0))))
                c_delay = int(round(c_start * 1000))
                clip_filters.append(
                    f"[1:a]atrim=start={c_source:.3f}:end={(c_source + c_dur):.3f},asetpts=PTS-STARTPTS,adelay={c_delay}|{c_delay}[ac_{i}]"
                )
                clip_labels.append(f"[ac_{i}]")

            if len(audio_clips) > 1:
                amix_filter = "".join(clip_labels) + f"amix=inputs={len(audio_clips)}:dropout_transition=0[v_delayed]"
                audio_filter_chain = "; ".join(clip_filters) + "; " + amix_filter
            else:
                audio_filter_chain = f"{clip_filters[0]}; [ac_0]anull[v_delayed]"
        elif delay_ms > 0:
            audio_filter_chain = f"[1:a]adelay={delay_ms}|{delay_ms}[v_delayed]"
        else:
            audio_filter_chain = "[1:a]anull[v_delayed]"
    else:
        audio_filter_chain = ""

    # Trường hợp 1: Có cả Voiceover VÀ BGM
    if voiceover_path and voiceover_path.exists() and bgm_path and bgm_path.exists():
        filter_complex = (
            f"{audio_filter_chain}; "
            f"[2:a]volume={bgm_volume:.2f}[bgm_low]; "
            f"[v_delayed][bgm_low]amix=inputs=2:duration=first[a_mixed]; "
            f"[0:v]{ass_filter_str}[v_sub]"
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(voiceover_path),
            "-i",
            str(bgm_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "[v_sub]",
            "-map",
            "[a_mixed]",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    # Trường hợp 2: Chỉ có Voiceover (thay thế âm thanh video gốc)
    elif voiceover_path and voiceover_path.exists():
        filter_complex = f"{audio_filter_chain}; [0:v]{ass_filter_str}[v_sub]"
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(voiceover_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "[v_sub]",
            "-map",
            "[v_delayed]",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    # Trường hợp 3: Chỉ có BGM (hòa âm với tiếng video gốc nếu có)
    elif bgm_path and bgm_path.exists():
        filter_complex = (
            f"[1:a]volume={bgm_volume:.2f}[bgm_low]; "
            f"[0:a][bgm_low]amix=inputs=2:duration=first[a_mixed]; "
            f"[0:v]{ass_filter_str}[v_sub]"
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(bgm_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "[v_sub]",
            "-map",
            "[a_mixed]",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    # Trường hợp 4: Giữ nguyên âm thanh video gốc (hoặc video không tiếng)
    else:
        filter_complex = f"[0:v]{ass_filter_str}[v_sub]"
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "[v_sub]",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]

    logger.info(f"Đang render video đầu ra: {output_path.name} …")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        logger.error(f"FFmpeg render lỗi: {res.stderr}")
        raise RuntimeError(f"FFmpeg render video thất bại: {res.stderr}")

    logger.info(f"✅ Render thành công video: {output_path.name}")
    return output_path


def trim_video_by_ranges(
    video_path: Path,
    keep_ranges: list[dict[str, float]],
    output_path: Path,
) -> Path:
    """
    Cắt gọt video chỉ giữ lại các khoảng keep_ranges, loại bỏ hoàn toàn khoảng lặng chết.
    Đảm bảo A/V sync chính xác 100% bằng chuỗi filter trim & atrim kết hợp concat.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not keep_ranges:
        import shutil
        shutil.copyfile(video_path, output_path)
        return output_path

    n = len(keep_ranges)
    filter_parts = []
    concat_inputs = []

    for i, r in enumerate(keep_ranges):
        start = max(0.0, float(r["start"]))
        end = float(r["end"])
        filter_parts.append(
            f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[v{i}];"
            f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[a{i}];"
        )
        concat_inputs.append(f"[v{i}][a{i}]")

    filter_complex = "".join(filter_parts) + "".join(concat_inputs) + f"concat=n={n}:v=1:a=1[outv][outa]"

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-filter_complex",
        filter_complex,
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    logger.info(f"Đang cắt video ({n} đoạn) loại bỏ khoảng lặng: {output_path.name} …")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        logger.error(f"FFmpeg trim video lỗi: {res.stderr}")
        raise RuntimeError(f"FFmpeg trim video thất bại: {res.stderr}")

    logger.info(f"✅ Cắt video thành công: {output_path.name}")
    return output_path

