from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    data_root: Path = Path("/data")
    templates_dir: Path = Path("/app/templates")
    static_dir: Path = Path("/app/static")

    redis_url: str = "redis://redis:6379/0"

    max_upload_mb: int = 2048
    max_cases: int = 100
    job_timeout_seconds: int = 86400
    default_processors: int = 4

    enable_terminal: bool = False
    cors_origins: str = "*"
    allowed_geometry_extensions: str = ".stl,.obj,.vtk,.vtp"

    @property
    def cases_root(self) -> Path:
        return self.data_root / "cases"

    @property
    def allowed_geometry_ext_list(self) -> set[str]:
        return {
            ext.strip().lower()
            for ext in self.allowed_geometry_extensions.split(",")
            if ext.strip()
        }


settings = Settings()
settings.cases_root.mkdir(parents=True, exist_ok=True)