"""
app/routers/settings/cloud_sync.py
──────────────────────────────────
Router quản lý cấu hình đồng bộ đám mây (MongoDB Atlas, Cloudflare R2),
mở file .env bằng Notepad và nạp lại backend.
"""

import os
import sys
import time
import subprocess
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

import model_handler
from app.core.config import BASE_DIR, logger
from app.routers.settings.env_helper import ENV_FILE, update_env_file
from app.routers.settings.hardware import get_hardware_settings

router = APIRouter()


class CloudSyncSettingsResponse(BaseModel):
    enabled: bool
    mongodb_uri: str
    mongodb_db_name: str
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    r2_public_url: str
    mongo_connected: bool
    r2_connected: bool


class UpdateCloudSyncSettingsRequest(BaseModel):
    enabled: bool
    mongodb_uri: Optional[str] = ""
    mongodb_db_name: Optional[str] = "omnivoice"
    r2_account_id: Optional[str] = ""
    r2_access_key_id: Optional[str] = ""
    r2_secret_access_key: Optional[str] = ""
    r2_bucket_name: Optional[str] = ""
    r2_public_url: Optional[str] = ""


class TestCloudSyncRequest(BaseModel):
    mongodb_uri: Optional[str] = ""
    mongodb_db_name: Optional[str] = "omnivoice"
    r2_account_id: Optional[str] = ""
    r2_access_key_id: Optional[str] = ""
    r2_secret_access_key: Optional[str] = ""
    r2_bucket_name: Optional[str] = ""


class TestCloudSyncResponse(BaseModel):
    mongo_ok: bool
    mongo_message: str
    r2_ok: bool
    r2_message: str


@router.get("/cloud-sync", response_model=CloudSyncSettingsResponse, summary="Lấy cấu hình Cloud Sync hiện tại")
async def get_cloud_sync_settings():
    load_dotenv(ENV_FILE, override=True)
    from app.core.database import is_cloud_mode
    from app.core.storage_r2 import is_r2_configured

    enabled = os.getenv("ENABLE_CLOUD_SYNC", "false").lower() in ("true", "1", "yes")
    return CloudSyncSettingsResponse(
        enabled=enabled,
        mongodb_uri=os.getenv("MONGODB_URI", "").strip(),
        mongodb_db_name=os.getenv("MONGODB_DB_NAME", "omnivoice").strip(),
        r2_account_id=os.getenv("R2_ACCOUNT_ID", "").strip(),
        r2_access_key_id=os.getenv("R2_ACCESS_KEY_ID", "").strip(),
        r2_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY", "").strip(),
        r2_bucket_name=os.getenv("R2_BUCKET_NAME", "").strip(),
        r2_public_url=os.getenv("R2_PUBLIC_URL", "").strip(),
        mongo_connected=is_cloud_mode(),
        r2_connected=is_r2_configured(),
    )


@router.post("/cloud-sync", response_model=CloudSyncSettingsResponse, summary="Cập nhật cấu hình Cloud Sync")
async def update_cloud_sync_settings(req: UpdateCloudSyncSettingsRequest):
    updates = {
        "ENABLE_CLOUD_SYNC": "true" if req.enabled else "false",
        "MONGODB_URI": (req.mongodb_uri or "").strip(),
        "MONGODB_DB_NAME": (req.mongodb_db_name or "omnivoice").strip(),
        "R2_ACCOUNT_ID": (req.r2_account_id or "").strip(),
        "R2_ACCESS_KEY_ID": (req.r2_access_key_id or "").strip(),
        "R2_SECRET_ACCESS_KEY": (req.r2_secret_access_key or "").strip(),
        "R2_BUCKET_NAME": (req.r2_bucket_name or "").strip(),
        "R2_PUBLIC_URL": (req.r2_public_url or "").strip(),
    }

    try:
        update_env_file(updates)
        load_dotenv(ENV_FILE, override=True)
        from app.core.database import connect_db
        from app.core.storage_r2 import reset_r2_client
        reset_r2_client()
        await connect_db()
        logger.info(f"⚙️ Đã cập nhật cấu hình Cloud Sync: ENABLE={req.enabled}")
    except Exception as e:
        logger.error(f"Lỗi khi cập nhật Cloud Sync: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể lưu cấu hình Cloud Sync: {e}")

    return await get_cloud_sync_settings()


