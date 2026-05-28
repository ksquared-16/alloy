# Waitlist Priority Fact Truth + Child Site/Program Scope

**Status:** **Sprint closed (Card 5 closeout — 2026-05-28)**  
**Cards 0–4 + 2.5 + Gate 1A:** Done · **Card 5:** Closeout done · **Live ranking (`shadow_mode: false`):** Deferred until pilot checklist passes  
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
| **1** | Migrations, scope validation helper, backfill site precedence, household fact resolver, V2 wiring, tests | **Done** |
| **2** | Drawer inquiry children: Site + Room/cohort on OCM; API validation; locations load | **Done** |
| **2.5** | Person profile: `is_employee` / `employee_id` admin UI | **Done** |
| **3** | Repair existing `placement_candidates` from OCM; load diagnostics; priority-fact QA | **Done** |
| **4** | Forms intake child site/cohort → OCM on submit | **Done** |
| **5** | Sprint closeout: SoT matrix, strict-mode checklist, QA commands, limitations | **Done** |
| **5b** | Preset tiers for sibling-waitlisted, accepted-not-started | Deferred |
| **6** | Site-scoped program/classroom/rate catalog + strict cross-site validation | Deferred (facility/billing foundation — **not** required to close fact-truth sprint) |
| **7** | `shadow_mode: false` pilot activation | **Deferred** — use checklist below; do **not** enable until operator sign-off |

---

## Risks

- **Historical candidates** may retain opportunity `site_id` until repair — run Card 3 repair after OCM site/cohort edits.
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

## Gate 1A — Apply + verify (2026-05-28)

| Check | Result |
|-------|--------|
| `supabase db push` | **Applied** — `20260528120000` on Local + Remote |
| OCM `location_id`, `program_room_cohort_key` | Present in live schema |
| `persons.is_employee`, `employee_id`, `employee_source` | Present in live schema |
| Index `idx_opportunity_customer_members_org_location` | Present |
| RLS | No policy changes in migration (nullable columns only) |
| `npm run export:supabase-schema` | CSVs regenerated |

---

## Card 3 — Candidate repair + priority QA (2026-05-28)

### Repair command

From `web/` (service-role env in `.env.local`):

```bash
ORG_ID=<uuid> DRY_RUN=1 npm run dev:repair:placement-candidates
ORG_ID=<uuid> npm run dev:repair:placement-candidates
```

Optional: `LIMIT=500`. Idempotent: merges `metadata.placement_ocm_repair` with `repair_source: "ocm_child_scope"`, `previous_site_id`, `previous_program_room_cohort_key`, `repaired_from_ocm_at`. Does **not** overwrite when OCM `location_id` / `program_room_cohort_key` are null; synthetic fallbacks skipped.

Implementation: `web/lib/orchestration/placement/repair/placementCandidateOcmRepair.ts`, `web/scripts/repairPlacementCandidatesFromOcm.ts`.

### Source precedence (load / eval)

| Field | Precedence |
|-------|------------|
| `site_id` on candidate | OCM `location_id` → opportunity `location_id` (legacy fallback) → stored candidate |
| `program_room_cohort_key` | OCM key → stored candidate → member metadata / DOB derivation |
| Household flags (V2) | `persons` + OCM joins when household context loaded; metadata ignored unless `ALLOY_PLACEMENT_HOUSEHOLD_FACTS_METADATA_FALLBACK=1` |

Dev diagnostics (`site_source`, `cohort_source`, `household_fact_source`): `ALLOY_PLACEMENT_LOAD_DIAGNOSTICS=1` or `NODE_ENV=test` — attached to queue bundle / V2 preview, not production UI by default.

### Priority fact QA

```bash
cd web && npm run qa:waitlist:priority-facts
ORG_ID=<uuid> RUN_REPAIR_DRY_RUN=1 npm run qa:waitlist:priority-facts
```

`MUTATE_REPAIR=1` applies repair (dev/pilot only).

## Card 4 — Forms intake child site/cohort (2026-05-28)

Public **lead_capture** intake (`buildFormIntakeMetaFromPayload` → `applyFormIntakeSafe`) maps form values to **`opportunity_customer_members`**:

| OCM column | Source precedence |
|------------|-----------------|
| `location_id` | Child field (`intake_field_paths.child_location_id` or per-child `location_id`) → opportunity `location_id` → link `default_location_id` |
| `program_room_cohort_key` | Child field only (`child_program_room_cohort_key` or `program_room_preference` default) |
| `desired_program_type` / `desired_schedule_type` / `desired_start_date` | Child paths when mapped |

**Multi-child:** `intake_field_paths.children[]` builds `meta.intake.children[]`; each child gets its own OCM row (no shared cohort unless the form repeats the same value).

**Diagnostics:** `metadata.placement_scope` on OCM records `location_source` / `cohort_source`.

