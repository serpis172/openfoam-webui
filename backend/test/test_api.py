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
    assert "case_id" in data

    case_id = data["case_id"]

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

    case_id = response.json()["case_id"]

    response = client.get(f"/api/files/{case_id}/download/../../etc/passwd")
    assert response.status_code in [400, 404]