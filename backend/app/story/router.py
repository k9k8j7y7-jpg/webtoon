"""게이트 1 — 기획 엔드포인트. API-Spec 3장."""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode
from app.story.service import generate_planning, suggest_characters, generate_idea_brief, revise_idea_brief
from app.story.prompt_fragments import build_story_options_prompt
from app.workflow.gate import approve_gate, get_gate_number, get_idea_brief, set_idea_brief, is_ad_episode

router = APIRouter(tags=["gate1-planning"])


class CharacterInput(BaseModel):
    name: str
    description: str | None = None
    gender: str | None = None
    age: int | str | None = None


class StoryOptions(BaseModel):
    genre: str | None = None
    mood: str | None = None
    development: str | None = None


class PlanningRequest(BaseModel):
    idea: str
    mood: str | None = None  # 하위호환 (기존 필드, story_options.mood 우선)
    characters: list[CharacterInput] | None = None
    story_options: StoryOptions | None = None


class SuggestCharactersRequest(BaseModel):
    idea: str


class ApproveRequest(BaseModel):
    auto_advance: bool = False


class IdeaBriefRequest(BaseModel):
    raw: str | None = None
    hint: str | None = None
    target_section: str | None = None  # ki|seung|jeon|gyeol → 단락 모드
    direction: str | None = None       # 칩 키 또는 직접 입력 텍스트


class IdeaBriefUpdate(BaseModel):
    summary: str | None = None
    characters: list[dict] | None = None
    story: dict | None = None
    tone: str | None = None
    raw: str | None = None


class PlanningDraftUpdate(BaseModel):
    genre: str | None = None
    mood: str | None = None
    development: str | None = None
    characters: list[dict] | None = None
    snapshot: bool = False  # True면 last_gen_input에도 동일 값 저장


# ── idea-brief 엔드포인트 ──────────────────────────

