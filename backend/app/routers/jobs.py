import json
from pathlib import Path

import redis
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.celery_app import celery_app
from app.config import settings
from app.residuals import parse_latest_residuals
from app.security import safe_join, validate_case_id

router = APIRouter(tags=["jobs"])


class RunRequest(BaseModel):
    case_id: str
    processors: int | None = None


def redis_client():
    return redis.Redis.from_url(settings.redis_url)


def case_dir_or_404(case_id: str) -> Path:
    validate_case_id(case_id)
    case_dir = safe_join(settings.cases_root, case_id)

    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Caso non trovato")

    return case_dir


def update_last_job(case_dir: Path, job_id: str):
    meta_file = case_dir / "case.json"
    if meta_file.exists():
        meta = json.loads(meta_file.read_text())
        meta["last_job_id"] = job_id
        meta_file.write_text(json.dumps(meta, indent=2))


@router.post("/run")
def run_case(payload: RunRequest):
    case_dir = case_dir_or_404(payload.case_id)

    config_file = case_dir / "config.json"
    if not config_file.exists():
        raise HTTPException(status_code=400, detail="Configurazione mancante")

    config = json.loads(config_file.read_text())

    if payload.processors:
        config.setdefault("mesh", {})["processors"] = payload.processors
        config_file.write_text(json.dumps(config, indent=2))

    task = celery_app.send_task(
        "tasks.run_openfoam_case",
        args=[payload.case_id],
    )

    update_last_job(case_dir, task.id)

    return {
        "job_id": task.id,
        "case_id": payload.case_id,
    }


@router.get("/{job_id}")
def job_status(job_id: str):
    result = celery_app.AsyncResult(job_id)

    info = result.info if isinstance(result.info, dict) else {"message": str(result.info)}

    return {
        "job_id": job_id,
        "state": result.state,
        "info": info,
    }


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    r = redis_client()
    r.setex(f"cancel:{job_id}", 86400, "1")
    celery_app.control.revoke(job_id, terminate=True, signal="SIGTERM")

    return {
        "job_id": job_id,
        "status": "cancel_requested",
    }


@router.get("/case/{case_id}/residuals")
def case_residuals(case_id: str):
    case_dir = case_dir_or_404(case_id)
    residuals = parse_latest_residuals(case_dir)

    return {
        "case_id": case_id,
        "residuals": residuals,
    }


@router.get("/case/{case_id}/logs")
def case_logs(case_id: str):
    case_dir = case_dir_or_404(case_id)
    logs = []

    for log in sorted(case_dir.glob("log.*")):
        logs.append({
            "name": log.name,
            "size": log.stat().st_size,
        })

    return {
        "case_id": case_id,
        "logs": logs,
    }


@router.get("/case/{case_id}/log/{log_name}")
def case_log_content(case_id: str, log_name: str, tail: int = 200):
    case_dir = case_dir_or_404(case_id)
    log_path = safe_join(case_dir, log_name)

    if not log_path.exists() or not log_path.is_file():
        raise HTTPException(status_code=404, detail="Log non trovato")

    lines = log_path.read_text(errors="ignore").splitlines()

    return {
        "log": log_name,
        "tail": lines[-tail:],
    }


@router.get("/case/{case_id}/report")
def case_report(case_id: str):
    case_dir = case_dir_or_404(case_id)
    report_file = case_dir / "postProcessing/report.json"

    if not report_file.exists():
        return {
            "case_id": case_id,
            "report": None,
        }

    return {
        "case_id": case_id,
        "report": json.loads(report_file.read_text()),
    }


@router.get("/case/{case_id}/stream")
def case_stream(case_id: str):
    case_dir = case_dir_or_404(case_id)

    def event_stream():
        import time

        while True:
            logs = sorted(case_dir.glob("log.*"))
            payload = {
                "case_id": case_id,
                "logs": [],
            }

            for log in logs[-3:]:
                lines = log.read_text(errors="ignore").splitlines()
                payload["logs"].append({
                    "name": log.name,
                    "tail": lines[-20:],
                })

            yield f"data: {json.dumps(payload)}\n\n"
            time.sleep(2)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
    )