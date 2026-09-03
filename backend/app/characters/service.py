"""Character Engine — 게이트 3: 캐릭터 시트 생성.

PRD 4.2: 캐릭터 시트(정면/표정)를 생성해 불변 자산으로 저장.
MVP: 정면 1 + 표정 2 = 3장. 의상 default 1벌 자동.
"""

import logging

from sqlalchemy.orm import Session

from app.characters.models import Character, CharacterImage, CharacterOutfit, EpisodeCharacter
from app.adapters.gemini_image import get_image_adapter
from app.adapters.gemini import generate_text, parse_ai_json, AI_TOKENS_SHORT
from app.images.service import _load_image_bytes
from app.storage import upload_image
from app.jobs import get_job, update_job
from app.database import SessionLocal

logger = logging.getLogger(__name__)


def build_character_description(character) -> str:
    """구조화 필드 + detail_notes → 이미지 생성용 description 문자열 조립."""
    parts = []
    if character.age_group:
        parts.append(character.age_group)
    if character.gender:
        parts.append(character.gender)
    if character.hair_color and character.hair_style:
        parts.append(f"{character.hair_color} {character.hair_style} hair")
    elif character.hair_color:
        parts.append(f"{character.hair_color} hair")
    elif character.hair_style:
        parts.append(f"{character.hair_style} hair")
    if character.body_type:
        parts.append(f"{character.body_type} build")
    if character.mood:
        parts.append(f"{character.mood} mood")

    desc = ", ".join(parts)
    if character.detail_notes:
        desc = f"{desc}. {character.detail_notes}" if desc else character.detail_notes
    return desc


async def build_appearance_en(character) -> str:
    """구조화 필드 + detail_notes → 영문 외형 명세 (컷 프롬프트 주입용).

    구조화 필드는 이미 영어이므로 그대로 조립하고,
    detail_notes(한글 가능)는 Gemini 텍스트로 영어 번역한다.
    """
    # 구조화 필드 → 영어 조립 (build_character_description과 동일 구조)
    parts = []
    if character.age_group:
        parts.append(character.age_group)
    if character.gender:
        parts.append(character.gender)
    if character.hair_color and character.hair_style:
        parts.append(f"{character.hair_color} {character.hair_style} hair")
    elif character.hair_color:
        parts.append(f"{character.hair_color} hair")
    elif character.hair_style:
        parts.append(f"{character.hair_style} hair")
    if character.body_type:
        parts.append(f"{character.body_type} build")

    structured_en = ", ".join(parts)

    # detail_notes 번역 (있을 때만)
    detail_en = ""
    if character.detail_notes and character.detail_notes.strip():
        try:
            detail_en = await generate_text(
                prompt=(
                    f"Translate the following Korean character appearance notes to concise English. "
                    f"Keep only visual/physical traits. Output ONLY the English text, nothing else.\n\n"
                    f"{character.detail_notes}"
                ),
                temperature=0.2,
                max_output_tokens=AI_TOKENS_SHORT,
            )
            detail_en = detail_en.strip()
        except Exception as e:
            logger.warning("appearance_en translation failed for character %s: %s", character.id, e)
            detail_en = character.detail_notes  # 폴백: 원문 그대로

    if structured_en and detail_en:
        result = f"{structured_en}. {detail_en}"
    else:
        result = structured_en or detail_en or ""
    # 줄바꿈 → 공백 (프롬프트에 깔끔하게 주입)
    return result.replace("\n", " ").strip()


