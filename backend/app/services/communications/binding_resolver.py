"""
Select active communication_provider_binding for outbound send.
Hierarchy: user (stub) > location > org scope (CARD 1.6).
Fetched via PostgREST (existing Supabase worker pattern).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("alloy-dispatcher")


def resolve_outbound_binding(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    channel: str,
    location_id: Optional[str],
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Return best binding row dict or None.
    Precedence among rows: user scoped > location match > org scope (primary first).
    user_id scoped selection is stubbed (returns none unless rows exist later).
    """
    ch = (channel or "").strip().lower()
    if ch not in ("sms", "email"):
        return None

    # Fetch candidates: active bindings for org + channel
    url = f"{base_url}/communication_provider_bindings"
    params: Dict[str, str] = {
        "org_id": f"eq.{org_id}",
        "channel": f"eq.{ch}",
        "status": "eq.active",
        "select": "*",
        "order": "is_primary.desc,updated_at.desc",
        "limit": "50",
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            logger.warning("binding_resolver GET fail status=%s", resp.status_code)
            return None
        rows: List[Dict[str, Any]] = resp.json()
    except Exception as e:
        logger.exception("binding_resolver GET exception %s", e)
        return None

    if not rows:
        return None

    lid = (location_id or "").strip() if location_id else None
    uid = (user_id or "").strip() if user_id else None

    # User scope stub: only honored if matching rows appear (future).
    if uid:
        user_matches = [
            r
            for r in rows
            if (r.get("scope") or "") == "user" and str(r.get("user_id") or "") == uid
        ]
        if user_matches:
            return _prefer_primary(user_matches)

    if lid:
        loc_matches = [
            r
            for r in rows
            if (r.get("scope") or "") == "location" and str(r.get("location_id") or "") == lid
        ]
        if loc_matches:
            pick = _prefer_primary(loc_matches)
            if pick:
                return pick

    org_matches = [r for r in rows if (r.get("scope") or "") == "org" and not r.get("location_id")]
    if org_matches:
        pick = _prefer_primary(org_matches)
        if pick:
            return pick

    # Fallback: any org-level row regardless of stray location_id nullable
    org_loose = [r for r in rows if (r.get("scope") or "") == "org"]
    if org_loose:
        return _prefer_primary(org_loose)

    return _prefer_primary(rows)


def _prefer_primary(candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    primaries = [r for r in candidates if r.get("is_primary") is True]
    pool = primaries if primaries else candidates
    return pool[0] if pool else None


def find_binding_by_id(
    base_url: str,
    headers: Dict[str, str],
    binding_id: str,
) -> Optional[Dict[str, Any]]:
    url = f"{base_url}/communication_provider_bindings"
    params = {
        "id": f"eq.{binding_id}",
        "select": "*",
        "limit": "1",
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and data:
            return data[0]
    except Exception:
        return None
    return None


def find_binding_by_inbound_to(
    base_url: str,
    headers: Dict[str, str],
    *,
    to_e164: str,
) -> Optional[Dict[str, Any]]:
    to_norm = (to_e164 or "").strip()
    if not to_norm:
        return None
    url = f"{base_url}/communication_provider_bindings"
    params = {
        "inbound_to_e164": f"eq.{to_norm}",
        "status": "eq.active",
        "channel": "eq.sms",
        "select": "*",
        "limit": "10",
    }
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return None
        rows = resp.json()
        if isinstance(rows, list) and rows:
            # If multiple orgs share same number (misconfig), take first — ops must fix.
            return rows[0]
    except Exception:
        return None
    return None
