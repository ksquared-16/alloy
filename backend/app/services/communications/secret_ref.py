"""
Resolve secret references for provider bindings — no plaintext secrets in DB.
Supported secret_ref values (CARD 1.6):
- legacy_global_twilio — use process-wide Twilio env from settings (Alloy Services / migration only).
- env:VAR_NAME — read os.environ[VAR_NAME]; empty means missing.
- unconfigured — no secret available.
"""

from __future__ import annotations

import os
from typing import Optional


def resolve_secret_plaintext(secret_ref: str) -> Optional[str]:
    """
    Returns resolved secret string or None if unavailable.
    Caller must never log returned value.
    """
    ref = (secret_ref or "").strip()
    if not ref or ref == "unconfigured":
        return None
    if ref == "legacy_global_twilio":
        # Sentinel handled by callers (use settings-based Twilio send).
        return None
    if ref.startswith("env:"):
        key = ref[4:].strip()
        if not key:
            return None
        val = os.getenv(key)
        return val.strip() if val else None
    # Unknown convention — refuse (do not treat ref as literal secret).
    return None


def is_legacy_global_twilio_binding(secret_ref: str) -> bool:
    return (secret_ref or "").strip() == "legacy_global_twilio"
