"""Scoperta case/timestep per il viewer 3D.

Tenuto separato da trame_app.py apposta: niente pyvista/trame qui dentro,
quindi è testabile con file/dir finti senza bisogno di un contesto GL.
"""
from __future__ import annotations

from pathlib import Path


def list_case_ids(cases_root: Path) -> list[str]:
    if not cases_root.exists():
        return []
    return sorted(p.name for p in cases_root.iterdir() if p.is_dir())


def latest_case_id(cases_root: Path) -> str | None:
    """Caso con la modifica più recente (config.json o directory VTK)."""
    cases = list_case_ids(cases_root)
    if not cases:
        return None

    def mtime(case_id: str) -> float:
        case_dir = cases_root / case_id
        candidates = [case_dir / "case.json", case_dir / "config.json"]
        times = [c.stat().st_mtime for c in candidates if c.exists()]
        times.append(case_dir.stat().st_mtime)
        return max(times)

    return max(cases, key=mtime)


def _timestep_sort_key(vtk_file: Path) -> float:
    """I timestep OpenFOAM sono cartelle come VTK/20, VTK/100: un sort
    lessicografico su stringhe li ordina male ("100" prima di "20").
    Il nome della cartella immediatamente sotto VTK/ è il tempo numerico."""
    for parent in vtk_file.parents:
        if parent.name == "VTK":
            break
        try:
            return float(parent.name)
        except ValueError:
            continue
    return 0.0


def list_vtk_files(cases_root: Path, case_id: str) -> list[Path]:
    case_dir = cases_root / case_id
    if not case_dir.exists():
        return []
    return sorted(case_dir.glob("VTK/**/*.vt*"), key=_timestep_sort_key)


def latest_geometry_file(cases_root: Path, case_id: str) -> Path | None:
    """Fallback quando non ci sono ancora risultati VTK: mostra la
    geometria caricata (STL) cosi' il viewer non e' vuoto durante il setup."""
    tri_dir = cases_root / case_id / "constant" / "triSurface"
    if not tri_dir.exists():
        return None
    candidates = sorted(tri_dir.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def vtk_snapshot_mtime(cases_root: Path, case_id: str) -> float:
    """Timestamp piu' recente tra i file VTK di un caso: usato dal poll
    loop per capire se sono arrivati nuovi risultati senza ricaricare
    tutto ad ogni tick."""
    files = list_vtk_files(cases_root, case_id)
    if not files:
        return 0.0
    return max(f.stat().st_mtime for f in files)
