"""Test per app/foam_templates/ (ROADMAP.md, Fase 2).

Questi test hanno sostituito un confronto diretto con il vecchio
generatore f-string (generate_U/boundary_field_U in templates_generator.py):
quel confronto era il gate di validazione prima del cutover (verificare che
write_U producesse valori equivalenti prima di sostituire generate_U nella
pipeline), ora che il cutover e' fatto e il codice vecchio e' stato
rimosso non c'e' piu' nulla con cui confrontarsi - questi test verificano
direttamente i valori attesi.

Nota sul design: la copertura dei 5 tipi di boundary condition per U
(fixedValue, noSlip, slip, inletOutlet, zeroGradient) e' testata chiamando
_boundary_condition_U() direttamente, non passando per write_U()/CaseConfig
con nomi patch inventati - da quando esiste la validazione B3
(validate_boundary_patches_exist in models.py), un CaseConfig con
boundaries il cui nome non corrisponde a un patch reale (inlet/outlet/walls
per blockMesh) viene rifiutato a monte. Testare la funzione di mappatura in
isolamento e' anche piu' pulito: non serve simulare un CaseConfig valido
solo per esercitare un ramo if/elif che non dipende dal resto della config.
"""

import os
import tempfile

os.environ.setdefault("DATA_ROOT", tempfile.mkdtemp())
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from pathlib import Path

import numpy as np
from foamlib import DimensionSet, FoamFieldFile

from app.foam_templates.fields import _boundary_condition_U, write_U
from app.models import BoundaryCondition, CaseConfig


def test_write_U_default_config():
    case_dir = Path(tempfile.mkdtemp())
    write_U(case_dir, CaseConfig())

    field = FoamFieldFile(case_dir / "0" / "U")
    assert field.dimensions == DimensionSet(length=1, time=-1)
    assert np.allclose(field.internal_field, [10.0, 0.0, 0.0])

    boundary = field.boundary_field.as_dict()
    assert boundary["inlet"]["type"] == "fixedValue"
    assert np.allclose(boundary["inlet"]["value"], [10.0, 0.0, 0.0])
    assert boundary["outlet"]["type"] == "zeroGradient"
    assert boundary["walls"]["type"] == "noSlip"


def test_write_U_has_foam_file_header():
    case_dir = Path(tempfile.mkdtemp())
    write_U(case_dir, CaseConfig())
    assert (case_dir / "0" / "U").read_text().startswith("FoamFile")


def test_boundary_condition_U_fixed_value():
    bc = BoundaryCondition(name="inlet", U_type="fixedValue", U_value=[5.0, 1.0, 0.0])
    assert _boundary_condition_U(bc) == {"type": "fixedValue", "value": [5.0, 1.0, 0.0]}


def test_boundary_condition_U_no_slip():
    bc = BoundaryCondition(name="walls", U_type="noSlip", patch_type="wall")
    assert _boundary_condition_U(bc) == {"type": "noSlip"}


def test_boundary_condition_U_slip():
    bc = BoundaryCondition(name="walls", U_type="slip", patch_type="symmetry")
    assert _boundary_condition_U(bc) == {"type": "slip"}


def test_boundary_condition_U_inlet_outlet():
    bc = BoundaryCondition(name="outlet", U_type="inletOutlet", U_value=[5.0, 1.0, 0.0])
    assert _boundary_condition_U(bc) == {
        "type": "inletOutlet",
        "inletValue": [5.0, 1.0, 0.0],
        "value": [5.0, 1.0, 0.0],
    }


def test_boundary_condition_U_zero_gradient():
    bc = BoundaryCondition(name="outlet", U_type="zeroGradient")
    assert _boundary_condition_U(bc) == {"type": "zeroGradient"}


def test_boundary_condition_U_unrecognized_type_falls_back_to_zero_gradient():
    """Stesso comportamento del vecchio generatore f-string: un U_type non
    riconosciuto non solleva un errore, cade nel ramo sicuro zeroGradient."""
    bc = BoundaryCondition(name="inlet", U_type="notARealType")
    assert _boundary_condition_U(bc) == {"type": "zeroGradient"}


