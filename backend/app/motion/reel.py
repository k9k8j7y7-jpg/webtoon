"""릴스 영상 파이프라인 — 컷 이어붙이기 9:16 MP4.

흐름:
  1. 각 컷 → 말풍선 합성(Pillow overlay) → 원본 해상도 PNG/mp4
  2. 영상 컷(motion selected): export_path 재사용 / 정지 컷: zoompan 3초 클립
  3. 각 클립 → 1080×1920 blurred pillarbox 변환
  4. 끝 크레딧 1초 클립
  5. concat demuxer → 최종 릴스 mp4 (H.264 30fps AAC 무음 faststart)
"""

import hashlib
import io
import json
import logging
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import get_settings
from app.storage import LOCAL_STORAGE_DIR

logger = logging.getLogger(__name__)
settings = get_settings()

REEL_W, REEL_H = 1080, 1920
REEL_FPS = 30
STILL_DURATION = 3.0
CREDIT_DURATION = 1.0


def _load_local(url: str) -> Path | None:
    if not url or not url.startswith("/storage/"):
        return None
    p = Path(LOCAL_STORAGE_DIR) / url.replace("/storage/", "")
    return p if p.exists() else None


def _compose_still_with_bubbles(cut_spec: dict, image_path: Path) -> bytes:
    """원본 이미지 위에 말풍선·내레이션을 합성한 PNG 바이트 반환."""
    from app.composition.service import compose_dialogue_on_image

    base = Image.open(image_path).convert("RGBA")
    dialogue = cut_spec.get("dialogue", [])
    if dialogue:
        composed = compose_dialogue_on_image(base, dialogue, cut_spec)
    else:
        composed = base.convert("RGB")
    buf = io.BytesIO()
    composed.save(buf, "PNG")
    return buf.getvalue()


def _make_still_clip(png_bytes: bytes, dst: str, duration: float = STILL_DURATION) -> bool:
    """정지 이미지 → blurred pillarbox 1080×1920 → zoompan(1.0→1.05) 클립."""
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(png_bytes)
        tmp_path = tmp.name
    try:
        total_frames = int(duration * REEL_FPS)
        # 1단계: blurred pillarbox로 1080×1920 이미지 생성
        # 2단계: zoompan으로 미세 줌인 애니메이션
        vf = (
            # pillarbox: 원본→확대+블러 배경, 원본→축소 중앙 배치
            f"split[bg][fg];"
            f"[bg]scale={REEL_W}:{REEL_H}:force_original_aspect_ratio=increase,"
            f"crop={REEL_W}:{REEL_H},boxblur=25:5[blurred];"
            f"[fg]scale={REEL_W}:{REEL_H}:force_original_aspect_ratio=decrease[scaled];"
            f"[blurred][scaled]overlay=(W-w)/2:(H-h)/2,"
            # zoompan: 미세 줌인
            f"zoompan=z='min(zoom+0.0006,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={total_frames}:s={REEL_W}x{REEL_H}:fps={REEL_FPS}"
        )
        cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", tmp_path,
            "-vf", vf,
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-an",
            dst,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            logger.error("Still clip ffmpeg failed: %s", r.stderr[:500])
            return False
        return True
    finally:
        os.unlink(tmp_path)


