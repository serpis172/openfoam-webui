# Meshing Failure Fixes — Issue: "meshing fail"

## Overview

This document provides detailed fix suggestions for 7 critical/high-priority bugs affecting mesh generation, visualization, and control. Each fix includes:
1. **Root cause** — why the bug happens
2. **Impact** — how it manifests to users
3. **Code location** — exact file and line numbers
4. **Fix** — minimal change to resolve the issue
5. **Test** — how to verify the fix works

---

## Bug #1: Missing FoamFile Headers (CRITICAL — Blocks mesh initialization)

### Root Cause
**File:** `backend/app/templates_generator.py` (lines 10-27, 52-64)

All ~18 functions generating OpenFOAM dictionary files (`blockMeshDict`, `fvSchemes`, `fvSolution`, etc.) have the `foam_header()` function defined but it is **already being called correctly** in `write_file()` with the `class_name` parameter. 

**However**, review of lines 70-102 shows that **some calls to `write_file()` do NOT pass `class_name`**, meaning they produce files WITHOUT the FoamFile header:
- Line 70: `write_file(case_dir / "case.json", ...)` ✅ Correctly has NO header (internal metadata)
- Line 71: `write_file(case_dir / "config.json", ...)` ✅ Correctly has NO header (internal metadata)

**Verification check:** All subsequent calls (lines 73-102) to functions like `generate_control_dict`, `generate_fv_schemes`, etc. **ARE passing `class_name` parameter** — this was already fixed in a previous session (noted in ROADMAP.md section 5, point 15).

### Actual Issue Found

The real issue is in how **boundary field entries are generated**. Looking at `boundary_field_U()` (line 666), the entries use raw string concatenation:

```python
entry = f"{bc.name}\n{{\n"  # bc.name is NOT escaped!
```

If a boundary name contains OpenFOAM syntax (e.g., `inlet\n}`), it injects code into the dict.

### Impact
- blockMeshDict written with proper header ✅
- But boundary field sections can be corrupted by unescaped boundary names ❌
- This leads to OpenFOAM parsing errors during mesh generation

### Code Locations
- **Primary:** `backend/app/models.py` lines 112-113 (BoundaryCondition validation)
- **Secondary:** `backend/app/templates_generator.py` lines 666-750 (boundary field generation)

### Fix

**Status:** Already fixed in previous session. BoundaryCondition.name now has a whitelist pattern:

```python
# backend/app/models.py line 113
name: str = Field(default="inlet", min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
```

**Verification:** Run this test to confirm the fix works:

```bash
cd backend
pytest tests/test_api.py::test_boundary_condition_name_rejects_dict_injection -v
```

**Expected result:** ✅ PASS (422 error when attempting to inject `#codeStream`)

---

## Bug #2: Mesh Validation & Degenerate Mesh Handling (HIGH — Silent failures)

### Root Cause
**File:** `worker/mesh_export.py` lines 18-59

The `export_mesh_preview()` function attempts to extract mesh surface and export to glTF without validating:
1. Whether the mesh has any cells
2. Whether cells are valid (non-inverted, non-degenerate)
3. Whether triangulation produces valid output

```python
# No validation before proceeding
mesh = _read_single(vtk_file)
original_cells = mesh.n_cells  # Could be 0!

surface = mesh.extract_surface(algorithm="dataset_surface")
surface = surface.triangulate()
```

If `mesh.n_cells == 0` or triangulation fails, pyvista will crash. This is caught at line 240 in `tasks.py`:

```python
except Exception as exc:
    mesh_report["preview_error"] = str(exc)  # Silent failure
```

### Impact
- Mesh initialization completes but preview fails
- User doesn't know mesh is invalid (0 cells, all elements inverted, etc.)
- snappyHexMesh/blockMesh run anyway and fail later with cryptic errors
- No feedback loop to correct mesh settings

### Code Locations
- `worker/mesh_export.py` lines 30-45 (export_mesh_preview)
- `worker/tasks.py` lines 230-246 (exception handling)

### Fix

**Step 1:** Add mesh validation function in `worker/mesh_export.py`:

