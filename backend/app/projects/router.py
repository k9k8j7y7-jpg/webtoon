import logging
import os
import shutil
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, ProjectMemory, Episode
from app.projects.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    EpisodeCreate, EpisodeResponse,
)
from app.workflow.gate import create_initial_gate_status, get_purpose, get_idea_brief

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


# ── Project CRUD ──────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _kind = body.kind if body.kind in ("story", "ad", "series") else "story"
    project = Project(
        user_id=current_user.id,
        title=body.title,
        kind=_kind,
        genre=body.genre,
        language=body.language,
        visibility=body.visibility,
    )
    db.add(project)
    db.flush()

    # 프로젝트 메모리 초기화 (AI Context Manager용)
    memory = ProjectMemory(project_id=project.id, rules={})
    db.add(memory)

    # ── series 프로젝트: 1화 에피소드 자동 생성 ──
    first_episode = None
    if _kind == "series":
        _cut_count = body.series_cut_count if isinstance(body.series_cut_count, int) and 4 <= body.series_cut_count <= 20 else 6
        _ratio = body.series_ratio if body.series_ratio in ("9:16", "1:1", "4:5") else "9:16"
        gs = create_initial_gate_status(
            is_ad=True,
            purpose="brand_series",
        )
        gs["target_cuts"] = _cut_count
        gs["aspect_ratio"] = _ratio
        first_episode = Episode(
            project_id=project.id,
            episode_no=1,
            title="1화",
            gate_status=gs,
        )
        db.add(first_episode)

    db.commit()
    db.refresh(project)
    if first_episode:
        db.refresh(first_episode)

    resp = ProjectResponse.model_validate(project)
    # 시리즈면 1화 ID를 응답에 포함
    if first_episode:
        return {**resp.model_dump(), "first_episode_id": first_episode.id}
    return resp


@router.get("")
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id, Project.deleted_at.is_(None))
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    result = []
    for p in projects:
        d = ProjectResponse.model_validate(p).model_dump()
        # 시리즈: 화 수, 최근 화 단계
        if p.kind == "series":
            ep_count = db.query(Episode).filter(
                Episode.project_id == p.id, Episode.deleted_at.is_(None)
            ).count()
            latest_ep = db.query(Episode).filter(
                Episode.project_id == p.id, Episode.deleted_at.is_(None)
            ).order_by(Episode.episode_no.desc()).first()
            from app.workflow.gate import get_step_info
            latest_step = get_step_info(latest_ep.gate_status) if latest_ep else None
            d["episode_count"] = ep_count
            d["latest_step"] = latest_step
        result.append(d)
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_user_project(db, project_id, current_user.id)
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_user_project(db, project_id, current_user.id)
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone

    project = _get_user_project(db, project_id, current_user.id)
    project.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ── Episode CRUD ──────────────────────────────

