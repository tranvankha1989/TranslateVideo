"""
app/services/video_translation_pipeline.py
──────────────────────────────────────────
Facade module for backwards compatibility.
Tất cả logic đã được chia nhỏ và tổ chức mô-đun hóa trong app/services/video_translation/:
  - constants.py: Hằng số, hàm hỗ trợ, dọn dẹp file tạm.
  - subtitles.py: Xử lý định dạng và file SRT.
  - task_manager.py: Quản lý trạng thái và danh sách tasks.
  - pipeline_runner.py: Quy trình dịch video tự động khép kín (run_pipeline).
  - manual_runner.py: Quy trình dịch thủ công (run_manual_transcribe, run_redub, quick_remux_video).
  - studio_segment_service.py: CRUD và redub từng câu thoại trong Studio.
  - pipeline.py: Lớp điều phối VideoTranslationPipeline.
"""

from app.services.video_translation import (
    TRANSLATE_OUTPUT_DIR,
    _TASK_STORE,
    is_cloud_gpu_active,
    format_duration_vietnamese,
    get_ffmpeg_scale_filter,
    cleanup_task_temp_files,
    format_srt_time,
    generate_srt_file,
    clean_subtitle_text,
    parse_srt_content,
    parse_srt_file,
    VideoTranslationTaskManager,
    AutomatedPipelineRunner,
    ManualWorkflowRunner,
    StudioSegmentService,
    VideoTranslationPipeline,
)

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
