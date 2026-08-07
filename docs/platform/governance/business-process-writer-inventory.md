# Business Process configuration — writer inventory

Law 4 completion. Every code path that can durably write `departments.metadata.lifecycle_builder_v1`,
classified for convergence onto the publication boundary.

Companion: [`configuration-publication-model.md`](./configuration-publication-model.md).
Guard: `supabase/migrations/20260730130000_business_process_projection_write_guard.sql`.

**Classification:** A draft writer · B publish writer · C bootstrap/seed (creation only) ·
D migration/repair utility (explicit, privileged, audited) · E unsafe bypass (block) ·
F unrelated department-metadata writer (must keep working).

**Guard semantics these classifications assume:** `BEFORE INSERT OR UPDATE` on `departments`;
passes when `metadata->'lifecycle_builder_v1'` is `IS NOT DISTINCT FROM` its old value; passes on
`INSERT`; passes when the old value is `NULL` (initialization); otherwise requires the
`alloy.lifecycle_write` token.

## A. Writers that touch `lifecycle_builder_v1`

Columns: **R** reads first · **U** preserves unknown fields · **CAS** carries a revision token ·
**RT** becomes runtime truth instantly · **WC** can replace the whole `metadata` column.

| Path : line | Cls | R | U | CAS | RT | WC | Disposition |
|---|---|---|---|---|---|---|---|
| `lib/lifecycle/persistWorkViewsV1.ts:56` | B | caller | yes | no | yes | derived | → publish |
| `lib/lifecycle/persistParticipationV1.ts:45` | B | caller | yes | no | yes | derived | → publish |
| ~~`lib/lifecycle/persistPerspectivesV1.ts:82`~~ | — | — | — | — | — | — | **MIGRATED** — file deleted; now `applyStagePerspectivesDraft` |
| ~~`lib/lifecycle/persistStatusRollupV1.ts:90`~~ | — | — | — | — | — | — | **MIGRATED** — writer removed; now `applyStatusRollupDraft` + a status-assignment companion |
| ~~`lib/lifecycle/persistQueueMembershipV1.ts:163`~~ | — | — | — | — | — | — | **MIGRATED** — writer removed, **auto-seed deleted**; now `applyQueueMembershipDraft` (explicit only) |
| ~~`lib/lifecycle/persistStageOperatingPlanV1.ts:125`~~ | — | — | — | — | — | — | **MIGRATED** — writer removed, **auto-seed deleted**; now `applyStageOperatingPlanDraft` (explicit only) |
| ~~`lib/lifecycle/persistStageV2DraftFields.ts:122`~~ | — | — | — | — | — | — | **MIGRATED** — writer removed (module is parse-only); now `applyStageV2DraftFields`. Its `ensureBuilderCommandSetsOnSave` process-level stamp is gone too |
| `app/api/admin/departments/[id]/lifecycle-builder/route.ts:103` PATCH | B | yes | yes | no | yes | derived | → draft + publish (primary structural editor) |
| `app/api/admin/lifecycle-builder/process-work-views/route.ts:126` POST | B | yes | yes | no | yes | derived | → publish |
| `app/api/admin/lifecycle-builder/process-participation/route.ts:131` POST | B | yes | yes | no | yes | derived | → publish |
| `app/api/admin/enrollment-process/stage-runtime-config/route.ts:161` POST | **A** | yes | yes | **yes** | **no** | no | ✅ **MIGRATED** — one draft write + idempotent companions |
| `lib/lifecycle/saveLifecycleStageRuntimeConfig.ts` | **A** | yes | yes | **yes** | **no** | no | ✅ **MIGRATED** — see `business-process-stage-save-decomposition.md` |
| `app/api/admin/lifecycle-catalog/delete/route.ts:88` POST | B/E | yes | yes | no | yes | derived | → publish (destructive) |
| `lib/lifecycle/lifecycleActivationOwned.ts:125` | D | yes | **deletes the key** | no | yes | derived | migration utility — **blocked today** |
| `lib/lifecycle/repairLifecycleWorkspaceVisibility.ts:205` INSERT | D/C | yes | n/a | no | yes | n/a | creation only (passes guard) |
| `lib/admin/verticalBootstrap/applyVerticalBootstrap.ts:61 / :124` | C | yes | **now yes** | no | yes | **was full replace — fixed** | creation only ✅ |
| `app/api/admin/vertical-bootstrap/route.ts:48`, `tenant-bootstrap/route.ts:48` | C | — | — | no | yes | via above | creation only |
| `app/api/admin/departments/route.ts:123` POST | C/E | n/a | n/a | no | yes | **caller-supplied** | creation only |
| `app/api/admin/departments/[id]/route.ts:162` PATCH | **E** | yes | deep-merge | no | yes | **yes, arbitrary** | **block** — open bypass |
| `scripts/seedRealisticChildcareDemoData.ts:587` | **E** | id only | **no — total wipe** | no | yes | **yes** | **block** / insert-only |
| `scripts/repairCatchAllWorkViewCompatBindings.ts:110` | D | yes | yes | no | yes | derived | migration utility |
| `scripts/seedEnrollmentQueueMembershipV1.ts:81` | D/C | yes | yes | no | yes | derived | migration utility |
| `scripts/cleanupEnrollmentLifecycleProcesses.ts:157,:218` | D | yes | yes | no | yes | derived | migration utility |
| `scripts/simulatePreFixLifecycleE2E.ts:167` INSERT | D | yes | n/a | no | yes | n/a | dev-only |
| `app/api/admin/lifecycle-catalog/repair/route.ts:35` POST | D | — | — | no | yes | — | migration utility |

