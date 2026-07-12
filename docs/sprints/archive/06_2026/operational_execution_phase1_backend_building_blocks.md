# Operational Execution Platform — Phase 1 Backend Building Blocks (technical planning report)

**Status:** Planning only (June 2026). No code, migrations, schema, or runtime changes. This report maps backend building blocks for the first implementation arc: **L1 Configuration truth → L3 Schedule-derived Expectations → L4 Attendance facts → L5 Billing generalization**.

**Doctrine basis (locked, not revisited here):**
- [`docs/platform/core/operational-truth-flow-doctrine.md`](../../platform/core/operational-truth-flow-doctrine.md)
- [`docs/platform/modules/attendance-system.md`](../../platform/modules/attendance-system.md)
- [`docs/platform/modules/billing-financials-platform.md`](../../platform/modules/billing-financials-platform.md)
- [`docs/platform/core/operational-ux-doctrine.md`](../../platform/core/operational-ux-doctrine.md)
- [`docs/platform/core/placement-system.md`](../../platform/core/placement-system.md)
- [`docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/child_namespace_decision.md`](../../archive/2026-06-runtime-convergence/platform_convergence/child_namespace_decision.md) §6

---

## 1. Executive summary

The committed enrollment foundation shipped in slice 1 is the correct substrate, and it is richer than a typical CRM record set: it already encodes **effective-dated, supersede-only, event-emitting operational truth** with DB-enforced integrity. Phase 1 work should therefore **derive** from it, not re-model it.

Three findings drive the plan:

1. **L1 config rules are the real prerequisite, and they are missing as first-class entities.** Capacity, ratio, and schedule-rule configuration currently live as EAV location fields (`license_capacity`, `classroom_age_group`, `room_schedule_type` seeded in [`supabase/migrations/20260430211000_childcare_mvp_control_plane_seed.sql`](../../../supabase/migrations/20260430211000_childcare_mvp_control_plane_seed.sql)). Expected occupancy/ratio cannot be computed deterministically from EAV without drift. **First-class config rules must land first.**
2. **L3 Expectations are pure derivations** of `schedule_assignments` × `schedule_patterns.weekdays` × `child_placements` (room/program) × L1 rules. They require **no new tables** and must not get any. This is the lowest-risk, highest-signal first slice.
3. **L5 billing generalization is decoupled and can proceed in parallel after Phase 1/2**, because the existing financial stack already hints at the cutover: `charges.job_id` is `NOT NULL` (job-anchored), but `payment_allocations` already carries polymorphic `target_entity_type`/`target_entity_id` and a nullable `charge_id` with a migration comment naming a future "cutover" ([`supabase/migrations/20260331120000_charges_receivables_foundation.sql`](../../../supabase/migrations/20260331120000_charges_receivables_foundation.sql)). The generalization is an abstraction-and-relax exercise, not a rewrite.

Recommended sequencing: **Phase 1 (config + derived expectations, read-only)** → **Phase 2 (attendance facts + comparison service)** → **Phase 3 (billing generalization, no childcare billing UI)**.

---

## 2. Current canonical foundation

All four committed tables are defined in [`supabase/migrations/20260625120000_childcare_operational_enrollment_slice1.sql`](../../../supabase/migrations/20260625120000_childcare_operational_enrollment_slice1.sql). Row types: [`web/lib/childcareOperational/enrollmentOperationalTypes.ts`](../../../web/lib/childcareOperational/enrollmentOperationalTypes.ts).

| Table | Grain | Key columns (verified) | Notes |
|-------|-------|------------------------|-------|
| `child_enrollment_agreements` | child (`customer_member`) × site | `org_id`, `customer_member_id`, `site_location_id`, `status`, `start_date`/`end_date`, `opportunity_id`/`opportunity_customer_member_id` (provenance), `activation_policy_key`, `source_key`, `metadata` | Status: `pending_start|active|ending|ended|canceled`. Partial-unique: one operational row per child×site. Trigger enforces site `location_type='site'` and member/opp/OCM org consistency. |
| `child_placements` | per agreement, effective-dated | `enrollment_agreement_id`, `program_category_id` (FK `location_program_categories`), `room_location_id` (FK `locations` unit), `start_date`/`end_date`, `status`, `supersedes_placement_id` | Status adds `superseded`. Partial-unique: one operational placement per agreement. Trigger enforces room=`unit` under site and program belongs to site. |
| `schedule_patterns` | site catalog | `site_location_id`, `key`, `label`, `schedule_type_key`, `weekdays smallint[]` (0=Sun..6=Sat), `sort_order`, `is_active` | Config-posture RLS (`has_org_role`). `schedule_type_key` aligns to `childcare_schedule_type` option set. **This is the occupancy calendar source.** |
| `schedule_assignments` | per agreement, effective-dated | `enrollment_agreement_id`, `schedule_pattern_id` (FK RESTRICT), `customer_member_id`, `start_date`/`end_date`, `status`, `assignment_kind` (`base` only), `supersedes_assignment_id` | Partial-unique: one operational assignment per agreement. Trigger enforces pattern belongs to agreement site. |

Supporting runtime (all reusable patterns):

