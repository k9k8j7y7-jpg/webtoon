"""게이트 4 — 콘티 엔드포인트. API-Spec 6장."""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.auth.deps import get_current_user
from app.users.models import User
from app.projects.models import Project, Episode, Series
from app.storyboard.models import Cut
from app.characters.models import Character, EpisodeCharacter
from app.storyboard.service import create_cuts_from_script, recommend_cut_count, readjust_storyboard
from app.workflow.gate import approve_gate, get_gate_number
from app.composition.service import compose_cut
from app.adapters.gemini import generate_text, parse_ai_json, AI_TOKENS_MEDIUM

logger = logging.getLogger(__name__)

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

    # 재생성 후 게이트4 상태가 invalidated이면 draft로 변경
    # create_cuts_from_script가 db.commit()을 호출하므로 episode를 refresh해야 함
    db.refresh(episode)
    # deep copy로 SQLAlchemy JSON 변경 감지 보장
    gate_status = json.loads(json.dumps(episode.gate_status))
    g4 = gate_status.get("gates", {}).get("4_storyboard", {})
    if g4.get("status") == "invalidated":
        gate_status["gates"]["4_storyboard"]["status"] = "draft"
        gate_status["gates"]["4_storyboard"]["approved_at"] = None
        episode.gate_status = gate_status
        flag_modified(episode, "gate_status")
        db.commit()

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
            "sfx_items": (c.spec or {}).get("sfx_items", []),
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
    sfx_items: list[dict] | None = None  # 효과음 요소 (선택, 없으면 기존 유지)


