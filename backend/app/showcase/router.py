import hashlib
import time
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.deps import get_optional_user
from app.users.models import User
from app.projects.models import Episode, Project, ShowcaseLike
from app.storyboard.models import Cut
from app.products.models import Product
from app.social.models import AuthorSubscription
from app.social.service import author_payload, default_category, first_cut_image
from app.styles.models import Style, STYLE_PRESETS

router = APIRouter(prefix="/showcase", tags=["showcase"])


# ── brief 공개용 화이트리스트 추출 ─────────────────────────────
def _extract_public_brief(gate_status: dict) -> dict | None:
    """idea_brief에서 공개 가능 필드만 추출. 내부 키·사진 URL·이미지 모델 제외."""
    ib = (gate_status or {}).get("idea_brief")
    if not ib:
        return None

    brief: dict = {}
    abr = ib.get("ad_brief_result") or {}

    # "뭘 말했나" 덩어리 — 키는 그대로 내려보내고 한글 매핑은 프론트(adBriefLabels.js)
    for k in ("ad_purpose", "product_name", "mood", "episode_topic"):
        v = ib.get(k)
        if isinstance(v, str) and v.strip():
            brief[k] = v.strip()

    # 전달 내용 — 사용자 입력 key_message(양끝 따옴표 제거)
    msg = ib.get("key_message") or ib.get("message") or ""
    if isinstance(msg, str):
        msg = msg.strip().strip('"“”').strip()
        if msg:
            brief["message"] = msg

    # 제품 특징 (특징/활용법) — 문자열만
    pinfo = ib.get("product_info")
    if not (isinstance(pinfo, str) and pinfo.strip()):
        pinfo = (ib.get("product") or {}).get("features") if isinstance(ib.get("product"), dict) else None
    if isinstance(pinfo, str) and pinfo.strip():
        brief["product_info"] = pinfo.strip()

    # 선택된 카피 — copy_selected는 copy_candidates 인덱스(이미지 생성 경로와 동일 규칙)
    copies = ib.get("copy_candidates") or []
    sel = ib.get("copy_selected", 0)
    chosen = None
    if isinstance(sel, dict):
        chosen = sel
    elif copies:
        chosen = copies[sel] if isinstance(sel, int) and 0 <= sel < len(copies) else copies[0]
    if isinstance(chosen, dict):
        head = (chosen.get("head") or "").strip()
        sub = (chosen.get("sub") or "").strip()
        if head or sub:
            brief["copy_selected"] = {"head": head, "sub": sub}

    # 카피 디자인
    cd = ib.get("copy_design")
    if isinstance(cd, dict) and any(cd.get(k) for k in ("font", "position", "emphasis")):
        brief["copy_design"] = {k: cd.get(k) for k in ("font", "position", "emphasis")}

    # 설명 장치 (한 컷)
    od = ib.get("onecut_device")
    if isinstance(od, dict) and od.get("device"):
        brief["onecut_device"] = {
            "device": od.get("device"),
            "labels": [l for l in (od.get("labels") or []) if isinstance(l, str) and l.strip()],
        }

    # 보여줄 특징 — 인덱스 → visual_points의 feature 이름 + device
    vps_all = abr.get("visual_points") or []
    points = []
    for idx in ib.get("visual_points_selected") or []:
        vp = None
        if isinstance(idx, int) and 0 <= idx < len(vps_all):
            vp = vps_all[idx]
        elif isinstance(idx, dict):
            vp = idx
        if isinstance(vp, dict) and vp.get("feature"):
            points.append({"feature": vp["feature"], "device": vp.get("device")})
    if points:
        brief["visual_points"] = points

    # 컷 수
    tc = gate_status.get("target_cuts")
    if tc:
        brief["target_cuts"] = tc

    return brief