- **Effective-dating utilities:** [`web/lib/childcareOperational/effectiveDating.ts`](../../../web/lib/childcareOperational/effectiveDating.ts) — `computePriorRowCloseDate`, `isInvalidSupersedeStartDate`, `validateEndOnOrAfterStart`, `shouldTransitionAgreementEndingToEnded`, ISO-date guards.
- **Supersede service pattern:** [`web/lib/childcareOperational/scheduleAssignmentService.ts`](../../../web/lib/childcareOperational/scheduleAssignmentService.ts) and `childPlacementService.ts` — close prior (`status='superseded'`, `end_date=close`), insert successor with `supersedes_*`, emit changed event. This is the canonical write shape for any future fact stream.
- **Events:** [`web/lib/childcareOperational/operationalEnrollmentEvents.ts`](../../../web/lib/childcareOperational/operationalEnrollmentEvents.ts) over [`web/lib/emitEvent.ts`](../../../web/lib/emitEvent.ts) → `workflow_events` (`event_type`, `entity_type`, `entity_id`, `action_type`, `payload` with `schema_version`).
- **Read model:** [`web/lib/childcareOperational/operationalEnrollmentReadModel.ts`](../../../web/lib/childcareOperational/operationalEnrollmentReadModel.ts) — joins agreement + operational placement + assignment + pattern + labels + warnings. This is the template for the L3 derived read model.
- **Handoff (intent creation):** `approve_enrollment` → `enrollmentAgreementHandoff.ts` (`executeOperationalEnrollmentHandoffFromApprovedOpportunity`) invoked from [`web/lib/admin/actions/executeAdminAction.ts`](../../../web/lib/admin/actions/executeAdminAction.ts).
- **Child operational panel:** [`web/components/childcareOperational/ChildOperationalEnrollmentPanel.tsx`](../../../web/components/childcareOperational/ChildOperationalEnrollmentPanel.tsx) (flag-gated).

---

## 3. Existing systems to reuse

| Need | Reuse | Path |
|------|-------|------|
| Effective-dated supersede math | `effectiveDating.ts` (as-is) | `web/lib/childcareOperational/effectiveDating.ts` |
| Supersede-only write discipline | service shape from `scheduleAssignmentService.ts` | `web/lib/childcareOperational/*Service.ts` |
| Event emission | `emitEvent` + per-domain event-constants module mirroring `operationalEnrollmentEvents.ts` | `web/lib/emitEvent.ts` |
| Derived read model | join/label/warning shape from `operationalEnrollmentReadModel.ts` | `web/lib/childcareOperational/operationalEnrollmentReadModel.ts` |
| Site/room/program identity | `locations` (`site`/`unit`, `parent_location_id`), `location_program_categories` | slice-1 migration + program-categories migration |
| Schedule calendar source | `schedule_patterns.weekdays` × operational `schedule_assignments` | slice-1 migration |
| Option vocab | `option_sets` / `option_set_items` (`childcare_schedule_type`, `classroom_age_group`) | control-plane seed |
| RLS posture | config tables → `has_org_role(...)` (like `schedule_patterns`); operational tables → `user_roles` org membership + service-role | slice-1 migration RLS blocks |
| Integrity guards | BEFORE INSERT/UPDATE validation trigger pattern + `set_updated_at` | slice-1 migration triggers |
| Payment application (already polymorphic) | `payment_allocations.target_entity_type/target_entity_id` + nullable `charge_id` | charges-receivables migration |

---

## 4. Existing systems to avoid / off-limits

These are the **jobs/services vertical** and must not be reused, extended, or coupled to childcare work:

| Off-limits | Why | Path / evidence |
|------------|-----|-----------------|
| `schedules` | Job visit instances (`job_id`, `start_at`/`end_at`), not childcare enrollment schedule | schema CSV / job migrations |
| `assignments` | Vendor↔job staffing, not child↔pattern | schema CSV |
| `recurrence_plans`, `customer_subscriptions` | Job recurrence/subscription billing engine | schema CSV |
| `placement_candidates` (+ link groups/overrides) | **Waitlist/priority grain**, not committed placement; doctrine splits it from `child_placements` | `20260616120000_waitlist_placement_foundation.sql` |
| `pricing_*`, `service_pricing_rules`, `job_line_items`, `job_pricing_snapshots` | Cleaning/services pricing model | schema CSV |
| `jobs` | Service work order; **do not wrap an enrolled child in a job** to reuse billing | charges migration FK |
| `inquiry_child.*` namespace | Enrollment-only participation projection; new modules get their own context | `child_namespace_decision.md` §6 |

**Must be generalized, not reused as-is** (Phase 3): `charges` (relax `job_id NOT NULL`, add billable source), `ledger_transactions` / `gl_journal_lines` (add enrollment dimension), and the EAV capacity/ratio fields (`license_capacity`, `classroom_age_group`, `room_schedule_type`) which become first-class L1 config.

---

## 5. Required backend primitives

Grouped by layer. "New" = net-new entity/service; "Derive" = read model only; "Generalize" = modify existing.

### L1 Configuration (new, first-class — replaces EAV)
- `rate_rules` — tuition/rate by site × program × schedule-type, effective-dated. (Phase 3 consumer.)
- `ratio_rules` — required staff:child ratio by age-group/program (and jurisdiction), effective-dated.
- `capacity_rules` — licensed/operational seat limits by site, room (`unit`), and/or program.
- `schedule_rules` — eligibility/validity constraints over `schedule_patterns` (e.g. allowed patterns per program, min/max days). **Distinct from `schedule_patterns` (the catalog).**

### L2 Operational Intent (exists — reuse)
- No new primitives. `child_enrollment_agreements`, `child_placements`, `schedule_assignments`, `schedule_patterns`.

