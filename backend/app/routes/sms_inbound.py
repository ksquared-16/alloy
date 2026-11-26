"""
Twilio inbound SMS webhook — the one runtime for a received SMS.

Receives a signed POST from Twilio and answers empty TwiML. Signature validation
fails closed; the inbound kill switch is COMMUNICATIONS_SMS_INBOUND_ENABLED.

  POST /sms/inbound/{binding_id}  deterministic org routing
  POST /sms/inbound               org resolved from the active SMS binding whose
                                  `inbound_to_e164` matches Twilio `To`, when unambiguous

WHERE A RECEIVED MESSAGE GOES
  organization resolved   -> canonical `communication_messages` (+ thread, + one
                             `message_received` Activity event, + keyword handling)
  organization unresolved -> `communication_inbound_ingress`, retained at provider
                             authority rather than guessed into a tenant

The legacy `public.messages` inbound dual-write was RETIRED once Block A proved
the canonical path end to end in a browser. It has no production reader — the one
legacy SELECT filters `direction = 'outbound'` — and `public.messages` carries no
`org_id`, so an inbound row there was never scoped to a tenant anyway. Outbound
legacy usage is untouched, and no historical row was deleted.
"""
import logging
from typing import Any, Dict, Optional, Tuple

import requests
from fastapi import APIRouter, Request, Response

from ..services.communication_inbound import (
    IDEMPOTENT_REPLAY_KEY,
    persist_inbound_communication_sms,
)
from ..services.inbound_keyword_handler import handle_inbound_keyword
from ..services.communication_inbound_ingress import (
    CROSS_ORG_AMBIGUOUS,
    NO_ATTRIBUTABLE_ORG,
    retain_unattributed_inbound_sms,
)
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
    canonical_persisted = False

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
                if row and row.get("id"):
                    canonical_persisted = True
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
                        kw_result = handle_inbound_keyword(
                            org_id=str(org_id_raw),
                            body=body,
                            message_row=row,
                        )
                        # Operational reply seam: only when no compliance keyword matched.
                        if not (kw_result or {}).get("keyword"):
                            from ..services.tour_attendance_sms_reply import (
                                handle_tour_attendance_sms_reply,
                            )

                            handle_tour_attendance_sms_reply(
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
    # No attributable organization. The message was really received and must not
    # be lost, but it cannot become tenant conversation truth without guessing a
    # tenant — so it is retained at provider-ingress authority until ownership is
    # established. STOP is classified here, because the canonical preference
    # authority requires org_id AND person_id and cannot represent an
    # unattributed opt-out.
    if not eff_row:
        state = destination_routing.get("destination_routing_state")
        if state == "unresolved":
            try:
                retain_unattributed_inbound_sms(
                    from_num=from_num,
                    to_num=to_num,
                    body=body,
                    external_sid=message_sid,
                    routing_disposition=(
                        CROSS_ORG_AMBIGUOUS
                        if destination_routing.get("destination_routing_reason")
                        == "ambiguous_destination_across_organizations"
                        else NO_ATTRIBUTABLE_ORG
                    ),
                    candidate_binding_ids=destination_routing.get("candidate_binding_ids") or [],
                )
            except Exception as e:  # noqa: BLE001
                logger.exception("sms_inbound: ingress retention failed %s", e)

    # The legacy `public.messages` inbound write is retired here. Inbound SMS now
    # has exactly one runtime.
    #
    # It was kept through convergence as a parity net, and Block A removed the last
    # reason to keep it: canonical persistence, Activity, unread, conversation
    # history, the operator Inbox, the reply loop, unknown-sender support,
    # ambiguity and STOP behaviour are all canonical and browser-certified. A final
    # audit found no production reader of a legacy INBOUND row anywhere —
    # TypeScript, Python, views or functions. The one legacy SELECT filters
    # `direction = 'outbound'`; the other two call sites are outbound inserts.
    #
    # The row could not have served as a tenant record regardless: `public.messages`
    # has no `org_id`, so an inbound row there was never scoped to anyone.
    #
    # Outbound legacy usage is deliberately untouched, and no historical row is
    # deleted — received communications are immutable history.
    if not canonical_persisted:
        # Not silence: an unattributable message is retained at provider-ingress
        # authority (see the quarantine branch above), which is the path that
        # replaced this one.
        logger.info(
            "sms_inbound: no canonical row for MessageSid=%s — retained at ingress authority",
            message_sid[-8:] if message_sid else "—",
        )

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
