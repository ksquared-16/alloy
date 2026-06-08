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
from ..services.communication_message_sender import process_communication_messages
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

    if not INTERNAL_CRON_TOKEN:
        raise HTTPException(status_code=501, detail="INTERNAL_CRON_TOKEN is not configured")
    token = (INTERNAL_CRON_TOKEN or "").strip()
    if x_cron_token is None or (x_cron_token or "").strip() != token:
        raise HTTPException(status_code=401, detail="Invalid or missing x-cron-token")

    twilio_ok = bool(
        (TWILIO_ACCOUNT_SID or "").strip()
        and (TWILIO_AUTH_TOKEN or "").strip()
        and (TWILIO_MESSAGING_SERVICE_SID or "").strip()
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

    wr_raw = body.get("workflow_run_id")
    wr = wr_raw.strip() if isinstance(wr_raw, str) and wr_raw.strip() else None

    legacy: dict
    if twilio_ok:
        legacy = process_queued_messages(limit=limit, workflow_run_id=wr)
    else:
        logger.warning("MESSAGE_PROCESS_SKIP_LEGACY: Twilio env not fully configured; legacy public.messages unchanged")
        legacy = {
            "processed": 0,
            "sent": 0,
            "failed": 0,
            "message_ids": [],
            "errors": ["legacy pipeline skipped: TWILIO_* not configured"],
        }

    comm = process_communication_messages(limit=limit, workflow_run_id=wr)

    merged = {
        "processed": legacy.get("processed", 0) + comm.get("processed", 0),
        "sent": legacy.get("sent", 0) + comm.get("sent", 0),
        "failed": legacy.get("failed", 0) + comm.get("failed", 0),
        "message_ids": (legacy.get("message_ids") or []) + (comm.get("message_ids") or []),
        "errors": (legacy.get("errors") or []) + (comm.get("errors") or []),
        "legacy_messages": legacy,
        "communication_messages": comm,
    }
    return merged
