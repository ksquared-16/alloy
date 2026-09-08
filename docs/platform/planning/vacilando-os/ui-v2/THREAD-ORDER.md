---
owner: platform
status: sprint
last_reviewed: 2026-09-04
---

# The Lane thread is a conversation, and the newest thing is at the bottom

## Canonical order

```
OLDEST
  USER message
  PROVIDER response
  SYSTEM event
  USER message
  PROVIDER response
  ...
  CURRENT / NEWEST PROVIDER OUTPUT
  Needs You tray (only if applicable)
  COMPOSER
NEWEST
```

## The reported symptom, and why it was not the renderer

The current provider output appeared at the **top** of the thread, above the
operator's own message. `renderThread` was never at fault — it has always
emitted entries in array order. Two defects in `buildLaneThread` produced it.

**1. Unknown timestamps sorted to zero.**

```js
entries.sort((a, b) => (a.at_ms || 0) - (b.at_ms || 0));
```

`(a.at_ms || 0)` maps every absent time to `0`, i.e. above everything. A
governed outcome recorded without a timestamp opened the conversation with its
own ending. Insertion order is already chronological by construction, so an
unknown time now inherits the last known one and holds its place.

**2. The answer outranked the question.**

The provider entry is stamped `run.updated_at`; a freshly delivered instruction
carries a later `delivered_at`. Pure chronology therefore sorted an in-progress
answer *above* the instruction that had just prompted it.

The current provider output is not merely the newest entry — it is the live
edge of the conversation, and it belongs against the interaction boundary where
the operator is about to reply. That is a stronger claim than "wherever its
timestamp falls", so it is pinned last. Historical provider messages are never
pinned; finished history is never reordered.

## The previous exchange was being thrown away

`previous_run` was consulted only as a fallback — `execution_run ||
previous_run` — so a lane carrying both showed a single turn no matter how much
had happened. It now contributes its own USER instruction and PROVIDER reply,
in the order they occurred.

## Recent Output is a projection, not a surface

Inside the Lane, the thread is authoritative. Recent Output remains the
reference to the newest eligible provider thread message and is used by Home
summaries, Lanes previews, notifications and run metadata. There is no
top-of-thread content block: `buildCurrentWork` was still being computed in the
lane view and discarded — the last trace of the card that used to print the
provider's latest output above the conversation — and that call is gone.
`renderCurrentWork` and `renderLaneCurrentWork` remain exported for suites that
still exercise them, but nothing in the Lane mounts them.

## Provider states

`CLAUDE · Working` while mid-utterance, `CLAUDE · Complete` when the turn has
finalized. Only the live edge claims a state; history is simply what was said.

## Scroll

Already correct and left alone: a lane opens on the latest exchange, a poll
never moves the page under someone reading, a genuine change while scrolled up
raises `New update ↓`, and tapping it returns to the latest. Identical on mobile
and desktop — there is one implementation, not two.

## KNOWN GAP — there is no multi-turn history to render

**OBSERVED.** The execution-run store retains **one run per lane** (3 runs
across the whole fleet at time of writing, none carrying a provider report), and
the lane projection exposes `last_instruction` singular. So a lane can express
at most the previous exchange plus the current one.

The ordering contract above is correct and tested against a full
USER/PROVIDER/USER/SYSTEM/PROVIDER thread, but that thread is constructed in the
suite. **Live lanes cannot show a long conversation today because the history
does not exist**, not because the thread refuses to render it. Persisting turn
history is a separate, larger piece of work and is not attempted here.

## Duplicate system events

`recent_system_activity` was observed emitting the identical summary twice at an
identical timestamp ("Claude context refreshed automatically."), from a feed
with more than one observer. Identical summary *and* identical timestamp now
collapse to one line. The same event at a different time is still two events.
