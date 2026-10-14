"""
app/routers/settings/feedback.py
────────────────────────────────
Router nhận phản hồi từ khách hàng và gửi thông báo kèm file log về Telegram Bot.
"""

from fastapi import APIRouter
from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.services.telegram_service import TelegramService

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse, summary="Gửi phản hồi và báo lỗi hệ thống kèm file log về Telegram Bot")
async def send_feedback_endpoint(req: FeedbackRequest):
    """Nhận phản hồi từ khách hàng và gửi thông báo + file app.log về Telegram Bot."""
    res = await TelegramService.send_feedback(
        message=req.message,
        sender_name=req.sender_name,
        sender_contact=req.sender_contact,
        feedback_type=req.feedback_type,
        include_logs=req.include_logs,
        system_info=req.system_info,
    )
    return FeedbackResponse(**res)
