# Waitlist Priority Fact Truth + Child Site/Program Scope

**Status:** Card 0 complete · Card 1 foundation in progress  
**Date:** 2026-05-28  
**Depends on:** [Waitlist Phase 2 architecture](waitlist_orchestration_phase2_architecture.md), [Child lifecycle closeout](completed/child_lifecycle_work_unit_convergence_closeout.md)

---

## Goal

Move waitlist **priority facts** and **child placement scope** onto real child-level records so ranking can use reliable data instead of opportunity-level metadata alone.

**Non-goals (this sprint):** billing, scheduling, full capacity engine, tuition rate module, sister-school config UI, flipping `shadow_mode` off globally, rewriting opportunity-level tours/comms/forms.

---

## Card 0 — Audit answers

### 1. Where does child location currently live?

| Store | Field | Notes |
|-------|-------|-------|
| **Not on OCM today** | — | No `location_id` / `site_id` on `opportunity_customer_members` |
| **`placement_candidates`** | `site_id` | Populated from **`opportunities.location_id`** at backfill/hook time |
| **`customer_members` / `persons`** | — | No site affinity |
| **Forms / intake** | Opportunity + link defaults | `default_location_id` on public links; maps to opportunity, not per-child |

### 2. Where does opportunity location currently live?

| Store | Field | Notes |
|-------|-------|-------|
| **`opportunities`** | `location_id` | FK to `locations` (org-scoped sites) |
| **Tours** | `tour_bookings.location_id` | Opportunity-level tour site |
| **Workspace filter** | `workspace_site_id` query param | Operator scope, not child SoT |

### 3. Where do program/classroom/rate interests currently live?

| Store | Field | Notes |
|-------|-------|-------|
| **OCM** | `desired_program_type`, `desired_schedule_type` | Text / option-set keys; drawer + forms |
| **OCM** | `metadata` | Custom inquiry-child fields |
| **`placement_candidates`** | `program_room_cohort_key`, `program_room_group_label` | Resolved at backfill from OCM program + DOB heuristics |
| **Opportunity** | `metadata.program_label`, `placement_fact_inputs_v1` | Legacy / demo / V1 evaluator |
| **Rates / classrooms** | — | **No first-class tables** in schema reference |

### 4. Does `opportunity_customer_members` already support child-level site/program/status?

| Capability | Present? |
|------------|----------|
| Child lifecycle SoT | **Yes** — `outcome_status_key` |
| Desired start | **Yes** — `desired_start_date` |
| Program interest (loose) | **Yes** — `desired_program_type` |
| Site / location | **No** — Card 1 adds `location_id` |
| Stable cohort key | **No** — Card 1 adds `program_room_cohort_key` (optional; backfill may still derive) |

### 5. Does `placement_candidates` already carry enough site/cohort info?

**Mostly yes** for waitlist orchestration: `site_id`, `program_room_cohort_key`, `desired_start_date`, OCM FK, orchestration `status`. **Gap:** `site_id` is often **opportunity fallback**, not child-selected site.

### 6. Where should employee yes/no + employee ID live?

| Option | Decision |
|--------|----------|
| **`persons`** | **Chosen (Card 1)** — `is_employee`, `employee_id`, `employee_source` (nullable text). Employee is a **person** attribute; household check joins `customer_persons` → `persons`. |
| `customers.metadata` | Rejected — not person-specific |
| `opportunities.metadata` | Legacy demo only; not SoT |

### 7. Enrolled sibling same-site (computable today)

For household `customer_id`, load sibling OCM rows where:

- `outcome_status_key = 'enrolled'` (strict enrolled; `enrolling` deferred)
- `location_id` **equals** candidate site (`placement_candidates.site_id` or OCM `location_id`)
- Exclude self (`opportunity_customer_member_id` / `customer_member_id`)

### 8. Enrolled sibling sister-site

Same as §7 with `outcome_status_key = 'enrolled'` and **different** `location_id` under the **same org** → maps to preset fact **`flag_sister_center`**.

Requires both sibling and candidate site ids; missing site → fact **absent** (no priority).

### 9. Missing for rate/program validation

- No `classrooms`, `programs`, or `rates` tables wired to OCM
- Card 1 adds **`validateChildPlacementScope`** helper: cohort key + site consistency only; **rate/classroom checks deferred**

---

## Current state matrix

