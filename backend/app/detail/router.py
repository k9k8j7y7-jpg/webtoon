"""상세페이지(detail_page) 엔드포인트 — 기획안(섹션 대본) 생성·편집·승인, 섹션 단건 수정.

- POST /projects/{pid}/episodes/{eid}/detail/plan          : 기획안 생성 (0패킷). gate 1이면 → gate 2
- GET  /projects/{pid}/episodes/{eid}/detail/sections      : 섹션 목록 + 브리프 입력값
- PUT  /projects/{pid}/episodes/{eid}/detail/sections      : 섹션 저장 (편집·순서·추가·삭제)
- POST /projects/{pid}/episodes/{eid}/detail/sections/approve : 섹션 승인 (gate 2 → 3)
- PUT  /cuts/{cut_id}/detail-section                        : 완성 단계 섹션 수정 (제목·본문·캐릭터 칩, 0패킷)
Gate3 승인(POST assets/approve)에서 섹션 → 컷 생성 + gate 4 자동 승인 (workflow/router.py detail_page 분기).
"""

import copy
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.projects.models import Episode, Project
from app.storyboard.models import Cut
from app.users.models import User
from app.workflow.gate import approve_gate, get_gate_number, get_purpose

logger = logging.getLogger(__name__)
router = APIRouter(tags=["detail-page"])

MAX_SECTIONS = 12


class PlanRequest(BaseModel):
    product_name: str = ""
    features: str = ""
    usage: str = ""
    web_info: str = ""
    target: str = ""
    tone: str = "hook"  # hook | info | premium
    extra: str = ""


class SectionIn(BaseModel):
    key: str = ""
    title: str = ""
    body: str = ""
    character: bool | None = None
    visual_hint: str = ""


class SectionsRequest(BaseModel):
    sections: list[SectionIn] = Field(default_factory=list)


class SectionPatch(BaseModel):
    title: str | None = None
    body: str | None = None
    character: bool | None = None


def _get_detail_episode(db: Session, project_id: int, episode_id: int, user_id: int) -> Episode:
    project = db.query(Project).filter(
        Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    ep = db.query(Episode).filter(
        Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)
    ).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")
    if get_purpose(ep.gate_status or {}) != "detail_page":
        raise HTTPException(status_code=400, detail="상세페이지 작품이 아니에요")
    return ep


def _brief_source(brief: dict) -> str:
    return "\n".join(str(brief.get(k) or "") for k in ("product_name", "features", "usage", "web_info", "target"))


def _save_sections(ep: Episode, sections: list[dict], tone: str | None = None) -> None:
    script = copy.deepcopy(ep.script) if ep.script else {}
    script["detail_sections"] = sections
    if tone:
        script["detail_tone"] = tone
    ep.script = script
    gs = copy.deepcopy(ep.gate_status)
    gs["target_cuts"] = len(sections)
    ep.gate_status = gs


