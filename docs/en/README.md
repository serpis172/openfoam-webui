# OpenFOAM Web UI

[![CI](https://github.com/serpis172/openfoam-webui/actions/workflows/ci.yml/badge.svg)](https://github.com/serpis172/openfoam-webui/actions/workflows/ci.yml)

*[🇮🇹 Leggi in italiano](../it/README.md)*

A web interface for running [OpenFOAM](https://www.openfoam.com/) CFD
simulations without touching a terminal: create a case, upload the
geometry, configure physics and boundary conditions from a wizard,
generate the mesh, run the simulation, and view the results in an
in-browser 3D viewer.

This project is designed for a **local or self-hosted, single-user**
deployment. The limits of that model are described in
[Security](#security).

## Table of contents

1. [Features](#features)
2. [Architecture at a glance](#architecture-at-a-glance)
3. [Requirements](#requirements)
4. [Installation](#installation)
5. [Updating](#updating)
6. [Configuration](#configuration)
7. [Usage](#usage)
8. [Meshing guide](#meshing-guide)
9. [Useful commands](#useful-commands)
10. [Testing and continuous integration](#testing-and-continuous-integration)
11. [Security](#security)
12. [Troubleshooting](#troubleshooting)
13. [Project structure](#project-structure)
14. [Documentation](#documentation)

## Features

- Case creation via a graphical wizard; STL geometry upload.
- Physics (solver, fluid, turbulence, gravity) and boundary conditions
  (U, p, T, k, omega) from the GUI, validated both in the browser and on
  the server.
- Automatic generation of the OpenFOAM files (`controlDict`,
  `blockMeshDict`, `snappyHexMeshDict`, `0/U`, `0/p`, …), partly via
  [foamlib](https://github.com/gerlero/foamlib) (migration in progress,
  see `ROADMAP.md`).
- Meshing with `blockMesh` or `snappyHexMesh`, graphical refinement
  panels, watertightness analysis, and automatic mesh-quality validation
  (`checkMesh` plus skewness/non-orthogonality thresholds).
- Serial or parallel execution (`mpirun`); heat transfer via
  `buoyantSimpleFoam` / `buoyantPimpleFoam` (air only).
- Real-time status, logs, and residuals; job cancellation that kills the
  entire process group.
- Built-in OpenFOAM file editor for manual edits.
- Interactive 3D viewer (server-side trame/PyVista; client-side three.js
  for geometry/mesh preview).
- Result downloads, simulation reports, backup, and cleanup of old
  cases.

## Architecture at a glance

Four Docker services (`api`, `worker`, `viz`, `redis`) and a shared data
volume, no reverse proxy:

| Service | Role | Port |
|---|---|---|
| `api` | FastAPI; also serves the compiled React frontend | 8000 |
| `worker` | Celery; runs `blockMesh`, `snappyHexMesh`, the solver, `foamToVTK` (OpenFOAM v2406 ships in the image) | – |
| `viz` | trame + PyVista; results 3D viewer, read-only | 8081 |
| `redis` | Celery broker/backend and job cancellation flag | – |

Diagram, the step-by-step lifecycle of a case, and the design rationale:
**[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Requirements

| Component | Notes |
|---|---|
| Docker + Compose plugin | verify with `docker compose version` |
| Node.js LTS + npm | needed **on the host** to build the frontend |
| RAM / CPU | the `worker` service is capped at 16 GB / 8 CPUs in `docker-compose.yml` (`mem_limit`, `cpus`): adjust to your machine |
| Disk space | the worker image ships with OpenFOAM (a few GB) plus simulation cases |
| Network | the first build downloads OpenFOAM from `dl.openfoam.com` |

**Windows:** use WSL2 with Docker Desktop (WSL integration enabled) and
work inside the Linux filesystem (`~/openfoam-webui`), not under
`/mnt/c`: file access is much slower there and permissions less
reliable.

Python and OpenFOAM do **not** need to be installed on the host — they
run inside the containers.

## Installation

```bash
git clone https://github.com/serpis172/openfoam-webui.git
cd openfoam-webui

cp .env.example .env
# set at least REDIS_PASSWORD (alphanumeric only, e.g.
# `openssl rand -hex 16`) and, if needed, API_KEY (`openssl rand -hex 32`)
nano .env

bash scripts/setup.sh
```

`scripts/setup.sh` checks Docker, Compose, and Node, builds the frontend
(`npm install && npm run build`), builds the images, and starts the
services. **The first build takes a while** (it installs OpenFOAM).

Verify everything is up:

```bash
docker compose ps                      # api, worker, viz, redis: "running"/"healthy"
curl http://localhost:8000/api/health  # API health response
```

Then open **<http://localhost:8000>**. The 3D viewer is embedded in the
Results page and also reachable at <http://localhost:8081>.

> The frontend must be built **before** the containers start
> (`scripts/setup.sh` does this in the right order). If `frontend/dist`
> doesn't exist when `docker compose up` runs, Docker creates it as
> `root` and `npm run build` can no longer write to it — see
> [Troubleshooting](#troubleshooting).

## Updating

```bash
git pull
make frontend                 # rebuild the frontend
docker compose build          # rebuild any changed images
docker compose up -d
```

Simulation cases live in the `cases` Docker volume and survive updates.

## Configuration

All variables live in `.env` (copied from `.env.example`). The ones you
almost always need to change are in **bold**.

| Variable | Description | Default |
|---|---|---|
| **`REDIS_PASSWORD`** | Redis password. Alphanumeric only — it ends up inside a URL. In Docker, `REDIS_URL` is built from this automatically. | `cambia-questa-password` |
| `REDIS_URL` | Only used outside Docker; overridden in Compose. | `redis://:…@localhost:6379/0` |
| `DATA_ROOT` / `CASE_ROOT` | Data volume and cases folder, inside the containers. | `/data`, `/data/cases` |
| `OPENFOAM_BASHRC` | OpenFOAM environment script in the worker. If the path doesn't exist, the worker also checks `/usr/lib/openfoam` and `/opt`. | `/opt/openfoam2406/etc/bashrc` |
| `DEFAULT_PROCESSORS` | Default MPI processes. | `4` |
| `MAX_UPLOAD_MB` | Maximum upload size. | `2048` |
| `MAX_CASES` | Maximum number of cases retained. | `100` |
| `JOB_TIMEOUT_SECONDS` | Timeout for a single step (mesh or solver). | `86400` (24h) |
| `ENABLE_TERMINAL` | Enables the allowlisted quick-command endpoint (`/api/terminal/exec`). | `false` |
| `CORS_ORIGINS` | Allowed CORS origins. | `*` |
| `ALLOWED_GEOMETRY_EXTENSIONS` | Extensions accepted on upload. `snappyHexMesh` meshing only uses **STL**. | `.stl,.obj,.vtk,.vtp` |
| **`API_KEY`** | Required on all `/api` endpoints (`X-API-Key` header). Empty = no auth, local development only. | *(empty)* |
| `VIZ_PORT` | Port exposed by the viewer. | `8081` |

After changing `.env`: `docker compose up -d` (recreates the affected
containers).

## Usage

1. **Create a case** from the wizard: name and solver (e.g.
   `simpleFoam`; `buoyantSimpleFoam` for heat transfer).
2. **Upload the geometry** (STL) and select it in the mesh settings.
3. **Configure physics and boundary conditions.** OpenFOAM files are
   generated immediately on save, and boundary-condition patch names are
   validated against what the mesh will actually produce.
4. **Generate the mesh** and check the quality report
   (`postProcessing/mesh_report.json`, shown in the UI). An unusable
   mesh blocks the simulation with a reason instead of failing hours
   later in the solver. See the [meshing guide](#meshing-guide).
5. **Run the simulation** (serial or parallel); follow logs and
   residuals, cancel if needed.
6. **View the results** in the 3D viewer; download data and reports.

## Meshing guide

Nearly every meshing failure comes from the input geometry, not a bug.
Check in this order:

**Geometry (STL)**
- Must be **watertight**, with consistent, outward-facing normals — use
  the watertightness panel before meshing.
- Units are **meters**. An STL modeled in millimeters is read 1000×
  too large — rescale it before uploading.
- The file name (without extension) becomes the **patch name**
  `snappyHexMesh` produces. The geometry's boundary condition must use
  that exact name (`car.stl` → patch `car`).

**Domain (`blockMesh`)**
- `domain_min`/`domain_max` must contain the entire geometry with a
  generous margin (roughly several characteristic lengths upstream, and
  more downstream for external flows).
- `cells` sets the background cell count per axis; cell size is
  `(domain_max − domain_min) / cells`. Each `snappyHexMesh` refinement
  level halves the local cell size.
- The validator rejects immediately: fewer than 1 cell per axis, an
  inverted domain, or a component count other than 3.

**`location_in_mesh` (the trickiest part)**
- Must be a point **in the fluid**: inside the domain, **outside** the
  geometry, and not on a cell face. The default `(0, 0, 0)` sits inside
  the geometry when it's centered on the origin — the result is a
  **zero-cell mesh**.
- The validator rejects a point outside the domain immediately; it
  can't know whether a point falls inside the solid (mesh-quality
  validation after the run catches that).

**Quality: what happens after meshing**

| Condition | Outcome |
|---|---|
| 0 cells or 0 points | **invalid**: the simulation does not start |
| inverted cells (negative volume) | **invalid** |
| skewness > 0.85 | warning |
| skewness > 0.95 | **invalid** |
| non-orthogonality > 65° | warning |
| non-orthogonality > 85° | **invalid** |

Each step's log (`log.blockMesh`, `log.snappyHexMesh`, `log.checkMesh`,
`log.<solver>`) is in the case folder and in the job page.

## Useful commands

```bash
docker compose ps                          # service status
docker compose logs -f worker              # worker log (mesh, solver)
docker compose exec worker ls /data/cases  # cases in the volume
make frontend                              # rebuild the frontend only
make backup                                # back up cases
bash scripts/cleanup.sh                    # remove cases older than 30 days (with confirmation)
make clean                                 # WARNING: also wipes the cases volume (asks for confirmation)
```

See `make help` for the full list.

## Testing and continuous integration

Three levels, fastest to most faithful:

```bash
# 1. Backend (no external services; integration tests are skipped)
cd backend && pytest tests -v

# 2. Worker (control-flow functions: clean_case, pre-checks, mesh validation)
cd worker && pytest tests -v

# 3. Integration with real OpenFOAM (requires OpenFOAM installed)
cd backend && OPENFOAM_BASHRC=/path/to/etc/bashrc pytest tests/integration -v
```

CI (`.github/workflows/ci.yml`) runs on every push and pull request to
`main`: backend tests, worker tests, the frontend's TypeScript build, and
the **`openfoam-integration`** job, which installs OpenFOAM v2406 and
runs `blockMesh`, `snappyHexMesh`, `checkMesh`, and `simpleFoam` against
the files this project generates. If that job is red, the failure
message includes the tail of the OpenFOAM log for the failing command.

## Security

- Terminal disabled by default (with `ENABLE_TERMINAL=true` it runs real
  commands, but only from an allowlist).
- Uploads limited by size and extension; path traversal blocked.
- Redis protected by a password; jobs have a timeout and are cancelled
  by killing the entire process group.
- Boundary-condition names and types are validated against a whitelist
  before landing in the generated OpenFOAM dictionaries (injection
  prevention).
- API errors don't leak sensitive output.

**Known limitation:** `API_KEY` is a lock for local use, not real
authentication. It's baked into the frontend bundle
(`VITE_API_KEY`), so it's readable by anyone who opens the browser
devtools. Fine on `localhost` or a trusted network; a wider deployment
needs a real server-side session mechanism (`ROADMAP.md`, item S4).

## Troubleshooting

The first thing to do in any case: read the log of the failing step
(`docker compose logs worker`, or `log.<step>` in the case folder).

### Setup and startup

| Symptom | Cause | Fix |
|---|---|---|
| `EACCES: permission denied, mkdir '…/frontend/dist/assets'` | `frontend/dist` was created by `root` (a container started before the frontend was built) | `sudo rm -rf frontend/dist`, then `bash scripts/setup.sh` |
| `Package 'foamlib' requires a different Python` during the backend build | `foamlib` ≥ 1.8.0 requires Python ≥ 3.12 | use `python:3.12-slim` in `backend/Dockerfile` (already the case on `main`) |
| Worker build fails with `OpenFOAM non utilizzabile via …` | the `OPENFOAM_BASHRC` path doesn't exist in the image, or the `dl.openfoam.com` download failed | check your network (proxy/VPN) and re-run `docker compose build worker`; the message names the path it looked for |
| `docker info` doesn't respond / permission denied on the socket | daemon not running, or your user isn't in the `docker` group | start Docker Desktop (WSL2) or `sudo service docker start`; `sudo usermod -aG docker $USER` and reopen the shell |
| Every job fails with `Authentication required` | Redis and services have mismatched passwords (after changing `REDIS_PASSWORD`) | `docker compose down && docker compose up -d`; use an alphanumeric password |
| Blank page / `404` | frontend not built | `make frontend && docker compose up -d` |

### Meshing

| Message | Cause | Fix |
|---|---|---|
| `Mesh has zero cells — the geometry does not intersect the domain` | `location_in_mesh` inside the solid, a domain that doesn't contain the geometry, or an STL in the wrong units | see the [meshing guide](#meshing-guide): move the point into the fluid, widen the domain, check units |
| `Nessun file STL selezionato` / `File STL '…' non trovato in constant/triSurface` | geometry not uploaded or not selected | re-upload the STL and select it |
| `system/blockMeshDict mancante` / `system/snappyHexMeshDict mancante` | configuration was never saved after the last change | save the case configuration again |
| `Ambiente OpenFOAM non trovato` | wrong `OPENFOAM_BASHRC` and no installation found in the worker | fix `.env`, then `docker compose build worker` |
| `Case … is locked by another process` | another mesh job is already running for this case | wait for it to finish, or cancel it — the lock releases on its own |
| `Extreme mesh skewness` / `Extreme mesh non-orthogonality` | flawed geometry or insufficient refinement | repair the STL, increase background resolution or refinement levels |
| `Mesh non valida, simulazione non avviata: …` | the mesh failed validation | read the listed reasons (`quality_issues` in the report) |
| `422` error on save (`cells`, `domain_max`, `location_in_mesh`) | inconsistent domain parameters | the message names which parameter and why |

### Simulation

| Message | Cause | Fix |
|---|---|---|
| `Cannot find patchField entry for …` | a boundary condition names a patch that doesn't match any mesh patch | the geometry's patch is named after the STL file without its extension — fix the name in the boundary conditions |
| `cannot find file "0/U"` | initial fields are missing (case created with an older version) | save the configuration again to regenerate them |
| Job stays "running" after cancellation | worker can't reach Redis | check `docker compose ps`; on the next check the worker still kills the entire process group |
| The 3D viewer at `:8081` shows an old case | viewer state is shared (see [ARCHITECTURE.md](ARCHITECTURE.md), "Known limitations") | reload the page or `docker compose restart viz` |

### Development

| Symptom | Fix |
|---|---|
| Bare `pytest` collects stale tests | always run `pytest tests -v` from `backend/` (or `worker/`), the way CI does |
| Integration tests show `SKIPPED` | normal without OpenFOAM — set `OPENFOAM_BASHRC` to run them |

## Project structure

```
backend/    FastAPI app, Pydantic models, OpenFOAM file generation
            (templates_generator.py, foam_templates/), tests (pytest)
            backend/tests/integration/  tests against real OpenFOAM
worker/     Celery tasks, OpenFOAM execution, mesh validation,
            WebGL preview export, tests
viz/        trame/PyVista service for the 3D viewer
frontend/   React/TypeScript app (wizard, editor, charts, viewer)
scripts/    setup.sh, backup.sh, cleanup.sh
docs/       This documentation (it/ and en/)
```

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — architecture, the lifecycle
  of a case, design decisions. Also [in Italian](../it/ARCHITECTURE.md).
- **[`ROADMAP.md`](../../ROADMAP.md)** — technical log of decisions,
  security audits, bugs found, and the roadmap. Italian only.
- **[`MESHING_FIXES.md`](../../MESHING_FIXES.md)** — analysis of the
  meshing bugs and their causes. English only.

There is no license file yet (`ROADMAP.md`, item D5).
