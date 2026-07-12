# Work View Runtime Materialization

**Status:** Implemented — pending review
**Branch:** `claude/work-view-runtime-materialization` (off `origin/staging`)
**Scope:** make every configured, visible Work View appear as its own runtime navigation/operational
item. **Not** in scope: the predicate builder (see `work_view_conditions_v3.md`), Create Lead, action
renames.

---

## Symptom

An operator configured 6 Work Views on the Enrollment process (New Leads, Active Pipeline, Registration,
Waitlist, Tours, All Leads). The `/workspace` process tile reflected the configuration, but runtime left
navigation showed only:

```
Enrollment
  └── New Leads
```

— and the Work Unit page likewise collapsed to New Leads.

---

## Root cause — the collapse seam

Runtime nav was **queue-lane-driven**, not **Work-View-driven**. The chain:

`buildOperatorLifecycleLanding.workViewNavEntriesForDepartment`
→ `resolveOperationalViewsForWorkUnit`
→ `operationalPerspectivesFromWorkViews` / `workViewToOperationalPerspective`

dropped any Work View that did **not** bind a `queue_definition` lane:

```ts
// workViewsRuntimeConvergence.ts (before)
const queueKey = view.compat_queue_key?.trim();
if (!queueKey) return null;                       // ← view without a bound lane → dropped
...
const matched = rows.filter((row) => laneSet.has(row.queue_key));
return matched.length ? matched : rows;           // ← further filtered to existing lanes
```

The 6 configured views had no `compat_queue_key` (the save-time enricher only runs in the settings
editor, and even then only maps to lanes that exist). With one real lane (`new_leads`), 5 of 6 views were
filtered out and the rail fell back to the single default lane.

`compat_queue_key` is real but **optional** — it predates the predicate builder and binds a view to a
pre-existing queue lane. Treating its absence as "drop the view" is what collapsed 6 → 1.

---

## Fixed seam

`buildOperatorLifecycleLanding.workViewNavEntriesForDepartment` now reads the configured Work Views
**directly** (`savedWorkViewsFromDepartmentMetadata`) and materializes one nav item per visible view,
ordered by `display_order`:

```ts
// each visible Work View → its own nav item
if (compat) {
    // binds a pipeline lane → keep the canonical lane-slug route (preserves existing routes + default)
    const laneKey = operatorWorkUnitKeyForPipelineQueueKey(compat) ?? compat;
    return { label, platformKey: laneKey, href: operatorWorkUnitHrefFromKey(laneKey) };
}
// no bound lane → materialize via ?work_view=<id> instead of dropping
return { label, platformKey: view.id, href: operatorWorkViewHref(hostWorkUnitKey, view.id) };
```

So nav no longer depends on the lane-bound collapse. Result:

```
Enrollment
  ├── New Leads
  ├── Active Pipeline
  ├── Registration
  ├── Waitlist
  ├── Tours
  └── All Leads
```

---

## Per-view route, predicates, and count

- **Stable route.** `?work_view=<id>` is an already-supported route param
  (`readWorkUnitQueueLocationParams` reads it). Each view gets a stable, distinct route on the host work
  unit's slug; lane-bound views keep their existing lane-slug route. The **legacy New Leads route is the
  compatibility default** (`resolveDefaultEntryQueue`).
- **Own predicates.** `resolveActiveWorkViewRuntimeContext` resolves the active view **by id** and returns
  its `filters` + `match` (V3). No `compat_queue_key` is required for predicate resolution.
- **Own count.** The queue route filters the base rows by the active view's predicates
  (`filterQueueRowsByWorkViewFilters(items, ctx.filters, ctx.match)`, shipped in V3), so counts differ when
  predicates differ, with a correct empty state when nothing matches.
- **Focus Panel preserved.** `/workspace/work-unit/:slug/:recordId` opens the record by id; the query
  string is not part of the record-id path, so `?work_view=` never interferes.

---

## Backward compatibility

- **No DB migration / no schema change.** Work Views still live in
  `lifecycle_builder_v1.processes[].work_views_v1` (department metadata). No queue_definition rewrite.
- **Lane-bound views unchanged.** A view with a `compat_queue_key` that matches a lane keeps its exact
  prior route and behavior (locked by the existing nav-builder test).
- **Legacy / no Work Views configured.** Falls back to the prior queue-lane / stage-derived nav (New Leads
  default) — unchanged.

---

## Stage / status model note (documented, not solved)

Per the sprint guidance, Stage roll-up is **not** solved here. Conclusion to carry forward:

- **Stage is an operational bucket / roll-up over statuses and work**, not a status itself.
- **Work Views should consume stages as configured process-stage buckets** (the V3 *Stage* condition
  already references configured process stages).
- This is the next modeling cleanup after runtime materialization.

**Known follow-up (tied to the above):** the Work Unit page **header pill row** is still queue-backed —
`applyOperationalViewsToPillSections` filters/relabels existing `queue_definition` lanes and
`coercePerspectivesV1ForLanes` re-binds to lanes, so the simultaneous all-pills row does not yet mint a
pill-with-count for a predicate-only view. The **left navigation** (the primary surface) materializes all
views, and each opens its own predicate-evaluated view + count. Converting the header pill row to render
every configured Work View with its own predicate-derived count is the bounded next step.

---

## Tests

- `tests/lib/admin/buildOperatorLifecycleLanding.test.ts` — 6 configured views → 6 nav items; hidden/inactive
  excluded; order preserved (incl. shuffled input); stable per-view `?work_view=` route + platformKey;
  mixed lane-bound + predicate-only both materialize; legacy (no views) falls back to New Leads default;
  existing lane-bound routing unchanged.
- `tests/lifecycle/resolveWorkViewRuntimeContext.test.ts` — selecting each view by id resolves its own
  `filters` + `match`; counts differ when predicates differ (via the evaluator); focus-panel record-id path
  parses correctly alongside `?work_view=`.

---

## Files changed

| Concern | File |
|---------|------|
| Nav materialization — one item per visible Work View | `web/lib/admin/buildOperatorLifecycleLanding.ts` |
| `?work_view=` route helper | `web/lib/admin/canonicalOperatorRoutes.ts` |
| Doc — materialization model + Stage roll-up note | `docs/platform/core/business-process-system.md` |
| Tests | `web/tests/lib/admin/buildOperatorLifecycleLanding.test.ts`, `web/tests/lifecycle/resolveWorkViewRuntimeContext.test.ts` |

> Note: the user's task referenced `docs/platform/modules/business-process-system.md`; the canonical file
> is `docs/platform/core/business-process-system.md` (updated here).
