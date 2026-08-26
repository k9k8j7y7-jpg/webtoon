"""Series API — P4+P5: 시리즈 CRUD + 바이블/아웃라인 + 회차 대본 생성.

엔드포인트 목록:
  POST   /projects/{pid}/series                — 시리즈 생성
  GET    /projects/{pid}/series                — 시리즈 목록
  GET    /series/{sid}                         — 시리즈 상세 (에피소드 집계 포함)
  DELETE /series/{sid}                         — 시리즈 삭제 (보수적)
  POST   /series/{sid}/bible                   — 바이블+아웃라인 생성
  POST   /series/{sid}/bible/regenerate        — 전체 재생성
  POST   /series/{sid}/outline/regenerate      — 부분 재생성 (from_no)
  PUT    /series/{sid}/outline                 — 아웃라인 배열 교체
  POST   /series/{sid}/outline/merge           — 인접 회차 병합
  POST   /series/{sid}/outline/split           — 회차 분할
  POST   /series/{sid}/episodes/{no}/generate  — 회차 대본 생성 (P5)
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Series, Episode
from app.characters.models import Character, EpisodeCharacter
from app.jobs import create_job, run_job_in_background
from app.workflow.gate import approve_gate

from .schemas import (
    SeriesCreateRequest,
    BibleGenerateRequest,
    OutlineRegenerateRequest,
    OutlineMergeRequest,
    OutlineSplitRequest,
    SeriesResponse,
    SeriesListItem,
)
from .service import (
    generate_bible,
    regenerate_outline_from,
    merge_outlines,
    split_outline,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["series"])


# ── 헬퍼 ──


def _get_user_project(db: Session, project_id: int, user_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _get_series_with_auth(db: Session, series_id: int, user_id: int) -> Series:
    series = db.query(Series).filter(Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    _get_user_project(db, series.project_id, user_id)
    return series


def _renumber(outline: list[dict]) -> list[dict]:
    """no 필드를 1부터 연속으로 재부여."""
    for i, item in enumerate(outline):
        item["no"] = i + 1
    return outline


def _series_to_dict(s: Series, db: Session | None = None) -> dict:
    result = {
        "id": s.id,
        "project_id": s.project_id,
        "title": s.title,
        "bible": s.bible,
        "outline": s.outline,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }
    # 에피소드 진행 집계 (2단계-2)
    if db and s.outline:
        ep_ids = [item.get("episode_id") for item in s.outline if item.get("episode_id")]
        if ep_ids:
            episodes = db.query(Episode).filter(Episode.id.in_(ep_ids), Episode.deleted_at.is_(None)).all()
            ep_map = {e.id: e for e in episodes}
            script_done = 0
            image_done = 0
            for eid in ep_ids:
                ep = ep_map.get(eid)
                if not ep:
                    continue
                gs = ep.gate_status or {}
                gates = gs.get("gates", {})
                if gates.get("2_script", {}).get("status") == "approved":
                    script_done += 1
                if gates.get("5_review", {}).get("status") == "approved":
                    image_done += 1
            result["progress"] = {
                "script_done": script_done,
                "image_done": image_done,
                "episode_count": len(ep_ids),
            }
    return result


# ── 시리즈 CRUD ──


@router.post("/projects/{project_id}/series", status_code=status.HTTP_201_CREATED)
def create_series(
    project_id: int,
    body: SeriesCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 생성 (bible/outline은 빈 상태)."""
    _get_user_project(db, project_id, current_user.id)

    series = Series(
        project_id=project_id,
        title=body.title,
        bible={
            "idea": body.idea,
            "story_options": body.story_options.model_dump() if body.story_options else None,
            "target_episodes": body.target_episodes,
        },
        outline=None,
    )
    db.add(series)
    db.commit()
    db.refresh(series)

    return {
        "id": series.id,
        "project_id": series.project_id,
        "title": series.title,
        "idea": body.idea,
        "story_options": body.story_options.model_dump() if body.story_options else None,
        "target_episodes": body.target_episodes,
        "created_at": series.created_at.isoformat(),
    }


