"""
Twilio SMS client wrapper.
Uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID from settings.
"""
import logging
from typing import Dict, Any

from twilio.rest import Client

from ..settings import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID,
)

logger = logging.getLogger("alloy-dispatcher")

# Mask SID for logs (last 6 chars only)
def _mask_sid(sid: str) -> str:
    if not sid or len(sid) <= 6:
        return "****"
    return "****" + sid[-6:]


def send_sms(to_number: str, body: str) -> Dict[str, Any]:
    """
    Send an SMS via Twilio REST API using the configured Messaging Service.

    Args:
        to_number: E.164 destination number (e.g. +15551234567).
        body: Message body text.

    Returns:
        Dict with at least "sid" and "status" (e.g. "queued" or "sent").

    Raises:
        ValueError: If to_number or body is empty/None.
        RuntimeError: If Twilio env vars are not set (e.g. TWILIO_MESSAGING_SERVICE_SID missing).
    """
    if not to_number or not str(to_number).strip():
        raise ValueError("to_number is required and cannot be empty")
    if not body or not str(body).strip():
        raise ValueError("body is required and cannot be empty")

    sid_val = (TWILIO_ACCOUNT_SID or "").strip()
    token_val = (TWILIO_AUTH_TOKEN or "").strip()
    messaging_sid = (TWILIO_MESSAGING_SERVICE_SID or "").strip()
    if not sid_val or not token_val:
        raise RuntimeError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set")
    if not messaging_sid:
        logger.error("TWILIO_MESSAGING_SERVICE_SID is not set; cannot send SMS")
        raise RuntimeError("TWILIO_MESSAGING_SERVICE_SID must be set")

    client = Client(sid_val, token_val)
    message = client.messages.create(
        body=body.strip(),
        messaging_service_sid=messaging_sid,
        to=to_number.strip(),
    )
    sid = message.sid or ""
    status = (message.status or "unknown").lower()
    logger.info("Twilio send_sms: sid=%s status=%s", _mask_sid(sid), status)
    return {"sid": sid, "status": status}
