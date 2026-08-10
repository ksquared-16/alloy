"""
Twilio inbound SMS webhook.
Receives POST from Twilio, stores message in public.messages, returns TwiML empty response.
Configure in Twilio Messaging Service.

Binding route (CARD 6): POST /sms/inbound/{binding_id}
  deterministic org routing + communication_* dual-write — legacy insert always preserved.
Legacy: POST /sms/inbound — still inserts legacy messages; canonical persistence resolves org via active SMS binding matching Twilio ``To`` (`inbound_to_e164`), when unambiguous.

Card 24: X-Twilio-Signature validation + inbound kill switch (COMMUNICATIONS_SMS_INBOUND_ENABLED).
"""
import logging
from typing import Any, Dict, Optional, Tuple

import requests
from fastapi import APIRouter, Request, Response

from ..services.activity_workflow_events import emit_message_lifecycle_event
from ..services.communication_inbound import (
    IDEMPOTENT_REPLAY_KEY,
    persist_inbound_communication_sms,
)
from ..services.inbound_keyword_handler import handle_inbound_keyword
from ..services.communications.binding_resolver import (
    find_binding_by_id,
    find_sms_bindings_by_inbound_to,
)
from ..services.twilio_inbound_signature import (
    form_to_signature_params,
    resolve_inbound_twilio_auth_token,
    validate_twilio_inbound_signature,
)
from ..settings import (
    COMMUNICATIONS_SMS_INBOUND_ENABLED,
    COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL,
)
from ..supabase_client import _get_base_url, _get_headers

logger = logging.getLogger("alloy-dispatcher")

router = APIRouter()


def _empty_twiml() -> Response:
    return Response(content="<Response></Response>", media_type="application/xml")


def _mask_binding_id(binding_id: Optional[str]) -> str:
    b = (binding_id or "").strip()
    if not b:
        return "—"
    if len(b) <= 8:
        return f"{b[:2]}…"
    return f"{b[:4]}…{b[-4:]}"


def _tail_digits_hint(raw: Optional[str]) -> str:
    """Last digits only for ops logs — not full numbers."""
    d = "".join(c for c in (raw or "") if c.isdigit())
    return f"...{d[-4:]}" if len(d) >= 4 else "—"


def _signature_validation_url(request: Request) -> str:
    base = COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL.strip().rstrip("/")
    if base:
        path = request.url.path or ""
        q = request.url.query
        return f"{base}{path}" + (f"?{q}" if q else "")
    return str(request.url)


def _fields_from_form(form: Any) -> Tuple[str, str, str, str]:
    from_num = (form.get("From") or "").strip()
    to_num = (form.get("To") or "").strip()
    body = (form.get("Body") or "").strip()
    message_sid = (form.get("MessageSid") or "").strip()
    return from_num, to_num, body, message_sid


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


