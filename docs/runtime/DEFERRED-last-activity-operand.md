# DEFERRED SLICE — `last_activity_at` as a Work View condition

**Decision date:** 2026-07-30. **Decided by:** Kelly. **Status:** deferred, scoped, NOT started.
**Explicitly out of scope for Runtime × Business Process convergence.**

## The decision

`last_activity_at` is a legitimate Work View requirement — "active leads with activity in the last
14 days" is a real operator need, not polish. It is deferred anyway, as its own canonical-data slice,
because delivering it inside this sprint would have required overturning a ratified invariant.

Two things were settled at the same time and should not be reopened casually:

1. **`updated_at` stays the operand for Active Pipeline.** It works today, including the relative
   window (`Updated is Previous 15 days`). It is NOT equivalent to last activity —
   `opportunities.updated_at` changes for reasons unrelated to meaningful operator or family activity
   — and it must not be relabelled or presented as if it were.
2. **No Last Activity operand ships until the slice below is done.** A registered-but-unplumbed key
   is worse than nothing: unregistered filter keys fail OPEN in `evaluateWorkViewFiltersV1`
   (`pass: true`, `reason: "unsupported_field"`), so a half-wired operand does not error — it
   silently matches every row while looking configured.

## Why it could not be done here

Work View filters are evaluated at FIVE sites: the provisioning answer, the queue API route,
queue-view-totals, and two client-side landing paths that read their rows over HTTP from the queue
route. Enriching some and not others makes a view's ROWS and its COUNT disagree.

One of those sites is the `count_only` path, and `tests/queues/countOnlyTotalsProjection.test.ts`
ratifies the doctrine:

> counts derive from operational fields only (enrichment-independent)

enforcing it by asserting that `count_only` disables every batch fetch — naming
`activity_timeline_events` explicitly as forbidden — and that count-only rows yield counts identical
to enriched rows. A `last_activity_at` predicate delivered by ENRICHMENT breaks that by
construction: the count path deliberately refuses the fetch that would produce the field.

**That invariant was not revised, and must not be revised as a side effect of adding an operand.**
It is what keeps counts cheap.

## What the slice must deliver

1. **A precise activity definition.** Today the only implementation is "the latest
   `workflow_events.occurred_at` for the entity, all event types, nothing excluded"
   (`lib/admin/activitySignals.ts`). Whether *every* event type constitutes operator-meaningful
   activity is an open product question — status changes, system events and unknown event types all
   currently count, and `tests/admin/activitySignals.test.ts` pins that permissiveness. Answer it
   before materializing anything, because the answer becomes durable data.
2. **A migration + backfill strategy.** The field should become an OPERATIONAL column on
   `opportunities` rather than a per-request derivation, so all five evaluation sites read it from
   the base select they already issue and the count path stays enrichment-independent. Verify the
   migration ledger can accept a migration before committing to this shape.
3. **An event maintenance contract.** What keeps the column true — trigger on `workflow_events`
   insert, an application write path, or a scheduled recompute — and what happens when it is stale.
   A materialized field with no maintenance contract is a lie with a timestamp on it.
4. **Count-path certification.** Prove rows and counts agree for a view filtered on the new field,
   across all five evaluation sites, including `count_only`.

## Reuse, do not re-derive

Two batched readers already exist and either should be reused rather than adding a third definition:

| Reader | Path |
|---|---|
| Latest event per opportunity (chunk 80) | `web/lib/admin/activitySignals.ts` · `fetchLatestWorkflowEventByOpportunityId` |
| Top-N events per opportunity (chunk 80) | `web/lib/admin/fetchQueueActivityTimelineEvents.ts` |

`QueueService` already writes `last_activity_at` onto opportunity queue rows, but only when the
layout-runtime queue-body flag is on and never under `count_only` — which is precisely the asymmetry
that makes it unusable as a filter operand today.

## What DOES work today

Relative date conditions are real and tested: a value token (`prev:14:days`, `next:1:months`) under
`date_is` on any date operand, authored through the builder's Previous/Next + amount + unit control.
The window moves on its own — the same saved condition admits a row today and excludes it later,
with no edit. See `web/tests/lifecycle/workViewRelativeDateConditions.test.ts`.
