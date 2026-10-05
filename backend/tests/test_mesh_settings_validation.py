"""MeshSettings: errori di dominio bloccati in validazione, non in OpenFOAM."""

import os
import tempfile

os.environ.setdefault("DATA_ROOT", tempfile.mkdtemp())
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

import pytest
from pydantic import ValidationError

from app.models import MeshSettings


def test_defaults_are_valid():
    MeshSettings()
    MeshSettings(mesh_type="snappyHexMesh", stl_file="a.stl")


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"cells": [0, 10, 10]}, "almeno 1 cella"),
        ({"cells": [10, 10]}, "3 componenti"),
        ({"domain_min": [0, 0]}, "3 componenti"),
        ({"domain_min": [0, 0, 0], "domain_max": [0, 1, 1]}, "maggiore di domain_min lungo x"),
        ({"domain_min": [0, 0, 0], "domain_max": [1, -1, 1]}, "maggiore di domain_min lungo y"),
    ],
)
def test_rejects_invalid_domain(kwargs, message):
    with pytest.raises(ValidationError, match=message):
        MeshSettings(**kwargs)


def test_snappy_location_outside_domain_rejected():
    with pytest.raises(ValidationError, match="location_in_mesh .* fuori dal dominio lungo x"):
        MeshSettings(
            mesh_type="snappyHexMesh",
            stl_file="a.stl",
            domain_min=[-1, -1, -1],
            domain_max=[5, 1, 1],
            location_in_mesh=[9, 0, 0],
        )


def test_location_ignored_for_blockmesh():
    MeshSettings(mesh_type="blockMesh", location_in_mesh=[99, 99, 99])