### L3 Operational Expectations (derive only — no SoT)
- `expectedOccupancyReadModel` — headcount by site/room/program/date from operational assignments × pattern weekdays × placement room, bounded by agreement/placement effective dates.
- `expectedRatioReadModel` — expected children per room/day vs `ratio_rules` → expected staffing demand and ratio compliance projection.
- `expectedAttendanceReadModel` — expected present-children per service day from schedule patterns (the target Phase 2 facts compare against).
- A **calendar expansion service** (pattern weekdays + date range → expected service days). Holiday/closure exceptions: see Open Questions.

### L4 Operational Facts (new — Phase 2)
- Attendance participation entity (own table; **attendance-child context**, own `{entity_type}.*` refKeys) — immutable, effective-dated, supersede-on-correct.
- Event kinds: presence (present/absent/excused), check-in/check-out (timestamped), room-transfer fact (intraday; distinct from placement supersede), schedule-override fact.
- Event constants module mirroring `operationalEnrollmentEvents.ts`; emission to `workflow_events`.

### L5 Operational Consequences (generalize — Phase 3)
- `billable_source` abstraction (`{type, id}`: `job` | `enrollment_agreement`) on `charges` (+ ledger/GL dimension).
- `financial_responsibility` (payer) abstraction — who owes (customer/person), subsidy split.
- Charge-generation service deriving charges from **attendance facts** (L4) × `rate_rules` (L1).
- Ledger/GL posting path generalized off `job_id`.

---

## 6. Phase 1 implementation slice (config + derived expectations)

**Goal:** Make occupancy/ratio computable from first-class config, and expose Schedule-derived Expectations as a read model. Prove L1 → L2 → L3 end-to-end.

**In scope**
- First-class L1 config tables: `capacity_rules`, `ratio_rules`, `schedule_rules` (and the `rate_rules` shell, even if unused until Phase 3), with config-posture RLS (`has_org_role`), validation triggers, and `set_updated_at` — modeled on `schedule_patterns`.
- Read-only services: `expectedOccupancyReadModel`, `expectedRatioReadModel`, `expectedAttendanceReadModel`, and the calendar-expansion helper, modeled on `operationalEnrollmentReadModel.ts`.
- Read-only API routes (GET) under `web/app/api/admin/operational-expectations/*`, org-scoped, privileged roles.
- Config admin surfaces may be deferred; backend + read model first.

**Explicit boundaries (per preferred first slice)**
- **No persisted expectation SoT.** Expectations are computed on read. No `expected_*` tables.
- **No attendance write UI / no attendance tables yet.**
- **No billing implementation.**
- EAV capacity fields remain readable for back-compat during transition; new computation reads first-class rules, not EAV. (Migration of EAV → first-class is a follow-on; do not dual-write.)

**Definition of done**
- Given seeded agreements/placements/assignments/patterns + config rules, the read model returns deterministic expected occupancy/ratio/attendance for a date range, recomputable and identical on repeat. Unit tests over the calendar expansion and bounding logic.

---

## 7. Phase 2 attendance slice (facts + comparison)

**Goal:** Introduce the keystone L4 fact stream and the expected-vs-actual comparison service.

**In scope**
- Attendance participation entity + supporting fact tables (immutable, effective-dated). Own entity type and refKey namespace per `child_namespace_decision.md` §6 (e.g. an `attendance`/attendance-day context — exact name is an Open Question).
- Event model: check-in, check-out, present/absent/excused, room-transfer, schedule-override. Corrections via supersede (new fact closing prior), never in-place edit.
- `workflow_events` emission via a dedicated event-constants module (mirror `operationalEnrollmentEvents.ts`).
- Write services modeled on `scheduleAssignmentService.ts` (supersede discipline), authored via the canonical action path.
- `expectedVsActualAttendanceService` — joins Phase 1 expected attendance with L4 facts to produce variance/absence signals (read model; observational only).

**Explicit boundaries**
- Attendance is **immutable events**, never mutable daily-status rows.
- Comparison service authors nothing; it reads L3 + L4.
- No billing derivation yet.

**Definition of done**
- Recording/correcting attendance produces immutable history + events; comparison service reports expected vs actual deterministically. Tests assert no in-place mutation and event emission.

---

## 8. Phase 3 billing generalization slice

**Goal:** Generalize the financial core off `job_id` before any childcare billing. **No childcare billing UI until the abstraction is approved.**

**In scope**
- `billable_source` abstraction: relax `charges.job_id` to nullable; add polymorphic `billable_source_type`/`billable_source_id` (`job` | `enrollment_agreement`). Leverage that `payment_allocations` already carries `target_entity_type`/`target_entity_id` + nullable `charge_id` (the migration comment already anticipates a charge-level cutover).
- `financial_responsibility` (payer) abstraction — responsible customer/person + subsidy split.
- Ledger/GL: add enrollment/agreement dimension to `ledger_transactions` / `gl_journal_lines` rather than tying to `job_id`.
- Compatibility path: existing job charges keep working (`billable_source_type='job'`); new code reads the abstraction. No data rewrite; backfill is additive.
- Charge generation derives from **attendance facts** (Phase 2) × `rate_rules` (Phase 1) — service + tests only, no UI.

**Explicit boundaries**
- One ledger/GL; no parallel childcare ledger.
- No charge derived from enrollment/intent; only from facts.
- No childcare billing operator UI in this slice.

