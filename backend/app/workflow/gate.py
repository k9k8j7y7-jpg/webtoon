"""게이트 상태 관리 — Backend-State-Model v1.0 기준"""


def create_initial_gate_status() -> dict:
    """에피소드 생성 시 초기 gate_status JSON을 반환한다."""
    return {
        "current_gate": 1,
        "auto_advance": False,
        "gates": {
            "1_planning": {"status": "draft", "approved_at": None},
            "2_script": {"status": "locked", "approved_at": None},
            "3_assets": {"status": "locked", "approved_at": None},
            "4_storyboard": {"status": "locked", "approved_at": None},
            "5_review": {"status": "locked", "approved_at": None},
        },
    }


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