@router.get("/projects/{project_id}/series")
def list_series(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """프로젝트의 시리즈 목록."""
    _get_user_project(db, project_id, current_user.id)

    rows = (
        db.query(Series)
        .filter(Series.project_id == project_id)
        .order_by(Series.created_at.desc())
        .all()
    )

    result = []
    for s in rows:
        outline = s.outline or []
        # 연결된 에피소드 진행 집계
        ep_ids = [item.get("episode_id") for item in outline if item.get("episode_id")]
        script_done = 0
        image_done = 0
        if ep_ids:
            episodes = db.query(Episode).filter(Episode.id.in_(ep_ids), Episode.deleted_at.is_(None)).all()
            for ep in episodes:
                gs = ep.gate_status or {}
                gates = gs.get("gates", {})
                if gates.get("2_script", {}).get("status") == "approved":
                    script_done += 1
                if gates.get("5_review", {}).get("status") == "approved":
                    image_done += 1
        result.append({
            "id": s.id,
            "title": s.title,
            "outline_count": len(outline),
            "episode_count": len(ep_ids),
            "script_done": script_done,
            "image_done": image_done,
            "created_at": s.created_at.isoformat(),
        })

    return result


@router.get("/series/{series_id}")
def get_series(
    series_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 상세 조회 (에피소드 진행 집계 포함)."""
    series = _get_series_with_auth(db, series_id, current_user.id)
    return _series_to_dict(series, db=db)


@router.delete("/series/{series_id}", status_code=status.HTTP_200_OK)
def delete_series(
    series_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """시리즈 삭제 — 연결된 에피소드가 0건일 때만 (보수적 삭제)."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    ep_count = (
        db.query(Episode)
        .filter(Episode.series_id == series_id, Episode.deleted_at.is_(None))
        .count()
    )
    if ep_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"시리즈에 연결된 에피소드가 {ep_count}개 있어 삭제할 수 없습니다. 에피소드를 먼저 삭제해주세요.",
        )

    db.delete(series)
    db.commit()
    return {"ok": True}


# ── 바이블 생성 ──


