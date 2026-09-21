"""게이트 상태 관리 — Backend-State-Model v1.0 기준"""


def create_initial_gate_status(
    is_ad: bool = False,
    idea: str = "",
    product_name: str = "",
    product_features: str = "",
) -> dict:
    """에피소드 생성 시 초기 gate_status JSON을 반환한다."""
    gs = {
        "current_gate": 1,
        "auto_advance": False,
        "is_ad": is_ad,
        "aspect_ratio": "9:16",
        "aspect_ratio_locked": False,
        "gates": {
            "1_planning": {"status": "draft", "approved_at": None},
            "2_script": {"status": "locked", "approved_at": None},
            "3_assets": {"status": "locked", "approved_at": None},
            "4_storyboard": {"status": "locked", "approved_at": None},
            "5_review": {"status": "locked", "approved_at": None},
        },
    }
    # idea_brief: 아이디어 정리 데이터 (Gate1 진입 시 LLM이 채움)
    if idea:
        brief: dict = {"raw": idea}
        if is_ad and product_name:
            brief["product"] = {
                "name": product_name,
                "features": product_features or "",
            }
        gs["idea_brief"] = brief
    return gs


GATE_KEYS = [
    "1_planning",
    "2_script",
    "3_assets",
    "4_storyboard",
    "5_review",
]


def approve_gate(gate_status: dict, gate_number: int) -> dict:
    """게이트 N을 승인하고 N+1을 draft로 전환한다.

    - auto_advance여도 게이트 4는 강제 정지.
    - 반환값: 업데이트된 gate_status (새 dict).
    """
    from datetime import datetime, timezone

    gs = {**gate_status, "gates": {**gate_status["gates"]}}

    if gate_number < 1 or gate_number > 5:
        raise ValueError(f"Invalid gate number: {gate_number}")

    current = gs["current_gate"]
    if gate_number != current:
        raise ValueError(f"Cannot approve gate {gate_number}: current gate is {current}")

    key = GATE_KEYS[gate_number - 1]
    gate_data = gs["gates"][key]

    if gate_data["status"] not in ("draft", "invalidated"):
        raise ValueError(f"Gate {key} is '{gate_data['status']}', cannot approve")

    # Approve current gate
    gs["gates"][key] = {
        "status": "approved",
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }

    # Advance to next gate
    if gate_number < 5:
        next_key = GATE_KEYS[gate_number]
        next_status = gs["gates"].get(next_key, {}).get("status")
        # invalidated 상태면 유지 (재생성 필요 표시), 아니면 draft로
        if next_status == "invalidated":
            gs["gates"][next_key] = {"status": "invalidated", "approved_at": None}
        else:
            gs["gates"][next_key] = {"status": "draft", "approved_at": None}
        gs["current_gate"] = gate_number + 1

    return gs


def get_gate_number(gate_status: dict) -> int:
    return gate_status.get("current_gate", 1)


def is_ad_episode(gate_status: dict) -> bool:
    """광고 에피소드 여부."""
    return gate_status.get("is_ad", False)


def get_idea_brief(gate_status: dict) -> dict | None:
    """idea_brief 객체를 반환한다. 없으면 None (기존 에피소드 호환)."""
    return gate_status.get("idea_brief")


def set_idea_brief(gate_status: dict, idea_brief: dict) -> dict:
    """idea_brief를 업데이트한 새 gate_status를 반환한다."""
    gs = {**gate_status}
    gs["idea_brief"] = idea_brief
    return gs


def get_aspect_ratio(gate_status: dict) -> str:
    """에피소드의 aspect_ratio를 반환한다. 미설정 시 '1:1' (기존 에피소드 호환)."""
    return gate_status.get("aspect_ratio", "1:1")


def is_aspect_ratio_locked(gate_status: dict) -> bool:
    """aspect_ratio 잠금 여부. 미설정 시 이미지가 있는 기존 에피소드로 간주해 True."""
    return gate_status.get("aspect_ratio_locked", True)


def lock_aspect_ratio(gate_status: dict) -> dict:
    """aspect_ratio를 잠금 처리한 새 gate_status를 반환한다."""
    gs = {**gate_status}
    gs["aspect_ratio_locked"] = True
    return gs
