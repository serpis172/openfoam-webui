"""Regressione: coerenza tra snappyHexMeshDict e boundary condition.

Il patch creato da snappyHexMesh prende il nome della geometria; le
boundary condition (validate da CaseConfig) usano Path(stl_file).stem.
Se i due nomi divergono la mesh si genera ma il solver fallisce con
"Cannot find patchField entry". Questi test bloccano la divergenza senza
richiedere OpenFOAM (il controllo con blockMesh/snappyHexMesh reali e'
in tests/integration/, eseguito nel job CI openfoam-integration).
"""

import os
import re
import tempfile

os.environ.setdefault("DATA_ROOT", tempfile.mkdtemp())
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from pathlib import Path

import pytest

from app.models import BoundaryCondition, CaseConfig, MeshSettings
from app.templates_generator import generate_case_files


def _snappy_config(stl_file: str, layers: int = 0) -> CaseConfig:
    surface = Path(stl_file).stem
    return CaseConfig(
        mesh=MeshSettings(mesh_type="snappyHexMesh", stl_file=stl_file, layers=layers),
        boundaries=[
            BoundaryCondition(name="inlet"),
            BoundaryCondition(name="outlet", U_type="zeroGradient", p_type="fixedValue"),
            BoundaryCondition(name="walls", patch_type="wall", U_type="noSlip"),
            BoundaryCondition(name=surface, patch_type="wall", U_type="noSlip"),
        ],
    )


@pytest.mark.parametrize("stl_file", ["car.stl", "constant/triSurface/geometry.v2.final.stl"])
def test_surface_name_matches_boundary_patch(stl_file):
    case_dir = Path(tempfile.mkdtemp())
    config = _snappy_config(stl_file, layers=3)
    generate_case_files(case_dir, config, {"solver": "simpleFoam"})

    surface = Path(stl_file).stem
    text = (case_dir / "system/snappyHexMeshDict").read_text()

    assert f"name {surface};" in text
    assert re.search(rf"refinementSurfaces\s*\{{\s*{re.escape(surface)}\s*\{{", text)
    assert re.search(rf"layers\s*\{{\s*{re.escape(surface)}\s*\{{", text)
    assert "name geometry;" not in text
    assert surface in (case_dir / "0/U").read_text()


def test_snap_controls_use_valid_keywords():
    case_dir = Path(tempfile.mkdtemp())
    generate_case_files(case_dir, _snappy_config("car.stl"), {"solver": "simpleFoam"})
    text = (case_dir / "system/snappyHexMeshDict").read_text()

    assert "explicitFeatures" not in text
    assert "implicitFeatureSnap false;" in text
    assert "explicitFeatureSnap false;" in text
    assert ".eMesh" not in text
