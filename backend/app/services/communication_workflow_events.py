"""
Emit workflow_events for communication_* rows (CARD 1.6 names).
Does not replace activity_workflow_events — uses same PostgREST insert pattern.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

from ..supabase_client import _get_base_url, _get_headers

logger = logging.getLogger("alloy-dispatcher")

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


def _body_preview(text: Optional[str], max_len: int = 160) -> Optional[str]:
    if text is None:
        return None
    s = str(text).strip()
    if not s:
        return None
    return s[:max_len] if len(s) <= max_len else s[: max_len - 1] + "…"


def emit_communication_workflow_event(
    *,
    org_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: Dict[str, Any],
) -> None:
    if not _UUID_RE.match(org_id) or not _UUID_RE.match(entity_id):
        logger.warning("communication_event skip: invalid org_id or entity_id event_type=%s", event_type)
        return
    url = f"{_get_base_url()}/workflow_events"
    body = {
        "org_id": org_id,
        "event_type": event_type,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action_type": None,
        "payload": payload,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    h = dict(_get_headers())
    h.pop("Prefer", None)
    try:
        resp = requests.post(url, headers=h, json=body, timeout=10)
        if not resp.ok:
            logger.error(
                "communication_event insert fail type=%s status=%s body=%s",
                event_type,
                resp.status_code,
                resp.text[:400],
            )
    except Exception as e:
        logger.exception("communication_event exception %s", e)


def emit_for_communication_message(
    *,
    org_id: str,
    entity_type: str,
    entity_id: str,
    event_type: str,
    message_id: str,
    thread_id: str,
    channel: str,
    direction: str,
    body_text: Optional[str],
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    pl: Dict[str, Any] = {
        "communication_message_id": message_id,
        "thread_id": thread_id,
        "channel": channel,
        "direction": direction,
    }
    prev = _body_preview(body_text)
    if prev:
        pl["body_preview"] = prev
    if extra:
        pl.update(extra)
    emit_communication_workflow_event(
        org_id=org_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=pl,
    )
