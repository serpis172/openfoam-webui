import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import settings
from app.security import safe_join, sanitize_filename, validate_case_id

router = APIRouter(tags=["files"])


class TextFileSave(BaseModel):
    content: str


def case_dir_or_404(case_id: str) -> Path:
    validate_case_id(case_id)
    case_dir = safe_join(settings.cases_root, case_id)

    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Caso non trovato")

    return case_dir


@router.get("/{case_id}/list")
def list_files(case_id: str):
    case_dir = case_dir_or_404(case_id)
    files = []

    for p in sorted(case_dir.rglob("*")):
        if p.is_file():
            files.append({
                "path": str(p.relative_to(case_dir)),
                "size": p.stat().st_size,
            })

    return {
        "case_id": case_id,
        "files": files,
    }


@router.post("/{case_id}/upload/{rel_path:path}")
async def upload_file(case_id: str, rel_path: str, file: UploadFile = File(...)):
    case_dir = case_dir_or_404(case_id)

    rel_path = rel_path.strip()
    filename = sanitize_filename(file.filename or "upload.bin")

    if rel_path.endswith("/") or rel_path == "":
        rel_path = rel_path + filename

    target = safe_join(case_dir, rel_path)

    if target.suffix.lower() in {".stl", ".obj"}:
        if target.suffix.lower() not in settings.allowed_geometry_ext_list:
            raise HTTPException(status_code=400, detail="Estensione geometria non consentita")

    target.parent.mkdir(parents=True, exist_ok=True)

    max_bytes = settings.max_upload_mb * 1024 * 1024
    size = 0

    try:
        with target.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)

                if size > max_bytes:
                    raise HTTPException(status_code=413, detail="File troppo grande")

                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise

    return {
        "status": "uploaded",
        "path": str(target.relative_to(case_dir)),
        "size": size,
    }


@router.get("/{case_id}/download/{rel_path:path}")
def download_file(case_id: str, rel_path: str):
    case_dir = case_dir_or_404(case_id)
    target = safe_join(case_dir, rel_path)

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File non trovato")

    return FileResponse(target)


@router.delete("/{case_id}/delete/{rel_path:path}")
def delete_file(case_id: str, rel_path: str):
    case_dir = case_dir_or_404(case_id)
    target = safe_join(case_dir, rel_path)

    if not target.exists():
        raise HTTPException(status_code=404, detail="File non trovato")

    if target.is_file():
        target.unlink()
    else:
        shutil.rmtree(target)

    return {
        "status": "deleted",
        "path": rel_path,
    }


@router.get("/{case_id}/text/{rel_path:path}")
def read_text_file(case_id: str, rel_path: str):
    case_dir = case_dir_or_404(case_id)
    target = safe_join(case_dir, rel_path)

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File non trovato")

    if target.stat().st_size > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File troppo grande per l'editor")

    return {
        "path": rel_path,
        "content": target.read_text(errors="ignore"),
    }


@router.put("/{case_id}/text/{rel_path:path}")
def save_text_file(case_id: str, rel_path: str, payload: TextFileSave):
    case_dir = case_dir_or_404(case_id)
    target = safe_join(case_dir, rel_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload.content, encoding="utf-8")

    return {
        "status": "saved",
        "path": rel_path,
    }


@router.get("/{case_id}/download-all")
def download_all(case_id: str):
    case_dir = case_dir_or_404(case_id)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    tmp.close()

    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in case_dir.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(case_dir))

    return FileResponse(tmp.name, filename=f"{case_id}.zip")