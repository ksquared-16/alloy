"""
Process queued outbound rows in communication_messages (SMS + email).
Extends dispatcher alongside legacy public.messages (message_sender.py).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

from ..integrations.resend_client import default_from_email, send_resend_email
from .communications.email_message_id import mint_outbound_message_id
from .communications.email_thread_headers import fetch_thread_email_headers, outbound_email_headers
from ..integrations.twilio_client import send_sms, send_sms_with_credentials
from ..supabase_client import _get_base_url, _get_headers
from .communication_workflow_events import emit_for_communication_message
from .communications.binding_resolver import find_binding_by_id, resolve_outbound_binding
from .communications.identity_resolver import resolve_persisted_outbound_identity
from .communications.status_callback import build_sms_status_callback_url
from .dispatch_eligibility import revalidate_for_dispatch
from ..settings import PUBLIC_TWILIO_STATUS_CALLBACK_BASE
from .communications.secret_ref import (
    is_legacy_global_twilio_binding,
    resolve_secret_plaintext,
)

logger = logging.getLogger("alloy-dispatcher")

ERROR_TRUNCATE = 500


def _html_from_rendered_snapshot(row: Dict[str, Any]) -> Optional[str]:
    snap = row.get("rendered_snapshot")
    if isinstance(snap, str):
        try:
            import json

            snap = json.loads(snap)
        except Exception:
            return None
    if not isinstance(snap, dict):
        return None
    html = snap.get("html")
    if html is None:
        return None
    text = str(html).strip()
    return text or None


def _text_from_rendered_snapshot(row: Dict[str, Any]) -> Optional[str]:
    snap = row.get("rendered_snapshot")
    if isinstance(snap, str):
        try:
            import json

            snap = json.loads(snap)
        except Exception:
            return None
    if not isinstance(snap, dict):
        return None
    text = snap.get("text")
    if text is None:
        return None
    out = str(text).strip()
    return out or None


def _polish_plain_email_action_links(text: str) -> str:
    """Parent-facing labels for Tour action URLs when only plain text was stored."""
    import html as html_lib
    import re

    escaped = html_lib.escape(text or "")
    with_breaks = escaped.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>")
    # Labels may sit on the line above the URL (`Label:<br>https://…`).
    gap = r"(?:\s|<br\s*/?>)*"
    patterns = [
        (
            rf"Choose a tour time:?{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">Choose a tour time</a>',
        ),
        (
            rf"Add to calendar:{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;">Add to calendar</a>',
        ),
        (
            rf"Need to reschedule\?{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;">Reschedule tour</a>',
        ),
        (
            rf"Manage or cancel your tour:{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;">Manage or cancel tour</a>',
        ),
        (
            rf"Manage or cancel tour:{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;">Manage or cancel tour</a>',
        ),
        (
            rf"Book a new time:{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;">Choose a tour time</a>',
        ),
        (
            rf"Book your tour:{gap}(https?://[^\s<]+)",
            r'<a href="\1" style="color:#1f4d3a;text-decoration:underline;font-weight:600;">Choose a tour time</a>',
        ),
    ]
    out = with_breaks
    for pattern, repl in patterns:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    return f"<p>{out}</p>"


def _resolve_outbound_email_html(row: Dict[str, Any], cfg: Dict[str, Any], text_body: str) -> Optional[str]:
    """Prefer immutable render snapshot HTML; fall back to binding cfg or polished plain text."""
    from_snap = _html_from_rendered_snapshot(row)
    if from_snap:
        return from_snap
    cfg_html = cfg.get("html")
    if cfg_html:
        s = str(cfg_html).strip()
        if s:
            return s
    # Prefer snapshot text (retains href URLs after renderer plain-text extraction)
    # when the row body was stored without destinations.
    polish_source = text_body
    snap_text = _text_from_rendered_snapshot(row)
    if snap_text and ("http://" in snap_text or "https://" in snap_text):
        if "http://" not in (text_body or "") and "https://" not in (text_body or ""):
            polish_source = snap_text
    # Tour / action emails often store plain text with labeled URLs — polish for parents.
    if re_search_action_url_label(polish_source):
        return _polish_plain_email_action_links(polish_source)
    return None


def re_search_action_url_label(text: str) -> bool:
    import re

    return bool(
        re.search(
            r"(Choose a tour time|Add to calendar|Need to reschedule|Manage or cancel|Book a new time|Book your tour).{0,40}https?://",
            text or "",
            flags=re.IGNORECASE | re.DOTALL,
        )
    )


def _tail_str(s: str, n: int = 8) -> str:
    t = (s or "").strip()
    if not t:
        return "(empty)"
    return t[-n:] if len(t) > n else t


def _from_email_for_log(from_email: str) -> str:
    """Log-friendly from: masked local + domain (not a secret; reduces shared-log PII)."""
    s = (from_email or "").strip()
    if not s:
        return "(empty)"
    if "@" not in s:
        return s[:64]
    local, _, domain = s.partition("@")
    domain = domain.strip()
    if not domain:
        return s[:64]
    if len(local) <= 2:
        return f"...@{domain}"
    return f"{local[0]}...{local[-1]}@{domain}"


def _to_address_tail_for_log(to_email: str) -> str:
    """Recipient: domain + last chars of local only."""
    s = (to_email or "").strip()
    if not s:
        return "(empty)"
    if "@" not in s:
        return _tail_str(s, 12)
    local, _, domain = s.partition("@")
    domain = domain.strip()
    if not domain:
        return f"...{_tail_str(local, 4)}"
    tail = local[-4:] if len(local) >= 4 else local
    return f"...{tail}@{domain}"

_JSON_HEADERS = {"Content-Type": "application/json", "Prefer": "return=representation"}


def _patch_comm_message(base_url: str, headers: Dict[str, str], msg_id: str, patch: Dict[str, Any]) -> None:
    h = dict(headers)
    h.update(_JSON_HEADERS)
    url = f"{base_url}/communication_messages"
    params = {"id": f"eq.{msg_id}"}
    resp = requests.patch(url, headers=h, params=params, json=patch, timeout=15)
    if not resp.ok:
        logger.error("COMM_MSG_PATCH_FAIL id=%s status=%s body=%s", msg_id, resp.status_code, resp.text[:200])


def _get_thread(base_url: str, headers: Dict[str, str], thread_id: str) -> Optional[Dict[str, Any]]:
    url = f"{base_url}/communication_threads"
    params = {"id": f"eq.{thread_id}", "select": "*", "limit": "1"}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if not r.ok:
            return None
        rows = r.json()
        if isinstance(rows, list) and rows:
            return rows[0]
    except Exception:
        return None
    return None


def _resolve_outbound_email_subject(row: Dict[str, Any], cfg: Dict[str, Any], entity_type_raw: Any) -> str:
    """Prefer persisted message subject, then binding config default, then entity-based defaults."""
    col = str(row.get("subject") or "").strip()
    if col:
        return col
    bind_sub = str(cfg.get("subject") or "").strip()
    if bind_sub:
        return bind_sub
    et = str(entity_type_raw or "").strip().lower()
    if et == "opportunities":
        return "Update regarding your inquiry"
    if et == "jobs":
        return "Update regarding your service"
    return "Message from Alloy"


def process_communication_messages(
    limit: int = 25,
    workflow_run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Dequeue communication_messages outbound queued; SMS + email."""
    base_url = _get_base_url()
    headers = _get_headers()
    # Picks up queued rows AND deferred rows whose next-attempt time has passed.
    # A policy-deferred message is preserved for later dispatch rather than
    # failed, and it is not re-evaluated before its deterministic next attempt —
    # so a quiet-hours hold cannot become an endless re-block loop.
    now_cutoff = datetime.now(timezone.utc).isoformat()
    params: Dict[str, str] = {
        "direction": "eq.outbound",
        "status": "in.(queued,deferred)",
        "or": f"(deferred_until.is.null,deferred_until.lte.{now_cutoff})",
        "order": "created_at.asc",
        "limit": str(max(1, min(limit, 50))),
        "select": "*",
    }
    wr = (workflow_run_id or "").strip()
    if wr and len(wr) == 36:
        params["workflow_run_id"] = f"eq.{wr}"

    url = f"{base_url}/communication_messages"
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        rows: List[Dict[str, Any]] = resp.json()
    except Exception as e:
        logger.exception("COMM_MSG_QUERY_FAIL %s", e)
        return {"processed": 0, "sent": 0, "failed": 0, "message_ids": [], "errors": [str(e)[:ERROR_TRUNCATE]]}

    if not rows:
        return {"processed": 0, "sent": 0, "failed": 0, "message_ids": [], "errors": []}

    sent = failed = 0
    # Policy outcomes are counted separately from provider failures so a caller
    # can distinguish "we refused to send" from "the provider rejected it".
    policy_stopped = 0
    mids: List[str] = []
    errors: List[str] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for row in rows:
        msg_id = row.get("id")
        org_id = str(row.get("org_id") or "")
        thread_id = str(row.get("thread_id") or "")
        channel = (row.get("channel") or "").strip().lower()
        body = (row.get("body") or "").strip()
        to_addr = (row.get("to_address") or "").strip()

        md = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        location_id = md.get("context_location_id")
        location_id_str = str(location_id).strip() if location_id else None

        if not msg_id or not org_id or not thread_id:
            logger.warning("COMM_MSG_SKIP bad row ids")
            continue

        thr = _get_thread(base_url, headers, thread_id)
        entity_type = (thr or {}).get("primary_entity_type") or "communications_unknown"

        # ---- DISPATCH-TIME POLICY REVALIDATION -------------------------------
        # The final boundary before a provider call. Re-runs only the checks
        # whose inputs can change between enqueue and now, and fails closed on a
        # missing or malformed snapshot — which is how rows inserted by raw SQL
        # or seed scripts are caught.
        #
        # A policy outcome is NOT a provider failure: `blocked` and `deferred`
        # are distinct lifecycle states so an operator can tell "we refused to
        # send" from "the provider rejected it".
        decision = revalidate_for_dispatch(row)
        if decision.outcome != "send_now":
            patch: Dict[str, Any] = {"eligibility_decision": decision.to_audit()}
            if decision.outcome == "defer_until" and decision.defer_until:
                patch["status"] = "deferred"
                patch["deferred_until"] = decision.defer_until.isoformat()
            else:
                patch["status"] = "blocked"
                patch["error"] = f"policy:{decision.reason}"[:ERROR_TRUNCATE]

            _patch_comm_message(base_url, headers, str(msg_id), patch)
            policy_stopped += 1
            mids.append(str(msg_id))
            logger.info(
                "COMM_MSG_POLICY id=%s outcome=%s reason=%s",
                str(msg_id)[-8:],
                decision.outcome,
                decision.reason,
            )
            emit_for_communication_message(
                org_id=org_id,
                thread=thr,
                event_type="message_blocked" if decision.outcome == "blocked" else "message_deferred",
                message_id=str(msg_id),
                thread_id=thread_id,
                channel=channel,
                direction="outbound",
                body_text=None,
                extra=decision.to_audit(),
            )
            continue

        entity_id = str((thr or {}).get("primary_entity_id") or "")
        if not entity_id:
            err = "thread missing entity_id"
            _patch_comm_message(
                base_url,
                headers,
                str(msg_id),
                {"status": "failed", "error": err[:ERROR_TRUNCATE]},
            )
            failed += 1
            mids.append(str(msg_id))
            errors.append(err)
            emit_for_communication_message(
                org_id=org_id,
                thread=thr,
                event_type="message_failed",
                message_id=str(msg_id),
                thread_id=thread_id,
                channel=channel,
                direction="outbound",
                body_text=body,
                extra={"reason": err},
            )
            continue

        binding: Optional[Dict[str, Any]] = None
        persisted_identity_id = row.get("communication_identity_id")
        # Phase 2: prefer persisted canonical identity (TypeScript-resolved at enqueue).
        if persisted_identity_id and channel in ("sms", "email"):
            binding = resolve_persisted_outbound_identity(base_url, headers, row)
            if binding is None:
                err = "canonical communication identity invalid or unavailable at send time"
                logger.warning(
                    "COMM_MSG_CANONICAL_IDENTITY_INVALID id=%s identity_id=%s",
                    msg_id,
                    persisted_identity_id,
                )
                _patch_comm_message(
                    base_url,
                    headers,
                    str(msg_id),
                    {"status": "failed", "error": err[:ERROR_TRUNCATE]},
                )
                failed += 1
                mids.append(str(msg_id))
                errors.append(err)
                emit_for_communication_message(
                    org_id=org_id,
                    thread=thr,
                    event_type="message_failed",
                    message_id=str(msg_id),
                    thread_id=thread_id,
                    channel=channel or "sms",
                    direction="outbound",
                    body_text=body,
                    extra={"reason": err, "canonical_identity_invalid": True},
                )
                continue
        elif not persisted_identity_id:
            bound_on_row = row.get("communication_provider_binding_id")
            if bound_on_row and channel in ("sms", "email"):
                cand = find_binding_by_id(base_url, headers, str(bound_on_row))
                if cand and str(cand.get("org_id") or "") == org_id and (
                    str(cand.get("channel") or "").strip().lower() == channel
                ):
                    binding = cand
            if binding is None:
                binding = resolve_outbound_binding(
                    base_url,
                    headers,
                    org_id=org_id,
                    channel=channel if channel in ("sms", "email") else "sms",
                    location_id=location_id_str,
                )
                if binding is not None:
                    logger.info(
                        "COMM_MSG_LEGACY_COMPAT_RESOLUTION id=%s channel=%s",
                        msg_id,
                        channel,
                    )

        bound_id = str(binding.get("id")) if isinstance(binding, dict) and binding.get("id") else None
        cfg = binding.get("config") if isinstance(binding, dict) and isinstance(binding.get("config"), dict) else {}
        sms_status_callback = build_sms_status_callback_url(PUBLIC_TWILIO_STATUS_CALLBACK_BASE, bound_id)

        try:
            if channel == "sms":
                if not to_addr:
                    raise ValueError("missing to_address for SMS")
                sid_result: Dict[str, Any]
                secret_ref = (binding.get("secret_ref") or "unconfigured") if binding else "unconfigured"
                if binding and is_legacy_global_twilio_binding(secret_ref):
                    sid_result = send_sms(to_addr, body, status_callback=sms_status_callback)
                elif binding:
                    sid_val = str(cfg.get("twilio_account_sid") or "").strip()
                    svc_sid = str(cfg.get("messaging_service_sid") or "").strip()
                    token_plain = resolve_secret_plaintext(secret_ref)
                    if not sid_val or not svc_sid or not token_plain:
                        raise RuntimeError(
                            "SMS binding incompletely configured — need twilio_account_sid,"
                            " messaging_service_sid in config + env:* secret_ref for auth_token"
                        )
                    sid_result = send_sms_with_credentials(
                        to_addr,
                        body,
                        account_sid=sid_val,
                        auth_token=token_plain,
                        messaging_service_sid=svc_sid,
                        status_callback=sms_status_callback,
                    )
                else:
                    raise RuntimeError("no SMS provider binding")

                sms_sid = sid_result.get("sid", "")
                _patch_comm_message(
                    base_url,
                    headers,
                    str(msg_id),
                    {
                        "status": "sent",
                        "sent_at": now_iso,
                        "provider": "twilio",
                        "provider_message_id": sms_sid or None,
                        "error": None,
                        "communication_provider_binding_id": bound_id,
                        "communication_identity_id": binding.get("communication_identity_id") if isinstance(binding, dict) else row.get("communication_identity_id"),
                        "communication_provider_account_id": binding.get("communication_provider_account_id") if isinstance(binding, dict) else row.get("communication_provider_account_id"),
                    },
                )
                sent += 1
                mids.append(str(msg_id))
                emit_for_communication_message(
                    org_id=org_id,
                    thread=thr,
                    event_type="message_sent",
                    message_id=str(msg_id),
                    thread_id=thread_id,
                    channel="sms",
                    direction="outbound",
                    body_text=body,
                    extra={"provider_message_id": sms_sid or None},
                )
                emit_for_communication_message(
                    org_id=org_id,
                    thread=thr,
                    event_type="message_delivered",
                    message_id=str(msg_id),
                    thread_id=thread_id,
                    channel="sms",
                    direction="outbound",
                    body_text=body,
                    extra={"note": "optimistic-after-send"},
                )
            elif channel == "email":
                if not to_addr:
                    raise ValueError("missing to_address for email")
                if not binding or (binding.get("provider") or "").lower() != "resend":
                    raise RuntimeError("email requires active resend binding")

                api_key_ref = binding.get("secret_ref") or "env:RESEND_API_KEY"
                api_key_plain = resolve_secret_plaintext(api_key_ref)
                if not api_key_plain:
                    api_key_plain = resolve_secret_plaintext("env:RESEND_API_KEY")
                if not api_key_plain:
                    raise RuntimeError("RESEND_API_KEY not configured")

                subject = _resolve_outbound_email_subject(row, cfg, entity_type)
                from_email_cfg = str(cfg.get("from_email") or "").strip()
                from_email = from_email_cfg or default_from_email()
                # Correlation evidence Alloy authors itself, derived from this
                # message's own id — so a reply's `In-Reply-To` resolves to the exact
                # outbound message, and through it to the thread, by primary key.
                # None when the id or sending domain cannot support one, in which
                # case the send proceeds without a header rather than with a
                # meaningless one.
                outbound_message_id = mint_outbound_message_id(
                    communication_message_id=str(msg_id),
                    from_email=from_email,
                )
                # Threading derived from canonical conversation history, org-scoped.
                # A first outbound legitimately carries no In-Reply-To.
                thread_headers = fetch_thread_email_headers(
                    base_url,
                    headers,
                    org_id=str(row.get("org_id") or ""),
                    thread_id=str(row.get("thread_id") or ""),
                )
                html_body = _resolve_outbound_email_html(row, cfg, body)
                # Prefer snapshot text when it retains destinations the body column lost.
                text_for_provider = body
                snap_text = _text_from_rendered_snapshot(row)
                if snap_text and (("http://" in snap_text or "https://" in snap_text) and "http://" not in body and "https://" not in body):
                    text_for_provider = snap_text
                attachments = None
                meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
                cal = meta.get("calendar_invite") if isinstance(meta, dict) else None
                if isinstance(cal, dict):
                    filename = str(cal.get("filename") or "").strip() or "invite.ics"
                    content_b64 = str(cal.get("content_base64") or cal.get("content") or "").strip()
                    ctype = str(cal.get("content_type") or "text/calendar").strip()
                    if content_b64:
                        attachments = [
                            {
                                "filename": filename,
                                "content": content_b64,
                                "content_type": ctype,
                            }
                        ]
                res = send_resend_email(
                    to_email=to_addr,
                    subject=subject,
                    html_body=html_body,
                    text_body=text_for_provider,
                    from_email=from_email,
                    api_key=api_key_plain,
                    message_id=outbound_message_id,
                    extra_headers=outbound_email_headers(
                        message_id=None,
                        in_reply_to=thread_headers.get("in_reply_to"),
                        references=thread_headers.get("references"),
                    ),
                    attachments=attachments,
                )
                rid = res.get("id", "")
                _patch_comm_message(
                    base_url,
                    headers,
                    str(msg_id),
                    {
                        "status": "sent",
                        "sent_at": now_iso,
                        "provider": "resend",
                        "provider_message_id": rid or None,
                        "error": None,
                        "communication_provider_binding_id": bound_id,
                        "from_address": from_email.strip() or None,
                        # Recorded because the NEXT reply builds its References
                        # from canonical history — an unrecorded header would
                        # silently break the chain one turn later.
                        "email_message_id": outbound_message_id,
                        "email_in_reply_to": thread_headers.get("in_reply_to"),
                        "email_references": thread_headers.get("references"),
                    },
                )
                logger.info(
                    "COMM_MSG_EMAIL_RESEND_OK comm_msg_id=%s provider_id_tail=%s from=%s to_tail=%s",
                    msg_id,
                    _tail_str(str(rid or "")),
                    _from_email_for_log(from_email),
                    _to_address_tail_for_log(to_addr),
                )
                sent += 1
                mids.append(str(msg_id))
                emit_for_communication_message(
                    org_id=org_id,
                    thread=thr,
                    event_type="message_sent",
                    message_id=str(msg_id),
                    thread_id=thread_id,
                    channel="email",
                    direction="outbound",
                    body_text=body,
                    extra={"provider_message_id": rid or None},
                )
            elif channel == "in_app":
                _patch_comm_message(
                    base_url,
                    headers,
                    str(msg_id),
                    {"status": "sent", "sent_at": now_iso, "provider": None, "error": None},
                )
                sent += 1
                mids.append(str(msg_id))
                emit_for_communication_message(
                    org_id=org_id,
                    thread=thr,
                    event_type="message_sent",
                    message_id=str(msg_id),
                    thread_id=thread_id,
                    channel="in_app",
                    direction="outbound",
                    body_text=body,
                    extra={"note": "in_app-internal"},
                )
            else:
                raise ValueError(f"unsupported channel {channel}")

        except Exception as e:
            err_msg = str(e)[:ERROR_TRUNCATE]
            logger.warning("COMM_MSG_SEND_FAIL id=%s err=%s", msg_id, err_msg)
            _patch_comm_message(
                base_url,
                headers,
                str(msg_id),
                {"status": "failed", "error": err_msg, "communication_provider_binding_id": bound_id},
            )
            failed += 1
            mids.append(str(msg_id))
            errors.append(err_msg)
            emit_for_communication_message(
                org_id=org_id,
                thread=thr,
                event_type="message_failed",
                message_id=str(msg_id),
                thread_id=thread_id,
                channel=channel or "sms",
                direction="outbound",
                body_text=body,
                extra={"error": err_msg},
            )

    return {
        "processed": len(rows),
        "sent": sent,
        "failed": failed,
        # Reported separately from `failed`: a policy stop is not a provider
        # failure, and collapsing them would make a compliance block look like
        # an outage (and vice versa).
        "policy_stopped": policy_stopped,
        "message_ids": mids,
        "errors": errors,
    }
