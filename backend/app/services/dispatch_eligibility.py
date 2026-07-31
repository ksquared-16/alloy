"""
Dispatch-time policy revalidation — the final boundary before a provider call.

WHY IT EXISTS
The TypeScript enqueue gate owns the AUTHORING decision, but the queue->send gap
is unbounded: a STOP can arrive, an address can hard-bounce, a sender identity
can be disabled, and the clock can move into quiet hours, all after enqueue.
Rows can also enter the table by paths TypeScript never sees (raw SQL, seed
scripts), and those carry no authoring decision at all.

WHAT IT IS NOT
It does not reimplement the policy engine. It reads the immutable snapshot for
the authoring facts and re-runs ONLY the six checks whose inputs can change:

  1. current preference / consent state
  2. current suppression state
  3. current communication identity validity
  4. current quiet-hours applicability
  5. structural integrity of the snapshot
  6. required category / classification presence

The principle: classification and authorization are authoring facts;
recipient state and time-dependent constraints are live facts.

FAILS CLOSED
A missing, malformed, or unknown-version snapshot blocks. That is precisely the
raw-SQL vector this layer exists to catch, so it must never be inferred around.
Category is never silently defaulted to transactional.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger("alloy-dispatcher")

_CONTRACT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "contracts",
    "communications",
    "dispatch-decisions.json",
)

with open(_CONTRACT_PATH, "r", encoding="utf-8") as _fh:
    CONTRACT: Dict[str, Any] = json.load(_fh)

SUPPORTED_SNAPSHOT_VERSIONS: List[int] = CONTRACT["snapshot_schema_versions_supported"]
REQUIRED_FIELDS: List[str] = CONTRACT["snapshot_required_fields"]
OPT_OUT_EXEMPT: List[str] = CONTRACT["opt_out_exempt_categories"]
QUIET_HOURS_EXEMPT: List[str] = CONTRACT["quiet_hours_exempt_categories"]
SUPPRESSION_EXEMPT: List[str] = CONTRACT["suppression_exempt_categories"]
SUPPRESSING_EVENTS: List[str] = CONTRACT["suppressing_delivery_events"]
VALID_CATEGORIES = ["transactional", "operational", "marketing", "emergency"]


class DispatchDecision:
    """send_now | defer_until | blocked, with a deterministic machine reason."""

    def __init__(
        self,
        outcome: str,
        *,
        reason: Optional[str] = None,
        operator_message: Optional[str] = None,
        defer_until: Optional[datetime] = None,
    ) -> None:
        self.outcome = outcome
        self.reason = reason
        self.operator_message = operator_message
        self.defer_until = defer_until

    @property
    def allowed(self) -> bool:
        return self.outcome == "send_now"

    def to_audit(self) -> Dict[str, Any]:
        return {
            "outcome": self.outcome,
            "reason": self.reason,
            "operator_message": self.operator_message,
            "defer_until": self.defer_until.isoformat() if self.defer_until else None,
            "contract_version": CONTRACT["version"],
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
        }


def _send_now() -> DispatchDecision:
    return DispatchDecision("send_now")


def _blocked(reason: str, operator_message: str) -> DispatchDecision:
    return DispatchDecision("blocked", reason=reason, operator_message=operator_message)


def _deferred(until: datetime, operator_message: str) -> DispatchDecision:
    return DispatchDecision("defer_until", reason="QUIET_HOURS", operator_message=operator_message, defer_until=until)


# --------------------------------------------------------------------------
# 5 + 6. Snapshot structural integrity, version, and category presence
# --------------------------------------------------------------------------

def validate_snapshot(raw: Any) -> Tuple[Optional[Dict[str, Any]], Optional[DispatchDecision]]:
    """Parse and validate the authoring snapshot. Returns (snapshot, block-or-None)."""
    if raw is None or raw == "":
        return None, _blocked(
            "SNAPSHOT_MISSING",
            "This message has no eligibility record and cannot be sent. It was not created by the composer.",
        )

    snapshot = raw
    if isinstance(raw, str):
        try:
            snapshot = json.loads(raw)
        except Exception:  # noqa: BLE001
            return None, _blocked("SNAPSHOT_MALFORMED", "This message's eligibility record could not be read.")

    if not isinstance(snapshot, dict):
        return None, _blocked("SNAPSHOT_MALFORMED", "This message's eligibility record is not valid.")

    version = snapshot.get("snapshotVersion")
    if version not in SUPPORTED_SNAPSHOT_VERSIONS:
        # Never guess at the shape of an unknown version.
        return None, _blocked(
            "SNAPSHOT_VERSION_UNSUPPORTED",
            "This message was created by an incompatible version and cannot be sent.",
        )

    missing = [f for f in REQUIRED_FIELDS if f not in snapshot]
    if missing:
        return None, _blocked(
            "STRUCTURAL_INVALID",
            f"This message's eligibility record is incomplete ({', '.join(missing[:3])}).",
        )

    category = snapshot.get("category")
    if not category:
        return None, _blocked("CATEGORY_MISSING", "This message has no classification and cannot be sent.")
    if category not in VALID_CATEGORIES:
        return None, _blocked("CATEGORY_INVALID", f"Unknown message classification '{category}'.")

    audience = snapshot.get("audience")
    if audience not in ("external", "internal"):
        return None, _blocked("AUDIENCE_INVALID", f"Unknown audience '{audience}'.")

    return snapshot, None


# --------------------------------------------------------------------------
# Supabase reads
# --------------------------------------------------------------------------

def _headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def _configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def preference_category_for(category: str, channel: str) -> Optional[str]:
    """Mirror of the TypeScript mapping; parity-tested against the contract."""
    if category == "emergency":
        return "emergency"
    if channel == "in_app":
        return None
    suffix = "transactional" if category == "transactional" else "operational" if category == "operational" else "marketing"
    return f"email_{suffix}" if channel == "email" else f"sms_{suffix}"


def load_preference_state(org_id: str, person_id: str, pref_category: str) -> Tuple[str, bool]:
    """(state, lookup_failed). A failed lookup must fail closed upstream."""
    if not _configured():
        return "unset", True
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/communication_preferences",
            headers=_headers(),
            params={
                "org_id": f"eq.{org_id}",
                "person_id": f"eq.{person_id}",
                "category": f"eq.{pref_category}",
                "select": "state",
                "limit": "1",
            },
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json() or []
        if not rows:
            return "unset", False
        state = (rows[0] or {}).get("state") or "unset"
        return (state if state in ("opted_in", "opted_out") else "unset"), False
    except Exception as exc:  # noqa: BLE001
        logger.error("dispatch_eligibility: preference lookup failed: %s", exc)
        return "unset", True


def is_suppressed(org_id: str, to_address: str) -> Tuple[bool, bool]:
    """(suppressed, lookup_failed). Only hard bounce and complaint suppress."""
    if not _configured() or not to_address:
        return False, not _configured()
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/communication_delivery_events",
            headers=_headers(),
            params={
                "org_id": f"eq.{org_id}",
                "event_type": f"in.({','.join(SUPPRESSING_EVENTS)})",
                "select": "id,communication_messages!inner(to_address)",
                "communication_messages.to_address": f"eq.{to_address}",
                "limit": "1",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return bool(resp.json()), False
    except Exception as exc:  # noqa: BLE001
        logger.error("dispatch_eligibility: suppression lookup failed: %s", exc)
        return False, True


def load_identity(org_id: str, identity_id: str) -> Tuple[Optional[Dict[str, Any]], bool]:
    if not _configured():
        return None, True
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/communication_identities",
            headers=_headers(),
            params={"id": f"eq.{identity_id}", "select": "*", "limit": "1"},
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json() or []
        return (rows[0] if rows else None), False
    except Exception as exc:  # noqa: BLE001
        logger.error("dispatch_eligibility: identity lookup failed: %s", exc)
        return None, True


# --------------------------------------------------------------------------
# 4. Quiet hours — re-evaluated against the CURRENT clock
# --------------------------------------------------------------------------

def _parse_hhmm(value: str) -> Optional[int]:
    try:
        hour, minute = value.strip().split(":")
        h, m = int(hour), int(minute)
        if 0 <= h <= 23 and 0 <= m <= 59:
            return h * 60 + m
    except Exception:  # noqa: BLE001
        pass
    return None


def evaluate_quiet_hours(window: Dict[str, Any], now: datetime) -> Tuple[bool, Optional[datetime]]:
    """
    (within_window, next_attempt).

    Returns a DETERMINISTIC next attempt so a deferred message has a concrete
    time rather than being re-polled and re-blocked indefinitely.
    """
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(str(window.get("timezone") or "UTC"))
    except Exception:  # noqa: BLE001
        # Unknown timezone: cannot evaluate, so the caller fails closed.
        return True, None

    start = _parse_hhmm(str(window.get("start") or ""))
    end = _parse_hhmm(str(window.get("end") or ""))
    if start is None or end is None or start == end:
        return False, None

    local = now.astimezone(tz)
    minutes = local.hour * 60 + local.minute
    within = (start <= minutes < end) if start < end else (minutes >= start or minutes < end)
    if not within:
        return False, None

    end_h, end_m = divmod(end, 60)
    next_local = local.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
    if next_local <= local:
        next_local = next_local + timedelta(days=1)
    return True, next_local.astimezone(timezone.utc)


# --------------------------------------------------------------------------
# The revalidation
# --------------------------------------------------------------------------

def revalidate_for_dispatch(
    message: Dict[str, Any],
    *,
    now: Optional[datetime] = None,
) -> DispatchDecision:
    """
    Final policy check before a provider call.

    Every external message dispatched by Python must pass this. Internal
    (audience='internal') messages never reach a provider and are not subject to
    external consent rules.
    """
    now = now or datetime.now(timezone.utc)

    snapshot, block = validate_snapshot(message.get("eligibility_snapshot"))
    if block:
        return block
    assert snapshot is not None

    audience = snapshot["audience"]
    category = snapshot["category"]
    channel = (message.get("channel") or snapshot.get("recipient", {}).get("channel") or "").lower()
    org_id = str(message.get("org_id") or "")

    # Internal audience: not a communication to a data subject. It must not
    # reach a provider at all, and external consent rules do not apply.
    if audience == "internal":
        if channel != "in_app":
            return _blocked(
                "INTERNAL_TO_PROVIDER",
                "Internal messages may only use the in-app channel.",
            )
        return _send_now()

    # 3. Communication identity validity.
    identity_ref = snapshot.get("identity") or {}
    identity_id = identity_ref.get("identityId")
    if identity_id:
        identity, failed = load_identity(org_id, str(identity_id))
        if failed:
            return _blocked("IDENTITY_MISSING", "Sender identity could not be verified.")
        if not identity:
            return _blocked("IDENTITY_MISSING", "The sender identity no longer exists.")
        if str(identity.get("org_id")) != org_id:
            return _blocked("IDENTITY_WRONG_ORG", "The sender identity belongs to another organization.")
        if identity.get("status") != "active" or identity.get("outbound_enabled") is False:
            return _blocked("IDENTITY_DISABLED", "The sender identity is disabled.")
        if str(identity.get("channel")) != channel:
            return _blocked(
                "IDENTITY_CHANNEL_UNSUPPORTED",
                f"The sender identity does not support the {channel} channel.",
            )

    person_id = (snapshot.get("recipient") or {}).get("personId")

    # 1. Preference / consent — the check most likely to have changed.
    pref_category = preference_category_for(category, channel)
    if pref_category and category not in OPT_OUT_EXEMPT:
        if not person_id:
            return _blocked(
                "RECIPIENT_UNRESOLVED",
                "This message has no resolved recipient, so consent cannot be verified.",
            )
        state, failed = load_preference_state(org_id, str(person_id), pref_category)
        if failed:
            return _blocked("OPTED_OUT", "Consent could not be verified; the message was not sent.")
        if state == "opted_out":
            return _blocked("OPTED_OUT", f"The recipient opted out of {category} messages.")
        if category == "marketing" and state != "opted_in":
            return _blocked("MARKETING_REQUIRES_OPT_IN", "Marketing messages require explicit opt-in.")

    # 2. Suppression — hard bounce / complaint only.
    if category not in SUPPRESSION_EXEMPT:
        suppressed, failed = is_suppressed(org_id, str(message.get("to_address") or ""))
        if failed:
            return _blocked("SUPPRESSED", "Delivery suppression could not be verified.")
        if suppressed:
            return _blocked("SUPPRESSED", "This address is suppressed after a bounce or complaint.")

    # 4. Quiet hours — current clock, snapshot's window.
    window = snapshot.get("quietHours")
    if window and category not in QUIET_HOURS_EXEMPT:
        within, next_attempt = evaluate_quiet_hours(window, now)
        if within and next_attempt is None:
            return _blocked("STRUCTURAL_INVALID", "Quiet hours could not be evaluated; the message was not sent.")
        if within:
            return _deferred(next_attempt, "Held until the recipient's quiet hours end.")

    return _send_now()
