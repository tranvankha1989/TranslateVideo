"""
app/routers/settings/updater.py
───────────────────────────────
Router quản lý phiên bản phần mềm và cơ chế tự động cập nhật (3-Tier Auto-Adaptive Updater).
"""

import sys
import subprocess
import shutil
import json
import base64
import time
import re
from pathlib import Path
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
import httpx
from dotenv import load_dotenv

from app.core.config import (
    BASE_DIR,
    APP_VERSION,
    POSSIBLE_VERSION_FILES,
    _sync_env_file,
    logger,
)
from app.routers.settings.env_helper import ENV_FILE

router = APIRouter()

REPO_ROOT = BASE_DIR.parent if (BASE_DIR.parent / "version.json").exists() else BASE_DIR


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
    release_tag: Optional[str] = None
    release_notes: Optional[str] = None
    patch_asset_url: Optional[str] = None
    patch_asset_name: Optional[str] = None
    patch_asset_size_mb: Optional[float] = None


class PerformUpdateResponse(BaseModel):
    ok: bool
    message: str
    new_version: Optional[str] = None
    logs: list[str] = []
    error: Optional[str] = None


def get_git_output(args: list[str], cwd: Path = REPO_ROOT, timeout: float = 12.0) -> tuple[int, str]:
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


def apply_update_zip(zip_bytes: bytes, project_root: Path) -> None:
    """Giải nén gói cập nhật đè vào thư mục cài đặt, bảo vệ 100% dữ liệu người dùng."""
    import zipfile
    import io

    protected_paths = {
        ".env",
        "backend/.env",
        "backend/venv",
        "frontend/node_modules",
        "outputs",
        "backend/outputs",
        "presets/custom",
        "presets/custom_voices.json",
        "presets/custom_voices_user.json",
        "backend/presets/custom",
        "backend/presets/custom_voices.json",
        "backend/presets/custom_voices_user.json",
        "logs",
        "backend/logs",
    }

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        prefix = ""
        namelist = z.namelist()
        if namelist and "/" in namelist[0]:
            first_dir = namelist[0].split("/")[0]
            if first_dir.startswith("TranslateVideo-") or first_dir.startswith("patch-") or first_dir.startswith("release-"):
                prefix = first_dir + "/"

        for member in z.infolist():
            rel_path = member.filename
            if prefix and rel_path.startswith(prefix):
                rel_path = rel_path[len(prefix):]

            if not rel_path:
                continue

            should_skip = False
            for p in protected_paths:
                if rel_path == p or rel_path.startswith(p + "/") or rel_path.startswith(p + "\\"):
                    should_skip = True
                    break

            if should_skip:
                continue

            dest_path = project_root / rel_path
            if member.is_dir():
                dest_path.mkdir(parents=True, exist_ok=True)
            else:
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                with z.open(member) as source, open(dest_path, "wb") as target:
                    target.write(source.read())

    frontend_dist = project_root / "frontend" / "dist"
    root_dist = project_root / "dist"
    try:
        if frontend_dist.is_dir():
            root_dist.mkdir(parents=True, exist_ok=True)
            shutil.copytree(str(frontend_dist), str(root_dist), dirs_exist_ok=True)
        elif root_dist.is_dir():
            frontend_dist.mkdir(parents=True, exist_ok=True)
            shutil.copytree(str(root_dist), str(frontend_dist), dirs_exist_ok=True)
    except Exception as e:
        logger.warning(f"Lỗi đồng bộ thư mục dist: {e}")


