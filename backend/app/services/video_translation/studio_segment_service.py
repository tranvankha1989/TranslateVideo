"""
app/services/video_translation/studio_segment_service.py
────────────────────────────────────────────────────────
Quản lý các phân cảnh thoại và re-dubbing trong Studio Timeline Editor.
"""

import time
import json
from pathlib import Path
from typing import Any

from app.core.config import logger
from app.services.dubbing_service import DubbingService, get_audio_duration, DUBBING_OUTPUT_DIR
from app.services.video_translation.constants import TRANSLATE_OUTPUT_DIR, _TASK_STORE
from app.services.video_translation.subtitles import generate_srt_file, parse_srt_file


class StudioSegmentService:
    """Xử lý các thao tác biên tập phân cảnh câu thoại trong Studio Editor."""

    @classmethod
    def get_studio_segments(cls, task_id: str) -> dict[str, Any]:
        """
        Lấy danh sách các câu thoại kèm file âm thanh và mốc thời gian phục vụ Studio Editor (Real-time Timeline Review).
        Nếu file dubbed_segments.json chưa có (ví dụ task chạy trước đó), tự động tái tạo từ subtitles.srt.
        """
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Không tìm thấy thư mục của tác vụ {task_id}")

        dubbed_file = task_dir / "dubbed_segments.json"
        segments = []
        if dubbed_file.exists():
            try:
                segments = json.loads(dubbed_file.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Lỗi đọc dubbed_segments.json: {e}")

        if not segments:
            srt_path = task_dir / "subtitles.srt"
            parsed_sub = parse_srt_file(srt_path) if srt_path.exists() else []
            orig_sub = parse_srt_file(task_dir / "subtitles_original.srt") if (task_dir / "subtitles_original.srt").exists() else []
            orig_map = {item.get("id"): item.get("text", "") for item in orig_sub}

            dubbing_dir = DUBBING_OUTPUT_DIR / task_id
            for s in parsed_sub:
                s_id = s.get("id", 1)
                audio_file = dubbing_dir / f"seg_{s_id:04d}.mp3"
                audio_url = f"/outputs/dubbing/{task_id}/{audio_file.name}" if audio_file.exists() else None
                audio_dur = get_audio_duration(audio_file) if audio_file.exists() else 0.0
                segments.append({
                    "id": s_id,
                    "start": s.get("start", 0.0),
                    "end": s.get("end", 0.0),
                    "text": s.get("text", ""),
                    "original_text": orig_map.get(s_id, ""),
                    "audio_path": str(audio_file) if audio_file.exists() else None,
                    "audio_url": audio_url,
                    "audio_duration": audio_dur,
                    "target_duration": max(0.1, s.get("end", 0.0) - s.get("start", 0.0)),
                })

        meta_file = task_dir / "task_meta.json"
        task_meta = {}
        if meta_file.exists():
            try:
                task_meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        task = _TASK_STORE.get(task_id) or {}
        return {
            "task_id": task_id,
            "video_url": f"/api/video-translate/stream/{task_id}",
            "raw_video_url": f"/api/video-translate/stream-raw/{task_id}",
            "bgm_url": f"/api/video-translate/stream-bgm/{task_id}",
            "audio_url": task.get("audio_url"),
            "subtitles_srt_url": f"/outputs/video_translate/{task_id}/subtitles.srt",
            "segments": segments,
            "meta": {
                "voice_id": task_meta.get("voice_id") or task.get("voice_id", "vi-VN-HoaiMyNeural"),
                "engine": task_meta.get("engine") or task.get("engine", "edge-tts"),
                "preserve_bgm": task_meta.get("preserve_bgm", task.get("preserve_bgm", True)),
                "bgm_type": task_meta.get("bgm_type", task.get("bgm_type", "bgm")),
                "bgm_volume": task_meta.get("bgm_volume", task.get("bgm_volume", 0.30)),
                "voice_volume": task_meta.get("voice_volume", task.get("voice_volume", 1.0)),
                "subtitle_mode": task_meta.get("subtitle_mode", task.get("subtitle_mode", "hard_target")),
                "max_speed_rate": task_meta.get("max_speed_rate", task.get("max_speed_rate", 1.35)),
            },
        }

    @classmethod
    async def redub_single_segment(
        cls,
        task_id: str,
        segment_id: int,
        new_text: str,
        voice_id: str | None = None,
        engine: str | None = None,
        rate: str | None = None,
        pitch: str | None = None,
        volume: float | None = None,
    ) -> dict[str, Any]:
        """Thuyết minh lại CỤC BỘ cho duy nhất 1 câu thoại."""
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        target_seg = next((s for s in segments if s.get("id") == segment_id), None)
        if not target_seg:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id}")

        clean_text = new_text.strip()
        if not clean_text:
            raise RuntimeError("Nội dung câu nói không được để trống.")

        v_id = voice_id or task_meta.get("voice_id", "vi-VN-HoaiMyNeural")
        eng = engine or task_meta.get("engine", "edge-tts")
        v_rate = rate or "+0%"
        v_pitch = pitch or "+0Hz"
        v_vol = f"+{int(volume*100)}%" if volume is not None else "+0%"

        session_dir = DUBBING_OUTPUT_DIR / task_id
        session_dir.mkdir(parents=True, exist_ok=True)
        seg_file = session_dir / f"seg_{segment_id:04d}.mp3"

        start = float(target_seg.get("start", 0.0))
        end = float(target_seg.get("end", 0.0))
        target_duration = max(0.1, end - start)

        res = await DubbingService.synthesize_single(
            text=clean_text,
            voice_id=v_id,
            engine=eng,
            rate=v_rate,
            pitch=v_pitch,
            volume=v_vol,
            output_path=seg_file,
            target_duration=target_duration,
        )

        target_seg["text"] = clean_text
        target_seg["audio_path"] = str(seg_file)
        ts = int(time.time() * 1000)
        target_seg["audio_url"] = f"/outputs/dubbing/{task_id}/{seg_file.name}?t={ts}"
        target_seg["audio_duration"] = res["duration"]
        target_seg["target_duration"] = target_duration
        target_seg["rate_ratio"] = res["rate_ratio"]

        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"🎙️ [Studio Redub] Thu lại câu #{segment_id} thành công ({res['duration']}s): '{clean_text}'")
        return {
            "status": "ok",
            "segment_id": segment_id,
            "segment": target_seg,
            "audio_url": target_seg["audio_url"],
            "message": f"Đã thu lại câu #{segment_id} thành công!",
        }

    @classmethod
    async def update_segment(
        cls,
        task_id: str,
        segment_id: int,
        text: str | None = None,
        start: float | None = None,
        end: float | None = None,
    ) -> dict[str, Any]:
        """Cập nhật trực tiếp nội dung hoặc mốc thời gian bắt đầu/kết thúc của câu thoại."""
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        target_seg = next((s for s in segments if s.get("id") == segment_id), None)
        if not target_seg:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id}")

        if text is not None:
            target_seg["text"] = text.strip()
        if start is not None:
            target_seg["start"] = max(0.0, round(float(start), 3))
        if end is not None:
            target_seg["end"] = max(target_seg.get("start", 0.0) + 0.1, round(float(end), 3))

        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"✏️ [Studio Update] Đã cập nhật câu #{segment_id}: start={target_seg['start']}s, end={target_seg['end']}s, text='{target_seg['text']}'")
        return {
            "status": "ok",
            "segment_id": segment_id,
            "segment": target_seg,
            "message": f"Đã cập nhật câu #{segment_id} thành công!",
        }

    @classmethod
    async def delete_segment(
        cls,
        task_id: str,
        segment_id: int,
    ) -> dict[str, Any]:
        """Xóa hoàn toàn một câu thoại/đoạn phụ đề khỏi timeline và danh sách Studio."""
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        target_seg = next((s for s in segments if s.get("id") == segment_id), None)
        if not target_seg:
            raise RuntimeError(f"Không tìm thấy câu thoại ID {segment_id} để xóa")

        audio_path_str = target_seg.get("audio_path")
        if audio_path_str:
            try:
                Path(audio_path_str).unlink(missing_ok=True)
            except Exception as e:
                logger.debug(f"Không thể xóa file audio câu {segment_id}: {e}")

        segments = [s for s in segments if s.get("id") != segment_id]

        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"🗑️ [Studio Delete] Đã xóa câu #{segment_id} khỏi timeline tác vụ {task_id}")
        return {
            "status": "ok",
            "segment_id": segment_id,
            "remaining_segments": len(segments),
            "message": f"Đã xóa câu #{segment_id} thành công!",
        }

    @classmethod
    async def add_segment(
        cls,
        task_id: str,
        text: str,
        after_segment_id: int | None = None,
        start: float | None = None,
        end: float | None = None,
        voice_id: str | None = None,
        engine: str | None = None,
        voice_rate: str | None = None,
        voice_pitch: str | None = None,
        voice_volume: float | None = None,
    ) -> dict[str, Any]:
        """Chèn thêm 1 câu thoại mới vào timeline Studio tại vị trí bất kỳ."""
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if not task_dir.exists():
            raise RuntimeError(f"Tác vụ {task_id} không tồn tại.")

        clean_text = text.strip()
        if not clean_text:
            raise RuntimeError("Nội dung câu nói không được để trống.")

        dubbed_file = task_dir / "dubbed_segments.json"
        studio_data = cls.get_studio_segments(task_id)
        segments = studio_data["segments"]
        task_meta = studio_data.get("meta", {})

        calc_start = float(start) if start is not None else None
        calc_end = float(end) if end is not None else None

        if calc_start is None:
            if after_segment_id:
                prev_s = next((s for s in segments if s.get("id") == after_segment_id), None)
                calc_start = float(prev_s.get("end", 0.0)) + 0.1 if prev_s else 0.0
            elif segments:
                calc_start = float(segments[-1].get("end", 0.0)) + 0.1
            else:
                calc_start = 0.0

        if calc_end is None or calc_end <= calc_start:
            word_count = len(clean_text.split())
            calc_end = round(calc_start + max(1.5, word_count * 0.35 + 0.3), 3)

        calc_start = max(0.0, round(calc_start, 3))
        calc_end = max(calc_start + 0.1, round(calc_end, 3))
        target_duration = max(0.1, calc_end - calc_start)

        new_id = max([s.get("id", 0) for s in segments], default=0) + 1
        session_dir = DUBBING_OUTPUT_DIR / task_id
        session_dir.mkdir(parents=True, exist_ok=True)
        seg_file = session_dir / f"seg_{new_id:04d}.mp3"

        v_id = voice_id or task_meta.get("voice_id", "vi-VN-HoaiMyNeural")
        eng = engine or task_meta.get("engine", "edge-tts")
        v_rate = voice_rate or "+0%"
        v_pitch = voice_pitch or "+0Hz"
        v_vol = f"+{int(voice_volume*100)}%" if voice_volume is not None else "+0%"

        res = await DubbingService.synthesize_single(
            text=clean_text,
            voice_id=v_id,
            engine=eng,
            rate=v_rate,
            pitch=v_pitch,
            volume=v_vol,
            output_path=seg_file,
            target_duration=target_duration,
        )

        ts = int(time.time() * 1000)
        new_segment = {
            "id": new_id,
            "start": calc_start,
            "end": calc_end,
            "text": clean_text,
            "original_text": "",
            "audio_path": str(seg_file),
            "audio_url": f"/outputs/dubbing/{task_id}/{seg_file.name}?t={ts}",
            "audio_duration": res["duration"],
            "target_duration": target_duration,
            "rate_ratio": res.get("rate_ratio", 1.0),
        }

        segments.append(new_segment)
        segments.sort(key=lambda s: float(s.get("start", 0.0)))

        dubbed_file.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")
        srt_file = task_dir / "subtitles.srt"
        generate_srt_file(segments, srt_file, mode=task_meta.get("subtitle_mode", "hard_target"))

        logger.info(f"✨ [Studio Add] Đã chèn câu #{new_id} thành công tại [{calc_start}s -> {calc_end}s]: '{clean_text}'")
        return {
            "status": "ok",
            "segment_id": new_id,
            "segment": new_segment,
            "total_segments": len(segments),
            "message": "Đã chèn câu thoại mới thành công!",
        }
