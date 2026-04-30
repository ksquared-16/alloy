"""
Twilio inbound SMS webhook.
Receives POST from Twilio, stores message in public.messages, returns TwiML empty response.
Configure in Twilio Messaging Service.

Binding route (CARD 6): POST /sms/inbound/{binding_id}
  deterministic org routing + communication_* dual-write — legacy insert always preserved.
Legacy: POST /sms/inbound
"""
import logging
from typing import Any, Dict, Optional, Tuple

import requests
from fastapi import APIRouter, Request, Response

from ..services.activity_workflow_events import emit_message_lifecycle_event
from ..services.communication_inbound import persist_inbound_communication_sms
from ..services.communications.binding_resolver import find_binding_by_id
from ..supabase_client import _get_base_url, _get_headers

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


async def _parse_twilio_form(request: Request) -> Tuple[str, str, str, str]:
    """Returns from_num, to_num, body, message_sid."""
    try:
        form = await request.form()
        from_num = (form.get("From") or "").strip()
        to_num = (form.get("To") or "").strip()
        body = (form.get("Body") or "").strip()
        message_sid = (form.get("MessageSid") or "").strip()
        return from_num, to_num, body, message_sid
    except Exception as e:
        logger.warning("sms_inbound: form parse failed %s", e)
        return "", "", "", ""


def _insert_legacy_messages(
    *,
    from_num: str,
    to_num: str,
    body: str,
    message_sid: str,
) -> Optional[Dict[str, Any]]:
    """Insert into public.messages (unchanged semantics)."""
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
    resp = requests.post(url, headers=headers, json=payload, timeout=10)
    if not resp.ok:
        logger.error("sms_inbound: messages insert failed status=%s body=%s", resp.status_code, resp.text[:500])
        return None

    inserted: Optional[dict] = None
    try:
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            inserted = data[0]
        elif isinstance(data, dict) and data.get("id"):
            inserted = data
    except Exception:
        inserted = None
    mid = inserted.get("id") if inserted else None
    if mid:
        logger.info(
            "sms_inbound: stored MessageSid=%s from=%s",
            message_sid[-8:] if message_sid else "—",
            from_num[:12] if from_num else "—",
        )
        try:
            emit_message_lifecycle_event(
                event_purpose="message_received",
                message_row=inserted if isinstance(inserted, dict) else {},
                message_id=str(mid),
                body_text=body or None,
            )
        except Exception as emit_err:
            logger.warning("sms_inbound: activity event emit skipped %s", emit_err)
    return inserted


async def _handle_inbound_with_optional_binding(request: Request, binding_id: Optional[str]) -> Response:
    from_num, to_num, body, message_sid = await _parse_twilio_form(request)

    if binding_id:
        headers = _get_headers()
        base_url = _get_base_url()
        bd = find_binding_by_id(base_url, headers, binding_id.strip())
        if bd:
            try:
                org_id_raw = bd.get("org_id")
                if org_id_raw:
                    persist_inbound_communication_sms(
                        org_id=str(org_id_raw),
                        binding_id=str(bd.get("id")) if bd.get("id") else binding_id.strip(),
                        from_num=from_num,
                        to_num=to_num,
                        body=body,
                        external_sid=message_sid,
                        primary_entity_hint=None,
                    )
            except Exception as e:
                logger.warning("sms_inbound: communication inbound persist skipped %s", e)
        else:
            logger.warning("sms_inbound: unknown binding_id=%s (legacy only)", binding_id[:8])

    try:
        _insert_legacy_messages(
            from_num=from_num,
            to_num=to_num,
            body=body,
            message_sid=message_sid,
        )
    except Exception as e:
        logger.exception("sms_inbound: Supabase legacy insert failed %s", e)

    return Response(
        content="<Response></Response>",
        media_type="application/xml",
    )


@router.post("/inbound/{binding_id}")
async def post_sms_inbound_bound(binding_id: str, request: Request) -> Response:
    """Inbound with deterministic binding (org/thread routing for communication_*)."""
    return await _handle_inbound_with_optional_binding(request, binding_id)


@router.post("/inbound")
async def post_sms_inbound(request: Request) -> Response:
    """Legacy webhook URL — inserts public.messages only (no binding_id route)."""
    return await _handle_inbound_with_optional_binding(request, None)
