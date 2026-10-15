"""
app/routers/settings
────────────────────
Modular settings router package:
- hardware: Local & remote GPU settings & testing
- cloud_sync: MongoDB Atlas, Cloudflare R2, env file management, backend reload
- storage: Custom output directories & system dialogs
- updater: Version reporting & 3-tier desktop auto updater
- logs: System diagnostics, log downloads, verbose logging toggle
- ad_filter: Custom subtitle blacklist rules
- feedback: Telegram feedback and error reporting
"""

from fastapi import APIRouter

from app.routers.settings.hardware import (
    router as hardware_router,
    HardwareSettingsResponse,
    UpdateHardwareSettingsRequest,
    TestRemoteGpuRequest,
    TestRemoteGpuResponse,
)
from app.routers.settings.cloud_sync import (
    router as cloud_sync_router,
    CloudSyncSettingsResponse,
    UpdateCloudSyncSettingsRequest,
    TestCloudSyncRequest,
    TestCloudSyncResponse,
)
from app.routers.settings.storage import (
    router as storage_router,
    UpdateOutputDirRequest,
    OpenOutputDirRequest,
)
from app.routers.settings.updater import (
    router as updater_router,
    AppVersionResponse,
    CheckUpdateResponse,
    PerformUpdateResponse,
)
from app.routers.settings.logs import (
    router as logs_router,
    VerboseLoggingRequest,
)
from app.routers.settings.ad_filter import (
    router as ad_filter_router,
    AdFilterRulesRequest,
    AddAdFilterRuleRequest,
    DeleteAdFilterRuleRequest,
)
from app.routers.settings.feedback import (
    router as feedback_router,
)
from app.routers.settings.env_helper import (
    ENV_FILE,
    update_env_file,
)

router = APIRouter(prefix="/api/settings", tags=["Settings"])

# Include all sub-routers
router.include_router(hardware_router)
router.include_router(cloud_sync_router)
router.include_router(storage_router)
router.include_router(updater_router)
router.include_router(logs_router)
router.include_router(ad_filter_router)
router.include_router(feedback_router)

__all__ = [
    "router",
    "ENV_FILE",
    "update_env_file",
    "HardwareSettingsResponse",
    "UpdateHardwareSettingsRequest",
    "TestRemoteGpuRequest",
    "TestRemoteGpuResponse",
    "CloudSyncSettingsResponse",
    "UpdateCloudSyncSettingsRequest",
    "TestCloudSyncRequest",
    "TestCloudSyncResponse",
    "UpdateOutputDirRequest",
    "OpenOutputDirRequest",
    "AppVersionResponse",
    "CheckUpdateResponse",
    "PerformUpdateResponse",
    "VerboseLoggingRequest",
    "AdFilterRulesRequest",
    "AddAdFilterRuleRequest",
    "DeleteAdFilterRuleRequest",
]
