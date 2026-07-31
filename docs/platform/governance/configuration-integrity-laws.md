# Alloy Configuration Integrity Laws

Sprint: `bp-config-integrity` (slot 6), Phase C. **Design only — no implementation.**
Companion: [`configuration-overwriter-root-cause.md`](./configuration-overwriter-root-cause.md) (Phase A).

## Purpose

These are platform invariants, not Firefly fixes. They govern every domain that persists
operator-authored configuration. Firefly is the first tenant to prove them, never the reason for
them.

## The shape of the problem

One sentence: **a configuration writer can destroy valid configuration it does not understand.**

This is not a concurrency bug. The writer that destroyed Firefly's `work_views_v1` held a current
snapshot; the loss happened inside `parse`, before any staleness question arose. Laws 1 and 7 are
therefore primary, and Law 4 is necessary but subordinate.

---

# The Laws

## Law 1 — Lossless Persistence

> A configuration read → write cycle must preserve every field it does not explicitly own.
> Unknown fields must survive. A parser may not silently discard data.

**Forbids:** allowlist reconstruction on a write path; degrading an unparseable blob to a default
and persisting that default; dropping a collection member that fails validation.

**Testable predicate:** for any stored blob `B` and any writer `W` that owns field set `F`,
`W(B)` differs from `B` only within `F`.

## Law 2 — Canonical Ownership

> Every configuration identity has exactly one canonical owner. No duplicated authority.

**Forbids:** the same identity being mintable from two sources (code defaults *and* tenant config);
two vocabularies for one identity namespace; validation reading one authority while execution reads
another.

**Testable predicate:** for each identity type there is exactly one definer module and one JSON
path; every other site is a reference.

## Law 3 — Referential Integrity

> Published configuration may not contain unresolved references.

**Forbids:** publishing an outcome that names a missing transition; a transition naming a missing
stage; an outcome naming a transition not outgoing from its owning stage; a deleted identity that
is still referenced.

**Draft vs publish:** unresolved references are **warnings while drafting** and **hard failures at
publish**. Structural-quality findings (unreachable stage, stage with no incoming transition,
non-terminal stage with no outgoing transition, outcome that can never fire, work item with no
completion path, work view matching no valid population) are **warnings at both**, because each has
a legitimate mid-build state. Execution-critical dangling references never publish with warnings.

## Law 4 — Revision Integrity

> A stale revision may not overwrite a newer revision.

**Mechanism:** reuse, do not invent. See *Reuse decision* below.

**Forbids:** last-write-wins on a config column; `updated_at` written but never compared.

## Law 5 — Atomic Publication

> Publishing configuration either publishes an internally consistent revision, or publishes nothing.

**Forbids:** a publish composed of N independent statements from Node; a validator that runs after
the mutation is already applied to the persisted blob.

## Law 6 — Atomic Execution

> Execution must validate its entire plan before the first durable mutation.

**Forbids:** resolving effect references mid-flight; a saga step that mutates durable state without
registering an inverse; reporting `changed: false` when an unregistered write survived.

**Testable predicate:** every effect's references resolve during a plan phase that performs zero
writes; every durable step registers a compensation.

## Law 7 — Deterministic Serialization

> `parse → serialize → parse` must produce an equivalent configuration. Unknown fields round-trip
> unchanged.

Law 7 is what makes Law 1 *enforceable*. Law 1 states the goal; Law 7 is the property a test can
assert against arbitrary input. This is the keystone law — implement it first.

---

# Law 2 — Ownership map (current state)

