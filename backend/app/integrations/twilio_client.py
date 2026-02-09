"""
Twilio SMS client wrapper.
Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER from settings.
"""
import logging
from typing import Dict, Any

from twilio.rest import Client

from ..settings import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

logger = logging.getLogger("alloy-dispatcher")

# Mask SID for logs (last 6 chars only)
def _mask_sid(sid: str) -> str:
    if not sid or len(sid) <= 6:
        return "****"
    return "****" + sid[-6:]


def send_sms(to_number: str, body: str) -> Dict[str, Any]:
    """
    Send an SMS via Twilio REST API.

    Args:
        to_number: E.164 destination number (e.g. +15551234567).
        body: Message body text.

    Returns:
        Dict with at least "sid" and "status" (e.g. "queued" or "sent").

    Raises:
        ValueError: If to_number or body is empty/None.
        RuntimeError: If Twilio env vars are not set.
    """
    if not to_number or not str(to_number).strip():
        raise ValueError("to_number is required and cannot be empty")
    if not body or not str(body).strip():
        raise ValueError("body is required and cannot be empty")

    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        raise RuntimeError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set")
    if not TWILIO_FROM_NUMBER:
        raise RuntimeError("TWILIO_FROM_NUMBER must be set")

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    message = client.messages.create(
        body=body.strip(),
        from_=TWILIO_FROM_NUMBER.strip(),
        to=to_number.strip(),
    )
    sid = message.sid or ""
    status = (message.status or "unknown").lower()
    logger.info("Twilio send_sms: sid=%s status=%s", _mask_sid(sid), status)
    return {"sid": sid, "status": status}
