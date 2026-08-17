from celery import Celery
from app.config import settings

celery_app = Celery(
    "openfoam_webui",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Rome",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=settings.job_timeout_seconds + 600,
    task_soft_time_limit=settings.job_timeout_seconds,
)