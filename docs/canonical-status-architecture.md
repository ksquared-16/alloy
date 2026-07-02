# Canonical Status Architecture

**Status:** Enrollment Alignment contract (July 2026) — supersedes the Phase 5 contract
**Platform reference:** `docs/platform/core/status-and-state-system.md`,
`docs/platform/core/stage-membership-and-outcomes.md`

Status is **durable truth only**. Operational progress is Work. Operational position is Stage.
The three must never be collapsed into one field — and status must never re-encode the other two.

```
Entity → Process → Stage → Work → Outcome → Durable State → Work View → Surface
```

---

## Layer definitions

### Business Process Stage (operational position)

| Question | Where is this record in the process right now? |
|----------|------------------------------------------------|
| Storage | `opportunities.stage_key`, `opportunity_customer_members.stage_key` |
| Written by | Outcome execution (`move_to_stage` targets) and intake. Nothing else. |
| Membership | Stage cohorts, Work View scoping, stage work spawning |

Stage is process state, not entity truth. It is persisted (not derived from status lists) and
owned by the process runtime. Stage membership asks "what belongs here?" — the answer is
`stage_key`, never a status filter.

---

### Case Status (family grain) — durable truth

| Question | Does this family have an open enrollment case? |
|----------|------------------------------------------------|
| Storage | `opportunities.status_key` |
| Vocabulary | `open` \| `closed` (+ `close_reason_key`: `lost` \| `withdrawn` \| `not_a_fit` \| `aged_out` \| `other`) |
| Mutable by | Outcome execution and domain actions only |

Everything the previous 13-key vocabulary encoded beyond open/closed was operational
work (`tour_scheduled`, `needs_qualification`, `decision_pending`, …) and now lives on
Stage + Work.

---

### Child Enrollment Status (participation grain) — durable truth

| Question | What is this child's enrollment outcome on this participation? |
|----------|----------------------------------------------------------------|
| Storage | `opportunity_customer_members.outcome_status_key` |
| Vocabulary | `null` (in process, pre-outcome) \| `waitlisted` \| `enrolling` \| `enrolled` \| `withdrawn` \| `not_enrolling` (+ `close_reason_key`) |
| Mutable by | Outcome execution and domain actions only |

Registration/paperwork/offer progress is Work. Waitlist pause is placement-candidate state
(`placement_candidates.status = paused`), not an enrollment status.

**Critical:** do not use case `opportunities.status_key` as any child's enrollment state.

---

### Person Status / Household Status

Unchanged: `persons.status_key`, `customers.status_key` via `status_definitions`.

---

### Work (operational progress)

| Question | What operational work is in flight, and how far along is it? |
|----------|--------------------------------------------------------------|
| Storage | Work items / work intents (spawned from `stage_operating_plan_v1.work_templates`) |
| Examples | Confirm Tour, Conduct Tour, Follow Up, Collect Registration, Extend Offer |

Work changes constantly; durable status rarely changes. Anything phrased as an activity is
Work, never a status.

---

### Outcomes (the only mutation mechanism)

Outcomes complete Work and are the **only** path that changes durable state:

```
Work completed → Outcome selected → Outcome rule targets execute:
    durable state write (status_key / outcome_status_key / close_reason_key)
    + stage move (stage_key)
    → stage membership updates → Work Views refresh
```

Direct status PATCH from operator surfaces is prohibited. Operator actions are domain verbs
(`schedule_tour`, `waitlist_child`, `enroll_child`, `mark_enrolled`, `withdraw_child`,
`close_lead`) that resolve to outcome executions in the runtime's typed status domains.

---

### Readiness / Needs Attention

Unchanged: both computed, never persisted, never statuses
(`evaluateCompletionRequirements`, `resolveOpportunityAttention`).

### Task State / Workflow Run State / Mission

Unchanged (see previous contract): orchestration and coordination state, not business status.

---

## Two-grain enrollment (frozen)

| Grain | Durable state | Stage position | Scope |
|-------|---------------|----------------|-------|
| Case | `opportunities.status_key` + `close_reason_key` | `opportunities.stage_key` | Family coordination |
| Child participation | `OCM.outcome_status_key` + `close_reason_key` | `OCM.stage_key` | Per-child outcome |

---

## Read vs write contract

| Operation | Rule |
|-----------|------|
| Runtime read | `status_key` / `outcome_status_key` / `stage_key` columns only |
| Runtime write | Outcome execution + typed status domains; no free-form status PATCH |
| Display | `status_definitions` labels; close reasons via `close_reason_key` |
| Membership | `stage_key` equality — never status lists, never queue filter duplication |

## Removed by the Enrollment Alignment sprint

- Case statuses: `new_inquiry`, `needs_qualification`, `qualified`, `tour_requested`,
  `tour_scheduled`, `tour_completed`, `tour_no_show`, `decision_pending`, and the five
  terminal variants (now `closed` + reason).
- Child statuses: `offer_pending`, `waitlist_paused`, `registration_pending`,
  `paperwork_pending`, `start_date_scheduled`, and the four terminal variants
  (now `withdrawn` / `not_enrolling` + reason).
- Status-derived stage membership (`ENROLLMENT_STAGE_STATUS_KEYS`,
  `queue_membership_v1.included_status_keys` / `included_disposition_keys`).
- `status_transition_rules` for enrollment entities (outcomes own movement).
- Operator-exposed generic `update_status` / `update_enrollment_status` actions.