def _extract_public_how(gate_status: dict, db: Session, episode_id: int) -> dict:
    """'어떻게 그렸나' 덩어리 — 스타일·모델 요약·제품 요약·참고 광고 요약."""
    how: dict = {}

    # 스타일
    style_row = db.query(Style).filter(Style.episode_id == episode_id).first()
    if style_row:
        preset = STYLE_PRESETS.get(style_row.preset_key, {})
        how["style"] = {
            "key": style_row.preset_key,
            "name_ko": preset.get("label", style_row.preset_key),
        }

    # 캐릭터 모델 요약
    from app.characters.models import Character, EpisodeCharacter
    chars = (
        db.query(Character)
        .join(EpisodeCharacter, EpisodeCharacter.character_id == Character.id)
        .filter(EpisodeCharacter.episode_id == episode_id)
        .all()
    )
    if chars:
        preset_chars = [c for c in chars if c.is_preset]
        photo_chars = [c for c in chars if c.is_photo_real]
        custom_chars = [c for c in chars if not c.is_preset and not c.is_photo_real]
        parts = []
        if preset_chars:
            names = ", ".join(c.name or c.ref_key for c in preset_chars)
            parts.append(f"프리셋 {names}")
        if custom_chars:
            parts.append(f"직접 만든 캐릭터 {len(custom_chars)}명")
        if photo_chars:
            parts.append(f"실사 사진 캐릭터 {len(photo_chars)}명")
        how["characters"] = parts

    # 제품 요약 — Product 테이블(사진 있는 것만). 사진 URL·라벨 원문은 내보내지 않음
    prods = [
        p for p in db.query(Product).filter(Product.episode_id == episode_id).all()
        if p.photo_url
    ]
    if prods:
        how["product"] = {
            "photo_count": len(prods),
            "has_label_text": any((p.label_text or "").strip() for p in prods),
        }

    # 참고 광고 요약 — 광고 트랙만 (gate_status.reference_ads[].follow_layout)
    gs = gate_status or {}
    if gs.get("purpose") in ("onecut_ad", "instatoon_ad", "brand_series"):
        ref_ads = [r for r in (gs.get("reference_ads") or []) if isinstance(r, dict)]
        how["reference_ads"] = {
            "used": bool(ref_ads),
            "follow_layout": any(r.get("follow_layout") for r in ref_ads),
        }

    return how

# ── 조회수 중복 완화: 인메모리 (기기/세션당 24시간 1회) ──────────
_view_seen: dict[str, float] = {}          # "ep_id:fp" → timestamp
_VIEW_TTL = 86400                          # 24h


def _make_fingerprint(request: Request) -> str:
    """IP + User-Agent 해시 → 64자 hex fingerprint."""
    client_ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    raw = f"{client_ip}|{ua}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _record_view(episode_id: int, fp: str, db: Session) -> None:
    """조회수 증가 (중복 완화). 만료된 엔트리 lazy 정리."""
    key = f"{episode_id}:{fp}"
    now = time.time()

    # lazy cleanup (100건마다)
    if len(_view_seen) > 10000:
        expired = [k for k, t in _view_seen.items() if now - t > _VIEW_TTL]
        for k in expired:
            del _view_seen[k]

    if key in _view_seen and now - _view_seen[key] < _VIEW_TTL:
        return  # 이미 카운트됨

    _view_seen[key] = now
    db.query(Episode).filter(Episode.id == episode_id).update(
        {Episode.view_count: Episode.view_count + 1}
    )
    db.commit()


# ── 갤러리 목록 ──────────────────────────────────────────────