| Identity | Canonical path | Key | Definers today | Verdict |
|---|---|---|---|---|
| Process | `lifecycle_builder_v1.processes[]` | `id` + `key` (two) | `createLifecycleProcess` `lifecycleBuilderConfig.ts:267`; `defaultLifecycleBuilderV1:127`; `enrollmentProcessTemplate.ts:138` | **3 definers** |
| Stage | `processes[].stages[]` | `id` + `key` (two) | `addStageToProcess:342`; `defaultEnrollmentBusinessProcessV1Stages.ts:10` (13 keys); `enrollmentProcessTemplate.ts:26` (8 *different* keys) | **3 definers, 2 disagreeing vocabularies** |
| Track | `processes[].tracks_v1` | `tracks[].key` | config blob; `enrollmentProcessTemplate.ts:22` code constants | **2 definers** |
| **Transition** | `stages[].stage_operating_plan_v1.outgoing_transitions[]` | `transition_ref`, **per-stage namespace** | tenant config; `defaultEnrollmentStageOperatingPlans.ts:31` code defaults | **2 definers — the Lead→Tour defect** |
| Action | `stages[].action_catalog_v1` (reference list) | `action_key` | `platformActionCatalog`, `canonicalActionRegistry`, tenant `action_definitions`, plus `command_set_v1` | **overlapping selection surfaces** |
| Work item | `…stage_operating_plan_v1.work_templates[]` | `template_key` | `newWorkTemplateDraft` (positional `work_N`) | 1 definer |
| Outcome | `…stage_operating_plan_v1.outcomes[]` | `outcome_key` | stage outcomes **and** `tracks_v1.split_rules[].per_subject_outcomes[]` — merged into one map at `resolveOutgoingProcessTransitions.ts:234` | **2 namespaces, one map** |
| Work view | `processes[].work_views_v1[]` | `id` (label-derived slug) | operator; `workViewsCompatibility.ts:47` synthesis; `enrollmentOperationalSurfaceLanding.ts:255` synthesis | **3 definers** |

**Uniqueness enforcement:** exactly one identity in the whole config — `command_set_v1.capability_key`
(`processCommandSetV1.ts:141`) — is deduplicated on the read path. Every other identity relies on
UI-side collision loops that run at *creation only*. Any write bypassing the editor (template,
migration, API POST, re-parse cycle) can introduce duplicates that then resolve first-wins and
silently shadow.

## Why Lead→Tour actually fails

`resolveOutgoingProcessTransitions.ts:192` has three branches:

1. **Authoritative** (`:202`) — requires `outgoing_transitions !== undefined`. Passes `transition_ref`
   through verbatim.
2. **Legacy** (`:90`) — scans `outcome_rules[].targets[]` and **requires `target.stage_key`** (`:106`).
3. **Split rules** (`:138`) — requires `tracks_v1.split_rules`; returns `[]` at `:144` if absent.

The modern editor stores `transition_ref` only and **forbids `stage_key`** on move targets
(`validateStageOperatingPlanOperatingContract.ts:344`). So a stage with no `outgoing_transitions`,
rules using `transition_ref`, and no `tracks_v1` yields **zero from all three branches**. That is a
structural dead zone, not a Firefly typo.

Confirmed against the captured Firefly config (`docs/sprints/active/assets/firefly-config/`, captured
at `688772683` — **predates** the `tour_scheduled_to_tour` rules named in the sprint brief, so treat
as structural evidence only):

- `tracks_v1`: **undefined**
- `lead` stage: `outgoing_transitions` **UNDEFINED**; sole move target is legacy
  `stage_key: "qualification"` — a stage **not in the inventory** (`lead, tour, decision, waitlist,
  enrolling, enrolled`), dropped by `isKnownStage` (`:239`)
- `tour` stage: only stage with transitions, and they are positional (`tour_transition_1 => waitlist`,
  `tour_transition_2 => decision`) — the editor mints refs positionally
  (`stageOperatingPlanEditorModel.ts:166`)
- `work_views_v1`: 5 views, ids `new_leads`, `new_work_view_2..5` — placeholder-shaped

Note the test fixture `web/tests/runtime/fixtures/new-leads-entry.json` *does* carry
`outgoing_transitions` with semantic refs — **tests exercise branch 1 while production runs
branch 2.** That divergence is why this survived.

---

# Reuse decision (Laws 4 & 5)

