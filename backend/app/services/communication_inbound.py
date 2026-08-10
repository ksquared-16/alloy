"""Inbound persistence into communication_* (dual-write preserves legacy sms_inbound → public.messages)."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..supabase_client import _get_base_url, _get_headers, normalize_phone
from .communication_workflow_events import emit_for_communication_message
from .communications.identity_resolver import find_identity_by_legacy_binding, find_inbound_identities_by_destination

logger = logging.getLogger("alloy-dispatcher")

INBOUND_SURROGATE_NS = uuid.UUID("a3f7c89e-b1aa-52d0-9e61-000000010001")
INBOUND_AMBIGUOUS_NS = uuid.UUID("b2d6c1d2-4e3f-5a6b-9c0d-1e2f3a4b5c6d")

_MAX_PERSON_LOOKUP = 22


def surrogate_inbound_entity_id(org_id: str, phone_norm: str) -> str:
    return str(uuid.uuid5(INBOUND_SURROGATE_NS, f"{org_id}|{phone_norm}"))


def surrogate_ambiguous_persons(org_id: str, phone_norm: str, person_ids: List[str]) -> str:
    tail = ",".join(sorted(str(x) for x in person_ids if x))
    return str(uuid.uuid5(INBOUND_AMBIGUOUS_NS, f"{org_id}|{phone_norm}|{tail}"))


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)

_JSON_HEADERS = {"Content-Type": "application/json", "Prefer": "return=representation"}


def _utcnow_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def recipient_key_normalize_sms(raw: str) -> str:
    n = normalize_phone((raw or "").strip())
    return n or ""


def _persons_by_phone_org(
    base_url: str, headers: Dict[str, str], org_id: str, phone_normalized: str
) -> List[Dict[str, Any]]:
    if not phone_normalized:
        return []
    url = f"{base_url}/persons"
    params = {
        "org_id": f"eq.{org_id}",
        "phone": f"eq.{phone_normalized}",
        "select": "id",
        "limit": str(_MAX_PERSON_LOOKUP),
    }
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if not r.ok:
            return []
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


def resolve_primary_entity_for_inbound_sms(
    base_url: str, headers: Dict[str, str], org_id: str, from_phone: str
) -> Tuple[str, str]:
    """Backward-compat: entity type + id only (no metadata). Prefer resolve_inbound_sms_anchor_with_metadata internally."""
    et, eid, _, _ = resolve_inbound_sms_anchor_with_metadata(base_url, headers, org_id, from_phone)
    return et, eid


def resolve_inbound_sms_anchor_with_metadata(
    base_url: str, headers: Dict[str, str], org_id: str, from_phone: str
) -> Tuple[str, str, Dict[str, Any], Dict[str, Any]]:
    """
    Person-first inbound anchor for SMS threading (no contacts).

    Returns (primary_entity_type, primary_entity_id, thread_metadata, message_resolution_metadata).

    - Exactly one matching person in org → persons + person id.
    - Zero persons → communications_unknown surrogate (unknown_sender).
    - Multiple persons → communications_unknown deterministic surrogate + candidate_person_ids (no guessing).
    """
    norm = recipient_key_normalize_sms(from_phone)
    persons = _persons_by_phone_org(base_url, headers, org_id, norm)
    count = len(persons)

    if count == 0:
        if not norm:
            eid = surrogate_inbound_entity_id(org_id, "__missing_phone__")
        else:
            eid = surrogate_inbound_entity_id(org_id, norm)
        tm = {"inbound_resolution": "unknown_sender", "anchor": "surrogate_phone"}
        mm = dict(tm)
        return "communications_unknown", eid, tm, mm

    if count == 1:
        pid = str(persons[0].get("id"))
        tm = {"inbound_resolution": "single_person_match", "person_id": pid}
        mm = dict(tm)
        return "persons", pid, tm, mm

    ids_sorted = sorted(
        str(p.get("id")) for p in persons if p.get("id") is not None
    )
    eid = surrogate_ambiguous_persons(org_id, norm or "", ids_sorted)
    tm: Dict[str, Any] = {
        "inbound_resolution": "ambiguous_sender",
        "candidate_person_ids": ids_sorted[:20],
        "anchor": "surrogate_ambiguous_persons",
    }
    if count >= _MAX_PERSON_LOOKUP:
        tm["resolution_truncated"] = True
        tm["resolution_note"] = f"cap_{_MAX_PERSON_LOOKUP}_person_query"
    mm = dict(tm)
    return "communications_unknown", eid, tm, mm


def _row_exists_or_create_thread(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    entity_type: str,
    entity_id: str,
    channel: str,
    recipient_key: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    url = f"{base_url}/communication_threads"
    h = dict(headers)
    h.update(_JSON_HEADERS)
    q = {
        "org_id": f"eq.{org_id}",
        "primary_entity_type": f"eq.{entity_type}",
        "primary_entity_id": f"eq.{entity_id}",
        "channel": f"eq.{channel}",
        "recipient_key": f"eq.{recipient_key}",
        "select": "id",
        "limit": "1",
    }
    try:
        rget = requests.get(url, headers=headers, params=q, timeout=15)
        if rget.ok:
            existing = rget.json()
            if isinstance(existing, list) and existing and existing[0].get("id"):
                return str(existing[0]["id"])
    except Exception:
        pass

    body = {
        "org_id": org_id,
        "primary_entity_type": entity_type,
        "primary_entity_id": entity_id,
        "channel": channel,
        "recipient_key": recipient_key,
        "metadata": dict(metadata) if metadata else {},
    }
    try:
        r = requests.post(url, headers=h, json=body, timeout=15)
        if not r.ok:
            logger.error("inbound_comm thread insert fail %s %s", r.status_code, r.text[:300])
            return None
        data = r.json()
        if isinstance(data, list) and data and isinstance(data[0], dict) and data[0].get("id"):
            return str(data[0]["id"])
        if isinstance(data, dict) and data.get("id"):
            return str(data["id"])
    except Exception as e:
        logger.exception("inbound_comm thread err %s", e)
        return None
    return None


def _find_canonical_sms_thread(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    recipient_key: str,
) -> Optional[str]:
    """
    G4 — the conversation is the relationship, not the originating business object.
    Reuse the existing SMS thread for this contact (recipient_key) regardless of its anchor so an
    inbound reply joins the one canonical family/person conversation instead of forking a parallel
    thread. Preference: persons/customers-anchored (canonical) first, else most recent.
    Returns a thread id or None when no thread exists for this contact yet.
    """
    rkey = (recipient_key or "").strip()
    if not rkey:
        return None
    url = f"{base_url}/communication_threads"
    params = {
        "org_id": f"eq.{org_id}",
        "channel": "eq.sms",
        "recipient_key": f"eq.{rkey}",
        "select": "id,primary_entity_type,last_message_at,created_at",
        "order": "last_message_at.desc.nullslast,created_at.desc",
        "limit": "50",
    }
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if not r.ok:
            return None
        rows = r.json()
        if not isinstance(rows, list) or not rows:
            return None
    except Exception:
        return None
    canonical = [
        row for row in rows
        if str(row.get("primary_entity_type") or "").strip().lower() in ("persons", "customers")
    ]
    pick = (canonical or rows)[0]
    rid = pick.get("id")
    return str(rid) if rid else None


#: Sentinel key added to a returned row when this provider message had already
#: been recorded. NOT a database column — callers read it to know that every side
#: effect for this message already ran and must not run a second time.
IDEMPOTENT_REPLAY_KEY = "_idempotent_replay"


def find_inbound_message_by_provider_identity(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    provider: str,
    channel: str,
    provider_message_id: str,
) -> Optional[Dict[str, Any]]:
    """
    The canonical inbound identity: (org, provider, channel, provider_message_id).

    Twilio retries until it gets a 2xx and may redeliver regardless, so the same
    MessageSid legitimately arrives more than once. This is the read side of the
    uniqueness invariant declared by migration 20260810120000 — the database owns
    the guarantee; this only lets the application recognise a replay and return the
    message it already has instead of provoking a constraint violation.

    Keyed on provider identity alone, deliberately: body, timestamp and sender are
    not identity, and using them would collapse two genuinely distinct messages
    that happen to say the same thing.
    """
    sid = (provider_message_id or "").strip()
    if not sid or not _UUID_RE.match(org_id):
        return None
    url = f"{base_url}/communication_messages"
    params = {
        "org_id": f"eq.{org_id}",
        "provider": f"eq.{provider}",
        "channel": f"eq.{channel}",
        "direction": "eq.inbound",
        "provider_message_id": f"eq.{sid}",
        "select": "*",
        "limit": "1",
    }
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if not r.ok:
            return None
        rows = r.json()
        if not isinstance(rows, list) or not rows:
            return None
    except Exception:
        return None
    row = rows[0]
    return row if isinstance(row, dict) else None


def _patch_thread_inbound_state(
    base_url: str,
    headers: Dict[str, str],
    *,
    thread_id: str,
    last_message_at: Optional[str],
    destination_routing_state: Optional[str] = None,
) -> None:
    """
    G2 + G6 — bump last activity and enter the attention workflow on inbound.

    Reuses `communication_threads.attention_state`, the existing operational queue
    authority (it already carries a partial index on
    `(org_id, attention_state, last_message_at DESC)`), rather than introducing a
    second attention mechanism. A reply Alloy could not route needs a different
    operator response than one it could: `needs_response` means "answer this",
    `needs_routing_resolution` means "tell us where this belongs" — and without
    the distinction an unroutable reply would sit in the queue looking answerable.
    """
    h = dict(headers)
    h.update(_JSON_HEADERS)
    state = (
        "needs_routing_resolution"
        if destination_routing_state in ("unresolved", "ambiguous")
        else "needs_response"
    )
    patch: Dict[str, Any] = {"attention_state": state}
    if last_message_at:
        patch["last_message_at"] = last_message_at
    try:
        requests.patch(
            f"{base_url}/communication_threads?id=eq.{thread_id}",
            headers=h,
            json=patch,
            timeout=15,
        )
    except Exception as e:
        logger.warning("inbound_comm thread state patch skipped %s", e)


def _mark_latest_outbound_replied(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    thread_id: str,
    replied_at: str,
) -> None:
    """
    G1 — stamp the most recent prior outbound message (and its recipient rows) as replied so the
    timeline reply indicator (UI-5H) lights up. No-op when already replied or no outbound exists.
    """
    try:
        rget = requests.get(
            f"{base_url}/communication_messages",
            headers=headers,
            params={
                "org_id": f"eq.{org_id}",
                "thread_id": f"eq.{thread_id}",
                "direction": "eq.outbound",
                "select": "id,replied_at",
                "order": "created_at.desc",
                "limit": "1",
            },
            timeout=15,
        )
        if not rget.ok:
            return
        rows = rget.json()
        if not isinstance(rows, list) or not rows:
            return
        msg = rows[0]
        if msg.get("replied_at"):
            return
        mid = msg.get("id")
        if not mid:
            return
    except Exception:
        return

    h = dict(headers)
    h.update(_JSON_HEADERS)
    try:
        requests.patch(
            f"{base_url}/communication_messages?id=eq.{mid}",
            headers=h,
            json={"replied_at": replied_at},
            timeout=15,
        )
    except Exception as e:
        logger.warning("inbound_comm replied_at message patch skipped %s", e)
    try:
        requests.patch(
            f"{base_url}/communication_message_recipients?message_id=eq.{mid}",
            headers=h,
            json={"replied_at": replied_at, "status": "replied", "last_event_at": replied_at},
            timeout=15,
        )
    except Exception as e:
        logger.warning("inbound_comm replied_at recipient patch skipped %s", e)


def persist_inbound_communication_sms(
    *,
    org_id: str,
    binding_id: Optional[str],
    from_num: str,
    to_num: str,
    body: str,
    external_sid: str,
    primary_entity_hint: Optional[Tuple[str, str]] = None,
    destination_routing: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Insert inbound communication_messages + workflow event message_received.
    primary_entity_hint optional (entity_type, entity_id); else derived via CARD 15 person-phone or surrogate anchor.
    """
    if not _UUID_RE.match(org_id):
        return None
    base_url = _get_base_url()
    headers = _get_headers()

    # Idempotency, BEFORE any thread resolution or creation. A redelivered
    # MessageSid must not mint a second thread, a second unread, a second
    # Activity entry, or a second execution of STOP — and the cheapest way to
    # guarantee that is to never begin the work. The database index is the
    # authority; this is the recognition step in front of it.
    if external_sid and (external_sid or "").strip():
        existing = find_inbound_message_by_provider_identity(
            base_url,
            headers,
            org_id=org_id,
            provider="twilio",
            channel="sms",
            provider_message_id=external_sid,
        )
        if existing and existing.get("id"):
            logger.info(
                "inbound_comm idempotent_replay message_id_tail=%s",
                str(existing["id"])[-8:],
            )
            replay = dict(existing)
            replay[IDEMPOTENT_REPLAY_KEY] = True
            return replay

    if primary_entity_hint and len(primary_entity_hint) == 2:
        et_raw, eid_raw = primary_entity_hint
        entity_type = str(et_raw).strip()
        entity_id = str(eid_raw).strip()
        if not entity_type or not _UUID_RE.match(entity_id):
            entity_type, entity_id, thread_meta, msg_meta = resolve_inbound_sms_anchor_with_metadata(
                base_url, headers, org_id, from_num
            )
        else:
            thread_meta = {"inbound_resolution": "primary_entity_hint"}
            msg_meta = dict(thread_meta)
    else:
        entity_type, entity_id, thread_meta, msg_meta = resolve_inbound_sms_anchor_with_metadata(
            base_url, headers, org_id, from_num
        )

    # Destination routing outcome is part of the message's truth, not a log line.
    # An operator resolving an ambiguous reply later needs to know WHY it was
    # ambiguous and what the candidates were.
    if destination_routing:
        thread_meta = dict(thread_meta)
        msg_meta = dict(msg_meta)
        thread_meta.update(destination_routing)
        msg_meta.update(destination_routing)

    rkey = recipient_key_normalize_sms(from_num)
    # G4 — reuse the canonical conversation for this contact when one exists (any anchor); the
    # originating business object stays attached as context. Only create when there is no thread yet.
    thread_id = _find_canonical_sms_thread(base_url, headers, org_id=org_id, recipient_key=rkey)
    if not thread_id:
        thread_id = _row_exists_or_create_thread(
            base_url,
            headers,
            org_id=org_id,
            entity_type=entity_type,
            entity_id=entity_id,
            channel="sms",
            recipient_key=rkey,
            metadata=thread_meta,
        )
    if not thread_id:
        return None

    bid = binding_id if binding_id and _UUID_RE.match(binding_id) else None
    identity_id = None
    account_id = None
    if bid:
        ident = find_identity_by_legacy_binding(base_url, headers, bid)
        if ident:
            identity_id = ident.get("id")
            account_id = ident.get("provider_account_id")
    elif to_num:
        matches = find_inbound_identities_by_destination(
            base_url, headers, channel="sms", destination=to_num, org_id=org_id
        )
        if len(matches) == 1:
            identity_id = matches[0].get("id")
            account_id = matches[0].get("provider_account_id")
        elif len(matches) > 1:
            msg_meta = dict(msg_meta)
            msg_meta["inbound_location_ambiguous"] = True

    payload_msg = {
        "org_id": org_id,
        "thread_id": thread_id,
        "channel": "sms",
        "direction": "inbound",
        "status": "delivered",
        "body": body or None,
        "from_address": from_num or None,
        "to_address": to_num or None,
        "provider": "twilio",
        "provider_message_id": external_sid or None,
        "metadata": dict(msg_meta),
    }
    if bid:
        payload_msg["communication_provider_binding_id"] = bid
    if identity_id:
        payload_msg["communication_identity_id"] = identity_id
    if account_id:
        payload_msg["communication_provider_account_id"] = account_id

    h = dict(headers)
    h.update(_JSON_HEADERS)
    url_msgs = f"{base_url}/communication_messages"
    try:
        rm = requests.post(url_msgs, headers=h, json=payload_msg, timeout=15)
        if not rm.ok:
            # 409 = the inbound provider-identity index rejected this row, so a
            # concurrent delivery of the same MessageSid won the race between our
            # pre-check and this insert. That is the invariant working, not a
            # failure: return the row that won so the caller treats this delivery
            # as the replay it is and runs no side effects.
            if rm.status_code == 409 and external_sid:
                won = find_inbound_message_by_provider_identity(
                    base_url,
                    headers,
                    org_id=org_id,
                    provider="twilio",
                    channel="sms",
                    provider_message_id=external_sid,
                )
                if won and won.get("id"):
                    logger.info(
                        "inbound_comm idempotent_race_resolved message_id_tail=%s",
                        str(won["id"])[-8:],
                    )
                    replay = dict(won)
                    replay[IDEMPOTENT_REPLAY_KEY] = True
                    return replay
            logger.error("inbound_comm msg insert fail %s %s", rm.status_code, rm.text[:400])
            return None
        jd = rm.json()
        row = jd[0] if isinstance(jd, list) and jd else jd
        mid = row.get("id") if isinstance(row, dict) else None
        if mid:
            emit_for_communication_message(
                org_id=org_id,
                subject_entity=(entity_type, entity_id),
                event_type="message_received",
                message_id=str(mid),
                thread_id=thread_id,
                channel="sms",
                direction="inbound",
                body_text=body,
                extra={
                    "external_id": external_sid or None,
                    "communication_provider_binding_id": bid,
                    "inbound_resolution": msg_meta.get("inbound_resolution"),
                },
            )
            inbound_created_at = row.get("created_at") if isinstance(row, dict) else None
            # G2 + G6 — bump last activity and enter the attention workflow.
            _patch_thread_inbound_state(
                base_url,
                headers,
                thread_id=thread_id,
                last_message_at=inbound_created_at,
                destination_routing_state=(destination_routing or {}).get(
                    "destination_routing_state"
                ),
            )
            # G1 — mark the prior outbound in this thread as replied.
            _mark_latest_outbound_replied(
                base_url,
                headers,
                org_id=org_id,
                thread_id=thread_id,
                replied_at=inbound_created_at or _utcnow_iso(),
            )
            return row if isinstance(row, dict) else None
    except Exception as e:
        logger.exception("inbound_comm persist %s", e)
    return None
