"""
app/routers/settings/ad_filter.py
─────────────────────────────────
Router quản lý danh sách quy tắc lọc quảng cáo và dạy AI bỏ qua từ/câu tùy chỉnh.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ad_filter_service import AdFilterService

router = APIRouter()


class AdFilterRulesRequest(BaseModel):
    rules: list[str]


class AddAdFilterRuleRequest(BaseModel):
    phrase: str


class DeleteAdFilterRuleRequest(BaseModel):
    phrase: str


@router.get("/ad-filter-rules", summary="Lấy danh sách các từ/câu dạy cho AI bỏ qua")
async def get_ad_filter_rules():
    return {
        "status": "ok",
        "rules": AdFilterService.get_custom_rules(),
    }


@router.post("/ad-filter-rules", summary="Lưu toàn bộ danh sách quy tắc lọc quảng cáo tùy chỉnh")
async def save_ad_filter_rules(req: AdFilterRulesRequest):
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
