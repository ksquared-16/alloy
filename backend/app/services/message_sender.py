"""
Consume queued rows from public.messages and send via Twilio.
Uses Supabase (service role) for read/update and integrations.twilio_client for send.

Shared QA Activation Safety — before any Twilio call, resolve the originating
organization through workflow_runs ownership and refuse frozen QA orgs (and fail
closed when ownership cannot be established).
"""
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..supabase_client import _get_base_url, _get_headers
from ..integrations.twilio_client import send_sms
from .activity_workflow_events import emit_message_lifecycle_event
from .dispatch_eligibility import REGISTERED_QA_ORG_IDS, revalidate_for_dispatch

logger = logging.getLogger("alloy-dispatcher")

ERROR_TRUNCATE = 500

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


def _resolve_org_id_via_workflow_run(
    base_url: str,
    headers: Dict[str, str],
    workflow_run_id: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Authoritative org for a legacy public.messages row: workflow_runs.org_id.

    Returns (org_id, refusal_reason). refusal_reason is set when org cannot be
    established safely or the run is a frozen QA organization.
    """
    wr = (workflow_run_id or "").strip()
    if not wr or not _UUID_RE.match(wr):
        return None, "QA_ORG_OUTBOUND_ORG_UNRESOLVABLE"
    try:
        resp = requests.get(
            f"{base_url}/workflow_runs",
            headers=headers,
            params={"id": f"eq.{wr}", "select": "id,org_id", "limit": "1"},
            timeout=15,
        )
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        logger.warning("MESSAGE_SENDER_ORG_LOOKUP_FAIL workflow_run_id=%s err=%s", wr, e)
        return None, "QA_ORG_OUTBOUND_ORG_UNRESOLVABLE"

    if not isinstance(rows, list) or not rows:
        return None, "QA_ORG_OUTBOUND_ORG_UNRESOLVABLE"

    org_id = str((rows[0] or {}).get("org_id") or "").strip()
    if not org_id or not _UUID_RE.match(org_id):
        return None, "QA_ORG_OUTBOUND_ORG_UNRESOLVABLE"
    if org_id in REGISTERED_QA_ORG_IDS:
        return org_id, "QA_ORG_OUTBOUND_REFUSED"
    return org_id, None


def process_queued_messages(limit: int = 25, workflow_run_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch queued SMS messages from Supabase, send via Twilio, and update rows.

    Query: status=queued, direction=outbound, channel=sms, sent_at is null,
    order by created_at asc, limit=limit.

    If workflow_run_id is a valid UUID, only rows with that workflow_run_id are considered
    (avoids processing unrelated queued SMS from other workflows in the same batch).

    On success: status=sent, sent_at=now(), provider=twilio, provider_message_id=sid, error=null.
    On failure: status=failed, error=str(exception) truncated to 500 chars.

    Returns:
        { "processed": N, "sent": S, "failed": F, "message_ids": [...], "errors": [...],
          "refused": R }
    """
    base_url = _get_base_url()
    headers = _get_headers()
    url = f"{base_url}/messages"

    # PostgREST: filter and order
    params = {
        "status": "eq.queued",
        "direction": "eq.outbound",
        "channel": "eq.sms",
        "sent_at": "is.null",
        "order": "created_at.asc",
        "limit": str(max(1, min(limit, 100))),
    }
    wr = (workflow_run_id or "").strip()
    if wr and _UUID_RE.match(wr):
        params["workflow_run_id"] = f"eq.{wr}"
        logger.info("MESSAGE_SENDER_FILTER workflow_run_id=%s", wr)

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        logger.exception("MESSAGE_SENDER_QUERY_FAIL: %s", e)
        return {
            "processed": 0,
            "sent": 0,
            "failed": 0,
            "refused": 0,
            "message_ids": [],
            "errors": [str(e)[:ERROR_TRUNCATE]],
        }

    if not rows:
        return {
            "processed": 0,
            "sent": 0,
            "failed": 0,
            "refused": 0,
            "message_ids": [],
            "errors": [],
        }

    message_ids: List[str] = []
    errors: List[str] = []
    sent = 0
    failed = 0
    refused = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for row in rows:
        msg_id = row.get("id")
        to_value = (row.get("to_value") or "").strip()
        body = (row.get("body") or "").strip()

        logger.info("MESSAGE_SEND_ATTEMPT id=%s to=%s", msg_id, to_value[:12] + "..." if len(to_value) > 12 else to_value)

        _org_id, refusal = _resolve_org_id_via_workflow_run(
            base_url, headers, row.get("workflow_run_id")
        )
        if refusal:
            err_msg = refusal[:ERROR_TRUNCATE]
            logger.warning(
                "MESSAGE_SEND_QA_REFUSED id=%s workflow_run_id=%s reason=%s",
                msg_id,
                row.get("workflow_run_id"),
                refusal,
            )
            patch = {"status": "failed", "error": err_msg}
            _update_message(base_url, headers, msg_id, patch)
            message_ids.append(str(msg_id))
            errors.append(err_msg)
            refused += 1
            failed += 1
            continue

        # The same final policy check every Python dispatch passes (`revalidate_for_dispatch`). A legacy
        # row written by a workflow's create_message carries no eligibility record — no category, no
        # recipient consent — so it is refused (SNAPSHOT_MISSING) instead of reaching Twilio around an
        # opt-out. Workflow texts are delivered through the canonical enqueue, which records one.
        decision = revalidate_for_dispatch({**row, "org_id": _org_id, "channel": "sms"})
        if not decision.allowed:
            err_msg = f"policy:{decision.reason}"[:ERROR_TRUNCATE]
            logger.warning(
                "MESSAGE_SEND_POLICY_REFUSED id=%s workflow_run_id=%s reason=%s",
                msg_id,
                row.get("workflow_run_id"),
                decision.reason,
            )
            _update_message(base_url, headers, msg_id, {"status": "failed", "error": err_msg})
            message_ids.append(str(msg_id))
            errors.append(err_msg)
            refused += 1
            failed += 1
            continue

        try:
            result = send_sms(to_value, body)
            sid = result.get("sid", "")
            logger.info("MESSAGE_SEND_OK id=%s sid=%s", msg_id, sid[-6:] if sid else "—")

            patch = {
                "status": "sent",
                "sent_at": now_iso,
                "provider": "twilio",
                "provider_message_id": sid or None,
                "error": None,
            }
            _update_message(base_url, headers, msg_id, patch)
            message_ids.append(str(msg_id))
            sent += 1
            try:
                emit_message_lifecycle_event(
                    event_purpose="message_sent",
                    message_row=row if isinstance(row, dict) else {},
                    message_id=str(msg_id),
                    body_text=body or None,
                )
            except Exception as emit_err:
                logger.warning("MESSAGE_SEND_ACTIVITY_EMIT id=%s err=%s", msg_id, emit_err)
        except Exception as e:
            err_msg = str(e)[:ERROR_TRUNCATE]
            logger.warning("MESSAGE_SEND_FAIL id=%s err=%s", msg_id, err_msg)
            patch = {
                "status": "failed",
                "error": err_msg,
            }
            _update_message(base_url, headers, msg_id, patch)
            message_ids.append(str(msg_id))
            errors.append(err_msg)
            failed += 1

    return {
        "processed": len(rows),
        "sent": sent,
        "failed": failed,
        "refused": refused,
        "message_ids": message_ids,
        "errors": errors,
    }


def _update_message(base_url: str, headers: Dict[str, str], message_id: str, patch: Dict[str, Any]) -> None:
    """PATCH a single message row by id."""
    url = f"{base_url}/messages"
    params = {"id": f"eq.{message_id}"}
    resp = requests.patch(url, headers=headers, params=params, json=patch, timeout=10)
    if not resp.ok:
        logger.error("MESSAGE_UPDATE_FAIL id=%s status=%s body=%s", message_id, resp.status_code, resp.text[:200])
