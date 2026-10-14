"""
app/services/video_translation/task_manager.py
──────────────────────────────────────────────
Quản lý trạng thái, vòng đời và lưu trữ dữ liệu tác vụ dịch video.
"""

import time
import json
import shutil
from pathlib import Path
from typing import Any

from app.core.config import logger
from app.services.video_translation.constants import (
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
)


class VideoTranslationTaskManager:
    """Quản lý lưu trữ trạng thái tác vụ dịch video (bộ nhớ in-memory và metadata disk)."""

    @classmethod
    def get_task(cls, task_id: str) -> dict[str, Any] | None:
        task = _TASK_STORE.get(task_id)
        if not task:
            meta_file = TRANSLATE_OUTPUT_DIR / task_id / "task_meta.json"
            if meta_file.exists():
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        task = json.load(f)
                        _TASK_STORE[task_id] = task
                except Exception:
                    pass
        return task

    @classmethod
    def list_all_tasks(cls) -> list[dict[str, Any]]:
        """Quét toàn bộ thư mục outputs/video_translate và _TASK_STORE để trả về danh sách dự án dịch video."""
        projects = []
        seen_task_ids = set()

        if TRANSLATE_OUTPUT_DIR.exists():
            for folder in TRANSLATE_OUTPUT_DIR.iterdir():
                if not folder.is_dir():
                    continue
                task_id = folder.name
                seen_task_ids.add(task_id)
                meta_file = folder / "task_meta.json"
                meta = {}
                if meta_file.exists():
                    try:
                        with open(meta_file, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                    except Exception:
                        pass

                mem_task = _TASK_STORE.get(task_id, {})
                for k, v in mem_task.items():
                    if k not in meta or meta[k] is None:
                        meta[k] = v

                final_video = folder / "final_translated.mp4"
                srt_target = folder / "subtitles.srt"
                srt_orig = folder / "subtitles_original.srt"

                created_at = meta.get("created_at") or meta.get("_start_time") or folder.stat().st_mtime

                file_size_mb = 0.0
                if final_video.exists():
                    file_size_mb = round(final_video.stat().st_size / (1024 * 1024), 2)

                video_path_str = meta.get("video_path", "")
                video_name = Path(video_path_str).name if video_path_str else f"Video_{task_id[:8]}"

                status = meta.get("status", "completed" if final_video.exists() else "processing")
                has_video = final_video.exists()
                has_srt = srt_target.exists()
                has_srt_orig = srt_orig.exists()

                projects.append({
                    "task_id": task_id,
                    "video_name": video_name,
                    "video_filename": video_name,
                    "source_lang": meta.get("source_lang", meta.get("detected_source_lang", "auto")),
                    "target_lang": meta.get("target_lang", "vi"),
                    "voice_id": meta.get("voice_id", "vi-VN-HoaiMyNeural"),
                    "engine": meta.get("engine", "edge-tts"),
                    "translation_engine": meta.get("engine", "edge-tts"),
                    "status": status,
                    "progress": meta.get("progress", 100 if has_video else 0),
                    "created_at": float(created_at),
                    "duration": float(meta.get("video_duration", 0.0)),
                    "video_duration": float(meta.get("video_duration", 0.0)),
                    "elapsed_str": meta.get("elapsed_str"),
                    "output_resolution": meta.get("output_resolution", "720p"),
                    "has_video": has_video,
                    "has_srt": has_srt,
                    "has_srt_original": has_srt_orig,
                    "video_url": f"/api/video-translate/stream/{task_id}" if has_video else None,
                    "srt_url": f"/outputs/video_translate/{task_id}/{srt_target.name}" if has_srt else None,
                    "srt_original_url": f"/outputs/video_translate/{task_id}/{srt_orig.name}" if has_srt_orig else None,
                    "subtitles_srt_url": f"/outputs/video_translate/{task_id}/{srt_target.name}" if has_srt else None,
                    "subtitles_original_srt_url": f"/outputs/video_translate/{task_id}/{srt_orig.name}" if has_srt_orig else None,
                    "file_size_mb": file_size_mb,
                    "video_size_mb": file_size_mb,
                })

        for task_id, mem_task in _TASK_STORE.items():
            if task_id not in seen_task_ids:
                projects.append({
                    "task_id": task_id,
                    "video_name": mem_task.get("video_filename", f"Video_{task_id[:8]}"),
                    "video_filename": mem_task.get("video_filename", f"Video_{task_id[:8]}"),
                    "source_lang": mem_task.get("source_lang", "auto"),
                    "target_lang": mem_task.get("target_lang", "vi"),
                    "voice_id": mem_task.get("voice_id", "vi-VN-HoaiMyNeural"),
                    "engine": mem_task.get("engine", "edge-tts"),
                    "translation_engine": mem_task.get("engine", "edge-tts"),
                    "status": mem_task.get("status", "processing"),
                    "progress": mem_task.get("progress", 0),
                    "created_at": float(mem_task.get("created_at", time.time())),
                    "duration": 0.0,
                    "video_duration": 0.0,
                    "has_video": False,
                    "has_srt": False,
                    "has_srt_original": False,
                    "file_size_mb": 0.0,
                    "video_size_mb": 0.0,
                })

        projects.sort(key=lambda x: x["created_at"], reverse=True)
        return projects

    @classmethod
    def delete_task(cls, task_id: str) -> bool:
        """Xóa toàn bộ thư mục tác vụ và giải phóng bộ nhớ ổ cứng."""
        _TASK_STORE.pop(task_id, None)
        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if task_dir.exists():
            shutil.rmtree(task_dir, ignore_errors=True)
            return True
        return False

    @classmethod
    def update_task(cls, task_id: str, **kwargs) -> None:
        kwargs.pop("task_id", None)
        if task_id not in _TASK_STORE:
            _TASK_STORE[task_id] = {"task_id": task_id}
        _TASK_STORE[task_id].update(kwargs)

        task_dir = TRANSLATE_OUTPUT_DIR / task_id
        if task_dir.exists():
            try:
                meta_file = task_dir / "task_meta.json"
                with open(meta_file, "w", encoding="utf-8") as f:
                    json.dump(_TASK_STORE[task_id], f, ensure_ascii=False, indent=2, default=str)
            except Exception as e:
                logger.warning(f"Không thể lưu task_meta.json: {e}")
