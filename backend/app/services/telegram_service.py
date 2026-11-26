"""
app/services/telegram_service.py
────────────────────────────────
Gửi Góp ý & Báo lỗi (kèm app.log) về đội ngũ kỹ thuật.

App KHÔNG gọi thẳng Telegram nữa: phần mềm diệt virus (Bitdefender ATD...) coi việc một chương trình gửi file
lên bot Telegram là hành vi đánh cắp dữ liệu và chặn cả app (26/11/2026). App gửi về máy chủ Hugging Face Space
của nhà phát triển (/gradio_api/remote/feedback); Space chuyển tiếp sang Telegram bằng mã bot cất trong Secret
của Space. Máy khách không chứa mã bot.
"""

import os
import html
import logging
from datetime import datetime
from pathlib import Path

import httpx

from app.core.config import APP_LOG_FILE, _resolve_app_version

logger = logging.getLogger("telegram_service")

# Máy chủ nhận góp ý (Space của nhà phát triển). Đổi được bằng biến FEEDBACK_RELAY_URL trong .env
DEFAULT_FEEDBACK_RELAY_URL = "https://tranvankha2807-translate.hf.space"
# Space nhận file log tối đa 20MB: log dài hơn thì gửi phần cuối (mới nhất)
MAX_LOG_BYTES = 19 * 1024 * 1024


def _relay_url() -> str:
    url = (os.getenv("FEEDBACK_RELAY_URL") or "").strip() or DEFAULT_FEEDBACK_RELAY_URL
    return url.rstrip("/")


class TelegramService:
    @classmethod
    async def send_feedback(
        cls,
        message: str,
        sender_name: str | None = None,
        sender_contact: str | None = None,
        feedback_type: str = "bug",
        include_logs: bool = True,
        system_info: dict | None = None,
    ) -> dict:
        type_labels = {
            "bug": "BÁO CÁO LỖI HỆ THỐNG",
            "feature": "ĐÓNG GÓP Ý TƯỞNG / TÍNH NĂNG",
            "question": "CẦN HỖ TRỢ KỸ THUẬT",
            "other": "PHẢN HỒI Ý KIẾN",
        }
        label = type_labels.get(feedback_type, "PHẢN HỒI Ý KIẾN")

        now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        clean_name = html.escape(sender_name.strip()) if sender_name and sender_name.strip() else "Khách hàng ẩn danh"
        clean_contact = html.escape(sender_contact.strip()) if sender_contact and sender_contact.strip() else "Chưa cung cấp"
        clean_msg = html.escape((message or "").strip())

        # Phiên bản luôn lấy từ nguồn gốc duy nhất version.json của backend
        app_ver = (system_info and system_info.get("app_version")) or _resolve_app_version()
        os_info = html.escape(str((system_info or {}).get("os", "Windows")))
        gpu_info = html.escape(str((system_info or {}).get("gpu_mode", "N/A")))

        text_content = (
            f"<b>[VideoTranslate AI] {label}</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 <b>Người gửi:</b> {clean_name}\n"
            f"📞 <b>Liên hệ:</b> <code>{clean_contact}</code>\n"
            f"💻 <b>Hệ điều hành:</b> {os_info}\n"
            f"⚡ <b>Bộ xử lý:</b> {gpu_info}\n"
            f"📦 <b>Phiên bản:</b> <code>v{app_ver}</code>\n"
            f"🕒 <b>Thời gian:</b> {now_str}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📝 <b>Nội dung phản hồi:</b>\n"
            f"<blockquote>{clean_msg}</blockquote>"
        )

        data = {
            "text": text_content,
            "caption": f"Nhật ký hệ thống (app.log) từ: {sender_name or 'Khách hàng'}",
        }
        files = None
        if include_logs and Path(APP_LOG_FILE).exists():
            try:
                # Đọc cố định thành bytes trong bộ nhớ để tránh xung đột khi file log đang được ghi tiếp
                log_bytes = Path(APP_LOG_FILE).read_bytes()
                if len(log_bytes) > MAX_LOG_BYTES:
                    log_bytes = log_bytes[-MAX_LOG_BYTES:]
                if log_bytes:
                    files = {"log_file": ("app.log", log_bytes, "text/plain")}
            except Exception as e:
                logger.warning(f"Không đọc được file log để gửi kèm: {e}")

        url = f"{_relay_url()}/gradio_api/remote/feedback"
        try:
            # Space có thể đang ngủ: lần gọi đầu sẽ đánh thức máy chủ nên chờ tối đa 2 phút
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
                resp = await client.post(url, data=data, files=files)
        except Exception as e:
            logger.error(f"Không kết nối được máy chủ nhận góp ý: {e}")
            return {
                "ok": False,
                "message": "Không kết nối được máy chủ nhận góp ý. Vui lòng kiểm tra mạng và thử lại sau 1-2 phút.",
                "error": str(e),
            }

        if resp.status_code != 200:
            detail = resp.text[:300]
            logger.error(f"Máy chủ nhận góp ý trả lỗi HTTP {resp.status_code}: {detail}")
            if resp.status_code == 429:
                msg = "Bạn đã gửi góp ý nhiều lần liên tiếp, vui lòng thử lại sau ít phút."
            else:
                msg = "Máy chủ nhận góp ý đang khởi động hoặc chưa sẵn sàng, vui lòng thử lại sau 1-2 phút."
            return {"ok": False, "message": msg, "error": f"HTTP {resp.status_code}: {detail}"}

        logger.info(f"Đã gửi góp ý về máy chủ nhận góp ý (kèm app.log: {bool(files)}).")
        return {
            "ok": True,
            "message": (
                "Phản hồi và file nhật ký đã được gửi thành công đến đội ngũ kỹ thuật!"
                if files
                else "Phản hồi đã được gửi thành công đến đội ngũ kỹ thuật!"
            ),
        }