def try_build_frontend(logs: list[str], project_root: Path) -> bool:
    """Tự động biên dịch lại Frontend nếu máy có pnpm hoặc npm (Môi trường Dev / Lập trình viên)."""
    frontend_dir = project_root / "frontend"
    if not (frontend_dir / "package.json").exists():
        return False

    pnpm_cmd = shutil.which("pnpm") or shutil.which("pnpm.cmd")
    npm_cmd = shutil.which("npm") or shutil.which("npm.cmd")
    build_tool = pnpm_cmd or npm_cmd

    if not build_tool:
        return False

    tool_name = Path(build_tool).stem
    logs.append(f"🔨 [Tự động biên dịch] Phát hiện {tool_name}, đang chạy build Frontend mới nhất...")
    try:
        res = subprocess.run(
            [build_tool, "run", "build"],
            cwd=str(frontend_dir),
            capture_output=True,
            text=True,
            timeout=180.0,
            shell=sys.platform == "win32",
        )
        if res.returncode == 0:
            logs.append("✅ Đã biên dịch Frontend mới thành công.")
            frontend_dist = frontend_dir / "dist"
            root_dist = project_root / "dist"
            if frontend_dist.is_dir():
                try:
                    root_dist.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(str(frontend_dist), str(root_dist), dirs_exist_ok=True)
                    logs.append("✅ Đã đồng bộ bundle giao diện mới sang dist.")
                except Exception:
                    pass
            return True
        else:
            err_msg = (res.stderr or res.stdout or "")[:200]
            logs.append(f"⚠️ Cảnh báo build Frontend: {err_msg}")
            return False
    except Exception as be:
        logs.append(f"⚠️ Bỏ qua build Frontend ({be})")
        return False


