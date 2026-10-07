import os
from pathlib import Path
from typing import Optional
try:
    import boto3
    from botocore.config import Config
    _HAS_BOTO3 = True
except ImportError:
    boto3 = None
    Config = None
    _HAS_BOTO3 = False

from app.core.config import (
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_PUBLIC_URL,
    logger,
)


_s3_client = None
_is_r2_ready = False


def is_r2_configured() -> bool:
    """Kiểm tra xem các thông tin Cloudflare R2 đã được cấu hình đầy đủ chưa và Cloud Sync có đang bật không."""
    enable_cloud = os.getenv("ENABLE_CLOUD_SYNC", "false").lower() in ("true", "1", "yes")
    if not enable_cloud:
        return False

    acc_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    key_id = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.getenv("R2_BUCKET_NAME", "").strip()
    return bool(_HAS_BOTO3 and acc_id and key_id and secret and bucket)


def reset_r2_client():
    """Làm mới S3 client khi thông tin cấu hình R2 thay đổi."""
    global _s3_client, _is_r2_ready
    _s3_client = None
    _is_r2_ready = False


def get_r2_client():
    """Khởi tạo S3 client kết nối Cloudflare R2."""
    global _s3_client, _is_r2_ready

    if not is_r2_configured():
        _s3_client = None
        _is_r2_ready = False
        return None

    if _s3_client is not None:
        return _s3_client

    acc_id = os.getenv("R2_ACCOUNT_ID", "").strip()
    key_id = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.getenv("R2_BUCKET_NAME", "").strip()

    try:
        endpoint_url = f"https://{acc_id}.r2.cloudflarestorage.com"
        _s3_client = boto3.client(
            service_name="s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
        )
        _is_r2_ready = True
        logger.info(f"✅ Đã cấu hình Cloudflare R2 Storage (Bucket: '{bucket}').")
        return _s3_client
    except Exception as e:
        logger.warning(f"⚠️ Lỗi khởi tạo Cloudflare R2 client: {e}. Hệ thống sẽ lưu trữ âm thanh cục bộ.")
        _s3_client = None
        _is_r2_ready = False
        return None


def upload_audio_to_r2(
    file_path: Path | str,
    object_key: Optional[str] = None,
    content_type: str = "audio/mpeg",
) -> Optional[str]:
    """
    Tải file âm thanh lên Cloudflare R2 bucket.
    Trả về Public URL nếu thành công, hoặc None nếu chưa cấu hình/lỗi (tự fallback local).
    """
    client = get_r2_client()
    if client is None:
        return None

    path = Path(file_path)
    if not path.exists():
        logger.warning(f"File không tồn tại để upload lên R2: {file_path}")
        return None

    key = object_key or f"outputs/{path.name}"

    try:
        extra_args = {"ContentType": content_type}
        client.upload_file(
            Filename=str(path),
            Bucket=R2_BUCKET_NAME,
            Key=key,
            ExtraArgs=extra_args,
        )
        logger.info(f"☁️ Đã upload audio lên Cloudflare R2: {key}")

        if R2_PUBLIC_URL:
            return f"{R2_PUBLIC_URL}/{key}"
        else:
            # Fallback nếu không có custom domain/public dev URL, sinh presigned URL 7 ngày
            url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": R2_BUCKET_NAME, "Key": key},
                ExpiresIn=604800,  # 7 ngày
            )
            return url
    except Exception as e:
        logger.error(f"⚠️ Không thể upload file lên Cloudflare R2 ({e}). Tiếp tục dùng URL local.")
        return None


def delete_audio_from_r2(key_or_filename: str) -> bool:
    """
    Xóa file âm thanh trên Cloudflare R2 bucket.
    Chấp nhận key đầy đủ ('outputs/abc.mp3' hoặc 'outputs/audios/ses1/abc.mp3') hoặc tên file ('abc.mp3').
    """
    client = get_r2_client()
    if client is None:
        return False

    normalized = key_or_filename.strip().replace("\\", "/")
    if normalized.startswith("outputs/"):
        key = normalized
    elif "/" in normalized:
        key = f"outputs/{normalized.lstrip('/')}"
    else:
        name = os.path.basename(normalized)
        if not name:
            return False
        key = f"outputs/{name}"

    deleted = False
    try:
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=key)
        logger.info(f"🗑️ Đã xóa file trên Cloudflare R2: {key}")
        deleted = True
    except Exception as e:
        logger.warning(f"⚠️ Lỗi khi xóa file trên Cloudflare R2 ({key}): {e}")

    # Xóa kèm file phụ đề .srt nếu có
    base, ext = os.path.splitext(key)
    if ext.lower() in (".mp3", ".wav"):
        srt_key = f"{base}.srt"
        try:
            client.delete_object(Bucket=R2_BUCKET_NAME, Key=srt_key)
            logger.info(f"🗑️ Đã xóa file phụ đề trên Cloudflare R2 (nếu có): {srt_key}")
        except Exception:
            pass

    return deleted


