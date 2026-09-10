import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import time
from pathlib import Path

import redis
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CASE_ROOT = Path(os.getenv("CASE_ROOT", "/data/cases"))
OPENFOAM_BASHRC = os.getenv("OPENFOAM_BASHRC", "/opt/openfoam2406/etc/bashrc")
JOB_TIMEOUT_SECONDS = int(os.getenv("JOB_TIMEOUT_SECONDS", "86400"))

# ponytail: config.json puo' essere sovrascritto a mano tramite l'editor di
# testo (PUT /files/{case_id}/text/config.json), che bypassa la validazione
# pydantic di models.py. Questo e' l'unico punto dove "solver" diventa
# argv[0] di un subprocess reale: e' qui che va bloccato, non solo a monte.
ALLOWED_SOLVERS = {
    "simpleFoam", "pimpleFoam", "interFoam", "pisoFoam", "icoFoam",
    "rhoSimpleFoam", "rhoPimpleFoam", "buoyantSimpleFoam", "buoyantPimpleFoam",
}
MAX_PROCESSORS = 64

celery = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

ACTIVE_PROCESSES = {}


def redis_client():
    return redis.Redis.from_url(REDIS_URL)


def foam_command(args):
    return [
        "/bin/bash",
        "-lc",
        'source "$1" >/dev/null 2>&1 || true; shift; exec "$@"',
        "openfoam-runner",
        OPENFOAM_BASHRC,
        *args,
    ]


def kill_process_group(proc):
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
        time.sleep(3)
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except Exception:
        pass


