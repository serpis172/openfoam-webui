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