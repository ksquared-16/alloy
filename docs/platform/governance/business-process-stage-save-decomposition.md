# Stage Configuration save — decomposition

Law 4 completion, editor slice 1. Companion to
[`business-process-writer-inventory.md`](./business-process-writer-inventory.md) and
[`configuration-publication-model.md`](./configuration-publication-model.md).

**Purpose.** Map `saveLifecycleStageRuntimeConfig` completely before rewriting it, so the
transformation boundaries are explicit rather than discovered mid-edit. The orchestrator must move
as one unit: it performs 4–6 independent whole-column writes, so a partial migration under the
database guard produces a **torn stage**.

**Scope correction vs. the brief.** The logical stage save is the whole
`POST /api/admin/enrollment-process/stage-runtime-config` request, not only the library function.
The route performs a **fifth** lifecycle-builder write of its own — `persistStageV2DraftFields`
(route `:190`), which re-reads the department row it was just handed. Migrating four of five writes
would leave exactly the torn stage this slice exists to prevent, so `stage_v2_draft` is in scope.

---

## 1. Decomposition table

Columns: **Draft?** = belongs inside the publication-owned `lifecycle_builder_v1` ·
**Defaults?** = the helper can author values the caller did not supply ·
**Hidden?** = it authors on an *ordinary* save, invisibly to the operator.

| # | Current helper (site) | Reads | Mutates | Persistence target | Draft? | Defaults? | Hidden? | Depends on earlier write | Pure-transform replacement |
|---|---|---|---|---|---|---|---|---|---|
| 1 | inline dept load `save…:186` | `departments.metadata` | — | — | — | no | no | — | read phase |
| 2 | `isConfiguredStageKey` `:198` | builder | — | — | — | no | no | — | precondition on parsed draft |
| 3 | `persistLifecycleStageFieldRules` `:203` | org field defs, metadata | `lifecycle_progression_requirements_v1`, `lifecycle_builder_stage_field_rules_v1` | `departments.metadata` **whole column** | **no** — top-level siblings (category F) | no | no | — | unchanged; becomes a **companion write**, fed a freshly-read metadata |
| 4 | membership/subject derivation `:217-230` | builder stage | — | — | — | template read | no | — | `resolveEffectiveStageMembership` (read-only) |
| 5a | `persistStatusRollupV1` → `persistStageStatusAssignments` `:86` | status catalog, `status_definitions` | `status_definitions.metadata.process_stage_key` | `status_definitions` | **no** | no | no | — | companion write |
| 5b | `persistStatusRollupV1` → `applyRollupToBuilderStage` `:89` | metadata | stage `status_rollup_v1` | `departments.metadata` **whole column** | **yes** | no | no | — | **`applyStatusRollupDraft`** |
| 5c | `persistStageStatusAssignments` `:243` (rollup-absent branch) | status defs | `status_definitions.metadata` | `status_definitions` | **no** | no | no | — | companion write |
| 6 | `persistQueueMembershipForLifecycleStageSave` `:128` | builder stage | stage `queue_membership_v1` | `departments.metadata` **whole column** | **yes** | **yes** `:153` | **YES** | — | **`applyQueueMembershipDraft`** (explicit only) |
| 7 | `persistStageOperatingPlanForLifecycleStageSave` `:90` | builder stage | stage `stage_operating_plan_v1` | `departments.metadata` **whole column** | **yes** | **yes** `:116` | **YES** | — | **`applyStageOperatingPlanDraft`** (explicit only) |
| 8 | `loadLifecycleStageStatusStagesPayload` `:274` | `departments.metadata` **re-read**, `status_definitions` | — | response only | — | no | no | **yes** — status assignments (5a/5c) | response projection; stage keys from `nextBuilder`, statuses re-read after companions |
| 9 | `upsertLifecycleStageWorkUnitForDepartment` `:298`/`:336` | `departments.metadata` **re-read**, `work_units`, `status_definitions` | `work_units` row | `work_units` | **no** | queue name/sort from builder | no | — | companion write; builder facts passed in, not re-read |
| 10 | `persistPerspectivesForLifecycleStageSave` `:393` | metadata, **work-unit `queue_definition`** | stage `perspectives_v1` | `departments.metadata` **whole column** | **yes** | lane coercion only | no | **yes** — work-unit upsert (9) | **`applyStagePerspectivesDraft`** + `projectLifecycleStageQueueLanes` (pure) |
| 11 | `persistStageV2DraftFields` (route `:190`) | `departments.metadata` **re-read** | stage `grain/purpose/description/parent_stage_key/allow_skipping/operator_guidance/subject_resolution_strategy/action_catalog_v1` | `departments.metadata` **whole column** | **yes** | — | — | — | **`applyStageV2DraftFields`** |
| 12 | `ensureBuilderCommandSetsOnSave` (inside 11, `persistStageV2DraftFields:119`) | builder | **process-level** `command_set_v1` | same write as 11 | **yes** | **yes** | **YES** | — | **removed from the stage path** (see §4) |