@router.post("/series/{series_id}/bible")
async def generate_series_bible(
    series_id: int,
    body: BibleGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """바이블+아웃라인 생성 (텍스트 AI 1콜, 비동기 Job)."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    # idea와 story_options는 series 생성 시 bible에 임시 저장하거나,
    # 프론트에서 별도 전달. 여기서는 series.bible에서 추출 시도 후
    # 없으면 title을 idea로 사용
    meta = series.bible or {}
    idea = meta.get("idea", series.title)
    story_options = meta.get("story_options")

    job = create_job(total=1)

    async def _run():
        from app.database import SessionLocal
        from app.jobs import update_job

        sess = SessionLocal()
        try:
            result = await generate_bible(
                idea=idea,
                target_episodes=body.target_episodes,
                story_options=story_options,
            )

            s = sess.query(Series).filter(Series.id == series_id).first()
            if not s:
                raise ValueError("Series not found")

            s.bible = {
                "synopsis": result.get("synopsis", ""),
                "world": result.get("world", ""),
                "characters": result.get("characters", []),
                "idea": idea,
                "story_options": story_options,
                "target_episodes": body.target_episodes,
            }
            s.outline = result.get("outline", [])

            sess.commit()
            update_job(job.job_id, status="completed", progress={"done": 1, "total": 1}, result={"series_id": series_id})
        except Exception as e:
            sess.rollback()
            logger.error("Bible generation failed: %s", e, exc_info=True)
            raise
        finally:
            sess.close()

    run_job_in_background(background_tasks, job.job_id, _run())

    return {"job_id": job.job_id}


@router.post("/series/{series_id}/bible/regenerate")
async def regenerate_bible(
    series_id: int,
    body: BibleGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """바이블+아웃라인 전체 재생성."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    meta = series.bible or {}
    idea = meta.get("idea", series.title)
    story_options = meta.get("story_options")

    job = create_job(total=1)

    async def _run():
        from app.database import SessionLocal
        from app.jobs import update_job

        sess = SessionLocal()
        try:
            result = await generate_bible(
                idea=idea,
                target_episodes=body.target_episodes,
                story_options=story_options,
            )

            s = sess.query(Series).filter(Series.id == series_id).first()
            if not s:
                raise ValueError("Series not found")

            s.bible = {
                "synopsis": result.get("synopsis", ""),
                "world": result.get("world", ""),
                "characters": result.get("characters", []),
                "idea": idea,
                "story_options": story_options,
                "target_episodes": body.target_episodes,
            }
            s.outline = result.get("outline", [])

            sess.commit()
            update_job(job.job_id, status="completed", progress={"done": 1, "total": 1}, result={"series_id": series_id})
        except Exception as e:
            sess.rollback()
            logger.error("Bible regeneration failed: %s", e, exc_info=True)
            raise
        finally:
            sess.close()

    run_job_in_background(background_tasks, job.job_id, _run())

    return {"job_id": job.job_id}


# ── 아웃라인 편집 ──


@router.post("/series/{series_id}/outline/regenerate")
async def regenerate_outline(
    series_id: int,
    body: OutlineRegenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """from_no 이후 회차만 재생성. 앞 회차 요약을 컨텍스트로 주입."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    if not series.bible or not series.outline:
        raise HTTPException(status_code=400, detail="바이블이 아직 생성되지 않았습니다.")

    outline = list(series.outline)

    # episode_id가 있는 항목이 from_no 이후에 있으면 방어
    for item in outline:
        if item["no"] >= body.from_no and item.get("episode_id"):
            raise HTTPException(
                status_code=409,
                detail=f"{item['no']}화는 이미 에피소드가 생성되어 재생성할 수 없습니다.",
            )

    bible = series.bible
    total = len(outline)

    job = create_job(total=1)

    async def _run():
        from app.database import SessionLocal
        from app.jobs import update_job

        sess = SessionLocal()
        try:
            new_items = await regenerate_outline_from(
                bible=bible,
                existing_outline=outline,
                from_no=body.from_no,
                total_episodes=total,
            )

            s = sess.query(Series).filter(Series.id == series_id).first()
            if not s:
                raise ValueError("Series not found")

            kept = [item for item in (s.outline or []) if item["no"] < body.from_no]
            s.outline = _renumber(kept + new_items)

            sess.commit()
            update_job(job.job_id, status="completed", progress={"done": 1, "total": 1}, result={"series_id": series_id})
        except Exception as e:
            sess.rollback()
            logger.error("Outline regeneration failed: %s", e, exc_info=True)
            raise
        finally:
            sess.close()

    run_job_in_background(background_tasks, job.job_id, _run())

    return {"job_id": job.job_id}


@router.put("/series/{series_id}/outline")
def update_outline(
    series_id: int,
    body: list[dict],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """아웃라인 배열 통째 교체. 리넘버링은 서버 책임."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    existing = {item["no"]: item for item in (series.outline or [])}

    # episode_id 있는 항목 삭제 방어
    existing_with_ep = {
        no: item for no, item in existing.items() if item.get("episode_id")
    }
    if existing_with_ep:
        incoming_nos = {item.get("no") for item in body}
        for no in existing_with_ep:
            if no not in incoming_nos:
                raise HTTPException(
                    status_code=409,
                    detail=f"{no}화는 에피소드가 연결되어 삭제할 수 없습니다.",
                )

    # episode_id, status 보존
    for item in body:
        old_no = item.get("no")
        if old_no and old_no in existing:
            old = existing[old_no]
            item["episode_id"] = old.get("episode_id")
            item["status"] = old.get("status", "outline")
        else:
            item.setdefault("episode_id", None)
            item.setdefault("status", "outline")

    series.outline = _renumber(body)
    db.commit()
    db.refresh(series)

    return _series_to_dict(series)


@router.post("/series/{series_id}/outline/merge")
async def merge_outline(
    series_id: int,
    body: OutlineMergeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """인접 두 회차 병합 (AI 1콜)."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    if not series.outline:
        raise HTTPException(status_code=400, detail="아웃라인이 없습니다.")

    # 인접 검증
    if abs(body.no_a - body.no_b) != 1:
        raise HTTPException(status_code=400, detail="인접한 회차만 병합할 수 있습니다.")

    outline = list(series.outline)
    item_a = next((x for x in outline if x["no"] == body.no_a), None)
    item_b = next((x for x in outline if x["no"] == body.no_b), None)
    if not item_a or not item_b:
        raise HTTPException(status_code=400, detail="해당 회차를 찾을 수 없습니다.")

    # episode_id 방어
    if item_a.get("episode_id") or item_b.get("episode_id"):
        raise HTTPException(status_code=409, detail="에피소드가 연결된 회차는 병합할 수 없습니다.")

    # 순서 보장 (no_a < no_b)
    if body.no_a > body.no_b:
        item_a, item_b = item_b, item_a

    job = create_job(total=1)

    async def _run():
        from app.database import SessionLocal
        from app.jobs import update_job

        sess = SessionLocal()
        try:
            merged = await merge_outlines(item_a, item_b)

            s = sess.query(Series).filter(Series.id == series_id).first()
            if not s:
                raise ValueError("Series not found")

            current = list(s.outline or [])
            no_a_val = min(body.no_a, body.no_b)
            no_b_val = max(body.no_a, body.no_b)

            new_outline = []
            for item in current:
                if item["no"] == no_a_val:
                    new_outline.append({
                        "no": 0,  # 리넘버링 예정
                        "title": merged.get("title", item_a["title"]),
                        "summary": merged.get("summary", ""),
                        "hook": item_b.get("hook", ""),  # 뒤 회차 훅 승계
                        "episode_id": None,
                        "status": "outline",
                    })
                elif item["no"] == no_b_val:
                    continue  # 삭제
                else:
                    new_outline.append(item)

            s.outline = _renumber(new_outline)
            sess.commit()
            update_job(job.job_id, status="completed", progress={"done": 1, "total": 1}, result={"series_id": series_id})
        except Exception as e:
            sess.rollback()
            logger.error("Outline merge failed: %s", e, exc_info=True)
            raise
        finally:
            sess.close()

    run_job_in_background(background_tasks, job.job_id, _run())

    return {"job_id": job.job_id}


@router.post("/series/{series_id}/outline/split")
async def split_outline_ep(
    series_id: int,
    body: OutlineSplitRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """회차 분할 (AI 1콜)."""
    series = _get_series_with_auth(db, series_id, current_user.id)

    if not series.outline:
        raise HTTPException(status_code=400, detail="아웃라인이 없습니다.")

    outline = list(series.outline)
    target = next((x for x in outline if x["no"] == body.no), None)
    if not target:
        raise HTTPException(status_code=400, detail=f"{body.no}화를 찾을 수 없습니다.")

    if target.get("episode_id"):
        raise HTTPException(status_code=409, detail="에피소드가 연결된 회차는 분할할 수 없습니다.")

    job = create_job(total=1)

    async def _run():
        from app.database import SessionLocal
        from app.jobs import update_job

        sess = SessionLocal()
        try:
            split_result = await split_outline(target)

            s = sess.query(Series).filter(Series.id == series_id).first()
            if not s:
                raise ValueError("Series not found")

            current = list(s.outline or [])
            new_outline = []
            for item in current:
                if item["no"] == body.no:
                    for ep_data in split_result:
                        new_outline.append({
                            "no": 0,
                            "title": ep_data.get("title", ""),
                            "summary": ep_data.get("summary", ""),
                            "hook": ep_data.get("hook", ""),
                            "episode_id": None,
                            "status": "outline",
                        })
                else:
                    new_outline.append(item)

            s.outline = _renumber(new_outline)
            sess.commit()
            update_job(job.job_id, status="completed", progress={"done": 1, "total": 1}, result={"series_id": series_id})
        except Exception as e:
            sess.rollback()
            logger.error("Outline split failed: %s", e, exc_info=True)
            raise
        finally:
            sess.close()

    run_job_in_background(background_tasks, job.job_id, _run())

    return {"job_id": job.job_id}


# ── 회차 대본 생성 (P5) ──


def _derive_planning_from_bible(bible: dict, outline_item: dict) -> dict:
    """바이블 + 아웃라인 항목 → Gate 1 planning 파생.

    planning.derived_from_series=true 플래그로 프론트에서 읽기 전용 판정.
    """
    summary = outline_item.get("summary", "")
    first_sentence = summary.split(".")[0] + "." if "." in summary else summary

    return {
        "title": outline_item.get("title", ""),
        "logline": first_sentence,
        "synopsis": summary,
        "world": bible.get("world", ""),
        "characters": bible.get("characters", []),
        "derived_from_series": True,
    }


def _auto_link_characters(
    db: Session,
    source_episode_id: int,
    target_episode_id: int,
    project_id: int,
) -> dict:
    """직전 에피소드 캐릭터를 현재 에피소드에 자동 연결.

    P3 link API의 검증 로직(같은 프로젝트, ref_key 충돌)을 그대로 통과.
    충돌 캐릭터는 조용히 건너뛰고 결과를 반환한다.
    """
    source_chars = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == source_episode_id)
        .all()
    )

    linked = []
    skipped = []

    for char in source_chars:
        # P3 검증 1: 같은 프로젝트 또는 사용자 라이브러리
        if char.project_id != project_id and not char.user_id:
            skipped.append({"ref_key": char.ref_key, "name": char.name, "reason": "프로젝트 불일치"})
            continue

        # P3 검증 2: 이미 연결됨 (멱등)
        existing = (
            db.query(EpisodeCharacter)
            .filter(
                EpisodeCharacter.episode_id == target_episode_id,
                EpisodeCharacter.character_id == char.id,
            )
            .first()
        )
        if existing:
            linked.append({"ref_key": char.ref_key, "name": char.name, "status": "already_linked"})
            continue

        # P3 검증 3: ref_key 충돌 검사
        conflict = (
            db.query(Character)
            .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
            .filter(
                EpisodeCharacter.episode_id == target_episode_id,
                Character.ref_key == char.ref_key,
                Character.id != char.id,
            )
            .first()
        )
        if conflict:
            skipped.append({"ref_key": char.ref_key, "name": char.name, "reason": "ref_key 충돌"})
            continue

        # 연결 생성
        ec = EpisodeCharacter(episode_id=target_episode_id, character_id=char.id)
        db.add(ec)
        linked.append({"ref_key": char.ref_key, "name": char.name, "status": "newly_linked"})

    db.flush()
    return {"linked": linked, "skipped": skipped}


@router.post("/series/{series_id}/episodes/{episode_no}/generate")
async def generate_episode_script(
    series_id: int,
    episode_no: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """회차 대본 생성 (P5):
    1. outline[no]에 episode_id 없는지 확인
    2. episodes 행 생성 + Gate 1 자동 승인
    3. 직전 회차 캐릭터 자동 연결
    4. Gate 2 대본 생성 job 시작
    """
    series = _get_series_with_auth(db, series_id, current_user.id)

    if not series.bible or not series.outline:
        raise HTTPException(status_code=400, detail="바이블이 아직 생성되지 않았습니다.")

    outline = list(series.outline)
    target_item = next((x for x in outline if x["no"] == episode_no), None)
    if not target_item:
        raise HTTPException(status_code=404, detail=f"{episode_no}화를 찾을 수 없습니다.")

    # a. 이미 생성됨 방어
    if target_item.get("episode_id"):
        raise HTTPException(status_code=409, detail=f"{episode_no}화는 이미 에피소드가 생성되었습니다.")

    bible = series.bible

    # b. episodes 행 생성 + Gate 1 자동 승인
    from app.workflow.gate import create_initial_gate_status
    planning = _derive_planning_from_bible(bible, target_item)

    gate_status = create_initial_gate_status()

    episode = Episode(
        project_id=series.project_id,
        series_id=series.id,
        episode_no=episode_no,
        title=target_item.get("title", f"{episode_no}화"),
        logline=planning["logline"],
        synopsis=planning["synopsis"],
        script={"planning": planning},
        gate_status=gate_status,
    )
    db.add(episode)
    db.flush()  # episode.id 확보

    # Gate 1 자동 승인 → current_gate=2, Gate 2=draft
    episode.gate_status = approve_gate(episode.gate_status, 1)
    db.flush()

    episode_id = episode.id

    # c. 직전 회차 캐릭터 자동 연결
    link_result = {"linked": [], "skipped": []}
    if episode_no > 1:
        prev_item = next((x for x in outline if x["no"] == episode_no - 1), None)
        if prev_item and prev_item.get("episode_id"):
            link_result = _auto_link_characters(
                db=db,
                source_episode_id=prev_item["episode_id"],
                target_episode_id=episode_id,
                project_id=series.project_id,
            )

    # e. outline 갱신: episode_id + status
    for item in outline:
        if item["no"] == episode_no:
            item["episode_id"] = episode_id
            item["status"] = "script_generating"
            break
    series.outline = outline
    flag_modified(series, "outline")

    db.commit()

    # d. Gate 2 대본 생성 job
    job = create_job(total=1)

    # 시리즈 컨텍스트 조립
    prev_item_ctx = next((x for x in outline if x["no"] == episode_no - 1), None) if episode_no > 1 else None
    series_context = {
        "synopsis": bible.get("synopsis", ""),
        "world": bible.get("world"),
        "characters": bible.get("characters", []),
        "episode_no": episode_no,
        "total_episodes": len(outline),
        "current_summary": target_item.get("summary", ""),
        "current_hook": target_item.get("hook", ""),
        "prev_summary": prev_item_ctx.get("summary") if prev_item_ctx else None,
        "prev_hook": prev_item_ctx.get("hook") if prev_item_ctx else None,
    }

    async def _run_script():
        from app.database import SessionLocal
        from app.jobs import update_job
        from app.script.service import generate_script

        sess = SessionLocal()
        try:
            result = await generate_script(planning, series_context=series_context)

            ep = sess.query(Episode).filter(Episode.id == episode_id).first()
            if not ep:
                raise ValueError("Episode not found")

            # 대본 저장
            script_data = dict(ep.script) if ep.script else {}
            script_data["script"] = result
            ep.script = script_data
            sess.flush()

            # outline status 갱신
            s = sess.query(Series).filter(Series.id == series_id).first()
            if s and s.outline:
                ol = list(s.outline)
                for item in ol:
                    if item["no"] == episode_no:
                        item["status"] = "script_done"
                        break
                s.outline = ol
                flag_modified(s, "outline")

            sess.commit()
            update_job(job.job_id, status="completed", progress={"done": 1, "total": 1}, result={
                "series_id": series_id,
                "episode_id": episode_id,
                "episode_no": episode_no,
                "link_result": link_result,
            })
        except Exception as e:
            sess.rollback()
            # outline status 실패로 갱신
            try:
                s = sess.query(Series).filter(Series.id == series_id).first()
                if s and s.outline:
                    ol = list(s.outline)
                    for item in ol:
                        if item["no"] == episode_no:
                            item["status"] = "script_failed"
                            break
                    s.outline = ol
                    flag_modified(s, "outline")
                    sess.commit()
            except Exception:
                sess.rollback()
            logger.error("Episode script generation failed: %s", e, exc_info=True)
            raise
        finally:
            sess.close()

    run_job_in_background(background_tasks, job.job_id, _run_script())

    return {
        "job_id": job.job_id,
        "episode_id": episode_id,
        "episode_no": episode_no,
        "link_result": link_result,
    }
