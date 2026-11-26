# Stage, status, work unit: which one decides what an operator sees

Thread 11 carried "lifecycle_wu_lead vs lifecycle_wu_waitlist" as unexplained debt. This closes it.

> **Revision 3. Revision 1 said membership is status-only and stage is never consulted (half right).
> Revision 2 classified the Kurzman case as B, a lifecycle state divergence to be repaired by moving
> its status to `waitlisted`. That was wrong, and acting on it would have written an invalid value.
> The gate is unsatisfiable for every case in the tenant, not just this one — see below.**

## The invariant

> **Stage says which lane a case belongs to. Status says whether the lane will show it.
> A case must satisfy BOTH, and the stored `work_unit_id` decides nothing.**

Concretely, three filter layers stack:

1. **Lane stage gate.** Every queue carries `metadata.queue_membership_v1.stage_key` and considers
   only cases at that stage. Measured: `lifecycle_lead → lead`, `lifecycle_waitlist → waitlist`,
   `lifecycle_tour → tour`.
2. **Lane status gate.** The candidate-grain waitlist lane additionally runs
   `queryLifecycleVisibleWaitlistOpportunities` →
   `.from("opportunities").in("status_key", statusKeys)`, where `statusKeys` are the stage's
   builder-assigned statuses (here `["waitlisted"]`).
3. **Work-view filter.** `work_views_v1[].filters_v1` filters again on `opportunity_stage`
   (`New → lead`, `Waitlist → waitlist`, `All → null`). A work view is selected by
   `?work_view_id=`; routing to a work-unit *key* selects none and falls back to the bare queue.

The stored `opportunities.work_unit_id` is projected and carried but never consulted for membership —
membership is recomputed on every evaluation.

## Why the Kurzman case is invisible everywhere

Census `tha_304b3057ff4b51`: `stage_key = waitlist`, `status_key = new`,
`work_unit_id = 587de5bc…` (= `lifecycle_wu_lead`).

| lane | stage gate | status gate | Kurzman |
|---|---|---|---|
| `lifecycle_lead` | `lead` | open/new_inquiry/new | **out** — stage is `waitlist` |
| `lifecycle_tour` | `tour` | open | **out** — stage is `waitlist` |
| `lifecycle_waitlist` | `waitlist` ✓ | `waitlisted` | **out** — status is `new` |

It satisfies the Waitlist lane's stage but not its status, and the Lead lane's status but not its
stage. **It falls between every lane and appears in none.**

This is not a reading artifact. The **"All" work view carries `filters_v1: null`** and still returns
**3 rows for a tenant with 4 opportunities** — the three cases at `stage_key = 'lead'`. The stored
`work_unit_id` points at Lead, which that lane's stage gate then rejects.

## Classification: C — the Waitlist membership contract is cross-grain

`waitlisted` is not an opportunity status. Measured from the org's own catalog:

```
GET /api/admin/status-definitions?entity_type=opportunities
    open, closed, inactive, archived

GET /api/admin/status-definitions?entity_type=opportunity_customer_members
    waitlisted, enrolling, enrolled, withdrawn, not_enrolling
```

`waitlisted` is a **child enrollment-participation** status on
`opportunity_customer_members.outcome_status_key`. The Waitlist lane nevertheless applies it as a
**family-grain** gate — `queryLifecycleVisibleWaitlistOpportunities` runs
`.from("opportunities").in("status_key", ["waitlisted"])`.

**No opportunity can ever satisfy that.** The lane is empty by construction, for every tenant, not
because of this one case's data.

Three independent authorities agree, so this is not inferred from bad data:

1. the org status catalog above;
2. the waitlist stage's own `status_rollup_v1`, which declares its selected status `waitlisted` under
   `entity_type: "enrollment_mixed"`, category `enrollment_statuses`, with stage `grain: "child"` and
   `track_key: "child_track"`;
3. `stageOutcomeRuleTargetExecutor.ts`: "`opportunities.status_key` is `open | closed` by migration
   doctrine".

The builder assigned a child-grain status to a child-grain stage — correctly — and
`statusKeysForBuilderStageQueueSync` then wrote it into a case-grain `case_status` filter. That
translation is the defect. The department filter audit reports `expected == actual == ["waitlisted"],
pass = true` because it compares the sync's output against the sync's own input; it never asks
whether the resulting key is a legal value for the entity being filtered.

## Why the obvious repair must not be performed

Setting this case's `opportunities.status_key = 'waitlisted'` would write a value absent from the
`opportunities` catalog — invalid family-grain data, to satisfy a filter that should not have been
family-grain. It would make one fixture mount and leave the contract defect in place for every other
tenant.

Note also that the case's current `status_key = 'new'` is **itself not in the opportunities catalog**
(`open, closed, inactive, archived`), and its two member rows carry `outcome_status_key =
'new_inquiry'`, not `waitlisted`. So the case is not a waitlist case at the child grain either. There
is no value to repair it *to* that both satisfies the lane and respects the catalog.

## The smallest correct repair, for whoever owns lifecycle

Make the lane filter the grain it actually means. A stage whose `status_rollup_v1` selects statuses of
`opportunity_customer_members` must gate on `opportunity_customer_members.outcome_status_key` — the
lane already has a `child_lifecycle_status` filter doing exactly that — rather than having those keys
copied into `case_status`.

The regression that belongs with that fix: **every status key written into a case-grain queue filter
must be a legal `opportunities` status**. That test fails today, which is the point of it.
