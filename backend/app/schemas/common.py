from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str = "2.8.3"

class EngineItem(BaseModel):
    id: str
    name: str
    description: str
    is_default: bool

class EngineResponse(BaseModel):
    engines: list[EngineItem]
