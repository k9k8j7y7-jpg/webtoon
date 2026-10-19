"""모션 웹툰 파이프라인 — 컷 이미지 → 3초 루프 영상.

흐름: 입력 준비(패딩) → Veo 생성(후보 N개 순차) → 트림·크롭(ffmpeg/moviepy)
     → 비전 검사(Gemini flash) → 탈락 시 1회 재생성 → 완료/실패 + 알림
"""

import asyncio
import base64
import io
import json
import logging
import os
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from PIL import Image

from app.config import get_settings
from app.storage import upload_image, LOCAL_STORAGE_DIR
from app.motion.prompts import build_motion_prompt, VISION_CHECK_PROMPT

logger = logging.getLogger(__name__)
settings = get_settings()

# 서버 전역 동시 생성 제한
_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.MOTION_CONCURRENCY)
    return _semaphore


# ── 패딩 ──────────────────────────────────────────────────────

def _pad_to_aspect(image_bytes: bytes, target_aspect: str) -> tuple[bytes, dict]:
    """컷 이미지를 Veo 지원 비율(16:9 또는 9:16)로 패딩.

    Returns: (padded_png_bytes, crop_info)
        crop_info = {pad_left, pad_top, orig_w, orig_h, canvas_w, canvas_h, veo_aspect}
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w, h = img.size

    # Veo lite는 16:9와 9:16만 지원
    # 세로(9:16, 3:4) → 9:16, 가로(16:9, 4:3) → 16:9, 1:1 → 16:9 패딩→크롭
    if target_aspect in ("9:16", "3:4"):
        veo_aspect = "9:16"
        target_ratio = 9 / 16  # 0.5625
    else:
        veo_aspect = "16:9"
        target_ratio = 16 / 9  # 1.7778

    current_ratio = w / h

    if abs(current_ratio - target_ratio) < 0.01:
        # 이미 맞음
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return buf.getvalue(), {
            "pad_left": 0, "pad_top": 0,
            "orig_w": w, "orig_h": h,
            "canvas_w": w, "canvas_h": h,
            "veo_aspect": veo_aspect,
        }

    if current_ratio < target_ratio:
        # 세로가 길다 → 좌우 패딩
        new_w = round(h * target_ratio)
        if new_w % 2 == 1:
            new_w += 1
        new_h = h
        pad_left = (new_w - w) // 2
        pad_top = 0
    else:
        # 가로가 길다 → 상하 패딩
        new_h = round(w / target_ratio)
        if new_h % 2 == 1:
            new_h += 1
        new_w = w
        pad_left = 0
        pad_top = (new_h - h) // 2

    canvas = Image.new("RGB", (new_w, new_h), (255, 255, 255))
    # 가장자리 색 확장
    rgb_img = img.convert("RGB")
    for y in range(h):
        lc = rgb_img.getpixel((0, y))
        rc = rgb_img.getpixel((w - 1, y))
        for x in range(pad_left):
            canvas.putpixel((x, y + pad_top), lc)
        for x in range(pad_left + w, new_w):
            canvas.putpixel((x, y + pad_top), rc)
    for x in range(new_w):
        tc = rgb_img.getpixel((min(x - pad_left, w - 1) if x >= pad_left else 0, 0))
        bc = rgb_img.getpixel((min(x - pad_left, w - 1) if x >= pad_left else 0, h - 1))
        for y in range(pad_top):
            canvas.putpixel((x, y), tc)
        for y in range(pad_top + h, new_h):
            canvas.putpixel((x, y), bc)

    canvas.paste(img, (pad_left, pad_top), img)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue(), {
        "pad_left": pad_left, "pad_top": pad_top,
        "orig_w": w, "orig_h": h,
        "canvas_w": new_w, "canvas_h": new_h,
        "veo_aspect": veo_aspect,
    }


# ── Veo API 호출 ─────────────────────────────────────────────

async def _call_veo(image_bytes: bytes, prompt: str, veo_aspect: str) -> bytes | None:
    """Veo lite predictLongRunning → 폴링 → mp4 바이트 반환."""
    b64 = base64.b64encode(image_bytes).decode()
    api_key = settings.GEMINI_API_KEY
    model = settings.VIDEO_MODEL

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning?key={api_key}"
    body = {
        "instances": [{
            "image": {"bytesBase64Encoded": b64, "mimeType": "image/png"},
            "prompt": prompt,
        }],
        "parameters": {
            "sampleCount": 1,
            "durationSeconds": 4,
            "aspectRatio": veo_aspect,
            "personGeneration": "allow_all",
        },
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body)
        if resp.status_code != 200:
            logger.error("Veo start failed: %d %s", resp.status_code, resp.text[:300])
            return None
        op_name = resp.json().get("name")
        if not op_name:
            logger.error("Veo: no operation name")
            return None
        logger.info("Veo op started: %s", op_name)

    poll_url = f"https://generativelanguage.googleapis.com/v1beta/{op_name}?key={api_key}"
    t0 = time.time()
    async with httpx.AsyncClient(timeout=30) as client:
        while time.time() - t0 < 300:
            await asyncio.sleep(5)
            try:
                pr = await client.get(poll_url)
            except Exception:
                continue
            if pr.status_code != 200:
                continue
            st = pr.json()
            if st.get("done"):
                # 에러 응답 체크 (안전 필터 등)
                if st.get("error"):
                    err = st["error"]
                    logger.error("Veo op error: code=%s msg=%s", err.get("code"), err.get("message", "")[:200])
                    return None
                resp_data = st.get("response", {})
                # 안전 필터 거부 사유 로깅
                rai = resp_data.get("raiMediaFilteredCount")
                if rai:
                    logger.warning("Veo: %d samples filtered by safety", rai)
                samples = (
                    resp_data.get("generateVideoResponse", {}).get("generatedSamples", [])
                    or resp_data.get("predictions", [])
                )
                if not samples:
                    logger.error("Veo: no samples in response (full: %s)", json.dumps(resp_data)[:500])
                    return None
                uri = samples[0].get("video", {}).get("uri") or samples[0].get("uri")
                if not uri:
                    logger.error("Veo: no video URI")
                    return None
                # 영상 다운로드
                dl = await client.get(uri, headers={"x-goog-api-key": api_key}, timeout=120)
                if dl.status_code == 200 and len(dl.content) > 1000:
                    elapsed = time.time() - t0
                    logger.info("Veo done: %.1fs, %d KB", elapsed, len(dl.content) // 1024)
                    return dl.content
                logger.error("Veo download failed: %d, %d bytes", dl.status_code, len(dl.content))
                return None

    logger.error("Veo timeout (300s)")
    return None


# ── 트림·크롭 (ffmpeg subprocess) ────────────────────────────

def _trim_and_crop(
    mp4_bytes: bytes,
    crop_info: dict,
    clip_sec: float,
) -> bytes | None:
    """16:9/9:16 mp4 → 원본 비율 크롭 + 앞 N초 트림. ffmpeg CLI 직접 호출."""
    with tempfile.TemporaryDirectory() as tmpdir:
        src = os.path.join(tmpdir, "src.mp4")
        dst = os.path.join(tmpdir, "out.mp4")
        with open(src, "wb") as f:
            f.write(mp4_bytes)

        pad_left = crop_info["pad_left"]
        pad_top = crop_info["pad_top"]
        orig_w = crop_info["orig_w"]
        orig_h = crop_info["orig_h"]
        canvas_w = crop_info["canvas_w"]
        canvas_h = crop_info["canvas_h"]

        # ffprobe로 실제 영상 해상도 얻기
        probe_cmd = [
            "ffprobe", "-v", "quiet", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "json", src,
        ]
        try:
            probe = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
            info = json.loads(probe.stdout)
            vid_w = info["streams"][0]["width"]
            vid_h = info["streams"][0]["height"]
        except Exception as e:
            logger.error("ffprobe failed: %s", e)
            return None

        # 크롭 좌표 계산 (비율 기반)
        scale_x = vid_w / canvas_w
        scale_y = vid_h / canvas_h
        crop_x = round(pad_left * scale_x)
        crop_y = round(pad_top * scale_y)
        crop_w = round(orig_w * scale_x)
        crop_h = round(orig_h * scale_y)

        # 짝수 보정 (H.264 요구)
        crop_w = crop_w - (crop_w % 2)
        crop_h = crop_h - (crop_h % 2)

        # 패딩 없으면 크롭 스킵
        needs_crop = pad_left > 0 or pad_top > 0

        vf = []
        if needs_crop:
            vf.append(f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}")

        cmd = [
            "ffmpeg", "-y", "-i", src,
            "-t", str(clip_sec),
            "-an",  # 무음
        ]
        if vf:
            cmd += ["-vf", ",".join(vf)]
        cmd += [
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-movflags", "+faststart",
            dst,
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                logger.error("ffmpeg failed: %s", result.stderr[:500])
                return None
        except Exception as e:
            logger.error("ffmpeg exception: %s", e)
            return None

        return Path(dst).read_bytes()


# ── 비전 검사 (Gemini flash — 격자 몬타주 방식) ──────────────

# 검사 프레임 타임스탬프 (5장)
_CHECK_TIMESTAMPS = [0.3, 1.0, 1.8, 2.5, 2.9]


def _extract_frames(mp4_bytes: bytes, timestamps: list[float]) -> list:
    """mp4에서 특정 타임스탬프의 프레임을 PIL Image로 추출."""
    pil_frames = []
    with tempfile.TemporaryDirectory() as tmpdir:
        src = os.path.join(tmpdir, "src.mp4")
        with open(src, "wb") as f:
            f.write(mp4_bytes)

        for i, ts in enumerate(timestamps):
            out = os.path.join(tmpdir, f"frame_{i}.jpg")
            cmd = [
                "ffmpeg", "-y", "-ss", str(ts), "-i", src,
                "-vframes", "1", "-q:v", "2", out,
            ]
            try:
                subprocess.run(cmd, capture_output=True, timeout=10)
                if os.path.exists(out):
                    pil_frames.append(Image.open(out).copy())
            except Exception:
                pass
    return pil_frames


def _compose_montage(original_img: Image.Image, frame_imgs: list) -> bytes:
    """원본 + N프레임을 2행×3열 격자로 합성.

    레이아웃:
      [ORIGINAL] [F1] [F2]
      [F3]       [F4] [F5]
    각 셀에 라벨 표시.
    """
    cell_w, cell_h = 400, 400
    gap = 4
    cols, rows = 3, 2

    canvas_w = cols * cell_w + (cols - 1) * gap
    canvas_h = rows * cell_h + (rows - 1) * gap
    canvas = Image.new("RGB", (canvas_w, canvas_h), (30, 30, 30))

    from PIL import ImageDraw, ImageFont

    all_imgs = [original_img] + frame_imgs
    labels = ["ORIGINAL"] + [f"F{i+1}" for i in range(len(frame_imgs))]

    for idx, (img, label) in enumerate(zip(all_imgs, labels)):
        r, c = divmod(idx, cols)
        x = c * (cell_w + gap)
        y = r * (cell_h + gap)
        resized = img.resize((cell_w, cell_h), Image.LANCZOS)
        canvas.paste(resized, (x, y))

        draw = ImageDraw.Draw(canvas)
        draw.rectangle([x, y, x + 70, y + 22], fill=(0, 0, 0))
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14)
        except Exception:
            try:
                font = ImageFont.truetype("arial.ttf", 14)
            except Exception:
                font = ImageFont.load_default()
        draw.text((x + 4, y + 3), label, fill=(255, 255, 0), font=font)

    buf = io.BytesIO()
    canvas.save(buf, "PNG", quality=95)
    return buf.getvalue()


async def _vision_check(
    original_image: bytes,
    video_mp4: bytes,
    clip_sec: float,
) -> dict:
    """Gemini flash 비전 — 격자 몬타주로 손·동물·캐릭터 검사.

    원본+5프레임을 한 장의 2×3 격자로 합쳐 한 번에 보냄.
    프레임별 hands_ok·identity_ok를 받아 하나라도 실패면 탈락.

    Returns: {hands_ok: bool, same_character: bool, note: str, raw: dict}
    """
    # 프레임 추출 (5장)
    timestamps = [t for t in _CHECK_TIMESTAMPS if t < clip_sec]
    if not timestamps:
        timestamps = [0.1]
    frame_imgs = _extract_frames(video_mp4, timestamps)

    if len(frame_imgs) < 2:
        return {"hands_ok": False, "same_character": False, "note": "frame extraction failed", "raw": {}}

    # 몬타주 합성
    original_img = Image.open(io.BytesIO(original_image))
    montage_bytes = _compose_montage(original_img, frame_imgs)

    # Gemini flash 호출 — 한 장 이미지 + 격자 프롬프트
    api_key = settings.GEMINI_API_KEY
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

    parts = [
        {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(montage_bytes).decode()}},
        {"text": VISION_CHECK_PROMPT},
    ]
    body = {"contents": [{"parts": parts}]}

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(url, json=body)
            if resp.status_code != 200:
                logger.error("Vision check API error: %d", resp.status_code)
                return {"hands_ok": True, "same_character": True, "note": "vision API error, passed by default", "raw": {}}

            text = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                text = text.rsplit("```", 1)[0]
            raw = json.loads(text)

            # 프레임별 판정 파싱
            frames = raw.get("frames", [])
            any_hands_fail = any(not f.get("hands_ok", True) for f in frames)
            any_identity_fail = any(not f.get("identity_ok", True) for f in frames)

            hands_ok = not any_hands_fail
            same_char = not any_identity_fail

            notes = [f.get("note", "") for f in frames if f.get("note")]
            note = "; ".join(notes)[:200] if notes else ""

            return {
                "hands_ok": hands_ok,
                "same_character": same_char,
                "note": note,
                "raw": raw,
            }
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        logger.warning("Vision check parse error: %s", e)
        return {"hands_ok": True, "same_character": True, "note": f"parse error: {e}", "raw": {}}
    except Exception as e:
        logger.error("Vision check exception: %s", e)
        return {"hands_ok": True, "same_character": True, "note": f"exception: {e}", "raw": {}}


# ── 스토리지 ─────────────────────────────────────────────────

def _save_video(mp4_bytes: bytes, episode_id: int, cut_id: str, candidate_idx: int, version: int) -> str:
    """mp4를 스토리지에 저장하고 URL 반환."""
    filename = f"{cut_id}_motion_c{candidate_idx}_v{version}.mp4"
    key = f"episodes/{episode_id}/cuts/motion/{filename}"

    local_path = Path(LOCAL_STORAGE_DIR) / key
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(mp4_bytes)

    return f"/storage/{key}"


def _delete_video_files(episode_id: int, cut_id: str) -> int:
    """해당 컷의 모든 motion 파일 삭제. 삭제된 파일 수 반환."""
    motion_dir = Path(LOCAL_STORAGE_DIR) / f"episodes/{episode_id}/cuts/motion"
    if not motion_dir.exists():
        return 0
    count = 0
    for f in motion_dir.glob(f"{cut_id}_motion_*"):
        f.unlink(missing_ok=True)
        count += 1
    return count


# ── 말풍선 오버레이 합성 export ─────────────────────────────

def generate_export_mp4(cut_id: str, episode_id: int) -> str | None:
    """선택된 motion mp4 위에 말풍선·내레이션·효과를 합성한 export mp4를 생성.

    1. 컷의 원본 이미지 크기로 투명 PNG 오버레이 렌더 (Pillow compose)
    2. ffmpeg overlay 필터로 영상 위에 합성
    3. storage에 저장 → export_path 반환
    """
    from app.database import SessionLocal
    from app.storyboard.models import Cut
    from app.composition.service import compose_dialogue_on_image

    db = SessionLocal()
    try:
        cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
        if not cut:
            return None

        spec = cut.spec or {}
        motion = spec.get("motion", {})
        selected_id = motion.get("selected")
        if not selected_id:
            return None

        # 선택된 후보의 mp4 경로
        sel = None
        for c in motion.get("candidates", []):
            if c["id"] == selected_id:
                sel = c
                break
        if not sel or not sel.get("path"):
            return None

        video_path = sel["path"]
        if video_path.startswith("/storage/"):
            video_local = Path(LOCAL_STORAGE_DIR) / video_path.replace("/storage/", "")
        else:
            return None
        if not video_local.exists():
            return None

        # 원본 이미지로 오버레이 크기 결정
        if not cut.image_url:
            return None
        img_local = Path(LOCAL_STORAGE_DIR) / cut.image_url.replace("/storage/", "")
        if not img_local.exists():
            return None

        base_img = Image.open(img_local).convert("RGBA")
        img_w, img_h = base_img.size

        dialogue = spec.get("dialogue", [])
        if not dialogue:
            # 대사 없으면 원본 mp4 그대로 사용
            return video_path

        # 투명 RGBA 오버레이만 렌더 (말풍선·내레이션·효과)
        transparent_bg = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
        overlay_img = compose_dialogue_on_image(transparent_bg, dialogue, spec, return_overlay=True)

        # 오버레이 PNG 임시 파일
        with tempfile.TemporaryDirectory() as tmpdir:
            overlay_png = os.path.join(tmpdir, "overlay.png")
            overlay_img.save(overlay_png, "PNG")

            export_mp4 = os.path.join(tmpdir, "export.mp4")

            # ffmpeg: 영상을 이미지 크기로 스케일 + 투명 PNG 오버레이
            # 영상과 이미지 해상도가 다를 수 있으므로 (Veo 720p 등) 스케일 후 합성
            cmd = [
                "ffmpeg", "-y",
                "-i", str(video_local),
                "-i", overlay_png,
                "-filter_complex",
                f"[0:v]scale={img_w}:{img_h}[v];[v][1:v]overlay=0:0",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-an", "-movflags", "+faststart",
                export_mp4,
            ]

            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode != 0:
                    logger.error("Export ffmpeg failed: %s", result.stderr[:500])
                    return None
            except Exception as e:
                logger.error("Export ffmpeg exception: %s", e)
                return None

            export_bytes = Path(export_mp4).read_bytes()

        # 저장
        export_filename = f"{cut_id}_motion_export.mp4"
        export_key = f"episodes/{episode_id}/cuts/motion/{export_filename}"
        local_out = Path(LOCAL_STORAGE_DIR) / export_key
        local_out.parent.mkdir(parents=True, exist_ok=True)
        local_out.write_bytes(export_bytes)
        export_url = f"/storage/{export_key}"

        # spec 업데이트
        spec["motion"]["export_path"] = export_url
        cut.spec = spec
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(cut, "spec")
        db.commit()

        logger.info("Export mp4 generated: %s (%d KB)", export_url, len(export_bytes) // 1024)
        return export_url
    finally:
        db.close()


# ── 메인 파이프라인 ──────────────────────────────────────────

async def run_motion_pipeline(
    cut_id: str,
    episode_id: int,
    project_id: int,
    user_id: int,
    subject_descs: list[str],
    intensity: str,
    job_id: str,
    aspect_ratio: str,
    image_url: str,
) -> dict:
    """모션 생성 파이프라인. BackgroundTasks에서 실행.

    Returns: {"status": "done"|"failed", "candidates": [...], "error": str|None}
    """
    from app.database import SessionLocal
    from app.jobs import get_job
    from app.social.service import notify
    from app.push.service import send_push

    job = get_job(job_id)
    candidates = []
    version = 1

    try:
        # 1. 입력 이미지 로드
        if image_url.startswith("/storage/"):
            local_path = Path(LOCAL_STORAGE_DIR) / image_url.replace("/storage/", "")
            if not local_path.exists():
                raise FileNotFoundError(f"Image not found: {image_url}")
            original_bytes = local_path.read_bytes()
        else:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(image_url)
                if resp.status_code != 200:
                    raise FileNotFoundError(f"Image download failed: {image_url}")
                original_bytes = resp.content

        # 2. 패딩
        padded_bytes, crop_info = _pad_to_aspect(original_bytes, aspect_ratio)
        veo_aspect = crop_info["veo_aspect"]

        # 3. 프롬프트
        prompt = build_motion_prompt(subject_descs, intensity)
        logger.info("Motion prompt: %s", prompt[:200])

        # 4. 후보 생성 (순차, 세마포어)
        sem = _get_semaphore()
        num_candidates = settings.MOTION_CANDIDATES

        for ci in range(1, num_candidates + 1):
            if job:
                job.progress = {"done": 0, "total": num_candidates, "stage": f"generating candidate {ci}/{num_candidates}"}

            candidate = await _generate_one_candidate(
                padded_bytes=padded_bytes,
                prompt=prompt,
                veo_aspect=veo_aspect,
                crop_info=crop_info,
                original_bytes=original_bytes,
                episode_id=episode_id,
                cut_id=cut_id,
                candidate_idx=ci,
                version=version,
                sem=sem,
            )
            candidates.append(candidate)

            if job:
                job.progress["done"] = ci

        # 5. 전부 실패 판정 — path가 있는 후보가 하나도 없으면 실패 처리
        all_failed = all(c.get("path") is None for c in candidates)
        if all_failed:
            raise RuntimeError("모든 후보 생성에 실패했어요 (Veo 안전 필터 또는 API 오류)")

        # 6. 결과 저장 + 알림
        db = SessionLocal()
        try:
            from app.storyboard.models import Cut, GenerationLog
            cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
            if not cut:
                raise ValueError(f"Cut not found: {cut_id}")

            spec = dict(cut.spec)
            motion = spec.get("motion", {})
            motion["candidates"] = candidates
            motion["status"] = "done"
            motion["selected"] = None
            motion["updated_at"] = datetime.now(timezone.utc).isoformat()
            spec["motion"] = motion
            cut.spec = spec
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(cut, "spec")

            # generation_log
            log = GenerationLog(
                cut_id=cut_id,
                episode_id=episode_id,
                project_id=project_id,
                user_id=user_id,
                kind="cut",  # motion은 아직 ENUM에 없으므로 cut 사용
                model=settings.VIDEO_MODEL,
                model_tier="flash",
                cost_usd=0.40,  # lite $0.05/s × 4s × 2 candidates
                packets_charged=settings.MOTION_PACKETS,
            )
            db.add(log)

            # 알림
            cut_number = cut.cut_number or 0
            n = notify(
                db=db,
                user_id=user_id,
                type="motion_done",
                title=f"{cut_number}번 컷 영상이 완성됐어요",
                body="후보 2개를 비교해서 골라보세요",
                link=f"/projects/{project_id}/episodes/{episode_id}/workflow?gate=5&cut={cut_id}",
            )

            db.commit()
            try:
                send_push([user_id], "motion_done", f"{cut_number}번 컷 영상이 완성됐어요",
                          "후보 2개를 비교해서 골라보세요",
                          f"/projects/{project_id}/episodes/{episode_id}/workflow?gate=5&cut={cut_id}",
                          n.id if n else None)
            except Exception:
                logger.warning("motion_done push failed", exc_info=True)
        finally:
            db.close()

        return {"status": "done", "candidates": candidates}

    except Exception as e:
        logger.error("Motion pipeline failed for cut %s: %s", cut_id, e, exc_info=True)

        # 패킷 환불
        db = SessionLocal()
        try:
            from app.storyboard.models import Cut
            from app.packets.service import refund_packets

            refund_packets(user_id, settings.MOTION_PACKETS, None, db)

            cut = db.query(Cut).filter(Cut.cut_id == cut_id).first()
            if cut:
                spec = dict(cut.spec)
                motion = spec.get("motion", {})
                motion["status"] = "failed"
                motion["error"] = str(e)[:200]
                motion["updated_at"] = datetime.now(timezone.utc).isoformat()
                spec["motion"] = motion
                cut.spec = spec
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(cut, "spec")

            # 실패 알림
            n = notify(
                db=db,
                user_id=user_id,
                type="motion_done",
                title="영상 생성에 실패해 패킷을 돌려드렸어요",
                body=str(e)[:100],
                link=f"/projects/{project_id}/episodes/{episode_id}/workflow?gate=5&cut={cut_id}",
            )

            db.commit()
            try:
                send_push([user_id], "motion_done", "영상 생성에 실패해 패킷을 돌려드렸어요",
                          str(e)[:100],
                          f"/projects/{project_id}/episodes/{episode_id}/workflow?gate=5&cut={cut_id}",
                          n.id if n else None)
            except Exception:
                logger.warning("motion_done push failed", exc_info=True)
        finally:
            db.close()

        return {"status": "failed", "candidates": candidates, "error": str(e)}


async def _generate_one_candidate(
    padded_bytes: bytes,
    prompt: str,
    veo_aspect: str,
    crop_info: dict,
    original_bytes: bytes,
    episode_id: int,
    cut_id: str,
    candidate_idx: int,
    version: int,
    sem: asyncio.Semaphore,
) -> dict:
    """후보 1개 생성 + 트림·크롭 + 비전 검사 + 재생성."""
    candidate = {
        "id": f"c{candidate_idx}",
        "path": None,
        "checks": {"hands_ok": None, "same_char": None, "note": ""},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    for attempt in range(1 + settings.MOTION_MAX_RETRY):
        async with sem:
            raw_mp4 = await _call_veo(padded_bytes, prompt, veo_aspect)

        if raw_mp4 is None:
            candidate["checks"]["note"] = f"Veo API failed (attempt {attempt + 1})"
            continue

        # 트림·크롭
        final_mp4 = _trim_and_crop(raw_mp4, crop_info, settings.MOTION_CLIP_SEC)
        if final_mp4 is None:
            candidate["checks"]["note"] = f"ffmpeg trim/crop failed (attempt {attempt + 1})"
            continue

        # 저장
        video_url = _save_video(final_mp4, episode_id, cut_id, candidate_idx, version)
        candidate["path"] = video_url

        # 비전 검사
        checks = await _vision_check(original_bytes, final_mp4, settings.MOTION_CLIP_SEC)
        candidate["checks"] = {
            "hands_ok": checks["hands_ok"],
            "same_char": checks["same_character"],
            "note": checks["note"],
        }

        if checks["hands_ok"] and checks["same_character"]:
            logger.info("Candidate %s/%d passed checks", cut_id, candidate_idx)
            break
        else:
            logger.warning(
                "Candidate %s/%d failed checks (attempt %d): hands=%s char=%s note=%s",
                cut_id, candidate_idx, attempt + 1,
                checks["hands_ok"], checks["same_character"], checks["note"],
            )
            if attempt < settings.MOTION_MAX_RETRY:
                # 재생성 — 기존 파일은 덮어씀
                continue
            else:
                logger.warning("Candidate %s/%d: max retries, keeping with failed checks", cut_id, candidate_idx)

    return candidate
