# Operational Surface Unification

**Path:** `docs/platform/experience/operational-surface-unification.md`
**Status:** Canonical (July 2026). Documents the unification of the Workspace process tile and
Work Unit header as collapsed/expanded representations of the same operational runtime object.
**Companion docs:**
- [`operational-navigation-contract.md`](./operational-navigation-contract.md) — nav contract for the transition between them
- [`operational-experience-doctrine.md`](./operational-experience-doctrine.md) — what surfaces must feel like

---

## Product principle

> The Workspace process tile is the **collapsed representation** of a Work Unit.
> The Work Unit is the **expanded representation** of that same object.
> They share one canonical operational model. An operator should immediately understand they are
> looking at the same thing at different zoom levels.

---

## Canonical runtime model

Both surfaces derive from a single canonical source:

```
work_units row
  └── queue_definition (JSONB)
        └── ui.sections[]         ← canonical queue list, labels, ordering
              └── section.chips[] ← individual queue pill definitions
```

Neither the Workspace tile nor the Work Unit header owns a separate queue definition.
Both read `queue_definition.ui.sections` — the Workspace tile via `extractPipelineExecutionLanes()`,
the Work Unit header via `queueUi.sections` (resolved from the same field via `WorkUnitAboveFoldHeaderChips`).

---

## Workspace tile vs Work Unit header — comparison table

| Dimension | Workspace tile | Work Unit header | Canonical source |
|---|---|---|---|
| **Queue list** | `extractPipelineExecutionLanes(queue_definition.ui.sections)` | `queueUi.sections` (same field) | `work_units.queue_definition.ui.sections` |
| **Queue ordering** | Insertion order of `ui.sections` | Same | `queue_definition` |
| **Queue labels** | `section.label` | `section.label` | `queue_definition` |
| **Queue counts** | 30s TTL cache (`LIFECYCLE_SIBLING_FETCH_TTL_MS`) | Fresh on every navigation | WU summaries endpoint |
| **Count staleness** | Up to 30s stale on repeated workspace visits | Fresh | Acceptable — documented below |
| **Queue pill grid** | Row-in-lane layout, workspace tile width | `computeEqualStagePillGrid` → horizontal scroll grid | Layout only, same data |
| **KPI tiles** | `resolveKpisForDepartment()` + `workspace_kpi_placement` | `MetricPlacementRenderer` → `/api/admin/metrics/resolve` | Divergent (documented below) |
| **Work Unit name** | `processName` from `LIFECYCLE_COMMAND_PROCESS_LABEL` or WU row | Same | `work_units.name` / config label |
| **Skeleton chips** | Not applicable (tile is pre-loaded) | `queueTabPlaceholders` from `queueDef` | `queue_definition` via page cache |

---

## Queue collection: same source, confirmed

The queue collection is identical between both surfaces. They are not two implementations of queue
display — they are two layout renderings of the same `queue_definition.ui.sections` data.

**Workspace tile path:**
```
dept bootstrap → work_units[].queue_definition
  → extractPipelineExecutionLanes(ui.sections)
  → WorkspaceDeptOperQueueLanes (row rendering)
```

**Work Unit header path:**
```
WU bootstrap → work_unit.queue_definition
  → queueUi.sections (via WorkUnitAboveFoldHeaderChips)
  → computeEqualStagePillGrid (equal-width pill grid)
```

Both paths share `suppress_other_pill` and other UI flags from `queue_definition`.

---

## Count reconciliation

Workspace tile counts are cached with a 30-second TTL (`LIFECYCLE_SIBLING_FETCH_TTL_MS = 30_000`).
Work Unit header counts are fetched fresh on every navigation.

**This means:** immediately after a soft nav from Workspace → Work Unit, the Work Unit header may
show counts that are newer than what the Workspace tile showed. The reverse is also possible within
a 30s window on repeated workspace loads.

**Verdict:** This is **acceptable** and expected. The operator is now looking at the Work Unit
directly — the fresh counts are correct. The workspace tile count is a cached operational summary,
not a live counter. Reconciling these would require cache invalidation on every WU navigation return,
which is not worth the complexity for a ≤30s window.

**No code change required.** The staleness is documented and bounded.

---

## KPI divergence (non-blocking debt)

The KPI tile row shows different data on each surface:

- **Workspace tile**: `resolveKpisForDepartment()` + `workspace_kpi_placement` table
- **Work Unit header**: `MetricPlacementRenderer` → `/api/admin/metrics/resolve` endpoint

These are entirely separate systems. Unifying them is a Commercial Model / Operational Config
problem, not a surface unification problem. This is recorded as known debt and is out of scope
for this sprint.

---

## Skeleton chip gap: fix applied

On a cold first visit (no page cache), the Work Unit header had no skeleton chips during the brief
bootstrap window. The root cause was that both `mapBootstrapWorkUnits()` and `mapDeptWorkUnitRows()`
discarded `queue_definition` from the raw work unit rows, so `queueDef` was null until the WU
bootstrap responded.

**Fix (Phase 3):** The workspace dept bootstrap pre-seeds `CachedWorkUnitPage` entries for each
work unit with `queue_definition` before soft nav commits. On soft nav, `readWorkUnitPageCache()`
hits immediately → `workUnit.queue_definition` is available from first render → `queueDef` →
`queueUi` → `queueTabPlaceholders` → skeleton chips visible before bootstrap responds.

**File:** `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` — pre-seeding block after
`setDept(deptCommit)` in the dept bootstrap resolution handler.

**Cold path for truly first-ever session visits** (no workspace bootstrap yet):
skeleton chips appear once the WU bootstrap responds (≤200ms with pointer-down prewarm). This
window is documented in the navigation contract and is the only acceptable skeleton window.

---

## Remaining operational debt

| Debt | Surface | Severity | Sprint |
|---|---|---|---|
| KPI tile divergence (workspace vs WU header use different systems) | Both | Medium | Commercial Model V2 |
| Count staleness up to 30s on workspace tile | Workspace tile | Low | Acceptable by design |
| First cold visit skeleton window (≤200ms, no workspace bootstrap yet) | WU header | Low | Acceptable |
| `builderOwnedLifecycleShell` path shows sibling pills instead of queue chips | WU header (lifecycle stage WUs only) | Low — by design for lifecycle stages | N/A |
