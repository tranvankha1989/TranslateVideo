"""
app/routers/translate.py
────────────────────────
API Router cho các chức năng dịch thuật:
- Lấy danh sách ngôn ngữ hỗ trợ
- Dịch văn bản đơn lẻ
- Dịch danh sách các đoạn phụ đề (subtitle segments)
"""

from fastapi import APIRouter, HTTPException
from app.core.config import logger
from app.schemas.translate import (
    TranslateTextRequest,
    TranslateTextResponse,
    TranslateSegmentsRequest,
    TranslateSegmentsResponse,
)
from app.services.translator_service import TranslationService, get_supported_languages

router = APIRouter(prefix="/api/translate", tags=["Translation"])


@router.get("/languages")
async def get_languages():
    """Trả về danh sách các ngôn ngữ được hỗ trợ dịch thuật và lồng tiếng."""
    return {"languages": get_supported_languages()}


@router.post("/text", response_model=TranslateTextResponse)
async def translate_text_endpoint(req: TranslateTextRequest):
    """Dịch một đoạn văn bản từ ngôn ngữ nguồn sang ngôn ngữ đích."""
    try:
        translated = await TranslationService.translate_text(
            text=req.text,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            provider=req.provider,
            api_key=req.api_key,
            base_url=req.base_url,
            model=req.model,
        )
        return TranslateTextResponse(
            original_text=req.text,
            translated_text=translated,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            provider=req.provider,
        )
    except Exception as e:
        logger.error(f"[Translate Text API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi dịch văn bản: {str(e)}") from e


@router.post("/segments", response_model=TranslateSegmentsResponse)
async def translate_segments_endpoint(req: TranslateSegmentsRequest):
    """Dịch toàn bộ danh sách các đoạn phụ đề video, giữ nguyên mốc thời gian start / end."""
    try:
        translated_segments = await TranslationService.translate_segments(
            segments=req.segments,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            provider=req.provider,
            api_key=req.api_key,
            base_url=req.base_url,
            model=req.model,
        )
        return TranslateSegmentsResponse(
            segments=translated_segments,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            provider=req.provider,
            total_segments=len(translated_segments),
        )
    except Exception as e:
        logger.error(f"[Translate Segments API] Lỗi: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi dịch phụ đề: {str(e)}") from e
