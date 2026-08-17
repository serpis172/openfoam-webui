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

    cells = re.search(r"cells:\s+(\d+)", text)
    if cells:
        report["cells"] = int(cells.group(1))

    non_ortho = re.search(r"Mesh non-orthogonality Max:\s+([0-9.eE+-]+)", text)
    if non_ortho:
        report["max_non_orthogonality"] = float(non_ortho.group(1))

    skewness = re.search(r"Max skewness:\s+([0-9.eE+-]+)", text)
    if skewness:
        report["max_skewness"] = float(skewness.group(1))

    return report


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
    processors = int(mesh.get("processors", 1))

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

        run_step(self, job_id, case_dir, "surfaceFeatureExtract", ["surfaceFeatureExtract"])
        run_step(self, job_id, case_dir, "snappyHexMesh", ["snappyHexMesh", "-overwrite"])

    if run_settings.get("run_check_mesh", True):
        run_step(self, job_id, case_dir, "checkMesh", ["checkMesh"])

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