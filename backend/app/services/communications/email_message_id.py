"""
The RFC 5322 Message-ID Alloy puts on an outbound email, and reads back off a reply.

WHY THIS EXISTS
The preferred way to thread an email reply is `In-Reply-To` naming the exact
outbound message it answers. That is stronger evidence than sender+destination
and far stronger than subject text, which is not authority at all.

Alloy could not use it. Outbound email sent no `Message-ID` header, and the id it
stored (`provider_message_id`) is Resend's internal email id — not the RFC
Message-ID a parent's mail client echoes. So there was nothing for an inbound
`In-Reply-To` to match, and no inbound provider could have changed that: the gap
was on the SENDING side.

THE DESIGN
The Message-ID is minted FROM the canonical message's own id:

    <alloy.{communication_message_id}@{sending domain}>

so correlation is a primary-key lookup rather than a second identifier to store,
keep in sync and index. A reply's `In-Reply-To` yields the exact outbound message,
and that message already knows its thread, org and recipient.

Deliberately provider-independent. Whichever provider Alloy eventually uses to
RECEIVE mail, the correlation evidence is something Alloy itself authored.

PARSING IS UNTRUSTED
Inbound headers are attacker-controlled. Parsing only ever yields a UUID that is
then looked up scoped to the receiving organization — a forged header can name a
message id, exactly as a forged one could name any other id, and the lookup is
what decides whether it belongs to the tenant.
"""

from __future__ import annotations

import re
from typing import List, Optional
from uuid import UUID

#: Local-part prefix marking a Message-ID as one Alloy minted.
ALLOY_LOCAL_PREFIX = "alloy."

_MESSAGE_ID_RE = re.compile(r"<([^<>@\s]+)@([^<>@\s]+)>")
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def domain_of(email_address: str) -> Optional[str]:
    """Domain half of an address, or None when there isn't one."""
    at = (email_address or "").rfind("@")
    if at < 0:
        return None
    domain = email_address[at + 1 :].strip().strip(">").lower()
    return domain or None


def mint_outbound_message_id(*, communication_message_id: str, from_email: str) -> Optional[str]:
    """
    The `Message-ID` header for an outbound email, or None when it cannot be minted.

    Returns None rather than inventing a value: a malformed id or a from-address
    with no domain would produce a header that looks authoritative and correlates
    to nothing, which is worse than sending without one.
    """
    mid = (communication_message_id or "").strip()
    if not _UUID_RE.match(mid):
        return None
    domain = domain_of(from_email or "")
    if not domain:
        return None
    return f"<{ALLOY_LOCAL_PREFIX}{mid.lower()}@{domain}>"


def parse_alloy_message_id(raw: Optional[str]) -> Optional[str]:
    """
    The canonical message id inside an Alloy-minted Message-ID, or None.

    Anything that is not ours — another system's id, a malformed header, a
    plausible-looking forgery with the wrong shape — yields None, so a caller
    cannot accidentally treat a foreign identifier as a lookup key.
    """
    if not raw or not isinstance(raw, str):
        return None
    match = _MESSAGE_ID_RE.search(raw.strip())
    if not match:
        return None
    local = match.group(1)
    if not local.lower().startswith(ALLOY_LOCAL_PREFIX):
        return None
    candidate = local[len(ALLOY_LOCAL_PREFIX) :]
    if not _UUID_RE.match(candidate):
        return None
    try:
        return str(UUID(candidate))
    except ValueError:
        return None


def parse_reference_message_ids(raw: Optional[str]) -> List[str]:
    """
    Every Alloy-minted canonical message id in a `References` header, in order.

    `References` is the whole conversation chain, oldest first, so the LAST Alloy
    id is the most recent message of ours the reply descends from. Callers that
    fall back from `In-Reply-To` should prefer that one; the order is preserved
    here rather than decided here.

    Foreign ids in the chain are skipped rather than failing the parse — a thread
    that passed through another system is still ours to correlate.
    """
    if not raw or not isinstance(raw, str):
        return []
    out: List[str] = []
    for match in _MESSAGE_ID_RE.finditer(raw):
        parsed = parse_alloy_message_id(f"<{match.group(1)}@{match.group(2)}>")
        if parsed and parsed not in out:
            out.append(parsed)
    return out


def correlation_candidates(
    *, in_reply_to: Optional[str], references: Optional[str]
) -> List[str]:
    """
    Canonical message ids a reply points at, strongest evidence first.

    `In-Reply-To` names the single message being answered and is authoritative.
    `References` is the chain; its most recent Alloy entry is the next best thing.
    Neither is subject text, and no sender-based guess appears here — that is a
    weaker fallback and belongs to the caller, after these have been exhausted.
    """
    ordered: List[str] = []
    direct = parse_alloy_message_id(in_reply_to)
    if direct:
        ordered.append(direct)
    for ref in reversed(parse_reference_message_ids(references)):
        if ref not in ordered:
            ordered.append(ref)
    return ordered
