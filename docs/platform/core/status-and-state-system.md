---
owner: platform
status: canonical
last_reviewed: 2026-09-29
supersedes: []
---

# Status and state system

**Status:** Canonical (July 2026). See [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md) for execution runtime doctrine.

How status keys, state transitions, and lifecycle ownership work across grains.

---

## Status Truth Doctrine — there is no generic status (frozen)

**Every status belongs to a subject/grain.** "Status" alone is never a valid field — a status is only
meaningful with its domain. Four domains:

| # | Domain | Canonical field | `status_definitions` entity_type | Subject / grain | Answers |
|---|--------|-----------------|----------------------------------|-----------------|---------|
| 1 | **Case Status** | `opportunities.status_key` (+ `close_reason_key`) | `opportunities` | family / opportunity | Does this family have an open enrollment case? (`open` \| `closed` — pipeline position is **Stage**, not status) |
| 2 | **Child Enrollment Status** | `opportunity_customer_members.outcome_status_key` (+ `close_reason_key`) | `opportunity_customer_members` | child / member | What is this child's durable enrollment state? (`waitlisted`, `enrolling`, `enrolled`, `withdrawn`, `not_enrolling`) |
| 3 | **Person Status** | `persons.status_key` | `persons` | person | Is this person active / inactive / archived? |
| 4 | **Customer / Account Status** | `customers.status_key` | `customers` *(registered; not yet seeded with definitions in practice)* | household / account | Is this account active / inactive / archived? |

**Rules:**
- **Family-track stages are case-grain; child-track stages are child-grain.** Do **not** treat a
  family's case status as a child's enrollment state, or vice versa. `waitlisted` exists only in
  the child domain.
- **Counts follow the selected grain.** Family-grain status → count families/opportunities; child-grain
  status → count child/member rows (one family with two waitlisted children counts as **2**); person-grain
  → count people.
- **`status_definitions.entity_type` discriminates the domain** (`opportunities` / `opportunity_customer_members`
  / `persons` / `customers`). The evaluator resolves each domain from its own row field — never a shared set.
- **Closed / terminal detection is canonical** in `resolveOutcomeStatusOptions`
  (`isConfiguredClosedStatus` / `isClosedStatusKeyForEntity`). Process Builder close-record
  classification, validation, and pickers must reuse that resolver — do not re-interpret
  `terminal` / `is_terminal` / `is_closed` in parallel.
- **Status is produced by the Execution Runtime — it is not the driver.** Status does not own queue behavior, actions, work, readiness, or dashboards. Those come from configured processes. See `../modules/business-process-execution-platform.md` § Status.

> **Person / Account Status are not yet Work View conditions** — see *Work View conditions* below. Account
> Status has no seeded `status_definitions`; Person Status is not carried on opportunity/child Work View
> rows. Exposing either before it is backed would create a dead condition (resolves null → excludes all).

### Placement-candidate state is NOT a governed Status domain

`placement_candidates.status` is **domain-owned placement state, deliberately outside this doctrine.**
It is not a fifth domain, and it must not be added to the table above.

| | Governed Status domain | `placement_candidates.status` |
|---|---|---|
| Vocabulary defined by | tenant-configurable `status_definitions` rows | a database CHECK constraint |
| Values | configurable per org | fixed: `active` · `paused` · `withdrawn` · `placed` |
| `status_definitions.entity_type` | discriminates the domain | **never** takes this table's name |
| Transition policy | `status_transition_rules` where the Action path applies it | the CHECK constraint only |

These are different kinds of thing: a closed, DB-enforced domain enum versus configurable relationship
truth. The constraint is in fact *stricter* than `status_definitions` — which is why promoting the
column into this architecture would weaken it, not strengthen it. Placement-candidate state is owned by
[`placement-system.md`](placement-system.md).

`subject_type: "candidate"` in stage membership refers to the candidate **grain**, which is a separate
concept from this status column and is unaffected by the exclusion above.

### One transition-policy gate

`status_transition_rules` is a **real, write-gating** mechanism — not advisory. It can block a
transition and require metadata or payload fields, and `validateStatusTransition` owns that invariant.

**Every governed durable-status change passes through it, and there is exactly one implementation.**
The canonical Action/Command runtime applies it, and so does canonical lifecycle transition execution —
for both grains, reading the subject's current status in the grain being moved: a case transition
against `opportunities.status_key`, a child transition against the OCM's own `outcome_status_key`.

The gate runs **before** prior-stage reconciliation. Asking an operator to decide what happens to the
work they are leaving and only then refusing the move would waste the decision and make the dialog look
as though it did nothing.

A second validator is the failure mode to guard against, not a missing feature: two implementations
drift, and whichever one a given path happens to call silently becomes the real policy. New mutation
paths reuse `validateStatusTransition`.

No outcome may bypass the gate, and no override exists — every currently supported outcome passes
ordinary policy, so none was needed.

---

## Two enrollment grains (frozen)

| Grain | Durable state | Stage position | Owns |
|-------|---------------|----------------|------|
| **Case** | `opportunities.status_key` (`open`\|`closed`) + `close_reason_key` | `opportunities.stage_key` | Household coordination — is the case open, and why did it close |
| **Child enrollment** | `opportunity_customer_members.outcome_status_key` + `close_reason_key` | `opportunity_customer_members.stage_key` | Per-child durable enrollment state |

**Do not** treat case status as every child's enrollment state. Tour/qualification/decision
progress is **Stage + Work**, never status (see `stage-membership-and-outcomes.md`).

