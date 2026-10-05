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

# Đọc cấu hình Whisper từ .env (Kích hoạt large-v3 làm mô hình chuẩn cao cấp 1.55 tỷ tham số)
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "large-v3").strip().lower()


def get_whisper_model(model_size: str | None = None) -> WhisperModel:
    """Khởi tạo hoặc trả về instance Faster-Whisper đã cache."""
    global _whisper_model, _current_model_size

    target_size = model_size or WHISPER_MODEL_SIZE
    if _whisper_model is not None and _current_model_size == target_size:
        return _whisper_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    cpu_threads = max(1, os.cpu_count() or 4)

    logger.info(
        f"🎙️ Đang tải Faster-Whisper model '{target_size}' trên {device} (compute={compute_type}, cpu_threads={cpu_threads}) …"
    )
    _whisper_model = WhisperModel(
        target_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=2 if device == "cpu" else 1,
    )
    _current_model_size = target_size
    logger.info("✅ Tải Faster-Whisper thành công.")
    return _whisper_model


def extract_audio(video_path: Path, output_audio_path: Path) -> Path:
    """
    Trích xuất âm thanh từ video sang định dạng WAV 16kHz Mono (chuẩn tối ưu cho Whisper).
    Kết hợp aresample=async=1:first_pts=0 chống lệch timestamp và chuẩn hóa âm lượng EBU R128 loudnorm
    giúp kích âm lượng các đoạn thoại nhỏ/thì thào lên dải chuẩn nghe rõ mà không làm vỡ âm sắc.
    Nếu video không có luồng âm thanh nào (video câm), tự động tạo âm thanh im lặng để không crash.
    """
    output_audio_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",
        "-af", "aresample=async=1:first_pts=0,loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(output_audio_path),
    ]
    logger.info(f"Trích xuất âm thanh chuẩn mốc thời gian & EBU R128 Loudnorm: {video_path.name} -> {output_audio_path.name}")
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
                "-c:a",
                "pcm_s16le",
                str(output_audio_path),
            ]
            subprocess.run(silent_cmd, capture_output=True, check=True)
            return output_audio_path

        logger.error(f"Lỗi khi trích xuất âm thanh: {res.stderr}")
        raise RuntimeError(f"FFmpeg extract audio thất bại: {res.stderr}")

    return output_audio_path