**Definition of done**
- A charge can reference an `enrollment_agreement` billable source and post to one ledger/GL with an enrollment dimension; job charges unaffected; abstraction reviewed and signed off before UI work.

---

## 9. Open questions

1. **Capacity-rule grain.** Do `capacity_rules` key on site, room (`unit`), program category, or a composite? (EAV `license_capacity` is location-scoped today.)
2. **Ratio source of truth.** What maps age-group/program → required ratio (jurisdiction/state regulation)? Is `classroom_age_group` option set sufficient, or do we need a regulation table?
3. **`schedule_rules` vs `schedule_patterns` boundary.** Confirm `schedule_rules` = eligibility/validity (which patterns are allowed per program, min/max days) and `schedule_patterns` = catalog. Avoid a duplicate schedule concept.
4. **Calendar exceptions.** Where do holidays/closures live (org/site calendar) so expected attendance/occupancy excludes them? New L1 config, or deferred?
5. **Attendance grain + namespace.** Per-session/day fact vs per-check-in event vs both (session derived from events)? Exact participation entity name and refKey namespace (must satisfy `child_namespace_decision.md` §6).
6. **Attendance authorship.** Which canonical action(s) author attendance, and is there a daily-roster bulk path vs per-child?
7. **Expectation horizon.** Max date range / pagination for the read model; any caching needed before forecasting (cache is allowed but non-authoritative)?
8. **Billable-source scope.** Does Phase 3 introduce invoice/statement grouping, or is charge-level sufficient initially?
9. **Financial responsibility / subsidy.** Where is payer + subsidy split modeled (customer vs person; `customer.subsidy_status` EAV exists today)?
10. **EAV migration.** When/how do EAV capacity fields retire in favor of first-class rules (cutover vs coexist)?

---

## 10. Recommended Cursor / Claude build prompts (DO NOT EXECUTE YET)

Per [`docs/platform/governance/agent-repo-boundaries.md`](../../platform/governance/agent-repo-boundaries.md), the Cursor workspace owns scheduling/billing/attendance platform layers; these are scoped for this repo. Hold until config-rule grain (Open Questions 1-3) is decided.

**Prompt P1 — L1 config rules (Cursor):**
> Implement first-class L1 config tables `capacity_rules`, `ratio_rules`, `schedule_rules`, and a `rate_rules` shell, modeled on `schedule_patterns` (config-posture RLS via `has_org_role`, BEFORE INSERT/UPDATE validation triggers, `set_updated_at`, org+site scoping). Add row types and read/write services under `web/lib/childcareOperational/config/`. No EAV dual-write; no operator UI. Include migration + Vitest + `tsc --noEmit`. Honor truth-flow + placement doctrine.

**Prompt P2 — L3 derived expectations (Cursor):**
> Implement read-only `expectedOccupancyReadModel`, `expectedRatioReadModel`, `expectedAttendanceReadModel`, and a calendar-expansion helper deriving expected service days from operational `schedule_assignments` × `schedule_patterns.weekdays` × `child_placements`, bounded by effective dates and L1 `capacity_rules`/`ratio_rules`. No persisted expectation tables. GET API under `web/app/api/admin/operational-expectations/*`. Model on `operationalEnrollmentReadModel.ts`. Tests asserting determinism/recomputability.

**Prompt P3 — L4 attendance facts (Cursor):**
> Implement the attendance participation entity + immutable, effective-dated fact tables (presence, check-in/out, room-transfer, schedule-override) with supersede-on-correct services modeled on `scheduleAssignmentService.ts`, a dedicated event-constants module emitting to `workflow_events`, and own refKey namespace per `child_namespace_decision.md` §6. Plus `expectedVsActualAttendanceService` (read-only). No mutable daily rows; no billing.

**Prompt P4 — L5 billing generalization (Cursor):**
> Introduce `billable_source` (`job`|`enrollment_agreement`) and `financial_responsibility` abstractions: relax `charges.job_id` to nullable + add polymorphic billable-source columns; add enrollment dimension to `ledger_transactions`/`gl_journal_lines`; keep job charges working (compatibility path, additive backfill). Charge-generation service from attendance facts × `rate_rules`. No childcare billing UI. Stop for review before any operator surface.

---

## 11. Implementation status — Batch P1 (shipped)

**Status:** Implemented (June 2026). Backend primitives + derived read models + tests only. **No attendance/billing/subsidy UI, no operator surface, no job-vertical changes.** Hold attendance events (P3) for review.

This batch implements **Prompt P1 (L1 config rules)** and **Prompt P2 (L3 derived expectations)** above, with the grain ratified in [`operational_execution_config_rule_grain_decision_memo.md`](./operational_execution_config_rule_grain_decision_memo.md). Naming was prefixed `childcare_*` (e.g. `childcare_capacity_rules`) to keep config truth clearly namespaced and avoid any collision with off-limits job-vertical tables.

### Schema / tables added

Migration: `supabase/migrations/20260628120000_childcare_config_rules_phase1.sql`

| Table | Purpose |
| --- | --- |
| `childcare_capacity_rules` | Physical / licensed / operational seat limits. Retires the `license_capacity` EAV as operational truth. |
| `childcare_ratio_rules` + `childcare_ratio_rule_tiers` | Compliance staff:child ratios with **tiered thresholds** (e.g. 1↑5, 2↑11, 3↑16) keyed by age group (+ optional jurisdiction). |
| `childcare_operating_windows` | Per-weekday open/close windows (weekday 0–6, Sun=0). |
| `childcare_schedule_rules` | Operating policy/eligibility over `schedule_patterns`: eligible schedule types / age bands and min/max days. |

