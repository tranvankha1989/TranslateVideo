from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class FeedbackRequest(BaseModel):
    sender_name: Optional[str] = Field(None, description="Tên khách hàng")
    sender_contact: Optional[str] = Field(None, description="Email hoặc SĐT liên hệ")
    feedback_type: str = Field("bug", description="Loại phản hồi: bug, feature, question, other")
    message: str = Field(..., description="Nội dung chi tiết phản hồi")
    include_logs: bool = Field(True, description="Có đính kèm file log app.log không")
    system_info: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Thông tin cấu hình máy (OS, GPU, RAM, Version)")


class FeedbackResponse(BaseModel):
    ok: bool
    message: str
    error: Optional[str] = None
