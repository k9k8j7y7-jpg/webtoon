"""프리셋 캐릭터 6종 생성.

사용법:
    cd backend && python -c "
import sys; sys.path.insert(0,'.')
exec(open('../scripts/create_presets.py').read())
"

또는 서버에서:
    cd /home/bitnami/project-t/backend && source venv/bin/activate
    python -c "import sys; sys.path.insert(0,'.'); exec(open('../scripts/create_presets.py').read())"
"""

import sys
import os

# backend/ 디렉터리를 path에 추가
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.users.models import User  # noqa: F401 — FK 해결용
from app.projects.models import Project, Episode
from app.characters.models import Character, EpisodeCharacter
from app.workflow.gate import create_initial_gate_status

ADMIN_USER_ID = 3  # 김김준 (본계정)

PRESETS = [
    {
        "ref_key": "preset_woman",
        "name": "여성",
        "gender": "여성",
        "age_group": "20대",
        "description": "밝고 친근한 20대 여성",
        "appearance_en": (
            "Young Korean woman in her mid-20s, shoulder-length black hair "
            "with a slight wave, warm brown eyes, slim build, casual modern "
            "clothing, friendly natural expression"
        ),
    },
    {
        "ref_key": "preset_man",
        "name": "남성",
        "gender": "남성",
        "age_group": "20대",
        "description": "자신감 있는 20대 남성",
        "appearance_en": (
            "Young Korean man in his mid-20s, short dark brown hair neatly "
            "styled, dark brown eyes, average athletic build, casual modern "
            "clothing, confident relaxed expression"
        ),
    },
    {
        "ref_key": "preset_pomeranian",
        "name": "강아지",
        "gender": "기타",
        "age_group": "",
        "description": "갈색 포메라니안",
        "appearance_en": (
            "Small brown Pomeranian dog, fluffy golden-brown fur, round dark "
            "eyes, tiny pointed ears, bushy curled tail, compact round body, "
            "cute and energetic"
        ),
    },
    {
        "ref_key": "preset_cat",
        "name": "고양이",
        "gender": "기타",
        "age_group": "",
        "description": "주황색 줄무늬 고양이",
        "appearance_en": (
            "Domestic shorthair orange tabby cat, lighter belly fur, bright "
            "green eyes, medium build, expressive whiskers, curious alert "
            "posture"
        ),
    },
    {
        "ref_key": "preset_child",
        "name": "아이",
        "gender": "기타",
        "age_group": "어린이",
        "description": "밝고 활발한 어린이",
        "appearance_en": (
            "Korean child around 7 years old, short black hair with neat "
            "bangs, big bright eyes, round cheerful face, small build, "
            "colorful casual children's clothing, happy energetic expression"
        ),
    },
    {
        "ref_key": "preset_grandma",
        "name": "할머니",
        "gender": "여성",
        "age_group": "60대",
        "description": "따뜻하고 자상한 할머니",
        "appearance_en": (
            "Korean grandmother in her late 60s, short permed silver-gray "
            "hair, warm gentle eyes with smile lines, slightly rounded build, "
            "neat comfortable clothing, kind warm expression"
        ),
    },
]


def main():
    db = SessionLocal()
    try:
        # 1. 시스템 프리셋 프로젝트 (멱등)
        project = db.query(Project).filter(
            Project.user_id == ADMIN_USER_ID,
            Project.title == "시스템 프리셋",
            Project.deleted_at.is_(None),
        ).first()
        if not project:
            project = Project(user_id=ADMIN_USER_ID, title="시스템 프리셋")
            db.add(project)
            db.flush()
            print(f"프로젝트 생성: id={project.id}")
        else:
            print(f"프로젝트 기존: id={project.id}")

        # 2. 에피소드 (멱등)
        episode = db.query(Episode).filter(
            Episode.project_id == project.id,
            Episode.deleted_at.is_(None),
        ).first()
        if not episode:
            episode = Episode(
                project_id=project.id,
                episode_no=1,
                title="프리셋 캐릭터",
                gate_status=create_initial_gate_status(),
            )
            db.add(episode)
            db.flush()
            print(f"에피소드 생성: id={episode.id}")
        else:
            print(f"에피소드 기존: id={episode.id}")

        # 3. 프리셋 캐릭터 6종 (멱등 — is_preset + ref_key 기준)
        created = 0
        for p in PRESETS:
            existing = db.query(Character).filter(
                Character.is_preset.is_(True),
                Character.ref_key == p["ref_key"],
            ).first()
            if existing:
                print(f"  스킵 (이미 존재): {p['ref_key']} id={existing.id}")
                continue

            char = Character(
                episode_id=episode.id,
                project_id=project.id,
                ref_key=p["ref_key"],
                name=p["name"],
                gender=p["gender"],
                age_group=p["age_group"],
                description=p["description"],
                appearance_en=p["appearance_en"],
                is_preset=True,
                status="approved",
            )
            db.add(char)
            db.flush()
            db.add(EpisodeCharacter(episode_id=episode.id, character_id=char.id))
            created += 1
            print(f"  생성: {p['ref_key']} id={char.id} name={p['name']}")

        db.commit()
        print(f"\n완료: {created}개 생성, {len(PRESETS) - created}개 스킵")

    finally:
        db.close()


if __name__ == "__main__":
    main()
else:
    # exec() 호출 시에도 동작
    main()
