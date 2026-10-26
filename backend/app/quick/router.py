"""빠른 컷 — 한 줄 프롬프트 + 프리셋 캐릭터 → 1컷 이미지 생성."""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db, SessionLocal
from app.jobs import create_job, get_job, run_job_in_background
from app.packets.service import require_packets
from app.characters.models import Character, EpisodeCharacter
from app.projects.models import Project, Episode
from app.products.models import Product
from app.storyboard.models import Cut
from app.styles.models import Style, STYLE_PRESETS
from app.images.service import generate_cut_image

logger = logging.getLogger(__name__)

router = APIRouter(tags=["quick"])

# ── 허용 스타일 ──
QUICK_STYLES = frozenset({"korean_webtoon", "anime", "emotional_romance"})

# ── 진행 중 빠른 컷 추적 (409 중복 방지) ──
_active_quick: dict[int, str] = {}  # user_id -> job_id


QUICK_RATIOS = frozenset({"1:1", "4:5", "9:16"})


class QuickRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=200)
    preset_ref: str = Field(..., min_length=1)
    style: str = Field(default="korean_webtoon")
    aspect_ratio: str = Field(default="9:16")
    shot: str = Field(default="full")
    dialogue: str = Field(default="")
    product_photo_url: str | None = Field(default=None)  # quick/product-upload에서 받은 URL
    product_name: str | None = Field(default=None)
    product_shape: str | None = Field(default=None)
    product_size_hint: str | None = Field(default=None)
    product_label_text: str | None = Field(default=None)
    product_description: str | None = Field(default=None)