### Read-after-write dependencies, and how each is removed

| # | Dependency today | Why it exists | Removal |
|---|---|---|---|
| R1 | `persistLifecycleStageFieldRules` returns the **DB-echoed** metadata (`:100 .select("metadata")`), which then seeds `builderForMembership` | threading one metadata object through every step | field rules never touch the builder; membership derivation reads the parsed draft instead |
| R2 | every persister returns `metadata` for the next persister | each does its own whole-column write | one in-memory `nextBuilder`, one `saveDraft` |
| R3 | `loadLifecycleStageStatusStagesPayload` re-reads `departments.metadata` for configured stage keys | stage keys were only available from the DB | stage keys come from `nextBuilder` |
| R4 | `upsertLifecycleStageWorkUnitForDepartment` re-reads `departments.metadata` for `processId`, stage label and sort order | the helper is also called standalone | orchestrator resolves these from `nextBuilder`; helper keeps its own read for other callers |
| R5 | **perspectives lane coercion needs the work unit's `queue_definition`**, produced by the upsert | lanes were only knowable after the write | `projectLifecycleStageQueueLanes` applies the *same pure transforms* (`buildLifecycleStageQueueDefinition` / `applyStatusKeysToLifecycleStageQueueDefinition` + membership merge) to the **already-read** work-unit row, yielding the prospective lane keys with **zero writes** |

R5 is the only structurally hard one. It is why perspectives could not previously be lifted
individually, and why the unit had to move together.

The one read-after-write that legitimately **stays** is #8: the status-stages response payload must
reflect the `status_definitions` rows this save just reconciled. It reads a different resource than
it wrote, it happens after all writes, and it feeds the response only — never the draft.

---

## 2. Old write graph

```
POST /stage-runtime-config
├─ saveLifecycleStageRuntimeConfig
│   ├─ SELECT departments.metadata
│   ├─ W1  UPDATE departments.metadata      (field rules — siblings)          [returns metadata]
│   ├─ W2  UPDATE status_definitions.*      (rollup branch, per entity type)
│   │   └─ W3  UPDATE departments.metadata  (status_rollup_v1)
│   │   ─or─ W2' UPDATE status_definitions.* (no-rollup branch)
│   ├─ W4  UPDATE departments.metadata      (queue_membership_v1)   ← seeds a default
│   ├─ W5  UPDATE departments.metadata      (stage_operating_plan_v1) ← seeds a default
│   ├─ SELECT departments.metadata          (re-read, R3)
│   ├─ W6  INSERT/UPDATE work_units         (+ its own SELECT departments.metadata, R4)
│   └─ W7  UPDATE departments.metadata      (perspectives_v1)       ← needs W6's queue_definition
└─ SELECT departments.metadata (re-read)
    └─ W8  UPDATE departments.metadata      (stage V2 fields + process command_set_v1)
```

**Six whole-column writes of `departments.metadata`, five of which change `lifecycle_builder_v1`,
each threading a snapshot read before the previous write.** No CAS anywhere. Under the guard set to
`enforce`, W3 fails and W4…W8 never run — the stage is torn. Today, with the guard in `warn`, a
failure at W5 leaves membership applied and the operating plan not, with no record that a save was
attempted.

