"""
main.py  —  OmniVoice TTS API Server
────────────────────────────────────
Khởi chạy:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Swagger UI:
    http://localhost:8000/docs
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import OUTPUTS_DIR, PRESETS_DIR, APP_VERSION, logger
from app.core.database import connect_db, close_db
from app.routers import api_router
from model_handler import load_model


import asyncio
from app.routers.health import monitor_browser_lifetime


async def _prewarm_whisper():
    """Tải trước mô hình Faster-Whisper vào VRAM/RAM để khi người dùng dịch video không phải chờ 30-40s."""
    try:
        from caption_handler import get_whisper_model
        logger.info("🎙️ [Pre-warm] Đang tải trước Faster-Whisper vào GPU/RAM...")
        await asyncio.to_thread(get_whisper_model)
        logger.info("✅ [Pre-warm] Faster-Whisper đã sẵn sàng phục vụ dịch video tức thì.")
    except Exception as e:
        logger.warning(f"⚠️ [Pre-warm] Không thể tải trước Faster-Whisper: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load mô hình OmniVoice và kết nối cơ sở dữ liệu nếu có cấu hình."""
    logger.info("🚀 Server đang khởi động — nạp mô hình OmniVoice (24kHz) …")
    load_model()
    await connect_db()
    # Khởi động nạp trước Faster-Whisper trong nền (không chặn khởi động server)
    whisper_warm_task = asyncio.create_task(_prewarm_whisper())
    monitor_task = asyncio.create_task(monitor_browser_lifetime())
    yield
    whisper_warm_task.cancel()
    monitor_task.cancel()
    await close_db()
    logger.info("🛑 Server đang tắt.")




app = FastAPI(
    title="OmniVoice TTS API",
    description=(
        "Text-to-Speech đa ngôn ngữ chất lượng cao 24kHz sử dụng OmniVoice (k2-fsa). "
        "Hỗ trợ Cloud Sync MongoDB & Cloudflare R2 với Fallback LocalStorage."
    ),
    version=APP_VERSION,

    lifespan=lifespan,
)

# ─── CORS Middleware ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pathlib import Path
from fastapi.responses import FileResponse
from fastapi import HTTPException

# ─── Static Files ─────────────────────────────────────────────────────────────
app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
app.mount("/presets", StaticFiles(directory=str(PRESETS_DIR)), name="presets")

# ─── Include API Routers ──────────────────────────────────────────────────────
app.include_router(api_router)

# ─── Frontend SPA Static Files (Hỗ trợ truy cập trực tiếp http://localhost:8000) ─
FRONTEND_DIST = (Path(__file__).resolve().parent / ".." / "frontend" / "dist").resolve()
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend_assets")

    @app.get("/", include_in_schema=False)
    async def serve_root():
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if not full_path or full_path == "/":
            index_file = FRONTEND_DIST / "index.html"
            if index_file.is_file():
                return FileResponse(index_file)
        if full_path.startswith(("api/", "outputs/", "presets/", "docs", "openapi.json", "health")):
            raise HTTPException(status_code=404, detail="Not Found")
        target_file = FRONTEND_DIST / full_path
        if target_file.is_file():
            return FileResponse(target_file)
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")

