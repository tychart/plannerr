"""Application settings loaded from environment variables / .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration. Overridable via env vars (e.g. ``DATABASE_URL``)
    or a ``.env`` file in the server working directory.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://plannerr:plannerr@localhost:5432/plannerr"
    password_pepper: str = ""  # secret pepper mixed into password hashing (required in prod)
    session_ttl_days: int = 30
    cookie_name: str = "plannerr_session"
    cookie_secure: bool = False  # set True when served over HTTPS
    rate_limit_auth: str = "10/minute"

    @property
    def cookie_max_age(self) -> int:
        """Session cookie lifetime in seconds."""
        return self.session_ttl_days * 24 * 60 * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