def _make_blurred_pillarbox(src: str, dst: str) -> bool:
    """원본 해상도 mp4/png → 1080×1920 blurred pillarbox mp4."""
    vf = (
        f"split[bg][fg];"
        f"[bg]scale={REEL_W}:{REEL_H}:force_original_aspect_ratio=increase,"
        f"crop={REEL_W}:{REEL_H},boxblur=25:5[blurred];"
        f"[fg]scale={REEL_W}:{REEL_H}:force_original_aspect_ratio=decrease[scaled];"
        f"[blurred][scaled]overlay=(W-w)/2:(H-h)/2"
    )
    cmd = [
        "ffmpeg", "-y", "-i", src,
        "-vf", vf,
        "-r", str(REEL_FPS),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-an",
        dst,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        logger.error("Pillarbox ffmpeg failed: %s", r.stderr[:500])
        return False
    return True


def _make_credit_clip(nickname: str, dst: str, duration: float = CREDIT_DURATION) -> bool:
    """검정 배경 크레딧 1초 클립."""
    img = Image.new("RGB", (REEL_W, REEL_H), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    text = f"\u00A9 {nickname or '작가'} \u00B7 EziToon"
    font_size = max(24, int(REEL_W * 0.028))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((REEL_W - tw) // 2, (REEL_H - th) // 2), text, fill=(255, 255, 255), font=font)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        img.save(tmp, "PNG")
        tmp_path = tmp.name
    try:
        cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", tmp_path,
            "-t", str(duration), "-r", str(REEL_FPS),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-an",
            dst,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return r.returncode == 0
    finally:
        os.unlink(tmp_path)


def _compute_source_hash(cuts: list[dict]) -> str:
    """컷 image_url + motion.selected 기반 해시 → stale 판정용."""
    parts = []
    for c in cuts:
        parts.append(c.get("image_url", ""))
        m = c.get("motion") or {}
        parts.append(m.get("selected") or "")
        parts.append(m.get("export_path") or "")
    return hashlib.md5("|".join(parts).encode()).hexdigest()[:12]


async def generate_reel(
    episode_id: int,
    project_id: int,
    user_id: int,
    nickname: str,
    job_id: str,
) -> dict:
    """릴스 생성 파이프라인. BackgroundTasks에서 실행."""
    from app.database import SessionLocal
    from app.storyboard.models import Cut, GenerationLog
    from app.projects.models import Episode
    from app.social.service import notify
    from app.packets.service import refund_packets
    from app.jobs import get_job
    from sqlalchemy.orm.attributes import flag_modified

    job = get_job(job_id)

    try:
        db = SessionLocal()
        try:
            cuts = (
                db.query(Cut)
                .filter(Cut.episode_id == episode_id, Cut.image_url.isnot(None))
                .order_by(Cut.cut_number)
                .all()
            )
            if not cuts:
                raise ValueError("이미지가 있는 컷이 없어요")

            cut_data = []
            for c in cuts:
                spec = c.spec or {}
                motion = spec.get("motion", {})
                cut_data.append({
                    "cut_id": c.cut_id,
                    "cut_number": c.cut_number,
                    "image_url": c.image_url,
                    "spec": spec,
                    "motion_selected": motion.get("selected"),
                    "motion_export_path": motion.get("export_path"),
                })

            episode = db.query(Episode).filter(Episode.id == episode_id).first()
            source_hash = _compute_source_hash(cut_data)
        finally:
            db.close()

        total = len(cut_data) + 1  # +1 for credit
        if job:
            job.progress = {"done": 0, "total": total, "stage": "preparing clips"}

        with tempfile.TemporaryDirectory() as tmpdir:
            clip_paths = []

            for i, cd in enumerate(cut_data):
                if job:
                    job.progress["stage"] = f"clip {i+1}/{len(cut_data)}"

                clip_916 = os.path.join(tmpdir, f"clip_{i:03d}_916.mp4")

                # 영상 컷(motion export 있음) → export mp4 재사용
                if cd["motion_export_path"]:
                    export_local = _load_local(cd["motion_export_path"])
                    if export_local:
                        if not _make_blurred_pillarbox(str(export_local), clip_916):
                            raise RuntimeError(f"Pillarbox failed for motion cut {cd['cut_id']}")
                        clip_paths.append(clip_916)
                        if job:
                            job.progress["done"] = i + 1
                        continue

                # 정지 컷 → 말풍선 합성 → zoompan → pillarbox
                img_local = _load_local(cd["image_url"])
                if not img_local:
                    raise FileNotFoundError(f"Image not found: {cd['image_url']}")

                composed_png = _compose_still_with_bubbles(cd["spec"], img_local)

                still_clip = os.path.join(tmpdir, f"clip_{i:03d}_still.mp4")
                if not _make_still_clip(composed_png, still_clip):
                    raise RuntimeError(f"Still clip failed for {cd['cut_id']}")

                # zoompan이 이미 REEL 해상도로 출력하므로 pillarbox 불필요할 수 있지만
                # 비율이 정확히 9:16이 아닌 경우 대비
                # → zoompan 출력이 이미 1080x1920이면 복사, 아니면 pillarbox
                clip_paths.append(still_clip)
                if job:
                    job.progress["done"] = i + 1

            # 크레딧 클립
            if job:
                job.progress["stage"] = "credit"
            credit_clip = os.path.join(tmpdir, "credit.mp4")
            _make_credit_clip(nickname, credit_clip)
            clip_paths.append(credit_clip)
            if job:
                job.progress["done"] = total

            # concat demuxer
            if job:
                job.progress["stage"] = "concat"
            concat_list = os.path.join(tmpdir, "concat.txt")
            with open(concat_list, "w") as f:
                for p in clip_paths:
                    f.write(f"file '{p}'\n")

            reel_tmp = os.path.join(tmpdir, "reel.mp4")
            # concat → 리인코딩 (클립 해상도 통일 보장)
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", concat_list,
                "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-r", str(REEL_FPS),
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "32k",
                "-shortest",
                "-movflags", "+faststart",
                reel_tmp,
            ]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if r.returncode != 0:
                logger.error("Concat failed: %s", r.stderr[:500])
                raise RuntimeError("릴스 이어붙이기 실패")

            reel_bytes = Path(reel_tmp).read_bytes()

        # 저장
        db2 = SessionLocal()
        try:
            ep = db2.query(Episode).filter(Episode.id == episode_id).first()
            gs = dict(ep.gate_status or {})
            old_reel = gs.get("reel", {})
            version = (old_reel.get("version") or 0) + 1

            reel_key = f"episodes/{episode_id}/reel/reel_v{version}.mp4"
            reel_local = Path(LOCAL_STORAGE_DIR) / reel_key
            reel_local.parent.mkdir(parents=True, exist_ok=True)
            reel_local.write_bytes(reel_bytes)
            reel_url = f"/storage/{reel_key}"

            gs["reel"] = {
                "path": reel_url,
                "version": version,
                "status": "done",
                "source_hash": source_hash,
                "cut_count": len(cut_data),
                "duration_sec": round(len(cut_data) * STILL_DURATION + CREDIT_DURATION, 1),
                "size_kb": len(reel_bytes) // 1024,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            ep.gate_status = gs
            flag_modified(ep, "gate_status")

            # generation_log
            log = GenerationLog(
                cut_id=None,
                episode_id=episode_id,
                project_id=project_id,
                user_id=user_id,
                kind="cut",
                model="ffmpeg-reel",
                model_tier="flash",
                cost_usd=0,
                packets_charged=1,
            )
            db2.add(log)

            notify(
                db=db2,
                user_id=user_id,
                type="reel_done",
                title="릴스 영상이 완성됐어요",
                body=f"{len(cut_data)}컷 · {gs['reel']['duration_sec']}초",
                link=f"/projects/{project_id}/episodes/{episode_id}/workflow?gate=5",
            )

            db2.commit()
            logger.info("Reel done: %s (%d KB, %d cuts)", reel_url, len(reel_bytes) // 1024, len(cut_data))
        finally:
            db2.close()

        return {"status": "done", "path": reel_url, "version": version}

    except Exception as e:
        logger.error("Reel pipeline failed: %s", e, exc_info=True)

        db3 = SessionLocal()
        try:
            refund_packets(user_id, 1, None, db3)

            ep = db3.query(Episode).filter(Episode.id == episode_id).first()
            if ep:
                gs = dict(ep.gate_status or {})
                gs["reel"] = {"status": "failed", "error": str(e)[:200]}
                ep.gate_status = gs
                flag_modified(ep, "gate_status")

            notify(
                db=db3,
                user_id=user_id,
                type="reel_done",
                title="릴스 생성에 실패해 패킷을 돌려드렸어요",
                body=str(e)[:100],
                link=f"/projects/{project_id}/episodes/{episode_id}/workflow?gate=5",
            )
            db3.commit()
        finally:
            db3.close()

        return {"status": "failed", "error": str(e)}