@router.post("/projects/{project_id}/episodes/{episode_id}/detail/plan")
async def create_detail_plan(
    project_id: int,
    episode_id: int,
    body: PlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """상세페이지 기획안(섹션 8개) 생성 — 0패킷. 브리프 입력값은 idea_brief.detail_brief에 저장."""
    ep = _get_detail_episode(db, project_id, episode_id, current_user.id)
    gate = get_gate_number(ep.gate_status)
    if gate not in (1, 2):
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, plan requires gate 1~2")

    gs = copy.deepcopy(ep.gate_status)
    ib = dict(gs.get("idea_brief") or {})
    prev = dict(ib.get("detail_brief") or {})
    brief = {k: (getattr(body, k) or prev.get(k, "")) for k in ("product_name", "features", "usage", "web_info", "target", "extra")}
    brief["tone"] = body.tone or prev.get("tone", "hook")

    # 제품명 비어 있으면 등록 제품에서
    if not brief["product_name"]:
        from app.products.models import Product
        p = db.query(Product).filter(Product.episode_id == ep.id).order_by(Product.id).first()
        if p:
            brief["product_name"] = p.name_ko or p.name or ""
    if not brief["product_name"]:
        raise HTTPException(status_code=400, detail="제품명을 먼저 적어 주세요")

    from app.prompts.detail_brief import generate_detail_plan
    try:
        result = await generate_detail_plan(
            product_name=brief["product_name"], features=brief["features"], usage=brief["usage"],
            web_info=brief["web_info"], target=brief["target"], tone=brief["tone"], extra=brief["extra"],
        )
    except Exception as e:
        logger.error("detail plan failed: ep=%d %s", ep.id, e, exc_info=True)
        raise HTTPException(status_code=502, detail="기획안을 만들지 못했어요 — 잠시 후 다시 눌러 주세요")
    sections = result.get("sections", [])[:MAX_SECTIONS]
    if not sections:
        raise HTTPException(status_code=502, detail="기획안을 만들지 못했어요 — 잠시 후 다시 눌러 주세요")

    ib["detail_brief"] = brief
    gs["idea_brief"] = ib
    if gate == 1:
        gs = approve_gate(gs, 1)
    ep.gate_status = gs
    _save_sections(ep, sections, result.get("tone"))
    db.commit()
    logger.info("detail plan saved: ep=%d sections=%d gate=%s", ep.id, len(sections), ep.gate_status.get("current_gate"))
    return {"sections": sections, "tone": result.get("tone"), "current_gate": ep.gate_status.get("current_gate")}


@router.get("/projects/{project_id}/episodes/{episode_id}/detail/sections")
async def get_detail_sections(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ep = _get_detail_episode(db, project_id, episode_id, current_user.id)
    script = ep.script or {}
    ib = (ep.gate_status or {}).get("idea_brief") or {}
    return {
        "sections": script.get("detail_sections", []),
        "tone": script.get("detail_tone"),
        "brief": ib.get("detail_brief", {}),
        "current_gate": get_gate_number(ep.gate_status),
    }


@router.put("/projects/{project_id}/episodes/{episode_id}/detail/sections")
async def update_detail_sections(
    project_id: int,
    episode_id: int,
    body: SectionsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """섹션 저장 — 편집·순서·추가·삭제 (gate 2에서만)."""
    ep = _get_detail_episode(db, project_id, episode_id, current_user.id)
    gate = get_gate_number(ep.gate_status)
    if gate != 2:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, 섹션 편집은 섹션 단계에서만")
    if not body.sections:
        raise HTTPException(status_code=400, detail="섹션이 하나 이상 있어야 해요")
    if len(body.sections) > MAX_SECTIONS:
        raise HTTPException(status_code=400, detail=f"섹션은 최대 {MAX_SECTIONS}개예요")

    from app.prompts.detail_brief import normalize_sections
    brief = ((ep.gate_status or {}).get("idea_brief") or {}).get("detail_brief", {})
    sections = normalize_sections([s.model_dump() for s in body.sections], source_text=_brief_source(brief))
    if not sections:
        raise HTTPException(status_code=400, detail="제목이나 본문이 있는 섹션이 필요해요")
    _save_sections(ep, sections)
    db.commit()
    return {"sections": sections}


@router.post("/projects/{project_id}/episodes/{episode_id}/detail/sections/approve")
async def approve_detail_sections(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """섹션 승인 → 준비(gate 3)."""
    ep = _get_detail_episode(db, project_id, episode_id, current_user.id)
    gate = get_gate_number(ep.gate_status)
    if gate != 2:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, not gate 2")
    sections = (ep.script or {}).get("detail_sections") or []
    if not sections:
        raise HTTPException(status_code=400, detail="기획안을 먼저 만들어 주세요")
    gs = approve_gate(ep.gate_status, 2)
    ep.gate_status = gs
    db.commit()
    needs_character = any(s.get("character") for s in sections)
    return {"approved": True, "current_gate": gs["current_gate"], "needs_character": needs_character,
            "gate_status": gs}


@router.put("/cuts/{cut_id}/detail-section")
async def patch_detail_section(
    cut_id: str,
    body: SectionPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """완성 단계 섹션 수정 (제목·본문·캐릭터 칩) — 0패킷. 다시 그리기는 POST /cuts/{id}/regenerate."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")
    ep = db.query(Episode).filter(Episode.id == cut.episode_id, Episode.deleted_at.is_(None)).first()
    if not ep:
        raise HTTPException(status_code=404, detail="Episode not found")
    _get_detail_episode(db, ep.project_id, ep.id, current_user.id)  # 소유·용도 확인
    spec = copy.deepcopy(cut.spec or {})
    if spec.get("kind") != "detail_section":
        raise HTTPException(status_code=400, detail="상세페이지 섹션이 아니에요")
    sec = dict(spec.get("section") or {})
    if body.title is not None:
        sec["title"] = body.title.strip()[:40]
    if body.body is not None:
        sec["body"] = body.body.strip()
    if body.character is not None:
        sec["character"] = body.character
    spec["section"] = sec
    cut.spec = spec

    # 대본 쪽 섹션도 동기화 (key 기준)
    script = copy.deepcopy(ep.script) if ep.script else {}
    secs = script.get("detail_sections") or []
    for i, s in enumerate(secs):
        if s.get("key") == sec.get("key"):
            secs[i] = {**s, **{k: sec[k] for k in ("title", "body", "character") if k in sec}}
    script["detail_sections"] = secs
    ep.script = script
    db.commit()
    return {"cut_id": cut_id, "section": sec}
