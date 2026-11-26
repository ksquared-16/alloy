# Two findings on the durable Enrolled write path

Recorded from code and migration evidence on
`agent/claude/4-enrollment-phase2-participant-anchor`. Neither was reachable from the
deployed database, because the read-only census is currently unavailable to this lane
(`gar_1017a05bafb674`, `gar_3ea7a8aec62e53` — both terminal `execution_failed`). Both are
provable from the repository alone, which is why they are written down rather than waited on.

---

## Finding 1 — an enrolled child's Participation still says `enrolling`

**Evidence.**

`ensureOpportunityCustomerMemberParticipation` is documented as the owner of the child's
Enrollment state:

> the durable subject of Enrollment — it owns the child's Enrollment state
> (`outcome_status_key`: waitlisted / enrolling / enrolled / withdrawn / not_enrolling)

`startEnrollment` creates it with `outcome_status_key = 'enrolling'`
(`ENROLLING_CHILD_STATUS_KEY`).

The governed completion path is
`completeStageWorkWithOutcome` → `executeStageOperatingOutcome` →
`stageOutcomeRuleTargetExecutor`, case `update_child_enrollment_status`. That case writes
`process_instances.state` via `setEnrollmentInstanceStateByScope` and says so explicitly:

> the OCM durable enrollment-status column is NOT written — `process_instances` is the
> single source of truth for child participation state

Every writer of `opportunity_customer_members.outcome_status_key`
(`updateOpportunityCustomerMemberLifecycleStatus` and
`applyChildWaitlistViaOutcomeRuntime`) is reached from admin actions, API routes, workflow
runs, waitlist progression, or certification fixtures — **none from the governed stage-outcome
completion path**.

**Consequence.** After a successful Complete Enrollment the Participation reads `enrolling`
indefinitely, while `process_instances.state` reads `enrolled`.

**Why this is a decision and not a bug fix.** The mission requires
`OCM / Enrollment Participation → canonical child enrollment state = Enrolled`. The code
declares the opposite owner, deliberately and in a comment that anticipates OCM being dropped
("it re-keys to `process_instances` when OCM is dropped"). Both agree the *Opportunity* is not
the owner; the disagreement is OCM vs `process_instances`. Changing a documented doctrine
platform-wide is a Director call, so this lane did not make it.

---

## Finding 2 — a successfully enrolled episode never releases the context-free slot

This one is **independent of Finding 1** and survives either resolution of it.

**Evidence.**

`20260827170000_context_free_participation_is_episode_scoped.sql`:

```sql
create unique index if not exists uq_ocm_active_context_free_participation
    on public.opportunity_customer_members (org_id, customer_member_id)
    where opportunity_id is null
      and coalesce(outcome_status_key, '') not in ('withdrawn', 'not_enrolling');
```

`enrollmentProcessStatusVocabulary.ts`:

```ts
/** Dispositions that CONCLUDE a child's enrollment episode. Mirrors `terminal` below. */
export const TERMINAL_CHILD_STATUS_KEYS: readonly string[] = ["withdrawn", "not_enrolling"];
```

`enrolled` is in neither set. So an `enrolled` context-free Participation still satisfies the
index predicate and still occupies the one ACTIVE slot for that child.

`ensureOpportunityCustomerMemberParticipation` matches the index exactly, and states the intent
the index is meant to carry:

> Only an ACTIVE context-free episode may be reused. A concluded one is history, and returning
> it would start a new journey already holding the previous episode's outcome.

**Consequence.** A child who completes Enrollment keeps their active context-free Participation
forever. The next Start Enrollment — a new school year, the next episode — finds that row
ACTIVE and **reuses last year's Participation**, handing the new journey the previous episode's
subject. Creating a second one is impossible: the unique index forbids it.

That is the exact failure the migration says it exists to prevent. The intent and the predicate
disagree, because "concluded" was encoded as *withdrawn or not_enrolling* while the ordinary way
an episode concludes is by **enrolling**.

Note the supporting evidence already in that module's own comment: 600 children in the
certification tenant hold two Participations and 600 hold three, each with its own `start_date`,
`stage_key` and `outcome_status_key`. Episodes are per-year. A per-year episode that ends in
enrollment must release the slot, or the second year cannot start.

**Why this was not fixed here.** The fix touches enrollment identity semantics platform-wide:
it changes either `TERMINAL_CHILD_STATUS_KEYS`, or the deployed unique index predicate, or both.
The deployed index cannot currently be measured from this lane, and a predicate change that does
not match existing rows will fail to build. Guessing at that without a census is how a migration
lands broken.

---

## What is needed

1. **Director decision:** does durable child Enrollment state live on
   `opportunity_customer_members.outcome_status_key`, or on `process_instances.state`?
   One owner, stated once.
2. **Then** the episode-slot predicate follows from it, and can be corrected in the same change
   as a migration — against a measured deployed state, not an assumed one.

Until (1) is settled, `DURABLE ENROLLED STATE CERTIFIED` cannot be answered YES, and Path A's
"repeated Start Enrollment reuses the same active Participation" is only certifiable *within* one
episode — not across two.