@router.post("/cloud-sync/test", response_model=TestCloudSyncResponse, summary="Kiểm tra kết nối MongoDB Atlas & Cloudflare R2")
async def test_cloud_sync(req: TestCloudSyncRequest):
    mongo_ok = False
    mongo_msg = "Chưa nhập chuỗi kết nối MONGODB_URI"
    r2_ok = False
    r2_msg = "Chưa cấu hình Cloudflare R2 (Tùy chọn)"

    uri = (req.mongodb_uri or "").strip()
    db_name = (req.mongodb_db_name or "omnivoice").strip()
    if uri:
        try:
            from motor.motor_asyncio import AsyncIOMotorClient
            t0 = time.time()
            test_client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=4000, connectTimeoutMS=4000)
            await test_client.admin.command("ping")
            ms = int((time.time() - t0) * 1000)
            test_client.close()
            mongo_ok = True
            mongo_msg = f"Kết nối MongoDB Atlas thành công! (Ping: {ms}ms, Database: {db_name})"
        except Exception as e:
            mongo_ok = False
            mongo_msg = f"Lỗi kết nối MongoDB Atlas: {e}"

    acc_id = (req.r2_account_id or "").strip()
    key_id = (req.r2_access_key_id or "").strip()
    secret = (req.r2_secret_access_key or "").strip()
    bucket = (req.r2_bucket_name or "").strip()

    if acc_id and key_id and secret and bucket:
        try:
            import boto3
            from botocore.config import Config
            endpoint_url = f"https://{acc_id}.r2.cloudflarestorage.com"
            s3 = boto3.client(
                service_name="s3",
                endpoint_url=endpoint_url,
                aws_access_key_id=key_id,
                aws_secret_access_key=secret,
                region_name="auto",
                config=Config(signature_version="s3v4", retries={"max_attempts": 2, "mode": "standard"}),
            )
            s3.head_bucket(Bucket=bucket)
            r2_ok = True
            r2_msg = f"Kết nối Cloudflare R2 Bucket '{bucket}' thành công!"
        except Exception as e:
            r2_ok = False
            r2_msg = f"Lỗi kết nối Cloudflare R2: {e}"

    return TestCloudSyncResponse(
        mongo_ok=mongo_ok,
        mongo_message=mongo_msg,
        r2_ok=r2_ok,
        r2_message=r2_msg,
    )


@router.post("/open-env", summary="Mở file .env bằng Notepad để chỉnh sửa")
async def open_env_file():
    """Mở file backend/.env trên máy tính người dùng bằng Notepad hoặc text editor mặc định."""
    env_path = ENV_FILE
    if not env_path.exists():
        example_path = BASE_DIR / ".env.example"
        if example_path.exists():
            env_path.write_text(example_path.read_text(encoding="utf-8"), encoding="utf-8")
        else:
            env_path.write_text("# Cấu hình OmniVoice TTS\n", encoding="utf-8")

    try:
        if sys.platform == "win32":
            subprocess.Popen(["notepad.exe", str(env_path)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(env_path)])
        else:
            subprocess.Popen(["xdg-open", str(env_path)])
        logger.info(f"📝 Đã mở file {env_path} bằng Notepad cho người dùng.")
        return {
            "status": "ok",
            "message": "Đã mở file .env bằng Notepad. Sau khi chỉnh sửa, hãy nhớ nhấn Lưu (Ctrl+S) rồi bấm nút 'Làm mới Backend'.",
        }
    except Exception as e:
        logger.error(f"Lỗi khi mở Notepad: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở file bằng Notepad: {e}")


@router.post("/reload-backend", summary="Làm mới Backend và nạp lại cấu hình .env")
async def reload_backend():
    """
    Nạp lại toàn bộ file backend/.env vào môi trường hiện tại:
    - Cập nhật cấu hình GPU (Local vs Remote GPU)
    - Cập nhật cấu hình Cloud Sync (MongoDB, Cloudflare R2)
    - Nạp lại mô hình nếu chuyển đổi chế độ
    """
    load_dotenv(ENV_FILE, override=True)

    import importlib
    try:
        importlib.reload(model_handler)
    except Exception as e:
        logger.warning(f"Lỗi khi reload model_handler: {e}")

    model_handler.is_remote_gpu_enabled()
    model_handler.get_remote_gpu_url()

    if not model_handler.is_remote_gpu_enabled() and model_handler._model is None:
        try:
            model_handler.load_model()
        except Exception as e:
            logger.warning(f"Chưa thể nạp local model ngay: {e}")

    from app.core.database import connect_db
    try:
        await connect_db()
    except Exception as e:
        logger.warning(f"Lỗi kết nối lại DB: {e}")

    hw = await get_hardware_settings()

    logger.info("🔄 Đã làm mới Backend và nạp lại toàn bộ cấu hình .env thành công.")
    return {
        "status": "ok",
        "message": "Đã làm mới Backend và cập nhật file .env thành công!",
        "hardware": hw,
    }