def test_write_p_non_buoyant_solver():
    from app.models import PhysicsConfig
    from app.foam_templates.fields import write_p

    config = CaseConfig(physics=PhysicsConfig(solver="simpleFoam", pressure=0.0))
    case_dir = Path(tempfile.mkdtemp())
    write_p(case_dir, config)

    field = FoamFieldFile(case_dir / "0" / "p")
    assert field.dimensions == DimensionSet(length=2, time=-2)
    assert not (case_dir / "0" / "p_rgh").exists()


def test_write_p_buoyant_solver_writes_both_p_and_p_rgh():
    from app.models import PhysicsConfig
    from app.foam_templates.fields import write_p

    config = CaseConfig(physics=PhysicsConfig(solver="buoyantSimpleFoam", pressure=101325.0))
    case_dir = Path(tempfile.mkdtemp())
    write_p(case_dir, config)

    p_rgh = FoamFieldFile(case_dir / "0" / "p_rgh")
    assert p_rgh.dimensions == DimensionSet(mass=1, length=-1, time=-2)
    assert np.allclose(p_rgh.internal_field, 101325.0)

    p = FoamFieldFile(case_dir / "0" / "p")
    assert p.dimensions == DimensionSet(mass=1, length=-1, time=-2)
    boundary = p.boundary_field.as_dict()
    # 0/p per un solver buoyant e' sempre "calculated": il solver lo
    # ricalcola a ogni iterazione, non e' un valore imposto dall'utente.
    for entry in boundary.values():
        assert entry["type"] == "calculated"


def test_boundary_condition_p_fixed_value():
    from app.foam_templates.fields import _boundary_condition_p

    bc = BoundaryCondition(name="outlet", p_type="fixedValue", p_value=0.0)
    assert _boundary_condition_p(bc) == {"type": "fixedValue", "value": 0.0}


def test_boundary_condition_p_zero_gradient():
    from app.foam_templates.fields import _boundary_condition_p

    bc = BoundaryCondition(name="inlet", p_type="zeroGradient")
    assert _boundary_condition_p(bc) == {"type": "zeroGradient"}


def test_boundary_condition_p_calculated_with_fixed_value():
    from app.foam_templates.fields import _boundary_condition_p

    bc = BoundaryCondition(name="outlet", p_type="fixedValue", p_value=101325.0)
    assert _boundary_condition_p(bc, calculated=True) == {
        "type": "calculated",
        "value": 101325.0,
    }


def test_boundary_condition_p_calculated_without_fixed_value():
    from app.foam_templates.fields import _boundary_condition_p

    bc = BoundaryCondition(name="inlet", p_type="zeroGradient")
    assert _boundary_condition_p(bc, calculated=True) == {"type": "calculated", "value": 0}


def test_write_g():
    from app.models import PhysicsConfig
    from app.foam_templates.fields import write_g

    config = CaseConfig(physics=PhysicsConfig(gravity=[0.0, 0.0, -9.81]))
    case_dir = Path(tempfile.mkdtemp())
    write_g(case_dir, config)

    g_path = case_dir / "constant" / "g"
    text = g_path.read_text()
    assert text.startswith("FoamFile")
    assert "uniformDimensionedVectorField" in text
    assert "-9.81" in text


def test_boundary_condition_T_fixed_value():
    from app.foam_templates.fields import _boundary_condition_T

    bc = BoundaryCondition(name="inlet", T_type="fixedValue", T_value=350.0)
    assert _boundary_condition_T(bc) == {"type": "fixedValue", "value": 350.0}


def test_boundary_condition_T_inlet_outlet():
    from app.foam_templates.fields import _boundary_condition_T

    bc = BoundaryCondition(name="outlet", T_type="inletOutlet", T_value=300.0)
    assert _boundary_condition_T(bc) == {
        "type": "inletOutlet",
        "inletValue": 300.0,
        "value": 300.0,
    }


