"""Tests for mesh quality validation (Bug #2)."""

import pytest
from app.mesh_validation import validate_mesh_quality, format_mesh_report


class TestMeshValidationEmptyMesh:
    """Test validation of empty meshes (0 cells)."""
    
    def test_rejects_zero_cells(self):
        """Mesh with 0 cells should be marked invalid."""
        mesh_data = {
            "cells": 0,
            "points": 100,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is False
        assert len(result["issues"]) > 0
        assert any("zero cells" in issue.lower() for issue in result["issues"])
    
    def test_rejects_none_cells(self):
        """Mesh with None cells should be marked invalid."""
        mesh_data = {
            "cells": None,
            "points": 100,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is False
    
    def test_rejects_zero_points(self):
        """Mesh with 0 points should be marked invalid."""
        mesh_data = {
            "cells": 1000,
            "points": 0,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is False
        assert any("zero points" in issue.lower() for issue in result["issues"])


class TestMeshValidationInvertedCells:
    """Test validation of inverted cells."""
    
    def test_rejects_inverted_cells(self):
        """Mesh with inverted cells should be marked invalid."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "n_inverted_cells": 50,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is False
        assert any("inverted" in issue.lower() for issue in result["issues"])
    
    def test_accepts_no_inverted_cells(self):
        """Mesh with no inverted cells should pass this check."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "n_inverted_cells": 0,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        # Should still be valid (unless other issues)
        assert not any("inverted" in issue.lower() for issue in result["issues"])


class TestMeshValidationSkewness:
    """Test validation of mesh skewness."""
    
    def test_warns_high_skewness(self):
        """Skewness > 0.85 should produce warning."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "max_skewness": 0.90,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is True  # Warning, not fatal
        assert len(result["warnings"]) > 0
        assert any("skewness" in w.lower() for w in result["warnings"])
    
    def test_fails_extreme_skewness(self):
        """Skewness > 0.95 should mark mesh invalid."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "max_skewness": 0.98,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is False
        assert any("extreme" in issue.lower() for issue in result["issues"])
    
    def test_accepts_good_skewness(self):
        """Skewness < 0.85 should pass."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "max_skewness": 0.75,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        # No skewness-related warnings
        assert not any("skewness" in w.lower() for w in result["warnings"])


class TestMeshValidationNonOrthogonality:
    """Test validation of mesh non-orthogonality."""
    
    def test_warns_high_non_ortho(self):
        """Non-orthogonality > 65° should produce warning."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "max_non_orthogonality": 70.0,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is True
        assert len(result["warnings"]) > 0
        assert any("non-orthogonality" in w.lower() for w in result["warnings"])
    
    def test_fails_extreme_non_ortho(self):
        """Non-orthogonality > 85° should mark mesh invalid."""
        mesh_data = {
            "cells": 5000,
            "points": 1000,
            "max_non_orthogonality": 88.0,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is False
        assert any("extreme" in issue.lower() for issue in result["issues"])


class TestMeshValidationSize:
    """Test validation of mesh size sanity checks."""
    
    def test_warns_very_coarse_mesh(self):
        """Mesh < 1000 cells should produce warning."""
        mesh_data = {
            "cells": 500,
            "points": 100,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is True
        assert any("coarse" in w.lower() for w in result["warnings"])
    
    def test_warns_very_large_mesh(self):
        """Mesh > 50M cells should produce warning."""
        mesh_data = {
            "cells": 60_000_000,
            "points": 10_000_000,
        }
        result = validate_mesh_quality(mesh_data, "test-case-001")
        
        assert result["is_valid"] is True
        assert any("large" in w.lower() for w in result["warnings"])


class TestMeshValidationReport:
    """Test formatting of validation report."""
    
    def test_format_valid_mesh_report(self):
        """Valid mesh report should be formatted clearly."""
        mesh_report = {
            "is_valid": True,
            "issues": [],
            "warnings": ["High aspect ratio"],
            "metrics": {
                "cells": 5000,
                "points": 1000,
                "max_skewness": 0.75,
            }
        }
        
        report_text = format_mesh_report(mesh_report)
        
        assert "PASSED" in report_text
        assert "5000" in report_text
        assert "High aspect ratio" in report_text
    
    def test_format_invalid_mesh_report(self):
        """Invalid mesh report should be formatted clearly with issues."""
        mesh_report = {
            "is_valid": False,
            "issues": ["Mesh has zero cells"],
            "warnings": [],
            "metrics": {"cells": 0}
        }
        
        report_text = format_mesh_report(mesh_report)
        
        assert "FAILED" in report_text
        assert "zero cells" in report_text.lower()
    
    def test_format_report_includes_metrics(self):
        """Report should include all metrics."""
        mesh_report = {
            "is_valid": True,
            "issues": [],
            "warnings": [],
            "metrics": {
                "cells": 10000,
                "points": 2000,
                "max_skewness": 0.80,
                "max_non_orthogonality": 60.5,
                "max_aspect_ratio": 100.0,
            }
        }
        
        report_text = format_mesh_report(mesh_report)
        
        assert "10000" in report_text
        assert "2000" in report_text
        assert "0.80" in report_text
        assert "60.5" in report_text
        assert "100" in report_text


class TestMeshValidationCompleteCase:
    """Test validation with complete, realistic mesh data."""
    
    def test_valid_blockMesh_case(self):
        """A typical valid blockMesh should pass all checks."""
        mesh_data = {
            "cells": 48000,  # 60 x 20 x 40
            "points": 50205,
            "max_skewness": 0.50,
            "max_non_orthogonality": 0.0,  # blockMesh is perfect
            "max_aspect_ratio": 1.0,
        }
        
        result = validate_mesh_quality(mesh_data, "blockmesh-case")
        
        assert result["is_valid"] is True
        assert len(result["issues"]) == 0
        assert len(result["warnings"]) == 0
    
    def test_valid_snappyHexMesh_case(self):
        """A typical valid snappyHexMesh with boundary layers should pass."""
        mesh_data = {
            "cells": 125000,
            "points": 132045,
            "max_skewness": 0.78,
            "max_non_orthogonality": 62.5,
            "max_aspect_ratio": 850.0,  # Boundary layer
        }
        
        result = validate_mesh_quality(mesh_data, "snappy-case")
        
        assert result["is_valid"] is True
        assert len(result["issues"]) == 0
        # May have warnings about high aspect ratio, that's ok
    
    def test_problematic_mesh_case(self):
        """A problematic mesh with multiple issues should fail."""
        mesh_data = {
            "cells": 0,  # Empty mesh
            "points": 0,
            "max_skewness": 0.98,  # Would be bad if cells existed
            "max_non_orthogonality": 88.0,  # Would be bad if cells existed
            "max_aspect_ratio": 1.0,
            "n_inverted_cells": 100,  # Would be bad if cells existed
        }
        
        result = validate_mesh_quality(mesh_data, "bad-case")
        
        assert result["is_valid"] is False
        assert len(result["issues"]) > 0