async def generate_character_sheets(
    episode_id: int,
    characters_data: list[dict],
    style_prompt: str,
    job_id: str,
    db: Session,
    project_id: int | None = None,
    style_preset_key: str | None = None,
    use_photo_reference: bool = False,
):
    """모든 캐릭터의 시트를 생성한다. Job으로 비동기 실행."""
    # BackgroundTask는 별도 스레드에서 실행 → 자체 DB 세션 사용
    db = SessionLocal()

    # project_id가 전달되지 않으면 episode에서 조회
    if project_id is None:
        from app.projects.models import Episode
        ep = db.query(Episode).filter(Episode.id == episode_id).first()
        project_id = ep.project_id if ep else None

    adapter = get_image_adapter()
    total = len(characters_data)
    skipped = []
    results = []

    for i, char_data in enumerate(characters_data):
        ref_key = char_data.get("ref_key", f"char_{i}")
        name = char_data.get("name", "")
        description = char_data.get("description", "")

        # DB에 캐릭터 레코드 생성/조회 (episode_characters JOIN 경유)
        character = (
            db.query(Character)
            .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
            .filter(EpisodeCharacter.episode_id == episode_id, Character.ref_key == ref_key)
            .first()
        )

        # 피커로 연결된 캐릭터(이미 이미지 있음)는 스킵
        # — 원 소속/승격 구분 없이, EC로 연결 + front 이미지 존재 + 이 에피소드 원생성이 아닌 경우
        if character and character.episode_id != episode_id:
            skipped.append({"ref_key": ref_key, "name": character.name or name})
            results.append({"ref_key": ref_key, "name": character.name or name, "status": "skipped_linked"})
            job = get_job(job_id)
            if job:
                update_job(job_id, progress={"done": i + 1, "total": total})
            continue

        if not character:
            # 이전 unlink로 EC 없이 남은 고아 레코드 재활용
            orphan = (
                db.query(Character)
                .filter(Character.episode_id == episode_id, Character.ref_key == ref_key)
                .first()
            )
            if orphan:
                character = orphan
                character.name = name
                character.description = description
                character.style = style_preset_key
                character.status = "draft"
                # EC 재연결
                ec = EpisodeCharacter(
                    episode_id=episode_id,
                    character_id=character.id,
                )
                db.add(ec)
                db.flush()
            else:
                character = Character(
                    ref_key=ref_key,
                    episode_id=episode_id,
                    project_id=project_id,
                    name=name,
                    description=description,
                    style=style_preset_key,
                    status="draft",
                )
                db.add(character)
                db.flush()

                # episode_characters 연결 (이중 기록)
                ec = EpisodeCharacter(
                    episode_id=episode_id,
                    character_id=character.id,
                )
                db.add(ec)

                # 기본 의상 생성
                outfit = CharacterOutfit(
                    character_id=character.id,
                    outfit_key="default",
                    label="기본 의상",
                    is_default=True,
                )
                db.add(outfit)
                db.flush()

        # 기존 이미지 삭제 (재생성 시 구 이미지 제거)
        db.query(CharacterImage).filter(CharacterImage.character_id == character.id).delete()
        db.flush()

        # 이미지 생성 (정면 1 + 표정 2)
        char_desc = f"{name}. {description}"
        try:
            # 사진 참조 이미지 로드 (토글 ON 시)
            photo_refs = None
            photo_labels = None
            if use_photo_reference and character.reference_photos:
                photo_refs = []
                for photo_url in character.reference_photos:
                    photo_bytes = _load_image_bytes(photo_url)
                    if photo_bytes:
                        photo_refs.append(photo_bytes)
                if photo_refs:
                    photo_labels = [
                        f"User photo — use ONLY for facial structure, hair, body proportions. "
                        f"REDRAW entirely in {style_prompt} illustration style. "
                        f"Do NOT keep photographic rendering, lighting, or background."
                    ] * len(photo_refs)
                else:
                    photo_refs = None

            sheet_results = await adapter.generate_character_sheet(
                character_description=char_desc,
                style_prompt=style_prompt,
                reference_images=photo_refs,
                reference_labels=photo_labels,
            )

            image_types = [
                ("front", "정면"),
                ("expression", "smile"),
                ("expression", "angry"),
            ]

            for img_result, (img_type, label) in zip(sheet_results, image_types):
                url = upload_image(
                    image_bytes=img_result.image_bytes,
                    path_prefix=f"episodes/{episode_id}/characters/{ref_key}",
                    filename=f"{img_type}_{label}.png",
                    mime_type=img_result.mime_type,
                )
                char_img = CharacterImage(
                    character_id=character.id,
                    type=img_type,
                    label=label,
                    image_url=url,
                    seed=img_result.seed,
                )
                db.add(char_img)

            # appearance_en 초안 생성 (description 기반)
            if not character.appearance_en and description:
                try:
                    character.appearance_en = await generate_text(
                        prompt=(
                            f"Extract ONLY the fixed visual/physical appearance traits from this character description. "
                            f"Output concise English phrases (e.g. 'black horn-rimmed glasses, short black hair, slim build'). "
                            f"Exclude personality, mood, role. Output ONLY the traits, nothing else.\n\n"
                            f"{description}"
                        ),
                        temperature=0.2,
                        max_output_tokens=AI_TOKENS_SHORT,
                    )
                    character.appearance_en = character.appearance_en.strip().replace("\n", " ")
                except Exception as e:
                    logger.warning("appearance_en init failed for %s: %s", ref_key, e)

            results.append({"ref_key": ref_key, "name": name, "status": "generated"})

        except Exception as e:
            results.append({"ref_key": ref_key, "name": name, "status": "failed", "error": str(e)})

        # Job 진행률 업데이트
        job = get_job(job_id)
        if job:
            update_job(job_id, progress={"done": i + 1, "total": total})

    db.commit()
    db.close()
    return {"characters": results, "skipped": skipped}