def test_boundary_condition_T_zero_gradient():
    from app.foam_templates.fields import _boundary_condition_T

    bc = BoundaryCondition(name="walls", T_type="zeroGradient", patch_type="wall")
    assert _boundary_condition_T(bc) == {"type": "zeroGradient"}


def test_write_T():
    from app.models import PhysicsConfig
    from app.foam_templates.fields import write_T

    config = CaseConfig(physics=PhysicsConfig(temperature=300.0))
    case_dir = Path(tempfile.mkdtemp())
    write_T(case_dir, config)

    field = FoamFieldFile(case_dir / "0" / "T")
    assert field.dimensions == DimensionSet(temperature=1)
    assert np.allclose(field.internal_field, 300.0)


def test_write_alphat_wall_vs_non_wall():
    from app.foam_templates.fields import write_alphat

    config = CaseConfig(
        boundaries=[
            BoundaryCondition(name="inlet", patch_type="patch"),
            BoundaryCondition(name="walls", patch_type="wall"),
        ]
    )
    case_dir = Path(tempfile.mkdtemp())
    write_alphat(case_dir, config)

    field = FoamFieldFile(case_dir / "0" / "alphat")
    boundary = field.boundary_field.as_dict()
    assert boundary["inlet"]["type"] == "calculated"
    assert boundary["walls"]["type"] == "alphatJayatillekeWallFunction"
    assert boundary["walls"]["Prt"] == 0.85


def test_boundary_condition_turbulence_wall():
    from app.foam_templates.fields import _boundary_condition_turbulence

    bc = BoundaryCondition(name="walls", patch_type="wall", k_value=0.05, omega_value=2.0)
    assert _boundary_condition_turbulence(bc, "k") == {"type": "kqRWallFunction", "value": 0.05}
    assert _boundary_condition_turbulence(bc, "omega") == {"type": "omegaWallFunction", "value": 2.0}


def test_boundary_condition_turbulence_non_wall_uses_bc_type():
    """Bug di sicurezza trovato in questa sessione (vedi models.py): sui
    patch non-wall il *tipo* stesso viene da bc.k_type/bc.omega_type, non
    da un elif esplicito come per U/p/T - per questo in models.py hanno
    una whitelist di caratteri (pattern), non solo una whitelist di
    valori come gli altri campi *_type."""
    from app.foam_templates.fields import _boundary_condition_turbulence

    bc = BoundaryCondition(
        name="inlet",
        patch_type="patch",
        k_type="turbulentIntensityKineticEnergyInlet",
        k_value=0.05,
    )
    assert _boundary_condition_turbulence(bc, "k") == {
        "type": "turbulentIntensityKineticEnergyInlet",
        "value": 0.05,
    }


def test_write_turbulence_fields_only_for_supported_models():
    from app.models import PhysicsConfig
    from app.foam_templates.fields import write_turbulence_fields

    config = CaseConfig(physics=PhysicsConfig(turbulence="SpalartAllmaras"))
    case_dir = Path(tempfile.mkdtemp())
    write_turbulence_fields(case_dir, config)

    assert not (case_dir / "0" / "k").exists()
    assert not (case_dir / "0" / "omega").exists()


def test_write_turbulence_fields_k_omega_sst():
    from app.models import PhysicsConfig
    from app.foam_templates.fields import write_turbulence_fields

    config = CaseConfig(physics=PhysicsConfig(turbulence="kOmegaSST"))
    case_dir = Path(tempfile.mkdtemp())
    write_turbulence_fields(case_dir, config)

    k = FoamFieldFile(case_dir / "0" / "k")
    assert k.dimensions == DimensionSet(length=2, time=-2)
    assert np.allclose(k.internal_field, 0.1)

    omega = FoamFieldFile(case_dir / "0" / "omega")
    assert omega.dimensions == DimensionSet(time=-1)
    assert np.allclose(omega.internal_field, 1.0)
