"""
app/services/video_translation/pipeline.py
──────────────────────────────────────────
Lớp điều phối trung tâm VideoTranslationPipeline.
Tích hợp các module chuyên trách:
  - VideoTranslationTaskManager: Quản lý trạng thái, tạo, cập nhật, xóa task.
  - AutomatedPipelineRunner: Chạy pipeline tự động từ A-Z.
  - ManualWorkflowRunner: Chạy quy trình dịch thủ công và quick remux.
  - StudioSegmentService: Thao tác CRUD và thu âm lại từng phân cảnh trong Studio.
"""

from pathlib import Path
from typing import Any

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


class VideoTranslationPipeline:
    """Bộ điều phối toàn bộ quy trình dịch và lồng tiếng video."""

    # ── Task Management Delegates ──
    @classmethod
    def get_task(cls, task_id: str) -> dict[str, Any] | None:
        return VideoTranslationTaskManager.get_task(task_id)

    @classmethod
    def list_all_tasks(cls) -> list[dict[str, Any]]:
        return VideoTranslationTaskManager.list_all_tasks()

    @classmethod
    def delete_task(cls, task_id: str) -> bool:
        return VideoTranslationTaskManager.delete_task(task_id)

    @classmethod
    def update_task(cls, task_id: str, **kwargs) -> None:
        return VideoTranslationTaskManager.update_task(task_id, **kwargs)

    @classmethod
    def create_task(cls, task_id: str, **kwargs) -> dict[str, Any]:
        return VideoTranslationTaskManager.create_task(task_id, **kwargs)

    @classmethod
    def save_task_meta(cls, task_id: str, meta: dict[str, Any]) -> None:
        return VideoTranslationTaskManager.save_task_meta(task_id, meta)

    @classmethod
    def load_task_meta(cls, task_id: str) -> dict[str, Any] | None:
        return VideoTranslationTaskManager.load_task_meta(task_id)

    # ── Automated Pipeline Runner ──
    @classmethod
    async def run_pipeline(
        cls,
        task_id: str,
        video_path: Path,
        source_lang: str = "en",
        target_lang: str = "vi",
        voice_id: str = "vi-VN-HoaiMyNeural",
        engine: str = "edge-tts",
        voice_rate: str = "+0%",
        voice_pitch: str = "+0Hz",
        voice_volume: float = 1.0,
        preserve_bgm: bool = True,
        bgm_type: str = "bgm",
        bgm_volume: float = 0.30,
        subtitle_mode: str = "hard_target",
        max_speed_rate: float = 1.35,
        translation_provider: str = "google",
        translation_api_key: str | None = None,
        translation_style: str = "auto",
        translation_model: str = "gemini-3.5-flash-lite",
        translation_temperature: float = 0.2,
        whisper_model: str = "large-v3",
        output_resolution: str = "720p",
        clip_start: float = 0.0,
        clip_end: float | None = None,
        vad_threshold: float = 0.35,
        speech_pad_ms: int = 500,
        min_speech_duration_ms: int = 150,
        min_silence_duration_ms: int = 500,
        beam_size: int = 5,
        font_size: int = 20,
        margin_v: int = 30,
        alignment: int = 2,
    ) -> None:
        return await AutomatedPipelineRunner.run_pipeline(
            task_id=task_id,
            video_path=video_path,
            source_lang=source_lang,
            target_lang=target_lang,
            voice_id=voice_id,
            engine=engine,
            voice_rate=voice_rate,
            voice_pitch=voice_pitch,
            voice_volume=voice_volume,
            preserve_bgm=preserve_bgm,
            bgm_type=bgm_type,
            bgm_volume=bgm_volume,
            subtitle_mode=subtitle_mode,
            max_speed_rate=max_speed_rate,
            translation_provider=translation_provider,
            translation_api_key=translation_api_key,
            translation_style=translation_style,
            translation_model=translation_model,
            translation_temperature=translation_temperature,
            whisper_model=whisper_model,
            output_resolution=output_resolution,
            clip_start=clip_start,
            clip_end=clip_end,
            vad_threshold=vad_threshold,
            speech_pad_ms=speech_pad_ms,
            min_speech_duration_ms=min_speech_duration_ms,
            min_silence_duration_ms=min_silence_duration_ms,
            beam_size=beam_size,
            font_size=font_size,
            margin_v=margin_v,
            alignment=alignment,
        )

    # ── Manual Workflow Runner ──
    @classmethod
    async def run_manual_transcribe(
        cls,
        task_id: str,
        video_path: Path,
        source_lang: str = "auto",
        target_lang: str = "vi",
        whisper_model: str = "large-v3",
        clip_start: float = 0.0,
        clip_end: float | None = None,
        vad_threshold: float = 0.35,
        speech_pad_ms: int = 500,
        min_speech_duration_ms: int = 150,
        min_silence_duration_ms: int = 500,
        beam_size: int = 5,
    ) -> None:
        return await ManualWorkflowRunner.run_manual_transcribe(
            task_id=task_id,
            video_path=video_path,
            source_lang=source_lang,
            target_lang=target_lang,
            whisper_model=whisper_model,
            clip_start=clip_start,
            clip_end=clip_end,
            vad_threshold=vad_threshold,
            speech_pad_ms=speech_pad_ms,
            min_speech_duration_ms=min_speech_duration_ms,
            min_silence_duration_ms=min_silence_duration_ms,
            beam_size=beam_size,
        )

    @classmethod
    async def run_redub(
        cls,
        task_id: str,
        srt_file: Path,
        voice_id: str = "vi-VN-HoaiMyNeural",
        engine: str = "edge-tts",
        voice_rate: str = "+0%",
        voice_pitch: str = "+0Hz",
        voice_volume: float = 1.0,
        preserve_bgm: bool = True,
        bgm_type: str = "bgm",
        bgm_volume: float = 0.30,
        subtitle_mode: str = "hard_target",
        max_speed_rate: float = 1.35,
        output_resolution: str = "720p",
        font_size: int = 20,
        margin_v: int = 30,
        alignment: int = 2,
    ) -> None:
        return await ManualWorkflowRunner.run_redub(
            task_id=task_id,
            srt_file=srt_file,
            voice_id=voice_id,
            engine=engine,
            voice_rate=voice_rate,
            voice_pitch=voice_pitch,
            voice_volume=voice_volume,
            preserve_bgm=preserve_bgm,
            bgm_type=bgm_type,
            bgm_volume=bgm_volume,
            subtitle_mode=subtitle_mode,
            max_speed_rate=max_speed_rate,
            output_resolution=output_resolution,
            font_size=font_size,
            margin_v=margin_v,
            alignment=alignment,
        )

    @classmethod
    async def quick_remux_video(
        cls,
        task_id: str,
        output_resolution: str | None = None,
        subtitle_mode: str | None = None,
        voice_volume: float | None = None,
        bgm_volume: float | None = None,
        font_name: str | None = None,
        font_size: int | None = None,
        font_color: str | None = None,
        outline_color: str | None = None,
        back_color: str | None = None,
        outline_width: int | None = None,
        shadow_width: int | None = None,
        bold: int | None = None,
        alignment: int | None = None,
        margin_v: int | None = None,
    ) -> dict[str, Any]:
        return await ManualWorkflowRunner.quick_remux_video(
            task_id=task_id,
            output_resolution=output_resolution,
            subtitle_mode=subtitle_mode,
            voice_volume=voice_volume,
            bgm_volume=bgm_volume,
            font_name=font_name,
            font_size=font_size,
            font_color=font_color,
            outline_color=outline_color,
            back_color=back_color,
            outline_width=outline_width,
            shadow_width=shadow_width,
            bold=bold,
            alignment=alignment,
            margin_v=margin_v,
        )

    # ── Studio Segment CRUD Delegates ──
    @classmethod
    def get_studio_segments(cls, task_id: str) -> list[dict[str, Any]]:
        return StudioSegmentService.get_studio_segments(task_id)

    @classmethod
    async def redub_single_segment(
        cls,
        task_id: str,
        segment_id: int,
        voice_id: str | None = None,
        engine: str | None = None,
        voice_rate: str | None = None,
        voice_pitch: str | None = None,
    ) -> dict[str, Any]:
        return await StudioSegmentService.redub_single_segment(
            task_id=task_id,
            segment_id=segment_id,
            voice_id=voice_id,
            engine=engine,
            voice_rate=voice_rate,
            voice_pitch=voice_pitch,
        )

    @classmethod
    def update_segment(cls, task_id: str, segment_id: int, updates: dict[str, Any]) -> dict[str, Any]:
        return StudioSegmentService.update_segment(task_id, segment_id, updates)

    @classmethod
    def delete_segment(cls, task_id: str, segment_id: int) -> dict[str, Any]:
        return StudioSegmentService.delete_segment(task_id, segment_id)

    @classmethod
    def add_segment(cls, task_id: str, segment_data: dict[str, Any]) -> dict[str, Any]:
        return StudioSegmentService.add_segment(task_id, segment_data)
