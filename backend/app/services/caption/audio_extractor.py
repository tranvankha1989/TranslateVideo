"""
app/services/caption/audio_extractor.py
───────────────────────────────────────
Trích xuất audio, đo kích thước video và cắt video bằng FFmpeg.
"""

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


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
