# Operational Surface Realization — Phase 0 Discovery Note

**Sprint:** operational-surface-realization  
**Slot / worktree:** 4 / `wt4-operational-surface-realization`  
**Base:** `origin/staging` `@ 436cc51b9`  
**Date:** 2026-07-24  
**Status:** Discovery complete — implementation may proceed

Screenshots at 1440 / 1728 / 1920 are deferred to Phase 4 authenticated browser QA (runtime attach). Code inventory below is authoritative for implementation design.

---

## A. Work Unit Focus state

### Hierarchy (top → bottom)

1. `WorkUnitHeader` + `WorkViewPillStrip` (`shrink-0 space-y-1`)
2. `FocusPanelSurface` hosting `QueueRegion` + inline Focus Panel
3. Inside Focus Panel: selected-record header → Current Work / mode body
4. `RightRailSurface` (peer column)

### Selection already on the shell

| Signal | Available? | Consumed by header? |
|--------|------------|---------------------|
| `model.selectedRecordId` | Yes (`workUnitSurfaceModelFromSnapshot`) | **No** |
| `OperationalSubjectContext.subjectId` | Yes | No (Focus Panel only) |
| `data-record-of-attention` / `data-focus-panel-open` | Yes | No |

**Gap:** Header densifies only via ambient `useAdaptiveMetricDensity()` (width), not selection. Doctrine CSS keeps page header full-width when the Focus Panel docks.

### Components / tokens

| Band | Owner | Notes |
|------|-------|-------|
| Identity + KPIs | `WorkUnitHeader` → `WorkspaceHeader` `variant="work-unit"` | Title `text-[28px]`, chip `h-11`, KPI via `WS_KPI_CARD_CHROME` |
| Work Views | `WorkViewPillStrip` | In-page LENS attention; no router push |
| Queue | `QueueRegion` / `CondensedQueueRow` | Widths in `adminV2.css` (24rem / 18rem / 16rem) |
| Focus Panel header | `FocusPanelCompactHeader` / `OpportunityFocusPanelHeader` | Sticky `minHeight: 5.25rem` |

### Implementation intent (Phase 1)

- Pass selection-driven `density="browse" | "focus"` into shared `WorkUnitHeader` / `WorkspaceHeader` (orthogonal to ambient metric density).
- Focus: compact operational context bar (smaller identity + title; KPI strip collapsed; Actions retained).
- Keep all Work View pills visible; do not touch Focus Panel payload / reveal / VM.

---

## B. Operational workspaces

### Shared shell (preserve)

`WorkspaceShell` → inset stone field (`WS_SHELL_INSET` / `WS_FIELD_CANVAS`) → `WorkspaceHeader` / `WorkspaceModeNav` → module body.

### Content constraints (module-owned today)

| Module | Max width | Action row | Activity | Lower zones |
|--------|-----------|------------|----------|-------------|
| Processing | `max-w-6xl` (~1152) | `md:grid-cols-3` via `ProcessingLandingActionCard` | `lg:grid-cols-4` | `lg:grid-cols-3` |
| Communications | `max-w-6xl` | same | same | same |
| Work Items | `max-w-6xl` `space-y-7` | same | none | similar |
| Scheduling | `max-w-[1180px]` | custom 4× `LaunchCard` | `WorkspaceOperationalHealth` in body | `lg:grid-cols-[1.25fr_1fr]` |

**Gap:** Overview content still reads as narrow-canvas. No shared overview width / grid primitives at 1440–1920. Scheduling diverges from Processing reference grammar.

### Implementation intent (Phase 2)

- Add shared overview layout primitives under `web/components/workspace/` (export via `doctrine.ts`).
- Wider content max-width with responsive collapse; 3-card action row; 4-col activity; 2/3+1/3 information zones.
- Apply to Processing, Communications, Scheduling without new shells or module themes.
- Keep Overview metrics below action cards; preserve section-scoped health on operational tabs.

---

## C. Queue child-field failure

### End-to-end chain

Settings Surfaces → `entity_layouts` published → `resolveQueueRowLayoutServer` → `mapQueueRowSurfaceToCompactConfig` → D1 `resolveRowVariantSlots` / queue `rowConfig` → `CondensedQueueRow` → `resolveCompactSlotDisplay` → children registry / `related_subjects_summary`.

Compact-effective children keys: `children`, legacy `children.*`, `child.name`, `inquiry_child.program`, `inquiry_child.schedule_type`.

### Evidenced root causes (ranked)

1. **Broken D1 variant match input (high)** — Production `resolveRowVariantSlots` in `workUnitSurfaceModelFromSnapshot.ts` reads flat `stage_key` / `grain` / `row_grain` that `QueueRowContext` does not expose. Correct matcher is `queueRowVariantMatchInputFromContext` (nested `drawer_open.active_subject.stage_key`, `row_subject.subject_type`). Preview projection also drops `drawer_open.active_subject`.
   - Symptom: Children configured only on a stage/grain **variant** never apply; Default-only configs still work if payload is present.
2. **Empty variant columns wipe Default if matching is fixed (high, latent)** — Starter Enrollment variants ship `columns: []`. `resolveQueueRowCompactSlots` / D1 mapping replaces Default columns with the matched variant’s empty columns.
3. **Non-compact-effective publish (medium)** — Builder can offer fields marked “Not in row”; publish does not reject them → silent omission on `CondensedQueueRow`.
4. **Payload omission (medium, secondary)** — Empty `related_subjects_summary` → `children` resolves to null. Default `groupCount` without fieldKeys only shows `grouped_subjects` count labels, not family child names.
5. **Draft/cache** — Weaker: resolve is published-only; publish busts `qrl:` cache.

### Owning-layer fix (Phase 3)

| Layer | Change |
|-------|--------|
| Presentation runtime | `resolveRowVariantSlots` → `queueRowVariantMatchInputFromContext`; inherit Default columns when variant `columns` empty |
| Publish validation | Reject non-`COMPACT_ROW_EFFECTIVE` keys; warn/block empty matching variants; operator-safe messages |
| Runtime diagnostic | Explicit signal for older invalid saved configs (no silent omit) |
| Queue payload | Only if live Enrollment still blanks after match/inherit fix |

**Not:** client N+1 record fetches; Enrollment-specific hardcoded renderer; child-grain reinterpretation of family rows.

---

## Risks / notes

- Toolkit `manifest-io.mjs` CLI guard breaks under `/Users/Kelly/bin/alloy-dev` symlink (realpath mismatch) — readers may show undeclared posture even when manifest JSON is correct. Manifest on disk for this sprint is valid.
- Runtime capacity over budget — prefer attach to existing shared runtime; do not provision dedicated Docker in this sprint.
- AdminV2 reveal / queue empty semantics are protected — Focus header change must not alter reveal gates.

## Go / no-go

**GO** for Phases 1–3 on the owners above. Browser evidence + live Enrollment surface verification required before PROMOTE.
