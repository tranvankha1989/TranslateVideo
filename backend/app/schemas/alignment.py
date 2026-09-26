from typing import Any
from pydantic import BaseModel, Field


class AdjustSpeedRequest(BaseModel):
    audio_path: str = Field(..., description="Đường dẫn file âm thanh cần co giãn tốc độ")
    target_duration: float = Field(..., description="Thời lượng mục tiêu (giây)")
    max_speed_rate: float = Field(1.35, description="Tốc độ tăng tối đa cho phép (mặc định 1.35x)")
    min_speed_rate: float = Field(0.85, description="Tốc độ giảm tối thiểu cho phép (mặc định 0.85x)")


class AdjustSpeedResponse(BaseModel):
    original_duration: float
    target_duration: float
    final_duration: float
    applied_speed: float
    output_audio_path: str
    output_audio_url: str


class BuildTimelineAudioRequest(BaseModel):
    segments: list[dict[str, Any]] = Field(..., description="Danh sách các đoạn thoại có start, end, audio_path")
    total_video_duration: float = Field(..., description="Tổng thời lượng của video (giây)")
    max_speed_rate: float = Field(1.35, description="Tốc độ tăng tối đa cho phép")
    bgm_path: str | None = Field(None, description="Đường dẫn file nhạc nền BGM (nếu có)")
    bgm_volume: float = Field(0.25, description="Âm lượng nhạc nền BGM (0.0 -> 1.0, mặc định 0.25)")
    voice_volume: float = Field(1.0, description="Âm lượng giọng đọc lồng tiếng (mặc định 1.0)")
    session_id: str | None = Field(None, description="Mã phiên làm việc")


class BuildTimelineAudioResponse(BaseModel):
    session_id: str
    final_audio_path: str
    final_audio_url: str
    total_duration: float
    adjusted_segments: list[dict[str, Any]]
