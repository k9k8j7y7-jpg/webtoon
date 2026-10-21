"""프리셋 캐릭터 미리보기 썸네일 생성 (6장, 각 1패킷).

사용법:
    cd /home/bitnami/project-t/backend && source venv/bin/activate
    PYTHONPATH=. python ../scripts/generate_preset_thumbs.py
"""

import sys
import os
import asyncio
import logging

backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

from app.database import SessionLocal
from app.users.models import User  # noqa: F401
from app.characters.models import Character, CharacterImage
from app.styles.models import STYLE_PRESETS
from app.adapters.gemini_image import get_image_adapter
from app.storage import upload_image
from app.packets.service import charge_packets, require_packets
from app.storyboard.models import GenerationLog

ADMIN_USER_ID = 3
STYLE_KEY = "korean_webtoon"
STYLE_PROMPT = STYLE_PRESETS[STYLE_KEY]["prompt"]


async def generate_thumbnails():
    db = SessionLocal()
    adapter = get_image_adapter()

    try:
        presets = (
            db.query(Character)
            .filter(Character.is_preset.is_(True))
            .order_by(Character.id)
            .all()
        )
        if not presets:
            print("프리셋 캐릭터 없음")
            return

        # 패킷 사전 확인
        need = 0
        for char in presets:
            existing = (
                db.query(CharacterImage)
                .filter(CharacterImage.character_id == char.id, CharacterImage.type == "front")
                .first()
            )
            if not existing:
                need += 1

        if need == 0:
            print("모든 프리셋에 이미 썸네일 있음")
            return

        print(f"생성 필요: {need}장, 패킷 확인...")
        require_packets(ADMIN_USER_ID, need, db)

        for char in presets:
            existing = (
                db.query(CharacterImage)
                .filter(CharacterImage.character_id == char.id, CharacterImage.type == "front")
                .first()
            )
            if existing:
                print(f"  스킵: {char.ref_key} (이미 있음)")
                continue

            prompt = (
                f"{STYLE_PROMPT}. "
                f"Single character portrait, front-facing upper body shot, centered composition, "
                f"clean simple pastel background, looking at viewer. "
                f"Character: {char.appearance_en}"
            )

            print(f"  생성 중: {char.ref_key} ({char.name})...")
            result = await adapter.generate_image(
                prompt=prompt,
                aspect_ratio="1:1",
            )

            url = upload_image(
                image_bytes=result.image_bytes,
                path_prefix=f"presets/{char.ref_key}",
                filename="front_v1.png",
                mime_type=result.mime_type,
            )

            db.add(CharacterImage(
                character_id=char.id,
                type="front",
                label="preset_thumbnail",
                image_url=url,
                seed=result.seed,
            ))

            # generation_logs 기록
            log = GenerationLog(
                cut_id=None,
                episode_id=char.episode_id,
                project_id=char.project_id,
                user_id=ADMIN_USER_ID,
                kind="character",
                model=result.model,
                model_tier="flash",
                cost_usd=0.067,
                credits_charged=0,
                packets_charged=1,
                seed=result.seed,
                source="preset",
            )
            db.add(log)
            db.flush()

            charge_packets(ADMIN_USER_ID, 1, "generation", log.id, db,
                           f"preset thumb {char.ref_key}")
            db.commit()
            print(f"    완료: {url} (seed={result.seed})")

        print(f"\n썸네일 생성 완료")

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(generate_thumbnails())
