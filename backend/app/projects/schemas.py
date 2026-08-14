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
    idea: str
    mood: str | None = None


class EpisodeResponse(BaseModel):
    id: int
    episode_no: int
    title: str | None
    gate_status: dict
    created_at: datetime

    model_config = {"from_attributes": True}
