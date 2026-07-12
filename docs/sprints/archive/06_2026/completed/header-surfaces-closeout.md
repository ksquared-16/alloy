# Surface Builder / Header Surfaces — Phase Closeout

**Path:** `docs/sprints/06_2026/completed/header-surfaces-closeout.md`
**Date:** 2026-07-01
**Status:** **Closed**
**Scope:** Header surface runtime convergence — Workspace Header and Work Unit Header now read from and display published metric surfaces.

**Source sprint docs:**
- [`../analytics-operational-intelligence-platform/`](../analytics-operational-intelligence-platform/) — OIP architecture, Slices 1–3
- [`../analytics-surface-builder/README.md`](../analytics-surface-builder/README.md) — Surface Builder canonical model
- [`../surface-builder-v2/README.md`](../surface-builder-v2/) — UX design (mockups + walkthrough)

---

## What this phase closed

This phase closed the gap between the Surface Builder authoring experience and the operator-facing runtime headers. Before this work:

- The Surface Builder could publish surfaces to `metric_placements`.
- `MetricPlacementRenderer` could read and render those placements.
- The Workspace Header and Work Unit Header *wired to* that renderer — but the visual output was incorrect: tiles were the wrong height, appeared flat against a white background, and the Work Unit Header pills showed only queues that had records (not all configured Work Views).

After this phase, the runtime headers match the builder preview.

---

## What shipped

### Sprint 5 — Header tile height parity (PR #41, merge `33c9544dc`)

**Problem:** KPI and Trend tiles had inconsistent heights between the Workspace Header, Work Unit Header, and builder preview. Trend tiles (with sparklines) were taller than KPI tiles, making the row ragged.

| File | Change |
|------|--------|
| `web/components/admin/metrics/MetricCardShell.tsx` | Added `min-h-[80px]` to the compact `sizeClass` so every header tile has a fixed minimum height |
| `web/components/admin/metrics/MetricSparkline.tsx` | Reduced compact SVG height from 24 → 16px; loading placeholder from `h-6` → `h-4` so sparkline fits within the 80px shell |
| `web/components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx` | Changed both `MetricPlacementRenderer` zones from `layout="inline"` → `layout="row"` to remove `items-center` (which was causing vertical misalignment between header tile rows) |

**Result:** KPI and Trend tiles are the same height everywhere — workspace header, work-unit header, and builder preview.

---

### Sprint 6 — Work Unit Header tile contrast + complete Work View pills (PR #45)

**Problem 1:** Work Unit Header tiles appeared as flat, borderless rows with no card identity. Root cause: `resolveMetricCardSurface` returns `bg-white` tiles; `adminv2-os-context` is also white; the 15%-opacity border and 5%-opacity shadow are invisible on white.

**Problem 2:** Work View pills under the Work Unit Header showed only queues that had records in the API response. Work Views with zero current records were silently absent.

| File | Change |
|------|--------|
| `web/app/adminV2/components/alloyOsRuntime.css` | Added `background: var(--alloy-os-canvas, #f6f8fc)` to `.adminv2-os-context__metric-tiles` — same canvas background the workspace uses, giving white tiles contrast |
| `web/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata.ts` | Added `ensureAllOperationalViewsInSections` — appends synthetic pill entries for any `visible_in_rail` Work View whose queue had zero records, sorted by `display_order` |
| `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` | Calls `ensureAllOperationalViewsInSections` after `applyOperationalViewsToPillSections` in both `queuePillSections` (resolved state) and `queueTabPlaceholders` (loading state) |

**Result:** Work Unit Header tiles have card identity (white card on canvas background). All configured Work Views appear as pills; zero-count views show "—".

---

## Architecture delivered

```
Surface Builder (Settings → Surfaces)
  → metric_placements (published per surface key)
  → MetricPlacementRenderer (surface + zone fetch)
  → MetricCardShell (compact density, fixed size)
  → Runtime header (Workspace Header / Work Unit Header)
```

**Authoring → runtime pipeline is complete and consistent.** An operator can:
1. Open Surface Builder for Workspace Header or Work Unit Header
2. Configure cards in the inspector
3. Publish
4. See the change immediately in the live header at runtime

The builder preview and the runtime now render through the same `MetricCardShell` at the same compact density with the same visual contract.

**Work View pills pipeline:**
```
PerspectiveConfigV1Stored (all configured views)
  → visibleOperationalViews (filter visible_in_rail)
  → sortOperationalViews (by display_order)
  → applyOperationalViewsToPillSections (relabel/reorder existing)
  → ensureAllOperationalViewsInSections (fill missing, zero-count)
  → queuePillSections / queueTabPlaceholders
```

---

## Constraints honored throughout

| Rule | Status |
|------|--------|
| No persistence or migration changes | ✅ All changes are pure presentation/runtime |
| No new Surface Builder features | ✅ Builder authoring surface unchanged |
| No Workspace Header changes unless required | ✅ Only `layout="row"` rhythm fix (Sprint 5) |
| No Focus Panel migration | ✅ Focus Panel untouched |
| Pre-existing test failures unchanged | ✅ 8 `workspaceLayoutSurface` failures are pre-existing, count unchanged |
| Zero TypeScript errors in changed files | ✅ Confirmed via targeted typecheck |

