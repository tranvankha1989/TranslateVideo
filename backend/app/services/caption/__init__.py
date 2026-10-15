"""
app/services/caption/__init__.py
────────────────────────────────
Package xử lý bóc tách phụ đề, tách âm thanh, căn chỉnh và render video caption.
"""

from app.services.caption.whisper_engine import (
    get_whisper_model,
    WHISPER_MODEL_SIZE,
)
from app.services.caption.audio_extractor import (
    extract_audio,
    get_video_dimensions,
    trim_video_by_ranges,
)
from app.services.caption.demucs_separator import (
    separate_vocals_demucs,
)
from app.services.caption.alignment import (
    SENTENCE_ENDINGS,
    CLAUSE_ENDINGS,
    heal_and_merge_segments,
    sanitize_word_timestamps,
    resegment_words,
    align_words_with_reference,
)
from app.services.caption.transcriber import (
    transcribe_with_remote_or_local,
    transcribe_with_remote_gpu,
    transcribe_video_audio,
)
from app.services.caption.ass_renderer import (
    rgb_to_ass_color,
    seconds_to_ass_time,
    generate_ass_subtitles,
    render_video_with_captions,
)

__all__ = [
    "get_whisper_model",
    "WHISPER_MODEL_SIZE",
    "extract_audio",
    "get_video_dimensions",
    "trim_video_by_ranges",
    "separate_vocals_demucs",
    "SENTENCE_ENDINGS",
    "CLAUSE_ENDINGS",
    "heal_and_merge_segments",
    "sanitize_word_timestamps",
    "resegment_words",
    "align_words_with_reference",
    "transcribe_with_remote_or_local",
    "transcribe_with_remote_gpu",
    "transcribe_video_audio",
    "rgb_to_ass_color",
    "seconds_to_ass_time",
    "generate_ass_subtitles",
    "render_video_with_captions",
]
