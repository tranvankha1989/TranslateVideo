from typing import Any
from pydantic import BaseModel, Field


class VoiceItem(BaseModel):
    id: str = Field(..., description="Mã định danh của giọng đọc (vd: vi-VN-HoaiMyNeural, omnivoice_clone_xxx)")
    name: str = Field(..., description="Tên hiển thị thân thiện (vd: Hoài My (Nữ - Miền Bắc))")
    lang: str = Field(..., description="Mã ngôn ngữ (vi, en, zh-cn, ja, ko, ...)")
    gender: str = Field("Female", description="Giới tính: Female, Male")
    engine: str = Field("edge-tts", description="Engine: edge-tts hoặc omnivoice")
    preview_url: str | None = None


class DubbingSegmentRequest(BaseModel):
    text: str = Field(..., description="Văn bản cần lồng tiếng")
    voice_id: str = Field("vi-VN-HoaiMyNeural", description="Mã giọng đọc")
    engine: str = Field("edge-tts", description="edge-tts hoặc omnivoice")
    rate: str = Field("+0%", description="Tốc độ đọc (vd: +0%, +10%, -15%)")
    pitch: str = Field("+0Hz", description="Cao độ giọng (vd: +0Hz, +5Hz, -5Hz)")
    volume: str = Field("+0%", description="Âm lượng (vd: +0%, +20%)")
    target_duration: float | None = Field(None, description="Thời lượng mong muốn (giây) nếu muốn đối chiếu")


class DubbingSegmentResponse(BaseModel):
    audio_url: str
    audio_path: str
    duration: float
    target_duration: float | None = None
    rate_ratio: float = 1.0


class BatchDubbingRequest(BaseModel):
    segments: list[dict[str, Any]] = Field(..., description="Danh sách các đoạn phụ đề đã dịch cần lồng tiếng")
    voice_id: str = Field("vi-VN-HoaiMyNeural", description="Mã giọng đọc")
    engine: str = Field("edge-tts", description="edge-tts hoặc omnivoice")
    rate: str = Field("+0%", description="Tốc độ cơ bản")
    pitch: str = Field("+0Hz", description="Cao độ cơ bản")
    volume: str = Field("+0%", description="Âm lượng")
    session_id: str | None = Field(None, description="Mã phiên làm việc để lưu trữ audio")


class BatchDubbingResponse(BaseModel):
    session_id: str
    dubbed_segments: list[dict[str, Any]]
    total_segments: int
    total_duration: float
    engine: str
    voice_id: str


class SeparateVocalRequest(BaseModel):
    video_or_audio_path: str = Field(..., description="Đường dẫn file video hoặc audio gốc")
    session_id: str | None = Field(None, description="Mã phiên làm việc")
