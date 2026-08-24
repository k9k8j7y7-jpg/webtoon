"""Character Engine — 게이트 3: 캐릭터 시트 생성.

PRD 4.2: 캐릭터 시트(정면/표정)를 생성해 불변 자산으로 저장.
MVP: 정면 1 + 표정 2 = 3장. 의상 default 1벌 자동.
"""

from sqlalchemy.orm import Session

from app.characters.models import Character, CharacterImage, CharacterOutfit, EpisodeCharacter
from app.adapters.gemini_image import get_image_adapter
from app.storage import upload_image
from app.jobs import get_job, update_job
from app.database import SessionLocal


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


async def generate_character_sheets(
    episode_id: int,
    characters_data: list[dict],
    style_prompt: str,
    job_id: str,
    db: Session,
    project_id: int | None = None,
    style_preset_key: str | None = None,
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
            sheet_results = await adapter.generate_character_sheet(
                character_description=char_desc,
                style_prompt=style_prompt,
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
