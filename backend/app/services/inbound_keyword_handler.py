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

import requests

from ..supabase_client import _get_base_url, _get_headers
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


#: Metadata key carrying the compliance keyword on an inbound message whose
#: sender could not be attributed. Read by the outbound eligibility gate.
COMPLIANCE_KEYWORD_METADATA_KEY = "compliance_keyword"


def stamp_compliance_keyword_on_message(message_row: Dict[str, Any], keyword: str) -> bool:
    """
    Record the keyword on the inbound message, preserving existing metadata.

    Best-effort by design. The message itself is already durable, and this runs
    after persistence for the same reason the whole keyword step does: a failure
    here must never cost us the conversation record. It returns whether the stamp
    landed so the caller can say so plainly rather than imply a hold exists.
    """
    message_id = message_row.get("id")
    if not message_id:
        return False

    existing = message_row.get("metadata")
    metadata: Dict[str, Any] = dict(existing) if isinstance(existing, dict) else {}
    metadata[COMPLIANCE_KEYWORD_METADATA_KEY] = keyword

    try:
        base_url = _get_base_url()
        headers = dict(_get_headers())
        headers.update({"Content-Type": "application/json", "Prefer": "return=minimal"})
        resp = requests.patch(
            f"{base_url}/communication_messages?id=eq.{message_id}",
            headers=headers,
            json={"metadata": metadata},
            timeout=15,
        )
        return bool(resp.ok)
    except Exception as e:  # noqa: BLE001
        logger.error("inbound_keyword: could not stamp compliance keyword %s", e)
        return False


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
        # No preference row may be written — there is no person to own it, and
        # guessing one is how an entire family gets opted out because two people
        # share a number. That reasoning is unchanged.
        #
        # What changed is the consequence. An unidentified but tenant-owned
        # conversation is now replyable, so "recorded but unenforced" stopped being
        # harmless: a parent could text STOP and be answered anyway. The keyword is
        # therefore stamped onto the message it arrived on, giving the outbound
        # eligibility gate a durable signal keyed on the ENDPOINT rather than on a
        # person — the same shape as the ingress hold, and narrow in the same way:
        # this endpoint pair only, never an org-wide suppression, and superseded by
        # a later START on the same pair.
        #
        # Stamped here rather than parsed downstream so the keyword vocabulary
        # keeps exactly one owner (`sms_keywords.py`).
        stamped = stamp_compliance_keyword_on_message(message_row, keyword)
        logger.warning(
            "inbound_keyword: %s from an unresolved sender org=%s — endpoint hold %s, preference NOT applied",
            keyword.upper(),
            org_id,
            "recorded" if stamped else "NOT recorded",
        )
        return {
            "keyword": keyword,
            "applied": False,
            "reason": "sender_unresolved",
            "endpoint_hold_recorded": stamped,
        }

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
