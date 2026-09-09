import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.models import CaseConfig, CaseCreate
from app.security import safe_join, validate_case_id
from app.templates_generator import generate_case_files

router = APIRouter(tags=["cases"])


def case_dir_or_404(case_id: str) -> Path:
    validate_case_id(case_id)
    case_dir = safe_join(settings.cases_root, case_id)

    if not case_dir.exists() or not case_dir.is_dir():
        raise HTTPException(status_code=404, detail="Caso non trovato")

    return case_dir


def read_meta(case_dir: Path) -> dict:
    meta_file = case_dir / "case.json"

    if not meta_file.exists():
        raise HTTPException(status_code=404, detail="case.json mancante")

    return json.loads(meta_file.read_text())


def write_meta(case_dir: Path, meta: dict):
    meta["updated_at"] = datetime.now(timezone.utc).isoformat()
    (case_dir / "case.json").write_text(json.dumps(meta, indent=2))


def count_cases() -> int:
    if not settings.cases_root.exists():
        return 0
    return len([p for p in settings.cases_root.iterdir() if p.is_dir()])


@router.post("/")
def create_case(payload: CaseCreate):
    if count_cases() >= settings.max_cases:
        raise HTTPException(status_code=400, detail="Numero massimo di casi raggiunto")

    case_id = uuid.uuid4().hex[:12]
    case_dir = settings.cases_root / case_id

    if case_dir.exists():
        raise HTTPException(status_code=409, detail="Caso già esistente")

    case_dir.mkdir(parents=True)

    now = datetime.now(timezone.utc).isoformat()

    meta = {
        "id": case_id,
        "name": payload.name,
        "solver": payload.solver,
        "description": payload.description,
        "created_at": now,
        "updated_at": now,
        "last_job_id": None,
    }

    config = CaseConfig()
    config.physics.solver = payload.solver
    config.mesh.processors = settings.default_processors

    for d in ["0", "constant", "system", "constant/triSurface", "postProcessing"]:
        (case_dir / d).mkdir(parents=True, exist_ok=True)

    generate_case_files(case_dir, config, meta)

    # ponytail: prima ritornava una shape diversa da GET /cases/{id}
    # (case_id invece di id, senza updated_at/description/last_job_id).
    # Il frontend leggeva data.id dopo la creazione e trovava sempre
    # undefined -> navigava su /projects/undefined. Stessa risorsa,
    # stessa shape di meta, sempre.
    return meta


@router.get("/")
def list_cases(
    q: str = Query("", description="Cerca per nome"),
    solver: str = Query("", description="Filtra per solver"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    items = []

    if not settings.cases_root.exists():
        return {"items": [], "total": 0, "page": page, "size": size}

    for p in sorted(settings.cases_root.iterdir(), reverse=True):
        if not p.is_dir():
            continue

        meta_file = p / "case.json"
        if not meta_file.exists():
            continue

        try:
            meta = json.loads(meta_file.read_text())
        except Exception:
            continue

        if q and q.lower() not in meta.get("name", "").lower():
            continue

        if solver and meta.get("solver") != solver:
            continue

        items.append(meta)

    total = len(items)
    start = (page - 1) * size
    end = start + size

    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/{case_id}")
def get_case(case_id: str):
    case_dir = case_dir_or_404(case_id)
    meta = read_meta(case_dir)

    config_file = case_dir / "config.json"
    config = {}

    if config_file.exists():
        config = json.loads(config_file.read_text())

    return {
        "meta": meta,
        "config": config,
    }


@router.delete("/{case_id}")
def delete_case(case_id: str):
    case_dir = case_dir_or_404(case_id)
    shutil.rmtree(case_dir)
    return {"status": "deleted", "case_id": case_id}


@router.post("/{case_id}/clone")
def clone_case(case_id: str, new_name: str = Query(..., min_length=1, max_length=120)):
    source = case_dir_or_404(case_id)

    new_id = uuid.uuid4().hex[:12]
    target = settings.cases_root / new_id

    if target.exists():
        raise HTTPException(status_code=409, detail="Caso clone già esistente")

    shutil.copytree(source, target)

    meta = read_meta(target)
    meta["id"] = new_id
    meta["name"] = new_name
    meta["created_at"] = datetime.now(timezone.utc).isoformat()
    meta["last_job_id"] = None

    write_meta(target, meta)

    return meta


@router.post("/{case_id}/config")
def update_config(case_id: str, config: CaseConfig):
    case_dir = case_dir_or_404(case_id)
    meta = read_meta(case_dir)

    for d in ["0", "constant", "system", "constant/triSurface", "postProcessing"]:
        (case_dir / d).mkdir(parents=True, exist_ok=True)

    generate_case_files(case_dir, config, meta)

    return {
        "status": "config_generated",
        "case_id": case_id,
    }