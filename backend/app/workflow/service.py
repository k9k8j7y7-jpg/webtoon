"""WorkflowService — 무효화 전파 (Backend-State-Model 3~5장).

핵심 원칙:
  - 단방향 진행 + 지능적 부분 무효화
  - 이미지는 유지 + stale 표시 (삭제 안 함)
  - diff로 영향 없는 자산은 유지
  - cut_asset_refs 기반 정밀 무효화
"""

from sqlalchemy.orm import Session

from app.projects.models import Episode
from app.characters.models import Character
from app.locations.models import Location
from app.storyboard.models import Cut, CutAssetRef
from app.workflow.gate import GATE_KEYS
from app.script.service import extract_character_names, extract_location_names


def compute_invalidation_scope(old_script: dict, new_script: dict) -> dict:
    """대본 diff로 무효화 범위를 판정한다 (State-Model 3.2).

    Returns:
        {
            "characters": ["hero", "villain"],  # 변경된 캐릭터 ref_key
            "locations": ["cafe_interior"],      # 변경된 장소 ref_key
            "cuts_affected": True,               # 콘티/이미지 무효화 필요
        }
    """
    old_chars = extract_character_names(old_script)
    new_chars = extract_character_names(new_script)
    old_locs = extract_location_names(old_script)
    new_locs = extract_location_names(new_script)

    changed_chars = list((old_chars - new_chars) | (new_chars - old_chars))
    changed_locs = list((old_locs - new_locs) | (new_locs - old_locs))

    # 콘티·이미지는 대본이 바뀌면 항상 무효화
    cuts_affected = True

    return {
        "characters": changed_chars,
        "locations": changed_locs,
        "cuts_affected": cuts_affected,
    }


def invalidate_from_gate(
    episode: Episode,
    from_gate: int,
    scope: dict,
    db: Session,
) -> dict:
    """게이트 N에서 수정 발생 시 이후 게이트를 무효화한다 (State-Model 3.1, 3.3).

    Args:
        episode: 대상 에피소드
        from_gate: 수정이 발생한 게이트 번호 (1~4)
        scope: compute_invalidation_scope의 반환값
        db: DB 세션

    Returns:
        무효화 결과 요약
    """
    episode_id = episode.id
    result = {
        "from_gate": from_gate,
        "gates_invalidated": [],
        "characters_invalidated": [],
        "locations_invalidated": [],
        "cuts_invalidated": 0,
        "cuts_preserved": 0,
    }

    # 1. 뒤 게이트 상태를 invalidated로 변경
    gs = {**episode.gate_status, "gates": {**episode.gate_status["gates"]}}

    for gate_num in range(from_gate + 1, 6):
        key = GATE_KEYS[gate_num - 1]
        gate_data = gs["gates"].get(key, {})
        if gate_data.get("status") in ("approved", "draft"):
            gs["gates"][key] = {"status": "invalidated", "approved_at": None}
            result["gates_invalidated"].append(key)

    # current_gate를 from_gate로 되돌리기
    gs["current_gate"] = from_gate
    # from_gate 자체는 draft로 (재확정 필요)
    from_key = GATE_KEYS[from_gate - 1]
    gs["gates"][from_key] = {"status": "draft", "approved_at": None}

    episode.gate_status = gs

    # 2. 캐릭터 자산 무효화 (게이트 2, 3에서 수정 시)
    if from_gate <= 3 and scope.get("characters"):
        for char_ref in scope["characters"]:
            chars = (
                db.query(Character)
                .filter(
                    Character.episode_id == episode_id,
                    Character.ref_key == char_ref,
                )
                .all()
            )
            for char in chars:
                char.status = "invalidated"
                result["characters_invalidated"].append(char_ref)

    # 3. 장소 자산 무효화 (게이트 2, 3에서 수정 시)
    if from_gate <= 3 and scope.get("locations"):
        for loc_ref in scope["locations"]:
            locs = (
                db.query(Location)
                .filter(
                    Location.episode_id == episode_id,
                    Location.ref_key == loc_ref,
                )
                .all()
            )
            for loc in locs:
                loc.status = "invalidated"
                result["locations_invalidated"].append(loc_ref)

    # 4. 컷 무효화
    if scope.get("cuts_affected"):
        if from_gate <= 2:
            # 대본 수정 → 모든 컷 무효화
            invalidated = (
                db.query(Cut)
                .filter(
                    Cut.episode_id == episode_id,
                    Cut.status.in_(["approved", "pending"]),
                )
                .update({"status": "invalidated"}, synchronize_session="fetch")
            )
            result["cuts_invalidated"] = invalidated
            total = db.query(Cut).filter(Cut.episode_id == episode_id).count()
            result["cuts_preserved"] = total - invalidated

        elif from_gate == 3:
            # 자산 수정 → cut_asset_refs로 해당 자산을 쓰는 컷만 무효화
            affected_refs = scope.get("characters", []) + scope.get("locations", [])
            if affected_refs:
                affected_cut_ids = (
                    db.query(CutAssetRef.cut_id)
                    .filter(
                        CutAssetRef.episode_id == episode_id,
                        CutAssetRef.asset_ref.in_(affected_refs),
                    )
                    .distinct()
                    .all()
                )
                cut_ids = [r[0] for r in affected_cut_ids]
                if cut_ids:
                    invalidated = (
                        db.query(Cut)
                        .filter(
                            Cut.cut_id.in_(cut_ids),
                            Cut.status.in_(["approved", "pending"]),
                        )
                        .update({"status": "invalidated"}, synchronize_session="fetch")
                    )
                    result["cuts_invalidated"] = invalidated

                total = db.query(Cut).filter(Cut.episode_id == episode_id).count()
                result["cuts_preserved"] = total - result["cuts_invalidated"]

        elif from_gate == 4:
            # 콘티 수정 → 해당 컷 이미지만 무효화 (컷 자체가 수정된 경우)
            # 이 경우는 개별 컷 수정 엔드포인트에서 처리
            pass

    return result


