import re
from pathlib import Path
from fastapi import HTTPException


def sanitize_filename(filename: str) -> str:
    filename = filename.replace("/", "_").replace("\\", "_")
    filename = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    return filename or "file"


def validate_relpath(relpath: str) -> str:
    relpath = relpath.strip().lstrip("/")

    if not relpath:
        raise HTTPException(status_code=400, detail="Percorso vuoto")

    if ".." in relpath.split("/"):
        raise HTTPException(status_code=400, detail="Percorso non valido")

    if relpath.startswith("/"):
        raise HTTPException(status_code=400, detail="Percorso assoluto non valido")

    return relpath


def safe_join(root: Path, relpath: str) -> Path:
    root = root.resolve()
    relpath = validate_relpath(relpath)
    target = (root / relpath).resolve()

    if not target.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Percorso fuori dalla radice")

    return target


def validate_case_id(case_id: str) -> str:
    if not re.match(r"^[a-zA-Z0-9_-]{6,64}$", case_id):
        raise HTTPException(status_code=400, detail="case_id non valido")
    return case_id