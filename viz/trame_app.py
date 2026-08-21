import argparse
import asyncio
import os
from pathlib import Path

import pyvista as pv
from trame.app import get_server
from trame.ui.vuetify3 import SinglePageLayout
from trame.widgets import vuetify3, vtk as vtk_widgets

from case_registry import (
    latest_case_id,
    latest_geometry_file,
    list_case_ids,
    list_vtk_files,
    vtk_snapshot_mtime,
)

parser = argparse.ArgumentParser()
parser.add_argument("--case", default=os.getenv("CASE_ID", ""))
parser.add_argument("--data-root", default=os.getenv("DATA_ROOT", "/data"))
parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
args, _ = parser.parse_known_args()

CASES_ROOT = Path(args.data_root) / "cases"
POLL_SECONDS = 3

server = get_server(client_type="vue3")
ctrl = server.controller
state = server.state

# --case (o CASE_ID) resta come default per compatibilita', ma non e' piu'
# l'unica sorgente: e' solo il valore iniziale di uno stato reattivo che
# l'utente puo' cambiare a runtime (dropdown) o via ?case_id=... nell'URL
# (trame_client fa il merge automatico dei query param nello stato iniziale).
state.case_id = args.case or latest_case_id(CASES_ROOT) or ""
state.case_list = list_case_ids(CASES_ROOT)
state.field = "None"
state.field_list = ["None"]
state.time_index = 0
state.time_list = []
state.show_slice = False
state.show_streamlines = False
state.show_iso = False
state.iso_value = 0.0
state.slice_normal = "Z"
state.follow_latest = True  # segue l'ultimo timestep man mano che arriva
state.message = "" if state.case_id else "Nessun caso trovato"
state.geometry_only = False

plotter = pv.Plotter()
plotter.background_color = "#111827"

_vtk_files: list[Path] = []
_mesh: pv.DataSet | None = None
_last_snapshot_mtime = 0.0


def _read_single(path: Path) -> pv.DataSet:
    loaded = pv.read(str(path))
    return loaded.combine() if isinstance(loaded, pv.MultiBlock) else loaded


def refresh_case_list():
    state.case_list = list_case_ids(CASES_ROOT)


def load_case(case_id: str, *, preserve_index: bool = False):
    """Punto centrale: ricarica tutto (lista timestep, mesh, campi) per
    il caso scelto. Chiamato al cambio di case_id, e dal poll loop quando
    arrivano nuovi timestep sul caso corrente."""
    global _vtk_files, _mesh, _last_snapshot_mtime

    _vtk_files = list_vtk_files(CASES_ROOT, case_id) if case_id else []
    _last_snapshot_mtime = vtk_snapshot_mtime(CASES_ROOT, case_id) if case_id else 0.0

    if _vtk_files:
        state.geometry_only = False
        state.time_list = [
            {"title": p.parent.name, "value": i} for i, p in enumerate(_vtk_files)
        ]
        index = min(state.time_index, len(_vtk_files) - 1) if preserve_index else len(_vtk_files) - 1
        index = max(index, 0)
        state.time_index = index
        _mesh = _read_single(_vtk_files[index])
        state.message = ""
    else:
        state.time_list = []
        state.time_index = 0
        geo = latest_geometry_file(CASES_ROOT, case_id) if case_id else None
        if geo:
            state.geometry_only = True
            _mesh = _read_single(geo)
            state.message = f"Nessun risultato ancora: anteprima geometria ({geo.name})"
        else:
            state.geometry_only = False
            _mesh = pv.Wavelet()
            state.message = "Nessuna geometria o risultato per questo caso" if case_id else "Nessun caso selezionato"

    state.field_list = ["None"] + list(_mesh.array_names)
    if state.field not in state.field_list:
        state.field = state.field_list[1] if len(state.field_list) > 1 else "None"

    rebuild_scene()


def rebuild_scene():
    plotter.clear()

    if _mesh is None:
        plotter.render()
        return

    field = state.field
    scalars = field if field != "None" and field in _mesh.array_names else None

    plotter.add_mesh(_mesh, scalars=scalars, show_scalar_bar=bool(scalars), opacity=1.0)

    if state.show_slice and not state.geometry_only:
        normal = {"X": (1, 0, 0), "Y": (0, 1, 0), "Z": (0, 0, 1)}.get(state.slice_normal, (0, 0, 1))
        try:
            plotter.add_mesh(_mesh.slice(normal=normal), scalars=scalars, cmap="coolwarm")
        except Exception as exc:
            state.message = f"Slice non riuscita: {exc}"

    if state.show_streamlines and not state.geometry_only and "U" in _mesh.array_names:
        try:
            plotter.add_mesh(_mesh.streamlines("U", n_points=80, radius=0.002), color="yellow")
        except Exception as exc:
            state.message = f"Streamlines non riuscite: {exc}"

    if state.show_iso and not state.geometry_only and scalars:
        try:
            plotter.add_mesh(_mesh.contour([float(state.iso_value)], scalars=scalars), color="red", opacity=0.8)
        except Exception as exc:
            state.message = f"Iso-surface non riuscita: {exc}"

    plotter.reset_camera()
    plotter.render()