All scoped tables share `scope_type` (`org`/`site`/`program`/`room`) + nullable `site_location_id`/`program_category_id`/`room_location_id`, an `age_group_key` dimension, and `effective_start`/`effective_end`. Enforced by: a `*_scope_shape` CHECK (exactly one scope id per non-org scope), a shared `validate_childcare_config_scope()` BEFORE INSERT/UPDATE trigger (org match + `location_type` site/unit + program-category org match), `set_updated_at`, config-posture RLS (`has_org_role`: select owner/admin/ops/manager; mutate owner/admin/ops; delete owner/admin; `service_role` all), and grants.

**No expectation system-of-record table was created** (expectations are derived). **No off-limits table** (`jobs`, `schedules`, `assignments`, `recurrence_plans`, `customer_subscriptions`, `placement_candidates`, `pricing_*`, `inquiry_child`) is referenced — asserted by test.

### Services / read models added (`web/lib/childcareOperational/`)

- `config/configRuleTypes.ts` — row types + scope vocabulary (aligned to migration).
- `config/resolveConfigRule.ts` — **pure** most-specific-wins, effective-dated resolver (room > program > site > org; age-group narrows; latest `effective_start` wins). Single source of precedence.
- `config/ratioRules.ts` — **pure** tier logic: `requiredStaffForChildren`, `ratioLimitedCapacity`, `maxChildrenForStaff`.
- `config/capacityRules.ts` — **pure** capacity resolution + binding (most-restrictive of physical/licensed/operational/ratio-limited).
- `config/scheduleRules.ts` — **pure** eligibility + days-policy evaluation.
- `config/childcareConfigRuleService.ts` — org-scoped DB fetchers + `loadChildcareConfigRuleBundle`.
- `expectations/scheduleExpectationCore.ts` — **pure** derivation primitives: `expandExpectedAttendance` (assignment × pattern weekdays × placement, bounded by effective dates), `aggregateExpectedOccupancyByRoomDate`, `computeExpectedStaffingByRoomDate`, `enumerateDates`/`weekdayOf`.
- `expectations/buildScheduleExpectations.ts` — **pure** assembler → read model (attendance, occupancy, staffing) + warnings (`capacity_exceeded`, `schedule_type_ineligible`, `age_group_ineligible`, `missing_placement_room`, `pattern_weekday_outside_operating_window`, `days_policy_violation`).
- `expectations/fetchScheduleExpectations.ts` — DB wrapper (operational rows + config bundle → assembler).

### Tests added (`web/tests/childcareOperational/`)

- `config/resolveConfigRule.test.ts` — inheritance resolution (org→site→program→room), age-group narrowing, effective dating.
- `config/ratioRules.test.ts` — tiered threshold staffing + ratio-limited capacity.
- `config/childcareConfigRulesMigration.test.ts` — migration shape: 5 tables, scope shape, shared trigger, RLS posture, **no expectation SoT table**, **no job-vertical leakage**.
- `expectations/scheduleExpectations.test.ts` — expected attendance derivation, occupancy aggregation, staffing, capacity/missing-room warnings, "derived-only (no SoT)" shape.

### Validation results

- `npx tsc --noEmit` — no errors in any new file (pre-existing unrelated errors remain).
- `npx vitest run tests/childcareOperational/config tests/childcareOperational/expectations` — **39 passed**.
- `npx eslint` on new dirs — clean.
- Full `tests/childcareOperational` — 140 passed; the only 3 failures are pre-existing env-dependent integration tests (`createAdminClient` requires `SUPABASE_URL`), unrelated to this batch.

### Intentionally unbuilt (deferred)

- **Attendance facts (L4)** — no attendance/check-in/out/transfer/absence tables or events. Phase 1 deliberately leaves the attendance event surface open (room-transfer fact distinct from placement supersede).
- **Billing / financial resolution (L5)** — no `rate_rules`, no `billable_source`, no `charges` changes, no childcare billing. Rate/charge/financial/posting distinction preserved in doctrine only.
- **Subsidy** — none. Processing vs operational vs financial-resolution split preserved in doctrine only.
- **Materialized expectation cache** — not implemented (deterministic recomputation only), per doctrine; revisit only if forecasting demands it.
- **Time-block occupancy/ratio** — only **day-level** occupancy/staffing is derived, because `schedule_patterns` carry weekdays but no intra-day time blocks. Operating windows exist but per-block occupancy is deferred until patterns carry time blocks.
- **Room consolidation / expansion rules** — not modeled as a dedicated table; `metadata` jsonb on rule tables is the extension hook. Revisit when consolidation policy is specified.
- **Age-group wiring** — the assembler accepts `ageGroupByRoomLocationId`/`ageGroupByProgramCategoryId` maps but does not yet source them from the EAV `classroom_age_group` field; wiring is a follow-on.
- **API route / operator surface** — `fetchScheduleExpectations` exists but is not exposed via an API route or UI yet.

### Conflicts with doctrine

None. No EAV dual-write, no expectation persistence, no job-vertical tables, no `inquiry_child` extension. Expectations remain derived/non-authoritative.

### Recommended next batch