```python
def _validate_mesh_quality(mesh: pv.DataSet, filename: str) -> dict:
    """Validates that a mesh is suitable for simulation.
    
    Returns a report dict with:
    - is_valid: bool
    - issues: list of quality problems
    - n_cells: int
    - n_points: int
    - n_inverted_cells: int (approx)
    """
    report = {
        "is_valid": True,
        "issues": [],
        "n_cells": mesh.n_cells,
        "n_points": mesh.n_points,
    }
    
    # Check for empty mesh
    if mesh.n_cells == 0:
        report["is_valid"] = False
        report["issues"].append("Mesh has zero cells — geometry may not intersect domain")
    
    if mesh.n_points == 0:
        report["is_valid"] = False
        report["issues"].append("Mesh has zero points")
    
    # Check for negative volumes (inverted cells)
    try:
        volumes = mesh.compute_cell_sizes()["Volume"]
        n_negative = (volumes < 0).sum()
        if n_negative > 0:
            report["is_valid"] = False
            report["issues"].append(f"Found {n_negative} inverted cells (negative volume)")
    except Exception as e:
        report["issues"].append(f"Could not compute cell sizes: {str(e)}")
    
    return report
```

**Step 2:** Call validation before export in `export_mesh_preview()`:

```python
def export_mesh_preview(
    vtk_file: Path,
    output_path: Path,
    max_triangles: int = 300_000,
) -> dict:
    """Converts OpenFOAM VTK output to WebGL preview (glTF)"""
    mesh = _read_single(vtk_file)
    
    # NEW: Validate mesh quality
    quality = _validate_mesh_quality(mesh, str(vtk_file))
    original_cells = mesh.n_cells
    
    if not quality["is_valid"]:
        return {
            "original_cells": original_cells,
            "exported_triangles": 0,
            "decimated": False,
            "points": 0,
            "validation_failed": True,
            "issues": quality["issues"],
        }
    
    # ... rest of function unchanged
```

**Step 3:** Propagate validation errors to UI in `worker/tasks.py`:

```python
# Line 235-239 (in _generate_mesh)
preview_stats = export_mesh_preview(
    vtk_files[-1], post_dir / "mesh_preview.gltf"
)

# NEW: Check for validation failures
if preview_stats.get("validation_failed"):
    mesh_report["preview_error"] = "; ".join(preview_stats.get("issues", []))
    mesh_report["mesh_valid"] = False
else:
    mesh_report["preview"] = preview_stats
```

**Test:**

```bash
# Create a test case with 0 cells (domain misses geometry)
# Then verify that mesh_report contains "validation_failed": True
python -m pytest tests/ -k "mesh_validation" -v
```

---

## Bug #3: Boundary Patch Mismatch (HIGH — snappyHexMesh fails silently)

### Root Cause
**File:** `backend/app/models.py` lines 223-237 and `backend/app/templates_generator.py`

When generating boundary conditions, the system doesn't validate that **all boundary patches referenced in boundary conditions actually exist in the mesh**. 

For `blockMeshDict` (line 392-423), patches are hardcoded: `inlet`, `outlet`, `walls`.

But if user defines a custom boundary condition named `inlet2` that doesn't exist in the mesh, snappyHexMesh will silently ignore it or fail during initialization.

```python
# backend/app/models.py line 223-237
boundaries: List[BoundaryCondition] = [
    BoundaryCondition(name="inlet"),
    BoundaryCondition(name="outlet", U_type="zeroGradient", p_type="fixedValue"),
    BoundaryCondition(name="walls", patch_type="wall"),
]
# No validation that these names match blockMeshDict or snappyHexMesh output
```

### Impact
- User defines BC for patch that doesn't exist in mesh
- Mesh generation completes "successfully" (no error)
- Solver initialization fails with vague error: "Cannot find patch inlet2"
- User has no way to know which patches are available

### Code Locations
- `backend/app/models.py` lines 112-135 (BoundaryCondition class)
- `backend/app/templates_generator.py` lines 392-430 (blockMeshDict generation)
- `backend/app/templates_generator.py` lines 433-582 (snappyHexMeshDict generation)

### Fix

**Step 1:** Add a function to extract available patches from mesh configuration in `backend/app/templates_generator.py`:

