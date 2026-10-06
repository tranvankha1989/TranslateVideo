import os
import logging
from pathlib import Path
import httpx
from dotenv import load_dotenv
from app.core.config import APP_LOG_FILE, APP_VERSION, BASE_DIR, PROJECT_ROOT

logger = logging.getLogger("telegram_service")

DEFAULT_TELEGRAM_BOT_TOKEN = "8637750224:AAHev518siDN1yzTTi5h-Hxd8-eCVbiBp20"
DEFAULT_TELEGRAM_CHAT_ID = "7691076251"


class TelegramService:
    @staticmethod
    def get_credentials():
        token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        if not token or not chat_id:
            for cand in [BASE_DIR / ".env", PROJECT_ROOT / ".env", BASE_DIR.parent / ".env"]:
                if cand.exists():
                    try:
                        load_dotenv(str(cand), override=True)
                        break
                    except Exception:
                        pass
            token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip() or DEFAULT_TELEGRAM_BOT_TOKEN
            chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip() or DEFAULT_TELEGRAM_CHAT_ID
        return token, chat_id

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
        token, chat_id = cls.get_credentials()
        if not token or not chat_id:
            logger.warning("Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID trong .env")
            return {
                "ok": False,
                "message": "Chưa cấu hình Telegram Bot Token hoặc Chat ID.",
                "error": "Vui lòng cấu hình TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID trong file .env của backend.",
            }

        import html
        from datetime import datetime

        # Biểu tượng theo loại phản hồi
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
        clean_msg = html.escape(message.strip())

        # Phiên bản luôn lấy từ nguồn gốc duy nhất version.json của backend
        app_ver = APP_VERSION

        if system_info:
            os_info = html.escape(str(system_info.get("os", "Windows")))
            raw_gpu = str(system_info.get("gpu_mode", "N/A"))
            gpu_info = html.escape(raw_gpu)

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

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Gửi tin nhắn Text (Tắt hoàn toàn Web Page Preview lớn)
            send_msg_url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text_content,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
                "link_preview_options": {
                    "is_disabled": True,
                },
            }
            try:
                resp = await client.post(send_msg_url, json=payload)
                if resp.status_code != 200:
                    err_msg = resp.text
                    logger.error(f"Lỗi gửi tin nhắn Telegram: {err_msg}")
                    return {
                        "ok": False,
                        "message": "Không thể gửi tin nhắn qua Telegram Bot.",
                        "error": err_msg,
                    }
            except Exception as e:
                logger.error(f"Ngoại lệ khi gọi Telegram API: {str(e)}")
                return {
                    "ok": False,
                    "message": "Lỗi kết nối tới máy chủ Telegram.",
                    "error": str(e),
                }

            # 2. Đính kèm file log nếu người dùng đồng ý và file tồn tại
            if include_logs and Path(APP_LOG_FILE).exists():
                try:
                    # Đọc toàn bộ file thành bytes cố định trong bộ nhớ để tránh xung đột khi logfile đang được ghi tiếp
                    log_bytes = Path(APP_LOG_FILE).read_bytes()
                    if log_bytes and len(log_bytes) < 45 * 1024 * 1024:
                        send_doc_url = f"https://api.telegram.org/bot{token}/sendDocument"
                        files = {"document": ("app.log", log_bytes, "text/plain")}
                        data = {
                            "chat_id": chat_id,
                            "caption": f"📄 Nhật ký hệ thống (app.log) từ: {sender_name or 'Khách hàng'}",
                        }
                        doc_resp = await client.post(send_doc_url, data=data, files=files)
                        if doc_resp.status_code == 200:
                            logger.info("Đã gửi thành công file app.log lên Telegram Bot.")
                        else:
                            logger.warning(f"Lỗi gửi kèm file log lên Telegram: {doc_resp.text}")
                    elif len(log_bytes) >= 45 * 1024 * 1024:
                        logger.warning("File log vượt quá 45MB, bỏ qua đính kèm toàn bộ file.")
                except Exception as doc_err:
                    logger.warning(f"Không thể đính kèm file log: {str(doc_err)}")

        return {
            "ok": True,
            "message": "Phản hồi và file nhật ký đã được gửi thành công đến đội ngũ kỹ thuật!",
        }