@router.get("/projects/{project_id}/episodes/{episode_id}/idea-brief")
async def get_idea_brief_endpoint(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    return get_idea_brief(episode.gate_status)


@router.put("/projects/{project_id}/episodes/{episode_id}/idea-brief/selection")
async def update_idea_brief_selection(
    project_id: int,
    episode_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """idea_brief에 copy_selected·scene_selected 저장 + 광고 모델 1명 planning 설정 — 게이트 무관."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gs = dict(episode.gate_status or {})
    ib = dict(gs.get("idea_brief") or {})
    if "copy_selected" in body:
        ib["copy_selected"] = body["copy_selected"]
    if "scene_selected" in body:
        ib["scene_selected"] = body["scene_selected"]
    gs["idea_brief"] = ib

    # 광고 purpose: 모델 1명 planning 자동 설정 (이야기형 planning 대체)
    purpose = gs.get("purpose", "story")
    if purpose in ("onecut_ad", "instatoon_ad", "brand_series"):
        # 장면 아이디어에서 모델 추출, 없으면 기본
        scene_sel = ib.get("scene_selected", 0)
        scenes = ib.get("scene_ideas", [])
        scene = scenes[scene_sel] if isinstance(scene_sel, int) and scene_sel < len(scenes) else {}
        scene_text = scene.get("scene", "")
        # 브리프에서 타깃 요약으로 성별·나이 추정
        target = ib.get("ad_brief_result", {}).get("target_summary", "")
        model_name = "모델"
        model_gender = "여성"
        model_age = "20대"
        if "남" in target and "여" not in target:
            model_gender = "남성"
        if "30" in target:
            model_age = "30대"
        elif "40" in target:
            model_age = "40대"
        model_desc = f"{model_age} {model_gender}, {scene_text}" if scene_text else f"{model_age} {model_gender} 모델"
        model_char = {
            "name": model_name,
            "ref_key": "model",
            "gender": model_gender,
            "age": model_age,
            "description": model_desc,
        }
        # planning에 모델 1명만 (이야기형 캐릭터 덮어씀)
        script_data = dict(episode.script) if episode.script else {}
        planning = dict(script_data.get("planning") or {})
        planning["characters"] = [model_char]
        # 이야기형 기획 필드 최소화
        copy_sel = ib.get("copy_selected", 0)
        copies = ib.get("copy_candidates", [])
        chosen = copies[copy_sel] if isinstance(copy_sel, int) and copy_sel < len(copies) else {}
        planning["logline"] = chosen.get("head", "")
        planning["synopsis"] = ""
        planning["title"] = episode.title or ""
        script_data["planning"] = planning
        episode.script = script_data
        gs["planning_draft"] = {"characters": [model_char]}

    episode.gate_status = gs
    db.commit()
    return {"status": "saved"}


@router.post("/projects/{project_id}/episodes/{episode_id}/idea-brief")
async def create_idea_brief(
    project_id: int,
    episode_id: int,
    body: IdeaBriefRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """아이디어 원문 → LLM → idea_brief 생성. hint가 있으면 재정리."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gs = episode.gate_status or {}

    existing = get_idea_brief(gs)

    if body.target_section and body.direction and existing:
        # 단락 모드: 해당 단락만 재생성
        valid_sections = ("ki", "seung", "jeon", "gyeol")
        if body.target_section not in valid_sections:
            raise HTTPException(status_code=400, detail=f"target_section은 {valid_sections} 중 하나여야 합니다.")
        result = await revise_idea_brief(
            existing, "", target_section=body.target_section, direction=body.direction,
        )
        result["raw"] = existing.get("raw", "")
    elif body.hint and existing:
        # 재정리: 기존 brief + hint
        result = await revise_idea_brief(existing, body.hint)
        # raw 교체 여부: hint만이면 raw 유지
        result["raw"] = existing.get("raw", "")
    else:
        # 신규 생성
        raw = body.raw or (existing.get("raw", "") if existing else "")
        if not raw:
            raise HTTPException(status_code=400, detail="아이디어 텍스트(raw)가 필요합니다.")

        is_ad = is_ad_episode(gs)
        product = (existing or {}).get("product", {})
        result = await generate_idea_brief(
            raw=raw,
            is_ad=is_ad,
            product_name=product.get("name", ""),
            product_features=product.get("features", ""),
        )
        result["raw"] = raw

    # product 정보 유지 (idea_brief.product는 모달에서 생성 시 설정)
    if existing and "product" in existing:
        result["product"] = existing["product"]

    episode.gate_status = set_idea_brief(gs, result)
    db.commit()
    db.refresh(episode)

    return result


@router.put("/projects/{project_id}/episodes/{episode_id}/idea-brief")
async def update_idea_brief(
    project_id: int,
    episode_id: int,
    body: IdeaBriefUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """사용자가 직접 수정한 idea_brief 필드를 저장한다."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gs = episode.gate_status or {}
    existing = get_idea_brief(gs) or {}

    update = body.model_dump(exclude_unset=True)
    merged = {**existing, **update}

    episode.gate_status = set_idea_brief(gs, merged)
    db.commit()
    db.refresh(episode)

    return merged


@router.put("/projects/{project_id}/episodes/{episode_id}/planning-draft")
async def update_planning_draft(
    project_id: int,
    episode_id: int,
    body: PlanningDraftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """게이트1 카드(장르·분위기·전개·등장인물) 임시 저장 — debounce 자동 호출."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gate = get_gate_number(episode.gate_status)
    if gate != 1:
        raise HTTPException(status_code=400, detail="게이트1에서만 저장할 수 있습니다.")

    gs = dict(episode.gate_status or {})
    draft = {
        "genre": body.genre,
        "mood": body.mood,
        "development": body.development,
        "characters": body.characters or [],
    }
    gs["planning_draft"] = draft

    if body.snapshot:
        gs["last_gen_input"] = {**draft}

    episode.gate_status = gs
    db.commit()
    return {"status": "saved"}


@router.get("/projects/{project_id}/episodes/{episode_id}/planning")
async def get_planning(
    project_id: int,
    episode_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    script = episode.script or {}
    planning = script.get("planning")
    if not planning:
        return None
    # title/logline/synopsis는 에피소드 컬럼이 최신 (수정 반영)
    planning["title"] = episode.title or planning.get("title")
    planning["logline"] = episode.logline or planning.get("logline")
    planning["synopsis"] = episode.synopsis or planning.get("synopsis")
    # story_options 포함 (재생성 시 재사용)
    if script.get("story_options"):
        planning["story_options"] = script["story_options"]
    return planning


@router.post("/projects/{project_id}/episodes/{episode_id}/planning/suggest-characters")
async def suggest_characters_endpoint(
    project_id: int,
    episode_id: int,
    body: SuggestCharactersRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_episode_for_user(db, project_id, episode_id, current_user.id)
    characters = await suggest_characters(body.idea)
    return {"characters": characters}


@router.post("/projects/{project_id}/episodes/{episode_id}/planning")
async def create_planning(
    project_id: int,
    episode_id: int,
    body: PlanningRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, planning requires gate 1",
        )

    chars = [c.model_dump() for c in body.characters] if body.characters else None

    # story_options → 프롬프트 조각 조립
    so = body.story_options.model_dump() if body.story_options else None
    # 하위호환: 기존 mood 필드 → story_options.mood로 폴백
    if not so and body.mood:
        so = {"genre": None, "mood": body.mood, "development": None}
    options_prompt = build_story_options_prompt(so)

    # idea_brief를 planning에 전달
    gs = episode.gate_status or {}
    idea_brief = get_idea_brief(gs)

    result = await generate_planning(body.idea, options_prompt, chars, idea_brief=idea_brief)

    # 제목: 사용자가 모달에서 쓴 제목이 있으면 유지, AI 추천 제목은 suggested_title로 별도 저장
    ai_title = result.get("title", "")
    if episode.title:
        # 사용자 제목 유지, AI 추천은 별도 보관
        result["suggested_title"] = ai_title
        result["title"] = episode.title
    else:
        episode.title = ai_title

    episode.logline = result.get("logline")

    # synopsis: 4단 dict면 합친 문자열로 저장, synopsis_parts는 planning에 보관
    synopsis_text = result.get("synopsis", "")
    episode.synopsis = synopsis_text

    # world와 characters는 script JSON에 임시 저장 (3단계에서 script로 확장)
    episode.script = {
        "planning": result,
        **({"story_options": so} if so else {}),
    }

    # last_gen_input: 기획 생성 시점의 카드 스냅샷 → 새로고침 후 stale 배너용
    gs = dict(episode.gate_status or {})
    # idea_brief story 스냅샷 (단락 변경 stale 감지용)
    current_brief = get_idea_brief(gs)
    brief_story = current_brief.get("story", {}) if current_brief else {}
    gen_input = {
        "genre": so.get("genre") if so else None,
        "mood": so.get("mood") if so else None,
        "characters": [c.model_dump() for c in body.characters] if body.characters else [],
        "brief_story": brief_story,
    }
    gs["last_gen_input"] = gen_input
    # planning_draft도 동기화 (현재 입력 = 마지막 생성 입력)
    gs["planning_draft"] = {**gen_input}
    episode.gate_status = gs

    db.commit()
    db.refresh(episode)

    return result


@router.put("/projects/{project_id}/episodes/{episode_id}/planning")
async def update_planning(
    project_id: int,
    episode_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    # 사용자 수정 반영
    if "title" in body:
        episode.title = body["title"]
    if "logline" in body:
        episode.logline = body["logline"]
    if "synopsis" in body:
        episode.synopsis = body["synopsis"]
    if "planning" in body and episode.script:
        script = dict(episode.script)
        script["planning"] = body["planning"]
        episode.script = script

    db.commit()
    db.refresh(episode)

    return {"status": "updated"}


@router.post("/projects/{project_id}/episodes/{episode_id}/planning/approve")
async def approve_planning(
    project_id: int,
    episode_id: int,
    body: ApproveRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    gate = get_gate_number(episode.gate_status)
    if gate != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Current gate is {gate}, not gate 1",
        )

    new_status = approve_gate(episode.gate_status, 1)
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


# ── 광고 기획안 ──

class AdBriefRequest(BaseModel):
    ad_purpose: str
    key_message: str
    mood: str = "ai_pick"
    target_audience: str = ""
    cta: str = ""
    extras: dict | None = None


class RewriteCopyRequest(BaseModel):
    head: str
    sub: str
    direction: str
    key_message: str = ""


@router.post("/projects/{project_id}/episodes/{episode_id}/ad-brief")
async def create_ad_brief(
    project_id: int,
    episode_id: int,
    body: AdBriefRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """광고 기획안 생성 (0패킷). 카피 3·장면 3·추천 스타일."""
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)

    import json as _json
    from app.prompts.ad_brief import generate_ad_brief as _gen
    from app.workflow.gate import set_idea_brief as _set_brief

    gate_status = episode.gate_status
    idea_brief = gate_status.get("idea_brief") or {}
    product = idea_brief.get("product", {})

    # 참고 광고 분석 텍스트 수집
    ref_ads = gate_status.get("reference_ads", [])
    ref_analysis = "; ".join(
        a.get("analysis", {}).get("note", "")
        for a in ref_ads if a.get("analysis", {}).get("note")
    )

    result = await _gen(
        ad_purpose=body.ad_purpose,
        key_message=body.key_message,
        mood=body.mood,
        target_audience=body.target_audience,
        cta=body.cta,
        product_name=product.get("name", ""),
        product_features=product.get("features", ""),
        reference_analysis=ref_analysis,
        extras=body.extras,
    )

    # idea_brief에 광고 키 저장
    idea_brief["ad_purpose"] = body.ad_purpose
    idea_brief["key_message"] = body.key_message
    idea_brief["mood"] = body.mood
    idea_brief["target_audience"] = body.target_audience
    idea_brief["cta"] = body.cta
    if body.extras:
        idea_brief["extras"] = body.extras
    idea_brief["copy_candidates"] = result.get("copy_candidates", [])
    idea_brief["scene_ideas"] = result.get("scene_ideas", [])
    idea_brief["recommended_style"] = result.get("recommended_style", "korean_webtoon")
    idea_brief["ad_brief_result"] = {
        "key_message": result.get("key_message", ""),
        "target_summary": result.get("target_summary", ""),
    }

    new_gs = _json.loads(_json.dumps(gate_status))
    new_gs["idea_brief"] = idea_brief
    episode.gate_status = new_gs
    db.commit()

    return result


@router.post("/projects/{project_id}/episodes/{episode_id}/ad-brief/rewrite-copy")
async def rewrite_copy_endpoint(
    project_id: int,
    episode_id: int,
    body: RewriteCopyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """카피 다시 쓰기 (0패킷)."""
    _get_episode_for_user(db, project_id, episode_id, current_user.id)

    from app.prompts.ad_brief import rewrite_copy
    result = await rewrite_copy(
        existing_head=body.head,
        existing_sub=body.sub,
        direction=body.direction,
        key_message=body.key_message,
    )
    return result


# ── 참고 광고 ──

@router.post("/projects/{project_id}/episodes/{episode_id}/reference-ads")
async def upload_reference_ad(
    project_id: int,
    episode_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """참고 광고 이미지 업로드 + 비전 분석 (0패킷, 최대 2장)."""
    import json as _json
    from app.image_util import validate_and_process
    from app.storage import upload_image
    from google.genai import types
    from app.adapters.gemini import get_client, parse_ai_json, AI_TOKENS_SHORT

    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gate_status = _json.loads(_json.dumps(episode.gate_status))
    ref_ads = gate_status.get("reference_ads", [])
    if len(ref_ads) >= 2:
        raise HTTPException(status_code=400, detail="참고 광고는 최대 2장입니다")

    raw = await file.read()
    try:
        processed, mime = validate_and_process(
            raw, original_content_type=file.content_type or "",
            original_filename=file.filename or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ext = "jpg" if "jpeg" in mime else "png"
    url = upload_image(
        image_bytes=processed,
        path_prefix=f"episodes/{episode_id}/reference_ads",
        filename=f"ref_{len(ref_ads)}.{ext}",
        mime_type=mime,
    )

    # 비전 분석
    client = get_client()
    vision_resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=processed, mime_type=mime),
            (
                "Analyze this advertisement image. Return JSON:\n"
                '{"mood": "one-word mood", "colors": "dominant color palette",'
                ' "composition": "layout description (e.g. person left, product right)",'
                ' "text_layout": "where text is placed (e.g. top center headline)",'
                ' "lighting": "lighting description",'
                ' "note": "Korean summary of overall mood/composition/colors in one sentence"}'
            ),
        ],
        config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=AI_TOKENS_SHORT),
    )
    try:
        analysis = parse_ai_json(vision_resp.text)
    except Exception:
        analysis = {"note": "분석 실패"}

    ref_entry = {"url": url, "analysis": analysis, "follow_layout": False}
    ref_ads.append(ref_entry)
    gate_status["reference_ads"] = ref_ads
    episode.gate_status = gate_status
    db.commit()

    return ref_entry


class RefAdUpdate(BaseModel):
    analysis: dict | None = None
    follow_layout: bool | None = None


@router.put("/projects/{project_id}/episodes/{episode_id}/reference-ads/{index}")
async def update_reference_ad(
    project_id: int, episode_id: int, index: int,
    body: RefAdUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """참고 광고 칩 수정·토글."""
    import json as _json
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gate_status = _json.loads(_json.dumps(episode.gate_status))
    ref_ads = gate_status.get("reference_ads", [])
    if index < 0 or index >= len(ref_ads):
        raise HTTPException(status_code=404, detail="참고 광고를 찾을 수 없습니다")
    if body.analysis is not None:
        ref_ads[index]["analysis"] = body.analysis
    if body.follow_layout is not None:
        ref_ads[index]["follow_layout"] = body.follow_layout
    gate_status["reference_ads"] = ref_ads
    episode.gate_status = gate_status
    db.commit()
    return ref_ads[index]


@router.delete("/projects/{project_id}/episodes/{episode_id}/reference-ads/{index}")
async def delete_reference_ad(
    project_id: int, episode_id: int, index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """참고 광고 삭제."""
    import json as _json
    episode = _get_episode_for_user(db, project_id, episode_id, current_user.id)
    gate_status = _json.loads(_json.dumps(episode.gate_status))
    ref_ads = gate_status.get("reference_ads", [])
    if index < 0 or index >= len(ref_ads):
        raise HTTPException(status_code=404, detail="참고 광고를 찾을 수 없습니다")
    ref_ads.pop(index)
    gate_status["reference_ads"] = ref_ads
    episode.gate_status = gate_status
    db.commit()
    return {"deleted": True}
