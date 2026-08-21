from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(tags=["terminal"])

ALLOWED_COMMANDS = {
    "ls": ["ls", "-lah"],
    "pwd": ["pwd"],
    "foamInfo": ["foamInfo"],
    "checkMesh": ["checkMesh"],
    "foamToVTK": ["foamToVTK", "-latestTime"],
}


class TerminalRequest(BaseModel):
    case_id: str
    command: str


@router.post("/exec")
def exec_command(payload: TerminalRequest):
    if not settings.enable_terminal:
        raise HTTPException(
            status_code=403,
            detail="Terminale disabilitato. Imposta ENABLE_TERMINAL=true se vuoi usarlo.",
        )

    if payload.command not in ALLOWED_COMMANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Comando non consentito. Comandi disponibili: {', '.join(ALLOWED_COMMANDS)}",
        )

    return {
        "case_id": payload.case_id,
        "command": payload.command,
        "message": "Esecuzione comandi consentiti disponibile solo con integrazione worker.",
    }