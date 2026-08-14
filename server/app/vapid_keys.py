"""Generate a VAPID keypair for Web Push.

Usage:  uv run --project server python -m app.vapid_keys

Paste the two printed lines into ``.env`` (or your compose env) as
``VAPID_PUBLIC_KEY`` and ``VAPID_PRIVATE_KEY``. Keys are base64url-encoded
(no PEM), which keeps the .env values on a single line.
"""

import base64

from cryptography.hazmat.primitives.asymmetric import ec


def _to_base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate() -> tuple[str, str]:
    """Return (public_key, private_key) as base64url strings."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    priv_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
    pub_numbers = public_key.public_numbers()
    pub_raw = b"\x04" + pub_numbers.x.to_bytes(32, "big") + pub_numbers.y.to_bytes(32, "big")

    return _to_base64url(pub_raw), _to_base64url(priv_raw)


def main() -> None:
    public_key, private_key = generate()
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")


if __name__ == "__main__":
    main()