---

## Current known limitations

| Area | Limitation | Impact |
|------|-----------|--------|
| **Tile visual treatment** | Tiles use the platform-default MetricCardShell chrome (white card, left accent rail, border, shadow). Not yet Alloy-premium — the "Alloy-specific tile treatment" design from the analytics mockups has not been implemented. | Visual quality is functional, not polished. Operators will see consistent tiles, not the refined tile language from the mockups. |
| **Tile size is fixed** | Compact tiles are always 160×80px. Label length, value size, and sparkline do not adapt. | Long labels truncate at 2 lines; very large numbers may truncate. |
| **Zero-record Work View pills** | `ensureAllOperationalViewsInSections` adds missing pills but the zero-record `queuePillSections` guard (line 1038 of page.tsx) means if ALL configured queues have zero records, no pills are shown at all. | Processes with literally no records in any queue show no pill row. Rare edge case. |
| **Operational Calculations scope** | The Operational Calculations registry is seeded (enrollment metrics, OIP adapters) but not broadly populated. Additional business processes require manual calculation registration before their metrics appear in the Surface Builder content picker. | Teams need to register their calculations before the full value of the authoring model is accessible. |
| **Surface Builder UX (R1–R7 not shipped)** | The SurfaceBuilder extraction (making Focus Panel a consumer of the generic builder), the Promote→Placement rename, the three-step Add Card flow, and the `/settings/analytics` → Operational Calculations rename are designed (mockups + implementation plan) but not yet built. | Builder currently looks like the original OI configuration UI, not the Figma-like product described in `surface-builder-v2/README.md`. |
| **Formula/calculated field support** | Operational Calculations wraps existing OIP resolvers. Net-new formula calculations (arbitrary operator-defined expressions) require new OIP resolver authoring, which is not exposed in the current builder. | Operators cannot define new calculations from scratch inside the product today. |

---

## Future roadmap

Listed in intended sequencing — **no design work committed here.**

| Phase | Scope |
|-------|-------|
| **Premium tile treatment** | Implement the Alloy-specific tile visual language from the analytics mockups — density, accent, background, typography — replacing the current default MetricCardShell chrome in header contexts. |
| **SurfaceBuilder extraction (R1–R2)** | Extract generic `SurfaceBuilder` from `FocusPanelSummarySurfaceEditor`; make Focus Panel a consumer. Prerequisite for all other surface types converging. |
| **Operational Intelligence as second consumer (R3)** | Define `operationalIntelligenceSurfaceDefinition` and render through the extracted builder. OI becomes a first-class surface in the same builder as Focus Panels. |
| **Promote → Placement (R4)** | Rename the Inspector "Promote" tab to "Placement"; add confidence state (Draft → Saving → Published → Runtime updated); add "Open Runtime" link. |
| **Route rename (R6)** | Rename `/settings/analytics` → Operational Calculations (Platform, advanced). Move calculation/rollup/snapshot admin tabs there. Delete standalone Targets / Visibility tabs. |
| **Operational Calculations expansion** | Register calculations for communications, financial, forms, capacity packs. Full content picker coverage across business processes. |
| **Formula authoring** | Operator-facing formula/expression builder for net-new calculations — extends the Operational Calculations descriptor with an expression layer above the OIP resolver. |
| **Focus Panel metric surface** | Wire Focus Panel header cards to the published surface via `MetricPlacementRenderer` at `context_type=record`. (Not Focus Panel migration — just the header metric zone.) |

---

## Files changed across both sprints (6 total)

| File | Sprint | Nature |
|------|--------|--------|
| `web/components/admin/metrics/MetricCardShell.tsx` | 5 | `min-h-[80px]` on compact sizeClass |
| `web/components/admin/metrics/MetricSparkline.tsx` | 5 | Compact SVG height 24→16; placeholder h-6→h-4 |
| `web/components/admin/workspace/layout/WorkspaceOperationalPulseStrip.tsx` | 5 | `layout="row"` on both MetricPlacementRenderer zones |
| `web/app/adminV2/components/alloyOsRuntime.css` | 6 | Canvas background on `.adminv2-os-context__metric-tiles` |
| `web/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata.ts` | 6 | `ensureAllOperationalViewsInSections` (+37 lines) |
| `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` | 6 | Wire `ensureAllOperationalViewsInSections` (+3 lines) |

---

## Recommended next phase

**Premium tile treatment.** The header surfaces are now functionally complete and consistent. The immediate quality gap is the tile visual language — the mockups in `docs/sprints/06_2026/analytics-operational-intelligence-platform/mockups/` show the intended Alloy-specific tile design (density-aware type, refined accent rail, subtle surface treatment). Delivering this creates the "header surfaces are the best part of Alloy" impression before expanding the Surface Builder to more surface types.

**Success criteria for next phase:**
- Workspace Header and Work Unit Header tiles match the `05-workspace-header-metrics.html` and `06-work-unit-header-metrics.html` mockups exactly
- Builder preview tiles match runtime tiles
- No regression in tile size contract (160×80px minimum) or density detection

---

*End of Surface Builder / Header Surfaces phase closeout.*
