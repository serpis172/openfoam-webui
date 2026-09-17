# OpenFOAM Web UI

*[🇮🇹 Leggi in italiano](../it/README.md)*

A complete web interface for running [OpenFOAM](https://www.openfoam.com/)
(CFD — computational fluid dynamics) simulations without touching a
terminal: create a case, upload the geometry, configure physics and
boundary conditions from a graphical wizard, generate the mesh, run the
simulation, and view the results in an in-browser 3D viewer.

Designed for a local/self-hosted, single-user deployment (see
[Security](#security) below for the limits of that model).

## Table of contents

- [Features](#features)
- [Architecture at a glance](#architecture-at-a-glance)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Useful commands](#useful-commands)
- [Testing](#testing)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Documentation](#documentation)

## Features

- Case creation via a graphical wizard.
- STL/OBJ geometry upload.
- Physics configuration (solver, fluid properties, gravity) from the GUI.
- Boundary condition configuration (U, p, T, k, omega) from the GUI, with
  both client- and server-side validation.
- Automatic generation of the OpenFOAM configuration files
  (`controlDict`, `blockMeshDict`, `0/U`, `0/p`, ...), partly via
  [foamlib](https://github.com/gerlero/foamlib) (migration in progress,
  see `ROADMAP.md`).
- Meshing with `blockMesh` or `snappyHexMesh`, with graphical refinement
  panels and watertightness analysis.
- Serial or parallel execution (`mpirun`), with full heat-transfer
  support via `buoyantSimpleFoam`/`buoyantPimpleFoam`.
- Real-time job monitoring (status, logs) via SSE polling.
- Residual plots while the simulation runs.
- Syntax and mesh-quality validation.
- An in-browser OpenFOAM file editor, for anyone who wants to hand-edit
  the generated configuration.
- Interactive 3D viewer (server-side trame/PyVista, client-side
  three.js/R3F for geometry and mesh preview) — see
  [Architecture at a glance](#architecture-at-a-glance).
- Result downloads and simulation reports.
- Backup and cleanup of old cases.
- Automated tests (backend: pytest; frontend: TypeScript build) and
  GitHub Actions CI.

## Architecture at a glance

Four Docker services (`api`, `worker`, `viz`, `redis`), one shared data
volume, no reverse proxy. The FastAPI backend also serves the React
frontend's static files on port 8000; the 3D viewer is a separate
trame/PyVista service on port 8081; heavy jobs (meshing, solving) run in
a dedicated Celery worker, not in the API process itself.

For the full diagram, the step-by-step lifecycle of a case, and the
design rationale, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Requirements

- Docker
- Docker Compose plugin
- Node.js LTS (to build the frontend)
- npm

You do not need Python or OpenFOAM installed on the host machine — they
run inside the containers (`backend`, `worker`).

## Installation

```bash
cp .env.example .env
nano .env   # set at least REDIS_PASSWORD and, if needed, API_KEY

bash scripts/setup.sh
```

The script checks the prerequisites, copies `.env.example` to `.env` if
missing, builds the frontend (`npm install && npm run build`), builds the
Docker images, and starts the services.

Then open:

```text
http://localhost:8000
```

The 3D viewer (`viz`) starts automatically with `docker compose up`, no
optional profile needed — it's reachable directly at
`http://localhost:8081` too, in addition to being embedded in each
project's Results page.

## Configuration

All variables live in `.env` (copied from `.env.example`). The ones you
almost certainly need to change from the default are in **bold**.

| Variable | Description | Default |
|---|---|---|
| **`REDIS_PASSWORD`** | Password for Redis (Celery broker/backend). | `cambia-questa-password` |
| `REDIS_URL` | Redis connection URL; must include the same password. | `redis://:...@redis:6379/0` |
| `DATA_ROOT` | Root of the shared data volume, inside the containers. | `/data` |
| `CASE_ROOT` | Cases folder, inside the containers. | `/data/cases` |
| `OPENFOAM_BASHRC` | OpenFOAM environment script sourced by the worker. | `/opt/openfoam2406/etc/bashrc` |
| `DEFAULT_PROCESSORS` | Default number of MPI processes for parallel runs. | `4` |
| `MAX_UPLOAD_MB` | Maximum size for a geometry upload. | `2048` |
| `MAX_CASES` | Maximum number of cases retained. | `100` |
| `JOB_TIMEOUT_SECONDS` | Timeout for a single job (mesh or run). | `86400` (24h) |
| `ENABLE_TERMINAL` | Enables the allowlisted quick-command endpoint (`/api/terminal/exec`). | `false` |
| `CORS_ORIGINS` | Allowed CORS origins. | `*` |
| `ALLOWED_GEOMETRY_EXTENSIONS` | Geometry file extensions accepted on upload. | `.stl,.obj,.vtk,.vtp` |
| **`API_KEY`** | Required on all `/api` endpoints (`X-API-Key` header). Empty = no auth, local development only. Generate with `openssl rand -hex 32`. | *(empty)* |
| `VIZ_PORT` | Port exposed by the `viz` service. | `8081` |

## Usage

Typical flow, from creation to results:

1. **Create a case** from the wizard, choosing a name and solver (e.g.
   `simpleFoam`, or a buoyant solver for heat transfer).
2. **Upload the geometry** (STL/OBJ).
3. **Configure physics and boundary conditions** from the GUI — the
   OpenFOAM files are generated automatically as soon as you save.
4. **Generate the mesh** (`blockMesh`/`snappyHexMesh`), checking quality
   and watertightness from the dedicated panels.
5. **Run the simulation**, serial or parallel; follow the residuals and
   logs in real time, cancel the job if needed.
6. **View the results** in the built-in 3D viewer, download the data or
   the simulation report.

For the technical detail of each step (endpoints, files written,
cancellation handling), see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Useful commands

```bash
docker compose up -d       # start all services
docker compose down        # stop all services
docker compose logs -f     # follow logs from all services
make frontend               # rebuild the frontend only
make backup                 # back up cases (scripts/backup.sh)
bash scripts/cleanup.sh     # remove cases older than 30 days (with confirmation)
```

See `make help` for the full list.

## Testing

```bash
cd backend
pytest tests -v
```

CI (`.github/workflows/ci.yml`) runs the same backend tests plus the
frontend's TypeScript build on every push/PR to `main`.

## Security

- Terminal disabled by default (actually runnable through the worker if
  enabled with `ENABLE_TERMINAL=true` — not an inert stub, it runs real
  commands from an allowlist).
- Uploads limited by size and extension.
- Path traversal blocked.
- Redis protected by a password.
- Jobs have a timeout and can be cancelled by killing the entire process
  group, not just the main PID — otherwise `mpirun` would leave orphaned
  processes behind.
- Generated OpenFOAM files are validated.
- API errors don't leak sensitive output.
- Boundary condition names and types are validated against a whitelist
  before landing in the generated OpenFOAM dictionaries (`0/U`, `0/p`,
  ...), to prevent injection into the files written to disk.

**Known limitation:** `API_KEY` is meant as a lock for a
local/single-user deployment, not real authentication. It's injected at
build time into the frontend bundle (`VITE_API_KEY`), so it's visible to
anyone who opens the browser devtools. That's fine for `localhost` or a
trusted network; if the service is exposed beyond that, it needs a real
server-side session mechanism, not just this key. See `ROADMAP.md`, item
S4.

## Troubleshooting

**`pip install` fails in the `backend` container with something like
"Package 'foamlib' requires a different Python"** — starting with
version 1.8.0, `foamlib` requires Python ≥ 3.12 (≥ 3.11 was enough
before). `backend/Dockerfile` and CI are now aligned on
`python:3.12-slim`; if you're working on a fork or an older branch that
still has `python:3.11-slim`, either bump the base image version or pin
`foamlib` to a ≤ 1.7.x release compatible with 3.11 (note: the foamlib
code in `backend/app/foam_templates/` assumes the 1.8.x API, so bumping
the Python version is the safe option).

**Running `pytest` with no arguments fails with errors about a
`case_id` field that doesn't exist** — make sure your tree is up to
date: an old `backend/test/` folder (singular, with stale tests)
duplicated `backend/tests/` and has been removed. Always run
`pytest tests -v` from the `backend/` folder, the way CI does.

**The 3D viewer on `:8081` doesn't refresh** — the `viz` service keeps a
globally shared session state (see [ARCHITECTURE.md](ARCHITECTURE.md),
"Known limitations"): two browser tabs hitting the same process see the
same state. Reload the page or restart the `viz` container if it stays
stuck on an old case.

**A job stays "running" after being cancelled** — check that Redis is
reachable from the worker (the cancellation flag goes through it); if
the OpenFOAM process itself is unresponsive, the worker still `killpg`s
the entire process group on the next job check.

## Project structure

```
backend/    FastAPI app, Pydantic models, OpenFOAM file generation,
            mesh validation, tests (pytest)
worker/     Celery tasks, real OpenFOAM execution (image ships with
            OpenFOAM 2406), mesh export for the WebGL preview
viz/        trame/PyVista service for the results 3D viewer
frontend/   React/TypeScript app (wizard, editor, charts, viewer)
scripts/    setup.sh, backup.sh, cleanup.sh
docs/       This documentation (it/ and en/)
```

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — detailed architecture, the
  lifecycle of a case, design decisions. Also available
  [in Italian](../it/ARCHITECTURE.md).
- **[`ROADMAP.md`](../../ROADMAP.md)** — technical log of design
  decisions, security audits, and the foamlib migration roadmap.
  Italian only: it's an internal working journal, not a user-facing
  guide.
- **[`MESHING_FIXES.md`](../../MESHING_FIXES.md)** — a detailed guide to
  the meshing bugs that were fixed and their root causes. Already
  English-only (unlike `ROADMAP.md`, which is Italian-only): same reason
  as above, it's an internal working log, not a user-facing guide.
