"""
Pure builder for the per-message Twilio status callback URL (P3.1).

The callback points at the Next.js status-webhook route and carries the binding id so the
handler can resolve the per-tenant verification token (P3) before it has a verified MessageSid.
No I/O, no twilio import — unit-testable.
"""

from __future__ import annotations

from typing import Optional

STATUS_CALLBACK_PATH = "/api/webhooks/twilio/sms-status"


def build_sms_status_callback_url(base: Optional[str], binding_id: Optional[str]) -> Optional[str]:
    """
    Returns the absolute statusCallback URL, or None when no base is configured
    (callers then omit statusCallback and fall back to Messaging Service console config).

    base: public origin Twilio can reach (scheme+host, no path), e.g. https://app.example.com
    binding_id: provider binding id; appended as a path segment for per-tenant token resolution.
    """
    b = (base or "").strip().rstrip("/")
    if not b:
        return None
    url = f"{b}{STATUS_CALLBACK_PATH}"
    bid = (binding_id or "").strip()
    if bid:
        url = f"{url}/{bid}"
    return url