1. **Wire age-group resolution** from location/program config into `fetchScheduleExpectations` (removes the only "unknown age group" gap in ratio/eligibility derivation).
2. **Expose a read-only GET API** for expectations (`web/app/api/admin/operational-expectations/*`), reusing `fetchScheduleExpectations`. Read-only; no UI.
3. **Then** open the **L4 attendance facts** batch (Prompt P3) for separate review — immutable, effective-dated, event-emitting, with room-transfer facts distinct from placement supersede.

---

## 12. Implementation status — Batch P1.1 hardening (shipped)

**Status:** Implemented (June 2026). Wires canonical age-group resolution, exposes a read-only expectations API, adds an idempotent dev fixture, and confirms the P1 migration applies cleanly. **No attendance, billing, or subsidy. No materialized cache. No UI. No job-vertical tables. Expectations remain derived/non-authoritative.**

### Files changed / added

| File | Change |
| --- | --- |
| `web/lib/childcareOperational/expectations/resolveExpectationAgeGroups.ts` | **new** — canonical age-group loader. |
| `web/lib/childcareOperational/expectations/fetchScheduleExpectations.ts` | wires the loader (scoped to the actual placement room/program ids); caller may still override. |
| `web/lib/childcareOperational/expectations/buildScheduleExpectations.ts` | program-category-first age precedence; new `missing_age_group` warning. |
| `web/app/api/admin/operational-expectations/route.ts` | **new** — read-only GET API. |
| `web/lib/dev/seedChildcareConfigRulesDemo.ts` | **new** — idempotent dev fixture for P1 config rules. |
| Tests (4 new files) | age-group resolution, API smoke, fixture, + assembler additions. |

### API route added

`GET /api/admin/operational-expectations` — auth via `getAdminContextCached` (read access), org-scoped via `ctx.orgId`. Params: `site_location_id` (required), `date_start`/`date_end` (optional; default org-local today + 14-day window; max 92 days). Returns `{ expectations: { expectedAttendance, expectedOccupancyByRoomDate, expectedStaffingByRoomDate, warnings }, range }`. Errors mapped via `operationalEnrollmentErrorResponse`. Read-only — no POST/PUT/DELETE.

### Age-group source used (canonical, no hardcoded month bands)

Per child, resolved from the **committed placement’s `program_category_id` → `location_program_categories.key`** (`infant`/`toddler`/`preschool`/`pre_k`/`school_age`). The child is a `customer_members` row reached via `child_enrollment_agreements`; its operational age band is the program category it is placed into. **Fallback:** the room’s configured band from location `field_values` (`classroom_age_group`, then `childcare_program_type`). When neither resolves for a placed child, the assembler emits a `missing_age_group` warning (no crash). DOB→month-band classification is intentionally **not** introduced (would require tenant age-band thresholds not yet modeled).

### Fixtures added

`seedChildcareConfigRulesDemo(supabase, orgId, siteLocationId)` — idempotent (skips when a demo ratio rule already exists for the site via a `metadata.seed_key` marker). Seeds a site ratio rule with tiers (1↑5 / 2↑11 / 3↑16), Mon–Fri operating windows (07:00–18:00), a site operational capacity (60), and a 1–5 days/week schedule policy. Dev-only library function (not wired to any endpoint).

### Tests run / results

- `npx vitest run` on config + expectations + route + fixture suites: **54 passed** (7 files).
- New coverage: age-group resolution from canonical program-category/room data; API returns attendance/occupancy/staffing (+401/400/range cases); **missing age group → warning, not crash**; program-category-over-room precedence; fixture idempotency + payloads. Existing P1 "no expectation SoT" + "no job-vertical leakage" migration assertions still pass.
- `npx tsc --noEmit`: no errors in any new/changed file. `eslint`: clean.

### Migration apply result

Applied `supabase/migrations/20260628120000_childcare_config_rules_phase1.sql` to a throwaway Postgres (with minimal prerequisite stubs) — **applies cleanly**: 5 `childcare_*` tables, 25 RLS policies (5 × 5), 9 triggers (5 `updated_at` + 4 shared scope-validation; tiers correctly has no scope trigger). Functional checks confirmed: valid scoped inserts succeed; the `scope_shape` CHECK rejects mismatched scope ids; the `validate_childcare_config_scope` trigger rejects a room id that is not `location_type = unit`; the tier `UNIQUE (ratio_rule_id, max_children)` rejects duplicates. (Live staging/prod apply remains a deploy step: `supabase db push`.)

### Intentionally unbuilt (unchanged from P1, reaffirmed)

Attendance facts/events (L4); billing / financial resolution (L5); subsidy; materialized expectation cache; intra-day time-block occupancy/ratio (day-level only); dedicated room consolidation/expansion table (metadata hook); any operator UI. The expectations API has no consumer surface yet by design.

### Recommendation for P2 (Attendance facts)

Open the **L4 attendance facts** batch as a separate, reviewable unit. It should: (1) add immutable, effective-dated, event-emitting fact tables (presence/check-in/out, **room-transfer as a fact distinct from placement supersede**, absence, schedule-override) under their own refKey namespace per `child_namespace_decision.md` §6, modeled on `scheduleAssignmentService.ts` (supersede-on-correct) with a dedicated event-constants module emitting to `workflow_events`; (2) add a read-only `expectedVsActualAttendance` service that diffs the P1 expectations against facts (reusing `fetchScheduleExpectations`); (3) reuse the P1 age-group/ratio resolution for actual-occupancy staffing; (4) **not** touch billing, subsidy, or job-vertical tables, and **not** introduce mutable daily rows. Stop for review before any operator surface.

