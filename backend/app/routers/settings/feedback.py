"""
app/routers/settings/feedback.py
────────────────────────────────
Router nhận phản hồi từ khách hàng và gửi kèm file log về máy chủ nhận góp ý (Space chuyển tiếp sang Telegram).
"""

from fastapi import APIRouter
from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.services.telegram_service import TelegramService

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse, summary="Gửi phản hồi và báo lỗi hệ thống kèm file log về đội ngũ kỹ thuật")
async def send_feedback_endpoint(req: FeedbackRequest):
    """Nhận phản hồi từ khách hàng và gửi thông báo + file app.log về máy chủ nhận góp ý."""
    res = await TelegramService.send_feedback(
        message=req.message,
        sender_name=req.sender_name,
        sender_contact=req.sender_contact,
        feedback_type=req.feedback_type,
        include_logs=req.include_logs,
        system_info=req.system_info,
    )
    return FeedbackResponse(**res)
