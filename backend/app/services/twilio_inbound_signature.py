"""
Twilio inbound webhook signature verification (X-Twilio-Signature).

Uses twilio.request_validator.RequestValidator. Caller must never log auth tokens.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from twilio.request_validator import RequestValidator

from ..settings import TWILIO_AUTH_TOKEN
from .communications.secret_ref import is_legacy_global_twilio_binding, resolve_secret_plaintext

logger = logging.getLogger("alloy-dispatcher")


def resolve_inbound_twilio_auth_token(
    binding: Optional[Dict[str, Any]],
) -> Optional[str]:
    """
    Auth token for RequestValidator: binding secret_ref (env:*) or legacy global sentinel,
    else fallback to process TWILIO_AUTH_TOKEN.
    """
    global_tok = (TWILIO_AUTH_TOKEN or "").strip() or None

    if not binding:
        return global_tok

    ref = (binding.get("secret_ref") or "").strip()
    if is_legacy_global_twilio_binding(ref):
        return global_tok
    if not ref or ref == "unconfigured":
        return global_tok

    # The binding carries its own tenant, which is what scopes an
    # organization-owned credential. When it cannot be resolved this falls back to
    # the deployment token, which will NOT match a tenant's signature — so an
    # unresolvable credential rejects the webhook rather than accepting it
    # unverified. Fail-closed is the only safe direction for a signature check.
    resolved = resolve_secret_plaintext(ref, str(binding.get("org_id") or "") or None)
    if resolved:
        return resolved.strip() or None
    return global_tok


def form_to_signature_params(form: Any) -> Dict[str, str]:
    """Flatten Starlette FormData to str->str for Twilio validator."""
    out: Dict[str, str] = {}
    try:
        for key, value in form.multi_items():
            if hasattr(value, "read"):
                continue
            out[str(key)] = value if isinstance(value, str) else str(value)
    except Exception:
        pass
    return out


def validate_twilio_inbound_signature(
    *,
    auth_token: Optional[str],
    full_url: str,
    post_params: Dict[str, str],
    signature_header: Optional[str],
) -> bool:
    """Return True only when signature validates; missing token or header => False."""
    if not auth_token or not signature_header:
        return False
    try:
        return bool(RequestValidator(auth_token).validate(full_url, post_params, signature_header))
    except Exception:
        logger.warning("sms_inbound_guard event=signature_validator_error", exc_info=True)
        return False
