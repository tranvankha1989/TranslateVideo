import os
import re
import time
import httpx
import sys
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import model_handler
from app.core.config import BASE_DIR, LOGS_DIR, APP_LOG_FILE, logger

router = APIRouter(prefix="/api/settings", tags=["Settings"])

ENV_FILE = BASE_DIR / ".env"



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


def _update_env_file(updates: dict[str, str]) -> None:
    """Cập nhật các biến trong file .env an toàn mà không làm mất comment hay cấu trúc khác."""
    env_path = ENV_FILE
    content = ""
    if env_path.exists():
        try:
            content = env_path.read_text(encoding="utf-8")
        except Exception:
            content = env_path.read_text(encoding="latin-1")

    for key, val in updates.items():
        pattern = rf"^{re.escape(key)}=.*$"
        replacement = f"{key}={val}"
        if re.search(pattern, content, flags=re.MULTILINE):
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        else:
            if content and not content.endswith("\n"):
                content += "\n"
            content += f"{replacement}\n"

    env_path.write_text(content, encoding="utf-8")
    load_dotenv(env_path, override=True)


@router.get("/hardware", response_model=HardwareSettingsResponse, summary="Lấy cấu hình phần cứng hiện tại")
async def get_hardware_settings():
    load_dotenv(ENV_FILE, override=True)
    use_remote = model_handler.is_remote_gpu_enabled()
    remote_url = model_handler.get_remote_gpu_url()
    remote_concurrency = int(os.getenv("REMOTE_CONCURRENCY", "2"))

    # pyrefly: ignore [missing-import]
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


def _clean_gpu_url(url: str | None) -> str:
    """Hàm an toàn chuẩn hóa Cloud GPU Worker URL."""
    if hasattr(model_handler, "normalize_remote_gpu_url"):
        return model_handler.normalize_remote_gpu_url(url)
    if not url:
        return ""
    cleaned = url.strip()
    if not cleaned:
        return ""
    if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
        cleaned = f"https://{cleaned}"
    cleaned = cleaned.rstrip("/")
    for suffix in ("/api/remote/health", "/gradio_api/remote/health", "/api/remote", "/gradio_api/remote", "/health"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)]
    return cleaned.rstrip("/")


@router.post("/hardware", response_model=HardwareSettingsResponse, summary="Cập nhật cấu hình phần cứng (.env)")
async def update_hardware_settings(req: UpdateHardwareSettingsRequest):
    url_cleaned = _clean_gpu_url(req.remote_gpu_url)
    updates = {
        "USE_REMOTE_GPU": "true" if req.use_remote_gpu else "false",
        "REMOTE_GPU_URL": url_cleaned,
        "REMOTE_CONCURRENCY": str(req.remote_concurrency or 2),
    }

    try:
        _update_env_file(updates)
        model_handler.is_remote_gpu_enabled()
        model_handler.get_remote_gpu_url()
        logger.info(f"⚙️ Đã cập nhật cấu hình GPU: USE_REMOTE_GPU={req.use_remote_gpu}, URL='{url_cleaned}'")
    except Exception as e:
        logger.error(f"Lỗi khi ghi file .env: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể ghi cấu hình vào .env: {e}")

    return await get_hardware_settings()


@router.post("/hardware/test", response_model=TestRemoteGpuResponse, summary="Kiểm tra kết nối tới Cloud GPU Worker")
async def test_remote_gpu(req: TestRemoteGpuRequest):
    base_url = _clean_gpu_url(req.remote_gpu_url)
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
                    last_error = f"Máy chủ trả về mã HTTP 404 (Không tìm thấy endpoint). Vui lòng kiểm tra lại đường dẫn!"
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

    # Nạp lại cấu hình model_handler
    model_handler.is_remote_gpu_enabled()
    model_handler.get_remote_gpu_url()

    # Nếu chuyển sang local và chưa nạp mô hình
    if not model_handler.is_remote_gpu_enabled() and model_handler._model is None:
        try:
            model_handler.load_model()
        except Exception as e:
            logger.warning(f"Chưa thể nạp local model ngay: {e}")

    # Nạp lại kết nối database nếu MONGODB_URI thay đổi
    from app.core.database import connect_db
    try:
        await connect_db()
    except Exception as e:
        logger.warning(f"Lỗi kết nối lại DB: {e}")

    # Lấy lại trạng thái mới nhất
    hw = await get_hardware_settings()

    logger.info("🔄 Đã làm mới Backend và nạp lại toàn bộ cấu hình .env thành công.")
    return {
        "status": "ok",
        "message": "Đã làm mới Backend và cập nhật file .env thành công!",
        "hardware": hw,
    }