Status definitions live in org config (`status_definitions`) with `entity_type` discriminating opportunity vs OCM.

### Stage membership declares grain — never status lists

A stage's **`queue_membership_v1`** declares subject grain, count unit, and location scope. Membership
itself is the persisted `stage_key`:

> **Naming note (measured 2026-09-29).** `queue_membership_v1` is the **implemented** configuration key.
> `membership_criteria_v1` was the name proposed for it by the Enrollment Alignment sprint and has **no
> TypeScript or migration presence** — the rename was documented but never carried out. Treat
> `membership_criteria_v1` as a planned successor name, never as current runtime configuration.

- `subject_type: "case"` → family-track stage; membership = `opportunities.stage_key`, count unit `cases`.
- `subject_type: "child"` → child-track stage; membership = `OCM.stage_key`, count unit `enrollment_tracks`.
- `subject_type: "candidate"` → placement candidate grain (waitlist), count unit `candidates`.

The old `included_status_keys` / `included_disposition_keys` lists were removed by the
Enrollment Alignment sprint — status filters as membership criteria drifted into three
divergent copies. Queue lanes are generated from stage membership, never authored.

---

## Business process stages vs status

| Concept | Role |
|---------|------|
| **Stage** | Operational position — persisted `stage_key`, written by outcome execution + intake only |
| **Status key** | Durable truth on the entity row — produced by outcomes, never encodes work or position |
| **Work** | Operational progress (work items from stage work templates) |
| **Outcome** | Human-selected result from expected work — the only mutation mechanism for durable state |

Stages are **not** separate work units in enrollment — they are lanes inside `enrollment_pipeline`,
generated from stage membership.

---

## Transition paths

1. **Stage outcome rules** — the canonical path: outcome picker → rule targets → durable state
   write + `stage_key` move (atomic, via Execution Runtime typed domains)
2. **Domain actions** — `schedule_tour`, `waitlist_child`, `enroll_child`, `mark_enrolled`,
   `withdraw_child`, `close_lead` — resolve to outcome executions with preflight/readiness
3. **Workflow effects** — event-triggered automation (origin: `automation`) — same typed domains

**Destructive vs status transitions (P4.S1):** Commands that delete, archive, cancel, withdraw,
void, or **replace** a designation are not ordinary status updates. They use the Command Runtime
destructive/replacement policy contract (preview + confirmation + permission class). Replacement
(e.g. make primary contact) displaces a designation without deleting the prior record. Facade
commit for these Classes remains gated separately from Mutation Runtime status transitions.

Removed by the Enrollment Alignment sprint: operator-facing generic status mutation
(`update_status` / `update_enrollment_status` modal) and status PATCH as a transition path.
Direct PATCH of `status_key` / `outcome_status_key` / `stage_key` is rejected.

> **Domain-aware commands shipped (July 2026).** `update_lead_status` (Lead Status domain) and `update_child_enrollment_status` (Child Enrollment Status domain) are now registered in the Execution Runtime. Each operates on exactly one canonical field and never touches another domain's column. See `../modules/business-process-execution-platform.md` § Domain Registry.

---

## Create Lead and New Leads lane

| Topic | Behavior |
|-------|----------|
| **Create Lead** | Writes `opportunities.status_key = open` and `stage_key = lead`. `new_inquiry` no longer exists (migrated to `open` + stage backfill) |
| **OCM at intake** | `outcome_status_key = new_inquiry` — **this is current measured behaviour, not the intended end state.** The live Create Lead path resolves the child participation through `ensureOpportunityCustomerMemberParticipation`, which writes `new_inquiry`; the canonical E2E validator asserts that value. The *intent* is a null disposition with the child badge suppressed until a real enrollment outcome, and a remediation script (`web/scripts/suppressLegacyChildNewInquiryStatus.ts`) scrubs existing rows to null — but the writer has not been converged, so `new_inquiry` is what a fresh lead gets today. Tracked as D-BP5 implementation debt; do not document the null shape as current. |
| **Status language** | No "Inquiry" anywhere — operator language, status keys, and entity types. The participation entity type is `enrollment_participation` |
| **New Leads lane** | Membership = `stage_key = lead` — no status alias expansion needed |

---

## Canonical action catalog

Platform `action_definitions` aligned to lifecycle matrix. Relationship actions seeded globally (`20260622210000_relationship_action_definitions.sql`). Legacy `*_placeholder` keys being retired.

**Shipped:** `move_to_waitlist` activation path; unified relationship framework. Domain verbs
replaced `update_enrollment_status` (Enrollment Alignment sprint).

---

## Strict mode (planned activation)

Readiness tooling shipped for child lifecycle gates. **Activation deferred** until OCM/backfill QA complete.

---

## Needs Attention (not a status)

Resolver output (`resolveOpportunityAttention`) — operational overlay with reason codes. Distinct from `status_key`.

---

## Configuration surfaces

| Surface | Location |
|---------|----------|
| Status definitions | `/admin/settings/statuses` |
| Stage membership + outcomes | Business process builder (`stage_operating_plan_v1`, `queue_membership_v1`) |
| Field requirements | Stage required information (`requirement_policy`) |

---

## Open work

Status ownership grain expansion for additional entity types — track in `../foundation/product-roadmap.md` (In Progress).

---

## Related

- `business-process-system.md`
- `record-system.md`
- Supplemental enrollment detail: `../../product/crm-system.md`
