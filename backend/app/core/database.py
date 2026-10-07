import logging
from typing import Optional, Any
try:
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
    _HAS_MOTOR = True
except ImportError:
    AsyncIOMotorClient = Any
    AsyncIOMotorDatabase = Any
    _HAS_MOTOR = False

from app.core.config import MONGODB_URI, MONGODB_DB_NAME, logger

_client: Optional[Any] = None
_db: Optional[Any] = None
_is_connected: bool = False



async def connect_db() -> bool:
    """
    Khởi tạo kết nối tới MongoDB Atlas.
    Tự động fallback về Local Mode nếu không có URI, chưa bật Cloud Sync hoặc mất kết nối.
    """
    global _client, _db, _is_connected

    if not _HAS_MOTOR:
        logger.info("ℹ️ Thư viện 'motor' chưa được cài đặt. Hệ thống chạy ở chế độ CỤC BỘ (Local Mode).")
        _is_connected = False
        _db = None
        return False

    import os
    enable_cloud = os.getenv("ENABLE_CLOUD_SYNC", "false").lower() in ("true", "1", "yes")
    uri = os.getenv("MONGODB_URI", "").strip()
    db_name = os.getenv("MONGODB_DB_NAME", "omnivoice").strip()

    if not enable_cloud or not uri:
        logger.info("ℹ️ Chức năng Cloud Sync đang TẮT hoặc chưa cấu hình MONGODB_URI. Hệ thống chạy ở chế độ CỤC BỘ (Local Mode).")
        if _client:
            try:
                _client.close()
            except Exception:
                pass
            _client = None
        _db = None
        _is_connected = False
        return False

    try:
        logger.info("🔄 Đang kiểm tra kết nối tới MongoDB Atlas Cloud...")
        if _client:
            try:
                _client.close()
            except Exception:
                pass
            _client = None

        _client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=3500,
            connectTimeoutMS=3500,
        )
        # Ping để kiểm tra thực tế
        await _client.admin.command("ping")
        _db = _client[db_name]
        _is_connected = True
        logger.info(f"✅ Kết nối MongoDB Atlas Cloud thành công! Database: '{db_name}'.")
        return True
    except Exception as e:
        logger.warning(
            f"⚠️ Không thể kết nối tới MongoDB Atlas ({e}). Tự động fallback về chế độ CỤC BỘ (Local Mode)."
        )
        _is_connected = False
        _db = None
        if _client:
            try:
                _client.close()
            except Exception:
                pass
            _client = None
        return False


async def close_db() -> None:
    """Đóng kết nối MongoDB khi ứng dụng dừng."""
    global _client, _db, _is_connected
    if _client:
        logger.info("🧹 Đang đóng kết nối MongoDB Atlas...")
        _client.close()
        _client = None
        _db = None
        _is_connected = False


def get_database() -> Optional[AsyncIOMotorDatabase]:
    """Trả về instance database Motor (hoặc None nếu ở Local Mode)."""
    return _db


def is_cloud_mode() -> bool:
    """Kiểm tra hệ thống có đang ở chế độ Cloud Sync không."""
    return _is_connected and _db is not None
