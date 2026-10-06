from fastapi import APIRouter

from .health import router as health_router
from .voices import router as voices_router
from .tts import router as tts_router
from .caption import router as caption_router
from .bgm import router as bgm_router
from .sync import router as sync_router
from .settings import router as settings_router
from .translate import router as translate_router
from .dubbing import router as dubbing_router
from .alignment import router as alignment_router
from .video_translate import router as video_translate_router
from .license import router as license_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(voices_router)
api_router.include_router(tts_router)
api_router.include_router(caption_router)
api_router.include_router(bgm_router)
api_router.include_router(sync_router)
api_router.include_router(settings_router)
api_router.include_router(translate_router)
api_router.include_router(dubbing_router)
api_router.include_router(alignment_router)
api_router.include_router(video_translate_router)
api_router.include_router(license_router)

__all__ = ["api_router"]



