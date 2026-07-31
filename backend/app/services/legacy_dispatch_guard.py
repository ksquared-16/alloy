"""
Containment for the legacy GHL/cleaning dispatch endpoints (S-1).

SCOPE: contain, do not rebuild. The cleaning workflow's state machine lives in
GoHighLevel and is NOT migrated into the Conversation Runtime. This module makes
the two retained routes authenticated, rate-limited, idempotent, audited, and
incapable of arbitrary SMS sending — nothing more.

CREDENTIAL CHOICE
These routes are invoked BY GoHighLevel webhooks, so GHL_WORKFLOW_SECRET is
precisely the credential the caller legitimately holds, and its scope is
appropriate. That is different from the payment executor, which is called by our
own Next.js proxy and therefore got a DEDICATED secret — a card-charging
endpoint must not be reachable with a credential that lives in an external
automation platform.

WHAT WAS WRONG
  * both routes were completely unauthenticated
  * six of nine send sites fired on REJECTION branches, before any validation
    succeeded — so an attacker supplying only a contact_id triggered an SMS
  * the acceptance SMS disclosed customer address, entry method and access
    notes, gated only by a 5-digit code with no attempt limit
"""

from __future__ import annotations

import hmac
import logging
import time
from typing import Any, Dict, Optional, Tuple

from .. import settings

logger = logging.getLogger("alloy-dispatcher")

WORKFLOW_SECRET_HEADER = "X-ALLOY-WORKFLOW-SECRET"

# Guessing protection. The offer code is 5 digits (~90k keyspace), which is not
# sufficient authorization on its own for any disclosure.
MAX_CODE_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 20

# Process-local state. Adequate for containment of a dormant integration; a
# durable store would be required if this vertical were revived, and that is
# recorded in the decommissioning packet rather than built speculatively.
_attempts: Dict[str, list] = {}
_lockouts: Dict[str, float] = {}
_rate: Dict[str, list] = {}
_processed: Dict[str, float] = {}


class DispatchGuardError(Exception):
    """Raised when a request must be refused. Carries a generic client detail."""

    def __init__(self, status_code: int, detail: str = "Unauthorized", *, audit_reason: str = "") -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.audit_reason = audit_reason or detail


def _now() -> float:
    return time.time()


def require_workflow_secret(candidate: Optional[str]) -> None:
    """
    Service authentication. Runs BEFORE any lookup or side effect.

    Fails closed when the secret is absent from server configuration: an
    unconfigured deployment must refuse, never fall through to "no secret
    required".
    """
    expected = settings.GHL_WORKFLOW_SECRET
    if not expected:
        logger.error("legacy_dispatch: GHL_WORKFLOW_SECRET is not configured; refusing")
        raise DispatchGuardError(503, "Service unavailable", audit_reason="secret_unconfigured")

    if not candidate or not hmac.compare_digest(candidate, expected):
        # Deliberately generic; never echoes the candidate.
        logger.warning("legacy_dispatch: invalid or missing workflow secret")
        raise DispatchGuardError(401, "Unauthorized", audit_reason="bad_credential")


def enforce_rate_limit(key: str) -> None:
    """Rate-limit by source/integration and by contact/offer."""
    window_start = _now() - RATE_LIMIT_WINDOW_SECONDS
    hits = [t for t in _rate.get(key, []) if t > window_start]
    if len(hits) >= RATE_LIMIT_MAX_REQUESTS:
        _rate[key] = hits
        raise DispatchGuardError(429, "Too many requests", audit_reason="rate_limited")
    hits.append(_now())
    _rate[key] = hits


def check_lockout(key: str) -> None:
    until = _lockouts.get(key)
    if until and until > _now():
        raise DispatchGuardError(429, "Too many attempts", audit_reason="locked_out")
    if until:
        _lockouts.pop(key, None)
        _attempts.pop(key, None)


