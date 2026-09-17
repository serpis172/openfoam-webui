"""Mesh validation utilities for detecting quality issues early."""

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def validate_mesh_quality(mesh_data: dict, case_id: str) -> dict:
    """Validates mesh quality from checkMesh and VTK analysis.
    
    Args:
        mesh_data: Dictionary with keys 'cells', 'points', 'max_skewness', etc.
        case_id: Case identifier for logging
    
    Returns:
        Dictionary with:
        - is_valid: bool (True if mesh passes all checks)
        - issues: list of quality problems
        - warnings: list of non-fatal issues
        - metrics: dict of extracted metrics
    """
    result = {
        "is_valid": True,
        "issues": [],
        "warnings": [],
        "metrics": mesh_data.copy(),
    }
    
    # Check for empty mesh (0 cells = geometry doesn't intersect domain)
    n_cells = mesh_data.get("cells")
    if n_cells is None or n_cells == 0:
        result["is_valid"] = False
        result["issues"].append(
            "Mesh has zero cells — the geometry does not intersect the domain. "
            "Check domain_min/domain_max and location_in_mesh."
        )
        logger.error(f"Case {case_id}: Empty mesh (0 cells)")
        return result
    
    # Check for zero points (shouldn't happen if cells > 0, but be defensive)
    n_points = mesh_data.get("points")
    if n_points is None or n_points == 0:
        result["is_valid"] = False
        result["issues"].append("Mesh has zero points")
        logger.error(f"Case {case_id}: Mesh with 0 points")
        return result
    
    # Check for inverted cells (negative volume)
    n_inverted = mesh_data.get("n_inverted_cells", 0)
    if n_inverted and n_inverted > 0:
        result["is_valid"] = False
        result["issues"].append(
            f"Found {n_inverted} inverted cells (negative volume). "
            "This typically means the surface mesh has incorrect normals or is self-intersecting. "
            "Check the STL file with a mesh viewer."
        )
        logger.error(f"Case {case_id}: {n_inverted} inverted cells")
    
    # Warnings (non-fatal, but worth noting)
    
    # High skewness (0.85 is OpenFOAM's recommended max)
    max_skewness = mesh_data.get("max_skewness")
    if max_skewness is not None:
        if max_skewness > 0.85:
            result["warnings"].append(
                f"High mesh skewness ({max_skewness:.3f} > 0.85). "
                "Solution may be unstable or require smaller time steps. "
                "Consider refining or remeshing problematic regions."
            )
            logger.warning(f"Case {case_id}: High skewness {max_skewness}")
        
        # Very high skewness (>0.95) is concerning
        if max_skewness > 0.95:
            result["is_valid"] = False
            result["issues"].append(
                f"Extreme mesh skewness ({max_skewness:.3f}). "
                "This will likely cause solver divergence. Remesh with better quality."
            )
            logger.error(f"Case {case_id}: Extreme skewness {max_skewness}")
    
    # High non-orthogonality (65 degrees is OpenFOAM's default max)
    max_non_ortho = mesh_data.get("max_non_orthogonality")
    if max_non_ortho is not None:
        if max_non_ortho > 65:
            result["warnings"].append(
                f"High mesh non-orthogonality ({max_non_ortho:.1f}° > 65°). "
                "This may reduce accuracy or require additional correctors in fvSolution."
            )
            logger.warning(f"Case {case_id}: High non-orthogonality {max_non_ortho}")
        
        # Very high non-orthogonality (>85°) is problematic
        if max_non_ortho > 85:
            result["is_valid"] = False
            result["issues"].append(
                f"Extreme mesh non-orthogonality ({max_non_ortho:.1f}°). "
                "Consider increasing nNonOrthogonalCorrectors in fvSolution or remeshing."
            )
            logger.error(f"Case {case_id}: Extreme non-orthogonality {max_non_ortho}")
    
    # High aspect ratio (important for boundary layer meshes)
    max_aspect = mesh_data.get("max_aspect_ratio")
    if max_aspect is not None and max_aspect > 1000:
        result["warnings"].append(
            f"Very high aspect ratio ({max_aspect:.0f}). "
            "This is normal for boundary layer meshes but can affect convergence."
        )
        logger.info(f"Case {case_id}: High aspect ratio {max_aspect}")
    
    # Mesh size sanity checks
    if n_cells and n_cells > 50_000_000:
        result["warnings"].append(
            f"Very large mesh ({n_cells:,} cells). "
            "Simulation will require significant memory and time. "
            "Consider coarser refinement levels."
        )
    
    if n_cells and n_cells < 1000:
        result["warnings"].append(
            f"Very coarse mesh ({n_cells:,} cells). "
            "Results may lack accuracy. Consider finer refinement."
        )
    
    return result


def format_mesh_report(mesh_report: dict) -> str:
    """Formats mesh validation report as human-readable text."""
    lines = []
    
    if mesh_report["is_valid"]:
        lines.append("✅ Mesh validation PASSED")
    else:
        lines.append("❌ Mesh validation FAILED")
        lines.append("\nIssues:")
        for issue in mesh_report["issues"]:
            lines.append(f"  • {issue}")
    
    if mesh_report["warnings"]:
        lines.append("\n⚠️  Warnings:")
        for warning in mesh_report["warnings"]:
            lines.append(f"  • {warning}")
    
    def _fmt_count(value) -> str:
        """Thousands-separated for real numbers; 'N/A' (a str) has no
        ',' formatting to apply, so it must not go through the same
        f-string spec as the numeric case."""
        return f"{value:,}" if isinstance(value, (int, float)) else str(value)

    metrics = mesh_report.get("metrics", {})
    if metrics:
        lines.append("\nMetrics:")
        lines.append(f"  Cells:        {_fmt_count(metrics.get('cells', 'N/A'))}")
        lines.append(f"  Points:       {_fmt_count(metrics.get('points', 'N/A'))}")
        lines.append(f"  Skewness:     {metrics.get('max_skewness', 'N/A')}")
        lines.append(f"  Non-Ortho:    {metrics.get('max_non_orthogonality', 'N/A')}°")
        lines.append(f"  Aspect Ratio: {metrics.get('max_aspect_ratio', 'N/A')}")
    
    return "\n".join(lines)