def separate_vocals_demucs(audio_path: Path, output_dir: Path, enable_demucs: bool = True) -> dict[str, Path]:
    """
    Tách giọng nói (vocals.wav) và nhạc nền/hiệu ứng (no_vocals.wav / bgm.wav) bằng Demucs AI (Meta AI).
    Nếu demucs chưa được cài đặt hoặc có lỗi, tự động fallback an toàn qua FFmpeg Vocal/BGM filter đa băng tần.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    vocals_path = output_dir / "vocals.wav"
    bgm_path = output_dir / "no_vocals.wav"

    if vocals_path.exists() and bgm_path.exists() and vocals_path.stat().st_size > 1000:
        return {"vocals": vocals_path, "bgm": bgm_path, "method": "cache"}

    # Demucs AI xử lý nguồn âm thanh cục bộ (chỉ mất ~20-30s trên CPU/GPU)
    # Ưu tiên chạy Demucs để tách sạch giọng nói và nhạc nền chính xác 100%

    if enable_demucs:
        try:
            import sys
            import shutil
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"🎙️ [Demucs AI] Bắt đầu tách giọng nói và nhạc nền (Device: {device.upper()})...")
            
            py_bin = sys.executable
            venv_py = Path(__file__).resolve().parent / "venv" / "Scripts" / "python.exe"
            if venv_py.exists():
                py_bin = str(venv_py)

            cmd = [
                py_bin,
                "-m", "demucs.separate",
                "--two-stems=vocals",
                "-n", "htdemucs",
                "-d", device,
                "-o", str(output_dir / "demucs_out"),
                str(audio_path),
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=360)
            if res.returncode == 0:
                audio_stem = audio_path.stem
                demucs_vocals = output_dir / "demucs_out" / "htdemucs" / audio_stem / "vocals.wav"
                demucs_bgm = output_dir / "demucs_out" / "htdemucs" / audio_stem / "no_vocals.wav"
                if demucs_vocals.exists() and demucs_bgm.exists():
                    shutil.copyfile(demucs_vocals, vocals_path)
                    shutil.copyfile(demucs_bgm, bgm_path)
                    logger.info("✨ [Demucs AI] Tách thành công Vocals và BGM chất lượng cao!")
                    return {"vocals": vocals_path, "bgm": bgm_path, "method": "demucs"}
            else:
                logger.warning(f"⚠️ Demucs CLI trả về mã {res.returncode}: {res.stderr[:200]}")
        except Exception as demucs_err:
            logger.warning(f"⚠️ Không thể chạy Demucs AI ({demucs_err}), chuyển sang tách âm thanh bằng FFmpeg multi-band filter...")

    # Fallback chất lượng cao bằng FFmpeg Multi-band Center-Channel Vocal / BGM Extraction
    try:
        import shutil
        # BGM: Trừ triệt để dải vocal trung tâm kết hợp low/high band
        cmd_bgm = [
            "ffmpeg", "-y", "-i", str(audio_path),
            "-af", "pan=stereo|c0=c0-c1|c1=c1-c0,volume=1.35",
            "-ar", "44100", "-ac", "2",
            str(bgm_path),
        ]
        subprocess.run(cmd_bgm, capture_output=True, check=True)

        # Vocals: Cắt lọc tần số giọng người (85Hz - 7000Hz), triệt tiêu tiếng ồn nền
        cmd_vocals = [
            "ffmpeg", "-y", "-i", str(audio_path),
            "-af", "highpass=f=95,lowpass=f=7200,afftdn=nf=-28,dynaudnorm=f=150:g=15",
            "-ar", "16000", "-ac", "1",
            str(vocals_path),
        ]
        subprocess.run(cmd_vocals, capture_output=True, check=True)
        return {"vocals": vocals_path, "bgm": bgm_path, "method": "ffmpeg_filter"}
    except Exception as e:
        logger.warning(f"⚠️ FFmpeg vocal separation fallback lỗi ({e}), sao chép audio gốc...")
        import shutil
        shutil.copyfile(audio_path, vocals_path)
        shutil.copyfile(audio_path, bgm_path)
        return {"vocals": vocals_path, "bgm": bgm_path, "method": "raw_copy"}


SENTENCE_ENDINGS = re.compile(r"[.!?。！？…]+['\"”’]?$")
CLAUSE_ENDINGS = re.compile(r"[,;:\-–—，、；：]+['\"”’]?$")


def heal_and_merge_segments(
    segments: list[dict[str, Any]],
    max_gap: float = 0.40,
    max_duration: float = 6.0,
) -> list[dict[str, Any]]:
    """
    Thuật toán tự động phát hiện và nối các câu bị ngắt quãng / chém đôi do AI ASR nhận diện nhầm,
    đồng thời tuân thủ kỷ luật nghiêm ngặt về nhịp thở và thời lượng để phục vụ lồng tiếng TTS.

    Quy tắc an toàn chống tràn câu:
    1. Giới hạn thời lượng: Tuyệt đối KHÔNG gộp 2 câu nếu tổng thời lượng sau khi gộp (curr_end - prev_start) vượt quá max_duration (6.0s).
    2. Giữ nguyên khoảng lặng ngắt nghỉ: Nếu khoảng cách nghỉ giữa 2 câu liên tiếp (curr_start - prev_end) >= max_gap (0.40s) hoặc < 0,
       BẮT BUỘC giữ tách rời làm 2 câu độc lập, không được gộp.
    3. Dấu câu kết thúc: Nếu câu trước đã kết thúc bằng dấu câu (. ? ! 。 ！ ？ …), TUYỆT ĐỐI không gộp câu sau vào.
    4. Mốc thời gian chuẩn xác: start giữ nguyên 100% của câu trước, end cập nhật bằng đúng end của câu sau.
    """
    if not segments or len(segments) <= 1:
        return segments

    SENTENCE_ENDS = ('.', '!', '?', '。', '！', '？', '…')
    CONNECTORS_VI = {
        "và", "nhưng", "hoặc", "vì", "mà", "để", "với", "rằng", "của", "tại", "thì", "là", "do",
        "nếu", "khi", "như", "thế", "nên", "cho", "về", "trong", "bởi", "tuy", "dù", "rồi", "lại"
    }
    CONNECTORS_EN = {
        "and", "but", "or", "because", "which", "that", "to", "with", "for", "about", "so",
        "then", "if", "when", "as", "although", "while", "where", "after", "before", "by"
    }
    CONNECTORS_ZH = {
        "和", "但是", "因为", "所以", "如果", "虽然", "而且", "或者", "关于", "然后", "就是", "还有"
    }

    merged: list[dict[str, Any]] = [dict(segments[0])]

    for seg in segments[1:]:
        prev = merged[-1]
        prev_txt = str(prev.get("text", "")).strip()
        curr_txt = str(seg.get("text", "")).strip()

        if not curr_txt:
            continue
        if not prev_txt:
            merged[-1] = dict(seg)
            continue

        prev_start = float(prev.get("start", 0.0))
        prev_end = float(prev.get("end", prev_start))
        curr_start = float(seg.get("start", 0.0))
        curr_end = float(seg.get("end", curr_start))
        gap = curr_start - prev_end
        merged_duration = curr_end - prev_start

        # 1. Điều kiện 1: Dấu câu kết thúc (. ? ! 。 ！ ？ …) -> Không bao giờ gộp
        has_sentence_end = any(prev_txt.endswith(punct) for punct in SENTENCE_ENDS)
        if has_sentence_end:
            merged.append(dict(seg))
            continue

        # 2. Điều kiện 2: Khoảng cách nghỉ giữa 2 câu >= max_gap (0.40s) hoặc bị ngược thời gian -> Không gộp
        if gap >= max_gap or gap < 0:
            merged.append(dict(seg))
            continue

        # 3. Điều kiện 3: Tổng thời lượng sau khi gộp vượt quá max_duration (6.0s) -> Không gộp
        if merged_duration > max_duration:
            merged.append(dict(seg))
            continue

        # 4. Kiểm tra xem câu sau có phải là vế tiếp nối tự nhiên (chữ thường hoặc từ nối)
        first_word = curr_txt.split()[0].lower() if curr_txt.split() else ""
        first_char = curr_txt[0]

        is_continuation = (
            first_char.islower()
            or first_word in CONNECTORS_VI
            or first_word in CONNECTORS_EN
            or any(curr_txt.startswith(zh_c) for zh_c in CONNECTORS_ZH)
            or (not has_sentence_end and gap <= 0.25)
        )

        if is_continuation:
            is_cjk = any('\u4e00' <= char <= '\u9fff' for char in prev_txt[-2:] + curr_txt[:2])
            separator = "" if is_cjk else " "

            # Ghép văn bản
            prev["text"] = f"{prev_txt}{separator}{curr_txt}".strip()
            
            # Cập nhật end của câu trước thành end của câu hiện tại (giữ nguyên start của prev)
            prev["end"] = round(curr_end, 3)

            # Bảo tồn danh sách word-level timestamps gốc từ Whisper
            if "words" in seg and isinstance(seg["words"], list):
                if "words" not in prev or not isinstance(prev["words"], list):
                    prev["words"] = []
                prev["words"].extend(seg["words"])

            if "original_text" in prev and "original_text" in seg:
                prev_orig = str(prev.get("original_text", "")).strip()
                curr_orig = str(seg.get("original_text", "")).strip()
                prev["original_text"] = f"{prev_orig}{separator}{curr_orig}".strip()
        else:
            merged.append(dict(seg))

    # Đánh lại ID cho các phân đoạn
    for i, s in enumerate(merged, start=1):
        s["id"] = i

    return merged


def sanitize_word_timestamps(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Khắc phục triệt để hiện tượng Whisper kéo dãn mốc 'end' của từ qua các khoảng lặng dài / đoạn nhạc.
    Giới hạn thời lượng tối đa hợp lý cho từng từ dựa theo số lượng âm tiết / ký tự thực tế.
    """
    if not words:
        return words
    for i in range(len(words)):
        w = words[i]
        w_text = w.get("word", "").strip()
        start = float(w.get("start", 0.0))
        end = float(w.get("end", start + 0.3))
        dur = max(0.08, end - start)
        is_cjk = any('\u4e00' <= char <= '\u9fff' or '\u3040' <= char <= '\u30ff' for char in w_text)
        
        # Ngưỡng thời lượng tối đa cho 1 từ đơn lẻ
        max_dur = max(0.50, len(w_text) * 0.35 + 0.20) if is_cjk else max(0.65, len(w_text) * 0.18 + 0.25)
        if dur > max_dur:
            if i + 1 < len(words):
                next_start = float(words[i + 1].get("start", end))
                w["end"] = round(min(start + max_dur, next_start), 3)
            else:
                w["end"] = round(start + max_dur, 3)
        else:
            w["end"] = round(end, 3)
        w["start"] = round(start, 3)
    return words


