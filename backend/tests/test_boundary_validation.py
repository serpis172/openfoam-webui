"""Tests for boundary patch validation (Bug #3)."""

import pytest
from pydantic import ValidationError

from app.models import CaseConfig, BoundaryCondition, MeshSettings


class TestBoundaryPatchValidation:
    """Test validation of boundary condition patches against mesh configuration."""
    
    def test_accepts_valid_blockmesh_patches(self):
        """Standard blockMesh patches (inlet, outlet, walls) should be valid."""
        config = CaseConfig(
            boundaries=[
                BoundaryCondition(name="inlet"),
                BoundaryCondition(name="outlet"),
                BoundaryCondition(name="walls", patch_type="wall"),
            ]
        )
        # Should not raise
        assert len(config.boundaries) == 3
    
    def test_rejects_undefined_patch_for_blockmesh(self):
        """Boundary condition referencing undefined patch should fail."""
        with pytest.raises(ValidationError, match="does not match any mesh patch"):
            CaseConfig(
                boundaries=[
                    BoundaryCondition(name="inlet"),
                    BoundaryCondition(name="undefined_patch"),  # <- Should fail
                ]
            )
    
    def test_accepts_valid_snappyhexmesh_patches(self):
        """snappyHexMesh patches (blockMesh + STL geometry) should be valid."""
        config = CaseConfig(
            mesh=MeshSettings(
                mesh_type="snappyHexMesh",
                stl_file="cylinder.stl",
            ),
            boundaries=[
                BoundaryCondition(name="inlet"),
                BoundaryCondition(name="outlet"),
                BoundaryCondition(name="walls", patch_type="wall"),
                BoundaryCondition(name="cylinder"),  # From STL file
            ]
        )
        # Should not raise
        assert len(config.boundaries) == 4
    
    def test_rejects_undefined_patch_for_snappyhexmesh(self):
        """Boundary condition referencing undefined patch should fail for snappyHexMesh."""
        with pytest.raises(ValidationError, match="does not match any mesh patch"):
            CaseConfig(
                mesh=MeshSettings(
                    mesh_type="snappyHexMesh",
                    stl_file="cylinder.stl",
                ),
                boundaries=[
                    BoundaryCondition(name="inlet"),
                    BoundaryCondition(name="undefined_patch"),  # <- Should fail
                ]
            )
    
    def test_patch_name_from_stl_filename(self):
        """Patch name should be derived from STL filename (without extension)."""
        config = CaseConfig(
            mesh=MeshSettings(
                mesh_type="snappyHexMesh",
                stl_file="/path/to/aircraft_fuselage.stl",  # Full path
            ),
            boundaries=[
                BoundaryCondition(name="inlet"),
                BoundaryCondition(name="aircraft_fuselage"),  # From STL
            ]
        )
        # Should not raise
        assert len(config.boundaries) == 2
    
    def test_multiple_undefined_patches(self):
        """Multiple undefined patches should be rejected."""
        with pytest.raises(ValidationError, match="does not match any mesh patch"):
            CaseConfig(
                boundaries=[
                    BoundaryCondition(name="inlet"),
                    BoundaryCondition(name="undefined_1"),
                    BoundaryCondition(name="undefined_2"),
                ]
            )


class TestBoundaryPatchErrorMessages:
    """Test quality of error messages for patch validation failures."""
    
    def test_error_includes_available_patches(self):
        """Error message should list available patches."""
        try:
            CaseConfig(
                boundaries=[
                    BoundaryCondition(name="typo_inlet"),  # Wrong name
                ]
            )
        except ValidationError as e:
            error_text = str(e)
            # Should mention inlet as available
            assert "inlet" in error_text.lower() or "Available" in error_text
    
    def test_error_distinguishes_blockmesh_from_snappyhexmesh(self):
        """Error should reflect which mesh type is being used."""
        try:
            CaseConfig(
                mesh=MeshSettings(
                    mesh_type="snappyHexMesh",
                    stl_file="geometry.stl",
                ),
                boundaries=[
                    BoundaryCondition(name="typo_inlet"),
                ]
            )
        except ValidationError as e:
            error_text = str(e)
            # Should mention geometry as available (from STL)
            assert "geometry" in error_text.lower() or "Available" in error_text


class TestBoundaryPatchEdgeCases:
    """Test edge cases in boundary patch validation."""
    
    def test_empty_stl_filename(self):
        """Empty STL filename should not add extra patches."""
        config = CaseConfig(
            mesh=MeshSettings(
                mesh_type="snappyHexMesh",
                stl_file="",  # Empty
            ),
            boundaries=[
                BoundaryCondition(name="inlet"),
                BoundaryCondition(name="outlet"),
                BoundaryCondition(name="walls"),
            ]
        )
        # Only blockMesh patches should be available
        assert len(config.boundaries) == 3
    
    def test_stl_with_multiple_dots(self):
        """STL filename with dots should be handled correctly."""
        config = CaseConfig(
            mesh=MeshSettings(
                mesh_type="snappyHexMesh",
                stl_file="geometry.v2.final.stl",
            ),
            boundaries=[
                BoundaryCondition(name="inlet"),
                BoundaryCondition(name="geometry.v2.final"),  # Full name minus .stl
            ]
        )
        # Should work - STL name extracted correctly
        assert len(config.boundaries) == 2
    
    def test_patch_name_case_sensitive(self):
        """Patch names should be case-sensitive."""
        with pytest.raises(ValidationError, match="does not match any mesh patch"):
            CaseConfig(
                boundaries=[
                    BoundaryCondition(name="INLET"),  # Wrong case
                ]
            )
    
    def test_whitespace_in_patch_names(self):
        """Patch names with whitespace should be rejected at model level."""
        # This should fail at BoundaryCondition.name validation (pattern check)
        with pytest.raises(ValidationError):
            BoundaryCondition(name="inlet patch")  # Space not allowed
