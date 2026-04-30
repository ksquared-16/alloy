"""Inbound persistence into communication_* (dual-write preserves legacy sms_inbound → public.messages)."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..supabase_client import _get_base_url, _get_headers, normalize_phone
from .communication_workflow_events import emit_for_communication_message

logger = logging.getLogger("alloy-dispatcher")

INBOUND_SURROGATE_NS = uuid.UUID("a3f7c89e-b1aa-52d0-9e61-000000010001")


def surrogate_inbound_entity_id(org_id: str, phone_norm: str) -> str:
    return str(uuid.uuid5(INBOUND_SURROGATE_NS, f"{org_id}|{phone_norm}"))


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)

_JSON_HEADERS = {"Content-Type": "application/json", "Prefer": "return=representation"}


def recipient_key_normalize_sms(raw: str) -> str:
    n = normalize_phone((raw or "").strip())
    return n or ""


def _persons_by_phone_org(
    base_url: str, headers: Dict[str, str], org_id: str, phone_normalized: str
) -> List[Dict[str, Any]]:
    if not phone_normalized:
        return []
    url = f"{base_url}/persons"
    params = {"org_id": f"eq.{org_id}", "phone": f"eq.{phone_normalized}", "select": "id", "limit": "5"}
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
    """
    CARD 15 — threading anchor: persons.id when phone matches in org (no contacts table).
    Otherwise deterministic surrogate UUID (external SMS identity → communications_unknown).
    """
    norm = recipient_key_normalize_sms(from_phone)
    persons = _persons_by_phone_org(base_url, headers, org_id, norm)
    if persons:
        pid = str(persons[0].get("id"))
        return "persons", pid
    if not norm:
        return "communications_unknown", surrogate_inbound_entity_id(org_id, "__missing_phone__")
    return "communications_unknown", surrogate_inbound_entity_id(org_id, norm)


def _row_exists_or_create_thread(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    entity_type: str,
    entity_id: str,
    channel: str,
    recipient_key: str,
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
        "metadata": {},
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


def persist_inbound_communication_sms(
    *,
    org_id: str,
    binding_id: Optional[str],
    from_num: str,
    to_num: str,
    body: str,
    external_sid: str,
    primary_entity_hint: Optional[Tuple[str, str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Insert inbound communication_messages + workflow event message_received.
    primary_entity_hint optional (entity_type, entity_id); else derived via CARD 15 person-phone or surrogate anchor.
    """
    if not _UUID_RE.match(org_id):
        return None
    base_url = _get_base_url()
    headers = _get_headers()

    if primary_entity_hint and len(primary_entity_hint) == 2:
        et_raw, eid_raw = primary_entity_hint
        entity_type = str(et_raw).strip()
        entity_id = str(eid_raw).strip()
        if not entity_type or not _UUID_RE.match(entity_id):
            entity_type, entity_id = resolve_primary_entity_for_inbound_sms(base_url, headers, org_id, from_num)
    else:
        entity_type, entity_id = resolve_primary_entity_for_inbound_sms(base_url, headers, org_id, from_num)

    rkey = recipient_key_normalize_sms(from_num)
    thread_id = _row_exists_or_create_thread(
        base_url,
        headers,
        org_id=org_id,
        entity_type=entity_type,
        entity_id=entity_id,
        channel="sms",
        recipient_key=rkey,
    )
    if not thread_id:
        return None

    bid = binding_id if binding_id and _UUID_RE.match(binding_id) else None
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
        "metadata": {},
    }
    if bid:
        payload_msg["communication_provider_binding_id"] = bid

    h = dict(headers)
    h.update(_JSON_HEADERS)
    url_msgs = f"{base_url}/communication_messages"
    try:
        rm = requests.post(url_msgs, headers=h, json=payload_msg, timeout=15)
        if not rm.ok:
            logger.error("inbound_comm msg insert fail %s %s", rm.status_code, rm.text[:400])
            return None
        jd = rm.json()
        row = jd[0] if isinstance(jd, list) and jd else jd
        mid = row.get("id") if isinstance(row, dict) else None
        if mid:
            emit_for_communication_message(
                org_id=org_id,
                entity_type=entity_type,
                entity_id=entity_id,
                event_type="message_received",
                message_id=str(mid),
                thread_id=thread_id,
                channel="sms",
                direction="inbound",
                body_text=body,
                extra={
                    "external_id": external_sid or None,
                    "communication_provider_binding_id": bid,
                },
            )
            return row if isinstance(row, dict) else None
    except Exception as e:
        logger.exception("inbound_comm persist %s", e)
    return None