---

## 13. P2 implementation status — Attendance Facts foundation (L4)

**Status:** Implemented (backend only). Doctrine: `docs/platform/modules/attendance-system.md` → [Implemented model (P2)](../../platform/modules/attendance-system.md#implemented-model-p2).

### What P2 added

**Schema** — `supabase/migrations/20260629120000_childcare_attendance_facts_p2.sql`

- One **immutable, append-only** table `child_attendance_events`. No mutable daily row. References the committed foundation (`child_enrollment_agreements`, `customer_members`, `locations`) only.
- DB-enforced append-only via a `BEFORE UPDATE OR DELETE` trigger (`prevent_child_attendance_events_mutation`, raises `0A000` for all roles). Corrections/reversals are new rows linked by `corrects_event_id` (`entry_type ∈ {original, correction, reversal}`); the original always remains.
- `event_kind ∈ {check_in, check_out, absence, present, room_transfer, schedule_override}`; multiple in/out per day; `room_transfer` (from/to rooms) is a fact that does **not** supersede `child_placements`.
- Actor context (`staff/parent/guardian/emergency_contact/system`) + source context (`operator_action/staff_workspace/parent_portal/processing_import/system`) — future intake channels representable today (preserves subsidy/import reporting path).
- `BEFORE INSERT` validation trigger (org/agreement/member/site consistency; room must be a `unit` under the site; correction targets same org+agreement). RLS operational posture (org-scoped SELECT, owner/admin/ops INSERT, `service_role` ALL); grants SELECT+INSERT to `authenticated`, ALL to `service_role`. No UPDATE/DELETE grants.

**Services** — `web/lib/childcareOperational/attendance/`

- `attendanceVocabulary.ts`, `attendanceTypes.ts` — shared vocab + row/input shapes (DB-aligned).
- `attendanceService.ts` — `recordAttendanceEvent`, `correctAttendanceEvent`, `listAttendanceEvents`, `getAttendanceEventById`, `assertNoAttendanceMutation`. Every write emits a workflow event.
- `attendanceEvents.ts` — `attendance_event_recorded` / `_corrected` / `_reversed` (versioned, entity type `child_attendance_events`).
- `attendanceFold.ts` (pure) — fold events → effective facts + per-day summaries (applies corrections/reversals).
- `expectedVsActual.ts` (pure) — diff L3 expected vs L4 folded facts (`expected_not_checked_in`, `checked_in_not_expected`, `absent`, `late_arrival_unknown_time`, `missing_checkout`, `room_mismatch`).
- `fetchExpectedVsActual.ts` — composes `fetchScheduleExpectations` + `listAttendanceEvents`.

**APIs** — `GET/POST /api/admin/childcare-attendance` (list / record / correct / reverse); `GET /api/admin/childcare-attendance/expected-vs-actual` (read-only diff).

**Tests** — `web/tests/childcareOperational/attendance/` (37 tests): fold (corrections supersede, reversal voids, correction-of-correction, multi in/out, room transfer, absence), expected-vs-actual variances, service (append-only insert + event emission, correction/reversal, kind validation, canceled-agreement guard, varied actor/source), and a migration-shape test (append-only, no `updated_*`, prevent-mutation trigger, by-reference corrections, RLS/grants, no expectation SoT, no job/proposal leakage). Plus DB-level functional apply check on a throwaway Postgres: UPDATE/DELETE blocked, corrections insert, transfer/room/entry-link constraints + validation trigger all fire.

### Validation

`npx tsc --noEmit`: no errors in any new/changed file (pre-existing repo errors unrelated). Attendance suite: 37/37 pass. P2 migration applies cleanly with slice1 (RLS/triggers/grants verified).

### Intentionally unbuilt (P2)

Attendance UI / operator surface; billing & financial coupling (L5); subsidy-specific implementation (path preserved via `source_type` + immutable history); materialized/aggregated attendance rollups; ratio-compliance evaluation over actuals; intraday time-block occupancy. No mutable daily attendance row by design.

### Doctrine conflicts

None. P2 honors append-only immutability, derived (not stored) expectations, committed-foundation references, room-transfer ≠ placement supersede, and the child-namespace rule (own `child_attendance_events` entity type; no `inquiry_child` reuse).

### Recommended next batch (P2.1 / P3)

- **P2.1 (harden attendance):** org-local service-date derivation helper for write paths; absence/excused reason vocabulary as config; attendance read model for the child drawer Attendance tab data contract (still no UI); compliance-over-actuals (required vs actual staffing) as a pure read model reusing P1 ratio tiers.
- **P3 (billing generalization, L5):** begin the `billable_source` abstraction off `job_id` per `billing-financials-platform.md`, with attendance facts as the first billable source — before any childcare-specific billing.

---

## 14. P2.1 implementation status — Attendance hardening + actual compliance read models

**Status:** Implemented (backend/read-model only). Doctrine: `docs/platform/modules/attendance-system.md` → [Hardening + actual compliance (P2.1)](../../platform/modules/attendance-system.md#hardening--actual-compliance-p21). **No new migration** — reuses the P2 `reason_key` column. No UI, billing, subsidy, materialized rollups, mutable rows, or staff-scheduling tables.

### What P2.1 added

**Org-local service date** — `attendance/attendanceServiceDate.ts`: pure `serviceDateForInstant(eventAtIso, timeZone)` (via `date-fns-tz`, the existing operational tz helper `fetchOrgTimeZoneIana`) + async `resolveAttendanceServiceDate`. `RecordAttendanceEventInput` now takes either `serviceDate` or `timeZone` (one required); the service derives the local day from `eventAt` when only `timeZone` is given. The POST route defaults `service_date` from the org timezone.

**Absence reasons** — `attendance/attendanceAbsenceReasons.ts`: code-owned controlled vocabulary (`ABSENCE_REASONS`, `isAbsenceReasonKey`, `classifyAbsenceReason`, `isExcusedAbsence`) stored via `reason_key`. Excused/unexcused/unspecified is **operational metadata only — no billing/subsidy semantics**. The service validates `reason_key` on `absence` facts.

**Actual compliance (pure)** — `attendance/actualCompliance.ts`: `aggregateActualOccupancyByRoomDate` (distinct children observed per room/date; day-level union, point-in-time deferred), `computeActualStaffingByRoomDate` (reuses P1 `requiredStaffForChildren` + tiers), `computeActualCompliance` (staffing gap, over-capacity, understaffed; missing staff data → `null` gap + `staff_data_unavailable`, never a failure). `attendance/buildActualComplianceReadModel.ts` + `fetchActualComplianceReadModel.ts` assemble the site-level model and surface `room_mismatch` from the existing diff.

**Child-drawer read-model contract (pure)** — `attendance/childAttendanceReadModel.ts`: `buildChildAttendanceReadModel` deterministically projects expected attendance, actual presence summary, current presence state, check-in/out timeline, room-movement timeline, classified absences, corrections audit trail, expected-vs-actual variances, and room-scoped compliance context. Defines the future Attendance tab / Focus Panel data shape — no UI built.

**Shared resolution (refactor, no behavior change)** — `config/roomConfigResolvers.ts` (room→scope context + tier/capacity closures) and `expectations/loadOperationalExpectationInputs.ts` (committed-rows + config + age-group loader). `buildScheduleExpectations` / `fetchScheduleExpectations` were refactored onto these so L3 expected and L4 actual resolve identically.

**API** — `GET /api/admin/childcare-attendance/actual-compliance` (read-only site occupancy/staffing/compliance over a date range).

### Tests — `web/tests/childcareOperational/attendance/` (66 attendance tests total, all pass)

New P2.1 coverage: service-date across a timezone boundary; absence-reason validation + classification (and that classification carries no billing fields); actual present count from event fold; room-transfer changing room occupancy; required staff from actual count + ratio tiers; missing staff data → placeholder (not failure); over-capacity + understaffed warnings; child read-model determinism (order-independent); service hardening (derive vs explicit service date, reject when neither, accept/reject absence reason); doctrine source-scan (no job-table leakage, no mutation paths, staff placeholder semantics). Existing P1/P2 expectations + attendance suites unchanged and green after the refactor.

### Validation

`npx tsc --noEmit`: zero errors in any P2.1 or `childcareOperational` file (the only reported errors are pre-existing in unrelated `tests/layout`, `tests/lifecycle`, `tests/pos`). `childcareOperational` suite: 221/224 pass; the 3 failures are pre-existing environment/runtime tests (missing `SUPABASE_URL`; two `.tsx` rendering tests) unrelated to this batch.

### Local-date behavior

A single UTC instant maps to different service days by site timezone (e.g. `2026-06-15T06:00:00Z` → `2026-06-14` in `America/Los_Angeles`, `2026-06-15` in `America/New_York`/UTC). Writes persist the resolved local `service_date`; all folding/diffing/occupancy keys on it, so reads are already org-local without re-deriving.

### Read-model contract summary (child drawer)

`ChildAttendanceReadModel` = `{ customerMemberId, expectedAttendance[], actualPresenceSummary[] (per day), currentPresenceState {state: present|checked_out|absent|no_record, serviceDate, roomLocationId}, checkInOutTimeline[], roomMovementTimeline[], absences[] (classified), corrections[] (audit trail), expectedVsActualVariances[], actualComplianceForRooms[] (room-scoped context) }`. Pure and deterministic; effective events drive timelines while corrections list the full restatement history.

### Actual compliance outputs

Per room/date: `actualChildCount`, `requiredStaff` (+`exceedsDefinedTiers`), `staffOnHand` (nullable placeholder), `staffingGap` (null when staff data absent), `staffDataAvailable`, `capacityBinding`, `overCapacity`. Warnings: `over_capacity`, `understaffed`, `staff_data_unavailable`. Plus `roomMismatches` (from the diff).

### What remains intentionally unbuilt (P2.1)

Attendance UI / Focus Panel rendering; staff scheduling tables (only placeholder `staffOnHandByRoomDate` interface); billing & financial resolution (L5); subsidy implementation (path preserved); materialized expectation/attendance rollups; intraday time-block (point-in-time) occupancy/ratio — day-level only.

### Ready for P3 billing generalization?

Yes. Attendance facts are immutable, append-only, event-emitting, org-local-dated, and folded into deterministic effective state + variance/compliance read models referencing only the committed foundation (no job-vertical coupling). P3 can introduce the `billable_source` abstraction with attendance facts as the first billable source per `billing-financials-platform.md`, before any childcare-specific billing.

---

## When this report must be updated

Config-rule grain decisions (Open Questions 1-3), attendance grain/namespace decision, or any change to the phase boundaries.
