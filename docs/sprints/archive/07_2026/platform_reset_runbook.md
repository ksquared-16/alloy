# Platform Reset + Operational Validation — Runbook & Status

Crossing from platform construction to platform operation. This records what is code-complete on
the branch vs. what must run on your live stack (this sandbox has no running app/DB — see
`enrollment_status_refactor_validation.md` for why). "Do not preserve legacy" was applied: where the
implementation conflicted with BPEP doctrine it was aligned, not preserved.

## Part 1 — Merge + migration ✅ (code) / ▶ (infra is yours)
- **PR #66 merged into `staging`** (merge commit `b42f05cf5`).
- Migration order (all present on staging):
  1. `20260423143000_opportunity_identity_seed_childcare_org.sql` (pre-existing config + the Rivera auto-seed)
  2. `20260711000000_enrollment_participation_canonical_fields.sql`
  3. `20260711000100_enrollment_status_collapse_and_stage_key.sql`
  4. `20260712000000_remove_auto_seeded_identity_demo.sql` (new — removes the Rivera business rows)
- Runtime compiles: `typecheck:build`=0; Vercel production builds pass. CI `typecheck` (full `tsc` incl.
  tests) is red at baseline (~85 errors, pre-existing repo condition) — not a regression.
- **You run:** `supabase db push` against staging; confirm no failures / no pending schema. `stage_key`,
  `close_reason_key`, canonical fields (`start_date`/`schedule_type`/`program_category_id`), and the
  collapsed `status_definitions` all ship in migrations 000000/000100.

## Reset Operational State — script (new)

`web/scripts/resetOperationalState.ts` (`npm run dev:reset:operational-state`) — **delete instances,
keep the operating system.** Dry-run by default; `--execute` requires
`CONFIRM_RESET_OPERATIONAL_STATE=true` + `RESET_ORG_ID` + `SUPABASE_SERVICE_ROLE_KEY`; refuses
production. It delegates deletion to the vetted, **config-preserving** `enrollment_runtime_reset`
path (preserves `departments`/`work_units` = BP/Work View/stage config, persons/customers linked to
non-target records, and locations; scopes `field_values` deletes to operational entity types), then
**verifies**: config tables (`departments`, `work_units`, `status_definitions`, `field_definitions`,
`locations`, `action_definitions`, `entity_layouts`, …) still populated AND enrollment-core operational
tables (`opportunities`, `opportunity_customer_members`, `operational_tasks`, **`process_instances`**) empty
— failing the run if configuration was lost or operational rows remain.
- **You run (dev/staging):** `npm run dev:reset:operational-state` (dry-run, review the plan), then
  `CONFIRM_RESET_OPERATIONAL_STATE=true RESET_ORG_ID=<org> npm run dev:reset:operational-state -- --execute`.
- Deletion logic validated by reuse (the underlying execute path is production tooling); SQL of the
  new auto-seeder cleanup migration was validated in an isolated scratch schema.

## Part 2 — Clean environment ✅ (code) / ▶ (run against your DB)
- **No automatic business seeders remain.** The sole auto-seeder (migration `20260423143000`, Rivera
  family) is now neutralized by migration `20260712000000`; all `seed*`/`demo:*`/`dev:tenant:childcare`
  are explicit commands (Phase 3). No startup/bootstrap/background job creates records.
- **Clean-slate command already exists:** `DEMO_CLEANUP_CONFIRM=DELETE_DEMO_RUNTIME_DATA
  DEMO_RESET_ORG_ID=<org> npm run demo:cleanup:execute` (FK-safe, org-scoped, logged) — or
  `npm run demo:reset`. Run it once to empty operational tables (leads, opportunities, OCM, tasks,
  work, comms, notes, timeline, placements, candidates, projections).
- Chen/Case Family come **only** from explicit `npm run dev:seed:enrollment-demo-data`; don't run it if
  you want an empty system.

## Part 3 — Canonical data model ✅ (verified in code, PR #66 + Phase 1–2)
One owner, no duplicate models: child profile = `customer_members`; participation = `opportunity_customer_members`;
case = `opportunities`. No inquiry model/table; no child-inquiry runtime; no duplicate enrollment fields
(collapsed in `20260711000000`); status ownership single (durable `status_key`/`outcome_status_key` +
`close_reason_key`, position = `stage_key`). Nominal `inquiry_child` entity-type string is the only
remaining name (rename deferred; documented).

## Part 4 — Remaining legacy: removed / isolated / documented
- **Removed:** `ENROLLMENT_STAGE_STATUS_KEYS`/status-derived membership, generic operator `update_status`,
  `qualification` stage, deleted status writes in operating plans / action map / packet flows (S8).
