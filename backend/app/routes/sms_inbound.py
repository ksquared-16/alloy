"""
Twilio inbound SMS webhook.
Receives POST from Twilio, stores message in public.messages, returns TwiML empty response.
Configure in Twilio Messaging Service: https://api.workwithalloy.com/sms/inbound
"""
import logging
from typing import Optional

import requests
from fastapi import APIRouter, Request, Response

from ..supabase_client import _get_base_url, _get_headers
from ..services.activity_workflow_events import emit_message_lifecycle_event

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


@router.post("/inbound")
async def post_sms_inbound(request: Request) -> Response:
    """
    Receive Twilio inbound SMS webhook.
    Extracts From, To, Body, MessageSid; inserts into public.messages; returns <Response></Response>.
    """
    try:
        form = await request.form()
        from_num = (form.get("From") or "").strip()
        to_num = (form.get("To") or "").strip()
        body = (form.get("Body") or "").strip()
        message_sid = (form.get("MessageSid") or "").strip()
    except Exception as e:
        logger.warning("sms_inbound: form parse failed %s", e)
        from_num = to_num = body = message_sid = ""

    payload = {
        "direction": "inbound",
        "channel": "sms",
        "to_value": to_num or None,
        "from_value": from_num or None,
        "body": body or None,
        "external_id": message_sid or None,
    }

    base_url = _get_base_url()
    headers = _get_headers()
    url = f"{base_url}/messages"
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        if not resp.ok:
            logger.error("sms_inbound: messages insert failed status=%s body=%s", resp.status_code, resp.text[:500])
        else:
            logger.info("sms_inbound: stored MessageSid=%s from=%s", message_sid[-8:] if message_sid else "—", from_num[:12] if from_num else "—")
            try:
                data = resp.json()
                inserted: Optional[dict] = None
                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                    inserted = data[0]
                elif isinstance(data, dict) and data.get("id"):
                    inserted = data
                mid = inserted.get("id") if inserted else None
                if mid:
                    emit_message_lifecycle_event(
                        event_purpose="message_received",
                        message_row=inserted if isinstance(inserted, dict) else {},
                        message_id=str(mid),
                        body_text=body or None,
                    )
            except Exception as emit_err:
                logger.warning("sms_inbound: activity event emit skipped %s", emit_err)
    except Exception as e:
        logger.exception("sms_inbound: Supabase insert failed %s", e)

    return Response(
        content="<Response></Response>",
        media_type="application/xml",
    )
