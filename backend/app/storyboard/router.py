"""게이트 4 — 콘티 엔드포인트. API-Spec 6장."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.storyboard.models import Cut
from app.storyboard.service import create_cuts_from_script, recommend_cut_count, readjust_storyboard
from app.workflow.gate import approve_gate, get_gate_number
from app.composition.service import compose_cut

router = APIRouter(tags=["gate4-storyboard"])


class ApproveRequest(BaseModel):
    auto_advance: bool = False


class StoryboardRequest(BaseModel):
    target_cut_count: int | None = None


@router.get("/projects/{project_id}/episodes/{episode_id}/storyboard/recommend")
async def get_recommendation(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본 분석 → 권장 컷 수 범위 반환."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    script_data = (episode.script or {}).get("script")
    if not script_data:
        raise HTTPException(status_code=400, detail="Script data not found")
    return recommend_cut_count(script_data)


@router.post("/projects/{project_id}/episodes/{episode_id}/storyboard")
async def create_storyboard(
    project_id: int,
    episode_id: int,
    body: StoryboardRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본 → 컷 명세 생성. 게이트 4. target_cut_count로 컷 수 조정 가능."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 4:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, storyboard requires gate 4")

    script_data = (episode.script or {}).get("script")
    if not script_data:
        raise HTTPException(status_code=400, detail="Script data not found")

    target = body.target_cut_count if body else None

    # 목표 컷 수가 있으면 하한·상한 검증
    if target:
        rec = recommend_cut_count(script_data)
        if target < rec["absolute_min"]:
            raise HTTPException(
                status_code=400,
                detail=f"이 대본은 최소 {rec['absolute_min']}컷이 필요합니다. 컷을 더 줄이려면 대본(이야기)을 줄여주세요.",
            )
        if target > rec["recommended_max"]:
            raise HTTPException(
                status_code=400,
                detail=f"최대 {rec['recommended_max']}컷까지 가능합니다.",
            )

    # 기존 컷 삭제 (재생성 시)
    db.query(Cut).filter(Cut.episode_id == episode_id).delete()
    db.flush()

    # 목표 컷 수가 있고, 현재와 다르면 AI 재분할
    if target:
        readjusted = await readjust_storyboard(script_data, target)
        adjusted_script = {"scenes": readjusted.get("scenes", [])}
        cuts = create_cuts_from_script(episode_id, adjusted_script, db)
    else:
        cuts = create_cuts_from_script(episode_id, script_data, db)

    return {"cuts": cuts, "total": len(cuts)}


@router.get("/projects/{project_id}/episodes/{episode_id}/cuts")
async def list_cuts(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode_id)
        .order_by(Cut.cut_number)
        .all()
    )
    return [
        {
            "cut_id": c.cut_id,
            "cut_number": c.cut_number,
            "scene_id": c.scene_id,
            "status": c.status,
            "image_url": c.image_url,
            "composed_image_url": c.composed_image_url,
            "shot": (c.spec or {}).get("shot"),
            "characters": [
                {"character_id": ch.get("character_id"), "emotion": ch.get("emotion"), "pose": ch.get("pose")}
                for ch in (c.spec or {}).get("characters", [])
            ],
            "location_id": (c.spec or {}).get("location_id"),
            "action": (c.spec or {}).get("action"),
            "dialogue": (c.spec or {}).get("dialogue", []),
            "emphasis": (c.spec or {}).get("emphasis"),
        }
        for c in cuts
    ]


@router.put("/cuts/{cut_id}")
async def update_cut(
    cut_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """컷 수정 (앵글·대사·emphasis). 아직 이미지 전이라 무효화 없음."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    spec = dict(cut.spec)
    for key in ["shot", "action", "emphasis", "transition", "prompt_override"]:
        if key in body:
            spec[key] = body[key]
    if "dialogue" in body:
        spec["dialogue"] = body["dialogue"]
    if "characters" in body:
        spec["characters"] = body["characters"]

    cut.spec = spec
    db.commit()
    return {"cut_id": cut_id, "updated": True}


@router.post("/projects/{project_id}/episodes/{episode_id}/storyboard/approve")
async def approve_storyboard(
    project_id: int,
    episode_id: int,
    body: ApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """게이트 4 승인. ⚠️ 과금 시작 지점 — auto_advance여도 강제 정지."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 4:
        raise HTTPException(status_code=400, detail=f"Current gate is {gate}, not gate 4")

    # 비용 사전 고지
    cuts_count = db.query(Cut).filter(Cut.episode_id == episode_id).count()
    estimated_credits = cuts_count * 2  # 컷당 2크레딧 추정

    new_status = approve_gate(episode.gate_status, 4)
    # auto_advance는 저장하되 게이트 4는 이미 명시 호출이므로 문제없음
    if body and body.auto_advance:
        new_status["auto_advance"] = True
    episode.gate_status = new_status
    db.commit()
    db.refresh(episode)

    return {
        "approved": True,
        "current_gate": new_status["current_gate"],
        "estimated_cost": {"cuts": cuts_count, "credits": estimated_credits},
        "gate_status": new_status,
    }


class DialogueUpdateRequest(BaseModel):
    dialogue: list[dict]


@router.put("/cuts/{cut_id}/dialogue")
async def update_cut_dialogue(
    cut_id: str,
    body: DialogueUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대사만 수정 → 재조판 (이미지 재생성 없음, 과금 없음)."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    # spec의 dialogue 갱신
    spec = dict(cut.spec)
    spec["dialogue"] = body.dialogue
    cut.spec = spec

    # 원본 이미지 위에 재조판
    if cut.image_url:
        composed_url = compose_cut(cut.image_url, body.dialogue, cut.episode_id, cut.cut_id, cut_spec=cut.spec)
        cut.composed_image_url = composed_url

    db.commit()
    return {
        "cut_id": cut_id,
        "composed_image_url": cut.composed_image_url,
        "dialogue": body.dialogue,
    }


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
