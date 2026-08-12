---
owner: platform
status: decided
last_reviewed: 2026-08-12
---

# SMS inbound provenance — how far back may it reach?

**Decision made, not deferred.** A truthful boundary now exists and is applied;
one residual is recorded explicitly rather than left as an unexamined TODO.

## The problem

Email carries RFC threading headers, so an inbound reply names the message it
answers. **SMS carries no equivalent.** Provenance is therefore:

    sender + receiving destination  ->  most recent compatible conversation

The earlier audit flagged the open end of "most recent": with no closure or
recency authority, a years-old outbound thread could capture an unrelated new
inbound message from the same number.

## What changed since that audit

Two canonical facts now exist that did not before:

1. **Location is canonical conversation truth** (`communication_threads.location_id`,
   part of thread identity). A parent who texts Riverside and Lakeside has two
   conversations, and provenance is scoped to the location the receiving number
   belongs to. Cross-location capture is already impossible.
2. **`communication_threads.archived_at`** — a lifecycle fact the platform
   already records. An archived conversation is one an operator explicitly closed.

## The boundary now applied

    same receiving destination
      AND same location            (already enforced)
      AND NOT archived             (added)
      -> most recent such conversation

`backend/app/services/communication_inbound.py :: _find_canonical_sms_thread`.

**No time constant was invented.** The instruction was explicit and it is also
simply correct: "30 days" or "90 days" would be a number with no authority behind
it, and it would be wrong for any school whose relationship with a family is
seasonal. Archive state is an operator's own statement that a conversation is
finished, which is exactly the kind of evidence a boundary should rest on.

## Residual, stated plainly

**An OPEN, never-archived conversation still has unbounded reach.** If a family
texted a location's number two years ago, the conversation was never archived, and
they text again today, the new message joins that conversation.

Whether that is wrong is genuinely unclear — for a school and a family it is
arguably right, since it IS the same relationship on the same number. What is
missing is not a timeout but a **conversation-lifecycle authority**: a durable
"this conversation is concluded" state that something other than manual archiving
produces (subject moved on, enrollment ended, no activity across a defined
operational boundary).

**This is an accepted limitation**, not a defect, and not an engineering TODO
inside Communications. It becomes actionable when a conversation-lifecycle
authority exists — a Conversation Platform decision, recorded here so it is not
rediscovered from scratch.

## What was deliberately NOT done

- No time-based expiry constant.
- No "recency" heuristic based on message counts or gaps.
- No new column to mark conversations stale — that would be inventing the very
  lifecycle authority this notes is missing, without the product decision behind
  it.
