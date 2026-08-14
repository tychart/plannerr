"""Password hashing (argon2id + env pepper), session tokens, and password policy.

The pepper is a secret from the environment (``PASSWORD_PEPPER``) concatenated
into the value passed to argon2. Even if the database leaks, hashes cannot be
brute-forced without the pepper, which lives only in the server's environment.
"""

import hashlib
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error

from app.config import get_settings

_hasher = PasswordHasher()

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 200


def _peppered(password: str) -> str:
    """Mix the env-provided pepper into the password before hashing."""
    pepper = get_settings().password_pepper
    return f"{pepper}:{password}"


def hash_password(password: str) -> str:
    """Hash a plaintext password (argon2id) with the pepper mixed in."""
    return _hasher.hash(_peppered(password))


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a stored hash. Never raises."""
    try:
        return _hasher.verify(password_hash, _peppered(password))
    except Argon2Error:
        return False


def validate_username(username: str) -> str | None:
    """Return an error message if the username is invalid, else ``None``."""
    if not USERNAME_RE.fullmatch(username):
        return "Username must be 3-32 characters: letters, numbers, or underscore."
    return None


def validate_password(password: str) -> str | None:
    """Return an error message if the password is invalid, else ``None``."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Password must be at most {MAX_PASSWORD_LENGTH} characters."
    return None


def generate_session_token() -> tuple[str, str]:
    """Return ``(raw_token, sha256_token)``. Only the hash is stored in the DB."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    """SHA-256 digest of a session token — what we persist and look up."""
    return hashlib.sha256(raw.encode()).hexdigest()
