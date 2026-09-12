# Stage, status, work unit: which one decides what an operator sees

Thread 11 carried "lifecycle_wu_lead vs lifecycle_wu_waitlist" as unexplained debt. This closes it.

> **An earlier revision of this file said membership is evaluated on status and stage is never
> consulted. That was half right and is corrected below — both axes are used, and which one bites
> depends on the lane. Getting this half-right is worse than not writing it down, because the
> Waitlist lane really is status-gated and the conclusion generalises wrongly.**

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

## Classification: B — lifecycle state divergence

The case advanced to the **waitlist stage** without its **status** moving to a status assigned to
that stage. No case in the tenant carries `waitlisted` at all, so the Waitlist lane is empty and its
one legitimate member is stranded.

Not C. The department filter audit reports `expected == actual == ["waitlisted"], pass = true`; the
configuration is coherent. Making the Waitlist lane read `stage_key` would mount this one fixture and
silently redefine membership for every lifecycle lane.

The smallest safe correction is a **governed lifecycle status transition** to the status the builder
assigned to the waitlist stage, through the canonical transition path — not a row edit, and not a
mutation performed merely to make a certification fixture fit.

## Consequence for certification

There is no work unit or work view that legitimately contains this case, so
`Financial Subject Resolution` **cannot be certified through a real mounted route until the lifecycle
divergence is repaired**. The repair itself remains unchallenged: nothing here reaches the candidate
projection, the resolver, mountability, the card runtime, or the Financials API.
