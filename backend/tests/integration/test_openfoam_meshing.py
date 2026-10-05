"""Test di integrazione con OpenFOAM REALE (ROADMAP.md, voce T6).

Ogni altro test di questa suite si ferma a "il file generato ha il
contenuto atteso" o "foamlib riesce a rileggerlo". Nessuno provava che
blockMesh/snappyHexMesh/checkMesh/il solver accettassero davvero i file
prodotti da templates_generator.py: e' li' che nascevano i "meshing fail".

Questi test girano solo se OPENFOAM_BASHRC punta a uno script esistente
(job CI `openfoam-integration`, oppure dentro il container worker); altrove
vengono saltati, cosi' `pytest tests` resta eseguibile senza OpenFOAM.

Se un test qui fallisce, il messaggio contiene la coda del log del comando
OpenFOAM: e' quasi sempre una segnalazione reale di un dict generato male.
"""

import os
import re
import subprocess
import tempfile

os.environ.setdefault("DATA_ROOT", tempfile.mkdtemp())
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from pathlib import Path

import numpy as np
import pytest

from app.models import BoundaryCondition, CaseConfig, MeshSettings, PhysicsConfig
from app.templates_generator import generate_case_files

BASHRC = os.environ.get("OPENFOAM_BASHRC", "")

pytestmark = pytest.mark.skipif(
    not (BASHRC and Path(BASHRC).is_file()),
    reason="OpenFOAM non disponibile (OPENFOAM_BASHRC non impostato o inesistente)",
)


def run_foam(case_dir: Path, *cmd: str, timeout: int = 900) -> str:
    proc = subprocess.run(
        ["bash", "-c", 'source "$1" >/dev/null 2>&1; shift; exec "$@"', "foam", BASHRC, *cmd],
        cwd=case_dir,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    output = proc.stdout + proc.stderr
    tail = "\n".join(output.splitlines()[-40:])
    assert proc.returncode == 0, f"`{' '.join(cmd)}` fallito (rc={proc.returncode}):\n{tail}"
    return output


def patch_names(case_dir: Path) -> set:
    text = (case_dir / "constant/polyMesh/boundary").read_text()
    return set(re.findall(r"^ {4}([^\s{}]+)\s*\n\s*\{", text, re.MULTILINE))


def write_cube_stl(path: Path, name: str, half: float = 0.5) -> None:
    h = half
    faces = [
        [(h, -h, -h), (h, h, -h), (h, h, h), (h, -h, h)],
        [(-h, -h, -h), (-h, -h, h), (-h, h, h), (-h, h, -h)],
        [(-h, h, -h), (-h, h, h), (h, h, h), (h, h, -h)],
        [(-h, -h, -h), (h, -h, -h), (h, -h, h), (-h, -h, h)],
        [(-h, -h, h), (h, -h, h), (h, h, h), (-h, h, h)],
        [(-h, -h, -h), (-h, h, -h), (h, h, -h), (h, -h, -h)],
    ]
    lines = [f"solid {name}"]
    for quad in faces:
        for tri in ((quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])):
            a, b, c = (np.array(v, dtype=float) for v in tri)
            n = np.cross(b - a, c - a)
            n = n / np.linalg.norm(n)
            lines.append(f"  facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}")
            lines.append("    outer loop")
            for v in tri:
                lines.append(f"      vertex {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}")
            lines.append("    endloop")
            lines.append("  endfacet")
    lines.append(f"endsolid {name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


@pytest.fixture
def block_case(tmp_path):
    config = CaseConfig(
        mesh=MeshSettings(cells=[12, 6, 6]),
        physics=PhysicsConfig(end_time=3, write_interval=3),
    )
    generate_case_files(tmp_path, config, {"solver": "simpleFoam"})
    return tmp_path


@pytest.fixture
def snappy_case(tmp_path):
    config = CaseConfig(
        mesh=MeshSettings(
            mesh_type="snappyHexMesh",
            stl_file="box.stl",
            domain_min=[-2, -2, -2],
            domain_max=[2, 2, 2],
            cells=[8, 8, 8],
            location_in_mesh=[1.5, 1.5, 1.5],
            surface_refinement=1,
            layers=0,
        ),
        boundaries=[
            BoundaryCondition(name="inlet"),
            BoundaryCondition(name="outlet", U_type="zeroGradient", p_type="fixedValue"),
            BoundaryCondition(name="walls", patch_type="wall", U_type="noSlip"),
            BoundaryCondition(name="box", patch_type="wall", U_type="noSlip"),
        ],
        physics=PhysicsConfig(end_time=2, write_interval=2),
    )
    generate_case_files(tmp_path, config, {"solver": "simpleFoam"})
    write_cube_stl(tmp_path / "constant/triSurface/box.stl", "box")
    return tmp_path


def test_blockmesh_and_checkmesh(block_case):
    run_foam(block_case, "blockMesh")
    assert {"inlet", "outlet", "walls"} <= patch_names(block_case)
    assert "Mesh OK" in run_foam(block_case, "checkMesh")


def test_solver_runs_on_generated_blockmesh_case(block_case):
    run_foam(block_case, "blockMesh")
    log = run_foam(block_case, "simpleFoam")
    assert "End" in log


def test_snappyhexmesh_creates_patch_named_like_stl(snappy_case):
    run_foam(snappy_case, "blockMesh")
    run_foam(snappy_case, "snappyHexMesh", "-overwrite")
    names = patch_names(snappy_case)
    assert "box" in names, f"patch presenti dopo snappyHexMesh: {sorted(names)}"
    assert "Mesh OK" in run_foam(snappy_case, "checkMesh")


def test_solver_runs_on_snappyhexmesh_case(snappy_case):
    run_foam(snappy_case, "blockMesh")
    run_foam(snappy_case, "snappyHexMesh", "-overwrite")
    assert "End" in run_foam(snappy_case, "simpleFoam")
