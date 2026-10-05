"""Test delle funzioni pure/di controllo di tasks.py (nessun OpenFOAM,
nessun Redis reale: i punti di contatto con l'esterno sono monkeypatchati)."""

import json
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("CASE_ROOT", tempfile.mkdtemp())
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

import tasks


def test_clean_case_keeps_initial_conditions(tmp_path):
    (tmp_path / "0").mkdir()
    (tmp_path / "0/U").write_text("initial U")
    (tmp_path / "system").mkdir()
    (tmp_path / "system/controlDict").write_text("x")

    tasks.clean_case(tmp_path)

    assert (tmp_path / "0/U").read_text() == "initial U"
    assert (tmp_path / "system/controlDict").exists()


def test_clean_case_removes_previous_results(tmp_path):
    (tmp_path / "0").mkdir()
    for name in ("100", "200.5", "1e-05", "processor0", "VTK"):
        (tmp_path / name).mkdir()
    (tmp_path / "constant/polyMesh").mkdir(parents=True)
    (tmp_path / "constant/transportProperties").write_text("nu 1e-5;")
    (tmp_path / "log.blockMesh").write_text("old")

    tasks.clean_case(tmp_path)

    remaining = {p.name for p in tmp_path.iterdir()}
    assert remaining == {"0", "constant"}
    assert (tmp_path / "constant/transportProperties").exists()
    assert not (tmp_path / "constant/polyMesh").exists()


def test_clean_case_does_not_touch_non_time_dirs_starting_with_digit(tmp_path):
    (tmp_path / "3d-notes").mkdir()
    tasks.clean_case(tmp_path)
    assert (tmp_path / "3d-notes").exists()


def _case_with_dicts(tmp_path, snappy=False, stl=False):
    (tmp_path / "system").mkdir()
    (tmp_path / "system/blockMeshDict").write_text("x")
    if snappy:
        (tmp_path / "system/snappyHexMeshDict").write_text("x")
    if stl:
        (tmp_path / "constant/triSurface").mkdir(parents=True)
        (tmp_path / "constant/triSurface/car.stl").write_text("solid car\nendsolid car\n")
    return tmp_path


def test_inputs_ok_blockmesh(tmp_path):
    tasks.check_mesh_inputs(_case_with_dicts(tmp_path), {}, "blockMesh")


def test_inputs_reject_unknown_mesh_type(tmp_path):
    with pytest.raises(RuntimeError, match="mesh_type non supportato"):
        tasks.check_mesh_inputs(_case_with_dicts(tmp_path), {}, "cfMesh")


def test_inputs_missing_blockmeshdict(tmp_path):
    with pytest.raises(RuntimeError, match="blockMeshDict mancante"):
        tasks.check_mesh_inputs(tmp_path, {}, "blockMesh")


def test_inputs_snappy_without_stl_setting(tmp_path):
    with pytest.raises(RuntimeError, match="nessun file STL"):
        tasks.check_mesh_inputs(_case_with_dicts(tmp_path, snappy=True), {"stl_file": ""}, "snappyHexMesh")


def test_inputs_snappy_stl_not_uploaded(tmp_path):
    with pytest.raises(RuntimeError, match="non trovato in constant/triSurface"):
        tasks.check_mesh_inputs(
            _case_with_dicts(tmp_path, snappy=True), {"stl_file": "car.stl"}, "snappyHexMesh"
        )


def test_inputs_snappy_missing_dict(tmp_path):
    with pytest.raises(RuntimeError, match="snappyHexMeshDict mancante"):
        tasks.check_mesh_inputs(
            _case_with_dicts(tmp_path, stl=True), {"stl_file": "car.stl"}, "snappyHexMesh"
        )


def test_inputs_snappy_ok_with_path_in_setting(tmp_path):
    case = _case_with_dicts(tmp_path, snappy=True, stl=True)
    tasks.check_mesh_inputs(case, {"stl_file": "constant/triSurface/car.stl"}, "snappyHexMesh")


def test_bashrc_uses_configured_path(tmp_path, monkeypatch):
    rc = tmp_path / "bashrc"
    rc.write_text("")
    monkeypatch.setattr(tasks, "OPENFOAM_BASHRC", str(rc))
    assert tasks.find_openfoam_bashrc() == rc


def test_bashrc_missing_gives_actionable_error(tmp_path, monkeypatch):
    monkeypatch.setattr(tasks, "OPENFOAM_BASHRC", str(tmp_path / "nope/bashrc"))
    monkeypatch.setattr(Path, "glob", lambda self, pattern: iter(()))
    with pytest.raises(RuntimeError, match="OPENFOAM_BASHRC"):
        tasks.find_openfoam_bashrc()


def test_run_stops_on_invalid_mesh(tmp_path, monkeypatch):
    case_dir = tmp_path / "abc"
    case_dir.mkdir()
    (case_dir / "config.json").write_text(json.dumps({
        "physics": {"solver": "simpleFoam"},
        "mesh": {"processors": 1},
    }))
    monkeypatch.setattr(tasks, "CASE_ROOT", tmp_path)
    monkeypatch.setattr(
        tasks, "_generate_mesh",
        lambda *a, **k: {"mesh_valid": False, "quality_issues": ["Mesh has zero cells"]},
    )
    solver_calls = []
    monkeypatch.setattr(tasks, "run_step", lambda *a, **k: solver_calls.append(a))

    with pytest.raises(RuntimeError, match="simulazione non avviata.*zero cells"):
        tasks.run_openfoam_case.run("abc")

    assert solver_calls == []