# ─── QUẢN LÝ PHIÊN BẢN & TỰ ĐỘNG CẬP NHẬT PHẦN MỀM (AUTO UPDATE) ─────────────

REPO_ROOT = BASE_DIR.parent
VERSION_FILE = REPO_ROOT / "version.json"


class AppVersionResponse(BaseModel):
    version: str
    name: Optional[str] = "VoiceSync AI"
    release_date: Optional[str] = None
    description: Optional[str] = None
    git_branch: Optional[str] = None
    git_commit: Optional[str] = None
    git_commit_date: Optional[str] = None


class CheckUpdateResponse(BaseModel):
    ok: bool
    has_update: bool
    current_version: str
    latest_remote_commit: Optional[str] = None
    commits_behind: int = 0
    commit_messages: list[str] = []
    message: str
    error: Optional[str] = None


class PerformUpdateResponse(BaseModel):
    ok: bool
    message: str
    new_version: Optional[str] = None
    logs: list[str] = []
    error: Optional[str] = None


def _get_git_output(args: list[str], cwd: Path = REPO_ROOT, timeout: float = 12.0) -> tuple[int, str]:
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        output = (res.stdout or "").strip()
        if not output and res.stderr:
            output = res.stderr.strip()
        return res.returncode, output
    except Exception as e:
        return -1, str(e)


@router.get("/app-version", response_model=AppVersionResponse, summary="Lấy thông tin phiên bản phần mềm hiện tại")
async def get_app_version_endpoint():
    """Trả về thông tin phiên bản, ngày phát hành và commit Git hiện tại."""
    ver_data = {
        "version": "3.0.1",
        "name": "VoiceSync AI",
        "release_date": None,
        "description": None,
    }

    if VERSION_FILE.exists():
        try:
            import json
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                ver_data.update(loaded)
        except Exception as e:
            logger.warning(f"Không thể đọc version.json: {e}")

    # Lấy thông tin Git
    branch_code, branch_name = _get_git_output(["branch", "--show-current"])
    commit_code, commit_hash = _get_git_output(["rev-parse", "--short", "HEAD"])
    date_code, commit_date = _get_git_output(["log", "-1", "--format=%cd", "--date=short"])

    return AppVersionResponse(
        version=ver_data.get("version", "3.0.1"),
        name=ver_data.get("name", "VoiceSync AI"),
        release_date=ver_data.get("release_date"),
        description=ver_data.get("description"),
        git_branch=branch_name if branch_code == 0 and branch_name else "main",
        git_commit=commit_hash if commit_code == 0 and commit_hash else None,
        git_commit_date=commit_date if date_code == 0 and commit_date else None,
    )


@router.post("/check-update", response_model=CheckUpdateResponse, summary="Kiểm tra xem có bản cập nhật mới từ GitHub không")
async def check_update_endpoint():
    """Kết nối tới GitHub remote để kiểm tra xem có commit mới chưa được cập nhật không."""
    cur_ver = "2.9.0"
    if VERSION_FILE.exists():
        try:
            import json
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                cur_ver = json.load(f).get("version", "2.9.0")
        except Exception:
            pass

    # 1. Fetch remote origin
    fetch_code, fetch_err = _get_git_output(["fetch", "origin", "main"], timeout=15.0)
    if fetch_code != 0:
        # Thử fetch chung nếu branch mặc định khác
        fetch_code, fetch_err = _get_git_output(["fetch"], timeout=15.0)

    if fetch_code != 0:
        return CheckUpdateResponse(
            ok=False,
            has_update=False,
            current_version=cur_ver,
            message="Không thể kết nối tới Git Remote hoặc mạng Internet bị ngắt quãng.",
            error=fetch_err,
        )

    # 2. Đếm số commit chưa kéo về
    count_code, count_str = _get_git_output(["rev-list", "HEAD..origin/main", "--count"])
    if count_code != 0:
        # Thử với @{u} (upstream)
        count_code, count_str = _get_git_output(["rev-list", "HEAD..@{u}", "--count"])

    behind_count = 0
    try:
        behind_count = int(count_str.strip()) if count_code == 0 else 0
    except ValueError:
        behind_count = 0

    # 3. Lấy log các commit mới
    log_code, log_str = _get_git_output(["log", "HEAD..origin/main", "--oneline", "-n", "8"])
    if log_code != 0:
        log_code, log_str = _get_git_output(["log", "HEAD..@{u}", "--oneline", "-n", "8"])

    commit_msgs = [line.strip() for line in log_str.splitlines() if line.strip()] if log_code == 0 else []

    # Lấy hash commit mới nhất từ remote
    rem_code, rem_hash = _get_git_output(["rev-parse", "--short", "origin/main"])

    if behind_count > 0:
        return CheckUpdateResponse(
            ok=True,
            has_update=True,
            current_version=cur_ver,
            latest_remote_commit=rem_hash if rem_code == 0 else None,
            commits_behind=behind_count,
            commit_messages=commit_msgs,
            message=f"Đã tìm thấy {behind_count} bản cập nhật mới trên GitHub! Sẵn sàng nâng cấp.",
        )
    else:
        return CheckUpdateResponse(
            ok=True,
            has_update=False,
            current_version=cur_ver,
            latest_remote_commit=rem_hash if rem_code == 0 else None,
            commits_behind=0,
            commit_messages=[],
            message="Ứng dụng của bạn đang ở phiên bản mới nhất!",
        )