def delete_multiple_from_r2(keys_or_filenames: list[str]) -> int:
    """
    Xóa hàng loạt (batch) nhiều file âm thanh kèm file .srt trên Cloudflare R2 trong 1 request duy nhất
    (nhanh hơn gấp 50-100 lần so với gọi từng file một).
    """
    client = get_r2_client()
    if client is None or not keys_or_filenames:
        return 0

    keys_to_delete = set()
    for item in keys_or_filenames:
        if not item or not isinstance(item, str):
            continue
        normalized = item.strip().replace("\\", "/")
        if not normalized:
            continue

        if normalized.startswith("outputs/"):
            k = normalized
        elif "/" in normalized:
            k = f"outputs/{normalized.lstrip('/')}"
        else:
            name = os.path.basename(normalized)
            if name:
                k = f"outputs/{name}"
            else:
                continue

        keys_to_delete.add(k)
        base, ext = os.path.splitext(k)
        if ext.lower() in (".mp3", ".wav"):
            keys_to_delete.add(f"{base}.srt")

    if not keys_to_delete:
        return 0

    to_delete_objs = [{"Key": k} for k in keys_to_delete]
    deleted_count = 0

    try:
        for i in range(0, len(to_delete_objs), 1000):
            chunk = to_delete_objs[i : i + 1000]
            client.delete_objects(
                Bucket=R2_BUCKET_NAME,
                Delete={"Objects": chunk, "Quiet": True},
            )
            deleted_count += len(chunk)
        logger.info(f"🗑️ [Batch R2] Đã xóa hàng loạt {deleted_count} files/srt trên Cloudflare R2 trong 1 request duy nhất!")
        return deleted_count
    except Exception as e:
        logger.warning(f"⚠️ Lỗi khi xóa hàng loạt trên Cloudflare R2 ({len(to_delete_objs)} keys): {e}")
        return 0


def delete_session_from_r2(session_id: str) -> int:
    """
    Xóa toàn bộ các file thuộc một session trong outputs/audios/{session_id}/ trên Cloudflare R2.
    """
    client = get_r2_client()
    if client is None or not session_id:
        return 0

    safe_session_id = os.path.basename(session_id.strip())
    prefix = f"outputs/audios/{safe_session_id}/"
    deleted_count = 0

    try:
        paginator = client.get_paginator("list_objects_v2")
        to_delete = []
        for page in paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=prefix):
            for obj in page.get("Contents", []):
                to_delete.append({"Key": obj["Key"]})

        for i in range(0, len(to_delete), 1000):
            chunk = to_delete[i : i + 1000]
            client.delete_objects(
                Bucket=R2_BUCKET_NAME,
                Delete={"Objects": chunk, "Quiet": True},
            )
            deleted_count += len(chunk)

        if deleted_count > 0:
            logger.info(f"🗑️ Đã xóa trọn gói session R2: {prefix} ({deleted_count} files)")
        return deleted_count
    except Exception as e:
        logger.warning(f"⚠️ Lỗi khi xóa session trên Cloudflare R2 ({prefix}): {e}")
        return 0


def cleanup_orphan_r2_files(
    active_filenames: set[str],
    active_session_ids: set[str] | None = None,
    max_age_minutes: int = 15,
    force: bool = False,
) -> tuple[int, int]:
    """
    Quét và dọn dẹp các file rác mồ côi trên Cloudflare R2 bucket.
    Trả về (số file đã xóa, số bytes đã giải phóng).
    """
    client = get_r2_client()
    if client is None:
        return 0, 0

    active_sessions = active_session_ids or set()

    try:
        from datetime import datetime, timezone
        now_dt = datetime.now(timezone.utc)
        min_age_sec = max_age_minutes * 60

        paginator = client.get_paginator("list_objects_v2")
        deleted_count = 0
        freed_bytes = 0
        to_delete = []

        for page in paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix="outputs/"):
            for obj in page.get("Contents", []):
                key = obj.get("Key", "")
                filename = os.path.basename(key)
                if not filename or filename in ("demo_voice.wav", ".gitkeep"):
                    continue

                # Kiểm tra nếu file nằm trong outputs/audios/{session_id}/
                is_active = False
                if key.startswith("outputs/audios/"):
                    parts = key.split("/")
                    if len(parts) >= 4:
                        sess_id = parts[2]
                        if sess_id in active_sessions:
                            is_active = True
                if filename in active_filenames:
                    is_active = True

                if not is_active:
                    last_mod = obj.get("LastModified")
                    age_sec = (now_dt - last_mod).total_seconds() if last_mod else 0
                    if force or age_sec >= min_age_sec:
                        to_delete.append({"Key": key})
                        freed_bytes += obj.get("Size", 0)

        for i in range(0, len(to_delete), 1000):
            chunk = to_delete[i : i + 1000]
            client.delete_objects(
                Bucket=R2_BUCKET_NAME,
                Delete={"Objects": chunk, "Quiet": True},
            )
            deleted_count += len(chunk)
            logger.info(f"🧹 Đã dọn dẹp {len(chunk)} file rác trên Cloudflare R2 bucket.")

        return deleted_count, freed_bytes
    except Exception as e:
        logger.error(f"⚠️ Lỗi khi dọn dẹp file rác trên Cloudflare R2: {e}")
        return 0, 0

