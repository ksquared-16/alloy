# Work View Conditions V3 — Real Predicate Builder

**Status:** Implemented — pending review
**Branch:** `claude/work-view-conditions-v3` (off `origin/staging`)
**Supersedes:** the typed-list scope of [`work_view_conditions_v2.md`](./work_view_conditions_v2.md).

**Goal:** Replace the shallow typed-list fix (V2) with a real Work View **predicate builder** — canonical/configured field sources, clean option sets, and AND/OR condition logic with a runtime evaluator that honors all of it.

> Doctrine (unchanged from V2, reaffirmed): **Stages are not deleted.** Stages remain the process
> spine. Work Views reference them through a typed field. **Status is always subject-specific** — a
> condition field declares which status group/entity it uses. **Options come from config/canonical
> registries, never hardcoded subsets.**

---

## Root cause (why V2 was still wrong)

V2 introduced a typed registry but left four gaps:

1. **Tiny hardcoded field list.** `WORK_VIEW_CONDITION_FIELD_DEFS` was 9 fixed fields — missing **Room**,
   **Desired Start**, and **Current Work** entirely.
2. **Polluted Campus options.** The editor sourced campuses from `/api/admin/locations`, which returns
   **every** location row (units, addresses, hierarchy scaffolding) — not just real campuses.
3. **"Lead Stage" mislabel.** The process-stage field was labeled "Lead Stage", reading as a separate
   abstract field rather than *the process's configured stages*.
4. **No AND/OR.** `filters_v1` was a flat array the evaluator combined as implicit **AND only** — there
   was no way to express "status is X **or** status is Y".

(The "Enrollment Status looks incomplete" symptom is the same class of problem: the field must pull the
**full** configured enrollment set, and operators must be able to pick any of them.)

---

## New predicate model

A Work View is `{ match, filters_v1[] }` evaluated against queue-row facts.

```ts
// workViewsConfigV1.ts
type WorkViewFilterMatchV1 = "all" | "any";          // all = AND, any = OR

type WorkViewConfigV1Stored = {
  …;
  match?: WorkViewFilterMatchV1;                       // absent = "all" (AND) — legacy-safe
  filters_v1?: WorkViewFilterV1[];                     // unchanged shape
};

type WorkViewFilterV1 = { field_key; operator; value };
```

- **Fields come from the canonical registry** (`workViewConditionFieldRegistry.ts`). Each field declares
  its subject/entity, value kind, **option source**, operators, and runtime resolver. The editor's
  field picker and the runtime evaluator both read this one registry.
- **Match is Work-View-level** (`match: all | any`) — the minimum acceptable grouping. Per-group nesting
  is a future extension; the stored shape and evaluator are forward-compatible.

### V3 field set (the "Enrollment needs" start set)

| Field (label) | Key | Subject | Option source |
|---------------|-----|---------|---------------|
| **Stage** | `opportunity_stage` | opportunity | configured **process stages** |
| **Lead Status** | `opportunity_status` | opportunity | `status_definitions` (`opportunities`) |
| **Enrollment Status** | `child_enrollment_status` | child | `status_definitions` (`opportunity_customer_members`) — **full** set |
| **Campus** | `site` | record | `locations` where `location_type='site'` |
| **Program** | `program` | child | configured program categories |
| **Room** | `room` | child | `locations` where `location_type='unit'` |
| **Desired Start** | `desired_start_date` | child | date (preset / relative / custom) |
| **Needs Attention** | `needs_attention` | record | boolean |
| **Current Work** | `current_work` | record | boolean (has open work) |
| *(retained)* Tour date, Updated, Needs follow-up | … | … | … |

### Stage handling

The process-stage field is labeled simply **"Stage"** (not "Lead Stage"). Its options are the process's
**configured, active stages** (`process.stages[]`, served by the process-work-views GET). It is **not** a
status set and stages are never deleted — Work Views reference them through this one typed field.

### Status handling (subject-specific)

- **Lead Status** → opportunity case statuses (`status_definitions` for `opportunities`).
- **Enrollment Status** → the **full** configured child/OCM enrollment set (`status_definitions` for
  `opportunity_customer_members`, resolved as org defs ∪ industry defaults — never an in-code subset).
- Each status field declares its entity via `optionSource.entityType`, so the two never share a dropdown.

### Campus/School options (clean source)

Product language here is **Campus** (kept per existing config). The option source is now scoped to real
campuses: the editor requests `/api/admin/locations?location_type=site`, so units/addresses/program
scaffolding never appear. **Rooms** use the sibling `location_type=unit` set.

---

## AND / OR model

- Stored as `match: "all" | "any"` on the Work View (default **all** = AND).
- Editor: a **Match all (AND) / any (OR)** toggle appears once a view has more than one condition
  (`WorkViewConditionEditor` → `onMatchChange` → `updateSelected({ match })`).
- Runtime: `resolveActiveWorkViewRuntimeContext` resolves `match` (defaulting to `all`) and the queue
  route passes it to the evaluator.

