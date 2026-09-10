import os
import tempfile

os.environ["DATA_ROOT"] = tempfile.mkdtemp()
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_case():
    response = client.post(
        "/api/cases/",
        json={
            "name": "Caso test",
            "solver": "simpleFoam",
            "description": "Test",
        },
    )

    assert response.status_code == 200
    data = response.json()
    # ponytail: create_case ora ritorna la stessa shape di get_case
    # (chiave "id", non "case_id") - erano due nomi diversi per la
    # stessa risorsa, causa di un bug reale nel frontend (data.id
    # sempre undefined dopo la creazione).
    assert "id" in data

    case_id = data["id"]

    response = client.get(f"/api/cases/{case_id}")
    assert response.status_code == 200


def test_path_traversal_blocked():
    response = client.post(
        "/api/cases/",
        json={
            "name": "Caso traversal",
            "solver": "simpleFoam",
        },
    )

    case_id = response.json()["id"]

    response = client.get(f"/api/files/{case_id}/download/../../etc/passwd")
    assert response.status_code in [400, 404]


def test_boundary_condition_name_rejects_dict_injection():
    """Un nome boundary condition finisce crudo in system/0/{U,p,k,...}
    (vedi templates_generator.py). Senza whitelist, un nome con '{', '}'
    o '#codeStream' chiuderebbe il blocco in anticipo e inietterebbe una
    direttiva OpenFOAM arbitraria nel dict scritto su disco."""
    response = client.post(
        "/api/cases/",
        json={"name": "Caso injection", "solver": "simpleFoam"},
    )
    case_id = response.json()["id"]

    payload = {
        "boundaries": [
            {"name": "inlet\n}\n#codeStream\n{\n", "patch_type": "patch"}
        ]
    }
    response = client.post(f"/api/cases/{case_id}/config", json=payload)
    assert response.status_code == 422


def test_boundary_condition_patch_type_whitelisted():
    response = client.post(
        "/api/cases/",
        json={"name": "Caso patch type", "solver": "simpleFoam"},
    )
    case_id = response.json()["id"]

    payload = {"boundaries": [{"name": "inlet", "patch_type": "notARealType"}]}
    response = client.post(f"/api/cases/{case_id}/config", json=payload)
    assert response.status_code == 422


def test_list_cases_sorted_by_creation_date_not_uuid():
    """list_cases deve restituire i casi piu' recenti per primi. Prima
    ordinava per nome cartella (uuid esadecimale casuale), non per
    created_at - la Dashboard mostrava i casi in un ordine arbitrario."""
    first = client.post(
        "/api/cases/", json={"name": "Primo caso", "solver": "simpleFoam"}
    ).json()
    second = client.post(
        "/api/cases/", json={"name": "Secondo caso", "solver": "simpleFoam"}
    ).json()

    response = client.get("/api/cases/", params={"size": 100})
    ids = [item["id"] for item in response.json()["items"]]

    assert ids.index(second["id"]) < ids.index(first["id"])


def test_terminal_disabled_by_default():
    """L'endpoint terminal.py era uno stub che rispondeva senza eseguire
    nulla; ora esegue davvero via worker, quindi deve restare disabilitato
    di default (ENABLE_TERMINAL=false) come documentato nel README."""
    response = client.post(
        "/api/terminal/exec", json={"case_id": "qualsiasi", "command": "ls"}
    )
    assert response.status_code == 403


def test_terminal_rejects_unknown_command(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "enable_terminal", True)

    response = client.post(
        "/api/terminal/exec",
        json={"case_id": "qualsiasi", "command": "rm -rf /"},
    )
    assert response.status_code == 400


def test_terminal_requires_existing_case(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "enable_terminal", True)

    response = client.post(
        "/api/terminal/exec",
        json={"case_id": "nonesistente123", "command": "ls"},
    )
    assert response.status_code == 404


def test_upload_roundtrip():
    """Copre anche la write ora spostata su thread (anyio.to_thread) -
    nessun test esistente toccava l'upload prima di questo fix."""
    case_id = client.post(
        "/api/cases/", json={"name": "Caso upload", "solver": "simpleFoam"}
    ).json()["id"]

    content = b"solid test\nendsolid test\n"
    response = client.post(
        f"/api/files/{case_id}/upload/geometry.stl",
        files={"file": ("geometry.stl", content, "application/octet-stream")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["size"] == len(content)
    assert data["path"] == "geometry.stl"


def test_generated_files_have_foam_file_header(tmp_path):
    """generate_case_files scriveva ogni dict OpenFOAM (controlDict,
    blockMeshDict, 0/U, ...) senza il blocco FoamFile obbligatorio in
    testa al file. Non e' un commento decorativo: la guida ufficiale
    OpenFOAM ("Basic input/output file format") lo elenca come richiesto
    per ogni file letto/scritto, e IOobject::readHeader lo pretende come
    primo token - senza, blockMesh/simpleFoam/checkMesh rifiutano il file
    con un FatalIOError. Nessun file generato da questa funzione l'aveva.
    Questo test genera un caso completo (buoyant + snappyHexMesh, per
    coprire anche i rami g/T/alphat/snappyHexMeshDict) e verifica che
    ogni dict OpenFOAM inizi con "FoamFile", mentre case.json/config.json
    (metadati interni, non letti da OpenFOAM) restano senza header."""
    from app.models import CaseConfig, MeshSettings, PhysicsConfig
    from app.templates_generator import generate_case_files

    config = CaseConfig(
        physics=PhysicsConfig(solver="buoyantSimpleFoam"),
        mesh=MeshSettings(mesh_type="snappyHexMesh", stl_file="geometry.stl"),
    )
    meta = {"solver": "buoyantSimpleFoam"}

    generate_case_files(tmp_path, config, meta)

    openfoam_dict_files = [
        p for p in tmp_path.rglob("*")
        if p.is_file() and p.name not in {"case.json", "config.json"}
    ]

    assert len(openfoam_dict_files) >= 15, "generate_case_files ha scritto meno file del previsto"

    for f in openfoam_dict_files:
        text = f.read_text()
        assert text.startswith("FoamFile"), (
            f"{f.relative_to(tmp_path)} non ha il blocco FoamFile in testa "
            f"- OpenFOAM lo rifiuterebbe con un FatalIOError"
        )

    for internal_file in ("case.json", "config.json"):
        text = (tmp_path / internal_file).read_text()
        assert not text.startswith("FoamFile")