**Limitation:** Program/cohort picklists are still **org-level** — site-scoped catalog deferred (Card 5).

**Registry:** `child_site`, `child_room_cohort`, `desired_program_type`, `desired_schedule_type` in `systemFieldRegistry.ts`.

**Tests:** `web/tests/forms/intakeChildOcmFromForm.test.ts`

---

## Card 2.5 — Employee person UI (2026-05-28)

Person drawer overview section **Employee (waitlist priority)** and the same block on **Contact** when `person_id` is linked. Fields:

- **Employee** (`persons.is_employee`)
- **Employee ID** (`persons.employee_id`, optional)
- **Source** (`persons.employee_source`, optional — e.g. `manual`)

PATCH: `web/app/api/admin/persons/[id]` (admin only). UI uses existing `patchLinkedPersonFromOpportunityDrawer` → same route. No HR sync, no duplicate employee model.

---

## Card 5 — Sprint closeout (2026-05-28)

### Final source-of-truth matrix

| Fact / scope | Source (authoritative) | Real now? | UI editable? | Intake-supported? | Used in V2 evaluator? | Remaining gap |
|--------------|------------------------|-----------|--------------|-------------------|------------------------|---------------|
| **Employee household** | `persons.is_employee` via `customer_persons` on household | **Yes** (when populated) | **Yes** — Person drawer + linked Contact | No (operator sets on person) | **Yes** — record join; metadata ignored when household context loaded | HR sync / external employee-id validation deferred |
| **Enrolled sibling same site** | Sibling OCM `outcome_status_key=enrolled` + same `location_id` as candidate | **Yes** (when sites set) | **Yes** — child lifecycle + site on OCM | **Yes** — per-child site on intake when mapped | **Yes** — `flag_sibling_enrolled` | Missing child site → fact absent (intended) |
| **Sister-site enrolled sibling** | Sibling OCM enrolled + different `location_id` | **Yes** (when sites set) | Same as above | Same as above | **Yes** — `flag_sister_center` | Sister-school config UI deferred |
| **Sibling waitlisted** | OCM waitlisted + active `placement_candidates` on household | **Partial** — data detectable (`resolveSiblingWaitlistedPresent`) | Lifecycle on OCM | No dedicated intake flag | **No preset tier** — not in ranking rules yet | Preset tier + product rule (Card 5b) |
| **Accepted sibling not started** | — | **No** | — | — | **Forecast hint only** (`accepted_not_started` in metadata) | Semantics + tier deferred (`offer_pending` / `enrolling` TBD) |
| **Manual adjustment** | `placement_overrides` (pin / tier_boost / temporary) | **Yes** | **Yes** — waitlist queue override UX | N/A | **Yes** — wins effective ordering layer | Ops review before live ranking |
| **Forecast hint** | `placement_candidates.metadata.placement_forecast_v1` | **Yes** (optional) | Metadata / config | No | **Informational only** — no default ordering impact | Capacity engine deferred |
| **Child site** | `opportunity_customer_members.location_id` → `placement_candidates.site_id` | **Yes** | **Yes** — inquiry children drawer | **Yes** — lead_capture `intake_field_paths` | **Yes** — scopes sibling facts + candidate site | Historical rows: run repair; pilot data may still be empty |
| **Child cohort** | `opportunity_customer_members.program_room_cohort_key` | **Yes** | **Yes** — inquiry children drawer | **Yes** — when mapped on intake | **Yes** — cohort grouping / sort tuple | **Org-level** cohort keys only; site-scoped catalog deferred |

**V1 opportunity path:** Still uses opportunity metadata for household flags when V2 household context is not loaded — unchanged by design.

### Strict-mode readiness checklist (`shadow_mode: false`)

Use before enabling live/non-shadow waitlist ranking on a **pilot org/work unit**. **`shadow_mode: false` must remain deferred until every item is checked and signed off.**

| # | Gate | How to verify |
|---|------|----------------|
| 1 | OCM **child site** populated for pilot waitlist children | Drawer inquiry children + spot-check OCM `location_id` |
| 2 | OCM **cohort** populated for pilot waitlist children | Drawer + `program_room_cohort_key` on OCM |
| 3 | **Employee** flags on persons where staff priority expected | Person drawer Employee section |
| 4 | **Candidate repair** run after OCM backfill | `ORG_ID=… DRY_RUN=1 npm run dev:repair:placement-candidates` then apply |
| 5 | **Priority-fact QA** pass | `cd web && npm run qa:waitlist:priority-facts` |
| 6 | **Waitlist V2 QA** pass (queue payloads, shadow previews) | `cd web && npm run qa:waitlist:v2` |
| 7 | **Override QA** (manual pin / adjustment) | `cd web && npm run qa:waitlist:override` |
| 8 | Waitlist **UI** reviewed (candidate rows, cohort sections, reason lines) | Admin V2 enrollment pipeline waitlist lane |
| 9 | **Manual adjustment** workflow reviewed with ops | Pin/override + activity |
| 10 | **Activity history** reviewed for override events | Opportunity / placement activity |
| 11 | **V1 fallback** confirmed when V2 off or no candidates | `qa:waitlist:v2` + disable v2 on test WU |
| 12 | **Operator sign-off** | Named pilot owner approves live ranking |

