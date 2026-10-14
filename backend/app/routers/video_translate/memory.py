"""
app/routers/video_translate/memory.py
─────────────────────────────────────
Router quản lý bộ nhớ dịch thuật (Translation Memory).
"""

from fastapi import APIRouter, HTTPException
from app.services.translation_memory_service import TranslationMemoryService

router = APIRouter()


@router.get("/memory")
async def get_translation_memory(source_lang: str | None = None, target_lang: str | None = None, limit: int = 150):
    """Lấy danh sách các câu thoại và thuật ngữ AI đã học từ người dùng."""
    items = TranslationMemoryService.get_all_memories(source_lang=source_lang, target_lang=target_lang, limit=limit)
    return {
        "status": "ok",
        "total": len(items),
        "items": items,
    }


@router.delete("/memory/{memory_id}")
async def delete_translation_memory_item(memory_id: str):
    """Xóa một câu kinh nghiệm khỏi bộ nhớ của AI."""
    ok = TranslationMemoryService.delete_memory(memory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục kinh nghiệm cần xóa.")
    return {"status": "ok", "message": "Đã xóa mục kinh nghiệm thành công."}


@router.delete("/memory")
async def clear_all_translation_memory():
    """Xóa toàn bộ bộ nhớ tự học của AI (Reset)."""
    TranslationMemoryService.clear_all_memories()
    return {"status": "ok", "message": "Đã làm trống toàn bộ bộ nhớ tự học của AI."}


@router.post("/memory/manual")
async def add_manual_translation_memory(req: dict):
    """Người dùng tự thêm thủ công 1 quy tắc dịch hoặc thuật ngữ mẫu."""
    src = req.get("source_text", "").strip()
    corrected = req.get("user_corrected", "").strip()
    ai_orig = req.get("ai_translated", "").strip()
    if not src or not corrected:
        raise HTTPException(status_code=400, detail="Vui lòng nhập câu gốc và bản dịch chuẩn.")
    item = TranslationMemoryService.add_or_update_memory(
        source_text=src,
        user_corrected=corrected,
        ai_translated=ai_orig,
        source_lang=req.get("source_lang", "zh"),
        target_lang=req.get("target_lang", "vi"),
    )
    return {"status": "ok", "message": "Đã thêm quy tắc dịch vào bộ nhớ của AI.", "item": item}
