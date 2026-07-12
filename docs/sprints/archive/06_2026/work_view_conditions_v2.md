# Work View Conditions V2 — Typed Operational Fields

**Status:** Implemented (initial typed-field scope) — pending review
**Branch:** `claude/work-view-conditions-v2` (off `origin/staging`)
**Goal:** Replace the generic `Stage` / `Status` condition fields in process-level Work Views with **typed operational fields** whose option sources, operators, and runtime resolvers are entity-correct.

> Doctrine: **Stages are not deleted.** Stages remain the process spine (status membership, requirements, operating plan, readiness). Work View conditions stop exposing generic "Stage" / "Status" and instead expose typed predicates that answer *"Who belongs in this operational view?"*

---

## Phase 1 — Audit of the current condition model

### Where Work Views live

Process-level Work Views were introduced on `origin/staging` (see
[`configuration_runtime_process_work_views_realignment.md`](./configuration_runtime_process_work_views_realignment.md)).
They are stored as `work_views_v1` on `lifecycle_builder_v1.processes[]` (department metadata — **no DB migration**).
Stage-scoped `perspectives_v1` remains a read-only compatibility seed.

| Concern | File |
|---------|------|
| Saved shape (`WorkViewFilterV1`) + field option list | `web/lib/lifecycle/workViewsConfigV1.ts` |
| Value-control resolver (operators, control kind, coercion) | `web/lib/lifecycle/workViewFilterValueControls.ts` |
| Editor UI (field / operator / value rows) | `web/components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx` |
| Value control widget | `web/components/adminV2/settings/businessProcess/WorkViewConditionValueControl.tsx` |
| Runtime evaluator | `web/lib/lifecycle/evaluateWorkViewFiltersV1.ts` |
| Load-time seed / compatibility | `web/lib/lifecycle/workViewsCompatibility.ts` |
| Persistence (save) | `web/lib/lifecycle/persistWorkViewsV1.ts` |
| Load + save API | `web/app/api/admin/lifecycle-builder/process-work-views/route.ts` |
| Editor data context | `web/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext.tsx` |

### Saved condition shape

```ts
// workViewsConfigV1.ts
type WorkViewFilterV1 = {
  field_key: string;                  // "status" | "stage" | "location" | "tour_date" | "updated_at" | "needs_follow_up"
  operator: WorkViewFilterOperatorV1; // equals | not_equals | is_any_of | is_empty | is_not_empty | date_is | date_between
  value: unknown;
};
```
Stored at `processes[].work_views_v1[].filters_v1`. All filters AND together (empty list passes all rows).

### Condition field list (first dropdown)

`WORK_VIEW_FILTER_FIELD_OPTIONS` in `workViewsConfigV1.ts`:

| key | label |
|-----|-------|
| `status` | **Status** |
| `stage` | **Stage** |
| `location` | Location |
| `tour_date` | Tour date |
| `updated_at` | Updated |
| `needs_follow_up` | Needs follow-up |

### Root cause — why "Stage" and "Status" show the same options

1. **Shared control kind.** `workViewFilterValueControls.ts` declares
   `const STATUS_FIELD_KEYS = new Set(["status", "stage"])`, so
   `resolveWorkViewFilterValueControlKind()` returns `"status_select"` for **both** `status` and `stage`.
2. **Single option source.** `WorkViewConditionEditor.tsx` fetches exactly one status set —
   `GET /api/admin/status-options?entity_type=opportunities` — and passes the **same `statusOptions`** array
   to the value control for both fields.
3. **Opportunity case statuses = Open / Closed / Inactive / Archived.** That set comes from
   `STATUS_RESEED_OPPORTUNITY_CASE_STATUSES` (`web/lib/admin/statusReseed/statusMvpCatalog.ts`), and the
   `status-options` route filters opportunities to `OPPORTUNITY_CASE_STATUS_KEYS` (`open/closed/inactive/archived`).

So picking **"Stage equals Open"** is meaningless — `stage` is never `open`. The bug is purely in the **UI option source**, not the runtime.

