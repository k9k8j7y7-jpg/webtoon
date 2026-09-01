"""Series Pydantic schemas — P4."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── 요청 ──


class StoryOptions(BaseModel):
    genre: str | None = None
    mood: str | None = None


class SeriesCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    idea: str = Field(..., min_length=1)
    story_options: StoryOptions | None = None
    target_episodes: int = Field(default=8, ge=4, le=24)


class BibleGenerateRequest(BaseModel):
    target_episodes: int = Field(default=8, ge=4, le=24)


class OutlineRegenerateRequest(BaseModel):
    from_no: int = Field(..., ge=1)


class OutlineMergeRequest(BaseModel):
    no_a: int = Field(..., ge=1)
    no_b: int = Field(..., ge=1)


class OutlineSplitRequest(BaseModel):
    no: int = Field(..., ge=1)


class NarratorUpdate(BaseModel):
    ref_key: str
    name: str
    perspective: str = Field(..., pattern=r"^(first_person|third_person)$")


class BibleCharacterUpdate(BaseModel):
    ref_key: str
    name: str
    role: str | None = None
    description: str | None = None


class BibleUpdateRequest(BaseModel):
    synopsis: str | None = None
    world: str | None = None
    narrator: NarratorUpdate | None = None
    characters: list[BibleCharacterUpdate] | None = None


class OutlineReviseRequest(BaseModel):
    title: str | None = None
    summary: str | None = None
    hook: str | None = None


# ── 응답 ──


class SeriesResponse(BaseModel):
    id: int
    project_id: int
    title: str
    bible: dict | None = None
    outline: list | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SeriesListItem(BaseModel):
    id: int
    title: str
    outline_count: int = 0
    episode_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
