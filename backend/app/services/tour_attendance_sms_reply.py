"""
Tour attendance SMS reply seam (Reply 1).

Called AFTER compliance keyword handling when no STOP/START/HELP matched.
Requires an eligible Tour reminder outbound on the same thread — never treats
an arbitrary "1" as confirmation.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

from ..settings import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

logger = logging.getLogger("alloy-dispatcher")

ACTIVE_STATUSES = {"confirmed", "rescheduled", "pending_approval"}


def _headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def normalize_attendance_reply(body: Optional[str]) -> bool:
    if not body:
        return False
    compact = re.sub(r"[.!?,]", "", body.strip().lower())
    compact = re.sub(r"\s+", " ", compact).strip()
    return compact in ("1", "reply 1")


def handle_tour_attendance_sms_reply(
    *,
    org_id: str,
    body: Optional[str],
    message_row: Dict[str, Any],
) -> Dict[str, Any]:
    if not normalize_attendance_reply(body):
        return {"applied": False, "reason": "not_attendance_reply"}

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return {"applied": False, "reason": "supabase_unconfigured"}

    meta = message_row.get("metadata") if isinstance(message_row.get("metadata"), dict) else {}
    thread_id = str(message_row.get("thread_id") or meta.get("thread_id") or "").strip()
    person_id = str(meta.get("primary_entity_id") or meta.get("person_id") or "").strip()
    entity_type = str(meta.get("primary_entity_type") or "").strip().lower()
    if entity_type not in ("person", "persons") and not person_id:
        # Prefer explicit person resolution from keyword handler shape.
        return {"applied": False, "reason": "sender_unresolved"}
    if not thread_id or not person_id:
        return {"applied": False, "reason": "missing_thread_or_person"}

    base = SUPABASE_URL.rstrip("/") + "/rest/v1"
    # Recent outbound on this thread looking for tour reminder context.
    resp = requests.get(
        f"{base}/communication_messages",
        headers=_headers(),
        params={
            "org_id": f"eq.{org_id}",
            "thread_id": f"eq.{thread_id}",
            "direction": "eq.outbound",
            "select": "id,metadata,created_at",
            "order": "created_at.desc",
            "limit": "20",
        },
        timeout=15,
    )
    if not resp.ok:
        return {"applied": False, "reason": f"lookup_failed:{resp.status_code}"}

    booking_id = ""
    for row in resp.json() if isinstance(resp.json(), list) else []:
        m = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        source = str(m.get("source") or "").strip()
        event_key = str(m.get("event_key") or "").strip()
        bid = str(m.get("tour_booking_id") or "").strip()
        reminder_key = str(m.get("reminder_key") or "").strip()
        if source == "tour_scheduling" and event_key == "tour_reminder" and bid:
            booking_id = bid
            break
        if bid and reminder_key.startswith("tour_reminder"):
            booking_id = bid
            break

    if not booking_id:
        return {"applied": False, "reason": "no_eligible_tour_reminder_context"}

    bresp = requests.get(
        f"{base}/tour_bookings",
        headers=_headers(),
        params={
            "org_id": f"eq.{org_id}",
            "id": f"eq.{booking_id}",
            "select": "id,status_key,metadata,location_id,opportunity_id,start_at,end_at,timezone,source,primary_person_id",
            "limit": "1",
        },
        timeout=15,
    )
    if not bresp.ok:
        return {"applied": False, "reason": f"booking_lookup_failed:{bresp.status_code}"}
    brows = bresp.json() if isinstance(bresp.json(), list) else []
    if not brows:
        return {"applied": False, "reason": "booking_not_found"}
    booking = brows[0]
    status = str(booking.get("status_key") or "")
    if status not in ACTIVE_STATUSES:
        return {"applied": False, "reason": "booking_not_active"}

    # Respect ask_parent_confirm_attendance when present on org tour_comms.
    ask_confirm = True
    try:
        os_resp = requests.get(
            f"{base}/org_settings",
            headers=_headers(),
            params={"org_id": f"eq.{org_id}", "select": "metadata", "limit": "1"},
            timeout=10,
        )
        if os_resp.ok:
            rows = os_resp.json() if isinstance(os_resp.json(), list) else []
            if rows and isinstance(rows[0].get("metadata"), dict):
                tc = rows[0]["metadata"].get("tour_comms")
                if isinstance(tc, dict) and isinstance(tc.get("ask_parent_confirm_attendance"), bool):
                    ask_confirm = tc["ask_parent_confirm_attendance"]
    except Exception:  # noqa: BLE001
        pass
    if not ask_confirm:
        return {"applied": False, "reason": "confirm_attendance_disabled"}

    existing_md = booking.get("metadata") if isinstance(booking.get("metadata"), dict) else {}
    existing_att = existing_md.get("attendance_confirmation") if isinstance(existing_md.get("attendance_confirmation"), dict) else {}
    if str(existing_att.get("status") or "") == "confirmed_by_parent":
        return {"applied": True, "reason": "already_confirmed", "booking_id": booking_id}

    now = datetime.now(timezone.utc).isoformat()
    new_md = dict(existing_md)
    new_md["attendance_confirmation"] = {
        "status": "confirmed_by_parent",
        "confirmed_at": now,
        "confirmed_by_person_id": person_id,
        "source": "sms_reply",
    }
    patch = requests.patch(
        f"{base}/tour_bookings",
        headers={**_headers(), "Prefer": "return=minimal"},
        params={"org_id": f"eq.{org_id}", "id": f"eq.{booking_id}"},
        json={"metadata": new_md, "updated_at": now},
        timeout=15,
    )
    if not patch.ok:
        return {"applied": False, "reason": f"update_failed:{patch.status_code}"}

    # Activity fact — same event type as the TypeScript confirm path.
    try:
        requests.post(
            f"{base}/workflow_events",
            headers=_headers(),
            json={
                "org_id": org_id,
                "event_type": "tour_attendance_confirmed",
                "entity_type": "tour_bookings",
                "entity_id": booking_id,
                "occurred_at": now,
                "payload": {
                    "org_id": org_id,
                    "booking_id": booking_id,
                    "opportunity_id": booking.get("opportunity_id"),
                    "attendance_source": "sms_reply",
                    "confirmed_by_person_id": person_id,
                    "status_key": status,
                },
            },
            timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("tour_attendance_sms_reply: workflow_events emit failed %s", e)

    logger.info(
        "tour_attendance_sms_reply: confirmed org=%s booking=%s person=%s",
        org_id,
        booking_id,
        person_id,
    )
    return {"applied": True, "reason": "confirmed", "booking_id": booking_id}