### Which runtime filters actually work today

`evaluateWorkViewFiltersV1.ts` — `SUPPORTED_FIELD_KEYS = {status, stage, location, tour_date, updated_at, needs_follow_up}`.
Notably the runtime **already distinguishes stage from status**:

| field_key | runtime row source |
|-----------|--------------------|
| `status` | `enrichment.statusKey ?? statusDisplay ?? row.status_key` |
| `stage` | `row.lifecycle_stage_key ?? row._lifecycle_stage_key` |
| `location` | `enrichment.locationLabel ?? row.site_id ?? row.location_id` |
| `tour_date` | `row.metadata.tour_date ?? enrichment.tourDisplay` |
| `updated_at` | `row.updated_at` |
| `needs_follow_up` | `row._needs_follow_up`/`needs_follow_up`/`enrichment.attentionReason` → boolean |

`date_between` and unsupported fields are **fail-safe** (row passes through with a `supported:false` note).
Matching uses `norm()` (lowercase + `_`), with `===` or substring `includes`, so a stage **label** value
(`"New Lead"`) still matches a stage **key** (`new_lead`).

### Option sources available (verified)

| Source | Endpoint / module | Notes |
|--------|-------------------|-------|
| Opportunity status | `GET /api/admin/status-options?entity_type=opportunities` | case statuses Open/Closed/Inactive/Archived |
| Child enrollment (OCM) status | `GET /api/admin/status-options?entity_type=opportunity_customer_members` | New Lead / Contacting / Qualified / … (OCM dispositions) |
| Parent / person status | `GET /api/admin/status-options?entity_type=persons&status_profile=generic\|child` | person status defs |
| Process stages | `process.stages[]` (`LifecycleBuilderStageRecord` — `key`/`label`/`sort_order`) | configured per process |
| Site | `GET /api/admin/locations` → `locations[]` (`id`, `label`/`name`) | |
| Program | `GET /api/admin/location-program-categories[?location_id=]` | location-aware |

### Do existing saved Work Views use `stage` / `status`?

- No org has authored `work_views_v1` with the typed keys yet (feature is new).
- The **compatibility seed** (`workViewsCompatibility.ts`) emits `{ field_key: "stage", operator: "equals", value: <stageLabel> }`.
- The legacy editor wrote `status` and `stage`.

⇒ Both legacy keys must be normalized on load (see Phase 5).

---

## Phase 2 — Typed condition field registry

New canonical module: **`web/lib/lifecycle/workViewConditionFieldRegistry.ts`** — single source of truth consumed by
the value-controls, the editor field list, the runtime evaluator, and the legacy normalizer.

Each field declares: `key`, `label`, `group`, `subject`, `valueKind`, `optionSource`, `operators`, `runtimeField`, `runtimeSupported`.

**Initial scope (replaces generic Stage/Status safely):**

| canonical key | operator label | group | subject | option source | runtime |
|-----|-------|-------|---------|---------------|---------|
| `opportunity_stage` | **Lead Stage** | Lead | opportunity | process stages | `lifecycle_stage_key` |
| `opportunity_status` | **Lead Status** | Lead | opportunity | status defs (`opportunities`) | `statusKey` |
| `child_enrollment_status` | Child Enrollment Status | Child | child | status defs (`opportunity_customer_members`) | child status |
| `program` | Program | Child | child | programs (location-aware) | `program` |
| `site` | **Campus** | Household | record | locations | `location` |
| `needs_attention` | Needs Attention | Operational | record | boolean | attention flag |

> **Operator labels vs canonical keys:** operators see *Lead Stage / Lead Status / Campus*; the stored/runtime keys stay `opportunity_stage` / `opportunity_status` / `site`. Fields are grouped by **operational subject** (Lead / Child / Household / Operational), not platform concept.

Retained typed fields (already working, kept in registry): `tour_date` (Lead), `updated_at` + `needs_follow_up` (Operational).
Generic `status` / `stage` / `location` are **removed from the field list** but remain
**migration + runtime aliases** so existing saved/seeded views keep working.

---