@router.post("/perform-update", response_model=PerformUpdateResponse, summary="Tiến hành kéo code cập nhật phần mềm")
async def perform_update_endpoint():
    """
    Thực hiện kéo code từ GitHub (git pull origin main) và cập nhật hệ thống:
    - Kéo mã nguồn mới nhất
    - Cài đặt thư viện bổ sung nếu có
    - Đọc lại thông tin phiên bản mới
    """
    logs: list[str] = []

    # 1. Git pull
    logs.append("🚀 [1/3] Đang kéo mã nguồn mới nhất từ GitHub (git pull)...")
    pull_code, pull_out = _get_git_output(["pull", "origin", "main"], timeout=30.0)
    if pull_code != 0:
        pull_code, pull_out = _get_git_output(["pull"], timeout=30.0)

    logs.append(pull_out)

    if pull_code != 0:
        return PerformUpdateResponse(
            ok=False,
            message="Không thể kéo mã nguồn từ GitHub. Hãy kiểm tra kết nối mạng hoặc xung đột Git.",
            logs=logs,
            error=pull_out,
        )

    # 2. Cài đặt thư viện phụ thuộc nếu có file requirements.txt
    req_file = BASE_DIR / "requirements.txt"
    if req_file.exists():
        logs.append("📦 [2/3] Kiểm tra và cập nhật thư viện Python phụ thuộc...")
        try:
            pip_cmd = [sys.executable, "-m", "pip", "install", "-r", str(req_file), "--quiet"]
            res = subprocess.run(pip_cmd, cwd=str(BASE_DIR), capture_output=True, text=True, timeout=90.0)
            if res.returncode == 0:
                logs.append("✅ Thư viện Python đã được đồng bộ chuẩn xác.")
            else:
                logs.append(f"⚠️ Cảnh báo pip: {res.stderr[:200]}")
        except Exception as pe:
            logs.append(f"⚠️ Bỏ qua cập nhật pip: {pe}")

    # 3. Đọc lại version mới
    new_ver = "2.9.0"
    if VERSION_FILE.exists():
        try:
            import json
            with open(VERSION_FILE, "r", encoding="utf-8") as f:
                new_ver = json.load(f).get("version", new_ver)
        except Exception:
            pass

    logs.append(f"🎉 [3/3] Nâng cấp hoàn tất thành công! Phiên bản hiện tại: v{new_ver}")

    return PerformUpdateResponse(
        ok=True,
        message=f"Cập nhật thành công lên phiên bản v{new_ver}!",
        new_version=new_ver,
        logs=logs,
    )


# ─── Quản lý & Xem Nhật Ký Hệ Thống (Diagnostic & Log Management) ──────────────