Alloy already contains two working mechanisms. Build on them; do not add a third persistence model.

**Optimistic concurrency — `work_units.queue_definition`.**
`supabase/migrations/20260412200000_agent_v0_atomic_commit_rpc.sql:28` does `SELECT … FOR UPDATE`
then `IF v_old IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION
'agent_v0:stale_queue_definition_version'`, with before/after hashes into an audit table. This is a
real CAS inside a Postgres function — the atomicity `runPlatformTransaction` cannot provide.

**Draft / revision / publication — Programs.**
`supabase/migrations/20260722020000_configuration_publication_runtime_v1.sql` provides
`program_drafts` (with `base_revision_id`, `validation_errors`, a `draft_status` CHECK that forbids
`validated` while errors exist), immutable `program_revisions` (`revision_number`,
`payload_checksum`), and — decisively — **`configuration_publications` is already generic**:
`domain_key`, `subject_id`, `revision_id`, commented *"Immutable generic publication acts."* It was
designed for multiple domains and only Programs uses it.

**Recommendation:** register business-process configuration as a second `domain_key` in the existing
publication runtime, and move the config write behind a CAS RPC modelled on `agent_v0`. This gives
Laws 4 and 5 with no new concepts, and supplies the audit trail the domain currently lacks entirely.

---

# Audit — implementation vs each law

| Law | Current behavior | Violations | Required implementation | Scope |
|---|---|---|---|---|
| **1 Lossless** | `parseLifecycleBuilderV1:146` rebuilds every process/stage from a fixed allowlist; `mergeLifecycleBuilderIntoMetadata:238` writes the whole blob back from it | Unknown keys destroyed (this is how `row_grain_v1` died). Process missing `id\|key\|name` dropped `:159`; stage missing `id\|key\|label` dropped `:168`. Sub-blob dropped when its parser returns null `:169-213`. `lifecycleBuilderFromDepartmentMetadata:230` degrades to `emptyLifecycleBuilderV1()` on parse failure — next save persists **empty config over real config**. `persistWorkViewsV1.ts:48` turns `[]` into `undefined`, deleting the key | Preserve-unknown parse (retain raw alongside typed view); write path merges typed changes into **raw**, never re-serialises from typed. Parse failure must **throw**, never degrade | **L** |
| **7 Deterministic** | No round-trip property exists anywhere | `parse→serialize→parse` is lossy for every config type | Property test over all 8 identity types with unknown-field fixtures; a shared `parseWithUnknowns` helper; CI gate | **M** — do first, it makes Law 1 testable |
| **2 Ownership** | 3 definers for process, stage, work view; 2 for transition, track, outcome | Stage vocabularies disagree (13 keys vs 8) → the `qualification` ghost. Transition definable in code defaults *and* config → validation and execution read different authorities. Only `capability_key` deduped on read | Declare one definer per identity; demote code defaults to **seed templates applied once**, never a runtime fallback authority; add read-path uniqueness for all 8 | **L** |
| **3 Referential** | `validateConfiguredStageReferences.ts` already walks `move_to_stage`, transitions, nested targets, and flags missing `transition_ref` at `:112` | Wired into **exactly one of ~15 write paths** (`lifecycle-builder/route.ts:322`). SQL migrations, scripts, `process-work-views`, `stage-runtime-config`, `process-participation`, `lifecycle-catalog` all bypass it. It also runs *after* the in-memory mutation, so a pre-existing violation blocks every unrelated save | Move to the single publish chokepoint; add draft-vs-publish severity; extend to work-item/action/attention refs; add the structural warnings | **M** — validator largely exists |
| **4 Revision** | `departments` has no `revision`/`version`/`etag` (`20260329165048_remote_schema.sql:1372`); every writer filters `.eq("id").eq("org_id")`; `updated_at` written, never compared | Last-write-wins across ~15 independent writers. In-blob `version: 1` is a format literal, never incremented | CAS RPC modelled on `agent_v0_atomic_commit`; `If-Match`-style token from GET through POST; 409 naming current vs attempted revision | **M** |
| **5 Atomic publish** | No publish act exists — draft and published are the same live blob. `saveLifecycleStageRuntimeConfig.ts:174` issues **6+ sequential full-blob writes** threading one stale snapshot | Failure midway leaves the blob half-applied, no rollback, no record. Zero audit rows for this domain — no actor, timestamp, surface, or prior/new revision | Register `domain_key` in `configuration_publications`; draft table + immutable revisions; validate → write one revision → publish | **L** |
| **6 Atomic execution** | `completeStageWorkWithOutcome.ts` closes the work row (`:136`) **before** resolving any `transition_ref` (`:190`). `runPlatformTransaction` is a saga, not a DB transaction (`platformTransaction.ts:30`) | **`applyConfiguredStageAutomationRules.ts:74-97` is the structural defect**: the one caller of `applyStageOutcomeRuleTarget` that neither pre-resolves transitions (never calls `resolveStageTransitionExecutionTargets`) nor collects `result.undo`, while sitting inside a saga that reports on its behalf. Consequence: status write commits, `move_to_stage` fails, saga reports `outcome:"aborted", changed:false` (`:418`) — **a false claim that nothing changed**. Nested variant at `emitStatusChangedEvent.ts:82` discards the result entirely | Plan phase resolving every reference with zero writes; every durable step must register an inverse; make un-registered writes structurally impossible | **L** |

