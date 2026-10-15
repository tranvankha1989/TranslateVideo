"""
app/routers/video_translate
───────────────────────────
Modular package for Video Translation API routes:
- tasks: start pipeline, check status, list tasks, cache cleanup, warmup, gemini verification.
- manual: manual transcribe, upload translated SRT, resume pipeline, subtitles content CRUD, redub.
- media: stream video/audio, download assets, open editor/folder, social share info.
- studio: studio segments CRUD, single-segment redub, quick remux.
- memory: translation memory query, delete, and manual rule creation.
"""

from fastapi import APIRouter

from app.schemas.video_translate import (
    TranslationTaskStatus,
    RedubTaskRequest,
    SaveSubtitlesRequest,
    VerifyKeyRequest,
    StudioRedubSegmentRequest,
    StudioUpdateSegmentRequest,
    StudioAddSegmentRequest,
    StudioRemuxRequest,
)

from app.routers.video_translate.tasks import router as tasks_router
from app.routers.video_translate.manual import router as manual_router
from app.routers.video_translate.media import router as media_router
from app.routers.video_translate.studio import router as studio_router
from app.routers.video_translate.memory import router as memory_router

router = APIRouter(prefix="/api/video-translate", tags=["Video Translation"])

router.include_router(tasks_router)
router.include_router(manual_router)
router.include_router(media_router)
router.include_router(studio_router)
router.include_router(memory_router)

__all__ = [
    "router",
    "TranslationTaskStatus",
    "RedubTaskRequest",
    "SaveSubtitlesRequest",
    "VerifyKeyRequest",
    "StudioRedubSegmentRequest",
    "StudioUpdateSegmentRequest",
    "StudioAddSegmentRequest",
    "StudioRemuxRequest",
]
