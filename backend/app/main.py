import logging
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import cases, files, jobs, terminal, validation
from app.security import require_api_key

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="OpenFOAM Web UI",
    version="3.0.0",
    description="Interfaccia web completa per OpenFOAM, senza reverse proxy.",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

# ponytail: allow_origins=["*"] + allow_credentials=True e' un mix pericoloso
# (e i browser lo rifiutano comunque). Credenziali solo con origini esplicite.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials="*" not in origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": "OpenFOAM Web UI",
        "version": "3.0.0",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.exception("Errore non gestito: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Errore interno del server",
            "type": exc.__class__.__name__,
        },
    )


_auth = [Depends(require_api_key)]
app.include_router(cases.router, prefix="/api/cases", dependencies=_auth)
app.include_router(jobs.router, prefix="/api/jobs", dependencies=_auth)
app.include_router(files.router, prefix="/api/files", dependencies=_auth)
app.include_router(validation.router, prefix="/api/validation", dependencies=_auth)
app.include_router(terminal.router, prefix="/api/terminal", dependencies=_auth)

if not settings.api_key:
    logging.warning(
        "API_KEY non impostata: tutti gli endpoint /api sono aperti a chiunque "
        "raggiunga questo host. Imposta API_KEY in .env prima di esporre il servizio."
    )


static_dir: Path = settings.static_dir

if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
            return JSONResponse({"detail": "Not found"}, status_code=404)

        # ponytail: full_path arriva da URL, "../../etc/passwd" risolverebbe
        # fuori da static_dir senza il controllo is_relative_to.
        file_path = (static_dir / full_path).resolve()

        if file_path.is_relative_to(static_dir.resolve()) and file_path.is_file():
            return FileResponse(file_path)

        index_file = static_dir / "index.html"
        if index_file.exists():
            return FileResponse(index_file)

        return {
            "message": "Frontend non costruito. Esegui: cd frontend && npm run build",
            "docs": "/docs",
        }
else:
    @app.get("/")
    def root():
        return {
            "message": "Frontend non costruito. Esegui: cd frontend && npm run build",
            "docs": "/docs",
        }