Examples now expressible:
- *status is Waitlist **OR** status is Tour* → `match: any`, two `opportunity_status` equals conditions.
- *school is South Campus **AND** room is Toddler 1* → `match: all`, `site` + `room` conditions.

---

## Runtime evaluator

`evaluateWorkViewFiltersForRow(row, filters, match = "all")` and
`filterQueueRowsByWorkViewFilters(rows, filters, match = "all")`:

- **AND (`all`):** every condition must pass; short-circuits on first failure (pre-V3 behavior).
- **OR (`any`):** passes on the first supported condition that matches; if **no** condition is evaluable
  (all unsupported), it fail-opens (passes) — mirroring AND's fail-safe so a misconfigured view never
  silently hides all work.
- **Typed field keys** resolve via the registry's `runtimeField`; new fields resolve row facts:
  `room` (`room_id`/`room_key`/`site_room`/…), `desired_start_date` (row/metadata date),
  `current_work` (`has_open_work` / `open_work_count > 0`).
- **Stage** filters against `lifecycle_stage_key` (configured stages), **statuses** against the correct
  status key, **campus/room/program** against canonical ids/keys/labels.

---

## Backward compatibility & migration

- **No DB migration.** Work Views still live in `lifecycle_builder_v1.processes[].work_views_v1`
  (department metadata). The only new persisted field is the optional `match`.
- **Legacy keys normalize on load** (unchanged): `stage → opportunity_stage`, `status →
  opportunity_status`, `location → site`. V3 adds `enrollment_status` / `child_status →
  child_enrollment_status` aliases so the renamed field never silently drops an ambiguous key.
- **Absent `match` = AND.** Saved views with no `match` load unchanged and evaluate exactly as before.
  An invalid `match` value is **not** silently reinterpreted — it resolves to `all` (AND).
- **Relabel only.** "Lead Stage" → "Stage" and "Child Enrollment Status" → "Enrollment Status" are label
  changes; the stored/runtime keys are unchanged, so existing saved conditions keep resolving.

---

## Tests

`web/tests/lifecycle/` (all green; **0 net-new failures** vs the pre-existing baseline):

- `workViewConditionFieldRegistry.test.ts` — field picker covers the configured/canonical set (≥11
  fields, not the V2 tiny list); V3 labels (Stage / Lead Status / Enrollment Status / Campus); Stage
  options from process stages; Lead vs Enrollment status from their own `status_definitions` entities;
  Campus source is `locations` (editor scopes to `site`); Room source is `rooms`.
- `evaluateWorkViewFiltersV1.test.ts` — **AND** behavior; **OR** behavior (status X or Y); `filter…`
  threads the combinator; new `room` / `desired_start_date` / `current_work` resolution; **mixed
  predicates** (school AND room); OR fail-open only when nothing is evaluable.
- `workViewsConfigV1.test.ts` — `match` parsing (explicit `any` persists; absent → AND; garbage → AND);
  legacy key normalization.
- `workViewEditorSummaries.test.ts` — updated for the "Stage" label.

---

## Files changed

| Concern | File |
|---------|------|
| Field registry (relabel + Room/Desired Start/Current Work + sources) | `web/lib/lifecycle/workViewConditionFieldRegistry.ts` |
| Stored shape + `match` parse + `resolveWorkViewMatchV1` | `web/lib/lifecycle/workViewsConfigV1.ts` |
| Evaluator AND/OR + new-field resolution | `web/lib/lifecycle/evaluateWorkViewFiltersV1.ts` |
| Value controls (`room_select`) | `web/lib/lifecycle/workViewFilterValueControls.ts` |
| Runtime context carries `match` | `web/lib/lifecycle/resolveWorkViewRuntimeContext.ts` |
| Queue route passes `match` | `web/app/api/admin/queues/[workUnitId]/[queueKey]/route.ts` |
| Clean campus/room source (`location_type` filter) | `web/app/api/admin/locations/route.ts` |
| Editor: sites-only + rooms fetch + AND/OR toggle | `web/components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx` |
| Value control widget (`room_select`) | `web/components/adminV2/settings/businessProcess/WorkViewConditionValueControl.tsx` |
| Parent card wires `match` | `web/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard.tsx` |

---

## Known follow-ups (not in this slice)

- **Per-group nesting** (mixed AND/OR groups) — the stored shape + evaluator are forward-compatible; only
  Work-View-level `match` ships now.
- **`current_work`** resolves from row signals (`has_open_work` / `open_work_count`); wiring a canonical
  open-work projection onto every queue row is a separate enrichment task.
- **Server-side option hardening:** the editor scopes Campus to `location_type=site`; a dedicated
  canonical campus/room resolver endpoint could replace the param-filtered `/api/admin/locations`.
- **Name/label vs id matching:** `site`/`room` evaluate by id or label (enrichment-tolerant); a strict
  id-only runtime is a future tightening once all rows carry canonical ids.
