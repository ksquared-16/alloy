# Payments V1 · W5 — Platform Scheduling Inventory

**Status:** Architecture gate — read-only inventory. No Autopay mutation was made.
**Scope:** Whether a generic governed scheduling primitive exists that Autopay can reuse.
**Outcome:** `AUTOPAY_PLATFORM_SCHEDULING_PREREQUISITE_REQUIRED`.

## Decision

Autopay cannot be built in W5, because **the platform has no clock** — and the missing
piece is not a Payments component. It is the "Billing scheduler" this repository's own
core doctrine already names, with at least three consumers waiting on it, of which
Autopay is only the newest.

Building a timer inside W5 would either hide a Payments-specific scheduler in a payments
workstream — which the W5 instruction forbids — or start a platform program that is
larger than W5 and whose other consumers W5 has no authority to design for.

## What was measured, and why measurement was necessary

Source inventory found *authentication for a clock and no clock*: `isInternalCronAuthorized`
guards three endpoints, `web/vercel.json` has no `crons` key, `pg_cron` is absent and
`pg_net` is explicitly dropped, no app GitHub Actions workflow carries a `schedule:`
trigger, and the Python backend has no in-process scheduler — its README instructs a human
to configure a Render cron job by hand.

That is an argument from absence, and absence is what a source grep proves least well. So
the claim was put to the deployed primary instead. `communication_scheduled_sends` is the
platform's only working due-queue — rows carry a future `scheduled_for`, and a `process-due`
endpoint claims them `pending → claimed → queued → sent`. If a clock runs anywhere, rows
cross their due time and leave `pending`.

Two censuses, both on `alloy_deployed_primary`:

| Measure | Value |
|---|---|
| Rows in the due-queue, all time | 11 |
| Rows ever **sent** | **0** |
| Rows ever carrying a `communication_message_id` | **0** |
| Rows ever claimed (`claimed_at`, `claim_token`) | **0** |
| Rows that left `pending` **after** their due time | **0** |
| Rows that left `pending` **before** their due time | 10 (all `canceled`) |
| Still pending, overdue by | **37 days** |
| `recurrence_plans` rows (the only `next_run_at` table) | 0 |

The first census left one ambiguity that decided the whole answer: ten rows were no longer
`pending` although none had ever been claimed. Had they *sent*, something wakes this
platform and this inventory would be wrong. The second census resolved it — all ten were
**canceled by a human ahead of the send**, and not one row in the queue's entire history has
ever been enqueued. **The due-queue has a 0% fire rate over its whole lifetime.**

## The inventory

| Candidate | Shape | Verdict |
|---|---|---|
| `recurrence_plans` | `next_run_at`, `frequency_key`, `interval`, `day_of_week`, `start/end_date` | **Dead.** No reader and no advancer in TypeScript or Python; its only references are a descriptive legacy-admin page and a test asserting a migration must not touch it. Bound to `job_id` (field-service jobs). 0 rows deployed. |
| `communication_scheduled_sends` | Genuine due-queue with claim/lease | **Not generic and not recurring.** CHECK constraints pin it to `entity_type='opportunities'`, `source='task_assist'`, `channel IN (sms,email)`; it carries `body_snapshot` and `recipient_person_id`. Its own `COMMENT` says "One-time scheduled outbound". Never fired in production. |
| `workflows` / `workflow_runs` | `event_type` + `entity_type` | **Event-triggered only.** No time column anywhere in the table. |
| `financial_charge_templates.trigger_type='schedule'` | A vocabulary value | Nothing runs on a schedule; the template is resolved when a charge is created. |
| `generateTuition`, `subscriptions/[id]/generate-next` | Recurring *money* generation | **Operator actions.** The platform's own recurring billing is woken by a person pressing a button. |
| `executeCommandInvocation` | Platform command runtime | Synchronous prepare → gate → execute. No deferral. |
| `isInternalCronAuthorized` / `INTERNAL_CRON_TOKEN` | Machine auth on 3 endpoints | **Auth without a caller.** No invoker exists anywhere in the repository. |

## Why this is a platform program, not a W5 task

`docs/platform/core/operational-commercial-integration.md` §5 already assigns **Billing
cadence** to "the **periodic billing run**", evaluated by a "**Billing scheduler**", triggered
by "the **cycle clock**". That component is documented and does not exist. The same table
assigns charge-aging late fees to Collections on a `due_date`-passed fact — also with no
runner, confirmed by source.

So the clock has at least three consumers already: the periodic billing run, charge-aging
late fees, and Autopay. A scheduler built to Autopay's needs alone would be the wrong shape
for the other two and would have to be rebuilt.

The prerequisite is not one migration. It is: a generic due-work store with claim/lease
semantics; recurrence advancement; idempotency and backoff for operations that move money;
multi-tenant fairness; a dispatcher behind machine auth; **and a trigger that does not exist
in this repository** — Vercel `crons` or an external cron, plus `INTERNAL_CRON_TOKEN`
provisioned as a deployed secret, neither of which this lane can create or certify.

And one governance question outranks all of it: **every** money movement in the platform
today is operator-invoked — `fin.post`, `fin.write`, `fin.adjust`, `generateTuition`,
`payments/run`. Autopay would be the first capability to move a family's money with no human
in the loop. That is a Director decision, not an implementation detail of W5.

## The cost of building it narrowly

A due-queue shipped without a trigger is worse than no Autopay at all. Families would be
enrolled in Autopay, arrangements would look active on the surface, and nobody would ever be
charged — while operators believed collection was covered. The 37-day-overdue row measured
above is exactly that failure already happening, silently, to a scheduled message.

## State at the stop

`payment_autopay_arrangements` does not exist (`autopay_table_absent: true`). W1–W4 verified
intact on the deployed primary: `payments`, `payment_methods` (W2),
`payment_collection_attempts` (W3), `payment_holds` (W4). W5 mutated nothing; this lane's
only commits are the two census artifacts and this document.

## Evidence

- `w5-platform-scheduling-clock-census.sql` + `.results.json` — `gar_1bf91198ff7ed8`
- `w5-scheduled-send-disposition-census.sql` + `.results.json` — `gar_b3060486e0af5f`