@router.get("/app-version", response_model=AppVersionResponse, summary="Lấy thông tin phiên bản phần mềm hiện tại")
async def get_app_version_endpoint():
    """Trả về thông tin phiên bản, ngày phát hành và commit Git hiện tại."""
    ver_data = {
        "version": APP_VERSION,
        "name": "VoiceSync AI",
        "release_date": "2026-10-05",
        "description": "VideoTranslate AI Studio",
    }

    for v_path in POSSIBLE_VERSION_FILES:
        if v_path.exists():
            try:
                with open(v_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    ver_data.update(loaded)
                break
            except Exception as e:
                logger.warning(f"Không thể đọc version.json: {e}")

    branch_code, branch_name = get_git_output(["branch", "--show-current"])
    commit_code, commit_hash = get_git_output(["rev-parse", "--short", "HEAD"])
    date_code, commit_date = get_git_output(["log", "-1", "--format=%cd", "--date=short"])

    return AppVersionResponse(
        version=ver_data.get("version", APP_VERSION),
        name=ver_data.get("name", "VoiceSync AI"),
        release_date=ver_data.get("release_date"),
        description=ver_data.get("description"),
        git_branch=branch_name if branch_code == 0 and branch_name else "main",
        git_commit=commit_hash if commit_code == 0 and commit_hash else None,
        git_commit_date=commit_date if date_code == 0 and commit_date else None,
    )


@router.post("/check-update", response_model=CheckUpdateResponse, summary="Kiểm tra xem có bản cập nhật mới từ GitHub không")
async def check_update_endpoint():
    """Kiểm tra phiên bản mới thông minh qua GitHub Release API & fallback version.json."""
    cur_ver = APP_VERSION
    for v_path in POSSIBLE_VERSION_FILES:
        if v_path.exists():
            try:
                with open(v_path, "r", encoding="utf-8") as f:
                    cur_ver = json.load(f).get("version", cur_ver)
                break
            except Exception:
                pass

    def parse_v(v_str: str) -> list[int]:
        return [int(x) for x in re.findall(r"\d+", v_str)]

    headers = {
        "User-Agent": "VideoTranslate-AI/1.0",
        "Accept": "application/vnd.github.v3+json",
    }

    remote_ver = None
    remote_desc = None
    patch_url = None
    patch_name = None
    patch_size = None

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            rel_url = "https://api.github.com/repos/tranvankha1989/TranslateVideo/releases/latest"
            resp = await client.get(rel_url, headers=headers)
            if resp.status_code == 200:
                rel_data = resp.json()
                tag_name = rel_data.get("tag_name", "")
                remote_ver = tag_name.lstrip("v")
                remote_desc = rel_data.get("body") or rel_data.get("name")

                for a in rel_data.get("assets", []):
                    aname = a.get("name", "").lower()
                    if aname.endswith(".zip") and any(k in aname for k in ("patch", "dist", "bundle", "update")):
                        patch_url = a.get("browser_download_url")
                        patch_name = a.get("name")
                        patch_size = round(a.get("size", 0) / (1024 * 1024), 2)
                        break
    except Exception as e:
        logger.warning(f"Không thể kiểm tra GitHub Release: {e}")

    if not remote_ver:
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                api_url = "https://api.github.com/repos/tranvankha1989/TranslateVideo/contents/version.json"
                resp = await client.get(api_url, headers=headers)
                if resp.status_code == 200:
                    api_data = resp.json()
                    content_b64 = api_data.get("content", "")
                    if content_b64:
                        raw_text = base64.b64decode(content_b64).decode("utf-8")
                        data = json.loads(raw_text)
                        remote_ver = data.get("version")
                        remote_desc = data.get("description")

                if not remote_ver:
                    raw_url = f"https://raw.githubusercontent.com/tranvankha1989/TranslateVideo/main/version.json?t={int(time.time())}"
                    resp_raw = await client.get(raw_url, headers=headers)
                    if resp_raw.status_code == 200:
                        data = resp_raw.json()
                        remote_ver = data.get("version")
                        remote_desc = data.get("description")
        except Exception as e:
            logger.warning(f"Không thể kiểm tra version qua GitHub: {e}")

    if remote_ver and remote_ver != cur_ver:
        try:
            if parse_v(remote_ver) > parse_v(cur_ver):
                patch_hint = f" (Sẵn sàng gói patch pre-built {patch_size}MB)" if patch_url else ""
                return CheckUpdateResponse(
                    ok=True,
                    has_update=True,
                    current_version=cur_ver,
                    latest_remote_commit=f"v{remote_ver}",
                    commits_behind=1,
                    commit_messages=[remote_desc or f"Bản phát hành mới v{remote_ver} trên GitHub"],
                    message=f"Đã có phiên bản mới v{remote_ver}!{patch_hint} Sẵn sàng nâng cấp 1-Click.",
                    release_tag=f"v{remote_ver}",
                    release_notes=remote_desc,
                    patch_asset_url=patch_url,
                    patch_asset_name=patch_name,
                    patch_asset_size_mb=patch_size,
                )
        except Exception:
            pass

    fetch_code, _ = get_git_output(["fetch", "origin", "main"], timeout=10.0)
    if fetch_code == 0:
        count_code, count_str = get_git_output(["rev-list", "HEAD..origin/main", "--count"])
        behind_count = 0
        try:
            behind_count = int(count_str.strip()) if count_code == 0 else 0
        except ValueError:
            behind_count = 0

        if behind_count > 0:
            log_code, log_str = get_git_output(["log", "HEAD..origin/main", "--oneline", "-n", "8"])
            commit_msgs = [line.strip() for line in log_str.splitlines() if line.strip()] if log_code == 0 else []
            rem_code, rem_hash = get_git_output(["rev-parse", "--short", "origin/main"])
            return CheckUpdateResponse(
                ok=True,
                has_update=True,
                current_version=cur_ver,
                latest_remote_commit=rem_hash if rem_code == 0 else None,
                commits_behind=behind_count,
                commit_messages=commit_msgs,
                message=f"Đã tìm thấy {behind_count} bản cập nhật mới trên GitHub!",
            )

    return CheckUpdateResponse(
        ok=True,
        has_update=False,
        current_version=cur_ver,
        commits_behind=0,
        commit_messages=[],
        message="Ứng dụng của bạn đang ở phiên bản mới nhất!",
    )


@router.post("/perform-update", response_model=PerformUpdateResponse, summary="Tiến hành cập nhật phần mềm")
async def perform_update_endpoint():
    """Tiến hành cập nhật phần mềm bài bản chuẩn Desktop App (3-Tier Auto-Adaptive Updater)."""
    logs: list[str] = []
    project_root = REPO_ROOT

    patch_download_url = None
    headers = {
        "User-Agent": "VideoTranslate-AI/1.0",
        "Accept": "application/vnd.github.v3+json",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            rel_url = "https://api.github.com/repos/tranvankha1989/TranslateVideo/releases/latest"
            resp = await client.get(rel_url, headers=headers)
            if resp.status_code == 200:
                rel_data = resp.json()
                for a in rel_data.get("assets", []):
                    aname = a.get("name", "").lower()
                    if aname.endswith(".zip") and any(k in aname for k in ("patch", "dist", "bundle", "update")):
                        patch_download_url = a.get("browser_download_url")
                        logs.append(f"🎯 Phát hiện gói cập nhật Pre-built chính thức: {a.get('name')} ({round(a.get('size', 0)/1024/1024, 2)} MB)")
                        break
    except Exception as e:
        logger.warning(f"Không thể tra cứu GitHub Release asset: {e}")

    updated_successfully = False

    if patch_download_url:
        logs.append("📥 [1/4] Đang tải gói cập nhật Pre-built từ GitHub Release...")
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                r = await client.get(patch_download_url)
                if r.status_code != 200:
                    raise Exception(f"Lỗi tải asset HTTP {r.status_code}")
                patch_bytes = r.content

            logs.append(f"📦 Đã tải xong ({len(patch_bytes) // 1024} KB). Đang giải nén và cập nhật giao diện...")
            apply_update_zip(patch_bytes, project_root)
            logs.append("✅ Đã cập nhật thành công giao diện và các tài nguyên mới.")
            updated_successfully = True
        except Exception as pe:
            logs.append(f"⚠️ Thử cập nhật qua Release asset thất bại ({pe}). Chuyển sang phương thức kế tiếp...")

    has_git_repo = (project_root / ".git").exists()
    if not updated_successfully and has_git_repo:
        logs.append("🚀 [1/4] Đang kéo mã nguồn mới nhất qua Git (git pull)...")
        pull_code, pull_out = get_git_output(["pull", "origin", "main"], cwd=project_root, timeout=30.0)
        if pull_code == 0:
            logs.append(pull_out or "✅ Đã kéo mã nguồn mới từ Git thành công.")
            try_build_frontend(logs, project_root)
            updated_successfully = True
        else:
            logs.append(f"⚠️ Git pull không khả dụng ({pull_out}), chuyển sang chế độ tải trực tiếp từ GitHub...")

    if not updated_successfully:
        logs.append("📥 [1/4] Đang tải bản cập nhật trực tiếp từ GitHub...")
        zip_url = "https://github.com/tranvankha1989/TranslateVideo/archive/refs/heads/main.zip"
        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                r = await client.get(zip_url)
                if r.status_code != 200:
                    raise Exception(f"GitHub trả về mã lỗi HTTP {r.status_code}")
                zip_bytes = r.content

            logs.append(f"📦 Đã tải xong ({len(zip_bytes) // 1024} KB). Đang giải nén...")
            apply_update_zip(zip_bytes, project_root)
            try_build_frontend(logs, project_root)
            logs.append("✅ Giải nén và cập nhật mã nguồn thành công.")
            updated_successfully = True
        except Exception as ze:
            logger.error(f"Lỗi khi cập nhật bằng file ZIP: {ze}")
            return PerformUpdateResponse(
                ok=False,
                message="Không thể tải hoặc giải nén bản cập nhật từ GitHub.",
                logs=logs,
                error=str(ze),
            )

    req_file = BASE_DIR / "requirements.txt"
    if req_file.exists():
        logs.append("📦 [2/4] Kiểm tra và đồng bộ thư viện Python phụ thuộc...")
        try:
            pip_cmd = [sys.executable, "-m", "pip", "install", "-r", str(req_file), "--quiet"]
            res = subprocess.run(pip_cmd, cwd=str(BASE_DIR), capture_output=True, text=True, timeout=90.0)
            if res.returncode == 0:
                logs.append("✅ Thư viện Python đã được đồng bộ chuẩn xác.")
            else:
                logs.append(f"⚠️ Cảnh báo pip: {res.stderr[:200]}")
        except Exception as pe:
            logs.append(f"⚠️ Bỏ qua cập nhật pip: {pe}")

    for _b in [BASE_DIR, project_root, BASE_DIR.parent]:
        _env_f = _b / ".env"
        _ex_f = _b / ".env.example"
        if _ex_f.exists():
            _sync_env_file(_env_f, _ex_f)
    load_dotenv(ENV_FILE, override=True)
    logs.append("⚙️ [3/4] Đã tự động đồng bộ và bảo vệ các biến cấu hình trong .env.")

    new_ver = APP_VERSION
    for v_path in POSSIBLE_VERSION_FILES:
        if v_path.exists():
            try:
                with open(v_path, "r", encoding="utf-8") as f:
                    new_ver = json.load(f).get("version", new_ver)
                break
            except Exception:
                pass

    logs.append(f"🎉 [4/4] Nâng cấp hoàn tất thành công! Phiên bản hiện tại: v{new_ver}")
    return PerformUpdateResponse(
        ok=True,
        message=f"Cập nhật thành công lên phiên bản v{new_ver}!",
        new_version=new_ver,
        logs=logs,
    )
