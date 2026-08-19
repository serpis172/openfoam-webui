import argparse
import asyncio
import os
from pathlib import Path

import pyvista as pv
from trame.app import get_server
from trame.ui.vuetify3 import SinglePageLayout
from trame.widgets import vuetify3, vtk as vtk_widgets

parser = argparse.ArgumentParser()
parser.add_argument("--case", default=os.getenv("CASE_ID", ""))
parser.add_argument("--data-root", default=os.getenv("DATA_ROOT", "/data"))
parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
args, _ = parser.parse_known_args()

DATA_ROOT = Path(args.data_root) / "cases"


def find_vtk_files(case_id):
    if not case_id:
        return []
    case_dir = DATA_ROOT / case_id
    if not case_dir.exists():
        return []
    return sorted(case_dir.glob("VTK/**/*.vt*"))


def list_available_cases():
    if not DATA_ROOT.exists():
        return []
    cases = []
    for case_dir in sorted(DATA_ROOT.iterdir()):
        if case_dir.is_dir():
            vtk_files = list(case_dir.glob("VTK/**/*.vt*"))
            if vtk_files:
                name = case_dir.name
                meta_file = case_dir / "case.json"
                if meta_file.exists():
                    try:
                        import json
                        meta = json.loads(meta_file.read_text())
                        name = meta.get("name", case_dir.name)
                    except Exception:
                        pass
                cases.append({"id": case_dir.name, "name": name})
    return cases


# Stato iniziale
initial_case = args.case
available_cases = list_available_cases()

if not initial_case and available_cases:
    initial_case = available_cases[0]["id"]

vtk_files = find_vtk_files(initial_case)

# Carica mesh iniziale
mesh = pv.Wavelet()
if vtk_files:
    try:
        loaded = pv.read(str(vtk_files[-1]))
        if isinstance(loaded, pv.MultiBlock):
            loaded = loaded.combine()
        mesh = loaded
    except Exception as e:
        print(f"Errore caricamento: {e}")

fields = ["None"] + list(mesh.array_names) if hasattr(mesh, 'array_names') else ["None"]
times = [str(i) for i in range(len(vtk_files))] if vtk_files else ["0"]

server = get_server(client_type="vue3")

server.state.case_id = initial_case
server.state.case_list = [{"title": c["name"], "value": c["id"]} for c in available_cases]
server.state.field = fields[1] if len(fields) > 1 else "None"
server.state.field_list = fields
server.state.time_index = len(times) - 1 if times else 0
server.state.time_list = [{"title": t, "value": i} for i, t in enumerate(times)]
server.state.show_slice = False
server.state.show_streamlines = False
server.state.slice_normal = "Z"
server.state.message = f"Caso: {initial_case or 'nessuno'} - {len(vtk_files)} timestep"
server.state.has_data = len(vtk_files) > 0

plotter = pv.Plotter()
plotter.background_color = "#111827"


def rebuild_scene():
    global mesh
    
    plotter.clear()
    
    if not server.state.has_data:
        plotter.add_text("Nessun dato VTK disponibile", font_size=14)
        plotter.render()
        return
    
    field = server.state.field
    scalars = field if field != "None" and field in mesh.array_names else None
    
    try:
        plotter.add_mesh(
            mesh,
            scalars=scalars,
            show_scalar_bar=bool(scalars),
        )
        
        if server.state.show_slice:
            normal_map = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}
            normal = normal_map.get(server.state.slice_normal, (0, 0, 1))
            slice_mesh = mesh.slice(normal=normal)
            plotter.add_mesh(slice_mesh, scalars=scalars, cmap="coolwarm")
        
        if server.state.show_streamlines and "U" in mesh.array_names:
            streams = mesh.streamlines("U", n_points=50)
            plotter.add_mesh(streams, color="yellow")
        
        plotter.reset_camera()
        plotter.render()
    except Exception as e:
        server.state.message = f"Errore rendering: {e}"


rebuild_scene()


def load_case(case_id):
    global mesh, vtk_files, fields, times
    
    vtk_files = find_vtk_files(case_id)
    
    if not vtk_files:
        server.state.message = f"Nessun VTK per {case_id}"
        server.state.has_data = False
        return
    
    try:
        loaded = pv.read(str(vtk_files[-1]))
        if isinstance(loaded, pv.MultiBlock):
            loaded = loaded.combine()
        mesh = loaded
        server.state.has_data = True
        fields = ["None"] + list(mesh.array_names)
        server.state.field_list = fields
        server.state.field = fields[1] if len(fields) > 1 else "None"
        times = [str(i) for i in range(len(vtk_files))]
        server.state.time_list = [{"title": t, "value": i} for i, t in enumerate(times)]
        server.state.time_index = len(times) - 1
        server.state.message = f"Caricato {case_id}: {len(vtk_files)} timestep"
        rebuild_scene()
    except Exception as e:
        server.state.message = f"Errore: {e}"


@server.state.change("case_id")
def on_case_change(case_id, **kwargs):
    load_case(case_id)


@server.state.change("time_index")
def on_time_change(time_index, **kwargs):
    global mesh
    if vtk_files:
        idx = max(0, min(int(time_index), len(vtk_files) - 1))
        try:
            loaded = pv.read(str(vtk_files[idx]))
            if isinstance(loaded, pv.MultiBlock):
                loaded = loaded.combine()
            mesh = loaded
            rebuild_scene()
        except Exception as e:
            server.state.message = f"Errore timestep: {e}"


@server.state.change("field", "show_slice", "show_streamlines", "slice_normal")
def on_scene_change(**kwargs):
    rebuild_scene()


with SinglePageLayout(server) as layout:
    layout.title.set_text("OpenFOAM Viewer 3D")
    
    with layout.toolbar:
        vuetify3.VSelect(
            label="Caso",
            v_model=("case_id", server.state.case_id),
            items=("case_list", server.state.case_list),
            density="compact",
            hide_details=True,
            style="max-width: 200px",
        )
        
        vuetify3.VSelect(
            label="Tempo",
            v_model=("time_index", server.state.time_index),
            items=("time_list", server.state.time_list),
            density="compact",
            hide_details=True,
            style="max-width: 100px",
        )
        
        vuetify3.VSelect(
            label="Campo",
            v_model=("field", server.state.field),
            items=("field_list", server.state.field_list),
            density="compact",
            hide_details=True,
            style="max-width: 150px",
        )
        
        vuetify3.VSelect(
            label="Slice",
            v_model=("slice_normal", server.state.slice_normal),
            items=("normal_list", ["X", "Y", "Z"]),
            density="compact",
            hide_details=True,
            style="max-width: 100px",
        )
        
        vuetify3.VCheckbox(
            label="Slice",
            v_model=("show_slice", server.state.show_slice),
            density="compact",
            hide_details=True,
        )
        
        vuetify3.VCheckbox(
            label="Streamlines",
            v_model=("show_streamlines", server.state.show_streamlines),
            density="compact",
            hide_details=True,
        )
    
    with layout.content:
        with vuetify3.VContainer(fluid=True, classes="pa-0 fill-height"):
            vtk_widgets.VtkRemoteView(plotter.render_window)
    
    with layout.footer:
        vuetify3.VAlert(
            "{{ message }}",
            v_model=("message", server.state.message),
            density="compact",
            text=True,
        )


if __name__ == "__main__":
    server.start(port=args.port, timeout=0)