def run_step(task, job_id, case_dir, step_name, args, timeout_seconds=None):
    task.update_state(
        state="RUNNING",
        meta={
            "case_id": case_dir.name,
            "step": step_name,
            "command": " ".join(args),
        },
    )

    log_path = case_dir / f"log.{step_name}"
    deadline = time.time() + (timeout_seconds or JOB_TIMEOUT_SECONDS)
    r = redis_client()

    with log_path.open("w", encoding="utf-8") as log:
        log.write("$ " + " ".join(shlex.quote(str(a)) for a in args) + "\n\n")

        proc = subprocess.Popen(
            foam_command(args),
            cwd=str(case_dir),
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

        ACTIVE_PROCESSES[job_id] = proc

        while True:
            if r.get(f"cancel:{job_id}"):
                kill_process_group(proc)
                raise RuntimeError(f"Job annullato durante {step_name}")

            if time.time() > deadline:
                kill_process_group(proc)
                raise RuntimeError(f"Timeout durante {step_name}")

            try:
                rc = proc.wait(timeout=1)
                break
            except subprocess.TimeoutExpired:
                continue

    ACTIVE_PROCESSES.pop(job_id, None)

    if rc != 0:
        tail = "\n".join(log_path.read_text(errors="ignore").splitlines()[-80:])
        raise RuntimeError(f"Step {step_name} fallito con codice {rc}\n{tail}")


def clean_case(case_dir: Path):
    patterns = [
        "processor*",
        "log.*",
        "[0-9]*",
        "constant/polyMesh",
        "VTK",
    ]

    for pattern in patterns:
        for p in case_dir.glob(pattern):
            if p.is_file():
                p.unlink()
            elif p.is_dir():
                shutil.rmtree(p)


def parse_residuals(case_dir: Path):
    pattern = re.compile(
        r"Solving for (?P<field>[A-Za-z0-9_]+), "
        r"Initial residual = (?P<initial>[0-9.eE+-]+), "
        r"Final residual = (?P<final>[0-9.eE+-]+), "
        r"No Iterations (?P<iterations>[0-9]+)"
    )

    residuals = {}

    for log in case_dir.glob("log.*"):
        text = log.read_text(errors="ignore")

        for match in pattern.finditer(text):
            field = match.group("field")
            residuals.setdefault(field, []).append(float(match.group("final")))

    return residuals


def parse_check_mesh(case_dir: Path):
    log = case_dir / "log.checkMesh"

    if not log.exists():
        return {}

    text = log.read_text(errors="ignore")

    report = {}

    points = re.search(r"points:\s+(\d+)", text)
    if points:
        report["points"] = int(points.group(1))

    faces = re.search(r"faces:\s+(\d+)", text)
    if faces:
        report["faces"] = int(faces.group(1))

    cells = re.search(r"cells:\s+(\d+)", text)
    if cells:
        report["cells"] = int(cells.group(1))

    non_ortho = re.search(r"Mesh non-orthogonality Max:\s+([0-9.eE+-]+)", text)
    if non_ortho:
        report["max_non_orthogonality"] = float(non_ortho.group(1))

    # ponytail: l'output reale di checkMesh usa "=" ("Max skewness = 0.5
    # OK."), non ":". Con ":" questo non ha mai fatto match, la skewness
    # non veniva mai riportata. Provo entrambe le forme per non rompere
    # su versioni OpenFOAM che formattano diversamente.
    skewness = re.search(r"Max skewness\s*[:=]\s+([0-9.eE+-]+)", text)
    if skewness:
        report["max_skewness"] = float(skewness.group(1))

    aspect_ratio = re.search(r"Max aspect ratio\s*[:=]\s+([0-9.eE+-]+)", text)
    if aspect_ratio:
        report["max_aspect_ratio"] = float(aspect_ratio.group(1))

    return report


def _generate_mesh(self, job_id: str, case_dir: Path, config: dict) -> dict:
    """Meshing + checkMesh + preview WebGL: fattorizzato fuori da
    run_openfoam_case perche' serve anche al job "solo mesh" (l'utente
    vuole vedere/validare la mesh prima di lanciare una simulazione
    intera, che puo' durare ore)."""
    mesh = config.get("mesh", {})
    run_settings = config.get("run", {})

    if run_settings.get("clean_start", True):
        clean_case(case_dir)

    mesh_type = mesh.get("mesh_type", "blockMesh")

    if mesh_type == "blockMesh":
        run_step(self, job_id, case_dir, "blockMesh", ["blockMesh"])

    if mesh_type == "snappyHexMesh":
        stl_dir = case_dir / "constant/triSurface"
        stl_files = list(stl_dir.glob("*.stl"))

        if not stl_files:
            raise RuntimeError("Nessun file STL trovato in constant/triSurface")

        run_step(self, job_id, case_dir, "blockMesh", ["blockMesh"])
        run_step(self, job_id, case_dir, "surfaceFeatureExtract", ["surfaceFeatureExtract"])
        run_step(self, job_id, case_dir, "snappyHexMesh", ["snappyHexMesh", "-overwrite"])

    run_step(self, job_id, case_dir, "checkMesh", ["checkMesh"])

    mesh_report = parse_check_mesh(case_dir)
    mesh_report["mesh_type"] = mesh_type
    mesh_report["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    post_dir = case_dir / "postProcessing"
    post_dir.mkdir(exist_ok=True)
    (post_dir / "mesh_report.json").write_text(json.dumps(mesh_report, indent=2))

    # foamToVTK sulla sola mesh (nessun campo risolto ancora, ma la
    # geometria si', e' quello che ci serve sia per il viewer trame
    # esistente sia per il preview WebGL qui sotto)
    run_step(self, job_id, case_dir, "foamToVTK", ["foamToVTK", "-latestTime"])

    try:
        from mesh_export import export_mesh_preview

        vtk_files = sorted(case_dir.glob("VTK/**/*.vt*"))
        if vtk_files:
            preview_stats = export_mesh_preview(
                vtk_files[-1], post_dir / "mesh_preview.gltf"
            )
            mesh_report["preview"] = preview_stats
            (post_dir / "mesh_report.json").write_text(json.dumps(mesh_report, indent=2))
    except Exception as exc:
        # ponytail: il preview WebGL e' un extra visivo, non deve far
        # fallire il job di meshing se pyvista/vtk inciampa su un caso
        # limite (mesh degenere, 0 celle, ecc.) - la mesh e' comunque
        # generata e checkMesh ha comunque girato.
        mesh_report["preview_error"] = str(exc)
        (post_dir / "mesh_report.json").write_text(json.dumps(mesh_report, indent=2))

    return mesh_report


@celery.task(bind=True, name="tasks.generate_mesh_only")
def generate_mesh_only(self, case_id):
    """Job leggero: solo mesh + checkMesh + preview, niente solver.
    Serve al passo "Mesh" del wizard/workspace: l'utente vuole vedere
    e validare la mesh prima di impegnarsi in una run che puo' durare
    ore."""
    job_id = self.request.id
    case_dir = CASE_ROOT / case_id

    if not case_dir.exists():
        raise FileNotFoundError(f"Caso non trovato: {case_id}")

    config = json.loads((case_dir / "config.json").read_text())
    mesh = config.get("mesh", {})

    processors = int(mesh.get("processors", 1))
    if not (1 <= processors <= MAX_PROCESSORS):
        raise ValueError(f"processors fuori range (1-{MAX_PROCESSORS}): {processors}")

    mesh_report = _generate_mesh(self, job_id, case_dir, config)

    return {"status": "mesh_completed", "case_id": case_id, "mesh_report": mesh_report}


@celery.task(bind=True, name="tasks.run_openfoam_case")
def run_openfoam_case(self, case_id):
    job_id = self.request.id
    case_dir = CASE_ROOT / case_id

    if not case_dir.exists():
        raise FileNotFoundError(f"Caso non trovato: {case_id}")

    config = json.loads((case_dir / "config.json").read_text())

    mesh = config.get("mesh", {})
    run_settings = config.get("run", {})
    physics = config.get("physics", {})

    solver = physics.get("solver", "simpleFoam")
    if solver not in ALLOWED_SOLVERS:
        raise ValueError(f"Solver non consentito: {solver!r}")

    processors = int(mesh.get("processors", 1))
    if not (1 <= processors <= MAX_PROCESSORS):
        raise ValueError(f"processors fuori range (1-{MAX_PROCESSORS}): {processors}")

    _generate_mesh(self, job_id, case_dir, config)

    if processors > 1:
        run_step(self, job_id, case_dir, "decomposePar", ["decomposePar", "-force"])
        run_step(
            self,
            job_id,
            case_dir,
            solver,
            ["mpirun", "-np", str(processors), solver, "-parallel"],
        )
        run_step(self, job_id, case_dir, "reconstructPar", ["reconstructPar", "-latestTime"])
    else:
        run_step(self, job_id, case_dir, solver, [solver])

    vtk_args = ["foamToVTK"]
    if run_settings.get("vtk_all_times", False):
        vtk_args.append("-allTime")
    else:
        vtk_args.append("-latestTime")

    run_step(self, job_id, case_dir, "foamToVTK", vtk_args)

    post_dir = case_dir / "postProcessing"
    post_dir.mkdir(exist_ok=True)

    residuals = parse_residuals(case_dir)
    (post_dir / "residuals.json").write_text(json.dumps(residuals, indent=2))

    mesh_report = parse_check_mesh(case_dir)
    mesh_report["solver"] = solver
    mesh_report["processors"] = processors
    mesh_report["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    (post_dir / "report.json").write_text(json.dumps(mesh_report, indent=2))

    return {
        "status": "completed",
        "case_id": case_id,
        "solver": solver,
        "processors": processors,
    }


# ponytail: DUPLICAZIONE VOLUTA con backend/app/routers/terminal.py::ALLOWED_COMMANDS,
# stesso motivo di ALLOWED_SOLVERS sopra - il worker e' l'ultima linea di
# difesa prima che il nome del comando diventi argv reale. Qui il valore e'
# l'argv list intera (non solo il nome del binario): un utente non deve
# poter passare flag arbitrari a un comando altrimenti innocuo. Se aggiungi
# un comando qui, aggiungilo anche nel router con la stessa chiave.
ALLOWED_TERMINAL_COMMANDS = {
    "ls": ["ls", "-lah"],
    "pwd": ["pwd"],
    "foamInfo": ["foamInfo"],
    "checkMesh": ["checkMesh"],
    "foamToVTK": ["foamToVTK", "-latestTime"],
}

# comandi di ispezione rapida: se durano piu' di 2 minuti qualcosa non va
# (a differenza di una run solver, che puo' legittimamente durare ore).
TERMINAL_COMMAND_TIMEOUT_SECONDS = 120


@celery.task(bind=True, name="tasks.run_terminal_command")
def run_terminal_command(self, case_id, command_name):
    """Esegue un comando allowlisted nella directory del caso, riusando
    la stessa infrastruttura di run_step (log su file, cancellazione via
    redis, timeout, kill del process group) usata per mesh/solver.
    L'endpoint terminal.py era finora uno stub che non eseguiva nulla."""
    job_id = self.request.id
    case_dir = CASE_ROOT / case_id

    if not case_dir.exists():
        raise FileNotFoundError(f"Caso non trovato: {case_id}")

    if command_name not in ALLOWED_TERMINAL_COMMANDS:
        raise ValueError(f"Comando non consentito: {command_name!r}")

    args = ALLOWED_TERMINAL_COMMANDS[command_name]
    step_name = f"terminal-{command_name}"

    run_step(
        self,
        job_id,
        case_dir,
        step_name,
        args,
        timeout_seconds=TERMINAL_COMMAND_TIMEOUT_SECONDS,
    )

    log_path = case_dir / f"log.{step_name}"
    output = log_path.read_text(errors="ignore") if log_path.exists() else ""

    return {
        "status": "completed",
        "case_id": case_id,
        "command": command_name,
        "output": output,
    }