```python
def get_available_patches(config: CaseConfig) -> list[str]:
    """Returns list of patch names that will exist after mesh generation.
    
    For blockMesh, patches are hardcoded (inlet, outlet, walls).
    For snappyHexMesh, patches come from STL + blockMesh patches.
    """
    patches = set()
    
    # blockMesh always creates these
    patches.update(["inlet", "outlet", "walls"])
    
    # snappyHexMesh adds STL geometry as a patch
    if config.mesh.mesh_type == "snappyHexMesh" and config.mesh.stl_file:
        # Patch name = STL filename without extension
        stl_name = Path(config.mesh.stl_file).stem
        patches.add(stl_name)
    
    return sorted(list(patches))
```

**Step 2:** Add validator to CaseConfig in `backend/app/models.py`:

```python
from pydantic import model_validator

class CaseConfig(BaseModel):
    physics: PhysicsConfig = PhysicsConfig()
    boundaries: List[BoundaryCondition] = [...]
    mesh: MeshSettings = MeshSettings()
    # ... other fields
    
    @model_validator(mode="after")
    def validate_boundary_patches_exist(self):
        """Verify all boundary condition names match available mesh patches."""
        available_patches = self._get_available_patches()
        
        for bc in self.boundaries:
            if bc.name not in available_patches:
                raise ValueError(
                    f"Boundary condition '{bc.name}' does not match any mesh patch. "
                    f"Available patches: {', '.join(available_patches)}"
                )
        return self
    
    def _get_available_patches(self) -> list[str]:
        """Helper — mirrors templates_generator.get_available_patches()"""
        patches = set()
        patches.update(["inlet", "outlet", "walls"])
        
        if self.mesh.mesh_type == "snappyHexMesh" and self.mesh.stl_file:
            stl_name = Path(self.mesh.stl_file).stem
            patches.add(stl_name)
        
        return sorted(list(patches))
```

**Step 3:** Add error message to API response in `backend/app/routers/cases.py`:

When creating/validating a case, validation errors will now include the specific patch mismatch:

```
ValueError: Boundary condition 'inlet2' does not match any mesh patch. Available patches: inlet, outlet, walls
```

**Test:**

```python
# backend/tests/test_api.py
def test_case_config_rejects_undefined_boundary_patch():
    """Verify that undefined boundary patches are rejected."""
    config = CaseConfig(
        boundaries=[
            BoundaryCondition(name="inlet"),
            BoundaryCondition(name="undefined_patch"),  # ← Should fail
        ]
    )
    # Should raise ValueError with helpful message
```

---

## Bug #4: 3D Viewer Not Integrated (HIGH — No mesh preview/editing)

### Root Cause
**File:** `frontend/src/components/ProjectWorkspace.tsx` and `Viewport3D.tsx` (status: incomplete/stubbed)

The 3D viewer components exist in code but:
1. Not connected to any route
2. Not receiving real mesh data
3. No UI to select/name mesh regions
4. Only has placeholder content

**Per ROADMAP.md (D4):** These components are "WIP" and deliberately not connected to avoid presenting incomplete features.