**Scope key:** S ≤ ½ day · M ≈ 1–2 days · L ≈ 3–5 days.

## The most important single finding

`platformTransaction.ts:418` sets `changed: Boolean(breach)` under the comment *"Only claim 'nothing
changed' when every compensation is proven to have run."* The intent is exactly right. The guarantee
is unsound, because a step that never **registers** an inverse is invisible to `breach`. The saga
reports `changed: false` with full confidence while a durable status write survives — and
`TourBookingTransactionError.changed === false` (`tourBookingService.ts:164`) actively asserts the
rollback is proven.

**The safety mechanism's correctness depends on an unenforced contract.** Law 6 must make
registration structural, not conventional.

---

# Additional findings — classified

## 1. `applyVerticalBootstrap` full-metadata replace — **HIGH**

**Violates Law 1.** `applyVerticalBootstrap.ts:57` derives `meta` *only* from the blueprint payload;
`:100-112` writes `metadata: meta` verbatim with no spread of existing metadata. Applying a vertical
blueprint to a configured department replaces the entire column with e.g.
`{ onboarding_lane: "primary", audience: "families" }` (`childcareBootstrapV1.ts:85`), destroying
every process, stage, perspective and work view.

The `JSON.stringify` guard at `:90` **inverts**: a department with no authored config compares equal
and is skipped; a department *with* authored config is guaranteed unequal, so the destructive write
always fires. It protects exactly the rows with nothing to lose.

Aggravating: the preview conceals it. `VerticalBootstrapDepartmentPreview.after` (`types.ts:80`)
carries only `name/description/sort_order/is_active` — metadata is omitted, though the *status*
preview includes it. An operator sees `action: "update"` on four innocuous fields with no hint the
lifecycle config will be erased.

**Why High and not Critical:** admin-only, own-org only, and **no UI reachability** — an exhaustive
grep found zero components or buttons calling either route. It requires a hand-crafted
`POST /api/admin/vertical-bootstrap {mode:"apply"}`, or a developer running
`verticalBootstrap.integration.test.ts:29` with `VERTICAL_BOOTSTRAP_INTEGRATION_ORG_ID` pointed at a
live org. **It becomes Critical the moment any "re-apply vertical" button ships**, because the
destructive shape and the blind preview are already in place.

## 2. Work Views compatibility-seed promotion — **MEDIUM**

**Partially confirmed. My earlier "opens and saves" framing was wrong and is corrected here.**

