"""
app/services/video_translation
──────────────────────────────
Modular package for Video Translation Pipeline:
- constants: Task store, directories, helper utilities, cleanup.
- subtitles: SRT time formatters, SRT generators, SRT parsers.
- task_manager: Task CRUD and task_meta persistence.
- pipeline_runner: End-to-end automated pipeline workflow.
- manual_runner: Manual workflow, redub, and quick remux.
- studio_segment_service: Per-segment Studio editing and single-segment redubbing.
- pipeline: VideoTranslationPipeline unifying facade class.
"""

from app.services.video_translation.constants import (
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
    is_cloud_gpu_active,
    format_duration_vietnamese,
    get_ffmpeg_scale_filter,
    cleanup_task_temp_files,
)
from app.services.video_translation.subtitles import (
    format_srt_time,
    generate_srt_file,
    clean_subtitle_text,
    parse_srt_content,
    parse_srt_file,
)
from app.services.video_translation.task_manager import VideoTranslationTaskManager
from app.services.video_translation.pipeline_runner import AutomatedPipelineRunner
from app.services.video_translation.manual_runner import ManualWorkflowRunner
from app.services.video_translation.studio_segment_service import StudioSegmentService
from app.services.video_translation.pipeline import VideoTranslationPipeline

__all__ = [
    "TRANSLATE_OUTPUT_DIR",
    "_TASK_STORE",
    "is_cloud_gpu_active",
    "format_duration_vietnamese",
    "get_ffmpeg_scale_filter",
    "cleanup_task_temp_files",
    "format_srt_time",
    "generate_srt_file",
    "clean_subtitle_text",
    "parse_srt_content",
    "parse_srt_file",
    "VideoTranslationTaskManager",
    "AutomatedPipelineRunner",
    "ManualWorkflowRunner",
    "StudioSegmentService",
    "VideoTranslationPipeline",
]
