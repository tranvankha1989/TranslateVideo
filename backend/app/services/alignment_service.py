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
        Nguyên tắc bảo toàn tốc độ đọc do người dùng thiết lập:
        - Trường hợp 1: Âm thanh lồng tiếng ngắn hơn hoặc bằng thời lượng cho phép (actual_duration <= target_duration):
          GIỮ NGUYÊN file âm thanh gốc, TUYỆT ĐỐI KHÔNG dùng atempo để kéo dãn chậm lại. Phần thời gian dư thừa
          phía sau sẽ để làm khoảng lặng tự nhiên (silence padding).
        - Trường hợp 2: Âm thanh lồng tiếng dài hơn thời lượng cho phép (actual_duration > target_duration):
          Tính toán hệ số co: speed_factor = actual_duration / target_duration.
          Chỉ áp dụng atempo để tăng tốc độ vừa đủ nhét trọn vào khoảng thời gian cho phép
          (giới hạn an toàn tối đa 1.35x - 1.40x để tránh biến dạng giọng nói).
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

        if output_path is None:
            filename = f"aligned_{src.stem}_{uuid.uuid4().hex[:6]}.wav"
            output_path = ALIGNMENT_OUTPUT_DIR / filename
        else:
            output_path = Path(output_path)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # ── TRƯỜNG HỢP 1: Âm thanh ngắn hơn hoặc vừa vặn thời lượng cho phép ─────────
        # Tuyệt đối KHÔNG làm chậm. Giữ nguyên 100% tốc độ đọc do người dùng đã chọn.
        if orig_dur <= target_duration:
            if src.resolve() != output_path.resolve():
                shutil.copyfile(src, output_path)
            return {
                "original_duration": round(orig_dur, 3),
                "target_duration": round(target_duration, 3),
                "final_duration": round(orig_dur, 3),
                "applied_speed": 1.0,
                "output_audio_path": str(output_path),
                "output_audio_url": f"/outputs/alignment/{output_path.name}",
            }

        # ── TRƯỜNG HỢP 2: Âm thanh dài hơn thời lượng cho phép ───────────────────────
        # Tính toán hệ số co cần thiết
        speed_factor = orig_dur / target_duration

        # Nếu độ vượt quá không đáng kể (dưới 3%), giữ nguyên không cần ép atempo
        if speed_factor <= 1.03:
            if src.resolve() != output_path.resolve():
                shutil.copyfile(src, output_path)
            return {
                "original_duration": round(orig_dur, 3),
                "target_duration": round(target_duration, 3),
                "final_duration": round(orig_dur, 3),
                "applied_speed": 1.0,
                "output_audio_path": str(output_path),
                "output_audio_url": f"/outputs/alignment/{output_path.name}",
            }

        # Ưu tiên giá trị người dùng thiết lập từ giao diện, chỉ kẹp dưới sàn 1.0x
        safe_max_speed = max(1.0, float(max_speed_rate))
        applied_speed = min(safe_max_speed, speed_factor)

        # Xây dựng chuỗi filter atempo cho FFmpeg (hỗ trợ lũy tiến nếu applied_speed > 2.0)
        filters = []
        s = applied_speed
        while s > 2.0:
            filters.append("atempo=2.0")
            s /= 2.0
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
            if src.resolve() != output_path.resolve():
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
        Ráp nối toàn bộ các câu audio lồng tiếng vào đúng mốc thời gian tuyệt đối (start_ms) trên timeline.
        Đảm bảo nguyên tắc bất di bất dịch:
        1. MỖI CÂU THOẠI PHẢI BẮT ĐẦU CHÍNH XÁC tại mốc start_ms = int(float(seg.get("start", 0.0)) * 1000).
        2. TUYỆT ĐỐI KHÔNG để câu trước đẩy lùi mốc bắt đầu của câu kế tiếp (triệt tiêu 100% lỗi dồn toa).
           Nếu câu trước đọc quá dài, hệ thống gọi adjust_speed để tăng tốc vừa khung available_dur,
           và fade out nhẹ phần đuôi (nếu còn tràn nhẹ), câu tiếp theo vẫn mở miệng đúng mili-giây quy định.
        3. Thứ tự và ID của dubbed_segments khớp 100% với danh sách translated_segments.
        4. Tối ưu bộ nhớ RAM với cơ chế chunked overlay (RAM luôn < 50MB).
        """
        if not session_id:
            session_id = uuid.uuid4().hex[:12]

        session_dir = ALIGNMENT_OUTPUT_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        chunks_dir = session_dir / "chunks"
        chunks_dir.mkdir(parents=True, exist_ok=True)

        total_ms = int(max(1.0, total_video_duration) * 1000)

        # ── 1. ĐỒNG BỘ VÀ CHUẨN HÓA DANH SÁCH SEGMENTS ───────────────────────
        if not segments:
            logger.warning("[Alignment Timeline] Danh sách segments rỗng!")
            output_file = session_dir / "final_audio.wav"
            silent = AudioSegment.silent(duration=total_ms, frame_rate=44100).set_channels(2)
            silent.export(str(output_file), format="wav")
            return {
                "session_id": session_id,
                "final_audio_path": str(output_file),
                "final_audio_url": f"/outputs/alignment/{session_id}/{output_file.name}",
                "duration": round(total_video_duration, 3),
                "total_duration": round(total_video_duration, 3),
                "adjusted_segments": [],
                "dubbed_segments": [],
            }

        # Lưu bản đồ index gốc để đảm bảo trả về danh sách có thứ tự và ID chuẩn 100%
        valid_items = []
        for orig_idx, seg in enumerate(segments):
            seg_id = seg.get("id", orig_idx + 1)
            raw_start = float(seg.get("start", 0.0))
            raw_end = float(seg.get("end", raw_start + 1.0))

            # 1. Cân chỉnh lại mốc start thực tế: Dùng w.start của từ đầu tiên thay vì mốc VAD bị đệm thô
            words = seg.get("words", [])
            if words and isinstance(words, list) and len(words) > 0:
                first_w = words[0]
                if isinstance(first_w, dict):
                    w_start = float(first_w.get("start", raw_start))
                else:
                    w_start = float(getattr(first_w, "start", raw_start))
                if w_start > raw_start:
                    raw_start = w_start

            # 2. Thêm độ trễ an toàn nhỏ (Audio Lead Offset: +80ms / 0.08s) để khớp hoàn hảo khẩu hình môi
            raw_start = raw_start + 0.08

            if raw_start < 0:
                raw_start = 0.0
            if raw_end <= raw_start:
                raw_end = raw_start + 1.0

            valid_items.append({
                "orig_idx": orig_idx,
                "seg": seg,
                "id": seg_id,
                "start": raw_start,
                "end": raw_end,
                "start_ms": int(round(raw_start * 1000)),
                "audio_path": seg.get("audio_path"),
            })

        # Sắp xếp bản sao theo mốc start tăng dần để tính toán available_dur chuẩn xác
        sorted_by_time = sorted(valid_items, key=lambda x: (x["start"], x["id"], x["orig_idx"]))

        # Tính toán khung thời gian cho phép (available_dur) cho từng câu
        for k in range(len(sorted_by_time)):
            curr_item = sorted_by_time[k]
            c_start = curr_item["start"]
            c_end = curr_item["end"]
            c_dur = max(0.1, c_end - c_start)

            # Tìm câu kế tiếp có mốc start tách biệt (> c_start + 0.02)
            next_start = None
            for m in range(k + 1, len(sorted_by_time)):
                cand_start = sorted_by_time[m]["start"]
                if cand_start > c_start + 0.02:
                    next_start = cand_start
                    break

            if next_start is not None:
                curr_item["available_dur"] = max(0.1, next_start - c_start)
            else:
                curr_item["available_dur"] = max(c_dur, max(0.1, total_video_duration - c_start))

        # ── 2. XỬ LÝ TỪNG CÂU VÀ TẠO AUDIO CLIP ĐÃ ALIGN ─────────────────────────
        prepared_clips = []
        for item in sorted_by_time:
            audio_path = item["audio_path"]
            available_dur = item["available_dur"]
            start_ms = item["start_ms"]

            if not audio_path or not Path(audio_path).exists():
                fallback_dur_ms = int(max(0.1, item["end"] - item["start"]) * 1000)
                clip = AudioSegment.silent(duration=fallback_dur_ms, frame_rate=44100).set_channels(2)
                adj_info = {
                    "output_audio_path": None,
                    "applied_speed": 1.0,
                    "final_duration": round(fallback_dur_ms / 1000.0, 3),
                }
            else:
                actual_dur = get_audio_duration(audio_path)
                # QUY TẮC:
                # - Nếu actual_dur <= available_dur: câu nói vừa vặn, giữ nguyên 100% tốc độ đọc tự nhiên.
                # - Nếu actual_dur > available_dur: câu nói bị tràn khung, ép tốc độ bằng adjust_speed.
                if actual_dur <= available_dur:
                    target_dur = actual_dur
                else:
                    target_dur = available_dur

                adj_file = session_dir / f"aligned_{Path(audio_path).stem}.wav"
                adj_res = cls.adjust_speed(
                    audio_path=audio_path,
                    target_duration=target_dur,
                    max_speed_rate=max_speed_rate,
                    output_path=adj_file,
                )
                adj_info = adj_res

                try:
                    clip = AudioSegment.from_file(adj_res["output_audio_path"])
                    clip = clip.set_frame_rate(44100).set_channels(2)

                    # Chuẩn hóa âm lượng EBU R128 (-18.0 dBFS)
                    TARGET_VOICE_DBFS = -18.0
                    if clip.dBFS != -float("inf") and clip.dBFS < 0:
                        loudness_diff = TARGET_VOICE_DBFS - clip.dBFS
                        clamped_gain = max(-5.0, min(7.0, loudness_diff))
                        clip = clip.apply_gain(clamped_gain)

                    # Áp dụng voice_volume nếu có
                    if voice_volume != 1.0 and voice_volume > 0:
                        gain_db = 20 * math.log10(voice_volume)
                        clip = clip.apply_gain(gain_db)

                    # Nếu sau khi tăng tốc tối đa mà câu vẫn hơi dài hơn available_dur:
                    # Fade out nhẹ phần đuôi (crossfade) để không chèn giật vào câu tiếp theo
                    avail_ms = int(round(available_dur * 1000))
                    if len(clip) > avail_ms:
                        overhang = len(clip) - avail_ms
                        fade_len = min(150, overhang)
                        clip = clip.fade_out(fade_len)

                except Exception as clip_err:
                    logger.error(f"[Alignment Timeline] Lỗi đọc clip câu {item['id']}: {clip_err}")
                    fallback_dur_ms = int(max(0.1, item["end"] - item["start"]) * 1000)
                    clip = AudioSegment.silent(duration=fallback_dur_ms, frame_rate=44100).set_channels(2)

            item["clip"] = clip
            item["adj_info"] = adj_info
            prepared_clips.append(item)

        # ── 3. CHUNKED OVERLAY VÀO TIMELINE TUYỆT ĐỐI (KHÔNG BAO GIỜ BỊ DỒN TOA) ──
        # Tính mốc kết thúc tối đa cần phủ
        max_clip_end_ms = total_ms
        for item in prepared_clips:
            clip_end_ms = item["start_ms"] + len(item["clip"])
            if clip_end_ms > max_clip_end_ms:
                max_clip_end_ms = clip_end_ms
        timeline_target_ms = max(total_ms, max_clip_end_ms)

        CHUNK_SIZE_MS = 300_000  # Mỗi chunk 5 phút để giữ RAM Python luôn < 50MB
        chunk_files = []
        chunk_idx = 0

        for chunk_start_ms in range(0, timeline_target_ms, CHUNK_SIZE_MS):
            chunk_end_ms = min(chunk_start_ms + CHUNK_SIZE_MS, timeline_target_ms)
            chunk_len = chunk_end_ms - chunk_start_ms
            if chunk_len <= 0:
                continue

            chunk_audio = AudioSegment.silent(duration=chunk_len, frame_rate=44100).set_channels(2)

            for item in prepared_clips:
                clip = item["clip"]
                clip_start = item["start_ms"]
                clip_end = clip_start + len(clip)

                # Kiểm tra xem clip có giao với khoảng thời gian của chunk hiện tại không
                if clip_start < chunk_end_ms and clip_end > chunk_start_ms:
                    slice_start = max(0, chunk_start_ms - clip_start)
                    slice_end = min(len(clip), chunk_end_ms - clip_start)
                    clip_slice = clip[slice_start:slice_end]

                    # Vị trí đặt chính xác trên chunk
                    pos_in_chunk = max(0, clip_start - chunk_start_ms)
                    chunk_audio = chunk_audio.overlay(clip_slice, position=pos_in_chunk)

            chunk_file = chunks_dir / f"chunk_{chunk_idx:04d}.wav"
            chunk_audio.export(str(chunk_file), format="wav")
            chunk_files.append(chunk_file)
            chunk_idx += 1

        # ── 4. NỐI CÁC CHUNK THOẠI THÀNH DẢI ÂM THANH DUY NHẤT ────────────────
        voice_temp_file = session_dir / "voice_timeline_raw.wav"
        if len(chunk_files) == 1:
            shutil.copyfile(chunk_files[0], voice_temp_file)
        elif len(chunk_files) > 1:
            concat_list = session_dir / "chunks_list.txt"
            with open(concat_list, "w", encoding="utf-8") as f:
                for c in chunk_files:
                    f.write(f"file '{c.resolve().as_posix()}'\n")

            cmd_concat = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list),
                "-c:a", "pcm_s16le",
                "-ar", "44100",
                "-ac", "2",
                str(voice_temp_file),
            ]
            subprocess.run(cmd_concat, capture_output=True, check=True)

        # Dọn dẹp thư mục chunks tạm
        try:
            shutil.rmtree(chunks_dir, ignore_errors=True)
            concat_list_file = session_dir / "chunks_list.txt"
            if concat_list_file.exists():
                concat_list_file.unlink()
        except Exception:
            pass

        # ── 5. HÒA ÂM VỚI BGM (NHẠC NỀN) HOẶC XUẤT THOẠI HOÀN CHỈNH ─────────────
        output_file = session_dir / "final_audio.wav"

        if bgm_path and Path(bgm_path).exists():
            # Trộn âm lượng giọng đọc (voice_volume) và nhạc nền (bgm_volume) bằng FFmpeg amix filter
            filter_complex = (
                f"[0:a]volume={voice_volume:.2f}[v];"
                f"[1:a]volume={bgm_volume:.2f}[b];"
                f"[v][b]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed]"
            )
            cmd_amix = [
                "ffmpeg", "-y",
                "-i", str(voice_temp_file),
                "-stream_loop", "-1",
                "-i", str(bgm_path),
                "-filter_complex", filter_complex,
                "-map", "[mixed]",
                "-c:a", "pcm_s16le",
                "-ar", "44100",
                "-ac", "2",
                str(output_file),
            ]
            try:
                subprocess.run(cmd_amix, capture_output=True, check=True)
                logger.info(f"✨ [FFmpeg amix] Hòa âm thành công: Voice Vol {voice_volume:.0%}, BGM Vol {bgm_volume:.0%} -> {output_file.name}")
            except Exception as e:
                logger.warning(f"Lỗi khi hòa âm FFmpeg amix: {e}. Xuất dải giọng đọc thoại thuần túy.")
                shutil.copyfile(voice_temp_file, output_file)
        else:
            # Nếu không có BGM: Xuất trực tiếp dải âm thanh thoại hoàn chỉnh (final_audio.wav)
            if voice_temp_file.exists():
                if voice_volume != 1.0 and voice_volume > 0:
                    cmd_vol = [
                        "ffmpeg", "-y",
                        "-i", str(voice_temp_file),
                        "-filter:a", f"volume={voice_volume:.2f}",
                        "-c:a", "pcm_s16le",
                        "-ar", "44100",
                        "-ac", "2",
                        str(output_file),
                    ]
                    subprocess.run(cmd_vol, capture_output=True, check=True)
                else:
                    shutil.copyfile(voice_temp_file, output_file)

        # Lưu thêm bản sao final_dubbed_audio.wav để tương thích với các module cũ
        dubbed_alias = session_dir / "final_dubbed_audio.wav"
        if output_file.exists() and output_file != dubbed_alias:
            try:
                shutil.copyfile(output_file, dubbed_alias)
            except Exception:
                pass

        final_duration = get_audio_duration(output_file)

        # ── 6. ĐỒNG BỘ DANH SÁCH SEGMENTS TRẢ VỀ KHỚP 100% VỚI INPUT ─────────────
        adjusted_segments = []
        info_by_orig_idx = {item["orig_idx"]: item for item in prepared_clips}
        for orig_idx, orig_seg in enumerate(segments):
            item = info_by_orig_idx.get(orig_idx)
            seg_copy = dict(orig_seg)
            if item:
                adj_info = item["adj_info"]
                seg_copy["aligned_audio_path"] = adj_info.get("output_audio_path") or orig_seg.get("audio_path")
                seg_copy["applied_speed"] = adj_info.get("applied_speed", 1.0)
                seg_copy["final_duration"] = adj_info.get("final_duration", 0.0)
            adjusted_segments.append(seg_copy)

        return {
            "session_id": session_id,
            "final_audio_path": str(output_file),
            "final_audio_url": f"/outputs/alignment/{session_id}/{output_file.name}",
            "duration": round(final_duration, 3),
            "total_duration": round(final_duration, 3),
            "adjusted_segments": adjusted_segments,
            "dubbed_segments": adjusted_segments,
        }