def resegment_words(
    all_words: list[dict[str, Any]],
    max_words: int = 8,
    max_chars: int = 36,
    min_silence_split: float = 0.40,
    min_duration: float = 3.0,
    max_duration: float = 6.0,
    min_words: int = 5,
) -> list[dict[str, Any]]:
    """
    Chia nhỏ toàn bộ danh sách từ thành các câu phụ đề ngắn gọn, đúng theo nhịp thở và tốc độ nói tự nhiên của diễn viên.
    - Giới hạn thời lượng: Mỗi câu chỉ dài từ 3.0 đến 6.0 giây (khoảng 5 đến 9 từ), chống tuyệt đối lỗi dồn câu kéo dài 15-35s.
    - Mốc thời gian chính xác: Bắt đúng mốc start tại từ đầu tiên và mốc end tại từ cuối cùng của nhịp nói đó.
    - Hỗ trợ đầy đủ tiếng Trung/Nhật/Hàn (CJK) và các ngôn ngữ có dấu câu đa dạng.
    """
    valid_words = [
        w for w in all_words
        if (w.get("word") if isinstance(w, dict) else getattr(w, "word", "")).strip()
    ]
    if not valid_words:
        return []

    # Chuẩn hóa về dạng dictionary đồng nhất
    normalized_words: list[dict[str, Any]] = []
    for w in valid_words:
        if isinstance(w, dict):
            normalized_words.append({
                "word": str(w.get("word", "")).strip(),
                "start": float(w.get("start", 0.0)),
                "end": float(w.get("end", 0.0)),
                "probability": float(w.get("probability", 1.0)),
            })
        else:
            normalized_words.append({
                "word": str(getattr(w, "word", "")).strip(),
                "start": float(getattr(w, "start", 0.0)),
                "end": float(getattr(w, "end", 0.0)),
                "probability": float(getattr(w, "probability", 1.0)),
            })

    normalized_words = sanitize_word_timestamps(normalized_words)

    # Kiểm tra xem có phải tiếng Trung / CJK hay không
    sample_text = "".join(w["word"] for w in normalized_words[:20])
    is_cjk = any('\u4e00' <= char <= '\u9fff' or '\u3040' <= char <= '\u30ff' for char in sample_text)
    effective_max_words = 14 if is_cjk else max_words
    effective_min_words = 6 if is_cjk else min_words
    effective_max_chars = 42 if is_cjk else max_chars

    new_segments: list[dict[str, Any]] = []
    current_words: list[dict[str, Any]] = []
    seg_id = 1

    for i, w in enumerate(normalized_words):
        current_words.append(w)
        word_text = w["word"]
        has_next = i < len(normalized_words) - 1
        next_w = normalized_words[i + 1] if has_next else None

        seg_start = current_words[0]["start"]
        curr_duration = w["end"] - seg_start
        word_count = len(current_words)
        silence_gap = (next_w["start"] - w["end"]) if next_w else 0.0

        # Kiểm tra khoảng cách tới dấu chấm hết câu gần nhất (lookahead 1-2 từ)
        words_until_sentence_end = 999
        for lookahead in range(1, 3):
            if i + lookahead < len(normalized_words):
                if SENTENCE_ENDINGS.search(normalized_words[i + lookahead]["word"]):
                    words_until_sentence_end = lookahead
                    break

        should_split = False

        if not has_next:
            should_split = True
        else:
            # 1. BẮT BUỘC NGẮT CỨNG: Thời lượng chạm trần max_duration (6.0s) hoặc số từ chạm max_words
            if curr_duration >= max_duration:
                should_split = True
            elif word_count >= effective_max_words:
                should_split = True

            # 2. DẤU CÂU KẾT THÚC (. ? ! 。 ！ ？ …)
            elif SENTENCE_ENDINGS.search(word_text):
                # Ngắt ngay khi hết câu nếu câu đã có độ dài hợp lý (>= min_duration hoặc >= min_words hoặc >= 2.0s)
                if curr_duration >= min_duration or word_count >= effective_min_words or silence_gap >= 0.30 or curr_duration >= 2.0:
                    should_split = True

            # 3. KHOẢNG LẶNG TỰ NHIÊN (NHỊP NGHỈ THỞ >= min_silence_split = 0.40s)
            elif silence_gap >= min_silence_split:
                # Nếu câu đã đạt từ 4 từ trở lên hoặc đã dài >= 2.5s thì tách theo nhịp thở của nhân vật
                if word_count >= 4 or curr_duration >= 2.5:
                    should_split = True

            # 4. DẤU PHẨY / NGẮT VẾ CÂU (, ; : -) khi câu đã đủ dài (>= 3.0s hoặc >= 5 từ)
            elif CLAUSE_ENDINGS.search(word_text):
                if curr_duration >= min_duration or word_count >= effective_min_words:
                    # Nếu sắp hết câu chính (chỉ còn 1-2 từ nữa), cố gộp nốt thay vì ngắt lơ lửng
                    if words_until_sentence_end <= 2 and (curr_duration + 1.2 <= max_duration):
                        should_split = False
                    else:
                        should_split = True

            # 5. DỰ BÁO: Nếu từ tiếp theo sẽ đẩy câu vượt quá max_duration (6.0s)
            elif next_w and (next_w["end"] - seg_start) > max_duration and word_count >= 3:
                should_split = True

        if should_split and current_words:
            # Bắt đúng mốc start tại từ đầu tiên và mốc end tại từ cuối cùng của nhịp nói
            s_start = current_words[0]["start"]
            s_end = current_words[-1]["end"]
            if s_end <= s_start:
                s_end = round(s_start + 0.3, 3)

            if is_cjk:
                seg_text = "".join(cw["word"] for cw in current_words)
            else:
                seg_text = " ".join(cw["word"] for cw in current_words)

            new_segments.append(
                {
                    "id": seg_id,
                    "start": round(s_start, 3),
                    "end": round(s_end, 3),
                    "text": seg_text.strip(),
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
    vad_filter: bool = True,
    vad_threshold: float = 0.35,
    min_speech_duration_ms: int = 150,
    min_silence_duration_ms: int = 500,
    speech_pad_ms: int = 500,
    beam_size: int = 5,
    word_timestamps: bool = True,
    task_dir: Path | None = None,
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
                # Tải file nhạc nền (BGM) về nếu worker đã bóc tách thành công bằng Demucs AI
                if bgm_filename or bgm_download_url:
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
        # 0.45: Đủ nhạy để bắt tiếng thì thào/hấp hối mà không bị kích hoạt bởi tiếng thở/ngắt nghỉ
        no_speech_threshold=0.45,
        
        # -1.4: Chấp nhận âm lượng nhỏ nhưng vẫn chặn đứng các token đoán mò có xác suất thấp
        log_prob_threshold=-1.4,
        
        # 2.4: Ngưỡng zlib tiêu chuẩn phát hiện lặp vô tận
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
        no_speech_p = getattr(s, "no_speech_prob", 0.0)
        avg_logprob = getattr(s, "avg_logprob", 0.0)
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
    prompt_snippet = None
    if reference_script and reference_script.strip():
        prompt_snippet = reference_script.strip()[:450]

    # Tách giọng nói sạch (Vocals) bằng Demucs AI để loại bỏ 100% nhạc nền trước khi đưa vào Whisper
    vocal_res = separate_vocals_demucs(audio_path, audio_path.parent, enable_demucs=True)
    whisper_audio = vocal_res.get("vocals", audio_path)

    stt_res = transcribe_with_remote_or_local(
        audio_path=whisper_audio,
        language=language,
        model_size=model_size,
        initial_prompt=prompt_snippet,
        vad_filter=True,
        vad_threshold=vad_threshold,
        min_speech_duration_ms=min_speech_duration_ms,
        min_silence_duration_ms=min_silence_duration_ms,
        speech_pad_ms=speech_pad_ms,
        beam_size=beam_size,
        word_timestamps=True,
    )
    result_segments = stt_res[0] if isinstance(stt_res, (list, tuple)) else stt_res

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
    with open(output_ass_path, "w", encoding="utf-8-sig") as f:
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

