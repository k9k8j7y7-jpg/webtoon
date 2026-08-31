"""Image Generation Engine — 게이트 5: 컷별 이미지 생성.

PRD 4.2~4.4: 캐릭터·장소 레퍼런스 주입 → 일관성 유지.
핵심 가설 검증의 심장.
"""

import os
from pathlib import Path
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.storyboard.models import Cut, CutAssetRef, GenerationLog
from app.characters.models import Character, CharacterImage, EpisodeCharacter
from app.locations.models import Location, LocationImage
from app.styles.models import Style, STYLE_PRESETS
from app.projects.models import Episode, ProjectMemory
from app.adapters.gemini_image import get_image_adapter
from app.prompts.service import build_cut_prompt
from app.storage import upload_image, LOCAL_STORAGE_DIR
from app.jobs import get_job, update_job, Job
from app.billing.service import charge_generation

# 배치 크기: 안정성 확인 후 조정 가능 (5 → 10 등)
BATCH_SIZE = 5


def _load_image_bytes(url: str) -> bytes | None:
    """저장된 이미지를 바이트로 로드한다."""
    if url.startswith("/storage/"):
        local_path = Path(LOCAL_STORAGE_DIR) / url.replace("/storage/", "")
        if local_path.exists():
            return local_path.read_bytes()
    elif url.startswith("https://"):
        import httpx
        resp = httpx.get(url, timeout=30.0)
        if resp.status_code == 200:
            return resp.content
    return None


def _get_character_references(episode_id: int, character_ids: list[str], db: Session) -> tuple[list[bytes], list[str], dict[str, str]]:
    """캐릭터 레퍼런스 이미지 + 라벨 + 설명 로드."""
    ref_images = []
    ref_labels = []
    char_descs = {}

    for char_id in character_ids:
        character = (
            db.query(Character)
            .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
            .filter(EpisodeCharacter.episode_id == episode_id, Character.ref_key == char_id)
            .first()
        )
        if not character:
            continue

        # A파트: 한글 description은 컷 프롬프트에 넣지 않음 (렌더링 버그 방지)
        # 대신 영문 외형 명세(appearance_en)를 주입하여 외형 일관성 강화
        char_descs[char_id] = {
            "name": character.name,
            "appearance_en": character.appearance_en or "",
        }

        # 정면 이미지를 레퍼런스로 주입 (일관성의 핵심)
        front_img = (
            db.query(CharacterImage)
            .filter(CharacterImage.character_id == character.id, CharacterImage.type == "front")
            .first()
        )
        if front_img:
            img_bytes = _load_image_bytes(front_img.image_url)
            if img_bytes:
                ref_images.append(img_bytes)
                ref_labels.append(f"Character '{char_id}' ({character.name}) - front reference sheet")

    return ref_images, ref_labels, char_descs


def _get_location_reference(episode_id: int, location_id: str, db: Session) -> tuple[bytes | None, str]:
    """장소 레퍼런스 이미지 + 설명 로드."""
    location = (
        db.query(Location)
        .filter(Location.episode_id == episode_id, Location.ref_key == location_id)
        .first()
    )
    if not location:
        return None, ""

    loc_desc = f"{location.name}. {location.description or ''}"
    loc_img = db.query(LocationImage).filter(LocationImage.location_id == location.id).first()
    if loc_img:
        img_bytes = _load_image_bytes(loc_img.image_url)
        return img_bytes, loc_desc

    return None, loc_desc


