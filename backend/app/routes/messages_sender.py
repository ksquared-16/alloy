"""
Internal cron-style endpoint to process queued SMS messages from public.messages.
Secured with INTERNAL_CRON_TOKEN via header x-cron-token.
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request

from ..settings import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_MESSAGING_SERVICE_SID,
    INTERNAL_CRON_TOKEN,
)
from ..services.message_sender import process_queued_messages

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


def _log_env_sanity() -> None:
    """Log presence of env vars (booleans only, no values)."""
    logger.info(
        "ENV_SANITY TWILIO_ACCOUNT_SID=%s TWILIO_AUTH_TOKEN=%s TWILIO_MESSAGING_SERVICE_SID=%s INTERNAL_CRON_TOKEN=%s",
        bool(TWILIO_ACCOUNT_SID),
        bool(TWILIO_AUTH_TOKEN),
        bool(TWILIO_MESSAGING_SERVICE_SID),
        bool(INTERNAL_CRON_TOKEN),
    )


@router.post("/messages/process")
async def post_process_messages(request: Request, x_cron_token: Optional[str] = Header(None, alias="x-cron-token")):
    """
    Process queued outbound SMS messages: fetch from Supabase, send via Twilio, update rows.
    Requires header: x-cron-token: <INTERNAL_CRON_TOKEN>.
    Optional body: { "limit": 25 }.
    """
    _log_env_sanity()

    if not INTERNAL_CRON_TOKEN:
        raise HTTPException(status_code=501, detail="INTERNAL_CRON_TOKEN is not configured")
    token = (INTERNAL_CRON_TOKEN or "").strip()
    if x_cron_token is None or (x_cron_token or "").strip() != token:
        raise HTTPException(status_code=401, detail="Invalid or missing x-cron-token")

    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_MESSAGING_SERVICE_SID:
        raise HTTPException(
            status_code=500,
            detail="Twilio is not configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_MESSAGING_SERVICE_SID)",
        )

    try:
        raw = await request.body()
        body = json.loads(raw) if raw else {}
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    limit = int(body.get("limit", 25))
    limit = max(1, min(limit, 100))

    result = process_queued_messages(limit=limit)
    return result
