import os
import urllib.parse
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from app.core.config import OUTPUTS_DIR, get_custom_output_dir, logger

router = APIRouter(prefix="/api/storage", tags=["Storage & Download"])


def _find_local_file(target_name: str) -> Optional[Path]:
    """Tìm kiếm file an toàn trong OUTPUTS_DIR và CUSTOM_OUTPUT_DIR."""
    clean_name = os.path.basename(target_name.split("?")[0].strip())
    if not clean_name:
        return None

    # 1. Thử trực tiếp tại OUTPUTS_DIR
    direct_path = OUTPUTS_DIR / clean_name
    if direct_path.is_file():
        return direct_path

    # 2. Tìm kiếm đệ quy trong các thư mục con của OUTPUTS_DIR
    found = list(OUTPUTS_DIR.glob(f"**/{clean_name}"))
    if found and found[0].is_file():
        return found[0]

    # 3. Tìm trong CUSTOM_OUTPUT_DIR nếu được thiết lập
    custom_dir = get_custom_output_dir()
    if custom_dir and custom_dir.is_dir():
        c_direct = custom_dir / clean_name
        if c_direct.is_file():
            return c_direct
        c_found = list(custom_dir.glob(f"**/{clean_name}"))
        if c_found and c_found[0].is_file():
            return c_found[0]

    return None


@router.get("/download", summary="Proxy Download tải file an toàn từ Cloudflare R2 hoặc máy chủ cục bộ")
@router.get("/proxy-download", summary="Alias cho proxy download")
async def proxy_download_file(
    url: Optional[str] = Query(None, description="Đường dẫn URL từ xa hoặc đường dẫn nội bộ"),
    filename: Optional[str] = Query(None, description="Tên file tùy chọn khi lưu về máy"),
    path: Optional[str] = Query(None, description="Đường dẫn file trên ổ đĩa local"),
):
    """
    Tải file về máy người dùng không bị chặn CORS:
    - Nếu là Cloudflare R2 (hoặc remote URL): Backend stream dữ liệu trực tiếp về client kèm header attachment.
    - Nếu là file cục bộ: Tìm kiếm và trả về FileResponse.
    """
    raw_url = (url or "").strip()
    raw_path = (path or "").strip()

    # ── 1. Trường hợp tải qua Remote URL (Cloudflare R2, S3, HTTP/HTTPS) ──────
    if raw_url.startswith("http://") or raw_url.startswith("https://"):
        parsed = urllib.parse.urlparse(raw_url)
        url_path = parsed.path

        # Nếu là URL trỏ về chính backend local (127.0.0.1:8000 hoặc localhost:8000)
        if parsed.netloc in ("127.0.0.1:8000", "localhost:8000", "0.0.0.0:8000"):
            extracted_filename = os.path.basename(url_path)
            local_file = _find_local_file(extracted_filename)
            if local_file:
                safe_download_name = filename or local_file.name
                return FileResponse(
                    path=str(local_file),
                    filename=safe_download_name,
                    headers={
                        "Content-Disposition": f'attachment; filename="{urllib.parse.quote(safe_download_name)}"',
                        "Access-Control-Allow-Origin": "*",
                    },
                )

        # Xử lý Remote URL (Cloudflare R2): Stream dữ liệu về
        default_file_name = os.path.basename(url_path) or "downloaded_file"
        safe_download_name = filename or default_file_name

        try:
            client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
            req = client.build_request("GET", raw_url)
            resp = await client.send(req, stream=True)

            if resp.status_code != 200:
                await resp.aclose()
                await client.aclose()
                logger.warning(f"⚠️ [ProxyDownload] Tải từ Cloud thất bại ({resp.status_code}): {raw_url}")
                raise HTTPException(status_code=resp.status_code, detail=f"Không thể tải file từ Cloud (HTTP {resp.status_code})")

            async def stream_generator():
                try:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
                finally:
                    await resp.aclose()
                    await client.aclose()

            content_type = resp.headers.get("content-type", "application/octet-stream")
            content_length = resp.headers.get("content-length")

            headers = {
                "Content-Disposition": f'attachment; filename="{urllib.parse.quote(safe_download_name)}"',
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
            }
            if content_length:
                headers["Content-Length"] = content_length

            logger.info(f"☁️ [ProxyDownload] Đang stream file từ Cloud: {safe_download_name}")
            return StreamingResponse(
                stream_generator(),
                media_type=content_type,
                headers=headers,
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"❌ [ProxyDownload] Lỗi khi kết nối Cloudflare R2: {exc}")
            raise HTTPException(status_code=500, detail=f"Lỗi khi tải file từ Cloud: {str(exc)}")

    # ── 2. Trường hợp tải file cục bộ (Local File) ────────────────────────────
    file_candidate = None
    if raw_path:
        p = Path(raw_path)
        if p.is_file():
            file_candidate = p
        else:
            file_candidate = _find_local_file(p.name)

    if not file_candidate and raw_url:
        file_candidate = _find_local_file(raw_url)

    if not file_candidate and filename:
        file_candidate = _find_local_file(filename)

    if file_candidate and file_candidate.is_file():
        safe_download_name = filename or file_candidate.name
        return FileResponse(
            path=str(file_candidate),
            filename=safe_download_name,
            headers={
                "Content-Disposition": f'attachment; filename="{urllib.parse.quote(safe_download_name)}"',
                "Access-Control-Allow-Origin": "*",
            },
        )

    raise HTTPException(status_code=404, detail="Không tìm thấy file yêu cầu trên máy chủ")
