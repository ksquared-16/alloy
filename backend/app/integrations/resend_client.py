"""
Resend transactional email adapter (minimal V1).

Requires RESEND_API_KEY in environment unless binding uses env:OTHER_KEY.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

import requests

logger = logging.getLogger("alloy-dispatcher")


def send_resend_email(
    *,
    to_email: str,
    subject: str,
    html_body: str | None,
    text_body: str,
    from_email: str,
    api_key: str,
) -> Dict[str, Any]:
    if not api_key.strip():
        raise RuntimeError("Resend API key missing")
    if not from_email.strip():
        raise RuntimeError("Resend from address missing")
    if not to_email.strip():
        raise ValueError("to_email required")
    payload: Dict[str, Any] = {
        "from": from_email.strip(),
        "to": [to_email.strip()],
        "subject": subject.strip() or "(no subject)",
    }
    if html_body:
        payload["html"] = html_body
    else:
        payload["text"] = text_body.strip()

    headers = {"Authorization": f"Bearer {api_key.strip()}", "Content-Type": "application/json"}
    resp = requests.post("https://api.resend.com/emails", json=payload, headers=headers, timeout=20)
    if not resp.ok:
        raise RuntimeError(f"Resend HTTP {resp.status_code}: {resp.text[:500]}")
    data = resp.json() if resp.text else {}
    mid = data.get("id") if isinstance(data, dict) else None
    # Success logging with from/to context lives in communication_message_sender (dispatcher).
    logger.debug("Resend API ok id_tail=%s", str(mid)[-8:] if mid else "none")
    return {"id": str(mid) if mid else "", "raw": data}


def default_from_email() -> str:
    return (os.getenv("RESEND_FROM_EMAIL") or "").strip()