| Concern | Authority today | Target |
|---------|-----------------|--------|
| Child lifecycle | `opportunity_customer_members.outcome_status_key` | Unchanged |
| Child site | Opportunity `location_id` → `placement_candidates.site_id` | **OCM.location_id** primary |
| Program cohort | Derived + metadata | **OCM.program_room_cohort_key** + derivation fallback |
| Employee household | `opportunities.metadata` flags | **`persons.is_employee`** via `customer_persons` |
| Sibling enrolled | Metadata | **OCM enrolled + site match** |
| Sister center | Metadata | **OCM enrolled + different site** |
| Sibling waitlisted | — | **Active `placement_candidates` / OCM waitlisted** (fact wired; preset tier deferred) |
| Accepted not started | — | **Deferred** (`offer_pending` / `enrolling` semantics TBD) |
| Manual priority | `placement_overrides` | Unchanged |
| Forecast | `placement_candidates.metadata` | Unchanged |
| Queue membership | Opportunity `status_key` + v2 filters | Unchanged in Card 1 |
| Live ranking | `shadow_mode: true` default | Unchanged |

---

## Target model (Card 1 foundation)

```text
customer (household)
  ├── customer_persons → persons (is_employee, employee_id)
  ├── customer_members (children)
  └── opportunities (case shell, location_id fallback)
        └── opportunity_customer_members
              ├── outcome_status_key   (lifecycle SoT)
              ├── location_id          (child site — NEW)
              ├── program_room_cohort_key (NEW, optional)
              └── desired_start_date
        └── placement_candidates (orchestration)
              ├── site_id ← OCM.location_id ?? opportunity.location_id
              └── program_room_cohort_key ← OCM ?? derived
```

**Priority fact source matrix (Card 1):**

| Fact key | Real source (Card 1) | Metadata fallback (V1 / transition) |
|----------|----------------------|-------------------------------------|
| `flag_employee_household` | Any linked `persons.is_employee` on household | Opportunity metadata when household context not loaded |
| `flag_sibling_enrolled` | Sibling OCM `enrolled` + same `location_id` | Metadata (V1 only) |
| `flag_sister_center` | Sibling OCM `enrolled` + different `location_id` | Metadata (V1 only) |
| `wait_since` / `desired_start_date` | Candidate row → OCM | Opportunity metadata |
| `program_room_group` | Candidate cohort label | Opportunity metadata |

**V2 candidate evaluation:** When `household_placement_context` is supplied, household flags are **record-sourced only** (absent = no tier match; metadata `true` ignored).

---

## Implementation cards

| Card | Scope | Status |
|------|-------|--------|
| **0** | Audit + this doc | **Done** |
| **1** | Migrations, scope validation helper, backfill site precedence, household fact resolver, V2 wiring, tests | **This PR** |
| **2** | Drawer/forms: edit OCM `location_id` + cohort; intake mapping | Deferred |
| **3** | Backfill / repair job for existing candidates from OCM | Deferred |
| **4** | Preset tiers for sibling-waitlisted, accepted-not-started | Deferred |
| **5** | Program/classroom/rate catalog + strict cross-site validation | Deferred |
| **6** | `shadow_mode: false` pilot checklist | Deferred |

---

## Risks

- **Historical candidates** retain opportunity `site_id` until backfill/repair (Card 3).
- **Missing child site** blocks same-site vs sister-site facts → conservative standard tier (intended).
- **Strict child eligibility** (`ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT=1`) reduces synthetic rows; unrelated to facts but affects cohort density.
- **HR / employee_id** not validated against external system in Card 1.

---

## Explicitly deferred

- Billing, scheduling, capacity engine, tuition rates
- Sister-school configuration UI
- Opportunity-level workflow migration
- `accepted_sibling_not_started` as evaluator tier
- `flag_sibling_waitlisted` preset rule (data may be collected in metadata for diagnostics)
- Non-shadow default ranking
- RLS/policy changes beyond new nullable columns (existing org-scoped patterns)

---

## Validation (Card 1)

- `cd web && npx tsc --noEmit`
- `cd web && npm run test -- web/tests/orchestration/placement/householdPlacementFacts.test.ts`
- `cd web && npm run test -- web/tests/orchestration/placement/placementCandidateBackfill.test.ts`
- `cd web && npm run test -- web/tests/orchestration/placement/opportunityPlacementFacts.test.ts`
- Waitlist QA scripts unchanged (V1 fallback path preserved)
