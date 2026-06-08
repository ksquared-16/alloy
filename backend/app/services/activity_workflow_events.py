"""
Insert workflow_events for Activity Log V1 via PostgREST (service role).
Does not touch public.messages schema.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..supabase_client import _get_base_url, _get_headers, normalize_phone

logger = logging.getLogger("alloy-dispatcher")

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


def body_preview(text: Optional[str], max_len: int = 120) -> Optional[str]:
    if text is None:
        return None
    s = str(text).strip()
    if not s:
        return None
    return s[:max_len] if len(s) <= max_len else s[: max_len - 1] + "…"


def _headers_write_minimal() -> Dict[str, str]:
    """POST/PATCH headers without forced return=representation (see _get_headers)."""
    h = dict(_get_headers())
    h.pop("Prefer", None)
    return h


def _get_json(url: str, headers: Dict[str, str], params: Dict[str, str]) -> List[Dict[str, Any]]:
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            logger.debug("activity_workflow_events GET fail %s %s", resp.status_code, resp.text[:200])
            return []
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.debug("activity_workflow_events GET exception %s", e)
        return []


def resolve_opportunity_activity_target(
    base_url: str,
    headers: Dict[str, str],
    message_row: Dict[str, Any],
) -> Optional[Tuple[str, str]]:
    """
    Resolve (org_id, opportunity_id) for an activity event scoped to an opportunity.
    Returns None if no opportunity context can be found.
    """
    url_opp = f"{base_url}/opportunities"
    url_job = f"{base_url}/jobs"
    url_contacts = f"{base_url}/contacts"

    opp_raw = message_row.get("opportunity_id")
    if opp_raw and _UUID_RE.match(str(opp_raw)):
        rows = _get_json(
            url_opp,
            headers,
            {"id": f"eq.{opp_raw}", "select": "id,org_id", "limit": "1"},
        )
        if rows and rows[0].get("org_id") and rows[0].get("id"):
            return str(rows[0]["org_id"]), str(rows[0]["id"])

    job_raw = message_row.get("job_id")
    if job_raw and _UUID_RE.match(str(job_raw)):
        rows = _get_json(
            url_job,
            headers,
            {"id": f"eq.{job_raw}", "select": "org_id,opportunity_id", "limit": "1"},
        )
        if rows:
            org = rows[0].get("org_id")
            oid = rows[0].get("opportunity_id")
            if org and oid and _UUID_RE.match(str(oid)):
                return str(org), str(oid)

    contact_raw = message_row.get("contact_id")
    if contact_raw and _UUID_RE.match(str(contact_raw)):
        rows = _get_json(
            url_opp,
            headers,
            {
                "primary_contact_id": f"eq.{contact_raw}",
                "select": "id,org_id,updated_at",
                "order": "updated_at.desc",
                "limit": "1",
            },
        )
        if rows and rows[0].get("org_id") and rows[0].get("id"):
            return str(rows[0]["org_id"]), str(rows[0]["id"])

    direction = (message_row.get("direction") or "").strip().lower()
    phone_raw = (message_row.get("from_value") or "").strip() if direction == "inbound" else (message_row.get("to_value") or "").strip()
    norm = normalize_phone(phone_raw) if phone_raw else None
    if not norm:
        return None
    contacts = _get_json(
        url_contacts,
        headers,
        {"phone": f"eq.{norm}", "select": "id,org_id", "limit": "25"},
    )
    best: Optional[Tuple[str, str, str]] = None  # org_id, opp_id, updated_at
    for c in contacts:
        cid = c.get("id")
        if not cid:
            continue
        opps = _get_json(
            url_opp,
            headers,
            {
                "primary_contact_id": f"eq.{cid}",
                "select": "id,org_id,updated_at",
                "order": "updated_at.desc",
                "limit": "1",
            },
        )
        if not opps:
            continue
        o = opps[0]
        oid = o.get("id")
        org = o.get("org_id")
        u = o.get("updated_at") or ""
        if org and oid:
            if best is None or str(u) > best[2]:
                best = (str(org), str(oid), str(u))
    if best:
        return best[0], best[1]
    return None


def emit_workflow_event(
    *,
    org_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: Dict[str, Any],
    occurred_at: Optional[str] = None,
) -> None:
    if not _UUID_RE.match(org_id) or not _UUID_RE.match(entity_id):
        logger.warning("activity_workflow_events skip emit: invalid org_id or entity_id")
        return
    base_url = _get_base_url()
    url = f"{base_url}/workflow_events"
    body = {
        "org_id": org_id,
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action_type": None,
        "payload": payload,
        "occurred_at": occurred_at or datetime.now(timezone.utc).isoformat(),
    }
    try:
        resp = requests.post(url, headers=_headers_write_minimal(), json=body, timeout=10)
        if not resp.ok:
            logger.error(
                "activity_workflow_events insert failed status=%s body=%s",
                resp.status_code,
                resp.text[:500],
            )
    except Exception as e:
        logger.exception("activity_workflow_events insert exception %s", e)


def emit_message_lifecycle_event(
    *,
    event_purpose: str,
    message_row: Dict[str, Any],
    message_id: str,
    body_text: Optional[str],
) -> None:
    """
    event_purpose: 'message_received' | 'message_sent'
    """
    base_url = _get_base_url()
    headers = _get_headers()
    resolved = resolve_opportunity_activity_target(base_url, headers, {**message_row, "id": message_id})
    if not resolved:
        logger.info(
            "activity_workflow_events skip %s message_id=%s (no opportunity context)",
            event_purpose,
            message_id,
        )
        return
    org_id, opportunity_id = resolved
    preview = body_preview(body_text, 120)
    payload: Dict[str, Any] = {
        "message_id": str(message_id),
        "channel": "sms",
        "actor": "contact" if event_purpose == "message_received" else "system",
    }
    if preview:
        payload["body_preview"] = preview
    emit_workflow_event(
        org_id=org_id,
        event_type=event_purpose,
        entity_type="opportunities",
        entity_id=opportunity_id,
        payload=payload,
    )
