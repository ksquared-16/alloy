"""
Communications Identity Platform — Python parity with TypeScript resolver contract.

TypeScript resolution before enqueue is canonical. Python validates persisted identity
references and must not independently choose a different sender when identity_id is set.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("alloy-dispatcher")


def _normalize_sms(raw: str) -> str:
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if not digits:
        return (raw or "").strip()
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return f"+{digits}" if not (raw or "").strip().startswith("+") else f"+{digits}"


def find_identity_by_id(
    base_url: str,
    headers: Dict[str, str],
    identity_id: str,
) -> Optional[Dict[str, Any]]:
    url = f"{base_url}/communication_identities"
    params = {"id": f"eq.{identity_id}", "select": "*", "limit": "1"}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return None
        rows = resp.json()
        if isinstance(rows, list) and rows:
            return rows[0]
    except Exception as e:
        logger.exception("find_identity_by_id %s", e)
    return None


def find_provider_account_by_id(
    base_url: str,
    headers: Dict[str, str],
    account_id: str,
) -> Optional[Dict[str, Any]]:
    url = f"{base_url}/communication_provider_accounts"
    params = {"id": f"eq.{account_id}", "select": "*", "limit": "1"}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return None
        rows = resp.json()
        if isinstance(rows, list) and rows:
            return rows[0]
    except Exception as e:
        logger.exception("find_provider_account_by_id %s", e)
    return None


def find_identity_by_legacy_binding(
    base_url: str,
    headers: Dict[str, str],
    binding_id: str,
) -> Optional[Dict[str, Any]]:
    url = f"{base_url}/communication_identities"
    params = {
        "legacy_binding_id": f"eq.{binding_id}",
        "select": "*",
        "limit": "1",
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return None
        rows = resp.json()
        if isinstance(rows, list) and rows:
            return rows[0]
    except Exception as e:
        logger.exception("find_identity_by_legacy_binding %s", e)
    return None


def find_inbound_identities_by_destination(
    base_url: str,
    headers: Dict[str, str],
    *,
    channel: str,
    destination: str,
    org_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Resolve inbound destination to canonical identities (normalized address match)."""
    norm = _normalize_sms(destination) if channel == "sms" else (destination or "").strip().lower()
    if not norm:
        return []
    url = f"{base_url}/communication_identities"
    params: Dict[str, str] = {
        "channel": f"eq.{channel}",
        "normalized_address": f"eq.{norm}",
        "status": "eq.active",
        "inbound_enabled": "eq.true",
        "select": "*",
        "limit": "20",
    }
    if org_id:
        params["org_id"] = f"eq.{org_id}"
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return []
        rows = resp.json()
        return rows if isinstance(rows, list) else []
    except Exception as e:
        logger.exception("find_inbound_identities_by_destination %s", e)
        return []


def binding_dict_from_identity(
    identity: Dict[str, Any],
    account: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a binding-compatible dict for transitional Python send path.
    Worker uses persisted identity; this shape satisfies existing Twilio/Resend send code.
    """
    legacy_binding_id = identity.get("legacy_binding_id")
    cfg = account.get("config") if isinstance(account.get("config"), dict) else {}
    return {
        "id": legacy_binding_id or identity.get("id"),
        "org_id": identity.get("org_id"),
        "channel": identity.get("channel"),
        "provider": account.get("provider_type"),
        "status": "active" if identity.get("status") == "active" else identity.get("status"),
        "secret_ref": account.get("secret_ref") or "unconfigured",
        "config": cfg,
        "inbound_to_e164": identity.get("normalized_address") if identity.get("channel") == "sms" else None,
        "display_label": identity.get("display_name"),
        "communication_identity_id": identity.get("id"),
        "communication_provider_account_id": account.get("id"),
    }


def resolve_persisted_outbound_identity(
    base_url: str,
    headers: Dict[str, str],
    row: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    When communication_messages carries identity + account IDs, load and return binding-compatible dict.
    Returns None when IDs absent — caller may fall back to legacy binding resolution (compatibility only).
    """
    ident_id = row.get("communication_identity_id")
    acct_id = row.get("communication_provider_account_id")
    if not ident_id:
        return None
    identity = find_identity_by_id(base_url, headers, str(ident_id))
    if not identity:
        return None
    account = None
    if acct_id:
        account = find_provider_account_by_id(base_url, headers, str(acct_id))
    if not account:
        pa = identity.get("provider_account_id")
        if pa:
            account = find_provider_account_by_id(base_url, headers, str(pa))
    if not account:
        return None
    if str(identity.get("org_id") or "") != str(row.get("org_id") or ""):
        logger.warning("identity org mismatch for message %s", row.get("id"))
        return None
    return binding_dict_from_identity(identity, account)