## Phase 5 — Migration / normalization (load-time + seed)

`normalizeLegacyWorkViewFilterKey()` applied in `parseWorkViewsV1` (load) and seed:

| legacy key | canonical key |
|------------|---------------|
| `stage` | `opportunity_stage` |
| `status` | `opportunity_status` |
| `location` | `site` |

Unambiguous in this codebase: legacy `status` already meant opportunity case status, and `stage` already meant the
process lifecycle stage. Canonical keys are persisted going forward (save path normalizes too). Genuinely unknown keys
stay as-is and are reported `supported:false` by the runtime (fail-safe pass-through) rather than silently
reinterpreted.

---

## Phases 3/4/6/7/8 — as landed

- **Phase 3** option sources — wired per-field in the editor via `optionsForField()`:
  - Lead Stage (`opportunity_stage`) → process stages (new `stages[]` on the `process-work-views` GET, surfaced through `WorkViewsConfigurationContext.stageOptions`).
  - Lead Status (`opportunity_status`) → `GET /api/admin/status-options?entity_type=opportunities`.
  - Child Enrollment Status → `GET /api/admin/status-options?entity_type=opportunity_customer_members`.
  - Campus (`site`) → `GET /api/admin/locations`; Program → `GET /api/admin/location-program-categories`.
- **Phase 4** UI (`WorkViewConditionEditor.tsx`) — grouped (`<optgroup>`) field dropdown from `workViewConditionFieldGroups()`; operators re-derive from the registry on field change; `patchWorkViewFilterRow` clears the value to the new field's typed default so stale options cannot leak; the value control (`WorkViewConditionValueControl.tsx`) takes a single per-field `options` array.
- **Phase 6** runtime (`evaluateWorkViewFiltersV1.ts`) — `SUPPORTED_FIELD_KEYS` is derived from the registry; resolvers added for `opportunity_stage`, `opportunity_status`, `child_enrollment_status`, `site`, `program`, `needs_attention`; legacy `stage`/`status`/`location` are canonicalized before evaluation, so old and typed keys behave identically. Fail-safe pass-through for genuinely unknown fields and `date_between` is unchanged.
- **Phase 7** tests:
  - `web/tests/lifecycle/workViewConditionFieldRegistry.test.ts` (new) — field list excludes generic Stage/Status; typed fields present + grouped; option sources per field; Stage vs Status distinct control + source; legacy alias normalization.
  - `web/tests/lifecycle/workViewFilterValueControls.test.ts` — stage_select / program_select kinds; stale-value clearing on field change.
  - `web/tests/lifecycle/evaluateWorkViewFiltersV1.test.ts` — typed runtime keys + legacy/typed equivalence.
  - `web/tests/lifecycle/workViewsConfigV1.test.ts` — legacy `stage`/`status`/`location` normalize on load.
  - `web/tests/lifecycle/workViewEditorSummaries.test.ts` — typed field labels.
- **Phase 8** docs — this file + `docs/platform/core/business-process-system.md` (§ Work View conditions — typed operational predicates). `actions-and-workflows.md` left unchanged: its "conditions" are workflow-automation conditions, a separate concept from Work View operator filters.

### Validation

- `npx vitest run tests/lifecycle/*workView*` + registry/evaluator/config tests — **53 passed**.
- Touched-file typecheck — **clean** (no `error TS` in any file changed by this work; the repo's pre-existing 73 baseline errors live only in unrelated test/script files).
- Baseline note: the lifecycle UI suite has **53 pre-existing failures / 30 files** on clean `origin/staging`; this change adds **zero** new failures. adminV2 configuration-runtime suite: **6 pre-existing failures** on baseline, unchanged.

### Deferred (typed registry extension points)

`Schedule`, `Desired Start`, `Parent/Person Status`, `Has Missing Required Info`, `Primary Contact`, `Child Age`, `Household Size`, `Readiness`, `Has Current Work` are scoped in the registry's grouping model but **not yet implemented** — add as registry entries + runtime resolvers when needed (UI hides any field that is not `runtimeSupported`).