@state.change("case_id")
def on_case_change(case_id, **kwargs):
    load_case(case_id, preserve_index=False)


@state.change("time_index")
def on_time_change(time_index, **kwargs):
    global _mesh
    if not _vtk_files:
        return
    idx = max(0, min(int(time_index), len(_vtk_files) - 1))
    _mesh = _read_single(_vtk_files[idx])
    state.field_list = ["None"] + list(_mesh.array_names)
    rebuild_scene()


@state.change("field", "show_slice", "show_streamlines", "show_iso", "iso_value", "slice_normal")
def on_display_change(**kwargs):
    rebuild_scene()


async def poll_for_new_results():
    """ponytail: niente websocket/pubsub dal worker, un poll ogni 3s come
    gia' fa jobs.py per l'SSE. Aggiorna solo se il caso e' rimasto lo
    stesso e l'utente non ha bloccato la vista su un timestep passato."""
    global _last_snapshot_mtime
    while True:
        await asyncio.sleep(POLL_SECONDS)
        refresh_case_list()

        case_id = state.case_id
        if not case_id:
            continue

        latest_mtime = vtk_snapshot_mtime(CASES_ROOT, case_id)
        if latest_mtime > _last_snapshot_mtime:
            if state.follow_latest:
                load_case(case_id, preserve_index=False)
            else:
                # nuovi dati disponibili ma l'utente e' fermo su un
                # timestep vecchio: aggiorna solo la lista, non la vista
                _last_snapshot_mtime = latest_mtime
                state.time_list = [
                    {"title": p.parent.name, "value": i}
                    for i, p in enumerate(list_vtk_files(CASES_ROOT, case_id))
                ]


@ctrl.on_server_ready.add
def start_polling(**kwargs):
    asyncio.get_event_loop().create_task(poll_for_new_results())


def take_screenshot():
    if state.case_id:
        out = CASES_ROOT / state.case_id / "viewer_screenshot.png"
        plotter.screenshot(str(out))
        state.message = f"Screenshot salvato in {out.name}"
    else:
        state.message = "Nessun caso selezionato"


load_case(state.case_id, preserve_index=False)


with SinglePageLayout(server) as layout:
    layout.title.set_text("OpenFOAM Viewer 3D")

    with layout.toolbar:
        vuetify3.VSelect(
            label="Caso",
            v_model=("case_id", state.case_id),
            items=("case_list", state.case_list),
            density="compact",
            hide_details=True,
            style="max-width: 200px",
        )

        vuetify3.VSelect(
            label="Tempo",
            v_model=("time_index", state.time_index),
            items=("time_list", state.time_list),
            density="compact",
            hide_details=True,
            style="max-width: 120px",
        )

        vuetify3.VSelect(
            label="Campo",
            v_model=("field", state.field),
            items=("field_list", state.field_list),
            density="compact",
            hide_details=True,
            style="max-width: 180px",
        )

        vuetify3.VSelect(
            label="Normale slice",
            v_model=("slice_normal", state.slice_normal),
            items=("normal_list", ["X", "Y", "Z"]),
            density="compact",
            hide_details=True,
            style="max-width: 140px",
        )

        vuetify3.VTextField(
            label="Iso value",
            v_model=("iso_value", state.iso_value),
            type="number",
            density="compact",
            hide_details=True,
            style="max-width: 120px",
        )

        vuetify3.VCheckbox(label="Slice", v_model=("show_slice", state.show_slice), density="compact", hide_details=True)
        vuetify3.VCheckbox(label="Streamlines", v_model=("show_streamlines", state.show_streamlines), density="compact", hide_details=True)
        vuetify3.VCheckbox(label="Iso", v_model=("show_iso", state.show_iso), density="compact", hide_details=True)
        vuetify3.VCheckbox(
            label="Live",
            v_model=("follow_latest", state.follow_latest),
            density="compact",
            hide_details=True,
        )

        vuetify3.VBtn("Screenshot", click=take_screenshot, color="primary", density="compact")
        vuetify3.VBtn("Reset camera", click="view.resetCamera()", density="compact")

    with layout.content:
        with vuetify3.VContainer(fluid=True, classes="pa-0 fill-height"):
            view = vtk_widgets.VtkRemoteView(plotter.render_window)
            ctrl.view_update = view.update

    with layout.footer:
        vuetify3.VAlert("{{ message }}", v_model=("message", state.message), density="compact", text=True)


if __name__ == "__main__":
    server.start(port=args.port, timeout=0)
