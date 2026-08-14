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
    rate_limit_notifications: str = "6/minute"  # per-IP cap on the test-notification endpoint

    # Web Push (VAPID keys, base64url-encoded). Empty keys ⇒ notifications UI disabled.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:plannerr@localhost"

    # LLM summary (OpenAI-compatible chat completions — LiteLLM proxy, Ollama, OpenAI…).
    # Enabled when llm_base_url is set (Ollama / LiteLLM are typically keyless, so the
    # API key is optional). Empty llm_base_url ⇒ deterministic fallback summary only.
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 15.0

    # Scheduled daily notifications.
    notification_check_seconds: int = 30  # how often the scheduler scans for due sends
    default_notification_time: str = "08:00"  # HH:MM used until the user picks their own

    @property
    def cookie_max_age(self) -> int:
        """Session cookie lifetime in seconds."""
        return self.session_ttl_days * 24 * 60 * 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