@router.get("/episodes")
def list_showcase_episodes(
    scope: str = Query("featured", pattern="^(featured|all)$"),
    example: int = Query(0),
    purpose: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """공개 갤러리 목록 (카테고리별 그룹).
    scope=featured(기본, 랜딩) → 관리자 추천작 / scope=all(갤러리 전체) → 작가 공개작 전부.
    example=1 → 예시 작품만 / purpose → 용도 필터(onecut_ad, instatoon_ad, brand_series)."""
    q = (
        db.query(Episode, Project, User)
        .join(Project, Episode.project_id == Project.id)
        .join(User, Project.user_id == User.id)
        .filter(Episode.is_public == True, Episode.deleted_at == None, Project.deleted_at == None)
    )
    if scope == "featured":
        q = q.filter(Episode.featured == True)
        q = q.order_by(Episode.id.desc())
    else:
        # example=1 → 예시 먼저 (is_example DESC), 이후 최신순
        if example:
            q = q.filter(Episode.is_example == True)
        q = q.order_by(Episode.is_example.desc(), Episode.published_at.desc(), Episode.id.desc())

    if purpose:
        from sqlalchemy import func as sa_func
        q = q.filter(
            sa_func.json_unquote(sa_func.json_extract(Episode.gate_status, "$.purpose")) == purpose
        )

    result = {"short": [], "series": [], "ad": []}
    for ep, proj, author in q.all():
        cat = ep.showcase_category or default_category(ep)
        gs = ep.gate_status or {}
        _title = ep.title or ("" if proj.is_default else proj.title)
        item = {
            "share_token": ep.share_token,
            "title": _title,
            "genre": proj.genre,
            "purpose": gs.get("purpose", "story"),
            "is_example": bool(ep.is_example),
            "thumbnail_url": first_cut_image(db, ep.id),
            "view_count": ep.view_count,
            "like_count": ep.like_count,
            "author": author_payload(author),
        }
        result.setdefault(cat, []).append(item)

    return result


# ── 공개 뷰어 ────────────────────────────────────────────────

@router.get("/view/{share_token}")
def get_viewer_data(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """공개 뷰어 데이터 — is_public이면 누구나, 아니면 소유자만."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    project = db.query(Project).filter(Project.id == episode.project_id).first()

    # 접근 제어: 공개(is_public)가 아니면 소유자만
    if not episode.is_public:
        if current_user is None or current_user.id != project.user_id:
            raise HTTPException(status_code=403, detail="Access denied")

    # 조회수 기록
    fp = _make_fingerprint(request)
    _record_view(episode.id, fp, db)
    db.refresh(episode)

    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode.id, Cut.image_url != None)
        .order_by(Cut.cut_number)
        .all()
    )

    # 제품 목록 (광고 에피소드용 — 뷰어에서 product_items 렌더에 필요)
    ep_products = db.query(Product).filter(Product.episode_id == episode.id).all()

    from app.workflow.gate import get_page_format
    author = db.query(User).filter(User.id == project.user_id).first()
    is_me = current_user is not None and current_user.id == project.user_id
    is_subscribed = False
    if current_user is not None and not is_me:
        is_subscribed = db.query(AuthorSubscription.id).filter(
            AuthorSubscription.follower_id == current_user.id,
            AuthorSubscription.author_id == project.user_id,
        ).first() is not None

    # is_default 프로젝트(숨은 "내 광고")면 프로젝트명 폴백 차단
    _title = episode.title or ("" if project.is_default else project.title)
    gs = episode.gate_status or {}

    resp = {
        "title": _title,
        "episode_no": episode.episode_no,
        "author": author_payload(author),
        "episode_id": episode.id,  # 댓글 API용
        "comment_count": episode.comment_count,
        "is_me": is_me,
        "is_subscribed": is_subscribed,
        "is_public": bool(episode.is_public),
        "is_example": bool(episode.is_example),
        "brief_public": bool(episode.brief_public),
        "purpose": gs.get("purpose", "story"),
        "view_count": episode.view_count,
        "like_count": episode.like_count,
        "page_format": get_page_format(gs),
        "reel": gs.get("reel", {}).get("path") if gs.get("reel", {}).get("status") == "done" else None,
        "products": [
            {"id": p.id, "name": p.name, "photo_url": p.photo_url}
            for p in ep_products if p.photo_url
        ],
        "cuts": [
            {
                "cut_number": c.cut_number,
                "image_url": c.image_url,
                "dialogue": (c.spec or {}).get("dialogue", []),
                "sfx_items": (c.spec or {}).get("sfx_items", []),
                "effect_items": (c.spec or {}).get("effect_items", []),
                "product_items": (c.spec or {}).get("product_items", []),
                "pngbubble_items": (c.spec or {}).get("pngbubble_items", []),
                "characters": (c.spec or {}).get("characters", []),
                "motion": (c.spec or {}).get("motion"),
            }
            for c in cuts
        ],
    }

    # brief 카드: brief_public 또는 is_example일 때만 노출
    if episode.brief_public or episode.is_example:
        public_brief = _extract_public_brief(gs)
        if public_brief:
            resp["brief"] = public_brief
        how = _extract_public_how(gs, db, episode.id)
        if how:
            resp["how"] = how

    return resp


# ── 좋아요 토글 ──────────────────────────────────────────────

@router.post("/like/{share_token}")
def toggle_like(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """좋아요 토글 (비로그인 포함). fingerprint 기반 중복 방지."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.is_public == True,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    fp = _make_fingerprint(request)

    existing = db.query(ShowcaseLike).filter(
        ShowcaseLike.episode_id == episode.id,
        ShowcaseLike.fingerprint == fp,
    ).first()

    if existing:
        # 취소
        db.delete(existing)
        db.query(Episode).filter(Episode.id == episode.id).update(
            {Episode.like_count: Episode.like_count - 1}
        )
        db.commit()
        db.refresh(episode)
        return {"liked": False, "like_count": episode.like_count}
    else:
        # 증가
        db.add(ShowcaseLike(episode_id=episode.id, fingerprint=fp))
        db.query(Episode).filter(Episode.id == episode.id).update(
            {Episode.like_count: Episode.like_count + 1}
        )
        db.commit()
        db.refresh(episode)
        return {"liked": True, "like_count": episode.like_count}


# ── 좋아요 상태 조회 ─────────────────────────────────────────

@router.get("/like/{share_token}")
def get_like_status(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """현재 클라이언트의 좋아요 여부 + 총 수."""
    episode = db.query(Episode).filter(
        Episode.share_token == share_token,
        Episode.is_public == True,
        Episode.deleted_at == None,
    ).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    fp = _make_fingerprint(request)
    liked = db.query(ShowcaseLike).filter(
        ShowcaseLike.episode_id == episode.id,
        ShowcaseLike.fingerprint == fp,
    ).first() is not None

    return {"liked": liked, "like_count": episode.like_count}
