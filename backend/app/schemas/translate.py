from typing import Any
from pydantic import BaseModel, Field


class CaptionSegmentItem(BaseModel):
    id: int | str
    start: float
    end: float
    text: str
    words: list[dict[str, Any]] | None = None
    customPositionY: float | None = None


class TranslateTextRequest(BaseModel):
    text: str = Field(..., description="Văn bản cần dịch")
    source_lang: str = Field("auto", description="Mã ngôn ngữ nguồn (auto, en, vi, zh-cn, ja, ...)")
    target_lang: str = Field("vi", description="Mã ngôn ngữ đích (vi, en, zh-cn, ja, ...)")
    provider: str = Field("google", description="Kênh dịch thuật: google, openai, deepseek, gemini")
    api_key: str | None = Field(None, description="API Key cho LLM (nếu dùng)")
    base_url: str | None = Field(None, description="Custom Base URL cho OpenAI compatible API")
    model: str | None = Field(None, description="Model LLM (vd: gpt-4o-mini, deepseek-chat, gemini-1.5-flash)")


class TranslateTextResponse(BaseModel):
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    provider: str


class TranslateSegmentsRequest(BaseModel):
    segments: list[dict[str, Any]] = Field(..., description="Danh sách các đoạn phụ đề cần dịch")
    source_lang: str = Field("auto", description="Mã ngôn ngữ nguồn (auto, en, vi, zh-cn, ...)")
    target_lang: str = Field("vi", description="Mã ngôn ngữ đích (vi, en, ...)")
    provider: str = Field("google", description="Kênh dịch: google, openai, deepseek, gemini")
    api_key: str | None = Field(None, description="API Key nếu dùng LLM")
    base_url: str | None = Field(None, description="Custom base URL cho LLM")
    model: str | None = Field(None, description="Tên model LLM")


class TranslateSegmentsResponse(BaseModel):
    segments: list[dict[str, Any]]
    source_lang: str
    target_lang: str
    provider: str
    total_segments: int
