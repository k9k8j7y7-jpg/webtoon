"""Export Engine — 완성 웹툰 내보내기.

API-Spec 8장: png_cuts | vertical_single | instagram_carousel

렌더러 버전 정책:
  - 각 컷은 composed_renderer_version을 저장한다.
  - Export 시 RENDERER_VERSION과 다른 컷만 재조판한다.
  - 대부분의 Export는 즉시 실행 (stale 컷만 추가 처리).
"""

import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from io import BytesIO

from PIL import Image
from sqlalchemy.orm import Session

from app.storyboard.models import Cut
from app.storage import upload_image, LOCAL_STORAGE_DIR
from app.composition.service import compose_cut, RENDERER_VERSION


def _load_cut_image(image_url: str) -> Image.Image | None:
    """컷 이미지를 PIL Image로 로드. RGBA는 RGB로 변환."""
    if image_url.startswith("/storage/"):
        local_path = Path(LOCAL_STORAGE_DIR) / image_url.replace("/storage/", "")
        if local_path.exists():
            img = Image.open(local_path)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            return img
    return None


def _is_stale(cut: Cut) -> bool:
    """재조판이 필요한 컷인지 판정."""
    if not cut.composed_image_url:
        return True
    if cut.composed_renderer_version != RENDERER_VERSION:
        return True
    return False


def _ensure_composed(cut: Cut, db: Session) -> str | None:
    """stale이면 현재 렌더러로 재조판 후 URL 반환. 아니면 기존 URL 반환."""
    if _is_stale(cut):
        dialogue = (cut.spec or {}).get("dialogue", [])
        if cut.image_url and dialogue:
            new_url = compose_cut(
                cut.image_url, dialogue,
                cut.episode_id, cut.cut_id,
                cut_spec=cut.spec,
            )
            if new_url:
                cut.composed_image_url = new_url
                cut.composed_renderer_version = RENDERER_VERSION
                cut.composed_at = datetime.now(timezone.utc)
                db.commit()
    return cut.composed_image_url or cut.image_url


def export_png_cuts(episode_id: int, db: Session) -> dict:
    """개별 PNG 컷 파일들을 ZIP으로 묶어 내보낸다."""
    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode_id, Cut.image_url.isnot(None))
        .order_by(Cut.cut_number)
        .all()
    )
    if not cuts:
        return {"error": "No images to export"}

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for cut in cuts:
            url = _ensure_composed(cut, db)
            img = _load_cut_image(url)
            if img:
                img_buffer = BytesIO()
                img.save(img_buffer, format="PNG")
                zf.writestr(f"cut_{cut.cut_number:03d}.png", img_buffer.getvalue())

    zip_bytes = zip_buffer.getvalue()
    url = upload_image(
        image_bytes=zip_bytes,
        path_prefix=f"episodes/{episode_id}/exports",
        filename=f"ep{episode_id}_cuts.zip",
        mime_type="application/zip",
    )
    return {"download_url": url, "format": "png_cuts", "total_cuts": len(cuts)}


def export_vertical_single(episode_id: int, db: Session) -> dict:
    """모든 컷을 세로로 이어붙인 하나의 이미지로 내보낸다."""
    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode_id, Cut.image_url.isnot(None))
        .order_by(Cut.cut_number)
        .all()
    )
    if not cuts:
        return {"error": "No images to export"}

    images = []
    for cut in cuts:
        url = _ensure_composed(cut, db)
        img = _load_cut_image(url)
        if img:
            images.append(img)

    if not images:
        return {"error": "Could not load any images"}

    target_width = 800
    resized = []
    for img in images:
        ratio = target_width / img.width
        new_height = int(img.height * ratio)
        resized.append(img.resize((target_width, new_height), Image.LANCZOS))

    gap = 20
    total_height = sum(img.height for img in resized) + gap * (len(resized) - 1)
    canvas = Image.new("RGB", (target_width, total_height), (255, 255, 255))
    y_offset = 0
    for img in resized:
        # ── cut_005 수정: x 중앙 정렬 (리사이즈 후 target_width보다 좁을 경우 대비) ──
        x_offset = (target_width - img.width) // 2
        canvas.paste(img, (x_offset, y_offset))
        y_offset += img.height + gap

    img_buffer = BytesIO()
    canvas.save(img_buffer, format="PNG")

    url = upload_image(
        image_bytes=img_buffer.getvalue(),
        path_prefix=f"episodes/{episode_id}/exports",
        filename=f"ep{episode_id}_vertical.png",
        mime_type="image/png",
    )
    return {"download_url": url, "format": "vertical_single", "total_cuts": len(images)}


def export_instagram_carousel(episode_id: int, db: Session) -> dict:
    """인스타그램 캐러셀 규격(1080x1080)으로 내보낸다."""
    cuts = (
        db.query(Cut)
        .filter(Cut.episode_id == episode_id, Cut.image_url.isnot(None))
        .order_by(Cut.cut_number)
        .all()
    )
    if not cuts:
        return {"error": "No images to export"}

    CAROUSEL_SIZE = (1080, 1080)

    zip_buffer = BytesIO()
    count = 0
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for cut in cuts:
            url = _ensure_composed(cut, db)
            img = _load_cut_image(url)
            if not img:
                continue

            w, h = img.size
            side = min(w, h)
            left = (w - side) // 2
            top  = (h - side) // 2
            cropped = img.crop((left, top, left + side, top + side))
            resized = cropped.resize(CAROUSEL_SIZE, Image.LANCZOS)

            img_buffer = BytesIO()
            resized.save(img_buffer, format="JPEG", quality=95)
            zf.writestr(f"slide_{cut.cut_number:03d}.jpg", img_buffer.getvalue())
            count += 1

    zip_bytes = zip_buffer.getvalue()
    url = upload_image(
        image_bytes=zip_bytes,
        path_prefix=f"episodes/{episode_id}/exports",
        filename=f"ep{episode_id}_carousel.zip",
        mime_type="application/zip",
    )
    return {"download_url": url, "format": "instagram_carousel", "total_slides": count}


async def run_export(episode_id: int, format: str, db: Session) -> dict:
    """포맷에 따라 적절한 Export를 실행한다."""
    exporters = {
        "png_cuts": export_png_cuts,
        "vertical_single": export_vertical_single,
        "instagram_carousel": export_instagram_carousel,
    }
    exporter = exporters.get(format)
    if not exporter:
        return {"error": f"Unknown format: {format}. Use: {list(exporters.keys())}"}
    return exporter(episode_id, db)
