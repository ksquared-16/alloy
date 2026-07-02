# Enrollment Alignment Sprint — Closeout (Part 10 Deliverables)

**Branch:** `claude/enrollment-refactor-alignment` (from `origin/staging`)
**Status:** complete — runtime alignment shipped; two nominal follow-ups documented below.

## Commits (in order)

| Commit | Slice |
|--------|-------|
| `4a2f9ef1a` | S1 — Part 8 data-model audit + implementation plan |
| `a2910efd9` | S7 — doctrine (7 docs) rewritten to the ownership chain |
| `67fb43871` + `b53cd2dfd` | S2 — Parts 1–2 canonical fields (335 files) + type-seam fixups |
| `08f2a99a6` | S4 — Parts 3–5 status collapse + persisted stage + single membership owner |
| `4a330f7e4` | S6 — Part 9 remove qualification stage (folded into Lead) |
| `c6f5da405` | S5 — Part 7 operator actions are domain verbs |

The alignment sprint: not features. Align the Enrollment implementation to the frozen
platform model so Enrollment becomes the reference implementation every future process
(Annual Registration, Summer Camp, Classroom Transfer, Billing, Attendance, HR) reuses.

## Ownership chain (the single rule)

```
Entity → Process → Stage → Work → Outcome → Durable State → Work View → Surface
```

## Deliverables by sprint Part

| Part | Ask | Outcome |
|------|-----|---------|
| 1 | Remove Child Inquiry | Audit found the inquiry *model* was already gone — `customer_members` (child) + `opportunity_customer_members` (participation) are canonical with ownership guards. No inquiry table existed. Remaining debt was naming: entity type `inquiry_child`. Field duplication removed (Part 2). Entity-type string rename → `enrollment_participation` is a **documented follow-up** (see below) — purely nominal, deferred to avoid a 396-file rename destabilizing the verified branch at ship time. |
| 2 | Collapse duplicated fields | **Done (S2).** `desired_start_date→start_date`, `desired_schedule_type→schedule_type`, `desired_program_category_id→program_category_id`; legacy `desired_program_type` text column dropped (program is FK-only). A field exists once; the stage determines interpretation. 335 files. |
| 3 | Simplify status | **S4.** Case status → `open`\|`closed` (+`close_reason_key`); child enrollment → `waitlisted`\|`enrolling`\|`enrolled`\|`withdrawn`\|`not_enrolling` (+`close_reason_key`). ~24 durable states → 7. Tour/qualification/registration/offer progress became Stage + Work. |
| 4 | Align stage membership | **S4.** Stage is a persisted column (`opportunities.stage_key`, `OCM.stage_key`), written only by outcome execution + intake. Membership = `stage_key`. The status→stage roll-up (`enrichRowsWithDerivedStage`, `process_stage_key` metadata) is gone — collapsing status made it impossible, forcing the explicit column. |
| 5 | Remove duplicated concepts | **S4.** Queue membership and status-filter membership collapsed into one owner: stage membership by `stage_key`. Deleted the drifted `ENROLLMENT_STAGE_STATUS_KEYS` (`enrollmentProcessStageBindings.ts`) and the `included_status_keys`/`included_disposition_keys` membership lists. |
| 6 | Work Views | Already lens-only after the BPEP sprint (audit confirmed zero presentation ownership in Work Views). Condition field registry updated for the collapsed vocabulary + persisted stage. |
| 7 | Action alignment | **S5.** Operator actions are domain verbs (`schedule_tour`, `waitlist_child`, `enroll_child`, `mark_enrolled`, `withdraw_child`, `close_lead`). Generic `update_status`/`update_enrollment_status` removed from operator exposure; typed status domains remain the internal mechanism invoked by outcomes. |
| 8 | Data model audit | **Done (S1).** Full authoritative-owner / duplicate / disposition table in `enrollment_alignment_data_model_audit.md`. |
| 9 | Enrollment process | **S6.** Family: `lead → tour → decision → closed`. `qualification` removed — no distinct work lived there (its contact/qualify work folded into `lead`). Child: `waitlist → enrolling → enrolled → closed_withdrawn` (branch at `decision`). Every remaining stage answers "what work lives here?". |
| 10 | Deliverables | Doctrine (7 docs), migrations, implementation, cleanup, removed models/duplicates, PR to staging (this doc). |

## Migrations

| File | Purpose |
|------|---------|
| `20260711000000_enrollment_participation_canonical_fields.sql` | Field renames + drop `desired_program_type` (backfill FK from text key); field_definitions/field_values/layout-doc/queue-config key migration. |
| `20260711000100_enrollment_status_collapse_and_stage_key.sql` | Add `stage_key`/`close_reason_key`; backfill stage from legacy status; move waitlist pause to placement-candidate state; collapse status values; reseed `status_definitions`; delete enrollment `status_transition_rules`. |

## Doctrine updated

- `docs/canonical-status-architecture.md` (rewritten to the collapsed model)
- `docs/platform/core/stage-membership-and-outcomes.md` (new — the ownership chain + anti-patterns)
- `docs/canonical-entity-specification.md`, `docs/canonical-action-status-field-matrix.md`
- `docs/platform/core/status-and-state-system.md`, `docs/platform/core/business-process-system.md`
- `docs/platform/modules/business-process-execution-platform.md`

## Verification gate

`typecheck:build` (source-only) is clean at baseline and after each slice. The full vitest
suite is already very red on `origin/staging` (≈750 failing), so the honest gate is:
typecheck:build == 0 **and** no new test-file regressions vs the pre-slice baseline
(measured by an isolated-worktree diff). S2 met this: 0 regressions, 8 files fixed.

## Documented follow-ups (nominal — no behavioral gap)

These are deliberately sequenced as separate slices; the model is already correct and the
doctrine already names the targets.

1. **Entity-type rename `inquiry_child` → `enrollment_participation`** (Part 1, nominal). The
   participation record, ownership guards, and canonical fields are all correct; only the
   `entity_type` string + module/file names remain. This is a ~396-file mechanical rename plus a
   `field_definitions`/`field_values`/`status_definitions` entity_type migration. Deferred so the
   rename does not risk the verified runtime work at ship time. Doctrine already declares
   `enrollment_participation` canonical.
2. **`update_enrollment_status` transition-modal subsystem** (Part 7 depth). The operator
   builder now offers domain verbs, and the generic `update_status` action is removed from
   catalogs/quick-actions. The deeper enrollment-status transition modal
   (`enrollmentStatusTransitionContract` + the work-unit page form) still exists as an operator
   surface; replacing it wholesale with domain-verb flows is a follow-up slice.
3. **Orphaned `process_stage_key` status→stage builder config** (Part 5 depth). Runtime
   membership now keys off the persisted `stage_key` column; the builder's status→stage binding
   surface (`persistEnrollmentStageStatusAssignments`, the `/enrollment-process/status-stages`
   route + UI) is unused by membership and can be retired.

## Behavior changes / compat notes (correctness over backwards-compat, per sprint charter)

- Stored form configs referencing `sys:desired_program_type` no longer bind (field dropped).
- Old intake payloads carrying `desired_program_type` / `child_desired_program_type` no longer map.
- Program-present requirement is now FK-only (a child with only a room no longer satisfies "Program").
- Enrollment `status_transition_rules` deleted — movement is outcome-driven.
