from pydantic import BaseModel
from typing import Optional, Dict, Any

class ModelStatusResponse(BaseModel):
    state: str  # "idle" | "downloading" | "loading" | "ready" | "error"
    is_cached: bool
    is_loaded: bool
    downloaded_bytes: int
    total_bytes: int
    percent: float
    speed_mbps: float
    eta_seconds: int
    error_message: Optional[str] = None
    current_file: str = ""

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str = "2.8.3"
    model_status: Optional[Dict[str, Any]] = None

class EngineItem(BaseModel):
    id: str
    name: str
    description: str
    is_default: bool

class EngineResponse(BaseModel):
    engines: list[EngineItem]