def record_failed_attempt(key: str) -> None:
    """Count a failed code attempt and lock out after the threshold."""
    window_start = _now() - LOCKOUT_SECONDS
    tries = [t for t in _attempts.get(key, []) if t > window_start]
    tries.append(_now())
    _attempts[key] = tries
    if len(tries) >= MAX_CODE_ATTEMPTS:
        _lockouts[key] = _now() + LOCKOUT_SECONDS
        logger.warning("legacy_dispatch: lockout engaged key=%s attempts=%d", _mask(key), len(tries))


def clear_attempts(key: str) -> None:
    _attempts.pop(key, None)
    _lockouts.pop(key, None)


def claim_idempotency(key: str, ttl_seconds: int = 3600) -> bool:
    """
    True when this is the first time we've seen `key`.

    A replayed acceptance must not duplicate state or produce a second SMS.
    """
    cutoff = _now() - ttl_seconds
    for k, seen in list(_processed.items()):
        if seen < cutoff:
            _processed.pop(k, None)
    if key in _processed:
        return False
    _processed[key] = _now()
    return True


def _mask(value: str) -> str:
    if not value:
        return "-"
    return f"…{value[-4:]}" if len(value) > 4 else "****"


def audit(event: str, **fields: Any) -> None:
    """
    Structured audit.

    Never records the secret, the raw offer code, access instructions, or full
    message bodies. Identifiers are masked.
    """
    safe = {
        k: (_mask(str(v)) if k in ("contact_id", "offer_code", "code", "customer_contact_id") else v)
        for k, v in fields.items()
        if k not in ("secret", "access_notes", "access_method", "address", "message", "body")
    }
    logger.info("legacy_dispatch_audit event=%s %s", event, safe)


# ---------------------------------------------------------------------------
# Bounded send
# ---------------------------------------------------------------------------

ALLOWED_PURPOSES = ("job_offer", "assignment_confirmation", "assignment_claimed", "customer_assignment_notice")


def build_assignment_confirmation(
    *,
    start_time_display: str,
    customer_name: str,
    has_access_details: bool,
) -> str:
    """
    Minimum assignment information only.

    REMOVED, deliberately: customer phone, full street address, entry method,
    access notes, lockbox/alarm/door codes. Those are home-access secrets and a
    5-digit code is not authorization to disclose them.

    There is no authenticated contractor surface in this legacy vertical to
    direct them to, so the details are OMITTED and the limitation is stated in
    the message rather than the secret being disclosed anyway.
    """
    lines = ["You got the job", "", f"Date/Time: {start_time_display}", f"Customer: {customer_name}"]
    if has_access_details:
        lines.append("")
        lines.append("Access details are not sent by text. Contact the office.")
    lines.append("")
    lines.append("Reply here if you have questions.")
    return "\n".join(lines)


def send_bounded_sms(
    *,
    contact_id: str,
    body: str,
    purpose: str,
    sender,
) -> bool:
    """
    The ONE send helper these routes may use.

    The caller cannot control destination beyond an already-validated contact
    id, cannot supply the body (it is constructed server-side and passed in from
    a fixed set of builders), cannot choose provider or sender identity — those
    come from the configured GHL location — and cannot set a category: `purpose`
    is validated against a closed set.
    """
    if purpose not in ALLOWED_PURPOSES:
        raise DispatchGuardError(500, "Invalid message purpose", audit_reason="bad_purpose")
    if not contact_id:
        raise DispatchGuardError(400, "Bad request", audit_reason="missing_contact")

    audit("sms_requested", contact_id=contact_id, purpose=purpose, length=len(body))
    try:
        sender(contact_id, body)
        audit("sms_dispatched", contact_id=contact_id, purpose=purpose, result="ok")
        return True
    except Exception as exc:  # noqa: BLE001
        audit("sms_failed", contact_id=contact_id, purpose=purpose, result="error", error=type(exc).__name__)
        return False


def reset_state_for_tests() -> None:
    _attempts.clear()
    _lockouts.clear()
    _rate.clear()
    _processed.clear()
