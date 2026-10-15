"""
app/services/video_translation/subtitles.py
───────────────────────────────────────────
Xử lý sinh, đọc, phân tích và làm sạch file phụ đề SRT/ASS.
"""

import re
from pathlib import Path
from typing import Any

from app.core.config import logger
from app.services.ad_filter_service import AdFilterService

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


def clean_subtitle_text(text: str) -> str:
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
    for pat in PROMPT_BOILERPLATE_PATTERNS:
        text = re.sub(pat, "", text, flags=re.IGNORECASE)
    # 4. Lọc bỏ các link quảng cáo nhỏ lẻ trong câu
    text = AdFilterService.clean_text_ads(text)
    # 5. Chuẩn hóa khoảng trắng
    text = " ".join(text.split())
    return text.strip()


def parse_srt_content(content: str) -> list[dict[str, Any]]:
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

            text = clean_subtitle_text(" ".join(lines))
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
                        txt = clean_subtitle_text(raw_txt)
                        if txt:
                            entries.append({"id": seg_id, "start": start, "end": end, "text": txt})
                except Exception as e:
                    logger.warning(f"Lỗi fallback parse block SRT: {e}")

    return entries


def parse_srt_file(srt_path: Path) -> list[dict[str, Any]]:
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
    return parse_srt_content(content)
