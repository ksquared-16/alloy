"""
Emit workflow_events for communication_* rows (CARD 1.6 names).
Does not replace activity_workflow_events — uses same PostgREST insert pattern.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

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


UNKNOWN_ENTITY_TYPE = "communications_unknown"


def resolve_communication_event_subject(
    *,
    org_id: str,
    thread: Optional[Dict[str, Any]] = None,
    subject_entity: Optional[Tuple[str, str]] = None,
) -> Dict[str, Any]:
    """
    The RECORD a communication lifecycle event belongs to.

    Two producers, two authorities, both resolved here:

    * OUTBOUND DISPATCH passes `thread`. The thread is the authority.
    * INBOUND passes `subject_entity` — it resolves its own anchor (person-phone
      or surrogate) and may reuse a canonical SMS thread whose primary entity is
      a DIFFERENT, older business object. Deriving from that thread would refile
      inbound events onto the wrong record, so its explicit anchor wins.

    Authority is the thread: `communication_threads.primary_entity_type` and
    `primary_entity_id` are the pair the enqueue path wrote, and the unique
    constraint `communication_threads_identity_uq` is defined over them, so they
    are the thread's identity rather than a hint.

    `primary_entity_type` is echoed VERBATIM. Activity projections match
    `workflow_events.entity_type` exactly (see
    web/lib/admin/loadOpportunityRelatedActivityEvents.ts); the admin API's
    singular->plural aliasing applies to the QUERY PARAMETER only, never to
    stored rows. Translating here would split one thread's events across two
    entity_types — `message_sent` under the writer's spelling and
    `message_blocked` under ours — which is a worse failure than the one being
    fixed. Vocabulary drift belongs to the writer, in one place.

    No entity type is assumed. A thread may be an opportunity, a person, a job
    or anything else a caller made canonical.

    ORG FALLBACK. When the thread is missing, has no usable primary entity, or
    carries a primary_entity_id that is not a UUID, the event is still emitted —
    losing the record is worse than filing it imprecisely — but it is filed
    against the org and MARKED as such, so it reads as degraded rather than as a
    normal record-scoped event that simply cannot be found.
    """
    if subject_entity is not None and len(subject_entity) == 2:
        raw_type = str(subject_entity[0] or "").strip()
        raw_id = str(subject_entity[1] or "").strip()
    else:
        t = thread or {}
        raw_type = str(t.get("primary_entity_type") or "").strip()
        raw_id = str(t.get("primary_entity_id") or "").strip()

    if raw_type and _UUID_RE.match(raw_id):
        return {"entity_type": raw_type, "entity_id": raw_id, "org_scoped": False}

    return {
        "entity_type": raw_type or UNKNOWN_ENTITY_TYPE,
        "entity_id": org_id,
        "org_scoped": True,
        "declared_entity_type": raw_type or None,
        "declared_entity_id": raw_id or None,
    }


def emit_for_communication_message(
    *,
    org_id: str,
    event_type: str,
    message_id: str,
    thread_id: str,
    channel: str,
    direction: str,
    body_text: Optional[str],
    thread: Optional[Dict[str, Any]] = None,
    subject_entity: Optional[Tuple[str, str]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Emit one communication lifecycle event.

    The subject is RESOLVED here rather than handed over as a loose
    (entity_type, entity_id) pair. Call sites used to supply that pair, and two
    of them passed `org_id` as the entity id — which made every dispatch-time
    `message_blocked` / `message_deferred` durable but unreachable by any
    record's activity query. A caller now states WHAT it knows (`thread`, or an
    anchor it resolved itself) and cannot state a subject that contradicts it.
    """
    subject = resolve_communication_event_subject(
        org_id=org_id, thread=thread, subject_entity=subject_entity
    )

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
    if subject["org_scoped"]:
        # Marked, not silent: an event filed against the org is not on the
        # record it concerns, and an operator surface should be able to say so.
        pl["subject_scope"] = "org_fallback"
        pl["thread_primary_entity_type"] = subject.get("declared_entity_type")
        pl["thread_primary_entity_id"] = subject.get("declared_entity_id")

    emit_communication_workflow_event(
        org_id=org_id,
        event_type=event_type,
        entity_type=str(subject["entity_type"]),
        entity_id=str(subject["entity_id"]),
        payload=pl,
    )
