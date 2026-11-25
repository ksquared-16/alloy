"""
Staging outbound recipient guard (ALY-14) — the last check before a provider call.

A staging runtime may deliver email and SMS ONLY to controlled test recipients or
to an explicit owner allowlist. The check lives inside the provider adapters
(`send_resend_email`, `send_sms`, `send_sms_with_credentials`), so every
dispatcher path inherits it and none can route around it.

The environment is declared: ALLOY_ENVIRONMENT=staging|production. Only an
uncontradicted `production` is unrestricted. Missing, empty or unknown values
restrict exactly like staging (fail closed), and `production` is overridden by any
staging signal — the staging project ref in SUPABASE_URL, APP_ENV /
NEXT_PUBLIC_APP_ENV=staging, or VERCEL_ENV=preview.

Mirrors web/lib/communications/stagingOutboundRecipientGuard.ts — keep in step.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Iterable, Mapping, Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger("alloy-dispatcher")

# docs/platform/governance/deployment-and-environments.md — identity is the project ref.
ALLOY_STAGING_SUPABASE_PROJECT_REF = "ikaxilmwmrmbagoidedu"

STAGING_EMAIL_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST"
STAGING_SMS_ALLOWLIST_ENV = "COMMUNICATIONS_STAGING_SMS_ALLOWLIST"

STAGING_RECIPIENT_REFUSED = "staging_recipient_not_allowlisted"

ALLOY_ENVIRONMENT_ENV = "ALLOY_ENVIRONMENT"
ALLOY_ENVIRONMENT_STAGING = "staging"
ALLOY_ENVIRONMENT_PRODUCTION = "production"

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


def _staging_signal(e: Mapping[str, str]) -> Optional[str]:
    for name in ("NEXT_PUBLIC_APP_ENV", "APP_ENV"):
        if (e.get(name) or "").strip().lower() == "staging":
            return f"{name}=staging"
    if (e.get("VERCEL_ENV") or "").strip().lower() == "preview":
        return "VERCEL_ENV=preview"
    for name in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"):
        if _project_ref(e.get(name)) == ALLOY_STAGING_SUPABASE_PROJECT_REF:
            return f"{name} is the staging project"
    return None


def resolve_outbound_environment(env: Optional[Mapping[str, str]] = None) -> Tuple[str, bool, str]:
    """(mode, restricted, reason). mode is live | staging | unidentified; only live is unrestricted."""
    e = _env(env)
    label = (e.get(ALLOY_ENVIRONMENT_ENV) or "").strip().lower()
    if label == ALLOY_ENVIRONMENT_STAGING:
        return "staging", True, f"{ALLOY_ENVIRONMENT_ENV}=staging"
    if label == ALLOY_ENVIRONMENT_PRODUCTION:
        contradiction = _staging_signal(e)
        if contradiction:
            return "staging", True, f"{ALLOY_ENVIRONMENT_ENV}=production contradicted by {contradiction}"
        return "live", False, f"{ALLOY_ENVIRONMENT_ENV}=production"
    if label:
        return "unidentified", True, f"{ALLOY_ENVIRONMENT_ENV}={label} is not a known environment"
    return "unidentified", True, f"{ALLOY_ENVIRONMENT_ENV} is not set"


def is_outbound_restricted(env: Optional[Mapping[str, str]] = None) -> bool:
    """True unless this runtime is explicitly, uncontradictedly production."""
    return resolve_outbound_environment(env)[1]


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
    """Raise StagingRecipientRefused unless every recipient is permitted. No-op only in live production."""
    e = _env(env)
    mode, restricted, reason = resolve_outbound_environment(e)
    if not restricted:
        return
    scope = f"{mode} {channel} ({reason})"
    items = [str(r or "").strip() for r in recipients]
    if not items or any(not r for r in items):
        raise StagingRecipientRefused(f"{STAGING_RECIPIENT_REFUSED}: {scope}: empty recipient")
    for r in items:
        if channel == "email":
            allowed = is_controlled_test_email(r) or is_owner_allowlisted_email(r, e)
            env_name = STAGING_EMAIL_ALLOWLIST_ENV
        else:
            allowed = is_controlled_test_phone(r) or is_owner_allowlisted_phone(r, e)
            env_name = STAGING_SMS_ALLOWLIST_ENV
        if not allowed:
            detail = f"{scope}: {_mask(channel, r)} is not a test recipient or on {env_name}"
            logger.warning("STAGING_OUTBOUND_REFUSED %s", detail)
            raise StagingRecipientRefused(f"{STAGING_RECIPIENT_REFUSED}: {detail}")
