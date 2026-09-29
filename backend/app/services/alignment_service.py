"""
app/services/alignment_service.py
─────────────────────────────────
Dịch vụ cân chỉnh tốc độ âm thanh và khớp trục thời gian (Speed Alignment):
- Tự động co giãn tốc độ câu lồng tiếng bằng FFmpeg 'atempo' (SpeedRate) để vừa khít mốc thời gian.
- Ghép nối chính xác từng mili-giây lên trục thời gian của toàn bộ video.
- Hòa trộn dải giọng đọc với nhạc nền gốc (BGM) theo tỷ lệ mong muốn.
"""

import os
import uuid
import math
import shutil
import subprocess
from pathlib import Path
from typing import Any
from pydub import AudioSegment
import soundfile as sf

from app.core.config import OUTPUTS_DIR, logger
from app.services.dubbing_service import get_audio_duration

ALIGNMENT_OUTPUT_DIR = OUTPUTS_DIR / "alignment"
ALIGNMENT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


class AlignmentService:
    """Xử lý co giãn tốc độ giọng đọc và tạo dải âm thanh khớp timeline."""

    @classmethod
    def adjust_speed(
        cls,
        audio_path: str | Path,
        target_duration: float,
        max_speed_rate: float = 1.35,
        min_speed_rate: float = 0.85,
        output_path: str | Path | None = None,
    ) -> dict[str, Any]:
        """
        Co giãn tốc độ của file âm thanh để khớp với target_duration bằng FFmpeg atempo filter.
        Giữ nguyên cao độ giọng nói (pitch-preserving time stretch).
        """
        src = Path(audio_path)
        if not src.exists():
            raise FileNotFoundError(f"Không tìm thấy file: {src}")

        orig_dur = get_audio_duration(src)
        if orig_dur <= 0 or target_duration <= 0:
            return {
                "original_duration": orig_dur,
                "target_duration": target_duration,
                "final_duration": orig_dur,
                "applied_speed": 1.0,
                "output_audio_path": str(src),
                "output_audio_url": f"/outputs/{src.name}",
            }

        # Tính tỷ lệ tốc độ cần thiết S = T_orig / T_target
        calc_speed = orig_dur / target_duration

        # NGUYÊN TẮC VÀNG TRÁNH GIỌNG "LÚC NHANH LÚC CHẬM" & KHÔNG BAO GIỜ BỊ CẮT CHỮ:
        # 1. Nếu câu đọc vừa vặn hoặc ngắn hơn thời lượng cảnh quay (calc_speed <= 1.05),
        #    giữ nguyên tốc độ tự nhiên 1.0x.
        # 2. Khi câu tiếng Việt dài hơn, tăng tốc độ tương ứng để phát trọn vẹn 100% nội dung
        #    (cho phép tăng tốc thích ứng tối đa tới max_speed_rate hoặc 1.50x đối với câu quá dài).
        if calc_speed <= 1.05:
            applied_speed = 1.0
        else:
            effective_max_speed = max(max_speed_rate, 1.45)
            applied_speed = min(effective_max_speed, calc_speed)

        if output_path is None:
            filename = f"aligned_{src.stem}_{uuid.uuid4().hex[:6]}.wav"
            output_path = ALIGNMENT_OUTPUT_DIR / filename
        else:
            output_path = Path(output_path)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Nếu độ lệch thời gian không đáng kể (dưới 3%), giữ nguyên
        if abs(applied_speed - 1.0) < 0.03:
            shutil.copyfile(src, output_path)
            final_dur = orig_dur
            applied_speed = 1.0
        else:
            # Xây dựng filter atempo cho FFmpeg (hỗ trợ nhiều cấp độ nếu speed > 2.0 hoặc < 0.5)
            filters = []
            s = applied_speed
            while s > 2.0:
                filters.append("atempo=2.0")
                s /= 2.0
            while s < 0.5:
                filters.append("atempo=0.5")
                s /= 0.5
            filters.append(f"atempo={s:.4f}")

            filter_str = ",".join(filters)

            cmd = [
                "ffmpeg", "-y",
                "-i", str(src),
                "-filter:a", filter_str,
                "-ar", "44100",
                "-ac", "2",
                str(output_path),
            ]
            try:
                subprocess.run(cmd, capture_output=True, check=True)
                final_dur = get_audio_duration(output_path)
            except Exception as e:
                logger.error(f"[AlignmentService] Lỗi FFmpeg atempo: {e}. Dùng file gốc.")
                shutil.copyfile(src, output_path)
                final_dur = orig_dur
                applied_speed = 1.0

        rel_url = f"/outputs/alignment/{output_path.name}" if output_path.parent.name == "alignment" else f"/outputs/dubbing/{output_path.parent.name}/{output_path.name}"

        return {
            "original_duration": round(orig_dur, 3),
            "target_duration": round(target_duration, 3),
            "final_duration": round(final_dur, 3),
            "applied_speed": round(applied_speed, 3),
            "output_audio_path": str(output_path),
            "output_audio_url": rel_url,
        }

    @classmethod
    def build_full_timeline(
        cls,
        segments: list[dict[str, Any]],
        total_video_duration: float,
        max_speed_rate: float = 1.35,
        bgm_path: str | Path | None = None,
        bgm_volume: float = 0.25,
        voice_volume: float = 1.0,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Ráp nối toàn bộ các câu audio lồng tiếng vào đúng mốc mili-giây (start) trên trục timeline,
        đồng thời hòa âm cùng nhạc nền gốc BGM. Bảo toàn 100% âm thanh không bao giờ bị cắt cụt đuôi câu.
        """
        if not session_id:
            session_id = uuid.uuid4().hex[:12]

        session_dir = ALIGNMENT_OUTPUT_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        total_ms = int(max(1.0, total_video_duration) * 1000)

        # 1. Khởi tạo dải âm thanh im lặng (silent audio canvas)
        full_voice = AudioSegment.silent(duration=total_ms, frame_rate=44100)

        adjusted_segments = []
        current_playhead_ms = 0

        for i, seg in enumerate(segments):
            audio_path = seg.get("audio_path")
            if not audio_path or not Path(audio_path).exists():
                continue

            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", 0.0))
            if start < 0:
                start = 0.0
            if end <= start:
                end = start + 1.5

            seg_dur = max(0.1, end - start)

            # Khung thời lượng tối đa cho phép trước khi nhân vật kế tiếp mở miệng nói
            if i + 1 < len(segments):
                next_start = float(segments[i + 1].get("start", end))
                if next_start > start:
                    # Cho phép câu thoại đọc tự nhiên kéo dài vào khoảng lặng trước câu tiếp theo
                    available_dur = max(0.3, next_start - start)
                else:
                    available_dur = max(0.3, seg_dur)
            else:
                available_dur = max(0.3, total_video_duration - start)

            actual_dur = get_audio_duration(audio_path)

            # Cân chỉnh mục tiêu thời lượng
            if actual_dur <= available_dur * 1.05:
                target_dur = actual_dur
            else:
                target_dur = available_dur

            # KHÓA CHẶT MỐC THỜI GIAN THEO LỜI THOẠI NHÂN VẬT (Lip-Sync Lock):
            # Cố định start_ms theo đúng thời điểm nhân vật mở miệng trong video.
            start_ms = max(0, int(start * 1000))

            # Co giãn tốc độ thích ứng để vừa vặn
            adj_file = session_dir / f"aligned_{Path(audio_path).stem}.wav"
            adj_res = cls.adjust_speed(
                audio_path=audio_path,
                target_duration=target_dur,
                max_speed_rate=max_speed_rate,
                output_path=adj_file,
            )

            # Nạp câu audio đã cân chỉnh
            try:
                clip = AudioSegment.from_file(adj_res["output_audio_path"])

                # 1. CHUẨN HÓA ÂM LƯỢNG TỰ ĐỘNG CHO TỪNG CÂU THOẠI (Loudness Normalization):
                # San phẳng chênh lệch giữa câu ngắn/câu dài, câu hỏi/câu cảm thán, giọng nam/giọng nữ về mức chuẩn -18.0 dBFS
                TARGET_VOICE_DBFS = -18.0
                if clip.dBFS != -float("inf") and clip.dBFS < 0:
                    loudness_diff = TARGET_VOICE_DBFS - clip.dBFS
                    clamped_gain = max(-5.0, min(7.0, loudness_diff))
                    clip = clip.apply_gain(clamped_gain)

                # Điều chỉnh âm lượng giọng tổng thể nếu có cấu hình từ người dùng
                if voice_volume != 1.0 and voice_volume > 0:
                    gain_db = 20 * math.log10(voice_volume)
                    clip = clip.apply_gain(gain_db)

                # BẢO TOÀN 100% NỘI DUNG ÂM THANH (Không cắt cụt đuôi câu):
                # Chỉ giới hạn nếu câu bị tràn quá thời lượng toàn bộ video
                if start_ms + len(clip) > total_ms:
                    remaining_ms = max(100, total_ms - start_ms)
                    clip = clip[:remaining_ms].fade_out(30)

                # Đặt câu audio vào timeline chính xác
                full_voice = full_voice.overlay(clip, position=start_ms)

                # Cập nhật đầu đọc thời gian hiện tại
                clip_dur_ms = len(clip)
                current_playhead_ms = start_ms + clip_dur_ms

                seg_copy = dict(seg)
                seg_copy["aligned_audio_path"] = adj_res["output_audio_path"]
                seg_copy["applied_speed"] = adj_res["applied_speed"]
                seg_copy["final_duration"] = adj_res["final_duration"]
                adjusted_segments.append(seg_copy)

            except Exception as e:
                logger.error(f"[Alignment Timeline] Lỗi ghép câu {seg.get('id')}: {e}")

        # Chuẩn hóa dải giọng đọc sang 44100Hz Stereo
        if full_voice.channels != 2:
            full_voice = full_voice.set_channels(2)
        full_voice = full_voice.set_frame_rate(44100)

        # 2. Hòa âm chuẩn thuyết minh phim (Sidechain Audio Ducking):
        # Tự động hạ nhỏ nhạc nền khi nhân vật cất tiếng thuyết minh và tăng to lại khi kết thúc câu.
        final_audio = full_voice
        output_file = session_dir / "final_dubbed_audio.wav"

        if bgm_path and Path(bgm_path).exists():
            voice_temp_file = session_dir / "voice_timeline_raw.wav"
            full_voice.export(str(voice_temp_file), format="wav")
            
            from audio_processor import mix_voice_with_bgm_ducking
            duck_ok = mix_voice_with_bgm_ducking(
                voice_path=str(voice_temp_file),
                bgm_path=str(bgm_path),
                output_path=str(output_file),
                bgm_volume=bgm_volume,
                ducking_depth_db=-14.0,
                attack_ms=250,
                release_ms=600,
                sample_rate=44100,
                export_format="wav",
            )
            
            if not duck_ok or not output_file.exists() or output_file.stat().st_size == 0:
                # Fallback hòa trộn bằng Pydub nếu FFmpeg sidechain gặp sự cố
                try:
                    bgm = AudioSegment.from_file(str(bgm_path))
                    if bgm.channels != 2:
                        bgm = bgm.set_channels(2)
                    bgm = bgm.set_frame_rate(44100)

                    if len(bgm) < total_ms:
                        loop_count = int(math.ceil(total_ms / len(bgm)))
                        bgm = (bgm * loop_count)[:total_ms]
                    else:
                        bgm = bgm[:total_ms]

                    if bgm.dBFS < -26.0 and bgm.dBFS != -float("inf"):
                        bgm = bgm.apply_gain(-20.0 - bgm.dBFS)

                    bgm_gain_db = 20 * math.log10(max(0.01, bgm_volume))
                    ducked_bgm = bgm.apply_gain(bgm_gain_db)
                    final_audio = ducked_bgm.overlay(full_voice)
                    final_audio.export(str(output_file), format="wav")
                    logger.info(f"Đã hòa âm thuyết minh fallback Pydub với âm lượng nền {bgm_volume*100:.0f}%")
                except Exception as e:
                    logger.warning(f"Lỗi khi hòa âm BGM: {e}. Xuất dải giọng đọc thuần túy.")
                    full_voice.export(str(output_file), format="wav")
        else:
            full_voice.export(str(output_file), format="wav")

        final_duration = get_audio_duration(output_file)

        return {
            "session_id": session_id,
            "final_audio_path": str(output_file),
            "final_audio_url": f"/outputs/alignment/{session_id}/final_dubbed_audio.wav",
            "total_duration": round(final_duration, 3),
            "adjusted_segments": adjusted_segments,
        }
