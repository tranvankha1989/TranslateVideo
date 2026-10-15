"""
caption_handler.py
──────────────────
Facade module chuyển tiếp toàn bộ chức năng xử lý phụ đề & video sang app.services.caption.
Đảm bảo tính tương thích ngược 100% cho mọi file đang import từ caption_handler.
"""

from app.services.caption import (
    get_whisper_model,
    WHISPER_MODEL_SIZE,
    extract_audio,
    get_video_dimensions,
    trim_video_by_ranges,
    separate_vocals_demucs,
    SENTENCE_ENDINGS,
    CLAUSE_ENDINGS,
    heal_and_merge_segments,
    sanitize_word_timestamps,
    resegment_words,
    align_words_with_reference,
    transcribe_with_remote_or_local,
    transcribe_with_remote_gpu,
    transcribe_video_audio,
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