### Known limitation — site-scoped program catalog (explicit deferral)

**Decision:** Site-scoped program / room / rate catalog is **out of scope** for this sprint and **not required** to close waitlist priority fact truth.

| Today | Future (facility / billing foundation sprint) |
|-------|-----------------------------------------------|
| Cohort picklists are **org-level** (childcare program option-set keys) | Site controls which rooms/programs/rates apply |
| Child site + cohort **consistency partially validated** (`validateChildPlacementScope`, drawer guardrails) | Full site ↔ classroom ↔ rate cross-validation |
| Intake + drawer can set site and cohort independently | Site-scoped catalog drives picklists and validation |

This sprint delivers **record-backed priority facts and child placement scope** — not billing, scheduling, capacity, or tuition rate modules.

### QA commands (final)

From repo root unless noted:

```bash
# Schema reference (after migration)
DATABASE_URL='…' npm run export:supabase-schema

# Candidate repair (from web/)
ORG_ID=<uuid> DRY_RUN=1 npm run dev:repair:placement-candidates
ORG_ID=<uuid> npm run dev:repair:placement-candidates

# Priority facts (pure + optional org repair probe)
cd web && npm run qa:waitlist:priority-facts
ORG_ID=<uuid> RUN_REPAIR_DRY_RUN=1 npm run qa:waitlist:priority-facts

# Waitlist V2 gate (dry-run backfill + queue probe)
cd web && npm run qa:waitlist:v2
ORG_ID=<uuid> RUN_BACKFILL=1 npm run qa:waitlist:v2   # optional apply

# Manual override browser gate
cd web && npm run qa:waitlist:override

# Unit tests (sprint bundle)
cd web && npm run test -- \
  tests/forms/intakeChildOcmFromForm.test.ts \
  tests/orchestration/placement/householdPlacementFacts.test.ts \
  tests/orchestration/placement/placementCandidateOcmRepair.test.ts \
  tests/admin/drawer/inquiryChildPlacementScope.test.ts \
  tests/admin/personEmployeePlacementFields.test.ts

cd web && npx tsc --noEmit
```

### Remaining deferred (blocks **live** ranking, not fact-truth foundation)

- **`shadow_mode: false`** on pilot work unit (checklist above)
- Preset tiers: sibling-waitlisted, accepted-not-started
- Site-scoped program / classroom / rate catalog
- Packet intake → OCM promotion (lead_capture only today)
- `add_to_waitlist_placeholder` real mutator
- Capacity / forecasting engine

### Recommended next sprint

**Waitlist live-ranking pilot** — run strict-mode checklist on Hayes/pilot org, enable `shadow_mode: false` on one work unit, ops sign-off, monitor override + activity. **Or** **facility catalog foundation** if product prioritizes site-scoped programs before live ranking.

---

## Validation (full sprint — 2026-05-28)

**Executed (Card 5 closeout):**

| Check | Result |
|-------|--------|
| `npm run qa:waitlist:priority-facts` | **9/9 pass** (Card 5 re-run) |
| Sprint unit test bundle (8 core files) | **39/39 pass** |
| `tsc` — sprint paths | **Clean** after `bulkLoadPlacementCandidatesByOpportunity` type fix |

**Pre-existing / unrelated `tsc` (not introduced by this sprint closeout):**

- `tests/forms/intakeCaseLifecycleEvents.test.ts` — tuple/type assertion errors
- `resolvePlacementCandidateCohortForQueue.ts` — `resolution_source` vs `ResolveProgramRoomCohortResult` (pre-existing)

**Historical validation (Cards 1–4):**

- `cd web && npm run test -- web/tests/orchestration/placement/householdPlacementFacts.test.ts`
- `cd web && npm run test -- web/tests/orchestration/placement/placementCandidateBackfill.test.ts`
- `cd web && npm run test -- web/tests/orchestration/placement/placementCandidateOcmRepair.test.ts`
- `cd web && npm run test -- web/tests/orchestration/placement/placementCandidateLoadDiagnostics.test.ts`
- Waitlist V1 fallback path preserved (`qa:waitlist:v2`)
- `cd web && npm run test -- web/tests/admin/drawer/inquiryChildPlacementScope.test.ts`
- `cd web && npm run test -- web/tests/admin/personEmployeePlacementFields.test.ts`
- `cd web && npm run test -- web/tests/forms/intakeChildOcmFromForm.test.ts`
