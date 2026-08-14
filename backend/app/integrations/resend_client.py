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
    message_id: str | None = None,
    extra_headers: Dict[str, Any] | None = None,
    attachments: list[dict[str, str]] | None = None,
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
        # Always include a text alternative. Friendly HTML anchors put the booking
        # URL in href only; clients/filters that drop localhost or HTML still need
        # a usable destination in the text part.
        text = (text_body or "").strip()
        if text:
            payload["text"] = text
    else:
        payload["text"] = text_body.strip()

    # RFC 5322 Message-ID, minted by Alloy from the canonical message's own id.
    #
    # Without it a reply's `In-Reply-To` names something Alloy has no record of:
    # the id stored as `provider_message_id` is Resend's internal email id, not
    # the header a parent's mail client echoes. Setting it here is what makes
    # `In-Reply-To` correlation possible at all, and it is independent of whichever
    # provider Alloy eventually uses to RECEIVE mail.
    if message_id:
        payload["headers"] = {**(payload.get("headers") or {}), "Message-ID": message_id}
    # In-Reply-To / References, so the reply threads in the PARENT'S mail client
    # and not only inside Alloy. Server-owned: the UI constructs none of these.
    if extra_headers:
        payload["headers"] = {**(payload.get("headers") or {}), **extra_headers}

    if attachments:
        # Resend: [{ "filename", "content" (base64), "content_type"? }]
        cleaned: list[dict[str, str]] = []
        for att in attachments:
            if not isinstance(att, dict):
                continue
            filename = str(att.get("filename") or "").strip()
            content = str(att.get("content") or att.get("content_base64") or "").strip()
            if not filename or not content:
                continue
            entry: dict[str, str] = {"filename": filename, "content": content}
            ctype = str(att.get("content_type") or "").strip()
            if ctype:
                entry["content_type"] = ctype
            cleaned.append(entry)
        if cleaned:
            payload["attachments"] = cleaned

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