Confirmed: `WorkViewsConfigurationContext.tsx:100` sets *both* `drafts` and `baseline` from
`viewsJson.work_views_v1` — the server's `effective` value, i.e. the synthesized seed.
`saved_work_views_v1` is returned by the route (`:74`) but is **not even in the client's response
type** (`:27`), so it is never read. The hardcoded fallback is real:
`workViewsCompatibility.ts:71` returns `[createEmptyWorkViewDraft("New families today")]` — a
childcare-worded, include-all placeholder that would become authored config for a tenant in any
vertical.

**Refuted:** the zero-edit trigger. `dirty = !workViewsV1Equal(baseline, drafts)` (`:80`) compares
two values set from the *same* array through a deterministic normalizer, so `dirty` is
unconditionally false after load, and the save button is `disabled={!dirty || …}`
(`BusinessProcessWorkViewsSetupWorkspace.tsx:74`). There is no autosave, no unmount flush, and no
`useEffect` that dirties drafts. Mounting is harmless.

**Actual trigger:** one edit — a single keystroke in a label, adding or deleting a view, toggling
visibility — then Save. That posts the whole `drafts` array, laundering every synthesized view into
durable authored config.

**Why Medium:** reachable by any org admin through ordinary in-product UI (far more reachable than
finding 1), and the `compatibility_seed` hint is passive — a sublabel in the list column
(`BusinessProcessWorkViewsListColumn.tsx:40`) that never gates the save and disappears permanently
after the first save (`:162`). But the damage is *additive drift* — derived state promoted to
authored state — not destruction of existing authored config, because
`persistWorkViewsForProcessSave` does merge correctly. Rising toward High given how ordinary the
gesture is.

---

# Implementation order (bottom-up, per the brief)

1. **Law 7 → Law 1.** Lossless round-trip first; it is the keystone and makes Law 1 testable.
2. **Law 4.** CAS via an RPC modelled on `agent_v0_atomic_commit`.
3. **Law 3.** Promote the existing validator to the chokepoint; draft-vs-publish severity.
4. **Law 5.** Register the BP domain in `configuration_publications`.
5. **Law 6.** Plan-then-mutate; structural inverse registration.
6. **Law 2** is cross-cutting — enforced as each of the above lands.

Firefly is repaired only after the platform enforces these. Do not optimize for Firefly.

---

# Decision register

Resolved by Kelly, 2026-07-30. These are binding for implementation.

### D1 — Code defaults are a seed template, never a runtime authority

`defaultEnrollmentStageOperatingPlans.ts` is demoted to a one-time template applied at process
creation. It is **never consulted at runtime**. Law 2 is satisfied: transition identity has exactly
one owner, the persisted tenant config.

*Accepted consequence:* tenants currently relying on the fallback become visibly unconfigured until
migrated. This surfaces the truth rather than regressing behavior — a process whose transitions were
only ever supplied by code defaults was never actually configured, and the Lead→Tour failure is what
that looks like at runtime. Migration must therefore materialize defaults into tenant config as an
explicit, audited publish before the fallback is removed.

### D2 — The 8-key vocabulary is canonical

`lead / tour / decision / waitlist / enrolling / enrolled` (+2) wins.
`defaultEnrollmentBusinessProcessV1Stages.ts` (13 keys: `new_lead`, `tour_scheduled`, …) is retired.

This matches Firefly's actually-persisted stages and eliminates the `qualification` ghost at its
source. Every reference site to the 13-key set must be migrated or deleted.

### D3 — Draft blocks only what the change touches; publish blocks the full graph

While drafting: block only references **touched by the current edit**; report the rest of the graph
as warnings. At publish/activation: full-graph blocking, no warnings-with-success for
execution-critical dangling references.

*Rationale:* the current all-or-nothing 422 can freeze a legacy tenant out of editing entirely,
which pushes operators onto exactly the unvalidated write paths that caused this defect. The hard
integrity boundary belongs at publish.
