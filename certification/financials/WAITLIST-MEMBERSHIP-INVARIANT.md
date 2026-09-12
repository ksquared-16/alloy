# Stage, status, work unit: which one decides what an operator sees

Thread 11 carried "lifecycle_wu_lead vs lifecycle_wu_waitlist" as unexplained debt. It is not
unexplained any more. This is the invariant, read out of the code and confirmed against the deployed
tenant.

## The invariant

> **Stage describes where a case sits in the authored lifecycle.
> Status is the case's operational disposition.
> Work-unit queue membership is evaluated on STATUS — never on stage, and never on the stored
> `work_unit_id`.**

## The path, in code

`resolveLifecycleWaitlistQueryContext` (`lib/queues/candidateGrainWaitlistQueue.ts`) turns the work
unit's `queue_definition` filters into `status_keys`. When the stage presents as
`waitlist_candidate`, `queryLifecycleVisibleWaitlistOpportunities` then runs:

```
.from("opportunities").eq("org_id", …).in("status_key", statusKeys)
```

Candidates are fetched only for the opportunities that survive that, and the candidate-grain filters
(`candidate_status`, `child_lifecycle_status`) are applied afterwards. So the case-level gate is
`opportunities.status_key`, and the filter values come from the builder: the statuses assigned to the
stage, via `resolveLifecycleStageAssignedStatusKeys` → `statusKeysForBuilderStageQueueSync`.

Three consequences worth stating plainly:

- **`stage_key` is not consulted for membership.** A case can sit at `stage_key='waitlist'` and be
  invisible in the Waitlist lens.
- **The stored `opportunities.work_unit_id` is not consulted either.** It is projected and carried,
  but membership is recomputed from status every time. A case whose `work_unit_id` points at one lens
  can be evaluated into another.
- **`case_status` is not a filter type the waitlist parser reads.** It parses only `candidate_status`
  and `child_lifecycle_status`; the case-level gate arrives through the lifecycle-visibility path
  above, not through a `case_status` clause.

## What the deployed tenant actually holds

Census `tha_304b3057ff4b51`, opportunity `d097e1a8-…`:

```
stage_key     waitlist
status_key    new           <- the excluding value
work_unit_id  587de5bc-…    = lifecycle_wu_lead
```

The whole tenant's case-status vocabulary is `new_inquiry/lead`, `new/waitlist`, `new/lead`,
`open/lead`. **No case carries `waitlisted`** — the status the Waitlist lens filters on. That is why
that queue reports 0, and why the department filter audit can report `expected == actual ==
["waitlisted"], pass = true` at the same time: the configuration is right, the population is empty.

Kurzman's `status_key='new'` matches the Lead lens (`open`, `new_inquiry`, `new`), and its stored
`work_unit_id` is Lead. Both agree: **the case is operationally a Lead.**

Counts corroborate: Lead 3 + Tour 1 = 4 = every opportunity in the tenant.

## Why this is not a filter defect

It is tempting to call the Waitlist filter wrong because the case's stage says waitlist. Resist that.
The builder assigned `waitlisted` to the waitlist stage and the queue faithfully carries it. What
diverged is the case: it advanced to the waitlist **stage** without its **status** moving to a status
assigned to that stage. Rewriting the filter to read `stage_key` would make this one fixture mount
and would silently redefine membership for every lifecycle lane.