def _handle_inbound_with_optional_binding(
    *,
    binding_id: Optional[str],
    binding_row: Optional[Dict[str, Any]],
    from_num: str,
    to_num: str,
    body: str,
    message_sid: str,
) -> Response:
    base_url = _get_base_url()
    headers = _get_headers()

    eff_row = binding_row
    eff_uuid: Optional[str] = binding_id.strip() if binding_id and binding_id.strip() else None

    # Destination routing state travels with the message. `resolved` is the
    # normal case; anything else must still become canonical truth rather than
    # vanishing into a legacy row no operator surface reads.
    destination_routing: Dict[str, Any] = {"destination_routing_state": "resolved"}

    if eff_uuid:
        if not eff_row:
            logger.warning("sms_inbound: unknown binding_id=%s (legacy only)", _mask_binding_id(binding_id))
            destination_routing = {
                "destination_routing_state": "unresolved",
                "destination_routing_reason": "unknown_binding_id",
            }
    else:
        matches = find_sms_bindings_by_inbound_to(base_url, headers, to_e164=to_num)
        org_ids = sorted({str(m.get("org_id")) for m in matches if m.get("org_id")})
        if len(matches) == 0:
            # Nothing owns this destination number. The org is genuinely unknown,
            # and org_id is NOT NULL on threads and messages — inventing one to
            # satisfy the column would attribute a real parent's words to an
            # organization that never received them.
            logger.info(
                "sms_inbound: unresolved_destination no_binding to_tail=%s",
                _tail_digits_hint(to_num),
            )
            destination_routing = {
                "destination_routing_state": "unresolved",
                "destination_routing_reason": "no_active_sms_binding_for_destination",
            }
        elif len(matches) > 1 and len(org_ids) == 1:
            # AMBIGUOUS BINDING, KNOWN ORG. Which binding received this is
            # undecidable, but which organization did is not — so the message can
            # and must become canonical truth. No binding is chosen: eff_uuid
            # stays None and only the org is carried forward. The candidates are
            # recorded so an operator can resolve it later.
            logger.warning(
                "sms_inbound: ambiguous_destination_binding bindings=%s org_known=1",
                len(matches),
            )
            eff_row = {"org_id": org_ids[0]}
            eff_uuid = None
            destination_routing = {
                "destination_routing_state": "ambiguous",
                "destination_routing_reason": "multiple_active_bindings_for_destination",
                "candidate_binding_ids": sorted(
                    str(m.get("id")) for m in matches if m.get("id")
                )[:20],
                "candidate_binding_count": len(matches),
            }
        elif len(matches) > 1:
            # Candidates span organizations. Picking one would hand a family's
            # message to the wrong tenant, so nothing is picked.
            logger.warning(
                "sms_inbound: unresolved_destination cross_org bindings=%s distinct_orgs=%s",
                len(matches),
                len(org_ids),
            )
            destination_routing = {
                "destination_routing_state": "unresolved",
                "destination_routing_reason": "ambiguous_destination_across_organizations",
                "candidate_binding_count": len(matches),
            }
        else:
            eff_row = matches[0]
            rid = eff_row.get("id")
            eff_uuid = str(rid) if rid else None

    if eff_row:
        try:
            org_id_raw = eff_row.get("org_id")
            if org_id_raw:
                row = persist_inbound_communication_sms(
                    org_id=str(org_id_raw),
                    binding_id=eff_uuid,
                    from_num=from_num,
                    to_num=to_num,
                    body=body,
                    external_sid=message_sid,
                    primary_entity_hint=None,
                    destination_routing=destination_routing,
                )
                if row and row.get(IDEMPOTENT_REPLAY_KEY):
                    # Already recorded. Every effect of this provider message —
                    # canonical persistence, Activity, unread, thread state, and
                    # the keyword handling below — ran on the first delivery.
                    # Twilio retries until it gets a 2xx, so returning success is
                    # what STOPS the duplicates; it is the correct outcome, not a
                    # swallowed failure. Returning here also skips the legacy
                    # insert, which is otherwise unconditional and would append a
                    # duplicate row and a duplicate Activity event on every retry.
                    logger.info(
                        "sms_inbound: idempotent_replay message_id_tail=%s binding=%s",
                        str(row.get("id"))[-8:],
                        _mask_binding_id(eff_uuid),
                    )
                    return _empty_twiml()
                if row and row.get("id"):
                    sid = str(row["id"])
                    logger.info(
                        "sms_inbound: canonical_ok message_id_tail=%s binding=%s",
                        sid[-8:] if len(sid) > 8 else sid,
                        _mask_binding_id(eff_uuid),
                    )
                    # Compliance keywords are processed AFTER the message is
                    # persisted, never instead of it. The inbound record is
                    # immutable history and a STOP is still part of the
                    # conversation; a keyword failure must not lose it.
                    try:
                        handle_inbound_keyword(
                            org_id=str(org_id_raw),
                            body=body,
                            message_row=row,
                        )
                    except Exception as kw_err:  # noqa: BLE001
                        logger.error("sms_inbound: keyword handling failed %s", kw_err)
                else:
                    logger.warning(
                        "sms_inbound: canonical_persist noop binding=%s (see inbound_comm / PostgREST errors)",
                        _mask_binding_id(eff_uuid),
                    )
        except Exception as e:
            logger.warning("sms_inbound: communication inbound persist skipped %s", e)
    try:
        _insert_legacy_messages(
            from_num=from_num,
            to_num=to_num,
            body=body,
            message_sid=message_sid,
        )
    except Exception as e:
        logger.exception("sms_inbound: Supabase legacy insert failed %s", e)

    return _empty_twiml()


async def _inbound_guarded(request: Request, binding_id: Optional[str]) -> Response:
    route = "bound" if binding_id else "legacy"
    if not COMMUNICATIONS_SMS_INBOUND_ENABLED:
        logger.info("sms_inbound_guard event=inbound_disabled route=%s binding=%s", route, _mask_binding_id(binding_id))
        return _empty_twiml()

    form = await request.form()
    post_params = form_to_signature_params(form)

    headers = _get_headers()
    base_url = _get_base_url()
    binding_row: Optional[Dict[str, Any]] = None
    if binding_id:
        binding_row = find_binding_by_id(base_url, headers, binding_id.strip())

    auth_token = resolve_inbound_twilio_auth_token(binding_row if binding_id else None)

    sig = (request.headers.get("X-Twilio-Signature") or request.headers.get("x-twilio-signature") or "").strip()
    validation_url = _signature_validation_url(request)

    if not auth_token:
        logger.warning(
            "sms_inbound_guard event=signature_invalid reason=no_auth_token route=%s binding=%s",
            route,
            _mask_binding_id(binding_id),
        )
        return Response(status_code=403)

    if not validate_twilio_inbound_signature(
        auth_token=auth_token,
        full_url=validation_url,
        post_params=post_params,
        signature_header=sig or None,
    ):
        logger.warning(
            "sms_inbound_guard event=signature_invalid reason=bad_or_missing_signature route=%s binding=%s",
            route,
            _mask_binding_id(binding_id),
        )
        return Response(status_code=403)

    logger.info(
        "sms_inbound_guard event=validation_ok route=%s binding=%s",
        route,
        _mask_binding_id(binding_id),
    )

    from_num, to_num, body, message_sid = _fields_from_form(form)
    return _handle_inbound_with_optional_binding(
        binding_id=binding_id,
        binding_row=binding_row,
        from_num=from_num,
        to_num=to_num,
        body=body,
        message_sid=message_sid,
    )


@router.post("/inbound/{binding_id}")
async def post_sms_inbound_bound(binding_id: str, request: Request) -> Response:
    """Inbound with deterministic binding (org/thread routing for communication_*)."""
    return await _inbound_guarded(request, binding_id)


@router.post("/inbound")
async def post_sms_inbound(request: Request) -> Response:
    """Legacy webhook URL — canonical `communication_*` when one active SMS binding matches Twilio To; always legacy `public.messages`."""
    return await _inbound_guarded(request, None)
