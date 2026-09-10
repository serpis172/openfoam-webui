# Architettura

Quattro servizi Docker + Redis, un solo volume dati condiviso. Nessun
reverse proxy: frontend e API sono serviti dallo stesso processo FastAPI
sulla porta 8000, il viewer 3D è un servizio separato sulla 8081.

```
                    ┌─────────────────────────┐
   browser ───────▶ │  api (FastAPI, :8000)   │
                    │  serve anche i file      │
                    │  statici del frontend    │◀── build ./frontend/dist
                    │  (React/TS, montato read-│    (npm run build, non
                    │  only in docker-compose) │     servito da Vite)
                    └───────────┬─────────────┘
                                │ celery_app.send_task(...)
                                ▼
                    ┌─────────────────────────┐
                    │        redis             │  broker + backend
                    │   (password richiesta)   │  dei task Celery
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  worker (Celery, conc=1)│  esegue blockMesh/
                    │  OpenFOAM 2406 installato│  snappyHexMesh/solver/
                    │  nell'immagine           │  foamToVTK come
                    └───────────┬─────────────┘  subprocess reali
                                │
                                ▼
                    ┌─────────────────────────┐
   browser ───────▶ │  viz (trame+PyVista,    │  legge lo stesso volume
                    │  :8081), sola lettura   │  "cases" in read-only
                    └─────────────────────────┘

           volume Docker condiviso "cases" → /data/cases/{case_id}/
           (api e worker: read-write · viz: read-only)
```

## Flusso di un caso, dal caricamento al risultato

1. **Crea caso** — `POST /api/cases/` crea
   `/data/cases/{case_id}/case.json` con i metadati (nome, solver, date).
   `case_id` è un UUID esadecimale, generato server-side.
2. **Carica geometria** — `POST /api/files/{case_id}/upload/{path}`
   scrive il file (STL/OBJ) nella cartella del caso. Lo stream va a
   `target.open("wb")`, chunk da 1 MB, con controllo dimensione contro
   `MAX_UPLOAD_MB` durante lo streaming stesso (non dopo); la write vera e
   propria di ogni chunk gira su un thread separato
   (`anyio.to_thread.run_sync`) per non bloccare l'event loop di uvicorn
   durante upload grossi.
3. **Configura** — il wizard React costruisce un oggetto conforme ai
   modelli Pydantic in `backend/app/models.py` (mesh, fisica, boundary
   condition, controllo run) e lo salva via
   `POST /api/cases/{case_id}/config`. A questo punto **l'api** (non il
   worker) chiama `generate_case_files()` in
   `backend/app/templates_generator.py`, che scrive subito tutti i dict
   OpenFOAM (`controlDict`, `blockMeshDict`, `0/U`, `0/p`, ...) sul volume
   condiviso — il worker li troverà già pronti quando parte un job. Da qui
   in poi `config.json` è **anche editabile a mano** tramite l'editor di
   testo integrato — per questo la validazione critica (nomi solver, nomi
   boundary) è ripetuta lato worker, non solo qui (vedi `models.py` e
   `worker/tasks.py`, commenti `ponytail:`).
4. **Genera mesh** — `POST /api/jobs/mesh` accoda
   `tasks.generate_mesh_only` su Celery. Il worker legge i dict già
   scritti al passo precedente e lancia `blockMesh`/`snappyHexMesh`/
   `checkMesh` come subprocess reali dentro l'ambiente OpenFOAM (sourcing
   di `OPENFOAM_BASHRC`), scrive i log su file (`log.{step}`) e produce un
   preview WebGL della mesh.
5. **Esegui** — `POST /api/jobs/run` accoda `tasks.run_openfoam_case`:
   mesh (se non già fatta) → `decomposePar` (se `processors > 1`) → solver
   (`mpirun -np N {solver} -parallel` o `{solver}` seriale) →
   `reconstructPar` → `foamToVTK`. Ogni step scrive il proprio `log.*` e
   può essere interrotto: `POST /api/jobs/{job_id}/cancel` scrive un flag
   su Redis (`cancel:{job_id}`) che il worker controlla a ogni iterazione,
   poi fa `killpg` sul process group intero (non solo sul PID principale,
   altrimenti `mpirun` lascerebbe processi figli orfani).
6. **Comandi rapidi (opzionale)** — se `ENABLE_TERMINAL=true`,
   `POST /api/terminal/exec` accoda `tasks.run_terminal_command` per un
   set allowlisted di comandi di ispezione (`ls`, `pwd`, `foamInfo`,
   `checkMesh`, `foamToVTK`), riusando la stessa infrastruttura di
   log/timeout/cancellazione dei job normali. Non esiste ancora una UI
   collegata a questo endpoint.
7. **Segui l'avanzamento** — il frontend fa polling SSE
   (`GET /api/jobs/{job_id}/stream`, ogni 2s) leggendo `log.*` e i residui
   via `backend/app/residuals.py`. Non è WebSocket: per un utente singolo
   con job che durano minuti/ore la latenza di 2s non è percepibile (vedi
   `ROADMAP.md`, Fase 4, se questo dovesse cambiare).
8. **Visualizza i risultati** — il servizio `viz` (trame + PyVista) monta
   lo stesso volume `cases` in sola lettura, carica i VTK prodotti da
   `foamToVTK` e serve un viewer 3D interattivo su `:8081`, agganciato da
   un iframe nel frontend React.

## Perché servizi separati (non un unico container)

- **api** deve rispondere in millisecondi anche mentre un job gira per
  ore — per questo il lavoro pesante è nel **worker**, non nel processo
  FastAPI.
- **worker** ha `mem_limit: 16g` / `cpus: 8` dedicati e concorrenza Celery
  `= 1`: un solo job OpenFOAM alla volta, a piena potenza. Corretto per un
  utente singolo; se in futuro serve eseguire più job leggeri in
  parallelo, questo è il punto da ripensare (non basta alzare la
  concorrenza senza anche ripartire la CPU/RAM per job — vedi
  `ROADMAP.md`, voce A3).
- **viz** è isolato perché trame/PyVista tengono uno stato di sessione
  (mesh caricata, timestep corrente) che non ha senso condividere con
  l'API stateless, e perché un crash del viewer 3D non deve poter
  bloccare la generazione mesh o il polling dei job.
- **redis** fa da broker/backend Celery **e** da posto dove il worker
  controlla il flag di cancellazione — un solo servizio, due usi.

## Limiti noti (per esteso in `ROADMAP.md`)

- Autenticazione a chiave singola pensata per deploy locale, non per
  esposizione su rete pubblica senza ulteriori misure (voce S4).
- Un solo "viewer" trame condiviso globalmente: due tab browser sullo
  stesso processo `viz` vedono lo stesso stato (voce B3).
- Concorrenza worker fissa a 1 job alla volta (voce A3).
