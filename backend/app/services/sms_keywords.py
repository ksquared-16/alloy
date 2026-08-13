"""
SMS compliance keyword handling (STOP / START / HELP).

Inbound SMS is handled in Python, so keyword processing lives here — but the
vocabulary is NOT duplicated. Both runtimes load contracts/communications/
sms-keywords.json, and a parity test on each side fails if either drifts.

CARRIER SEMANTICS
STOP suppresses ALL SMS to that number: transactional, operational and
marketing. It is not a marketing-only opt-out. The app already promises this in
web/app/terms/page.tsx:51 and in outbound copy; until now nothing honored it.

HISTORY IS IMMUTABLE
A preference change writes BOTH the current-state row and an append-only event.
START never erases a prior STOP: it appends a new event whose from_state is the
prior state. The inbound message itself is persisted regardless, so the
conversation record stays complete.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("alloy-dispatcher")

_CONTRACT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "contracts",
    "communications",
    "sms-keywords.json",
)


def _load_contract() -> Dict[str, Any]:
    with open(_CONTRACT_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


_CONTRACT = _load_contract()

KEYWORDS: Dict[str, List[str]] = _CONTRACT["keywords"]
AFFECTED_CATEGORIES: List[str] = _CONTRACT["affected_preference_categories"]
TARGET_STATE: Dict[str, Optional[str]] = _CONTRACT["target_state"]
HELP_RESPONSE: str = _CONTRACT["help_response"]
STOP_RESPONSE: str = _CONTRACT["stop_response"]
START_RESPONSE: str = _CONTRACT["start_response"]
CONTRACT_VERSION: str = _CONTRACT["version"]

_LOOKUP = {token: keyword for keyword, tokens in KEYWORDS.items() for token in tokens}


def parse_sms_keyword(body: Optional[str]) -> Optional[str]:
    """
    Classify the FIRST token of an inbound body.

    Deliberately first-token-only and exact: "stop by tomorrow at 3" must not be
    read as an opt-out, and a message merely containing the word must not either.
    Malformed input (None, empty, whitespace) returns None rather than raising —
    inbound is an untrusted, unauthenticated surface.
    """
    if not body or not isinstance(body, str):
        return None
    token = body.strip().lower().split()
    if not token:
        return None
    return _LOOKUP.get(token[0])


def keyword_target_state(keyword: str) -> Optional[str]:
    """Preference state a keyword implies. HELP changes nothing."""
    return TARGET_STATE.get(keyword)


def keyword_response(keyword: str) -> Optional[str]:
    """
    The acknowledgement copy for a keyword — for RECORD and OPERATOR DISPLAY only.

    ALLOY MUST NOT SEND THIS. Read that before wiring anything to it.

    Outbound SMS goes through a Twilio **Messaging Service**
    (`communication_message_sender.py` reads `messaging_service_sid`). Twilio
    answers STOP / START / HELP itself at the provider layer — for US A2P traffic
    that behaviour is carrier-mandated and cannot be declined, and Advanced
    Opt-Out is where the copy is configured if it needs changing.

    So the acknowledgement has exactly one owner: **the provider**. If Alloy also
    sent one, a parent who just texted STOP would receive TWO messages — one of
    them from a system they just told to stop. That is a poor experience and a
    compliance risk, and it is the single most likely way this loose end gets
    "finished" incorrectly.

    This function therefore exists so that:
      - the operator surface can show what the family was told, and
      - the copy lives in the shared contract next to the keyword vocabulary
        rather than being duplicated in a provider console note.

    `backend/tests/test_keyword_response_not_sent.py` fails the build if any send
    path starts consuming it. See
    `docs/platform/planning/conversation-platform-v1/KEYWORD-ACKNOWLEDGEMENT-OWNERSHIP.md`.
    """
    if keyword == "help":
        return HELP_RESPONSE
    if keyword == "stop":
        return STOP_RESPONSE
    if keyword == "start":
        return START_RESPONSE
    return None


def build_preference_changes(
    *,
    org_id: str,
    person_id: str,
    keyword: str,
    current_states: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Expand a keyword into one change per affected category.

    Each change carries `from_state` so the audit event records the transition
    truthfully — including the no-op case (STOP when already opted out), which is
    still recorded rather than silently dropped.

    Returns [] for HELP.
    """
    to_state = keyword_target_state(keyword)
    if not to_state:
        return []

    states = current_states or {}
    changes: List[Dict[str, Any]] = []
    for category in AFFECTED_CATEGORIES:
        changes.append(
            {
                "org_id": org_id,
                "person_id": person_id,
                "category": category,
                "from_state": states.get(category, "unset"),
                "to_state": to_state,
                "source": "sms_keyword",
                "method": keyword,
            }
        )
    return changes