### Impact
- No visual inspection of mesh before running simulation
- User cannot verify geometry placement, refinement levels, or patch definitions
- No graphical way to select/name regions for named selections (Bug #5)
- All debugging happens AFTER running solver (hours later for large meshes)

### Code Locations
- `frontend/src/components/ProjectWorkspace.tsx` (status: orphaned)
- `frontend/src/components/Viewport3D.tsx` (status: orphaned)
- `frontend/src/App.tsx` (no route to these components)

### Fix

**Option A: Complete Implementation (Recommended for Phase 3 of Roadmap)**

This requires substantial work (3-5 days):

1. Wire `Viewport3D` to mesh preview data from backend:
   - Fetch `postProcessing/mesh_preview.gltf` after mesh generation
   - Use `three.js` GLTFLoader to display
   - Add mouse controls (rotate, pan, zoom)

2. Add patch visualization:
   - Color different patches with different colors
   - Show patch names on hover
   - Highlight selected patch

3. Implement named selection UI:
   - Allow user to click patches and assign names
   - Store selection in `config.json`
   - Pass to `snappyHexMeshDict` for refinement

**Option B: Quick Fix (Recommended for immediate relief)**

Remove the stubbed components and add a simple 2D preview instead:

**Step 1:** Remove orphaned components:

```bash
rm frontend/src/components/ProjectWorkspace.tsx
rm frontend/src/components/Viewport3D.tsx
```

**Step 2:** Create a simple mesh preview card in `frontend/src/features/Mesh.tsx`:

```tsx
export function MeshPreviewCard({ caseId }: { caseId: string }) {
  const { data: meshReport } = useQuery(
    [`mesh-report-${caseId}`],
    () => fetch(`/api/cases/${caseId}/postProcessing/mesh_report.json`)
      .then(r => r.json()),
    { enabled: !!caseId }
  );

  if (!meshReport) return <div className="text-gray-400">No mesh generated</div>;

  return (
    <div className="border rounded p-4">
      <h3 className="font-bold mb-4">Mesh Quality Report</h3>
      
      {meshReport.mesh_valid === false ? (
        <div className="bg-red-100 border border-red-400 text-red-700 p-3 mb-4">
          ⚠️ Mesh validation failed:
          <ul className="list-disc ml-5 mt-2">
            {meshReport.preview_error?.split(";").map((issue, i) => (
              <li key={i}>{issue.trim()}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-gray-600 text-sm">Cells</dt>
              <dd className="font-bold">{meshReport.cells?.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-gray-600 text-sm">Points</dt>
              <dd className="font-bold">{meshReport.points?.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-gray-600 text-sm">Max Skewness</dt>
              <dd className={
                meshReport.max_skewness < 0.85 ? "text-green-600" : "text-yellow-600"
              }>
                {meshReport.max_skewness?.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600 text-sm">Max Non-Orthogonality</dt>
              <dd className={
                meshReport.max_non_orthogonality < 85 ? "text-green-600" : "text-yellow-600"
              }>
                {meshReport.max_non_orthogonality?.toFixed(1)}°
              </dd>
            </div>
          </dl>
          
          {meshReport.preview_error && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 p-3 mt-4">
              ⚠️ Preview generation failed: {meshReport.preview_error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

**Step 3:** Add this to the Mesh settings panel so users see mesh quality immediately after generation.

**Test:**

```bash
# Generate mesh, verify preview card shows correctly
npm run dev
# Navigate to case > Mesh tab after generating mesh
# Should display cells, points, skewness
```

---

## Bug #5: Named Selection Not Implemented (HIGH — No granular mesh control)

### Root Cause
**File:** Multiple

The system supports `refinement_boxes` (regions defined by bounding box) but does NOT support:
1. **Selecting and naming patches from the mesh** (e.g., "cylinder_wall", "outlet_top")
2. **Storing named selections** persistently
3. **Using named selections in refinement strategies**

### Impact
- Users cannot do fine-grained mesh refinement based on specific features
- All refinement is either uniform or by distance band (global)
- For complex geometries, cannot refine only the "interesting" parts

### Code Locations
- `backend/app/models.py` lines 145-181 (RefinementBox, RefinementDistance)
- `backend/app/templates_generator.py` lines 433-582 (snappyHexMeshDict generation)
- `frontend/src/components/MeshSettingsForm.tsx` (UI)

### Fix

**Step 1:** Add NamedSelection model to `backend/app/models.py`:

```python
class NamedSelection(BaseModel):
    """A named patch or region selected from the mesh for targeted refinement."""
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    patch_name: str  # Refers to a patch in the mesh (e.g., "geometry", "inlet")
    refinement_level: int = Field(ge=0, le=10, description="Mesh refinement level (0=base, 10=max)")
    description: str = Field(default="", max_length=200)
```

**Step 2:** Add to CaseConfig:

```python
class CaseConfig(BaseModel):
    # ... existing fields
    named_selections: List[NamedSelection] = []
```

**Step 3:** Use named selections in snappyHexMeshDict generation:

```python
def generate_snappy_hex_mesh_dict(case_dir: Path, config: CaseConfig):
    # ... existing code ...
    
    # Build refinement regions from named selections
    selection_refinement_regions = ""
    for selection in config.named_selections:
        selection_refinement_regions += f"""    {selection.patch_name}
    {{
        type            patch;
        level           ({selection.refinement_level} {selection.refinement_level});
    }}
"""
    
    # Insert into content before existing refinementRegions
    content = f"""... snappyHexMeshDict content ...
    refinementRegions
    {{
{selection_refinement_regions}{geometry_refinement_region}{box_refinement_regions}    }}
"""
```

**Step 4:** Add UI to `frontend/src/components/MeshSettingsForm.tsx`:

Add a "Named Selections" panel that:
- Shows available patches from mesh
- Allows user to select a patch and assign refinement level
- Stores as `named_selections` in config

**Test:**

```python
# backend/tests/test_api.py
def test_named_selection_applies_refinement():
    """Verify named selections generate correct snappyHexMeshDict entries."""
    config = CaseConfig(
        named_selections=[
            NamedSelection(patch_name="geometry", refinement_level=5),
        ]
    )
    case_dir = create_test_case(config)
    content = (case_dir / "system/snappyHexMeshDict").read_text()
    assert "geometry" in content
    assert "level           (5 5);" in content
```

---

## Bug #6: Fragile Log Parsing (MEDIUM — Parsing fails silently on format changes)

### Root Cause
**File:** `worker/tasks.py` lines 127-186

Mesh quality metrics are extracted using regex patterns that are brittle and fail if OpenFOAM changes output format:

```python
def parse_check_mesh(case_dir: Path):
    log = case_dir / "log.checkMesh"
    text = log.read_text(errors="ignore")
    
    points = re.search(r"points:\s+(\d+)", text)
    faces = re.search(r"faces:\s+(\d+)", text)
    cells = re.search(r"cells:\s+(\d+)", text)
    
    skewness = re.search(r"Max skewness\s*[:=]\s+([0-9.eE+-]+)", text)
    if skewness:
        report["max_skewness"] = float(skewness.group(1))
    # If pattern doesn't match, max_skewness is silently omitted!
```

### Impact
- OpenFOAM version change (2406 → 2506) changes output format slightly
- Regex patterns fail to match
- Metrics silently missing from report
- User gets incomplete mesh quality data
- Root cause is invisible (not logged)

### Code Locations
- `worker/tasks.py` lines 127-186 (parse_check_mesh)
- `worker/tasks.py` lines 127-144 (parse_residuals)

### Fix

**Step 1:** Add comprehensive error logging to `parse_check_mesh()`:

```python
import logging

logger = logging.getLogger(__name__)

def parse_check_mesh(case_dir: Path):
    log = case_dir / "log.checkMesh"
    
    if not log.exists():
        logger.warning(f"checkMesh log not found: {log}")
        return {}
    
    text = log.read_text(errors="ignore")
    
    if not text.strip():
        logger.warning(f"checkMesh log is empty: {log}")
        return {}
    
    report = {}
    patterns = {
        "points": (r"points:\s+(\d+)", int),
        "faces": (r"faces:\s+(\d+)", int),
        "cells": (r"cells:\s+(\d+)", int),
        "max_non_orthogonality": (r"Mesh non-orthogonality Max:\s+([0-9.eE+-]+)", float),
        "max_skewness": (r"Max skewness\s*[:=]\s+([0-9.eE+-]+)", float),
        "max_aspect_ratio": (r"Max aspect ratio\s*[:=]\s+([0-9.eE+-]+)", float),
    }
    
    for key, (pattern, type_fn) in patterns.items():
        match = re.search(pattern, text)
        if match:
            try:
                report[key] = type_fn(match.group(1))
            except (ValueError, TypeError) as e:
                logger.error(f"Failed to parse {key} from checkMesh: {e}")
                report[key] = None
        else:
            logger.debug(f"Pattern not found for {key}: {pattern}")
            report[key] = None
    
    # Log full output on failure for debugging
    if any(v is None for v in report.values()):
        logger.warning(f"Incomplete checkMesh report. Raw output:\n{text[-2000:]}")  # Last 2000 chars
    
    return report
```

**Step 2:** Return complete report with `null` values:

```python
# Instead of omitting missing fields, explicitly return None
# This way the UI knows parsing was attempted
report = {
    "points": None,
    "faces": None,
    "cells": None,
    "max_non_orthogonality": None,
    "max_skewness": None,
    "max_aspect_ratio": None,
    "parse_warnings": [],  # List of parsing issues
}
```

**Step 3:** Add fallback to foamlib parsing (recommended for Phase 2 of Roadmap):

```python
# Recommended future improvement: use foamlib instead of regex
try:
    from foamlib import FoamCase
    case = FoamCase(case_dir)
    report = {
        "cells": case.n_cells,
        "points": case.n_points,
        # foamlib provides structured access, no regex needed
    }
except ImportError:
    # Fallback to regex parsing above
    report = parse_check_mesh_legacy(case_dir)
```

**Step 4:** Update mesh_report response to include parse status:

```python
mesh_report = parse_check_mesh(case_dir)
mesh_report["mesh_type"] = mesh_type
mesh_report["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# NEW: Add warning if parsing was incomplete
if any(v is None for v in mesh_report.values()):
    mesh_report["parse_incomplete"] = True
    mesh_report["note"] = (
        "Some mesh metrics could not be parsed. "
        "This may indicate an incompatible OpenFOAM version. "
        "Check the worker logs for details."
    )
```

**Test:**

```bash
# Test regex patterns against actual checkMesh output
python -c "
import re
log_text = '''...checkMesh output...'''
pattern = r'Max skewness\s*[:=]\s+([0-9.eE+-]+)'
match = re.search(pattern, log_text)
assert match is not None, 'Pattern should match'
print(f'Matched: {match.group(1)}')
"
```

---

## Bug #7: Race Condition in Concurrent Mesh Generation (MEDIUM — Case directory corruption)

### Root Cause
**File:** `worker/tasks.py` lines 188-249 (in `_generate_mesh()`)

When `run_settings.get("clean_start", True)` is called, it deletes the old mesh. If two concurrent jobs run on the same case, they can interfere:

**Timeline of race:**
```
Job A: Read config.json
Job B: Read config.json
Job A: Delete case_dir/processor*, case_dir/0/*, etc.
Job B: Try to access now-deleted files → CRASH
```

```python
def _generate_mesh(self, job_id: str, case_dir: Path, config: dict) -> dict:
    mesh = config.get("mesh", {})
    run_settings = config.get("run", {})
    
    if run_settings.get("clean_start", True):
        clean_case(case_dir)  # ← NOT atomic! Race condition here
    
    mesh_type = mesh.get("mesh_type", "blockMesh")
    
    if mesh_type == "blockMesh":
        run_step(self, job_id, case_dir, "blockMesh", ["blockMesh"])
```

### Impact
- Two simultaneous mesh generation jobs on same case corrupt each other
- One job fails with FileNotFoundError in the middle of cleanup
- Case directory left in inconsistent state
- Further jobs fail until manual cleanup

### Code Locations
- `worker/tasks.py` lines 188-249 (_generate_mesh)
- `worker/tasks.py` lines 110-125 (clean_case)

### Fix

**Step 1:** Add file-level locking mechanism in `worker/tasks.py`:

```python
import fcntl
import tempfile

def run_step_with_lock(task, job_id: str, case_dir: Path, step_name: str, args, 
                       timeout_seconds=None, cleanup_first=False):
    """Runs a step with a lock file to prevent concurrent access."""
    
    lock_file = case_dir / ".mesh_lock"
    
    with open(lock_file, "w") as lock_fd:
        try:
            # Acquire exclusive lock (blocks if another process holds it)
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except IOError:
            raise RuntimeError(
                f"Case {case_dir.name} is locked by another job. "
                f"This usually means mesh generation is already in progress. "
                f"Wait for the previous job to complete."
            )
        
        try:
            if cleanup_first:
                clean_case(case_dir)
            
            run_step(task, job_id, case_dir, step_name, args, timeout_seconds)
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_file.unlink(missing_ok=True)
```

**Step 2:** Update `_generate_mesh()` to use the lock:

```python
def _generate_mesh(self, job_id: str, case_dir: Path, config: dict) -> dict:
    mesh = config.get("mesh", {})
    run_settings = config.get("run", {})
    
    cleanup_first = run_settings.get("clean_start", True)
    
    mesh_type = mesh.get("mesh_type", "blockMesh")
    
    if mesh_type == "blockMesh":
        run_step_with_lock(self, job_id, case_dir, "blockMesh", 
                           ["blockMesh"], cleanup_first=cleanup_first)
    
    if mesh_type == "snappyHexMesh":
        stl_dir = case_dir / "constant/triSurface"
        stl_files = list(stl_dir.glob("*.stl"))
        
        if not stl_files:
            raise RuntimeError("No STL files found")
        
        run_step_with_lock(self, job_id, case_dir, "blockMesh", 
                           ["blockMesh"], cleanup_first=cleanup_first)
        
        run_step_with_lock(self, job_id, case_dir, "surfaceFeatureExtract",
                           ["surfaceFeatureExtract"])
        
        run_step_with_lock(self, job_id, case_dir, "snappyHexMesh",
                           ["snappyHexMesh", "-overwrite"])
    
    # Rest of function unchanged...
```

**Step 3:** Add test for race condition (requires testing with actual Celery):

```python
# This requires spinning up Redis + Celery to test properly
# For now, verify lock file is created/removed
import pytest
from pathlib import Path
from unittest.mock import patch

def test_mesh_generation_uses_lock_file(tmp_path):
    """Verify mesh generation creates and releases lock file."""
    case_dir = tmp_path / "test_case"
    case_dir.mkdir()
    
    lock_file = case_dir / ".mesh_lock"
    
    # Lock file should not exist before
    assert not lock_file.exists()
    
    # After successful run, lock file should be cleaned up
    # (This test would need actual Celery setup to work end-to-end)
```

**Alternative (simpler):** Use backend-level locking via database:

```python
# backend/app/routers/cases.py
import redis

def start_mesh_generation(case_id: str, config: dict):
    """Start mesh generation with Redis-based lock."""
    r = redis.Redis.from_url(REDIS_URL)
    
    lock_key = f"mesh:lock:{case_id}"
    
    # Set lock with expiry (in case worker crashes)
    acquired = r.set(lock_key, "1", ex=3600, nx=True)  # 1 hour expiry
    
    if not acquired:
        return {"error": "Mesh generation already in progress for this case"}
    
    try:
        task = celery_app.send_task("tasks.generate_mesh_only", (case_id,))
        return {"job_id": task.id}
    except Exception:
        r.delete(lock_key)  # Release lock on error
        raise
    finally:
        # Lock is released when worker completes (set expiry)
        pass
```

**Test:**

```bash
# Simulate two concurrent mesh requests
curl -X POST http://localhost:8000/api/cases/test-case/mesh &
curl -X POST http://localhost:8000/api/cases/test-case/mesh &
wait

# Second request should return: {"error": "Mesh generation already in progress..."}
```

---

## Summary Table

| Bug # | Title | Severity | Status | Fix Type | Effort |
|-------|-------|----------|--------|----------|--------|
| B0 | Missing FoamFile Headers | 🔴 Critical | ✅ Fixed | Validation | Done |
| B2 | Degenerate Mesh Handling | 🔴 Critical | ❌ Open | Code + Test | 1-2h |
| B3 | Boundary Patch Mismatch | 🟡 High | ❌ Open | Validation | 2-3h |
| D4 | 3D Viewer Not Integrated | 🟡 High | ❌ Open | UI + Backend | 3-5d (full) or 4-6h (quick) |
| #5 | Named Selection Missing | 🟡 High | ❌ Open | Feature | 2-3d |
| A2 | Fragile Log Parsing | 🟠 Medium | ❌ Open | Logging + Fallback | 1-2h |
| B2 (Race) | Concurrent Mesh Jobs | 🟠 Medium | ❌ Open | Locking | 1h |

---

## Recommended Execution Order

### Immediate (today) — Fixes that unblock meshing
1. **B2: Degenerate Mesh Handling** — adds validation feedback
2. **A2: Log Parsing** — adds visibility into failures

### Short-term (this week) — Improves UX
3. **B3: Boundary Patch Validation** — prevents silent failures
4. **B7: Race Condition Lock** — stabilizes concurrent access
5. **D4 Option B: Simple Mesh Preview** — gives visual feedback

### Medium-term (phase 2+) — Complete features
6. **D4 Option A: Full 3D Viewer** — interactive mesh inspection
7. **#5: Named Selection UI** — fine-grained refinement control

---

## Testing Checklist

Before marking as "fixed", verify:

- [ ] Unit tests for all validation functions pass
- [ ] Integration test: `docker compose up` → upload STL → generate mesh → verify no errors
- [ ] Edge cases: 0-cell mesh, degenerate geometry, mismatched patches
- [ ] Concurrent jobs: start two mesh generations simultaneously, verify lock prevents corruption
- [ ] Log parsing: test against OpenFOAM 2406, 2506, 2606 output formats
- [ ] UI: mesh preview shows quality metrics, errors displayed clearly

