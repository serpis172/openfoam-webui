import argparse
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

case_dir = Path(args.data_root) / "cases" / args.case if args.case else None
vtk_files = []

if case_dir and case_dir.exists():
    vtk_files = sorted(case_dir.glob("VTK/**/*.vt*"))

mesh = pv.Wavelet() if not vtk_files else pv.read(str(vtk_files[-1]))

if isinstance(mesh, pv.MultiBlock):
    mesh = mesh.combine()

fields = ["None"] + list(mesh.array_names)
times = [str(i) for i in range(len(vtk_files))] if vtk_files else ["0"]

server = get_server(client_type="vue3")

server.state.field = fields[1] if len(fields) > 1 else "None"
server.state.time_index = len(times) - 1
server.state.show_slice = False
server.state.show_streamlines = False
server.state.show_iso = False
server.state.iso_value = 0.0
server.state.slice_normal = "Z"
server.state.message = ""

plotter = pv.Plotter()
plotter.background_color = "#111827"


def load_time(index: int):
    global mesh

    if not vtk_files:
        return

    index = max(0, min(int(index), len(vtk_files) - 1))
    loaded = pv.read(str(vtk_files[index]))

    if isinstance(loaded, pv.MultiBlock):
        loaded = loaded.combine()

    mesh = loaded


def rebuild_scene():
    plotter.clear()

    field = server.state.field
    scalars = field if field != "None" and field in mesh.array_names else None

    plotter.add_mesh(
        mesh,
        scalars=scalars,
        show_scalar_bar=bool(scalars),
        opacity=1.0,
    )

    if server.state.show_slice:
        normal_map = {
            "X": (1, 0, 0),
            "Y": (0, 1, 0),
            "Z": (0, 0, 1),
        }
        normal = normal_map.get(server.state.slice_normal, (0, 0, 1))

        try:
            slice_mesh = mesh.slice(normal=normal)
            plotter.add_mesh(slice_mesh, scalars=scalars, cmap="coolwarm")
        except Exception as exc:
            server.state.message = f"Slice non riuscita: {exc}"

    if server.state.show_streamlines and "U" in mesh.array_names:
        try:
            streams = mesh.streamlines("U", n_points=80, radius=0.002)
            plotter.add_mesh(streams, color="yellow")
        except Exception as exc:
            server.state.message = f"Streamlines non riuscite: {exc}"

    if server.state.show_iso and scalars:
        try:
            iso = mesh.contour([float(server.state.iso_value)], scalars=scalars)
            plotter.add_mesh(iso, color="red", opacity=0.8)
        except Exception as exc:
            server.state.message = f"Iso-surface non riuscita: {exc}"

    plotter.reset_camera()
    plotter.render()


rebuild_scene()


@server.state.change("time_index")
def update_time(time_index, **kwargs):
    load_time(time_index)
    rebuild_scene()


@server.state.change("field", "show_slice", "show_streamlines", "show_iso", "iso_value", "slice_normal")
def update_scene(**kwargs):
    rebuild_scene()


def take_screenshot():
    if case_dir:
        out = case_dir / "viewer_screenshot.png"
        plotter.screenshot(str(out))
        server.state.message = f"Screenshot salvato in {out.name}"
    else:
        server.state.message = "Nessun caso selezionato"


with SinglePageLayout(server) as layout:
    layout.title.set_text("OpenFOAM Viewer 3D")

    with layout.toolbar:
        vuetify3.VSelect(
            label="Tempo",
            v_model=("time_index", server.state.time_index),
            items=("time_list", [{"title": t, "value": i} for i, t in enumerate(times)]),
            density="compact",
            hide_details=True,
            style="max-width: 120px",
        )

        vuetify3.VSelect(
            label="Campo",
            v_model=("field", server.state.field),
            items=("field_list", fields),
            density="compact",
            hide_details=True,
            style="max-width: 180px",
        )

        vuetify3.VSelect(
            label="Normale slice",
            v_model=("slice_normal", server.state.slice_normal),
            items=("normal_list", ["X", "Y", "Z"]),
            density="compact",
            hide_details=True,
            style="max-width: 140px",
        )

        vuetify3.VTextField(
            label="Iso value",
            v_model=("iso_value", server.state.iso_value),
            type="number",
            density="compact",
            hide_details=True,
            style="max-width: 120px",
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

        vuetify3.VCheckbox(
            label="Iso",
            v_model=("show_iso", server.state.show_iso),
            density="compact",
            hide_details=True,
        )

        vuetify3.VBtn(
            "Screenshot",
            click=take_screenshot,
            color="primary",
            density="compact",
        )

        vuetify3.VBtn(
            "Reset camera",
            click="view.resetCamera()",
            density="compact",
        )

    with layout.content:
        with vuetify3.VContainer(fluid=True, classes="pa-0 fill-height"):
            view = vtk_widgets.VtkRemoteView(plotter.render_window)

    with layout.footer:
        vuetify3.VAlert(
            "{{ message }}",
            v_model=("message", server.state.message),
            density="compact",
            text=True,
        )


if __name__ == "__main__":
    server.start(port=args.port, timeout=0)