@router.get("/logs/content", summary="Đọc nội dung file log gần nhất")
async def get_log_content(lines: int = 300):
    """Đọc N dòng cuối cùng từ logs/app.log để hiển thị trực tiếp lên giao diện người dùng."""
    if not APP_LOG_FILE.exists():
        return {
            "content": "Chưa có file nhật ký nào được ghi. Hệ thống đang hoạt động bình thường.",
            "total_lines": 0,
            "file_size_kb": 0,
            "log_path": str(APP_LOG_FILE),
        }
    try:
        with open(APP_LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
            total = len(all_lines)
            selected = all_lines[-lines:] if total > lines else all_lines
            return {
                "content": "".join(selected),
                "total_lines": total,
                "returned_lines": len(selected),
                "file_size_kb": round(APP_LOG_FILE.stat().st_size / 1024, 1),
                "log_path": str(APP_LOG_FILE),
            }
    except Exception as e:
        logger.error(f"Lỗi khi đọc file log: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể đọc file nhật ký: {e}")


@router.get("/logs/download", summary="Tải trực tiếp file log về máy")
async def download_log_file():
    """Tải toàn bộ file app.log về máy để gửi cho kỹ thuật viên hỗ trợ phân tích."""
    if not APP_LOG_FILE.exists():
        raise HTTPException(status_code=404, detail="File nhật ký chưa tồn tại.")
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    return FileResponse(
        path=str(APP_LOG_FILE),
        filename=f"voicesync_app_log_{timestamp_str}.log",
        media_type="text/plain; charset=utf-8",
    )


@router.post("/logs/open-folder", summary="Mở thư mục logs trong File Explorer")
async def open_logs_folder():
    """Mở thư mục chứa file logs trên Windows Explorer / Finder."""
    if not LOGS_DIR.exists():
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if sys.platform == "win32":
            os.startfile(str(LOGS_DIR))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(LOGS_DIR)])
        else:
            subprocess.Popen(["xdg-open", str(LOGS_DIR)])
        return {"ok": True, "message": f"Đã mở thư mục logs: {LOGS_DIR}"}
    except Exception as e:
        logger.error(f"Lỗi khi mở thư mục logs: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể mở thư mục: {e}")


@router.post("/logs/clear", summary="Xóa sạch nội dung log cũ")
async def clear_logs():
    """Xóa nội dung file app.log để bắt đầu phiên làm việc mới."""
    try:
        if APP_LOG_FILE.exists():
            with open(APP_LOG_FILE, "w", encoding="utf-8") as f:
                f.write(f"=== Nhật ký đã được làm mới lúc {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n")
        return {"ok": True, "message": "Đã xóa sạch nội dung nhật ký cũ thành công!"}
    except Exception as e:
        logger.error(f"Lỗi khi làm mới file log: {e}")
        raise HTTPException(status_code=500, detail=f"Không thể xóa log: {e}")


# ─── BỘ LỌC QUẢNG CÁO & DẠY AI BỎ QUA TỪ/CÂU TÙY CHỈNH (AD FILTER RULES) ────

class AdFilterRulesRequest(BaseModel):
    rules: list[str]


class AddAdFilterRuleRequest(BaseModel):
    phrase: str


class DeleteAdFilterRuleRequest(BaseModel):
    phrase: str


@router.get("/ad-filter-rules", summary="Lấy danh sách các từ/câu dạy cho AI bỏ qua")
async def get_ad_filter_rules():
    from app.services.ad_filter_service import AdFilterService
    return {
        "status": "ok",
        "rules": AdFilterService.get_custom_rules(),
    }


@router.post("/ad-filter-rules", summary="Lưu toàn bộ danh sách quy tắc lọc quảng cáo tùy chỉnh")
async def save_ad_filter_rules(req: AdFilterRulesRequest):
    from app.services.ad_filter_service import AdFilterService
    ok = AdFilterService.save_custom_rules(req.rules)
    if not ok:
        raise HTTPException(status_code=500, detail="Không thể lưu danh sách quy tắc lọc quảng cáo.")
    return {
        "status": "ok",
        "message": f"Đã lưu thành công {len(req.rules)} quy tắc lọc quảng cáo/từ bỏ qua!",
        "rules": AdFilterService.get_custom_rules(),
    }


@router.post("/ad-filter-rules/add", summary="Dạy AI một từ hoặc câu mới cần loại bỏ")
async def add_ad_filter_rule(req: AddAdFilterRuleRequest):
    from app.services.ad_filter_service import AdFilterService
    p = req.phrase.strip()
    if not p:
        raise HTTPException(status_code=400, detail="Cụm từ không được để trống.")
    ok = AdFilterService.add_custom_rule(p)
    if not ok:
        raise HTTPException(status_code=500, detail="Không thể thêm quy tắc.")
    return {
        "status": "ok",
        "message": f"Đã dạy cho AI bỏ qua câu: '{p}'",
        "rules": AdFilterService.get_custom_rules(),
    }


@router.post("/ad-filter-rules/delete", summary="Xóa một từ hoặc câu khỏi danh sách lọc")
async def delete_ad_filter_rule(req: DeleteAdFilterRuleRequest):
    from app.services.ad_filter_service import AdFilterService
    p = req.phrase.strip()
    if not p:
        raise HTTPException(status_code=400, detail="Cụm từ không được để trống.")
    ok = AdFilterService.delete_custom_rule(p)
    if not ok:
        raise HTTPException(status_code=500, detail="Không thể xóa quy tắc.")
    return {
        "status": "ok",
        "message": f"Đã xóa quy tắc: '{p}'",
        "rules": AdFilterService.get_custom_rules(),
    }



