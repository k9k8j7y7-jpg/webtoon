"""Storyboard Engine — 게이트 4: 대본 → 컷 명세(Cut Spec) DB 저장.

대본(script)의 scenes/cuts를 파싱해서 cuts 테이블에 저장한다.
Cut-Spec-Schema v1.0 준수.
"""

import json
import math

from sqlalchemy.orm import Session

from app.storyboard.models import Cut
from app.adapters.gemini import generate_text


def recommend_cut_count(script_data: dict) -> dict:
    """대본을 분석해 권장 컷 수 범위와 최소값을 반환한다."""
    scenes = script_data.get("scenes", [])
    num_scenes = len(scenes)
    total_cuts = sum(len(s.get("cuts", [])) for s in scenes)

    # 최소: 씬당 2컷 이상
    absolute_min = max(num_scenes * 2, 6)

    # 권장 범위: 대본의 자연 컷 수 기준 ±20%
    rec_min = max(absolute_min, math.floor(total_cuts * 0.8))
    rec_max = math.ceil(total_cuts * 1.2)

    return {
        "current_count": total_cuts,
        "recommended_min": rec_min,
        "recommended_max": rec_max,
        "absolute_min": absolute_min,
        "num_scenes": num_scenes,
    }


READJUST_INSTRUCTION = """너는 웹툰 콘티 편집자야.
기존 대본(씬·컷)을 받아서, 지정된 목표 컷 수에 맞게 재분할해줘.

규칙:
- 이야기의 흐름과 결말을 유지하라. 내용을 삭제하지 마라.
- 컷 수가 줄면: 비슷한 컷을 합치고, 대사를 압축하라.
- 컷 수가 늘면: 중요 장면을 분할하고, 전환 컷을 추가하라.
- 모든 씬은 최소 2컷을 유지하라.
- character_id, location_id는 원본 그대로 사용하라.
- shot 값: long | full | bust | close_up 중 택1
- dialogue type: speech | narration | thought 중 택1
- emphasis: normal | large | full_bleed 중 택1

반드시 아래 JSON 형식으로만 응답해. 다른 텍스트는 절대 넣지 마.
{
  "scenes": [
    {
      "scene_id": "s01",
      "scene_no": 1,
      "summary": "씬 요약",
      "location": "장소명",
      "cuts": [
        {
          "cut_number": 1,
          "characters": [{"character_id": "hero", "emotion": "neutral", "pose": "서 있다", "outfit": "default"}],
          "location_id": "cafe_interior",
          "shot": "full",
          "action": "주인공이 카페에 앉아 있다",
          "dialogue": [{"order": 1, "type": "narration", "speaker": null, "text": "어느 평범한 오후였다."}],
          "emphasis": "normal",
          "transition": null
        }
      ]
    }
  ]
}"""


async def readjust_storyboard(script_data: dict, target_count: int) -> dict:
    """대본을 목표 컷 수에 맞게 AI로 재분할한다."""
    prompt = f"""아래 대본을 **총 {target_count}컷**으로 재분할해줘.

현재 대본:
{json.dumps(script_data.get("scenes", []), ensure_ascii=False, indent=2)}

목표: 총 {target_count}컷. 이야기의 흐름과 결말을 유지하면서 컷 수를 조정해줘."""

    raw = await generate_text(
        prompt=prompt,
        system_instruction=READJUST_INSTRUCTION,
        temperature=0.7,
        max_output_tokens=16384,
    )

    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    if text.startswith("json"):
        text = text[4:].strip()

    return json.loads(text)


def create_cuts_from_script(episode_id: int, script_data: dict, db: Session) -> list[dict]:
    """대본에서 컷 명세를 추출해 DB에 저장한다."""
    cuts_result = []
    global_cut_number = 0

    for scene in script_data.get("scenes", []):
        scene_id = scene.get("scene_id", "s00")

        for cut_data in scene.get("cuts", []):
            global_cut_number += 1
            cut_number = cut_data.get("cut_number", global_cut_number)
            cut_id = f"ep{episode_id:02d}_c{global_cut_number:03d}"

            # Cut Spec JSON 조립
            spec = {
                "cut_id": cut_id,
                "scene_id": scene_id,
                "cut_number": global_cut_number,
                "characters": cut_data.get("characters", []),
                "location_id": cut_data.get("location_id"),
                "shot": cut_data.get("shot", "full"),
                "action": cut_data.get("action", ""),
                "dialogue": cut_data.get("dialogue", []),
                "emphasis": cut_data.get("emphasis", "normal"),
                "transition": cut_data.get("transition"),
                "prompt_override": None,
                "status": "pending",
                "generation": None,
            }

            # DB 저장
            cut = Cut(
                cut_id=cut_id,
                episode_id=episode_id,
                scene_id=scene_id,
                cut_number=global_cut_number,
                status="pending",
                spec=spec,
            )
            db.add(cut)

            cuts_result.append({
                "cut_id": cut_id,
                "cut_number": global_cut_number,
                "scene_id": scene_id,
                "shot": spec["shot"],
                "characters": [c.get("character_id") for c in spec["characters"]],
                "location_id": spec["location_id"],
            })

    db.commit()
    return cuts_result
