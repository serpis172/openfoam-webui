import re
from pathlib import Path

PATTERN = re.compile(
    r"Solving for (?P<field>[A-Za-z0-9_]+), "
    r"Initial residual = (?P<initial>[0-9.eE+-]+), "
    r"Final residual = (?P<final>[0-9.eE+-]+), "
    r"No Iterations (?P<iterations>[0-9]+)"
)


def parse_openfoam_log(log_path: Path):
    if not log_path.exists():
        return {}

    residuals = {}

    try:
        text = log_path.read_text(errors="ignore")
    except Exception:
        return {}

    for match in PATTERN.finditer(text):
        field = match.group("field")
        final = float(match.group("final"))
        residuals.setdefault(field, []).append(final)

    return residuals


def parse_latest_residuals(case_dir: Path):
    logs = sorted(case_dir.glob("log.*"))

    if not logs:
        return {}

    latest = max(logs, key=lambda p: p.stat().st_mtime)
    return parse_openfoam_log(latest)