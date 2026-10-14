"""
app/routers/settings/hardware.py
────────────────────────────────
Router quản lý cấu hình phần cứng: Local GPU (CUDA) và Cloud GPU Worker.
"""

import os
import re
import time
import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

import model_handler
from app.core.config import logger
from app.routers.settings.env_helper import ENV_FILE, update_env_file

router = APIRouter()


class HardwareSettingsResponse(BaseModel):
    use_remote_gpu: bool
    remote_gpu_url: str
    remote_concurrency: int = 2
    local_device: str
    cuda_available: bool
    cuda_device_name: Optional[str] = None
    cuda_vram_gb: Optional[float] = None


class UpdateHardwareSettingsRequest(BaseModel):
    use_remote_gpu: bool
    remote_gpu_url: str
    remote_concurrency: Optional[int] = 2


class TestRemoteGpuRequest(BaseModel):
    remote_gpu_url: str


class TestRemoteGpuResponse(BaseModel):
    ok: bool
    gpu_name: Optional[str] = None
    vram_total_gb: Optional[float] = None
    provider: Optional[str] = None
    ping_ms: Optional[int] = None
    error: Optional[str] = None


def clean_gpu_url(url: str | None) -> str:
    """Hàm an toàn chuẩn hóa Cloud GPU Worker URL (Hugging Face Spaces & Colab & Kaggle)."""
    if hasattr(model_handler, "normalize_remote_gpu_url"):
        return model_handler.normalize_remote_gpu_url(url)
    if not url:
        return ""
    cleaned = url.strip()
    if not cleaned:
        return ""
    if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
        cleaned = f"https://{cleaned}"

    hf_match = re.match(r"https?://huggingface\.co/spaces/([^/]+)/([^/?#]+)", cleaned, re.IGNORECASE)
    if hf_match:
        owner = hf_match.group(1).lower().replace("_", "-")
        space = hf_match.group(2).lower().replace("_", "-")
        cleaned = f"https://{owner}-{space}.hf.space"

    cleaned = cleaned.rstrip("/")
    for suffix in (
        "/api/remote/health",
        "/gradio_api/remote/health",
        "/api/remote",
        "/gradio_api/remote",
        "/health",
    ):
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)]
    return cleaned.rstrip("/")


@router.get("/hardware", response_model=HardwareSettingsResponse, summary="Lấy cấu hình phần cứng hiện tại")
async def get_hardware_settings():
    load_dotenv(ENV_FILE, override=True)
    use_remote = model_handler.is_remote_gpu_enabled()
    remote_url = model_handler.get_remote_gpu_url()
    remote_concurrency = int(os.getenv("REMOTE_CONCURRENCY", "2"))

    import torch
    cuda_ok = torch.cuda.is_available()
    dev_name = torch.cuda.get_device_name(0) if cuda_ok else None
    vram_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2) if cuda_ok else None
    local_dev = "cuda" if cuda_ok else "cpu"

    return HardwareSettingsResponse(
        use_remote_gpu=use_remote,
        remote_gpu_url=remote_url,
        remote_concurrency=remote_concurrency,
        local_device=local_dev,
        cuda_available=cuda_ok,
        cuda_device_name=dev_name,
        cuda_vram_gb=vram_gb,
    )


@router.post("/hardware", response_model=HardwareSettingsResponse, summary="Cập nhật cấu hình phần cứng (.env)")
async def update_hardware_settings(req: UpdateHardwareSettingsRequest):
    url_cleaned = clean_gpu_url(req.remote_gpu_url)
    updates = {
        "USE_REMOTE_GPU": "true" if req.use_remote_gpu else "false",
        "REMOTE_GPU_URL": url_cleaned,
        "REMOTE_CONCURRENCY": str(req.remote_concurrency or 2),
    }

    try:
        update_env_file(updates)
        model_handler.is_remote_gpu_enabled()
        model_handler.get_remote_gpu_url()
        logger.info(f"⚙️ Đã cập nhật cấu hình GPU: USE_REMOTE_GPU={req.use_remote_gpu}, URL='{url_cleaned}'")
    except Exception as e:
        logger.error(f"Lỗi khi ghi file .env: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể ghi cấu hình vào .env: {e}")

    return await get_hardware_settings()


@router.post("/hardware/test", response_model=TestRemoteGpuResponse, summary="Kiểm tra kết nối tới Cloud GPU Worker")
async def test_remote_gpu(req: TestRemoteGpuRequest):
    base_url = clean_gpu_url(req.remote_gpu_url)
    if not base_url:
        return TestRemoteGpuResponse(ok=False, error="Vui lòng nhập đường dẫn URL của Cloud GPU Worker.")

    endpoints_to_try = []
    if "hf.space" in base_url.lower():
        endpoints_to_try = [
            f"{base_url}/gradio_api/remote/health",
            f"{base_url}/api/remote/health",
        ]
    else:
        endpoints_to_try = [
            f"{base_url}/api/remote/health",
            f"{base_url}/gradio_api/remote/health",
        ]

    headers = {
        "ngrok-skip-browser-warning": "1",
        "User-Agent": "OmniVoice/1.0",
    }
    hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    if hf_token and hf_token.strip():
        headers["Authorization"] = f"Bearer {hf_token.strip()}"

    start_time = time.time()
    last_error = None

    for endpoint in endpoints_to_try:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(endpoint, headers=headers)
                elapsed_ms = int((time.time() - start_time) * 1000)

                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        gpu_name = data.get("gpu_name", "GPU Sẵn sàng")
                        vram = float(data.get("vram_total_gb", 0)) if data.get("vram_total_gb") else None
                        provider = data.get("provider")
                        if not provider:
                            if "hf.space" in base_url.lower():
                                provider = "Hugging Face Spaces (ZeroGPU A100)"
                            elif "ngrok" in base_url.lower():
                                provider = "Google Colab (Ngrok)"
                            elif "trycloudflare" in base_url.lower():
                                provider = "Cloudflare Tunnel"
                            else:
                                provider = "Cloud GPU Worker"

                        return TestRemoteGpuResponse(
                            ok=True,
                            gpu_name=gpu_name,
                            vram_total_gb=vram,
                            provider=provider,
                            ping_ms=elapsed_ms,
                        )
                    except Exception:
                        return TestRemoteGpuResponse(
                            ok=True,
                            gpu_name="Cloud Worker",
                            provider="Cloud GPU",
                            ping_ms=elapsed_ms,
                        )
                elif resp.status_code == 404:
                    body_sample = resp.text[:300]
                    if "ERR_NGROK_3200" in body_sample or "ngrok" in body_sample.lower():
                        return TestRemoteGpuResponse(
                            ok=False,
                            error="Mã lỗi ERR_NGROK_3200: Đường hầm Ngrok chưa mở hoặc Google Colab chưa được bấm chạy Run!",
                            ping_ms=elapsed_ms,
                        )
                    last_error = "Máy chủ trả về mã HTTP 404 (Không tìm thấy endpoint). Vui lòng kiểm tra lại đường dẫn!"
                elif resp.status_code in (502, 503, 504):
                    last_error = f"Máy chủ Cloud GPU đang khởi động hoặc chưa sẵn sàng (HTTP {resp.status_code})."
                else:
                    last_error = f"Máy chủ trả về lỗi HTTP {resp.status_code}."
        except Exception as e:
            last_error = f"Lỗi kết nối ({e})"

    return TestRemoteGpuResponse(
        ok=False,
        error=last_error or "Không thể kết nối tới Cloud GPU. Vui lòng kiểm tra lại đường dẫn!",
        ping_ms=int((time.time() - start_time) * 1000),
    )
