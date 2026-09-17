# Architecture

*[🇮🇹 Leggi in italiano](../it/ARCHITECTURE.md)*

Four Docker services plus Redis, one shared data volume. No reverse proxy:
the frontend and the API are served by the same FastAPI process on port
8000; the 3D viewer is a separate service on port 8081.

```
                    ┌─────────────────────────┐
   browser ───────▶ │  api (FastAPI, :8000)   │
                    │  also serves the        │
                    │  frontend's static      │◀── build ./frontend/dist
                    │  files (React/TS,       │    (npm run build, not
                    │  mounted read-only in   │     served by Vite)
                    │  docker-compose)        │
                    └───────────┬─────────────┘
                                │ celery_app.send_task(...)
                                ▼
                    ┌─────────────────────────┐
                    │        redis             │  broker + backend
                    │  (password required)     │  for Celery tasks
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  worker (Celery, conc=1)│  runs blockMesh/
                    │  OpenFOAM 2406 installed │  snappyHexMesh/solver/
                    │  in the image             │  foamToVTK as real
                    └───────────┬─────────────┘  subprocesses
                                │
                                ▼
                    ┌─────────────────────────┐
   browser ───────▶ │  viz (trame+PyVista,    │  reads the same "cases"
                    │  :8081), read-only      │  volume, read-only
                    └─────────────────────────┘

        shared Docker volume "cases" → /data/cases/{case_id}/
           (api and worker: read-write · viz: read-only)
```

## Life of a case, from upload to results

1. **Create the case** — `POST /api/cases/` creates
   `/data/cases/{case_id}/case.json` with the metadata (name, solver,
   dates). `case_id` is a hex UUID, generated server-side.
2. **Upload geometry** — `POST /api/files/{case_id}/upload/{path}`
   writes the file (STL/OBJ) into the case folder. The stream is written
   via `target.open("wb")` in 1 MB chunks, with the size checked against
   `MAX_UPLOAD_MB` *during* the streaming itself (not afterwards); each
   chunk's actual write runs on a separate thread
   (`anyio.to_thread.run_sync`) so large uploads don't block uvicorn's
   event loop.
3. **Configure** — the React wizard builds an object that conforms to
   the Pydantic models in `backend/app/models.py` (mesh, physics,
   boundary conditions, run control) and saves it via
   `POST /api/cases/{case_id}/config`. At this point **the api** (not the
   worker) calls `generate_case_files()` in
   `backend/app/templates_generator.py`, which immediately writes all the
   OpenFOAM dictionaries (`controlDict`, `blockMeshDict`, `0/U`, `0/p`,
   ...) to the shared volume — the worker will find them already in place
   when a job starts. From here on, `config.json` can **also be edited by
   hand** via the built-in text editor — which is why the critical
   validation (solver names, boundary names) is repeated on the worker
   side too, not just here (see `models.py` and `worker/tasks.py`,
   `ponytail:` comments).
4. **Generate the mesh** — `POST /api/jobs/mesh` queues
   `tasks.generate_mesh_only` on Celery. The worker reads the
   dictionaries already written in the previous step and runs
   `blockMesh`/`snappyHexMesh`/`checkMesh` as real subprocesses inside the
   OpenFOAM environment (sourcing `OPENFOAM_BASHRC`), writes logs to file
   (`log.{step}`), and produces a WebGL preview of the mesh.
5. **Run** — `POST /api/jobs/run` queues `tasks.run_openfoam_case`:
   mesh (if not already done) → `decomposePar` (if `processors > 1`) →
   solver (`mpirun -np N {solver} -parallel` or `{solver}` serial) →
   `reconstructPar` → `foamToVTK`. Each step writes its own `log.*` and
   can be interrupted: `POST /api/jobs/{job_id}/cancel` writes a flag to
   Redis (`cancel:{job_id}`) that the worker checks on every iteration,
   then it `killpg`s the *entire* process group (not just the main PID —
   otherwise `mpirun` would leave orphaned child processes behind).
6. **Quick commands (optional)** — if `ENABLE_TERMINAL=true`,
   `POST /api/terminal/exec` queues `tasks.run_terminal_command` for an
   allowlisted set of inspection commands (`ls`, `pwd`, `foamInfo`,
   `checkMesh`, `foamToVTK`), reusing the same log/timeout/cancellation
   infrastructure as regular jobs. There is no UI wired to this endpoint
   yet.
7. **Follow progress** — the frontend polls over SSE
   (`GET /api/jobs/{job_id}/stream`, every 2s), reading `log.*` and the
   residuals via `backend/app/residuals.py`. It's not WebSocket: for a
   single user with jobs that run for minutes/hours, the 2s latency isn't
   noticeable (see `ROADMAP.md`, Phase 4, should that need to change).
8. **View the results** — the `viz` service (trame + PyVista) mounts the
   same `cases` volume read-only, loads the VTK files produced by
   `foamToVTK`, and serves an interactive 3D viewer on `:8081`, embedded
   via an iframe in the React frontend.

## Why separate services (not a single container)

- **api** must respond in milliseconds even while a job runs for hours —
  which is why the heavy lifting lives in the **worker**, not in the
  FastAPI process.
- **worker** has a dedicated `mem_limit: 16g` / `cpus: 8` and Celery
  concurrency `= 1`: one OpenFOAM job at a time, at full power. Correct
  for a single user; if running several lighter jobs in parallel becomes
  a requirement, this is the point to rethink (raising concurrency alone
  isn't enough — CPU/RAM also need to be re-partitioned per job, see
  `ROADMAP.md`, item A3).
- **viz** is isolated because trame/PyVista keep session state (loaded
  mesh, current timestep) that doesn't make sense to share with the
  stateless API, and because a crash in the 3D viewer must not be able to
  block mesh generation or job polling.
- **redis** acts as both the Celery broker/backend **and** the place
  where the worker checks the cancellation flag — one service, two uses.

## Known limitations (in full in `ROADMAP.md`)

- Single-key authentication designed for a local deployment, not for
  exposure on a public network without additional measures (item S4).
- A single trame "viewer" shared globally: two browser tabs hitting the
  same `viz` process see the same state (item B3).
- Worker concurrency fixed at 1 job at a time (item A3).