## 3. New write graph

```
POST /stage-runtime-config
│
│  ── phase 1: READ (no writes) ────────────────────────────────────────────
├─ SELECT departments.metadata                    (siblings + guard precondition)
├─ readDraft / openDraft                          (business_process_drafts)
├─ SELECT work_units WHERE key = lifecycle_wu_*   (lane projection input)
├─ SELECT status category catalog                 (rollup branch only)
│
│  ── phase 2: TRANSFORM (pure, in memory) ───────────────────────────────────
├─ parseLifecycleBuilderV1(draft.payload)         → builder            (Law 7)
├─ applyStatusRollupDraft ────────────┐
├─ applyQueueMembershipDraft          │  each: builder → { nextBuilder, warnings, errors }
├─ applyStageOperatingPlanDraft       │  accumulated into ONE nextBuilder
├─ applyStageV2DraftFields            │
├─ projectLifecycleStageQueueLanes    │  (pure — replaces R5)
└─ applyStagePerspectivesDraft ───────┘
│
│  ── phase 3: VALIDATE (D3 — touched references only) ──────────────────────
├─ blocking errors → return { status: "blocked" }   NOTHING has been written
│
│  ── phase 4: DRAFT WRITE (exactly one) ────────────────────────────────────
├─ D1  UPDATE business_process_drafts.payload = serializeLifecycleBuilderV1(nextBuilder)
│
│  ── phase 5: COMPANIONS (idempotent, ordered, reported honestly) ──────────
├─ C1  UPDATE departments.metadata        (field-rule siblings only; builder byte-identical)
├─ C2  UPDATE status_definitions.metadata (stage assignment reconcile)
├─ C3  INSERT/UPDATE work_units           (queue projection)
└─ SELECT status_definitions              (response payload)
```

`departments.metadata.lifecycle_builder_v1` is **never written**. The runtime projection changes
only at publish. The result therefore carries `publication_required: true`.

---

## 4. Defaults — classification and disposition

Classification per the sprint contract: (1) process-creation template seed · (2) new-stage template
seed · (3) explicit operator-selected default · (4) migration compatibility · (5) runtime fallback.
**Only 1–3 may author draft state.** 4 may affect reading and must not silently persist on an
ordinary save. 5 must not be a second configuration authority (decision **D1**).

| Default | Site | Class | Authored today | Disposition |
|---|---|---|---|---|
| `defaultEnrollmentQueueMembershipForStage(stageKey)` | `persistQueueMembershipV1.ts:153` via `membershipSeedDecision` | **4/5** | **yes — on every save of a stage lacking the key** | **removed from the save path.** The draft gains `queue_membership_v1` only from an explicit `queue_membership_v1` payload. |
| `legacyEnrollmentOperatingPlanDefault(stageKey)` | `persistStageOperatingPlanV1.ts:116` | **5** — D1 names this file explicitly | **yes — same trigger** | **removed from the save path.** Seed-template-only, applied at process creation, never at save. |
| `ensureBuilderCommandSetsOnSave` legacy-migrate stamp | `persistStageV2DraftFields.ts:119` | **4** | **yes — process-level, on every stage save** | **removed from the stage path.** A *stage* save may not author *process*-level configuration. `resolveBusinessProcessCommandSelection` already falls back to legacy compatibility when the key is absent, so runtime is unaffected. Where this belongs is a decision for the process-editor slice. |
| queue display name / sort order | `lifecycleStageWorkUnitIdentity.ts:461-463` | **3** | yes, into `work_units` | kept — a derived projection of the builder, not configuration |
| `coercePerspectivesV1ForLanes` | `saveLifecycleStageRuntimeConfig.ts:391` | **3** | only when perspectives are explicitly posted | kept — shapes what the operator submitted |

### The membership subtlety, stated plainly

Today `persistQueueMembershipV1` returns the **seeded default** and the orchestrator forwards it to
the work-unit upsert, where it is denormalized onto `work_units.metadata` and
`queue_definition.metadata`. Removing the seed outright would also stop the work unit receiving a
membership, changing queue runtime behaviour — which is not what this slice is for.

