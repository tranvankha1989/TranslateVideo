from typing import Any
from pydantic import BaseModel, Field


class StartTranslationRequest(BaseModel):
    source_lang: str = Field("auto", description="Ngôn ngữ gốc của video (auto, en, zh-cn, vi, ja, ...)")
    target_lang: str = Field("vi", description="Ngôn ngữ cần dịch sang (vi, en, zh-cn, ...)")
    voice_id: str = Field("vi-VN-HoaiMyNeural", description="Mã giọng đọc lồng tiếng (Edge-TTS hoặc OmniVoice)")
    engine: str = Field("edge-tts", description="edge-tts hoặc omnivoice")
    voice_rate: str = Field("+0%", description="Tốc độ đọc cơ bản")
    voice_pitch: str = Field("+0Hz", description="Cao độ giọng")
    voice_volume: float = Field(1.0, description="Âm lượng giọng đọc (mặc định 1.0)")
    preserve_bgm: bool = Field(True, description="Giữ lại âm thanh nền gốc của video")
    bgm_type: str = Field("bgm", description="Nguồn âm thanh nền: bgm (nhạc nền tách vocal), original (âm thanh gốc chưa tách), none (tắt)")
    bgm_volume: float = Field(0.30, description="Âm lượng nhạc nền gốc (0.0 -> 1.0, mặc định 0.30)")
    subtitle_mode: str = Field("hard_target", description="Chế độ phụ đề: none (không sub), hard_target (phụ đề dịch), hard_dual (song ngữ)")
    max_speed_rate: float = Field(1.35, description="Tốc độ tăng tối đa để khớp khung hình")
    translation_provider: str = Field("google", description="Kênh dịch thuật: google, openai, deepseek, gemini")
    translation_api_key: str | None = Field(None, description="API Key nếu dùng LLM")
    translation_model: str = Field("gemini-3.5-flash-lite", description="Mô hình dịch: gemini-3.5-flash-lite, gemini-3.1-flash-lite")
    translation_temperature: float = Field(0.2, description="Nhiệt độ sáng tạo (0.0 -> 1.0, mặc định 0.2)")
    output_resolution: str = Field("720p", description="Độ phân giải video đầu ra: 720p, 1080p, 480p, original")
    start_time: float = Field(0.0, description="Mốc thời gian bắt đầu cắt video (giây)")
    end_time: float | None = Field(None, description="Mốc thời gian kết thúc cắt video (giây)")


class TranslationTaskStatus(BaseModel):
    task_id: str
    status: str = Field(..., description="queued, processing, paused_for_review, completed, failed")
    progress: int = Field(0, description="Tiến độ từ 0 đến 100%")
    current_step: str = Field(..., description="extracting, transcribing, review_original, translating, dubbing, aligning, rendering, completed, failed")
    message: str = Field(..., description="Mô tả trạng thái hiện tại bằng tiếng Việt")
    source_lang: str | None = None
    target_lang: str | None = None
    total_segments: int = 0
    start_time: float | None = 0.0
    end_time: float | None = None
    video_url: str | None = None
    audio_url: str | None = None
    subtitles_srt_url: str | None = None
    subtitles_original_srt_url: str | None = None
    elapsed_time: float | None = Field(None, description="Tổng thời gian xử lý tính bằng giây")
    elapsed_str: str | None = Field(None, description="Thời gian dịch hoàn thành (vd: 2 phút 15 giây)")
    output_resolution: str | None = Field("720p", description="Độ phân giải đầu ra")
    error: str | None = None


class VerifyKeyRequest(BaseModel):
    api_key: str = Field(..., description="API Key Google AI Studio cần kiểm tra")


class SaveSubtitlesRequest(BaseModel):
    content: str = Field(..., description="Nội dung phụ đề .srt")


