import hmac
import re
from pathlib import Path
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str | None = Security(_api_key_header)) -> None:
    """ponytail: guardia minima. Senza questa, chiunque raggiunga l'app
    puo' leggere/scrivere/cancellare file di caso e lanciare job (CPU/RAM
    illimitati). Non e' un sistema utenti: e' un lucchetto sulla porta.
    Upgrade a OAuth2/JWT multiutente quando servira' multi-tenant."""
    if not settings.api_key:
        return  # nessuna chiave configurata: deploy locale/dev, nessun controllo
    if not key or not hmac.compare_digest(key, settings.api_key):
        raise HTTPException(status_code=401, detail="API key mancante o non valida")


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