---
owner: platform
status: canonical
last_reviewed: 2026-07-12
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
- **Status is produced by the Execution Runtime — it is not the driver.** Status does not own queue behavior, actions, work, readiness, or dashboards. Those come from configured processes. See `../modules/business-process-execution-platform.md` § Status.

> **Person / Account Status are not yet Work View conditions** — see *Work View conditions* below. Account
> Status has no seeded `status_definitions`; Person Status is not carried on opportunity/child Work View
> rows. Exposing either before it is backed would create a dead condition (resolves null → excludes all).

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

A stage's `membership_criteria_v1` (formerly `queue_membership_v1`) declares subject grain,
count unit, and location scope. Membership itself is the persisted `stage_key`:

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

Removed by the Enrollment Alignment sprint: operator-facing generic status mutation
(`update_status` / `update_enrollment_status` modal) and status PATCH as a transition path.
Direct PATCH of `status_key` / `outcome_status_key` / `stage_key` is rejected.

> **Domain-aware commands shipped (July 2026).** `update_lead_status` (Lead Status domain) and `update_child_enrollment_status` (Child Enrollment Status domain) are now registered in the Execution Runtime. Each operates on exactly one canonical field and never touches another domain's column. See `../modules/business-process-execution-platform.md` § Domain Registry.

---

## Create Lead and New Leads lane

| Topic | Behavior |
|-------|----------|
| **Create Lead** | Writes `opportunities.status_key = open` and `stage_key = lead`. `new_inquiry` no longer exists (migrated to `open` + stage backfill) |
| **OCM at intake** | `outcome_status_key = null` — a brand-new lead has no enrollment disposition; the child badge is **suppressed** until a real enrollment outcome |
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
| Stage membership + outcomes | Business process builder (`stage_operating_plan_v1`, `membership_criteria_v1`) |
| Field requirements | Stage required information (`requirement_policy`) |

---

## Open work

Status ownership grain expansion for additional entity types — track in `../foundation/product-roadmap.md` (In Progress).

---

## Related

- `business-process-system.md`
- `record-system.md`
- Supplemental enrollment detail: `../../product/crm-system.md`
