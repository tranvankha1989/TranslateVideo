from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.services.license_service import (
    get_feature_status,
    activate_feature_key,
    get_machine_id,
    GLOBAL_APP_FEATURE_ID,
)

router = APIRouter(prefix="/api/license", tags=["License"])


class LicenseStatusResponse(BaseModel):
    unlocked: bool
    tier: str
    feature_id: str
    machine_id: str
    days_left: Optional[int] = None
    trial_used: Optional[bool] = False
    message: str


class ActivateLicenseRequest(BaseModel):
    key: str
    feature_id: Optional[str] = GLOBAL_APP_FEATURE_ID


class ActivateLicenseResponse(BaseModel):
    ok: bool
    tier: Optional[str] = None
    days_left: Optional[int] = None
    message: str


@router.get("/status", response_model=LicenseStatusResponse, summary="Kiểm tra trạng thái bản quyền (toàn app hoặc tính năng)")
async def get_license_status(feature_id: str = GLOBAL_APP_FEATURE_ID):
    res = get_feature_status(feature_id)
    return LicenseStatusResponse(**res)


@router.post("/activate", response_model=ActivateLicenseResponse, summary="Kích hoạt bản quyền bằng mã")
async def activate_license(req: ActivateLicenseRequest):
    res = activate_feature_key(req.key, req.feature_id or GLOBAL_APP_FEATURE_ID)
    return ActivateLicenseResponse(**res)
