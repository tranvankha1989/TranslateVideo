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

        # Biểu tượng theo loại phản hồi
        type_labels = {
            "bug": "🐞 BÁO CÁO LỖI HỆ THỐNG",
            "feature": "✨ ĐÓNG GÓP Ý TƯỞNG / TÍNH NĂNG",
            "question": "❓ CẦN HỖ TRỢ KỸ THUẬT",
            "other": "💬 PHẢN HỒI Ý KIẾN",
        }
        label = type_labels.get(feedback_type, "💬 PHẢN HỒI")

        sys_str = ""
        if system_info:
            os_name = system_info.get("os", "Windows")
            gpu_mode = system_info.get("gpu_mode", "N/A")
            app_ver = system_info.get("app_version", APP_VERSION)
            sys_str = f"\n💻 <b>Cấu hình:</b> {os_name} | {gpu_mode} | App v{app_ver}"

        sender_info = f"👤 <b>Khách hàng:</b> {sender_name or 'Ẩn danh'}"
        if sender_contact:
            sender_info += f"\n📞 <b>Liên hệ:</b> <code>{sender_contact}</code>"

        text_content = (
            f"🔔 <b>[VideoTranslate AI] {label}</b>\n\n"
            f"{sender_info}"
            f"{sys_str}\n\n"
            f"📝 <b>Nội dung phản hồi:</b>\n"
            f"<i>{message}</i>"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Gửi tin nhắn Text
            send_msg_url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text_content,
                "parse_mode": "HTML",
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
