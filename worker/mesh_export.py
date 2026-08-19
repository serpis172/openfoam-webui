"""Converte l'output mesh di OpenFOAM (VTK) in un glTF leggero per il
preview WebGL lato client (three.js). Vive nel worker (non in viz/)
perché e' il worker che ha appena generato la mesh e ha gia' in mano il
file VTK: evita un giro extra caso->rete->altro-container.
"""
from __future__ import annotations

from pathlib import Path

import pyvista as pv


def _read_single(path: Path) -> pv.DataSet:
    loaded = pv.read(str(path))
    return loaded.combine() if isinstance(loaded, pv.MultiBlock) else loaded


def export_mesh_preview(
    vtk_file: Path,
    output_path: Path,
    max_triangles: int = 300_000,
) -> dict:
    """Legge un file VTK (mesh o risultati), estrae la sola superficie di
    confine (i volumi interni non servono per un preview visivo), la
    decima se troppo pesante per un browser, e la esporta come .glb.

    Ritorna statistiche (celle originali, triangoli esportati, se e'
    stata decimata) da mostrare nella UI accanto al preview.
    """
    mesh = _read_single(vtk_file)
    original_cells = mesh.n_cells

    surface = mesh.extract_surface(algorithm="dataset_surface")
    surface = surface.triangulate()

    decimated = False
    n_triangles = surface.n_cells

    if n_triangles > max_triangles:
        # target_reduction e' una frazione (0-1): quanta % di triangoli
        # rimuovere per restare sotto il tetto
        target_reduction = 1.0 - (max_triangles / n_triangles)
        surface = surface.decimate(target_reduction)
        decimated = True
        n_triangles = surface.n_cells

    output_path.parent.mkdir(parents=True, exist_ok=True)

    plotter = pv.Plotter(off_screen=True)
    plotter.add_mesh(surface, color="white")
    plotter.export_gltf(str(output_path))
    plotter.close()

    return {
        "original_cells": original_cells,
        "exported_triangles": n_triangles,
        "decimated": decimated,
        "points": surface.n_points,
    }


def export_stl_as_preview(stl_file: Path, output_path: Path, max_triangles: int = 300_000) -> dict:
    """Stessa cosa ma per la geometria grezza caricata (prima che esista
    una mesh): in pratica il frontend potrebbe caricare l'STL
    direttamente via three.js STLLoader senza passare da qui, questa
    funzione serve solo come fallback/coerenza se in futuro vogliamo
    unificare il formato servito al client."""
    return export_mesh_preview(stl_file, output_path, max_triangles)