def invalidate_asset(
    episode_id: int,
    asset_type: str,
    asset_ref: str,
    db: Session,
) -> dict:
    """특정 자산(캐릭터/장소) 재생성 시 관련 컷만 무효화 (State-Model 3.4).

    게이트 3에서 캐릭터 시트/장소 레퍼런스를 재생성할 때 호출.
    """
    result = {
        "asset_type": asset_type,
        "asset_ref": asset_ref,
        "cuts_invalidated": 0,
    }

    # cut_asset_refs에서 해당 자산을 사용하는 컷 조회
    affected = (
        db.query(CutAssetRef.cut_id)
        .filter(
            CutAssetRef.episode_id == episode_id,
            CutAssetRef.asset_type == asset_type,
            CutAssetRef.asset_ref == asset_ref,
        )
        .distinct()
        .all()
    )
    cut_ids = [r[0] for r in affected]

    if cut_ids:
        invalidated = (
            db.query(Cut)
            .filter(
                Cut.cut_id.in_(cut_ids),
                Cut.status.in_(["approved", "pending"]),
            )
            .update({"status": "invalidated"}, synchronize_session="fetch")
        )
        result["cuts_invalidated"] = invalidated

    return result


def invalidate_style_change(episode_id: int, db: Session) -> dict:
    """스타일 변경 시 전체 컷 무효화 (State-Model 3.4 — asset_type='style')."""
    affected = (
        db.query(CutAssetRef.cut_id)
        .filter(
            CutAssetRef.episode_id == episode_id,
            CutAssetRef.asset_type == "style",
        )
        .distinct()
        .all()
    )
    cut_ids = [r[0] for r in affected]

    invalidated = 0
    if cut_ids:
        invalidated = (
            db.query(Cut)
            .filter(
                Cut.cut_id.in_(cut_ids),
                Cut.status.in_(["approved", "pending"]),
            )
            .update({"status": "invalidated"}, synchronize_session="fetch")
        )

    return {"cuts_invalidated": invalidated}
