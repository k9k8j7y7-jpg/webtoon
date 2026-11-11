"""내 작품 단일 목록 API — 한 컷·인스타툰·연재툰을 한 화면에.

- POST /my/works   : 한 컷/인스타툰/연재툰 만들기 (기본 프로젝트 find-or-create)
- GET  /my/works   : 단일 목록 (광고 ep + 시리즈 프로젝트 1행, updated_at desc)
- GET  /my/works/series/{project_id} : 시리즈 화 목록
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.projects.models import Episode, Project, ProjectMemory
from app.social.service import first_cut_image
from app.users.models import User
from app.workflow.gate import (
    create_initial_gate_status,
    get_gate_number,
    get_purpose,
    get_step_info,
    is_ad_purpose,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/my/works", tags=["myworks"])


# ── 헬퍼 ─────────────────────────────────────────────────────

def _find_or_create_default_project(db: Session, user: User) -> Project:
    """사용자당 1개인 숨은 기본 프로젝트(kind=ad, is_default=1)를 찾거나 만든다."""
    proj = (
        db.query(Project)
        .filter(
            Project.user_id == user.id,
            Project.is_default == True,
            Project.deleted_at.is_(None),
        )
        .first()
    )
    if proj:
        return proj

    proj = Project(
        user_id=user.id,
        title="내 광고",
        kind="ad",
        is_default=True,
    )
    db.add(proj)
    db.flush()
    mem = ProjectMemory(project_id=proj.id, rules={})
    db.add(mem)
    db.flush()
    logger.info("default project created: user=%d project=%d", user.id, proj.id)
    return proj


def _auto_title(purpose: str) -> str:
    """에피소드 자동 제목. 사장님이 안 지으면 이걸로."""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%m/%d")
    if purpose == "onecut_ad":
        return f"한 컷 광고 {date_str}"
    if purpose == "instatoon_ad":
        return f"인스타툰 {date_str}"
    return f"광고 {date_str}"


# 완료 판별
def _is_completed(gs: dict) -> bool:
    gates = gs.get("gates", {})
    return gates.get("5_review", {}).get("status") == "approved"


# 완성 단계(마지막 STEP 진입 또는 컷 이미지 있음) & 미완료
def _in_final_step(gs: dict, thumb: str | None) -> bool:
    if _is_completed(gs):
        return False
    return thumb is not None or get_gate_number(gs) == 5


# 에피소드 → 목록 카드 dict
def _episode_card(ep: Episode, db: Session) -> dict:
    gs = ep.gate_status or {}
    purpose = get_purpose(gs)
    step = get_step_info(gs)
    completed = _is_completed(gs)
    thumb = first_cut_image(db, ep.id)
    return {
        "kind": "episode",
        "id": ep.id,
        "project_id": ep.project_id,
        "title": ep.title or "",
        "purpose": purpose,
        "status": "완성" if completed else step.get("name", ""),
        "step": step,
        "completed": completed,
        "thumbnail_url": thumb,
        "updated_at": ep.updated_at.isoformat() if ep.updated_at else None,
    }


# 시리즈 프로젝트 → 목록 카드 dict
def _series_card(proj: Project, db: Session) -> dict:
    eps = (
        db.query(Episode)
        .filter(Episode.project_id == proj.id, Episode.deleted_at.is_(None))
        .order_by(Episode.episode_no)
        .all()
    )
    completed_count = sum(1 for e in eps if _is_completed(e.gate_status or {}))
    thumbs = {e.id: first_cut_image(db, e.id) for e in eps}
    # 완성 단계(마지막 STEP·미완료) 화 수
    in_progress_count = sum(1 for e in eps if _in_final_step(e.gate_status or {}, thumbs[e.id]))
    # 가장 최근 미완료 화 상태
    in_progress = None
    for e in reversed(eps):
        if not _is_completed(e.gate_status or {}):
            in_progress = e
            break

    ip_step = get_step_info(in_progress.gate_status or {}) if in_progress else None
    ip_label = ""
    if in_progress:
        ip_no = in_progress.episode_no
        if _in_final_step(in_progress.gate_status or {}, thumbs[in_progress.id]):
            ip_label = f"{ip_no}화 완성 단계"
        else:
            ip_name = ip_step.get("name", "") if ip_step else ""
            ip_label = f"{ip_no}화 {ip_name} 중"

    # 최근 화 썸네일
    thumb = next((thumbs[e.id] for e in reversed(eps) if thumbs[e.id]), None)

    return {
        "kind": "series",
        "id": proj.id,
        "project_id": proj.id,
        "title": proj.title,
        "purpose": "brand_series",
        "episode_count": len(eps),
        "completed_count": completed_count,
        "in_progress_count": in_progress_count,
        "completed": bool(eps) and completed_count == len(eps),
        "in_progress_label": ip_label,
        "status": f"{completed_count}화 완료" if completed_count else (ip_label or "시작 전"),
        "thumbnail_url": thumb,
        "updated_at": proj.updated_at.isoformat() if proj.updated_at else None,
    }


# ── 만들기 ────────────────────────────────────────────────────

@router.post("")
def create_work(
    type: str = Query(..., pattern="^(onecut_ad|instatoon_ad|brand_series)$"),
    title: str = Query(""),
    cut_count: int = Query(6, ge=4, le=20),
    ratio: str = Query("9:16", pattern="^(9:16|1:1)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """한 컷·인스타툰·연재툰 만들기.

    - onecut_ad / instatoon_ad → 기본 프로젝트에 에피소드 생성
    - brand_series → 시리즈 프로젝트 생성 + 1화 자동
    """
    if type == "brand_series":
        # 시리즈 프로젝트 생성 (기존 POST /projects kind=series 로직 재사용)
        _title = title.strip() or "연재툰"
        _cut = max(4, min(20, cut_count))
        _ratio = ratio if ratio in ("9:16", "1:1") else "9:16"

        proj = Project(
            user_id=current_user.id,
            title=_title,
            kind="series",
        )
        db.add(proj)
        db.flush()
        db.add(ProjectMemory(project_id=proj.id, rules={}))

        gs = create_initial_gate_status(is_ad=True, purpose="brand_series")
        gs["target_cuts"] = _cut
        gs["aspect_ratio"] = _ratio
        ep = Episode(
            project_id=proj.id,
            episode_no=1,
            title="1화",
            gate_status=gs,
        )
        db.add(ep)
        db.commit()
        db.refresh(proj)
        db.refresh(ep)
        logger.info("series created: user=%d project=%d ep=%d", current_user.id, proj.id, ep.id)
        return {
            "project_id": proj.id,
            "episode_id": ep.id,
            "type": "brand_series",
        }

    # 한 컷 / 인스타툰 → 기본 프로젝트에 에피소드
    proj = _find_or_create_default_project(db, current_user)

    _title = title.strip() or _auto_title(type)
    gs = create_initial_gate_status(is_ad=True, purpose=type)
    if type == "instatoon_ad":
        _cut = max(4, min(10, cut_count))
        gs["target_cuts"] = _cut

    ep = Episode(
        project_id=proj.id,
        episode_no=0,  # 기본 프로젝트 에피소드는 순번 무의미
        title=_title,
        gate_status=gs,
    )
    db.add(ep)
    db.commit()
    db.refresh(ep)
    logger.info("work created: user=%d type=%s project=%d ep=%d", current_user.id, type, proj.id, ep.id)
    return {
        "project_id": proj.id,
        "episode_id": ep.id,
        "type": type,
    }


# ── 예시 설정으로 만들기 ────────────────────────────────────────

@router.post("/from-example")
def create_from_example(
    token: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """예시 작품의 브리프를 프리필해서 새 작품 생성.

    - brief_public 또는 is_example인 에피소드만 허용
    - 같은 purpose로 생성 (onecut_ad/instatoon_ad → 기본 프로젝트, brand_series → 새 시리즈)
    - 제품 사진·직접 만든 캐릭터·참고 광고 복사 없음
    - 프리셋 캐릭터는 자동 link
    """
    source = db.query(Episode).filter(
        Episode.share_token == token,
        Episode.deleted_at.is_(None),
    ).first()
    if not source:
        raise HTTPException(status_code=404, detail="작품을 찾을 수 없어요")
    if not source.brief_public and not source.is_example:
        raise HTTPException(status_code=403, detail="브리프가 공개되지 않은 작품이에요")

    src_gs = source.gate_status or {}
    purpose = src_gs.get("purpose", "story")
    if purpose == "story":
        raise HTTPException(status_code=400, detail="이야기 트랙은 지원하지 않아요")

    # --- 새 에피소드 생성 ---
    gs = create_initial_gate_status(is_ad=True, purpose=purpose)

    # 프리필: target_cuts, aspect_ratio, drama_level
    for k in ("target_cuts", "aspect_ratio", "drama_level"):
        if src_gs.get(k):
            gs[k] = src_gs[k]

    # 프리필: idea_brief (공개 필드만)
    src_ib = src_gs.get("idea_brief") or {}
    new_ib = gs.get("idea_brief") or {}
    for k in ("ad_purpose", "message", "mood", "episode_topic",
              "copy_design", "onecut_device", "visual_points_selected"):
        if src_ib.get(k):
            new_ib[k] = src_ib[k]
    # 제품명(복사) — 사진·분석 결과 제외
    if src_ib.get("product", {}).get("name"):
        new_ib.setdefault("product", {})["name"] = src_ib["product"]["name"]
        if src_ib["product"].get("features"):
            new_ib["product"]["features"] = src_ib["product"]["features"]
    # ad_brief_result에서 visual_points만
    src_abr = src_ib.get("ad_brief_result") or {}
    if src_abr.get("visual_points"):
        new_ib.setdefault("ad_brief_result", {})["visual_points"] = src_abr["visual_points"]
    new_ib["prefilled_from"] = f"example {token}"
    gs["idea_brief"] = new_ib

    if purpose == "brand_series":
        src_proj = db.query(Project).filter(Project.id == source.project_id).first()
        proj = Project(
            user_id=current_user.id,
            title=f"{src_proj.title if src_proj else '연재툰'} 참고",
            kind="series",
        )
        db.add(proj)
        db.flush()
        db.add(ProjectMemory(project_id=proj.id, rules={}))
        ep = Episode(
            project_id=proj.id,
            episode_no=1,
            title="1화",
            gate_status=gs,
        )
    else:
        proj = _find_or_create_default_project(db, current_user)
        ep = Episode(
            project_id=proj.id,
            episode_no=0,
            title=_auto_title(purpose),
            gate_status=gs,
        )

    db.add(ep)
    db.flush()

    # 프리셋 캐릭터 자동 link
    from app.characters.models import Character, EpisodeCharacter
    src_chars = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == source.id, Character.is_preset == True)
        .all()
    )
    for c in src_chars:
        existing = db.query(EpisodeCharacter).filter(
            EpisodeCharacter.episode_id == ep.id,
            EpisodeCharacter.character_id == c.id,
        ).first()
        if not existing:
            db.add(EpisodeCharacter(episode_id=ep.id, character_id=c.id))

    db.commit()
    db.refresh(ep)
    logger.info(
        "from-example: user=%d token=%s purpose=%s ep=%d presets=%d",
        current_user.id, token, purpose, ep.id, len(src_chars),
    )
    return {
        "project_id": proj.id,
        "episode_id": ep.id,
        "type": purpose,
        "prefilled_from": f"example {token}",
    }


# ── 단일 목록 ─────────────────────────────────────────────────

@router.get("")
def list_works(
    filter: str = Query("all", pattern="^(all|onecut_ad|instatoon_ad|brand_series)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """내 작품 단일 목록.

    ① 광고 에피소드 (onecut_ad, instatoon_ad) — 어느 프로젝트든
    ② 시리즈 프로젝트 (kind=series) — 1행
    story 에피소드는 제외.
    """
    items = []

    # ── ① 광고 에피소드 (onecut_ad, instatoon_ad) ──
    if filter in ("all", "onecut_ad", "instatoon_ad"):
        purpose_filter = []
        if filter in ("all", "onecut_ad"):
            purpose_filter.append("onecut_ad")
        if filter in ("all", "instatoon_ad"):
            purpose_filter.append("instatoon_ad")

        q = (
            db.query(Episode)
            .join(Project, Episode.project_id == Project.id)
            .filter(
                Project.user_id == current_user.id,
                Project.deleted_at.is_(None),
                Episode.deleted_at.is_(None),
            )
        )
        # purpose는 JSON 필드 → SQL JSON_EXTRACT
        if len(purpose_filter) == 1:
            q = q.filter(
                sa_func.json_unquote(
                    sa_func.json_extract(Episode.gate_status, "$.purpose")
                ) == purpose_filter[0]
            )
        else:
            q = q.filter(
                sa_func.json_unquote(
                    sa_func.json_extract(Episode.gate_status, "$.purpose")
                ).in_(purpose_filter)
            )

        ad_eps = q.order_by(Episode.updated_at.desc()).all()
        for ep in ad_eps:
            items.append(_episode_card(ep, db))

    # ── ② 시리즈 프로젝트 1행 ──
    if filter in ("all", "brand_series"):
        series_projs = (
            db.query(Project)
            .filter(
                Project.user_id == current_user.id,
                Project.kind == "series",
                Project.deleted_at.is_(None),
            )
            .order_by(Project.updated_at.desc())
            .all()
        )
        for proj in series_projs:
            items.append(_series_card(proj, db))

    # 전체 updated_at desc 정렬
    items.sort(key=lambda x: x.get("updated_at") or "", reverse=True)

    total = len(items)
    items = items[offset : offset + limit]

    return {"items": items, "total": total}


# ── 시리즈 화 목록 ────────────────────────────────────────────

@router.get("/series/{project_id}")
def list_series_episodes(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 프로젝트의 화 목록."""
    proj = (
        db.query(Project)
        .filter(
            Project.id == project_id,
            Project.user_id == current_user.id,
            Project.kind == "series",
            Project.deleted_at.is_(None),
        )
        .first()
    )
    if not proj:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요")

    eps = (
        db.query(Episode)
        .filter(Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .order_by(Episode.episode_no)
        .all()
    )
    return {
        "project_id": proj.id,
        "title": proj.title,
        "episodes": [
            {
                "id": e.id,
                "episode_no": e.episode_no,
                "title": e.title,
                "subtitle": (e.gate_status or {}).get("idea_brief", {}).get("episode_topic", ""),
                "status": "완성" if _is_completed(e.gate_status or {}) else get_step_info(e.gate_status or {}).get("name", ""),
                "step": get_step_info(e.gate_status or {}),
                "completed": _is_completed(e.gate_status or {}),
                "has_images": thumb is not None,
                "in_final_step": _in_final_step(e.gate_status or {}, thumb),
                "thumbnail_url": thumb,
            }
            for e in eps
            for thumb in [first_cut_image(db, e.id)]
        ],
    }
