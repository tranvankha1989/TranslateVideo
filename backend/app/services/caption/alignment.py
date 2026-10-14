"""
app/services/caption/alignment.py
─────────────────────────────────
Thuật toán ghép câu, chuẩn hóa mốc thời gian và so khớp với kịch bản tham chiếu.
"""

import re
import difflib
import logging
from typing import Any

logger = logging.getLogger(__name__)

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

    # ── Post-processing: Auto Re-balance & Anti-Orphan Chunks ─────────────────
    # Tự động gộp triệt để các câu cụt / mồ côi (1-3 từ hoặc < 1.2s) vào câu trước hoặc sau
    if len(new_segments) > 1:
        balanced_segments: list[dict[str, Any]] = []

        for idx, seg in enumerate(new_segments):
            words = seg.get("words", [])
            dur = seg["end"] - seg["start"]
            w_count = len(words)

            # Kiểm tra xem câu này có bị cụt mồ côi không (<= 3 từ hoặc dur < 1.2s)
            if (w_count <= 3 or dur < 1.2) and balanced_segments:
                prev_seg = balanced_segments[-1]
                prev_words = prev_seg.get("words", [])
                gap = seg["start"] - prev_seg["end"]

                # Điều kiện gộp: Khoảng nghỉ nhỏ (< 1.2s) và tổng từ không quá dài (<= 13 từ)
                if gap < 1.2 and (len(prev_words) + w_count) <= (16 if is_cjk else 13):
                    merged_words = prev_words + words
                    prev_seg["words"] = merged_words
                    prev_seg["end"] = round(words[-1]["end"], 3)
                    if is_cjk:
                        prev_seg["text"] = "".join(w["word"] for w in merged_words)
                    else:
                        prev_seg["text"] = " ".join(w["word"] for w in merged_words)
                    continue

            # Hoặc nếu là câu cụt ở đầu danh sách, gộp vào câu kế tiếp
            if (w_count <= 3 or dur < 1.2) and idx < len(new_segments) - 1:
                next_seg = new_segments[idx + 1]
                next_words = next_seg.get("words", [])
                gap = next_seg["start"] - seg["end"]

                if gap < 1.2 and (w_count + len(next_words)) <= (16 if is_cjk else 13):
                    merged_words = words + next_words
                    next_seg["words"] = merged_words
                    next_seg["start"] = round(words[0]["start"], 3)
                    if is_cjk:
                        next_seg["text"] = "".join(w["word"] for w in merged_words)
                    else:
                        next_seg["text"] = " ".join(w["word"] for w in merged_words)
                    continue

            balanced_segments.append(seg)

        # Đánh lại ID tuần tự và chuẩn hóa chữ thường
        for i, s in enumerate(balanced_segments, 1):
            s["id"] = i
            s["text"] = s.get("text", "").lower()
            if "words" in s:
                for w in s["words"]:
                    if "word" in w:
                        w["word"] = w["word"].lower()
        new_segments = balanced_segments
    else:
        for s in new_segments:
            s["text"] = s.get("text", "").lower()
            if "words" in s:
                for w in s["words"]:
                    if "word" in w:
                        w["word"] = w["word"].lower()

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