async def extract_appearance_from_photos(
    photo_bytes_list: list[bytes],
    is_animal: bool = False,
) -> dict:
    """사진에서 외형 명세를 추출한다 (비전 모델).

    인물: 구조화 필드 JSON (gender, age_group, hair_style 등) + extra_notes
    동물: description free-text 한 덩어리

    Returns: parse_ai_json 결과 dict
    """
    from google.genai import types
    from app.adapters.gemini import get_client

    client = get_client()

    contents: list = []
    for i, photo_bytes in enumerate(photo_bytes_list):
        contents.append(f"Photo {i + 1}:")
        contents.append(types.Part.from_bytes(data=photo_bytes, mime_type="image/jpeg"))

    if is_animal:
        contents.append(
            "You are describing this animal character for a webtoon illustrator. "
            "Write a concise Korean description (3~5 sentences) covering: species, breed, "
            "fur color and pattern, body size, distinctive features (ears, tail, markings). "
            "Do NOT identify any real person's identity. Do NOT mention breed certification. "
            "If multiple photos, describe common features across all photos. "
            "Output JSON only:\n"
            '{"description": "한국어 외형 묘사 (종/품종, 털 색, 체형, 특징)"}'
        )
    else:
        contents.append(
            "You are extracting appearance traits from this person's photo(s) for a webtoon illustrator. "
            "Do NOT identify or guess the person's real name or identity. "
            "If multiple photos, extract common features across all photos. "
            "Output JSON only, with these exact keys (use null if not visible):\n"
            "{\n"
            '  "gender": "male" | "female" | "androgynous",\n'
            '  "age_group": "child" | "teen" | "young_adult" | "adult" | "middle_aged" | "elderly",\n'
            '  "hair_style": "short" | "medium" | "long" | "ponytail" | "twin_tails" | "bob" | "curly" | "buzz" | "bald",\n'
            '  "hair_color": "black" | "brown" | "blonde" | "red" | "white" | "silver" | "blue" | "pink" | "purple" | "green",\n'
            '  "body_type": "slim" | "average" | "athletic" | "chubby" | "large" | "petite",\n'
            '  "mood": "bright" | "calm" | "cold" | "warm" | "mysterious" | "tough" | "cute" | "elegant",\n'
            '  "extra_notes": "한국어로, 위 필드에 없는 고정 외형 특징 (예: 검은 뿔테 안경, 왼쪽 볼 점, 하늘색 스카프)"\n'
            "}"
        )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=AI_TOKENS_SHORT,
        ),
    )

    result = parse_ai_json(response.text, context="extract_appearance")
    logger.warning("Photo appearance extraction: %s", result)
    return result
