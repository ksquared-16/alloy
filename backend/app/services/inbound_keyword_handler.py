"""
Inbound SMS compliance keyword handler.

The one production path for STOP / START / HELP. Called from
backend/app/routes/sms_inbound.py AFTER the inbound message has been persisted,
so keyword processing can never cost us the conversation record.

WHAT IT DOES
  STOP  -> opts the resolved person out of every SMS preference category
  START -> opts them back in, as a NEW event; the prior STOP is never erased
  HELP  -> returns informational text and changes nothing

WHAT IT DELIBERATELY DOES NOT DO
  * It does not expand to household scope. `communication_preferences` is UNIQUE
    on (org_id, person_id, category); household is a read-time projection here,
    not a preference owner. Opting out a whole family because one guardian
    texted STOP would be wrong and unrecoverable.
  * It does not act when the sender could not be resolved to a person. An
    unresolved inbound anchors to a synthetic `communications_unknown` entity,
    which is not a person and must not receive preference rows.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from .communication_preferences import apply_preference_changes, load_current_states
from .sms_keywords import (
    AFFECTED_CATEGORIES,
    build_preference_changes,
    keyword_response,
    parse_sms_keyword,
)

logger = logging.getLogger("alloy-dispatcher")

# The synthetic anchor used when an inbound sender cannot be resolved.
UNRESOLVED_ENTITY_TYPE = "communications_unknown"


def resolve_person_id(message_row: Dict[str, Any]) -> Optional[str]:
    """
    The person a keyword applies to, or None.

    Preference scope is per person. When inbound resolution produced the
    synthetic unknown/ambiguous anchor there is no person, so no preference may
    be written — the keyword is recorded in the message history and surfaced to
    an operator instead of being silently applied to the wrong party.
    """
    metadata = message_row.get("metadata") or {}
    if not isinstance(metadata, dict):
        return None

    entity_type = str(metadata.get("primary_entity_type") or "").strip().lower()
    if entity_type in ("person", "persons"):
        entity_id = metadata.get("primary_entity_id")
        return str(entity_id) if entity_id else None

    resolution = str(metadata.get("inbound_resolution") or "").strip()
    if resolution == "single_person_match":
        entity_id = metadata.get("primary_entity_id") or metadata.get("person_id")
        return str(entity_id) if entity_id else None

    return None


def handle_inbound_keyword(
    *,
    org_id: str,
    body: Optional[str],
    message_row: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Process a compliance keyword on a persisted inbound message.

    Returns a result dict describing what happened. Never raises for ordinary
    conditions (unknown keyword, malformed body, unresolved sender) — inbound is
    an untrusted surface and must degrade rather than fail.
    """
    keyword = parse_sms_keyword(body)
    if not keyword:
        return {"keyword": None, "applied": False, "reason": "no_keyword"}

    person_id = resolve_person_id(message_row)

    if keyword == "help":
        # HELP must never change preferences, even for a resolved person.
        logger.info("inbound_keyword: HELP org=%s person=%s", org_id, person_id or "unresolved")
        return {
            "keyword": "help",
            "applied": False,
            "reason": "informational_only",
            "response": keyword_response("help"),
            "person_id": person_id,
        }

    if not person_id:
        # Recorded, not applied. An operator resolution surface is Phase 5 work;
        # until then this is visible in the message record and the logs.
        logger.warning(
            "inbound_keyword: %s from an unresolved sender org=%s — recorded, NOT applied",
            keyword.upper(),
            org_id,
        )
        return {"keyword": keyword, "applied": False, "reason": "sender_unresolved"}

    current = load_current_states(org_id, person_id, AFFECTED_CATEGORIES)
    changes = build_preference_changes(
        org_id=org_id,
        person_id=person_id,
        keyword=keyword,
        current_states=current,
    )

    applied = apply_preference_changes(changes)
    if not applied:
        logger.error(
            "inbound_keyword: %s could NOT be applied org=%s person=%s — treat as unhonored",
            keyword.upper(),
            org_id,
            person_id,
        )
        return {"keyword": keyword, "applied": False, "reason": "persist_failed", "person_id": person_id}

    logger.info(
        "inbound_keyword: %s applied org=%s person=%s categories=%d",
        keyword.upper(),
        org_id,
        person_id,
        len(changes),
    )
    return {
        "keyword": keyword,
        "applied": True,
        "person_id": person_id,
        "changes": len(changes),
        "response": keyword_response(keyword),
    }
