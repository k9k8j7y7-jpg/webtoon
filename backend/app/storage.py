"""S3 스토리지 서비스 — Tech-Stack 5장.

이미지(캐릭터 시트·장소 레퍼런스·컷 이미지) 저장.
AWS 자격증명이 없으면 로컬 파일 시스템으로 폴백.
"""

import os
import uuid
from pathlib import Path

import boto3
from botocore.exceptions import NoCredentialsError

from app.config import get_settings

settings = get_settings()

LOCAL_STORAGE_DIR = "/home/bitnami/project-t/storage"


def _get_s3_client():
    if not settings.AWS_ACCESS_KEY_ID:
        return None
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


def upload_image(
    image_bytes: bytes,
    path_prefix: str,
    filename: str | None = None,
    mime_type: str = "image/png",
) -> str:
    """이미지를 S3(또는 로컬)에 업로드하고 URL을 반환한다."""
    ext = "png" if "png" in mime_type else "jpg"
    if filename is None:
        filename = f"{uuid.uuid4().hex}.{ext}"

    key = f"{path_prefix}/{filename}"

    s3 = _get_s3_client()
    if s3:
        try:
            s3.put_object(
                Bucket=settings.S3_BUCKET,
                Key=key,
                Body=image_bytes,
                ContentType=mime_type,
            )
            return f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
        except NoCredentialsError:
            pass

    # 로컬 폴백
    local_path = Path(LOCAL_STORAGE_DIR) / key
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(image_bytes)
    return f"/storage/{key}"