So the two concerns are separated:

- **`resolveEffectiveStageMembership`** (read-only) resolves explicit stage membership → work-unit
  membership → template default, purely for the work-unit projection. It writes nothing to the
  draft. This is a class-4 *compatibility read*, and it is now visible as one.
- **`applyQueueMembershipDraft`** authors the draft, and only from an explicit payload.

Removing the compatibility read is a Law 2 concern (one definer per identity), tracked separately —
not silently folded into this slice.

---

## 5. Companion-write coordination contract

**There is no cross-resource atomicity here, and none is claimed.** `business_process_drafts`,
`departments.metadata`, `status_definitions` and `work_units` are four resources, and Supabase
PostgREST gives Node no multi-statement transaction. Inventing a fake one would be worse than
naming the limit.

Classification of the three non-builder writes:

| Companion | Nature | Idempotent | Why it is not in the draft |
|---|---|---|---|
| `lifecycle_builder_stage_field_rules_v1` + `lifecycle_progression_requirements_v1` | **independent configuration** in top-level sibling keys | yes — full row replace per stage | category F. The name says "builder"; the storage location is a sibling. Sweeping it into the publish payload by name-matching is the trap the inventory warns about. |
| `status_definitions.metadata.process_stage_key` | **derived projection** of the authored stage↔status selection | yes — set reconcile: assign desired, unassign stragglers | it is per-org status vocabulary, shared across departments; publication is per-department |
| `work_units` row (`lifecycle_wu_*`) | **derived projection** of stage + status keys + membership | yes — keyed upsert on `(org, department, key)` | it is executable queue state, not configuration |

**The contract:**

1. All validation happens before any write. A blocking error means **nothing was written anywhere**.
2. The lifecycle draft is written **exactly once**, and **first**. The operator's authored intent
   becomes durable before any derived projection is touched.
3. Companions run only after the draft write succeeds, in the fixed order C1 → C2 → C3.
4. Each companion is independently idempotent, so **retrying the whole request converges** — no
   duplicated work units, no duplicated status assignments.
5. A companion failure is **reported, not swallowed**: the result carries a per-companion status,
   and the response is a partial success naming exactly what did not land. The draft stays saved;
   the operator re-submits and the idempotent companions catch up.
6. **No published runtime state changes.** `departments.metadata.lifecycle_builder_v1` is untouched,
   so the database guard is never triggered by this path and there is no window in which runtime
   sees a half-applied stage.

Why draft-first and not companions-first: the draft is authored truth, the companions are derived.
If the draft write fails after companions succeeded, projections would describe configuration that
was never saved — the exact inversion this sprint is closing.

---

## 6. Draft validation policy (decision D3)

**Touched** means a reference introduced or changed *by this save*, in *this stage*.

Implementation: run `validateProcessStageReferences` over the process **before** and **after** the
in-memory mutation. A violation is **blocking** when its
`(source_stage, reference, reference_kind, invalid_target)` signature is absent from the *before*
set **and** `source_stage` is the stage being saved. Every other violation — including every
pre-existing defect elsewhere in the graph — is a **warning** that does not prevent the save.

Additionally, a `parent_stage_key` set by this save that names a stage outside the process inventory
is a touched blocking error; `validateProcessStageReferences` does not walk that field.

This satisfies D3 in both directions: a tenant whose legacy graph is already broken can still edit
unrelated stages, and a newly introduced dangling reference is refused at the point it is authored.
Full-graph blocking stays at publish, which is **Law 3 and out of scope here**. No publish validator
is built in this slice; the before/after diffing primitive is deliberately small and lives with the
stage save.

---

## 7. Known consequence, for review

After this slice a stage save writes the **draft** and no longer changes the runtime projection.
Until a publish affordance ships, an operator's stage edit will not take effect at runtime, and the
stage editor — which reads `departments.metadata` — will not show it back.

That is the publication model working as designed (`publication_required: true` says so), but it is
a real product gap, and it is the reason the capability is not flipped to `publish_required` and the
guard stays in `warn`. The next slices must land the draft-aware read path and the publish action
before this flow is exposed to a live tenant.
