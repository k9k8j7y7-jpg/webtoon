from pydantic import BaseModel
from datetime import datetime


# --- Project ---

class ProjectCreate(BaseModel):
    title: str
    genre: str | None = None
    language: str = "ko"
    visibility: str = "private"


class ProjectUpdate(BaseModel):
    title: str | None = None
    genre: str | None = None
    language: str | None = None
    visibility: str | None = None


class ProjectResponse(BaseModel):
    id: int
    title: str
    genre: str | None
    language: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Episode ---

class EpisodeCreate(BaseModel):
    episode_no: int
    title: str | None = None
    idea: str = ""
    mood: str | None = None
    is_ad: bool = False
    product_name: str = ""
    product_features: str = ""


class EpisodeResponse(BaseModel):
    id: int
    episode_no: int
    title: str | None
    gate_status: dict
    series_id: int | None = None
    created_at: datetime
    # 작가 공개 상태 (step30) — 게이트5 [공개하기] 버튼용
    is_public: bool = False
    published_at: datetime | None = None
    share_token: str | None = None

    model_config = {"from_attributes": True}