**Editor slice 2 (2026-07-31)** added the read half: `buildLifecycleStageBootstrap` and the
stage-bootstrap route now resolve publication-owned state from the DRAFT
(`loadBusinessProcessEditorState`), and `POST /api/admin/business-process/configuration/publish` is
the first product path that calls the publish RPC. `departments.metadata.lifecycle_builder_v1` is
now read by editors only through `loadPublishedConfiguration`, for side-by-side comparison.

**Editor slice 1 (2026-07-30) migrated the stage save.** It is now the only writer that carries a
conflict token, writes the draft rather than the projection, and reports `publication_required`.
Every other row above is still a direct projection writer — that is the remaining worklist, in the
order given at the end of `bp-config-integrity-handoff.md`.

## B. Category F — must keep working

These write `departments.metadata` but **never** `lifecycle_builder_v1`. The guard is narrow
precisely so these need no change.

| Path : line | Key(s) |
|---|---|
| `app/api/admin/departments/[id]/lifecycle-actions-matrix/route.ts` | `lifecycle_actions_matrix_order_v1` (category F via `mergeCategoryFDepartmentMetadata`); `command_set_v1` upserts go through `editProcessInDraft` + publish — never the projection |
| `app/api/admin/departments/[id]/lifecycle-requirements/route.ts:189,:278,:325` | `lifecycle_progression_requirements_v1`, `lifecycle_builder_stage_field_rules_v1` (pinned via `mergeCategoryFDepartmentMetadata`) |
| `lib/lifecycle/persistLifecycleStageFieldRules.ts:97` | same two |
| `scripts/ensureEnrollmentPipelineWorkUnitV1.ts:266` | `opportunity_attention_rules` (+ nested `readiness_projection_v1`) |
| `lib/lifecycle/repairLifecycleWorkspaceVisibility.ts:143` | `lifecycle_builder_owned_v1`, `lifecycle_activation_v1` |
| `scripts/seedAccessValidationDemo.ts:217` INSERT | demo markers |
| `lib/lifecycle/syncLifecycleDepartmentDescription.ts:33` | `description` column only |
| `app/api/admin/departments/[id]/lifecycle-activation/route.ts` | `lifecycle_activation_v1` (pinned via `mergeCategoryFDepartmentMetadata`) |

