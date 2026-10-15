"""
app/services/caption/ass_renderer.py
────────────────────────────────────
Tạo file phụ đề ASS (.ass) với hiệu ứng Karaoke và ghép vào video bằng FFmpeg.
"""

import logging
import subprocess
from pathlib import Path
from typing import Any

from app.services.caption.audio_extractor import get_video_dimensions

logger = logging.getLogger(__name__)


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
        plain_text = plain_text.lower()

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
                word_clean = w["word"].strip().lower()
                karaoke_parts.append(f"{{\\k{dur_cs}}}{word_clean}")

            text_line = " ".join(karaoke_parts)
        else:
            # Fallback nếu câu không có word-level
            text_line = seg.get("text", "").lower()

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
