"""
Staging outbound recipient guard (ALY-14) — the last check before a provider call.

A staging runtime may deliver email and SMS ONLY to controlled test recipients or
to an explicit owner allowlist. The check lives inside the provider adapters
(`send_resend_email`, `send_sms`, `send_sms_with_credentials`), so every
dispatcher path inherits it and none can route around it.

Environment is decided fail-closed toward safety: ANY staging signal restricts.
Production (no staging signal) is unchanged.

Mirrors web/lib/communications/stagingOutboundRecipientGuard.ts — keep in step.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Iterable, Mapping, Optional
from urllib.parse import urlparse

logger = logging.getLogger("alloy-dispatcher")

# docs/platform/governance/deployment-and-environments.md — identity is the project ref.
ALLOY_STAGING_SUPABASE_PROJECT_REF = "ikaxilmwmrmbagoidedu"

STAGING_EMAIL_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST"
STAGING_SMS_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_SMS_ALLOWLIST"

STAGING_RECIPIENT_REFUSED = "staging_recipient_not_allowlisted"

# RFC 2606 / 6761 reserved names: never deliverable to a person.
_RESERVED_EMAIL_DOMAINS = frozenset({"example.com", "example.net", "example.org"})
_RESERVED_EMAIL_TLDS = (".test", ".example", ".invalid", ".localhost")
# Resend's documented sandbox inboxes; `+label` variants route to the same sink.
_RESEND_TEST_LOCAL_PARTS = frozenset({"delivered", "bounced", "complained", "suppressed"})
# NANP fictional range +1 NPA 555-0100…0199: reserved, never assigned to a subscriber.
_TEST_PHONE_RE = re.compile(r"^1[2-9]\d{2}55501\d{2}$")
_SUPABASE_HOST_RE = re.compile(r"^([a-z0-9]+)\.supabase\.co$")
_ANGLE_RE = re.compile(r"<([^<>]+)>\s*$")


class StagingRecipientRefused(RuntimeError):
    """Raised before any provider request when staging would reach a real person."""

    code = STAGING_RECIPIENT_REFUSED


def _env(env: Optional[Mapping[str, str]]) -> Mapping[str, str]:
    return os.environ if env is None else env


def _project_ref(url: Optional[str]) -> Optional[str]:
    value = (url or "").strip()
    if not value:
        return None
    try:
        host = (urlparse(value).hostname or "").lower()
    except ValueError:
        return None
    m = _SUPABASE_HOST_RE.match(host)
    return m.group(1) if m else None


def is_staging_outbound_runtime(env: Optional[Mapping[str, str]] = None) -> bool:
    e = _env(env)
    labels = [(e.get(k) or "").strip().lower() for k in ("APP_ENV", "ALLOY_ENVIRONMENT", "NEXT_PUBLIC_APP_ENV")]
    if "staging" in labels:
        return True
    if (e.get("VERCEL_ENV") or "").strip().lower() == "preview":
        return True
    return _project_ref(e.get("SUPABASE_URL")) == ALLOY_STAGING_SUPABASE_PROJECT_REF


def normalize_email_address(raw: str) -> str:
    value = str(raw or "").strip()
    m = _ANGLE_RE.search(value)
    return (m.group(1) if m else value).strip().lower()


def normalize_phone_digits(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw or ""))
    return "1" + digits if len(digits) == 10 else digits


def is_controlled_test_email(raw: str) -> bool:
    addr = normalize_email_address(raw)
    at = addr.rfind("@")
    if at <= 0 or at == len(addr) - 1:
        return False
    local, domain = addr[:at], addr[at + 1 :]
    if domain in _RESERVED_EMAIL_DOMAINS or domain.endswith(_RESERVED_EMAIL_TLDS):
        return True
    if domain == "resend.dev":
        return local.split("+")[0] in _RESEND_TEST_LOCAL_PARTS
    return False


def is_controlled_test_phone(raw: str) -> bool:
    return bool(_TEST_PHONE_RE.match(normalize_phone_digits(raw)))


def _allowlist(e: Mapping[str, str], name: str) -> list[str]:
    return [s for s in re.split(r"[,;\n]+", e.get(name) or "") if s.strip()]


def is_owner_allowlisted_email(raw: str, env: Optional[Mapping[str, str]] = None) -> bool:
    """Exact addresses only — a domain wildcard could admit real people."""
    addr = normalize_email_address(raw)
    if "@" not in addr:
        return False
    return any(normalize_email_address(x) == addr for x in _allowlist(_env(env), STAGING_EMAIL_ALLOWLIST_ENV))


def is_owner_allowlisted_phone(raw: str, env: Optional[Mapping[str, str]] = None) -> bool:
    digits = normalize_phone_digits(raw)
    if len(digits) < 8:
        return False
    return any(normalize_phone_digits(x) == digits for x in _allowlist(_env(env), STAGING_SMS_ALLOWLIST_ENV))


def _mask(channel: str, raw: str) -> str:
    if channel == "sms":
        return "…" + normalize_phone_digits(raw)[-4:]
    addr = normalize_email_address(raw)
    at = addr.rfind("@")
    return f"{addr[0]}…@{addr[at + 1:]}" if at > 0 else "…"


def guard_outbound_recipients(
    channel: str, recipients: Iterable[str], env: Optional[Mapping[str, str]] = None
) -> None:
    """Raise StagingRecipientRefused unless every recipient is permitted. No-op outside staging."""
    e = _env(env)
    if not is_staging_outbound_runtime(e):
        return
    items = [str(r or "").strip() for r in recipients]
    if not items or any(not r for r in items):
        raise StagingRecipientRefused(f"{STAGING_RECIPIENT_REFUSED}: staging {channel}: empty recipient")
    for r in items:
        if channel == "email":
            allowed = is_controlled_test_email(r) or is_owner_allowlisted_email(r, e)
            env_name = STAGING_EMAIL_ALLOWLIST_ENV
        else:
            allowed = is_controlled_test_phone(r) or is_owner_allowlisted_phone(r, e)
            env_name = STAGING_SMS_ALLOWLIST_ENV
        if not allowed:
            detail = f"staging {channel}: {_mask(channel, r)} is not a test recipient or on {env_name}"
            logger.warning("STAGING_OUTBOUND_REFUSED %s", detail)
            raise StagingRecipientRefused(f"{STAGING_RECIPIENT_REFUSED}: {detail}")