async def generate_cut_image(
    cut: Cut,
    episode_id: int,
    project_id: int,
    user_id: int,
    db: Session,
) -> dict:
    """단일 컷의 이미지를 생성한다. 레퍼런스 주입 포함."""
    adapter = get_image_adapter()
    spec = cut.spec

    # 1. 캐릭터 레퍼런스 로드 (이미지 + 라벨)
    char_ids = [c.get("character_id") for c in spec.get("characters", []) if c.get("character_id")]
    ref_images, ref_labels, char_descs = _get_character_references(episode_id, char_ids, db)

    # 2. 장소 레퍼런스 로드
    location_id = spec.get("location_id")
    loc_ref, loc_desc = None, ""
    if location_id:
        loc_ref, loc_desc = _get_location_reference(episode_id, location_id, db)
        if loc_ref:
            ref_images.append(loc_ref)
            ref_labels.append("Location background reference")

    # 3. 스타일 프롬프트
    style = db.query(Style).filter(Style.episode_id == episode_id).first()
    style_prompt = style.prompt_snippet if style else STYLE_PRESETS["korean_webtoon"]["prompt"]

    # 4. 프로젝트 규칙 (AI Context Manager)
    episode = db.query(Episode).filter(Episode.id == episode_id).first()
    project_memory = db.query(ProjectMemory).filter(ProjectMemory.project_id == project_id).first()
    project_rules = project_memory.rules if project_memory else None

    # 5. 프롬프트 조립 (Prompt Engine)
    prompt = build_cut_prompt(
        cut_spec=spec,
        character_descs=char_descs,
        location_desc=loc_desc,
        style_prompt=style_prompt,
        project_rules=project_rules,
    )

    # 6. 이미지 생성 (레퍼런스 주입 + 앵커링!)
    result = await adapter.generate_image(
        prompt=prompt,
        reference_images=ref_images if ref_images else None,
        reference_labels=ref_labels if ref_labels else None,
        seed=cut.seed,
    )

    # 7. 저장
    version = (cut.version or 0) + 1
    filename = f"{cut.cut_id}_v{version}.png"
    url = upload_image(
        image_bytes=result.image_bytes,
        path_prefix=f"episodes/{episode_id}/cuts",
        filename=filename,
        mime_type=result.mime_type,
    )

    # 8. 컷 레코드 업데이트
    cut.prev_image_url = cut.image_url
    cut.image_url = url
    cut.seed = result.seed
    cut.version = version
    cut.status = "approved"

    # 말풍선 조판 (dialogue가 있으면 합성)
    from datetime import datetime, timezone
    from app.composition.service import compose_cut, RENDERER_VERSION
    dialogue = spec.get("dialogue", [])
    composed_url = compose_cut(url, dialogue, episode_id, cut.cut_id, cut_spec=spec)
    cut.composed_image_url = composed_url
    cut.composed_renderer_version = RENDERER_VERSION
    cut.composed_at = datetime.now(timezone.utc)

    # generation 정보를 spec에도 기록
    updated_spec = dict(spec)
    used_refs = char_ids.copy()
    if location_id:
        used_refs.append(location_id)
    if style:
        used_refs.append(f"style:{style.preset_key}")

    updated_spec["generation"] = {
        "image_url": url,
        "previous_image_url": cut.prev_image_url,
        "seed": result.seed,
        "model": result.model,
        "used_references": used_refs,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
    }
    updated_spec["status"] = "approved"
    cut.spec = updated_spec

    # 9. cut_asset_refs 재작성 (무효화 인덱스)
    # raw SQL DELETE 사용 (ORM DELETE는 MariaDB 시스템 버전 테이블에서 1020 에러 발생)
    from sqlalchemy import text
    db.execute(text("DELETE FROM cut_asset_refs WHERE cut_id = :cid"), {"cid": cut.cut_id})
    for char_id in char_ids:
        db.add(CutAssetRef(cut_id=cut.cut_id, episode_id=episode_id, asset_type="character", asset_ref=char_id))
    if location_id:
        db.add(CutAssetRef(cut_id=cut.cut_id, episode_id=episode_id, asset_type="location", asset_ref=location_id))
    if style:
        db.add(CutAssetRef(cut_id=cut.cut_id, episode_id=episode_id, asset_type="style", asset_ref=style.preset_key))

    # 10. generation_logs 기록 (회계)
    log = GenerationLog(
        cut_id=cut.cut_id,
        episode_id=episode_id,
        project_id=project_id,
        user_id=user_id,
        kind="cut",
        model=result.model,
        model_tier="flash",
        cost_usd=0.02,  # 실측 전 추정값
        credits_charged=2,
        seed=result.seed,
    )
    db.add(log)
    db.flush()

    # 11. 과금 차감 (구독 할당량 우선 → 크레딧)
    try:
        charge_generation(user_id, 2, log.id, db)
    except Exception:
        pass  # 과금 실패해도 이미지 생성은 유지 (MVP)

    return {
        "cut_id": cut.cut_id,
        "image_url": url,
        "version": version,
        "seed": result.seed,
    }


async def generate_all_cuts(
    episode_id: int,
    project_id: int,
    user_id: int,
    job_id: str,
    db: Session,
):
    """에피소드의 모든 pending 컷 이미지를 배치(5컷씩) 생성한다."""
    import logging
    logger = logging.getLogger(__name__)

    # cut_id 목록만 먼저 수집 (rollback 시 객체 참조 깨짐 방지)
    cut_ids = [
        c.cut_id for c in
        db.query(Cut.cut_id)
        .filter(Cut.episode_id == episode_id, Cut.status.in_(["pending", "invalidated", "regenerating"]))
        .order_by(Cut.cut_number)
        .all()
    ]

    total = len(cut_ids)
    logger.warning("generate_all_cuts START: episode=%s, total=%s, cut_ids=%s", episode_id, total, cut_ids)
    results = []
    failed_cuts = []
    consecutive_failures = 0
    done = 0

    # 5컷씩 배치 처리
    for batch_start in range(0, total, BATCH_SIZE):
        batch_ids = cut_ids[batch_start:batch_start + BATCH_SIZE]

        for cut_id in batch_ids:
            # 매번 DB에서 fresh하게 로드 (rollback 후에도 안전)
            cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
            if not cut:
                done += 1
                continue

            cut.status = "regenerating"
            db.flush()

            try:
                logger.warning("Generating cut %s ...", cut_id)
                result = await generate_cut_image(cut, episode_id, project_id, user_id, db)
                logger.warning("Cut %s SUCCESS: image_url=%s", cut_id, result.get("image_url"))
                results.append(result)
                consecutive_failures = 0
            except Exception as e:
                logger.error("Cut %s FAILED: %s", cut_id, e, exc_info=True)
                db.rollback()
                # rollback 후 cut을 다시 로드해서 상태 복구
                cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
                if cut:
                    cut.status = "pending"
                    db.commit()
                results.append({"cut_id": cut_id, "error": str(e)})
                failed_cuts.append(cut_id)
                consecutive_failures += 1

                # 연속 5회 실패 시 조기 종료
                if consecutive_failures >= 5:
                    job = get_job(job_id)
                    if job:
                        job.failed = failed_cuts
                    update_job(job_id, progress={"done": done + len(batch_ids), "total": total})
                    return {"cuts": results, "total": total, "failed": failed_cuts, "early_stop": True}

            done += 1

        # 배치 완료 시 진행률 갱신 + DB 커밋 (중간 저장)
        logger.warning("Batch commit: done=%s, total=%s", done, total)
        update_job(job_id, progress={"done": done, "total": total})
        try:
            db.commit()
            logger.warning("Batch commit SUCCESS")
        except Exception as e:
            logger.error("Batch commit FAILED: %s", e, exc_info=True)
            db.rollback()

    # 최종 상태: 실패 목록을 job에 기록
    job = get_job(job_id)
    if job:
        job.failed = failed_cuts

    logger.warning("generate_all_cuts DONE: total=%s, failed=%s", total, failed_cuts)
    return {"cuts": results, "total": total, "failed": failed_cuts}
