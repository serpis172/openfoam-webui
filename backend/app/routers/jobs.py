import asyncio
import json
import time
from pathlib import Path

import redis
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.celery_app import celery_app
from app.config import settings
from app.residuals import parse_latest_residuals
from app.security import safe_join, validate_case_id

router = APIRouter(tags=["jobs"])


class RunRequest(BaseModel):
    case_id: str
    processors: int | None = Field(default=None, ge=1, le=64)


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


def record_run(case_dir: Path, job_id: str, kind: str, processors: int | None):
    """Storico run per il caso: prima c'era solo last_job_id (un job
    singolo), niente storico. RunsTable nel frontend si aspettava una
    lista di run e riceveva invece file di log - crash garantito al
    primo log scritto. Tenuto qui, non in un DB a parte: e' coerente
    col resto (case.json e' gia' la fonte di verita' per i metadati)."""
    meta_file = case_dir / "case.json"
    if not meta_file.exists():
        return

    meta = json.loads(meta_file.read_text())
    meta["last_job_id"] = job_id

    runs = meta.setdefault("runs", [])
    runs.append({
        "job_id": job_id,
        "kind": kind,
        "processors": processors,
        "dispatched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    meta["runs"] = runs[-50:]  # tetto per non far crescere case.json all'infinito

    meta_file.write_text(json.dumps(meta, indent=2))


# Celery ha 4 stati grezzi (PENDING/STARTED/SUCCESS/FAILURE, + REVOKED
# su cancel); il frontend vuole una granularita' piu' leggibile legata
# allo step corrente, che run_step() gia' scrive in result.info["step"].
def _map_run_status(celery_state: str, kind: str, step: str | None) -> str:
    if celery_state == "PENDING":
        return "queued"
    if celery_state == "SUCCESS":
        return "completed"
    if celery_state == "FAILURE":
        return "failed"
    if celery_state == "REVOKED":
        return "cancelled"
    if celery_state == "STARTED":
        if kind == "mesh":
            return "meshing"
        if step in ("blockMesh", "snappyHexMesh", "surfaceFeatureExtract", "checkMesh"):
            return "meshing"
        if step == "foamToVTK":
            return "postprocessing"
        return "running"
    return "preparing"


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

    record_run(case_dir, task.id, "run", payload.processors)

    return {
        "job_id": task.id,
        "case_id": payload.case_id,
    }


@router.post("/mesh")
def run_mesh_only(payload: RunRequest):
    """Job leggero: solo mesh + checkMesh + preview WebGL, niente solve.
    Usato dal wizard/workspace per far vedere la mesh prima che l'utente
    si impegni in una run che può durare ore."""
    case_dir = case_dir_or_404(payload.case_id)

    config_file = case_dir / "config.json"
    if not config_file.exists():
        raise HTTPException(status_code=400, detail="Configurazione mancante")

    config = json.loads(config_file.read_text())

    if payload.processors:
        config.setdefault("mesh", {})["processors"] = payload.processors
        config_file.write_text(json.dumps(config, indent=2))

    task = celery_app.send_task(
        "tasks.generate_mesh_only",
        args=[payload.case_id],
    )

    record_run(case_dir, task.id, "mesh", payload.processors)

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


@router.get("/case/{case_id}/runs")
def list_runs(case_id: str):
    """Storico run del caso, stato live per ciascuna (Celery AsyncResult
    non e' persistito da nessuna parte se non lo interroghi tu)."""
    case_dir = case_dir_or_404(case_id)
    meta_file = case_dir / "case.json"

    if not meta_file.exists():
        return {"case_id": case_id, "runs": []}

    meta = json.loads(meta_file.read_text())
    runs = []

    for entry in reversed(meta.get("runs", [])):
        result = celery_app.AsyncResult(entry["job_id"])
        info = result.info if isinstance(result.info, dict) else {}
        step = info.get("step") if isinstance(info, dict) else None

        runs.append({
            "id": entry["job_id"],
            "case_id": case_id,
            "kind": entry.get("kind", "run"),
            "status": _map_run_status(result.state, entry.get("kind", "run"), step),
            "current_step": step,
            "processors": entry.get("processors"),
            "started_at": entry.get("dispatched_at"),
            "finished_at": result.date_done.strftime("%Y-%m-%dT%H:%M:%SZ") if result.date_done else None,
            "error": str(result.info) if result.state == "FAILURE" else None,
        })

    return {"case_id": case_id, "runs": runs}


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


@router.get("/case/{case_id}/mesh-report")
def case_mesh_report(case_id: str):
    """Stats della mesh (celle, non-ortogonalità, skewness, stato del
    preview) scritte subito dopo il meshing, senza aspettare una run
    completa: sono già disponibili anche solo dopo POST /jobs/mesh."""
    case_dir = case_dir_or_404(case_id)
    report_file = case_dir / "postProcessing/mesh_report.json"

    if not report_file.exists():
        return {"case_id": case_id, "mesh_report": None}

    return {
        "case_id": case_id,
        "mesh_report": json.loads(report_file.read_text()),
    }


@router.get("/case/{case_id}/stream")
def case_stream(request: Request, case_id: str):
    case_dir = case_dir_or_404(case_id)

    async def event_stream():
        # ponytail: async + asyncio.sleep, non thread bloccato per client.
        # Disconnect check + tetto ore evita stream orfani infiniti.
        max_iterations = 3600  # ~2h a 2s/iterazione, poi il client rifà GET
        for _ in range(max_iterations):
            if await request.is_disconnected():
                break

            logs = sorted(case_dir.glob("log.*"))
            payload = {"case_id": case_id, "logs": []}

            for log in logs[-3:]:
                lines = log.read_text(errors="ignore").splitlines()
                payload["logs"].append({"name": log.name, "tail": lines[-20:]})

            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")