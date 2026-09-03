"""Small shared text helpers used across routers and services."""


def normalize_name(name: str) -> str:
    """Trim and collapse internal whitespace (class-name canonical form)."""
    return " ".join(name.strip().split())
