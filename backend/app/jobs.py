"""비동기 Job 관리 — API-Spec 9장.

MVP는 BackgroundTasks + 인메모리 저장소로 구현.
추후 Celery + Redis로 교체 가능.
"""

import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

from fastapi import BackgroundTasks


@dataclass
class Job:
    job_id: str
    status: str = "queued"  # queued | processing | completed | completed_partial | failed
    progress: dict = field(default_factory=lambda: {"done": 0, "total": 0})
    result: Any = None
    error: str | None = None
    failed: list = field(default_factory=list)  # 실패한 cut_id 목록
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "failed": self.failed,
        }


# 인메모리 job 저장소 (MVP)
_jobs: dict[str, Job] = {}


def create_job(total: int = 0) -> Job:
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job = Job(
        job_id=job_id,
        progress={"done": 0, "total": total},
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def update_job(job_id: str, **kwargs):
    job = _jobs.get(job_id)
    if job:
        for k, v in kwargs.items():
            setattr(job, k, v)


async def run_job_async(job_id: str, coro: Coroutine):
    """비동기 코루틴을 Job으로 실행한다."""
    job = _jobs.get(job_id)
    if not job:
        return
    job.status = "processing"
    try:
        result = await coro
        job.result = result
        # 부분 실패 시 completed_partial
        if isinstance(result, dict) and result.get("failed"):
            job.status = "completed_partial"
        else:
            job.status = "completed"
    except Exception as e:
        logger.error("Job %s failed: %s", job_id, e, exc_info=True)
        job.error = str(e)
        job.status = "failed"


def run_job_in_background(background_tasks: BackgroundTasks, job_id: str, coro: Coroutine):
    """FastAPI BackgroundTasks에서 비동기 Job을 실행한다."""
    async def wrapper():
        await run_job_async(job_id, coro)

    # BackgroundTasks는 동기 함수만 지원하므로 asyncio.run 사용
    def sync_wrapper():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(wrapper())
        finally:
            loop.close()

    background_tasks.add_task(sync_wrapper)