@router.put("/cuts/{cut_id}/dialogue")
async def update_cut_dialogue(
    cut_id: str,
    body: DialogueUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """대사·효과음 수정 → 재조판 (이미지 재생성 없음, 과금 없음)."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    spec = dict(cut.spec)
    spec["dialogue"] = body.dialogue
    if body.sfx_items is not None:
        spec["sfx_items"] = body.sfx_items
    cut.spec = spec

    # 원본 이미지 위에 재조판 (말풍선만, 효과음은 프론트엔드 SVG로 렌더링)
    if cut.image_url:
        from datetime import datetime, timezone
        from app.composition.service import RENDERER_VERSION
        composed_url = compose_cut(cut.image_url, body.dialogue, cut.episode_id, cut.cut_id, cut_spec=cut.spec)
        cut.composed_image_url = composed_url
        cut.composed_renderer_version = RENDERER_VERSION
        cut.composed_at = datetime.now(timezone.utc)

    db.commit()
    return {
        "cut_id": cut_id,
        "composed_image_url": cut.composed_image_url,
        "dialogue": body.dialogue,
        "sfx_items": spec.get("sfx_items", []),
    }


# ── 지문 AI 재작성 (1-7) ──

REWRITE_ACTION_INSTRUCTION = """\
당신은 웹툰 콘티 지문 작가입니다. 주어진 컷의 지문을 사용자 요청에 맞게 다시 작성합니다.

## 규칙
- 등장 인물은 이름 + 핵심 외형을 **한국어 괄호 짧은 표기**로 명시합니다.
  예: 남편(검은 안경), 아내(갈색 긴 머리), 도도(갈색 포메라니안)
  ※ appearance_en 영어 문자열을 지문에 그대로 넣지 마세요 — 영어 외형 명세는 이미지 프롬프트 단계에서 별도 주입됩니다.
- 대명사형 이름('나', '나 (주인공)' 등)은 사용하지 않습니다. 바이블 인물명(아내, 남편 등 역할이 드러나는 명칭)을 사용하세요.
- 화자 정보가 제공되면: 1인칭 시점의 '나'는 화자 캐릭터를 가리키므로, 지문에서는 그 캐릭터의 이름으로 치환합니다.
- 인원 수, 위치, 시선, 행동을 명시합니다.
- 카메라 시점 묘사로 작성합니다 (화자 시점 문장 아님).
- 사용자 요청을 최우선 반영하되, 기존 지문의 유효한 부분은 유지합니다.
- 한국어 2~3문장으로 작성합니다.

## 출력 형식 (JSON만, 마크다운 코드블록 없이)
{
  "action": "새 지문",
  "suggested_characters": ["ref_key1", "ref_key2"]
}
- suggested_characters: 새 지문에 등장해야 할 캐릭터의 ref_key 전원 목록
"""


class RewriteActionRequest(BaseModel):
    request: str = Field(..., min_length=1, max_length=500)


@router.post("/cuts/{cut_id}/rewrite-action")
async def rewrite_action(
    cut_id: str,
    body: RewriteActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """컷 지문을 AI로 재작성한다. 저장하지 않음 — 프론트가 결과를 편집칸에 채움."""
    cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
    if not cut:
        raise HTTPException(status_code=404, detail="Cut not found")

    spec = cut.spec or {}

    # 에피소드 정보
    episode = db.query(Episode).filter(Episode.id == cut.episode_id).first()

    # 시리즈 화자 정보 (연작 회차인 경우)
    narrator_block = ""
    if episode and episode.series_id:
        series = db.query(Series).filter(Series.id == episode.series_id).first()
        if series and series.bible:
            narrator = series.bible.get("narrator")
            if narrator and narrator.get("ref_key"):
                perspective = narrator.get("perspective", "third_person")
                narrator_name = narrator.get("name", narrator["ref_key"])
                if perspective == "first_person":
                    narrator_block = f"\n## 화자 정보\n이 작품은 1인칭 시점입니다. '나'는 {narrator_name}(ref_key={narrator['ref_key']})을 가리킵니다.\n지문에서 '나' 대신 '{narrator_name}'으로 표기하세요.\n"
                else:
                    narrator_block = f"\n## 화자 정보\n이 작품은 3인칭(전지적) 시점입니다.\n"

    # 에피소드 연결 캐릭터 전원 (미등장 포함)
    characters = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == cut.episode_id)
        .all()
    )
    char_lines = []
    for c in characters:
        # 한국어 핵심 외형 짧게 조합
        traits = []
        if c.hair_color:
            traits.append(c.hair_color)
        if c.hair_style:
            traits.append(c.hair_style)
        if c.detail_notes:
            # detail_notes에서 첫 특징만
            short = c.detail_notes.split(",")[0].split("，")[0].strip()
            if short and len(short) <= 20:
                traits.append(short)
        appearance_ko = ", ".join(traits) if traits else (c.description or "")[:30]
        char_lines.append(f"- {c.name} (ref_key={c.ref_key}): ({appearance_ko})")
    char_block = "\n".join(char_lines) if char_lines else "(캐릭터 없음)"

    # 대사 정보
    dialogue = spec.get("dialogue", [])
    dialogue_lines = []
    for d in dialogue:
        speaker = d.get("speaker", "")
        text = d.get("text", "")
        dtype = d.get("type", "dialogue")
        dialogue_lines.append(f"- [{dtype}] {speaker}: {text}")
    dialogue_block = "\n".join(dialogue_lines) if dialogue_lines else "(대사 없음)"

    prompt = f"""## 현재 컷 정보
샷 타입: {spec.get('shot_type', spec.get('shot', 'full'))}
현재 지문: {spec.get('action', '(없음)')}
{narrator_block}
## 대사
{dialogue_block}

## 에피소드 캐릭터 (전원)
{char_block}

## 사용자 요청
{body.request}
"""

    raw = await generate_text(
        prompt=prompt,
        system_instruction=REWRITE_ACTION_INSTRUCTION,
        temperature=0.7,
        max_output_tokens=AI_TOKENS_MEDIUM,
    )

    try:
        result = parse_ai_json(raw, context="rewrite-action")
    except ValueError:
        raise HTTPException(status_code=502, detail="AI 응답 파싱 실패")

    return {
        "action": result.get("action", ""),
        "suggested_characters": result.get("suggested_characters", []),
    }


def _get_episode_for_user(db, project_id, episode_id, user_id):
    project = db.query(Project).filter(Project.id == project_id, Project.user_id == user_id, Project.deleted_at.is_(None)).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = db.query(Episode).filter(Episode.id == episode_id, Episode.project_id == project_id, Episode.deleted_at.is_(None)).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode
