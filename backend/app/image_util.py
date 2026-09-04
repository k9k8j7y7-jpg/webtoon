"""공용 이미지 검증·변환 유틸.

업로드된 파일을 Pillow로 열어 포맷 확인 → EXIF 회전 보정 →
긴 변 2400px 리사이즈 → JPEG q88 로 반환.
"""

import io
import logging
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_LONG_EDGE = 2400
JPEG_QUALITY = 88
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def _try_heic(raw_bytes: bytes) -> Image.Image | None:
    """pillow-heif가 설치돼 있으면 HEIC를 열어 반환, 없으면 None."""
    try:
        import pillow_heif
        heif_file = pillow_heif.read_heif(raw_bytes)
        return Image.frombytes(
            heif_file.mode, heif_file.size, heif_file.data,
            "raw", heif_file.mode, heif_file.stride,
        )
    except ImportError:
        return None
    except Exception:
        return None


def validate_and_process(
    raw_bytes: bytes,
    *,
    original_content_type: str = "",
    original_filename: str = "",
) -> tuple[bytes, str]:
    """업로드된 이미지 바이트를 검증·처리한다.

    Returns:
        (processed_jpeg_bytes, "image/jpeg")

    Raises:
        ValueError: 지원하지 않는 포맷이거나 크기 초과
    """
    # 크기 체크
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(f"파일이 {MAX_UPLOAD_BYTES // (1024*1024)}MB를 초과합니다")

    # 디버깅 로그: content_type 기록
    logger.warning(
        "Image upload: content_type=%s, filename=%s, size=%d bytes",
        original_content_type, original_filename, len(raw_bytes),
    )

    # Pillow로 열기 시도
    img: Image.Image | None = None
    detected_format: str = ""
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img.load()  # 실제 디코딩
        detected_format = img.format or ""
    except Exception:
        img = None

    # JPEG/PNG/WEBP 아닌 경우 HEIC 시도
    if img is None or detected_format not in ALLOWED_FORMATS:
        heic_img = _try_heic(raw_bytes)
        if heic_img is not None:
            img = heic_img
            detected_format = "HEIC"
            logger.warning("HEIC detected and converted via pillow-heif")
        elif img is None:
            # 완전히 열 수 없는 파일
            raise ValueError(
                "이미지를 열 수 없습니다. JPEG, PNG, WEBP 파일을 올려주세요"
            )
        else:
            # Pillow로 열렸지만 허용 포맷이 아님
            if detected_format.upper() in ("HEIF", "HEIC"):
                raise ValueError(
                    "HEIC는 아직 지원하지 않아요. JPEG/PNG로 저장해서 올려주세요"
                )
            raise ValueError(
                f"지원하지 않는 이미지 형식입니다 ({detected_format}). "
                f"JPEG, PNG, WEBP 파일을 올려주세요"
            )

    # RGBA → RGB (JPEG 저장용)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # EXIF 회전 보정
    img = ImageOps.exif_transpose(img)

    # 긴 변 2400px 리사이즈
    w, h = img.size
    long_edge = max(w, h)
    if long_edge > MAX_LONG_EDGE:
        ratio = MAX_LONG_EDGE / long_edge
        new_w = int(w * ratio)
        new_h = int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        logger.warning("Resized %dx%d → %dx%d", w, h, new_w, new_h)

    # JPEG q88로 저장
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), "image/jpeg"
