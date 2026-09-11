# Work Items H2 — the safe Communications certification scenario

**Status:** available and certified through Communications, 2026-09-11.
**Certified on:** the local certification tenant (`northwind-early-learning`), 8/8.
**Evidence:** `certification/evidence/communications-work-items-h2-8of8.log` — produced by the
run, not committed (`certification/evidence/` is ignored). Reproduce it with the Run command
below; the per-test screenshots, video and trace land beside it.

Work Items H2 was blocked because there was no Communications certification scenario it
was allowed to use. There is one now.

---

## What to use

| | |
|---|---|
| Scenario harness | `certification/playwright/communicationsNeedsReplyScenario.ts` |
| Communications-side certification | `certification/playwright/communications-work-items-needs-reply.cert.spec.ts` |
| Run | `certification/alloy-certify verify` (or the single spec through the cert config) |

```ts
import { armNeedsReply, resolveThroughTriage } from "./communicationsNeedsReplyScenario";

const scenario = await armNeedsReply(page);
// scenario.threadId   — the canonical Communications thread
// scenario.workItemId — `communications:<threadId>`, the id Work Items projects
// scenario.marker     — unique to this arming; exists on no other thread in the tenant
...
await resolveThroughTriage(page, scenario.threadId);   // deterministic cleanup
```

---

## How it produces actionable state

`armNeedsReply` delivers one `email.received` event to `ingestResendInboundEmail` through
the certification harness route. Ownership, admission, correlation, identity, persistence,
the receive event and the attention write are all production code. **The scenario never
writes `attention_state`.** Step 7 of ingestion writes `needs_response`; the operator triage
route writes `resolved`. Nothing else in the path touches the column.

That is the difference that matters. The retired fixture fed the projection a value it had
written itself, so a run stayed green whether or not the runtime still produced actionable
state. This one fails if the runtime stops.

## Why nothing reaches a person

Four independent reasons, so no single mistake is load-bearing:

- **Identity** — `qa+guardian7@example.invalid`, seeded by
  `supabase/seed/local_representative_seed.sql`, on the RFC 2606 reserved `.invalid` TLD.
  Guardian 1 is deliberately left to `communications-inbound-email.cert.spec.ts`.
- **Receiving identity** — `hello@northwind-cert.invalid`, declared as certification
  ENVIRONMENT by `certification/inbound-sms-binding.sql`.
- **Credential** — the tenant's Resend binding holds `certification_synthetic_email`, which
  resolves to no secret. Under `ALLOY_CERTIFICATION=1` there is no code path to
  api.resend.com (`resendConnection.ts`).
- **Direction** — inbound ingestion transmits nothing. The only outbound is the operator
  reply, addressed to the `.invalid` sender above.

## Requirements, and where each is met

| Requirement | Where |
|---|---|
| Explicitly synthetic QA Person/Household | seeded guardian 7 / "Test Family 0007" |
| Canonical thread through supported paths | `ingestResendInboundEmail` |
| Legitimate `needs_response` from the authority | ingestion step 7 |
| Never repurpose a real thread | the scenario creates the conversation it ends |
| Never direct-write `attention_state` | triage route only |
| Never create an `operational_tasks` row | certified, H2-3 |
| Clearly marked certification data | `ALLOY-CERT-WI-H2-<hex>` in every body |
| Idempotent / deterministic cleanup | both — see below |
| Outbound only to a sanctioned sink | `.invalid` + a credential that cannot authenticate |
| Same runtime Work Items observes | `communication_threads` / `communication_messages` |

**Repeatability.** Every arming carries a new provider message id, so exactly-once never
suppresses it, and correlation binds them all to ONE thread — repeated runs re-arm the same
conversation rather than littering the queue. `cleanupScenario` leaves it `resolved` through
the operator route. Certified directly by H2-2.

---

## What the certification establishes

| | |
|---|---|
| H2-1 | the runtime, not the fixture, produces `needs_response` |
| H2-2 | re-arming is repeatable and stays one conversation |
| H2-3 | the Work Items row is virtual — no `operational_tasks` row is created |
| H2-4 | reading the message clears unread and leaves the actionable state standing |
| H2-5 | a resolved conversation is not actionable even while it is unread |
| H2-6 | the scenario projects into Work Items and converges when resolved |
| H2-7 | Open Conversation reaches the exact thread, and the reply lands on it |

H2-4 and H2-5 are the two halves of **Unread ≠ Needs Reply**: work does not disappear
because somebody looked at it, and an unread conversation that is resolved is correctly not
work.

---

## Three things Work Items H2 needs to know before writing its own convergence proof

These were each established against the running product, not read off the source.

**1. The projected row is UNASSIGNED, so it is not in "Mine".**
A conversation carries the Communications assignee, and an inbound message from a family is
assigned to nobody — so `filterTasksByView` correctly excludes it from the default Mine
view. The row appears under **Unassigned** (`[data-work-items-view="unassigned"]`) and is
counted by the **Communications** source facet. A convergence test written against the
default view will report the projection broken when the truthful answer is that nobody owns
the work yet.

**2. Replying does NOT clear `attention_state`. Resolving does.**
`canonicalSend` never touches the column — no send path does. The conversation leaves the
Work Items queue when an operator marks it **Resolved** (the triage route). A convergence
certification that expects the reply alone to converge would be certifying behaviour this
platform does not have. H2-7 asserts the state is still `needs_response` after a successful
reply, so this stays proven rather than remembered.

**3. Sending is two steps.**
"Send reply" runs a *preflight* — it resolves recipients and reports who is ready, and sends
nothing (`mode: "preflight"`, `sent: 0`). The message leaves only on
`[data-cc-send-confirm-action="true"]`. One click and an outbound assertion will fail against
a send the product deliberately had not performed.

---

## Selector note, outside this scenario's scope

`[data-comms-tab="inbox"]` is **absent from the rendered DOM** — probed directly against the
running app, both workspace modals return zero matches; the sub-tabs render as `role="tab"`
with their visible label. `communications-inbound-email.cert.spec.ts`,
`communications-inbound-sms.cert.spec.ts` and `communications-identity-and-composer.cert.spec.ts`
still open the inbox with that selector and will time out there. Not fixed here — those are
other certifications' specs, and changing them is their owners' call.

---

## What was retired, and why

`web/scripts/createCommunicationsNeedsReplyQaFixture.ts` now refuses and exits non-zero. It
selected the tenant's most recent Communications thread and service-role wrote
`attention_state = 'needs_response'` onto it. Three problems, and only the third is about
safety:

1. **It certified itself.** The projection read a value the fixture had written.
2. **It was not repeatable.** "Most recent thread" is whatever ran last.
3. **It mutated real correspondence.** Hosted candidate threads carry real external
   addresses; flipping a family's conversation into Needs Reply — and restoring a remembered
   prior value on cleanup — edits a customer's record to stage a test.

The file is left in place refusing, rather than deleted, so anything still wired to the old
path fails loudly instead of being quietly restored by someone who only saw a fixture go
missing.
