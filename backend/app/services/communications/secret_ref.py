"""
Resolve secret references for provider bindings — no plaintext secrets in DB.

Supported secret_ref values:
- vault:<uuid>         — an ORGANIZATION-owned credential, resolved through the
                         canonical authority `public.org_provider_credential_resolve`.
                         Requires the caller's org_id and fails closed without it.
- legacy_global_twilio — process-wide Twilio env from settings (migration only).
- env:VAR_NAME         — deployment-owned credential; empty means missing.
- unconfigured         — no secret available.

WHY `vault:` GOES THROUGH THE DATABASE. The `vault` schema is not exposed to
PostgREST (`config.toml: schemas = ["public", "graphql_public"]`) and this service
holds no direct Postgres connection — it speaks to PostgREST over HTTP. A
`SECURITY DEFINER` function in `public` is therefore the only seam both runtimes
can share, which is also what keeps the resolution semantics single: TypeScript
and Python call the SAME function rather than each reimplementing the grammar.

WHY org_id IS MANDATORY FOR `vault:`. Tenancy is not enforced by the reference —
it is enforced by the authority, which will only resolve a reference reachable
through a provider account belonging to that organization. Passing no org_id would
ask the authority a question it must refuse, so this module refuses first rather
than sending a request that cannot succeed.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

VAULT_PREFIX = "vault:"


def is_org_owned_secret_ref(secret_ref: str) -> bool:
    """True when the reference names an organization-owned credential."""
    return (secret_ref or "").strip().startswith(VAULT_PREFIX)


def resolve_secret_plaintext(secret_ref: str, org_id: Optional[str] = None) -> Optional[str]:
    """
    Returns resolved secret string or None if unavailable.
    Caller must never log returned value.

    `org_id` is required for `vault:` references and ignored for every other
    convention, so existing callers that resolve deployment credentials are
    unchanged.
    """
    ref = (secret_ref or "").strip()
    if not ref or ref == "unconfigured":
        return None
    if ref == "legacy_global_twilio":
        # Sentinel handled by callers (use settings-based Twilio send).
        return None
    if ref.startswith(VAULT_PREFIX):
        return _resolve_org_owned(ref, org_id)
    if ref.startswith("env:"):
        key = ref[4:].strip()
        if not key:
            return None
        val = os.getenv(key)
        return val.strip() if val else None
    # Unknown convention — refuse (do not treat ref as literal secret).
    return None


def _resolve_org_owned(ref: str, org_id: Optional[str]) -> Optional[str]:
    """Ask the canonical authority. Never caches — a revoked credential must stop
    working immediately, and a cache would keep sending after revocation."""
    org = (org_id or "").strip()
    if not org:
        # Fail closed, and say why WITHOUT naming the reference: a log line pairing
        # an org with a credential reference is a small leak of its own.
        logger.warning("org-owned credential requested without an organization; refusing")
        return None

    # Imported here so that the pure grammar above stays importable in contexts
    # that have no Supabase configuration (tests, tooling).
    from ...supabase_client import _get_base_url, _get_headers  # noqa: WPS433
    import requests

    try:
        resp = requests.post(
            f"{_get_base_url()}/rpc/org_provider_credential_resolve",
            headers={**_get_headers(), "Content-Type": "application/json"},
            json={"p_org_id": org, "p_secret_ref": ref},
            timeout=10,
        )
        if not resp.ok:
            # Status only. The body could echo the request, which contains the ref.
            logger.warning("credential authority refused: HTTP %s", resp.status_code)
            return None
        value = resp.json()
    except Exception:  # noqa: BLE001 — never let a resolution failure raise into a send
        logger.warning("credential authority unreachable", exc_info=False)
        return None

    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def is_legacy_global_twilio_binding(secret_ref: str) -> bool:
    return (secret_ref or "").strip() == "legacy_global_twilio"