@router.post("/quick", status_code=202)
async def create_quick_cut(
    body: QuickRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """빠른 컷 생성: 프리셋 복사 → 프로젝트·에피소드 자동 생성 → 1컷 이미지."""

    # 1. 스타일·비율 검증
    if body.style not in QUICK_STYLES:
        raise HTTPException(400, f"허용 스타일: {', '.join(sorted(QUICK_STYLES))}")
    if body.aspect_ratio not in QUICK_RATIOS:
        raise HTTPException(400, f"허용 비율: {', '.join(sorted(QUICK_RATIOS))}")

    # 2. 프리셋 캐릭터 조회
    preset = (
        db.query(Character)
        .filter(Character.is_preset.is_(True), Character.ref_key == body.preset_ref)
        .first()
    )
    if not preset:
        raise HTTPException(404, "프리셋 캐릭터를 찾을 수 없습니다")

    # 3. 패킷 사전 확인 (1컷 = 1패킷)
    user_id = current_user.id
    require_packets(user_id, 1, db)

    # 4. 중복 방지 (409)
    if user_id in _active_quick:
        existing_job = get_job(_active_quick[user_id])
        if existing_job and existing_job.status in ("queued", "processing"):
            raise HTTPException(409, "이미 빠른 컷 생성이 진행 중입니다")
        _active_quick.pop(user_id, None)

    # 5. "빠른 컷" 프로젝트 (재사용)
    project = db.query(Project).filter(
        Project.user_id == user_id,
        Project.title == "빠른 컷",
        Project.deleted_at.is_(None),
    ).first()
    if not project:
        project = Project(user_id=user_id, title="빠른 컷")
        db.add(project)
        db.flush()

    # 6. 에피소드 (single_page, gate 1~4 자동 done)
    ep_count = db.query(Episode).filter(
        Episode.project_id == project.id,
        Episode.deleted_at.is_(None),
    ).count()

    now_iso = datetime.now(timezone.utc).isoformat()
    gate_status = {
        "current_gate": 5,
        "auto_advance": False,
        "is_ad": False,
        "is_quick": True,
        "aspect_ratio": body.aspect_ratio,
        "aspect_ratio_locked": False,
        "page_format": "single_page",
        "page_format_locked": False,
        "gates": {
            "1_planning": {"status": "approved", "approved_at": now_iso},
            "2_script": {"status": "approved", "approved_at": now_iso},
            "3_assets": {"status": "approved", "approved_at": now_iso},
            "4_storyboard": {"status": "approved", "approved_at": now_iso},
            "5_review": {"status": "draft", "approved_at": None},
        },
        # revert 승계용
        "idea_brief": {"raw": body.prompt},
        "planning_draft": {
            "characters": [{
                "name": preset.name or "",
                "description": preset.description or "",
                "gender": preset.gender or "",
                "age": preset.age_group or "",
            }],
        },
    }

    ep_title = body.prompt[:30] + ("\u2026" if len(body.prompt) > 30 else "")
    episode = Episode(
        project_id=project.id,
        episode_no=ep_count + 1,
        title=ep_title,
        gate_status=gate_status,
    )
    db.add(episode)
    db.flush()

    # 7. 프리셋 캐릭터 복사 (클론)
    clone = Character(
        episode_id=episode.id,
        project_id=project.id,
        ref_key=preset.ref_key,
        name=preset.name,
        gender=preset.gender,
        age_group=preset.age_group,
        description=preset.description,
        appearance_en=preset.appearance_en,
        style=body.style,
        is_preset=False,
        status="approved",
    )
    db.add(clone)
    db.flush()
    db.add(EpisodeCharacter(episode_id=episode.id, character_id=clone.id))

    # 8. 스타일 레코드
    preset_info = STYLE_PRESETS[body.style]
    db.add(Style(
        episode_id=episode.id,
        preset_key=body.style,
        tier=preset_info["tier"],
        prompt_snippet=preset_info["prompt"],
    ))

    # 8.5. 제품 연결 (선택)
    has_product = False
    product = None
    if body.product_photo_url:
        product = Product(
            episode_id=episode.id,
            name=body.product_name or "제품",
            photo_url=body.product_photo_url,
            shape=body.product_shape,
            size_hint=body.product_size_hint,
            label_text=body.product_label_text,
            description=body.product_description,
            status="approved",
        )
        db.add(product)
        db.flush()
        has_product = True
        logger.info("Quick cut product: id=%d name=%s", product.id, product.name)

    # 9. 컷 1개 생성
    cut_id = f"quick_{uuid.uuid4().hex[:8]}"
    # 제품이 있고 프롬프트에 제품 언급 없으면 자동 보강
    action = body.prompt
    if has_product and product and product.name:
        name_lower = product.name.lower()
        prompt_lower = action.lower()
        if name_lower not in prompt_lower and "제품" not in action and "product" not in prompt_lower:
            action = f"{action} ({product.name}을(를) 들고)"

    cut_spec = {
        "cut_id": cut_id,
        "scene_id": "s01",
        "cut_number": 1,
        "characters": [{
            "character_id": clone.ref_key,
            "emotion": "neutral",
            "pose": "",
            "outfit": "default",
        }],
        "shot": body.shot or "full",
        "action": action,
        "dialogue": [{
            "type": "speech",
            "speaker": clone.ref_key,
            "text": body.dialogue.strip(),
            "bubble_style": "round",
            "tail": "bottom_left",
            "x": 0.5, "y": 0.15, "width": 0.6,
        }] if body.dialogue.strip() else [],
        "emphasis": "normal",
        "has_product": has_product,
        "location_id": None,
        "status": "pending",
    }
    cut = Cut(
        cut_id=cut_id,
        episode_id=episode.id,
        scene_id="s01",
        cut_number=1,
        spec=cut_spec,
        status="pending",
    )
    db.add(cut)
    db.commit()

    # 10. 백그라운드 이미지 생성
    job = create_job(total=1)
    _active_quick[user_id] = job.job_id

    ep_id = episode.id
    proj_id = project.id

    async def _generate():
        bg_db = SessionLocal()
        try:
            bg_cut = bg_db.query(Cut).filter(Cut.cut_id == cut_id).first()
            result = await generate_cut_image(
                cut=bg_cut,
                episode_id=ep_id,
                project_id=proj_id,
                user_id=user_id,
                db=bg_db,
                source="quick",
            )
            bg_db.commit()
            logger.info("Quick cut done: user=%d cut=%s", user_id, cut_id)
            return result
        except Exception:
            bg_db.rollback()
            # 실패 시 패킷 미차감 (generate_cut_image 내부에서 성공 후에만 charge)
            # 향후 선차감 방식 전환 시 여기에 refund_packets() 추가
            logger.exception("Quick cut failed: user=%d cut=%s", user_id, cut_id)
            raise
        finally:
            bg_db.close()
            _active_quick.pop(user_id, None)

    run_job_in_background(background_tasks, job.job_id, _generate())

    return {
        "job_id": job.job_id,
        "project_id": project.id,
        "episode_id": episode.id,
        "cut_id": cut_id,
        "packets_will_charge": 1,
    }


@router.get("/quick/{job_id}")
async def get_quick_status(
    job_id: str,
    current_user=Depends(get_current_user),
):
    """빠른 컷 생성 진행 상태 조회."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.to_dict()


@router.post("/quick/product-upload")
async def quick_product_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """빠른 컷용 제품 사진 업로드 + 비전 분석. 0패킷.

    Product 행은 create_quick_cut에서 에피소드 확정 후 생성.
    여기서는 사진 저장 + 분석 결과만 반환.
    """
    from app.image_util import validate_and_process, composite_on_white
    from app.storage import upload_image
    import uuid as _uuid

    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw, original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # 임시 경로에 사진 저장
    tmp_key = _uuid.uuid4().hex[:12]
    url = upload_image(
        image_bytes=processed,
        path_prefix=f"quick/tmp/{tmp_key}",
        filename="photo.jpg",
        mime_type=mime,
    )

    # 비전 분석 (gemini flash, 0패킷)
    analysis = {"name": "제품", "shape": "other", "size_hint": "one_hand"}
    try:
        from google.genai import types
        from app.adapters.gemini import get_client, AI_TOKENS_SHORT, parse_ai_json
        ref_bytes = composite_on_white(processed)
        client = get_client()
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=ref_bytes, mime_type="image/jpeg"),
                (
                    "Analyze this product image. Return JSON: "
                    "{\"name\": \"...\", \"label_text\": \"...\", \"shape\": \"...\", "
                    "\"size_hint\": \"...\", \"description\": \"...\"}. "
                    "name=product name on label, label_text=ALL text on label, "
                    "shape=bottle/can/box/tube/flat/pouch/other, "
                    "size_hint=palm/one_hand/two_hands/tabletop/large, "
                    "description=visual description under 80 words. ONLY JSON."
                ),
            ],
            config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=AI_TOKENS_SHORT),
        )
        analysis = parse_ai_json(resp.text)
    except Exception as e:
        logger.warning("Quick product analyze failed: %s", e)

    return {
        "photo_url": url,
        "name": analysis.get("name", "제품"),
        "label_text": analysis.get("label_text"),
        "shape": analysis.get("shape", "other"),
        "size_hint": analysis.get("size_hint", "one_hand"),
        "description": analysis.get("description"),
    }


@router.post("/quick/{episode_id}/expand")
async def expand_quick_to_story(
    episode_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """빠른 컷 → 이야기 확장: 새 프로젝트 + 에피소드(gate 1) 생성, 원본 불변."""
    from app.characters.models import CharacterImage
    from app.workflow.gate import create_initial_gate_status

    user_id = current_user.id

    # 원본 빠른 컷 에피소드 조회
    src_ep = (
        db.query(Episode)
        .join(Project, Project.id == Episode.project_id)
        .filter(Episode.id == episode_id, Project.user_id == user_id, Episode.deleted_at.is_(None))
        .first()
    )
    if not src_ep:
        raise HTTPException(404, "에피소드를 찾을 수 없습니다")

    gs = src_ep.gate_status or {}
    if not gs.get("is_quick"):
        raise HTTPException(400, "빠른 컷 에피소드만 확장할 수 있습니다")

    # idea_brief·planning_draft 추출
    idea_brief = gs.get("idea_brief", {})
    planning_draft = gs.get("planning_draft", {})
    raw_prompt = idea_brief.get("raw", src_ep.title or "")

    # 1. 새 프로젝트 (이름 = 장면 앞 20자)
    proj_title = raw_prompt[:20] + ("\u2026" if len(raw_prompt) > 20 else "")
    new_project = Project(user_id=user_id, title=proj_title)
    db.add(new_project)
    db.flush()

    # 2. 새 에피소드 (gate 1 draft)
    new_gs = create_initial_gate_status()
    new_gs["idea_brief"] = idea_brief
    new_gs["planning_draft"] = planning_draft

    new_ep = Episode(
        project_id=new_project.id,
        episode_no=1,
        title=proj_title,
        gate_status=new_gs,
    )
    db.add(new_ep)
    db.flush()

    # 3. 빠른 컷 캐릭터 복사 → 새 프로젝트·에피소드
    src_chars = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id)
        .all()
    )
    for src_char in src_chars:
        clone = Character(
            episode_id=new_ep.id,
            project_id=new_project.id,
            ref_key=src_char.ref_key,
            name=src_char.name,
            gender=src_char.gender,
            age_group=src_char.age_group,
            description=src_char.description,
            appearance_en=src_char.appearance_en,
            style=src_char.style,
            is_preset=False,
            status="draft",
        )
        db.add(clone)
        db.flush()

        # 이미지 복사 (URL 공유)
        src_images = db.query(CharacterImage).filter(CharacterImage.character_id == src_char.id).all()
        for img in src_images:
            db.add(CharacterImage(
                character_id=clone.id,
                type=img.type,
                label=img.label,
                image_url=img.image_url,
                seed=img.seed,
            ))

        db.add(EpisodeCharacter(episode_id=new_ep.id, character_id=clone.id))

    db.commit()

    logger.info(
        "Quick expand: user=%d src_ep=%d → project=%d ep=%d",
        user_id, episode_id, new_project.id, new_ep.id,
    )

    return {
        "project_id": new_project.id,
        "episode_id": new_ep.id,
    }
