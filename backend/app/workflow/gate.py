"""게이트 상태 관리 — Backend-State-Model v1.0 기준"""

# ── 용도별 프리셋 ──
PURPOSE_PRESETS = {
    "onecut_ad":    {"is_ad": True,  "aspect_ratio": "1:1",  "page_format": "single_page", "target_cuts": 1},
    "instatoon_ad": {"is_ad": True,  "aspect_ratio": "1:1",  "page_format": "grid_2x2",    "target_cuts": 4},
    "brand_series": {"is_ad": True,  "aspect_ratio": "9:16", "page_format": "vertical",     "target_cuts": None},
    "story":        {"is_ad": False, "aspect_ratio": "9:16", "page_format": "vertical",     "target_cuts": None},
}
VALID_PURPOSES = set(PURPOSE_PRESETS.keys())


def get_purpose(gate_status: dict) -> str:
    """에피소드 용도. 없으면 'story' (기존 에피소드 호환)."""
    return gate_status.get("purpose", "story")


def is_ad_purpose(gate_status: dict) -> bool:
    """광고 용도 3종 중 하나인지."""
    return get_purpose(gate_status) in ("onecut_ad", "instatoon_ad", "brand_series")


def create_initial_gate_status(
    is_ad: bool = False,
    idea: str = "",
    product_name: str = "",
    product_features: str = "",
    purpose: str = "story",
) -> dict:
    """에피소드 생성 시 초기 gate_status JSON을 반환한다."""
    if purpose not in VALID_PURPOSES:
        purpose = "story"
    preset = PURPOSE_PRESETS[purpose]
    effective_is_ad = preset["is_ad"] if purpose != "story" else is_ad

    gs = {
        "current_gate": 1,
        "auto_advance": False,
        "purpose": purpose,
        "is_ad": effective_is_ad,
        "aspect_ratio": preset["aspect_ratio"],
        "aspect_ratio_locked": False,
        "page_format": preset["page_format"],
        "page_format_locked": False,
        "gates": {
            "1_planning": {"status": "draft", "approved_at": None},
            "2_script": {"status": "locked", "approved_at": None},
            "3_assets": {"status": "locked", "approved_at": None},
            "4_storyboard": {"status": "locked", "approved_at": None},
            "5_review": {"status": "locked", "approved_at": None},
        },
    }
    if preset["target_cuts"]:
        gs["target_cuts"] = preset["target_cuts"]
    # idea_brief: 아이디어 정리 데이터 (Gate1 진입 시 LLM이 채움)
    if idea:
        brief: dict = {"raw": idea}
        if effective_is_ad and product_name:
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

# 용도별 단계 이름 (프론트 StepHeader·에피소드 목록 부제 공용)
# story: 5단계 — 기획·대본·자산 준비·콘티·장소·웹툰 만들기
# onecut_ad: 3단계 — 브리프·준비·완성
# instatoon_ad/brand_series: 4단계 — 브리프·대본·준비·완성
AD_STEP_NAMES = {
    "onecut_ad": {
        "total": 3,
        "steps": {1: "브리프", 2: "브리프", 3: "준비", 4: "완성", 5: "완성"},
        "step_number": {1: 1, 2: 1, 3: 2, 4: 3, 5: 3},
    },
    "instatoon_ad": {
        "total": 4,
        "steps": {1: "브리프", 2: "대본", 3: "준비", 4: "완성", 5: "완성"},
        "step_number": {1: 1, 2: 2, 3: 3, 4: 4, 5: 4},
    },
    "brand_series": {
        "total": 4,
        "steps": {1: "브리프", 2: "대본", 3: "준비", 4: "완성", 5: "완성"},
        "step_number": {1: 1, 2: 2, 3: 3, 4: 4, 5: 4},
    },
}


def get_step_info(gate_status: dict) -> dict:
    """프론트용 단계 정보 반환. {total, number, name}."""
    purpose = get_purpose(gate_status)
    gate = get_gate_number(gate_status)
    if purpose in AD_STEP_NAMES:
        info = AD_STEP_NAMES[purpose]
        return {
            "total": info["total"],
            "number": info["step_number"].get(gate, gate),
            "name": info["steps"].get(gate, ""),
        }
    # story: 5단계
    _STORY_NAMES = {1: "기획", 2: "대본", 3: "자산 준비", 4: "콘티·장소", 5: "웹툰 만들기"}
    return {"total": 5, "number": gate, "name": _STORY_NAMES.get(gate, "")}


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
    """aspect_ratio + page_format을 동시에 잠금 처리한 새 gate_status를 반환한다."""
    gs = {**gate_status}
    gs["aspect_ratio_locked"] = True
    gs["page_format_locked"] = True
    return gs


# ── 페이지 형식 ──

def get_page_format(gate_status: dict) -> str:
    """에피소드의 page_format을 반환한다. 미설정 시 'vertical' (기존 에피소드 호환)."""
    return gate_status.get("page_format", "vertical")


def is_page_format_locked(gate_status: dict) -> bool:
    """page_format 잠금 여부. 미설정 시 기존 에피소드로 간주해 True."""
    return gate_status.get("page_format_locked", True)


def lock_page_format(gate_status: dict) -> dict:
    """page_format을 잠금 처리한 새 gate_status를 반환한다."""
    gs = {**gate_status}
    gs["page_format_locked"] = True
    return gs