**Outside** `lifecycle_builder_v1` (top-level siblings): `lifecycle_activation_v1`,
`lifecycle_builder_owned_v1`, `lifecycle_builder_stage_field_rules_v1`,
`lifecycle_progression_requirements_v1`, `lifecycle_actions_matrix_order_v1`,
`lifecycle_work_definitions_v1`, `opportunity_attention_rules`, `readiness_projection_v1`,
`ai_policy`.

**Inside** (publication-owned): `work_views_v1`, `participation_v1`, `tracks_v1`, `perspectives_v1`,
`status_rollup_v1`, `queue_membership_v1`, `stage_operating_plan_v1`, `action_catalog_v1`,
`command_set_v1`.

> **Naming trap.** `persistLifecycleStageFieldRules` and the `lifecycle-requirements` route write
> `lifecycle_builder_stage_field_rules_v1`, which is a **top-level sibling**, not part of the
> builder. They are category F. Do not sweep them into the publish path by name matching.

## C. SQL migrations that write the projection

All of these would hit the guard. Future migrations must call
`begin_lifecycle_projection_write('migration')`.

| File : line | Mechanism |
|---|---|
| `20260621120000_align_firefly_enrollment_process_config.sql:19` | `jsonb_set` on `{…,processes}` |
| `20260621130000_firefly_tour_stage_work_definition_bind.sql:45` | nested `jsonb_set` |
| `20260622150000_firefly_tour_scheduled_automation_rules.sql:103` | `jsonb_set` on `{…,processes}` |
| `20260622205001_firefly_granular_tour_bp_stages.sql:168` | same |
| `20260724000000_firefly_remediate_dangling_stage_references.sql:106` | `jsonb_set` on the builder |
| `20260711000000_enrollment_participation_canonical_fields.sql:126` | **text substitution over the whole column** |
| `supabase/seed/local_representative_seed.sql:292` | full-column replace |

## Findings that change the convergence plan

1. **Nothing calls the publish RPC.** With the guard enforcing, every editor path in section A
   **breaks** rather than reroutes. This is why the capability declaration is not yet flipped and
   why the guard ships with a `warn` posture.
2. **A single stage save is 4–6 independent whole-column writes**
   (`saveLifecycleStageRuntimeConfig.ts:203,234,256,265,393` plus `persistStageV2DraftFields` from
   the route, which *re-reads* the row at `:181`). Under the guard the first write succeeds and
   later ones fail, leaving a **torn stage**. Incremental per-call-site migration is therefore
   unsafe: this orchestrator must move as one unit.
3. **Two helpers write configuration the operator never authored.**
   `persistStageOperatingPlanV1.ts:116` seeds `legacyEnrollmentOperatingPlanDefault(stageKey)` and
   `persistQueueMembershipV1.ts:153` seeds a default membership when the key is absent — so merely
   opening and saving a stage mutates the published projection as a side effect. Under publication
   these become **draft-time defaults**, never publish writes. (This also interacts with decision
   D1: code defaults must not become runtime authority.)
4. **`scripts/seedRealisticChildcareDemoData.ts:587` is still a total metadata wipe** on existing
   departments — the same class of defect just fixed in `applyVerticalBootstrap`, still live.
5. **`PATCH /api/admin/departments/[departmentId]` accepts arbitrary caller metadata and
   deep-merges it** — a fully generic bypass able to rewrite any part of the builder from the admin
   API. The database guard catches it, but there is no application-level rejection, so it surfaces
   as an opaque Postgres `42501`.
6. **Category-F writers are still whole-column writers.** They pass the guard only because they
   rewrite the identical builder blob they read. If a publish interleaves between their read and
   write, their save becomes a silent projection rollback — which the guard correctly rejects, but
   the app surfaces as an opaque error. They should stop round-tripping the builder at all.
7. Pre-existing, unrelated: `repairLifecycleWorkspaceVisibility.ts:132` calls
   `mergeLifecycleActivationIntoMetadata` and **discards the return value**. The function is pure,
   so `synced_activation_metadata` is reported while nothing is synced.