@router.post("/{project_id}/episodes", response_model=EpisodeResponse, status_code=status.HTTP_201_CREATED)
def create_episode(
    project_id: int,
    body: EpisodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = _get_user_project(db, project_id, current_user.id)

    gs = create_initial_gate_status(
        is_ad=body.is_ad,
        idea=body.idea,
        product_name=body.product_name,
        product_features=body.product_features,
        purpose=body.purpose,
    )
    # 인스타툰 광고 레이아웃 오버라이드 (vertical 선택 시)
    if body.page_format_override and body.page_format_override in ("vertical", "grid_2x2"):
        gs["page_format"] = body.page_format_override
        if body.page_format_override == "vertical":
            gs.pop("target_cuts", None)  # 세로는 컷 수 자유

    # ── brand_series 프리필: 시리즈 프로젝트에서만 series_defaults 사용 ──
    if body.purpose == "brand_series" and project.kind == "series" and project.series_defaults:
        sd = project.series_defaults
        brief_defaults = sd.get("brief", {})
        if brief_defaults:
            ib = dict(gs.get("idea_brief") or {})
            # 소재·카피 선택은 제외, 나머지 브리프 필드를 프리필
            for k, v in brief_defaults.items():
                if k not in ("episode_topic", "copy_selected", "scene_selected", "copy_candidates", "scene_ideas"):
                    ib[k] = v
            ib["prefilled_from"] = "project"
            gs["idea_brief"] = ib

    episode = Episode(
        project_id=project_id,
        episode_no=body.episode_no,
        title=body.title,
        gate_status=gs,
    )
    db.add(episode)
    db.flush()

    # ── brand_series: 직전 화 제품 복사 (시리즈 프로젝트에서만) ──
    if body.purpose == "brand_series" and project.kind == "series":
        _copy_products_from_latest(db, project_id, episode.id)

    db.commit()
    db.refresh(episode)
    return episode


@router.get("/{project_id}/episodes", response_model=list[EpisodeResponse])
def list_episodes(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_project(db, project_id, current_user.id)

    episodes = (
        db.query(Episode)
        .filter(Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .order_by(Episode.episode_no)
        .all()
    )
    # episode_no + 단계 이름을 gate_status에 주입 (프론트 목록 표시용)
    from app.workflow.gate import get_step_info
    for ep in episodes:
        gs = ep.gate_status or {}
        info = get_step_info(gs)
        gs["step_info"] = info
        ep.gate_status = gs
    return episodes


@router.post("/{project_id}/episodes/next", response_model=EpisodeResponse, status_code=status.HTTP_201_CREATED)
def create_next_episode(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 프로젝트 전용: 직전 화를 복사해 새 화를 만든다."""
    project = _get_user_project(db, project_id, current_user.id)
    if project.kind != "series":
        raise HTTPException(status_code=400, detail="시리즈 프로젝트에서만 사용할 수 있습니다")

    # 직전 brand_series 화 찾기
    from sqlalchemy import func as sa_func
    prev_ep = (
        db.query(Episode)
        .filter(
            Episode.project_id == project_id,
            Episode.deleted_at.is_(None),
            sa_func.json_unquote(sa_func.json_extract(Episode.gate_status, "$.purpose")) == "brand_series",
        )
        .order_by(Episode.episode_no.desc())
        .first()
    )
    if not prev_ep:
        raise HTTPException(status_code=400, detail="직전 화를 찾을 수 없습니다")

    next_no = prev_ep.episode_no + 1
    prev_gs = prev_ep.gate_status or {}

    # 새 화 gate_status: 직전 화 설정 복사
    gs = create_initial_gate_status(is_ad=True, purpose="brand_series")
    gs["target_cuts"] = prev_gs.get("target_cuts")
    gs["aspect_ratio"] = prev_gs.get("aspect_ratio", "9:16")
    if prev_gs.get("page_format"):
        gs["page_format"] = prev_gs["page_format"]

    # idea_brief: 직전 화에서 복사 (소재·카피 선택 제외)
    from app.workflow.gate import get_idea_brief
    prev_ib = get_idea_brief(prev_gs) or {}
    _EXCLUDE = {
        "episode_topic", "copy_selected", "scene_selected",
        "copy_candidates", "scene_ideas", "ad_brief_result",
        "prefilled_from", "raw",
    }
    new_ib = {k: v for k, v in prev_ib.items() if k not in _EXCLUDE}
    new_ib["prefilled_from"] = f"episode {prev_ep.episode_no}"
    # visual_points_selected 복사
    if prev_ib.get("visual_points_selected"):
        new_ib["visual_points_selected"] = prev_ib["visual_points_selected"]
    # ad_brief_result.visual_points만 복사 (카피·장면은 제외)
    prev_abr = prev_ib.get("ad_brief_result", {})
    if prev_abr.get("visual_points"):
        new_ib["ad_brief_result"] = {"visual_points": prev_abr["visual_points"]}
    gs["idea_brief"] = new_ib

    episode = Episode(
        project_id=project_id,
        episode_no=next_no,
        title=f"{next_no}화",
        gate_status=gs,
    )
    db.add(episode)
    db.flush()

    # 직전 화 제품 복사
    _copy_products_from_latest(db, project_id, episode.id)

    db.commit()
    db.refresh(episode)

    import logging
    logging.getLogger(__name__).info(
        "series next episode: project=%d ep=%d (from ep %d)",
        project_id, episode.id, prev_ep.id,
    )
    return episode


@router.delete("/{project_id}/episodes/{episode_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_episode(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone

    _get_user_project(db, project_id, current_user.id)
    episode = _get_episode(db, episode_id, project_id)
    episode.deleted_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/{project_id}/episodes/{episode_id}", response_model=EpisodeResponse)
def get_episode(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_project(db, project_id, current_user.id)
    episode = _get_episode(db, episode_id, project_id)
    return episode


# ── Helpers ───────────────────────────────────

def _get_user_project(db: Session, project_id: int, user_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _get_episode(db: Session, episode_id: int, project_id: int) -> Episode:
    episode = (
        db.query(Episode)
        .filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .first()
    )
    if not episode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Episode not found")
    return episode


# ── brand_series: 시리즈 기본값 ──────────────────────────

# 소재·카피 선택 등 화별 필드 — 기본값에서 제외
_BRIEF_EXCLUDE_KEYS = {
    "episode_topic", "copy_selected", "scene_selected",
    "copy_candidates", "scene_ideas", "ad_brief_result",
    "prefilled_from", "raw",
}


@router.post("/{project_id}/series-defaults")
def save_series_defaults(
    project_id: int,
    body: dict | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """brand_series 프로젝트의 시리즈 기본값을 저장한다."""
    project = _get_user_project(db, project_id, current_user.id)

    # brand_series 프로젝트만 허용 — 최근 에피소드 purpose로 판단
    latest_ep = (
        db.query(Episode)
        .filter(Episode.project_id == project_id, Episode.deleted_at.is_(None))
        .order_by(Episode.episode_no.desc())
        .first()
    )
    if not latest_ep or get_purpose(latest_ep.gate_status) != "brand_series":
        raise HTTPException(status_code=400, detail="brand_series 프로젝트만 가능합니다")

    # body.episode_id 지정 시 해당 에피소드, 아니면 최근 에피소드
    source_ep = latest_ep
    if body and body.get("episode_id"):
        source_ep = _get_episode(db, body["episode_id"], project_id)

    ib = get_idea_brief(source_ep.gate_status) or {}
    brief = {k: v for k, v in ib.items() if k not in _BRIEF_EXCLUDE_KEYS}

    project.series_defaults = {
        "brief": brief,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "source_episode_id": source_ep.id,
    }
    db.commit()
    logger.info("series_defaults saved: project=%d source_ep=%d", project_id, source_ep.id)
    return {"status": "saved", "source_episode_id": source_ep.id}


@router.get("/{project_id}/series-defaults")
def get_series_defaults(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 기본값 조회."""
    project = _get_user_project(db, project_id, current_user.id)
    return project.series_defaults or {}


def _copy_products_from_latest(db: Session, project_id: int, new_episode_id: int):
    """직전 화의 products 행+파일을 새 에피소드로 복사한다."""
    from app.products.models import Product
    from app.storage import LOCAL_STORAGE_DIR

    # 직전 완성 화 → 없으면 직전 화
    prev_episodes = (
        db.query(Episode)
        .filter(
            Episode.project_id == project_id,
            Episode.id != new_episode_id,
            Episode.deleted_at.is_(None),
        )
        .order_by(Episode.episode_no.desc())
        .all()
    )
    source_ep = None
    for ep in prev_episodes:
        gs = ep.gate_status or {}
        gate = gs.get("current_gate", 1)
        if gate == 5 and gs.get("gates", {}).get("5_review", {}).get("status") == "approved":
            source_ep = ep
            break
    if not source_ep and prev_episodes:
        source_ep = prev_episodes[0]
    if not source_ep:
        return

    products = db.query(Product).filter(Product.episode_id == source_ep.id).all()
    if not products:
        return

    storage_root = LOCAL_STORAGE_DIR

    for p in products:
        new_p = Product(
            episode_id=new_episode_id,
            name=p.name,
            name_ko=p.name_ko,
            features=p.features,
            description=p.description,
            shape=p.shape,
            size_hint=p.size_hint,
            size_ratio=p.size_ratio,
            label_text=p.label_text,
            status=p.status,
        )
        # 파일 복사 (photo_url, holding_photo_url, sheet_url)
        for url_field in ("photo_url", "holding_photo_url", "sheet_url"):
            old_url = getattr(p, url_field)
            if not old_url:
                continue
            old_path = os.path.join(storage_root, old_url.lstrip("/storage/"))
            if not os.path.exists(old_path):
                setattr(new_p, url_field, old_url)  # 파일 없으면 URL만 복사
                continue
            # 새 경로: products/{new_episode_id}/...
            new_rel = old_url.replace(f"/storage/products/{source_ep.id}/", f"/storage/products/{new_episode_id}/")
            new_path = os.path.join(storage_root, new_rel.lstrip("/storage/"))
            os.makedirs(os.path.dirname(new_path), exist_ok=True)
            shutil.copy2(old_path, new_path)
            setattr(new_p, url_field, new_rel)

        db.add(new_p)

    logger.info("products copied: source_ep=%d → new_ep=%d, count=%d", source_ep.id, new_episode_id, len(products))
