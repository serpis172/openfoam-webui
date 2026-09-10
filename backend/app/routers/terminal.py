from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.celery_app import celery_app
from app.config import settings
from app.security import safe_join, validate_case_id

router = APIRouter(tags=["terminal"])

# ponytail: DUPLICAZIONE VOLUTA con worker/tasks.py::ALLOWED_TERMINAL_COMMANDS,
# stesso motivo di ALLOWED_SOLVERS in models.py - il worker e' l'ultima linea
# di difesa reale (qui e' solo il primo filtro, comodo per dare un 400
# immediato invece di aspettare che il job fallisca). Se aggiungi un
# comando qui, aggiungilo anche li' con la stessa chiave e lo stesso argv.
ALLOWED_COMMANDS = {
    "ls": "Lista i file del caso",
    "pwd": "Mostra il percorso di lavoro corrente",
    "foamInfo": "Informazioni sull'installazione OpenFOAM",
    "checkMesh": "Verifica la qualita' della mesh",
    "foamToVTK": "Esporta l'ultimo timestep in VTK",
}


class TerminalRequest(BaseModel):
    case_id: str
    command: str


@router.get("/commands")
def list_commands():
    return {"enabled": settings.enable_terminal, "commands": ALLOWED_COMMANDS}


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

    case_id = validate_case_id(payload.case_id)
    case_dir = safe_join(settings.cases_root, case_id)

    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Caso non trovato")

    # ponytail: prima questo endpoint validava il comando e poi rispondeva
    # con un messaggio statico ("disponibile solo con integrazione worker")
    # senza eseguire nulla - uno stub travestito da feature. Ora accoda
    # davvero il comando come task Celery (stessa infrastruttura di
    # run/mesh: log su file, timeout, cancellazione via redis, kill del
    # process group), e il chiamante fa polling su GET /api/jobs/{job_id}
    # come per qualunque altro job - nessun nuovo endpoint di stato.
    task = celery_app.send_task(
        "tasks.run_terminal_command",
        args=[case_id, payload.command],
    )

    return {
        "case_id": case_id,
        "command": payload.command,
        "job_id": task.id,
    }
