"""
RFC threading headers on an Alloy reply.

An operator's reply must look like a reply in the PARENT'S mail client, not only
inside Alloy. That requires three headers, and the server owns all of them — the
UI never constructs one, because a client-supplied threading header would be an
unverified claim about which conversation a message belongs to.

    Message-ID   minted from the outbound message's own id (email_message_id.py)
    In-Reply-To  the RFC Message-ID of the most recent inbound message we hold
    References   the conversation chain, extended rather than replaced

`References` is what mail clients actually use to group a thread, and it must
GROW: replacing it would split a long conversation in the parent's client even
though Alloy still sees one thread. It is capped, keeping the oldest and the most
recent entries, which is the conventional handling for a chain that would
otherwise grow without bound.

Only Message-IDs Alloy actually has are used. Nothing is fabricated for a
conversation with no inbound history — a first outbound simply carries no
In-Reply-To, which is correct.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("alloy-dispatcher")

#: Beyond this, clients gain nothing and headers get unwieldy. Ends are kept
#: because the root and the immediate ancestor are what threading relies on.
MAX_REFERENCES = 20


def build_references_chain(prior_message_ids: List[str], in_reply_to: Optional[str]) -> Optional[str]:
    """
    The `References` value for a reply, oldest first.

    Deduplicated while preserving order, and the message being answered is last —
    mail clients read the final entry as the immediate parent.
    """
    chain: List[str] = []
    for mid in prior_message_ids:
        m = (mid or "").strip()
        if m and m not in chain:
            chain.append(m)
    if in_reply_to and in_reply_to not in chain:
        chain.append(in_reply_to)
    if not chain:
        return None
    if len(chain) > MAX_REFERENCES:
        keep_head = MAX_REFERENCES // 2
        chain = chain[:keep_head] + chain[-(MAX_REFERENCES - keep_head):]
    return " ".join(chain)


def fetch_thread_email_headers(
    base_url: str,
    headers: Dict[str, str],
    *,
    org_id: str,
    thread_id: str,
) -> Dict[str, Optional[str]]:
    """
    Derive In-Reply-To and References from canonical conversation history.

    Org-scoped, like every other canonical lookup: a thread id alone never reaches
    across a tenant boundary.

    Failure is not fatal. Threading is a quality of the reply, not a
    precondition for it — losing a header degrades the parent's client grouping,
    while refusing to send loses the reply entirely.
    """
    empty: Dict[str, Optional[str]] = {"in_reply_to": None, "references": None}
    try:
        resp = requests.get(
            f"{base_url}/communication_messages",
            headers=headers,
            params={
                "org_id": f"eq.{org_id}",
                "thread_id": f"eq.{thread_id}",
                "channel": "eq.email",
                "email_message_id": "not.is.null",
                "select": "email_message_id,direction,created_at",
                "order": "created_at.asc",
                "limit": "100",
            },
            timeout=15,
        )
        if not resp.ok:
            return empty
        rows = resp.json()
        if not isinstance(rows, list):
            return empty
    except Exception as e:  # noqa: BLE001
        logger.warning("email_thread_headers: lookup failed %s", e)
        return empty

    prior: List[str] = []
    latest_inbound: Optional[str] = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        mid = str(row.get("email_message_id") or "").strip()
        if not mid:
            continue
        prior.append(mid)
        # The message being answered is the most recent one the PARENT sent.
        # Replying to our own last outbound would tell their client this is a
        # reply to ourselves.
        if str(row.get("direction") or "").strip().lower() == "inbound":
            latest_inbound = mid

    return {
        "in_reply_to": latest_inbound,
        "references": build_references_chain(prior, latest_inbound),
    }


def outbound_email_headers(
    *,
    message_id: Optional[str],
    in_reply_to: Optional[str],
    references: Optional[str],
) -> Dict[str, Any]:
    """Assemble the header map for the provider, omitting anything absent."""
    out: Dict[str, Any] = {}
    if message_id:
        out["Message-ID"] = message_id
    if in_reply_to:
        out["In-Reply-To"] = in_reply_to
    if references:
        out["References"] = references
    return out
