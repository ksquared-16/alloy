"""
Pre-tenancy retention for inbound provider messages Alloy cannot yet attribute.

A verified Twilio webhook can arrive for a destination that matches no active
binding, or that matches bindings in more than one organization. `org_id` is NOT
NULL on `communication_messages` and stays that way, so such a message cannot be
tenant conversation truth yet — but it was really received, from a real parent,
and dropping it into legacy `public.messages` (which no operator Communications
surface reads) lost it.

This module is the durable holding place and nothing more. It has no thread, no
participants, no reply capability, and no operator conversation semantics. Once
ownership is established the ordinary canonical path materializes the message and
the ingress row records where it went.

Compliance is recognised HERE rather than after attribution, because
`communication_preferences` requires both `org_id` and `person_id` — the canonical
authority cannot express "this number said STOP and we do not know whose it is".
The hold on the ingress row is the narrow stand-in, scoped to that row's external
endpoint pair only.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

from ..supabase_client import _get_base_url, _get_headers
from .sms_keywords import parse_sms_keyword

logger = logging.getLogger("alloy-dispatcher")

_JSON_HEADERS = {"Content-Type": "application/json", "Prefer": "return=representation"}

NO_ATTRIBUTABLE_ORG = "no_attributable_org"
CROSS_ORG_AMBIGUOUS = "cross_org_ambiguous"


def _classify_keyword(body: str) -> Optional[str]:
    """
    Reuse the one production keyword vocabulary; never a second parser.

    A parallel STOP definition is how a message stops meaning STOP on one path
    while still meaning it on another.
    """
    try:
        parsed = parse_sms_keyword(body or "")
    except Exception:  # noqa: BLE001
        return None
    if not parsed:
        return None
    kw = str(parsed).strip().lower()
    return kw if kw in ("stop", "start", "help") else None


def find_ingress_by_provider_identity(
    base_url: str,
    headers: Dict[str, str],
    *,
    provider: str,
    channel: str,
    provider_message_id: str,
) -> Optional[Dict[str, Any]]:
    """Read side of the ingress uniqueness constraint — recognises a replay."""
    sid = (provider_message_id or "").strip()
    if not sid:
        return None
    params = {
        "provider": f"eq.{provider}",
        "channel": f"eq.{channel}",
        "provider_message_id": f"eq.{sid}",
        "select": "*",
        "limit": "1",
    }
    try:
        r = requests.get(
            f"{base_url}/communication_inbound_ingress",
            headers=headers,
            params=params,
            timeout=15,
        )
        if not r.ok:
            return None
        rows = r.json()
        if not isinstance(rows, list) or not rows:
            return None
    except Exception:
        return None
    row = rows[0]
    return row if isinstance(row, dict) else None


def retain_unattributed_inbound_sms(
    *,
    from_num: str,
    to_num: str,
    body: str,
    external_sid: str,
    routing_disposition: str,
    candidate_org_ids: Optional[List[str]] = None,
    candidate_binding_ids: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Durably retain one unattributable inbound SMS, exactly once.

    Returns the row, or None when it could not be retained — the caller keeps the
    legacy write in that case, because losing the message is the one outcome that
    is never acceptable.
    """
    sid = (external_sid or "").strip()
    if not sid:
        # Without provider identity there is no idempotency key, so retaining
        # would accumulate a row per retry. The legacy write remains the record.
        logger.warning("inbound_ingress: refused retention, no provider message id")
        return None

    base_url = _get_base_url()
    headers = _get_headers()

    existing = find_ingress_by_provider_identity(
        base_url, headers, provider="twilio", channel="sms", provider_message_id=sid
    )
    if existing and existing.get("id"):
        logger.info("inbound_ingress: idempotent_replay id_tail=%s", str(existing["id"])[-8:])
        return existing

    keyword = _classify_keyword(body)
    payload = {
        "provider": "twilio",
        "channel": "sms",
        "provider_message_id": sid,
        "from_address": from_num or None,
        "to_address": to_num or None,
        "body": body or None,
        "routing_disposition": routing_disposition,
        "candidate_org_ids": sorted(set(candidate_org_ids or [])),
        "candidate_binding_ids": sorted(set(candidate_binding_ids or [])),
        "compliance_keyword": keyword,
        # A STOP we cannot attribute is the case this hold exists for. START is
        # recorded but never clears anything here: re-consent belongs to the
        # tenant preference authority once ownership is known, and honouring it
        # pre-tenancy would let an unattributed message re-enable messaging.
        "compliance_hold_active": keyword == "stop",
    }

    h = dict(headers)
    h.update(_JSON_HEADERS)
    try:
        r = requests.post(
            f"{base_url}/communication_inbound_ingress", headers=h, json=payload, timeout=15
        )
        if not r.ok:
            if r.status_code == 409:
                # Concurrent delivery won the race; the constraint held.
                won = find_ingress_by_provider_identity(
                    base_url, headers, provider="twilio", channel="sms", provider_message_id=sid
                )
                if won:
                    return won
            logger.error("inbound_ingress: retain failed %s %s", r.status_code, r.text[:300])
            return None
        data = r.json()
        row = data[0] if isinstance(data, list) and data else data
        if isinstance(row, dict) and row.get("id"):
            logger.warning(
                "inbound_ingress: retained_unattributed disposition=%s keyword=%s hold=%s",
                routing_disposition,
                keyword or "—",
                payload["compliance_hold_active"],
            )
            return row
    except Exception as e:  # noqa: BLE001
        logger.exception("inbound_ingress: retain error %s", e)
    return None
