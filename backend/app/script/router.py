"""게이트 2 — 대본 엔드포인트. API-Spec 4장."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode, Series
from app.script.service import generate_script, extract_character_names, extract_location_names
from app.workflow.gate import approve_gate, get_gate_number, is_ad_episode, get_purpose
from app.workflow.service import compute_invalidation_scope, invalidate_from_gate

router = APIRouter(tags=["gate2-script"])


def _merge_dialogue_only(old_script: dict, new_script: dict) -> dict:
    """광고 대본 대사만 편집: dialogue만 new에서 가져오고 나머지(action·shot·characters)는 old 유지."""
    import copy
    merged = copy.deepcopy(old_script)
    new_scenes = new_script.get("scenes", [])
    for si, scene in enumerate(merged.get("scenes", [])):
        new_scene = new_scenes[si] if si < len(new_scenes) else {}
        for ci, cut in enumerate(scene.get("cuts", [])):
            new_cuts = new_scene.get("cuts", [])
            if ci < len(new_cuts):
                cut["dialogue"] = new_cuts[ci].get("dialogue", cut.get("dialogue", []))
    return merged


class ApproveRequest(BaseModel):
    auto_advance: bool = False


@router.get("/projects/{project_id}/episodes/{episode_id}/script")
async def get_script(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    script = (episode.script or {}).get("script")
    if not script:
        return None
    return script


class ScriptCreateBody(BaseModel):
    tone: str | None = None  # shorter | impact | emotional | humor | trust


@router.post("/projects/{project_id}/episodes/{episode_id}/script")
async def create_script(
    project_id: int,
    episode_id: int,
    body: ScriptCreateBody | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, script requires gate 2",
        )

    # 기획 데이터 가져오기
    planning = (episode.script or {}).get("planning")
    if not planning:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Planning data not found. Complete gate 1 first.",
        )

    # 연작이면 시리즈 컨텍스트 조립
    series_context = None
    if episode.series_id:
        series = db.query(Series).filter(Series.id == episode.series_id).first()
        if series and series.outline:
            bible = series.bible or {}
            outline = series.outline or []
            ep_no = episode.episode_no or 1
            current_item = next((x for x in outline if x.get("episode_id") == episode.id), None)
            if not current_item:
                current_item = next((x for x in outline if x.get("no") == ep_no), {})
            prev_item = next((x for x in outline if x.get("no") == ep_no - 1), None) if ep_no > 1 else None
            from app.series.router import _resolve_narrator
            narrator, _ = _resolve_narrator(bible)
            series_context = {
                "synopsis": bible.get("synopsis", ""),
                "world": bible.get("world"),
                "characters": bible.get("characters", []),
                "narrator": narrator,
                "episode_no": ep_no,
                "total_episodes": len(outline),
                "current_summary": current_item.get("summary", "") if current_item else "",
                "current_hook": current_item.get("hook", "") if current_item else "",
                "prev_summary": prev_item.get("summary") if prev_item else None,
                "prev_hook": prev_item.get("hook") if prev_item else None,
            }

    ad_flag = is_ad_episode(episode.gate_status)

    # 제품이 등록되어 있으면 이름 전달 (비광고 에피소드에서 소품 한 줄)
    from app.products.models import Product
    first_product = db.query(Product).filter(Product.episode_id == episode.id).first()
    _product_name = first_product.name if first_product else None

    from app.workflow.gate import get_purpose
    _purpose = get_purpose(episode.gate_status)

    # 광고 3종: idea_brief(카피·장면·브리프)를 planning에 합쳐 전달
    _gs = episode.gate_status or {}
    if _purpose in ("onecut_ad", "instatoon_ad", "brand_series"):
        planning["idea_brief"] = _gs.get("idea_brief", {})

    # 인스타툰 target_cuts (4/6/8)
    _target_cuts = _gs.get("target_cuts") if _purpose == "instatoon_ad" else None

    # 제품 정보 (idea_brief에서 추출)
    _ib = _gs.get("idea_brief", {})
    _product_info = _ib.get("product_info", "")
    _product_info_web = _ib.get("product_info_web", "")
    _full_product_info = "\n".join(filter(None, [_product_info, _product_info_web])) or None

    _tone = body.tone if body else None

    result = await generate_script(
        planning, series_context=series_context,
        is_ad=ad_flag, product_name=_product_name,
        purpose=_purpose,
        target_cuts=_target_cuts,
        product_info=_full_product_info,
        tone=_tone,
    )

    # 대본 저장
    script_data = dict(episode.script) if episode.script else {}
    script_data["script"] = result
    episode.script = script_data
    db.commit()
    db.refresh(episode)

    return result


@router.put("/projects/{project_id}/episodes/{episode_id}/script")
async def update_script(
    project_id: int,
    episode_id: int,
    body: dict,
    dry_run: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대본 수정. dry_run=true면 무효화 영향만 미리보기."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    old_script = (episode.script or {}).get("script", {})
    new_script = body.get("script", old_script)

    # 광고 purpose: dialogue만 갱신 (action·shot·characters는 보존)
    _purpose = get_purpose(episode.gate_status)
    if _purpose in ("instatoon_ad", "brand_series") and body.get("dialogue_only"):
        # 컷 단위 dialogue만 교체, 나머지는 원본 유지
        new_script = _merge_dialogue_only(old_script, new_script)

    # diff 판정 (Backend-State-Model 3.2)
    old_chars = extract_character_names(old_script)
    new_chars = extract_character_names(new_script)
    old_locs = extract_location_names(old_script)
    new_locs = extract_location_names(new_script)

    invalidation = {
        "characters": list((old_chars - new_chars) | (new_chars - old_chars)),
        "locations": list((old_locs - new_locs) | (new_locs - old_locs)),
        "cuts_affected": old_chars != new_chars or old_locs != new_locs,
    }

    if dry_run:
        message_parts = []
        if invalidation["characters"]:
            message_parts.append(f"캐릭터 {invalidation['characters']}가 변경됩니다")
        if invalidation["locations"]:
            message_parts.append(f"장소 {invalidation['locations']}가 변경됩니다")
        if not message_parts:
            message_parts.append("캐릭터/장소 변경 없음. 콘티·이미지만 재확정 필요.")

        return {
            "invalidation_preview": {
                "characters": invalidation["characters"],
                "locations": invalidation["locations"],
                "cuts_affected": invalidation["cuts_affected"],
                "message": " / ".join(message_parts),
            }
        }

    # 무효화 범위 판정 (State-Model 3.2)
    scope = compute_invalidation_scope(old_script, new_script)

    # 실제 수정 적용
    script_data = dict(episode.script) if episode.script else {}
    script_data["script"] = new_script
    episode.script = script_data

    # 무효화 전파 실행 (게이트 2에서 수정)
    invalidation_result = invalidate_from_gate(episode, from_gate=2, scope=scope, db=db)

    db.commit()
    db.refresh(episode)

    return {
        "script": new_script,
        "invalidation": invalidation_result,
        "gate_status": episode.gate_status,
    }


@router.post("/projects/{project_id}/episodes/{episode_id}/script/approve")
async def approve_script(
    project_id: int,
    episode_id: int,
    body: ApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, not gate 2",
        )

    new_status = approve_gate(episode.gate_status, 2)
    if body and body.auto_advance:
        new_status["auto_advance"] = True
    episode.gate_status = new_status
    db.commit()
    db.refresh(episode)

    return {
        "approved": True,
        "current_gate": new_status["current_gate"],
        "gate_status": new_status,
    }


# ── 게이트 상태 조회 (API-Spec 9장) ──

@router.get("/projects/{project_id}/episodes/{episode_id}/status")
async def get_episode_status(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    result = dict(episode.gate_status)
    result["series_id"] = episode.series_id
    # 실사 캐릭터 포함 여부 (프론트 안내 표시용)
    from app.characters.models import Character, EpisodeCharacter
    has_pr = db.query(Character).join(
        EpisodeCharacter, EpisodeCharacter.character_id == Character.id
    ).filter(
        EpisodeCharacter.episode_id == episode_id,
        Character.is_photo_real == True,
    ).first() is not None
    result["has_photo_real_char"] = has_pr
    return result


def _get_episode_for_user(db: Session, project_id: int, episode_id: int, user_id: int) -> Episode:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    episode = (
        db.query(Episode)
        .filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .first()
    )
    if not episode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")

    return episode
