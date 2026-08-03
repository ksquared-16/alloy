"""
Canonical communication preference persistence (Python side).

Writes the current-state row AND its append-only audit event together, so
"audit always written" is a property of the only write path rather than a
convention callers must remember.

SCOPE
Preferences are PER PERSON, org-scoped — `communication_preferences` is UNIQUE
on (org_id, person_id, category). A keyword from one phone number changes that
person's preferences only. It is deliberately NOT expanded to a household:
household is a read-time projection in this platform, not a preference owner,
and silently opting out a whole family because one guardian texted STOP would
be both wrong and unrecoverable from the audit trail.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

from ..settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger("alloy-dispatcher")

PREFERENCES_TABLE = "communication_preferences"
PREFERENCE_EVENTS_TABLE = "communication_preference_events"


def _headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def _configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def load_current_states(org_id: str, person_id: str, categories: List[str]) -> Dict[str, str]:
    """Current preference state per category. Missing rows read as 'unset'."""
    if not _configured():
        return {}
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{PREFERENCES_TABLE}",
            headers=_headers(),
            params={
                "org_id": f"eq.{org_id}",
                "person_id": f"eq.{person_id}",
                "category": f"in.({','.join(categories)})",
                "select": "category,state",
            },
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json() or []
        return {r["category"]: r.get("state") or "unset" for r in rows if isinstance(r, dict)}
    except Exception as exc:  # noqa: BLE001
        logger.error("load_current_states failed: %s", exc)
        return {}


def apply_preference_changes(changes: List[Dict[str, Any]]) -> bool:
    """
    Persist changes and their audit events.

    The audit event is written FIRST. If the state upsert then fails we have an
    event with no state change — visible and reconcilable. The reverse order
    could silently suppress a person's messages with no record of why, which is
    the worse failure for a compliance control.

    Returns True when every change was applied.
    """
    if not changes:
        return True
    if not _configured():
        logger.error("apply_preference_changes: Supabase not configured; refusing to claim success")
        return False

    events = [
        {
            "org_id": c["org_id"],
            "person_id": c["person_id"],
            "category": c["category"],
            "from_state": c.get("from_state"),
            "to_state": c["to_state"],
            "source": c.get("source"),
            "method": c.get("method"),
        }
        for c in changes
    ]

    try:
        ev = requests.post(
            f"{SUPABASE_URL}/rest/v1/{PREFERENCE_EVENTS_TABLE}",
            headers=_headers({"Prefer": "return=minimal"}),
            json=events,
            timeout=10,
        )
        ev.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.error("apply_preference_changes: audit write failed: %s", exc)
        return False

    upserts = [
        {
            "org_id": c["org_id"],
            "person_id": c["person_id"],
            "category": c["category"],
            "state": c["to_state"],
            "source": c.get("source"),
            "method": c.get("method"),
        }
        for c in changes
    ]

    try:
        up = requests.post(
            f"{SUPABASE_URL}/rest/v1/{PREFERENCES_TABLE}",
            headers=_headers(
                {
                    "Prefer": "return=minimal,resolution=merge-duplicates",
                    "On-Conflict": "org_id,person_id,category",
                }
            ),
            params={"on_conflict": "org_id,person_id,category"},
            json=upserts,
            timeout=10,
        )
        up.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.error("apply_preference_changes: state upsert failed after audit write: %s", exc)
        return False

    logger.info(
        "apply_preference_changes: applied %d change(s) person=%s method=%s",
        len(changes),
        changes[0].get("person_id"),
        changes[0].get("method"),
    )
    return True