class RedubTaskRequest(BaseModel):
    srt_content: str | None = Field(None, description="Nội dung file phụ đề đã chỉnh sửa (nếu có)")
    voice_id: str | None = Field(None, description="Giọng đọc muốn dùng khi lồng tiếng lại")
    engine: str | None = Field(None, description="edge-tts hoặc omnivoice")
    voice_rate: str | None = Field(None, description="Tốc độ đọc")
    voice_pitch: str | None = Field(None, description="Cao độ")
    voice_volume: float | None = Field(None, description="Âm lượng giọng đọc")
    preserve_bgm: bool | None = Field(None, description="Giữ âm thanh gốc thuyết minh phim")
    bgm_type: str | None = Field(None, description="Nguồn âm thanh nền: bgm, original, none")
    bgm_volume: float | None = Field(None, description="Âm lượng thuyết minh nền")
    subtitle_mode: str | None = Field(None, description="Kiểu gắn phụ đề: hard_target, hard_dual, none")
    max_speed_rate: float | None = Field(None, description="Tốc độ tăng tối đa")
    output_resolution: str | None = Field(None, description="Độ phân giải video đầu ra: 720p, 1080p, 480p, original")


class StudioRedubSegmentRequest(BaseModel):
    segment_id: int = Field(..., description="ID của câu thoại (1, 2, 3...)")
    text: str = Field(..., description="Nội dung câu nói mới đã chỉnh sửa")
    voice_id: str | None = Field(None, description="Mã giọng đọc (nếu muốn đổi giọng riêng cho câu này)")
    engine: str | None = Field(None, description="edge-tts hoặc omnivoice")
    voice_rate: str | None = Field(None, description="Tốc độ đọc (+0%, +10%...)")
    voice_pitch: str | None = Field(None, description="Cao độ (+0Hz, +5Hz...)")
    voice_volume: float | None = Field(None, description="Âm lượng giọng đọc")


class StudioUpdateSegmentRequest(BaseModel):
    segment_id: int = Field(..., description="ID câu thoại (1, 2, 3...)")
    text: str | None = Field(None, description="Văn bản phụ đề đã chỉnh sửa")
    start: float | None = Field(None, description="Mốc thời gian bắt đầu mới (giây)")
    end: float | None = Field(None, description="Mốc thời gian kết thúc mới (giây)")


class StudioRemuxRequest(BaseModel):
    subtitle_mode: str | None = Field(None, description="Chế độ phụ đề: none, hard_target, hard_dual")
    bgm_type: str | None = Field("bgm", description="Nguồn âm thanh nền: bgm (nhạc nền tách vocal), original (âm thanh gốc chưa tách), none (tắt)")
    bgm_volume: float | None = Field(0.30, description="Âm lượng BGM (mặc định 0.30)")
    voice_volume: float | None = Field(None, description="Âm lượng giọng đọc")
    max_speed_rate: float | None = Field(None, description="Tốc độ co giãn tối đa")
    output_resolution: str | None = Field(None, description="Độ phân giải video đầu ra: 720p, 1080p, 480p, original")


class StudioAddSegmentRequest(BaseModel):
    text: str = Field(..., description="Nội dung câu nói mới cần chèn")
    after_segment_id: int | None = Field(None, description="ID của câu thoại đứng trước (chèn vào sau câu này)")
    start: float | None = Field(None, description="Mốc thời gian bắt đầu (giây)")
    end: float | None = Field(None, description="Mốc thời gian kết thúc (giây)")
    voice_id: str | None = Field(None, description="Giọng đọc muốn dùng cho câu này")
    engine: str | None = Field(None, description="edge-tts hoặc omnivoice")
    voice_rate: str | None = Field(None, description="Tốc độ đọc")
    voice_pitch: str | None = Field(None, description="Cao độ")
    voice_volume: float | None = Field(None, description="Âm lượng giọng đọc")


class VideoTranslationProjectItem(BaseModel):
    task_id: str
    video_name: str
    source_lang: str = "auto"
    target_lang: str = "vi"
    voice_id: str = "vi-VN-HoaiMyNeural"
    engine: str = "edge-tts"
    status: str
    progress: int = 0
    created_at: float = 0
    duration: float = 0
    elapsed_str: str | None = None
    output_resolution: str = "720p"
    video_url: str | None = None
    subtitles_srt_url: str | None = None
    subtitles_original_srt_url: str | None = None
    file_size_mb: float = 0