- **Isolated (legacy-compat, alias-on-read, reject-on-write):** `child_inquiry.*` refKeys,
  `enrollmentLegacyCompat` maps.
- **Documented, not yet removed (need live validation / broader slice):**
  `enrollmentPipelineQueueDefinitionV1/V2` status-based lanes (see Part 5/6 note), the
  `update_enrollment_status` transition-modal UI subsystem, orphaned `process_stage_key` builder config,
  `inquiry_child`→`enrollment_participation` rename. Each is a self-contained follow-up.

## Part 5/6 — Create Lead + stage membership (code-correct; ▶ verify on live)
Create Lead writes `status_key=open`, `stage_key=lead`, child `outcome_status_key=null`. The
projection/work-view path is stage-based: `enrichRowsWithDerivedStage` reads `stage_key`, work-view
filters use `opportunity_stage` (runtime-supported). Outcome execution writes durable state + moves
`stage_key` (canonical flow, no status-list membership).
- **Fixed this pass:** the default Work View seed filtered on the stage *label* instead of the stage
  *key* — it would have matched nothing. Now uses the key.
- **Fixed this pass (Task 8):** the default Work View compat seed filtered on the stage *label*
  (`"New Lead"`) instead of the stage *key* (`lead`); the runtime matches the key, so seeded Work Views
  matched nothing. Now uses the key (test-locked).
- **Follow-up requiring your stack:** the legacy `enrollmentPipelineQueueDefinition` lanes still filter by
  `case_status`/`child_lifecycle_status`. A newly created lead (`status_key=open`) DOES appear in the
  `new_leads` lane via its `open` value, so it is not invisible — but post-collapse every open case is
  `open`, so those status lanes can no longer *separate* lead/tour/decision. The doctrine path (work
  views/projection) is stage-based and correct; the legacy queue V2 runtime has no `stage` filter type,
  so cutting its lanes to `stage_key` means adding a `stage` filter type + evaluator support. Deferred as
  a discrete change because it touches load-bearing queue runtime that must be validated on a live stack
  (which path renders is org/flag dependent — settle with acceptance SQL check `B`).

## Part 7 — Builder V2 (▶ live UI verification is yours)
Persistence contracts (grain, work, outcomes, requirements, work views, surfaces, actions) are wired and
type-clean; dirty-state/stale-UI behavior can only be verified by driving the Builder UI on a running app.

## Part 8 — Work View ownership ✅ (code)
Work Views own included stages / grouping / filters / sort / surface assignment (`workViewsConfigV1`,
`resolveWorkViewRuntimeContext`). They do **not** own membership (that's persisted `stage_key`),
presentation, columns, or durable state — surfaces own presentation (`surfaceLayoutRegistry`).

## Part 9 — Enrollment process default ✅ (code)
New Lead → Tour → Placement/Decision → Closed (family) + Waitlist → Enrolling → Enrolled →
Closed/Withdrawn (child branch at decision). `qualification` removed (folded into Lead's `qualify_fit`
work). Every stage carries work or is a deliberate terminal/steady bucket.

## Part 10 — Operational acceptance test ▶ (yours; harness provided)
Cannot run in this sandbox (no live stack). Execute `enrollment_operational_acceptance_test.md`
(10-step scenario + read-only verification SQL) against a seeded tenant. Its SQL check `B` is exactly how
you confirm whether the Part 5/6 lane follow-up is an active outage for your org.

## Part 11 — Terminology sweep ▶ (not done this pass — scoped follow-up)
Operator-facing `pipeline`/`update status`/`inquiry child` are largely gone from active surfaces (Phase 0).
A full operator-facing rename of `opportunity`→Lead and `drawer`→Focus Panel across UI copy is a broad,
label-only sweep best done as its own slice with visual review — deferred to avoid unvalidated churn.
Note: per prior guidance, "drawer" in real file/module names stays; only reporting/operator copy changes.

## Part 12 — Deliverables summary
- Merge commit: `b42f05cf5` (PR #66). Follow-up branch: `claude/platform-reset-validation`.
- Migrations applied order: see Part 1. New: `20260712000000` (auto-seeder removal).
- Seed sources: audited (Phase 3); auto-seeder gated; clean-slate command documented.
- Legacy: removed/isolated/documented (Part 4).
- Runtime/Builder/Work Views: code-verified; live UI verification is yours.
- Enrollment configured: default process is code-correct; live configuration via Builder is yours.
- End-to-end scenario: harness delivered; run on live stack.
- **Remaining blockers to a fully green live E2E:** (1) confirm/execute the legacy-lane→`stage_key`
  cutover for your org; (2) `db push` + `demo:cleanup:execute` on staging; (3) drive the 10-step
  acceptance test and file any runtime failures.
