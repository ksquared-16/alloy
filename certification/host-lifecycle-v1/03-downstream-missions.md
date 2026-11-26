# Queued downstream missions — recorded so they survive session and toolkit turnover

These are **not** part of Host Lifecycle V1. They are the agreed next work, in order, and they are
written down here because a session or toolkit turnover must not lose them.

## NEXT 1 — Director approval / governed-action friction, and approval interaction reliability

Routine operations are being approved essentially every time — QA session/identity operations,
migrations, merges, pull/promotion, census, other routine governed infrastructure — so the prompt is
not functioning as a decision point. Two distinct problems: the approval is often unnecessary human
work, **and** the approval UI is unreliable enough that the same button gets clicked repeatedly with
no feedback about whether it registered.

This is an audit, **not** a blanket removal of governance.

1. Inventory every approval-gated action class and its actual risk boundary.
2. Sort each into: genuinely destructive/security-sensitive (stays explicit); safe under an existing
   standing authorization; safe to auto-execute when deterministic eligibility is satisfied; or
   historical friction that no longer represents a decision.
3. Prefer autonomous execution where the operation is inside an established authorization boundary,
   preconditions are deterministic, refusal/rollback is safe, and audit stays complete.
4. Do **not** remove safeguards from consequential operations merely because approval frequency is high.
5. Fix the interaction itself: one click has deterministic acknowledgement; duplicate submits are
   disabled/debounced immediately; approving → accepted → executing → refused → complete is visible;
   repeated clicks are idempotent; no silent button; server response, persisted governed-action state
   and UI state converge.
6. Measure how many prompts disappear through standing authorization, deterministic preflight, safe
   autonomous execution, batching, or policy configuration.

Target: **fewer meaningful interruptions**, not fewer safeguards.

## NEXT 2 — message send / browser acknowledgement latency

A sent message can sit in the composer for seconds, reading as a failed send — the same trust
problem as the approval buttons.

Audit the whole submit lifecycle: operator presses Send → client accepts intent → composer state →
dispatch → server acknowledgement → durable creation → UI projection → worker/run delivery.

Contract: intent acknowledged immediately; text leaves the editable composer once accepted locally;
an optimistic/pending message renders; the control is idempotent and debounced; sending / accepted /
delivered / failed are visible; slow server or worker work never looks like a dead button; failure
preserves the message without duplicate submission; duplicate clicks cannot create duplicate requests.

Determine whether the delay is client rendering, waiting on the server before committing UI,
synchronous control-plane work blocking the Gateway, SSE projection latency, or persistence latency.

**Measure again after Host Lifecycle C first.** C removed ~1 second of event-loop block every 10
seconds; if Gateway stalls were contributing, this may already be materially better. Do not assume
they are unrelated, and do not build a separate fix before re-measuring.

## NEXT 3 — Thread 5 Gate 2 certification-auth unblock

After re-observing the running Gateway/toolkit state:

- keep slot 8 serving `alloy-cert`;
- retarget the slot-8 QA session mint from the hosted env source to `.env.certification.local`;
- use the existing governed QA identity/session flow — no second auth mechanism, no hand-made cookies;
- prove certification-project cookie/session identity;
- prove authenticated navigation against `alloy-cert`;
- resume Gate 2 at Step 5 and run Steps 5–8 in one pass against exact candidate
  `9e4f57c1994de54f54e68b6a9af4d21be2c459d9`.

The previous blocked walkthrough counts as **zero** mounted coverage. Do not promote Thread 5 until
mounted Gate 2 passes.

Carried state: **G-14 CLOSED**; **G5 CARRIED_FORWARD**; **Classroom Coach / D-1
BLOCKED_ON_PROVIDER_CONTRACT**.

This work must not disturb the Host Lifecycle soak, and must not cause a restart that loses slot 8's
`alloy-cert` target.
