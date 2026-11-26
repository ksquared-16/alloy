---
owner: platform
status: frozen-conclusion
last_reviewed: 2026-07-28
---

# Focus Panel card placement — ownership

**Frozen conclusion (2026-07-28, Kelly-approved): there is no `CardPlacementProfile`, and the
card-owned placement capability layer remains intentionally empty.** No card property in this codebase has been shown
to be a placement default or capability. Do not create one speculatively — populate it only when the
proving experiment below produces evidence.

This document exists so the emptiness reads as a *decision with evidence*, not an oversight.

---

## 1. The layering

| Tier | Owns | Where |
|---|---|---|
| **Card-owned placement capability layer** | *(remains intentionally empty — nothing qualifies yet)* | — |
| **SurfaceDefaultComposition** | key · reading order · tier · default visibility · `colStart/colSpan/rowStart/rowSpan` (Summary) or `span` emphasis (Work) | `composition/focusPanelSummaryDefaultComposition.ts` · `WORK_GRID` in `deriveOpportunityFocusPanelCards.ts` |
| **TenantPublishedComposition** | a persisted override of the surface default | `entity_layouts` (`layout_key = focus_panel_summary`), read via `usePublishedFocusPanelSummaryDoc` / seeded server-side by `workUnitProvisioningAnswer` |
| **Runtime** | resolves ONE composition source, then applies provider-availability + visibility filtering and responsive interpretation | `deriveFocusPanelSummaryCompositionInputs` → `planPublishedLayout` → `FocusPanelCardGrid` |

The runtime never consults a parallel, independently-authored fallback. Summary resolves from the
active `LayoutDoc` (published, else the code-owned default); Work renders `WORK_GRID` directly.

## 2. Why the capability tier is empty — the evidence

Each candidate was tested against one question: *does this property travel across surfaces, or is it
a convention of one surface?*

| Candidate | Verdict | Evidence |
|---|---|---|
| `defaultColSpan` | **Surface convention** | The Summary default gives *every* card `colSpan: 6` — zero per-card variance, so it carries no card information. Both composers default a newly-placed card to `Math.min(6, cols)`, never consulting the card. |
| `defaultRowSpan` (`DEFAULT_CARD_ROW_SPAN`) | **Surface value** | Every consumer is the Summary default grid or its composer — no Work consumer, no other surface. Its unit is the Summary composer's 76px authoring track. In the strategy Summary actually renders (`published-lanes`), `rowSpan` is not even emitted into the plan. |
| `defaultDensity` (grid/doc `density`) | **Render-inert** | Dropped by `legacyGridRows`; not passed by the published path; the composition path derives density from composition weight instead. Schema-required, authority-free. |
| `model.density` | **Already card-owned, different concern** | Authored per card type in `card({…})`; `buildCardModels` takes no `mode`, so it is mode-invariant. It is the density the renderer consumes (drill-down eligibility, body suppression, micro handling) and is tenant-overridable via `appearance.density`. It is not placement. |
| min / max width | **Unwired** | `CARD_COMPOSITION_PREFERENCES.minWidth/maxWidth`: zero runtime reads. `FOCUS_PANEL_GRID_MIN_CARD_PX` / `MIN_MICRO_PX`: declared, zero consumers. No per-card width constraint is enforced anywhere. |
| height behaviour | **Surface / tenant** | `height` (`compact\|standard\|tall` → `CELL_HEIGHT_PX`) is per-*area*, operator-authored. No card input. |
| `perspectiveExpansion` | **Authored, not enforced** | Read only by the Inspector's authoring select and config validation. No renderer consumes it; elevation is driven uniformly by `activeDepth`/`elevatedCellKey`. |

**The decisive structural fact:** the Summary and Work card sets are **disjoint** — their intersection
is empty. No card is placed by two surfaces, so cross-surface reuse of a placement property cannot
be proven *or* disproven from the current codebase. Card-ownership is currently unfalsifiable, and
a card-owned tier built now would encode a guess.

Do not infer ownership from the fact that a table is keyed by card. `SYSTEM5_CARD_FOOTPRINT` and
`DEFAULT_CARD_ROW_SPAN` are both card-keyed; both were consumed by exactly one surface.

## 3. The proving experiment — the Child surface

The queued Child second surface is the first opportunity to generate real evidence.

1. **Reuse at least one existing card** where product-appropriate (Household and Children are the
   natural candidates — they are truth-owning and not Enrollment-specific).
2. **Compare its requirements across Summary and Child**: authored area, density, height, minimum
   workable width. Record what each surface actually needed.
3. **Extract only what genuinely travels.** A property qualifies as a *card default* if both surfaces
   independently wanted the same value and neither had to override it. It qualifies as a *card
   capability* only if the runtime must **enforce** it (a surface that violates it renders broken) —
   which today nothing does, because no minimum is enforced anywhere.
4. If a property differs per surface, it is surface-owned. Leave it in the surface composition.

Until step 3 produces a positive result, the card-owned placement capability layer remains intentionally empty.

## 4. What was retired, and why it is safe

- **`SUMMARY_GRID`** — retired 2026-07-28. It never rendered: `OpportunityFocusPanelModeGrid` takes
  Summary's cells *and* cell resolution from `deriveFocusPanelSummaryCompositionInputs`, so the
  `defaultGrid` value was computed and discarded for Summary — even for an all-invalid doc. Its card
  set had also drifted (it still carried `readiness_kpi`/`documents`; it lacked
  `scheduling`/`billing_preview`/`milestones`). `resolveFocusPanelModeGrid("summary")` now derives
  from the same authority the runtime resolves.
- **`WORK_GRID_ACTIVE`** — collapsed into `WORK_GRID` 2026-07-28. It was byte-identical to
  `WORK_GRID_SPLIT` except `workflow_steps.density: "standard"`, a field the legacy grid path
  discards, so the `workflowActive` branch chose between two grids that rendered identically.
- **`CardPlacementProfile`** — never landed; the uncommitted module was discarded.

`SYSTEM5_CARD_FOOTPRINT`, `CARD_COMPOSITION_PREFERENCES`, `FOCUS_PANEL_GRID_MIN_CARD_PX` and the
`isFocusPanelLayoutRuntimeEnabled*` readers all survive with **zero consumers**. They were left in
place deliberately: unrendered is not the same as unreferenced, and removing them is a separate,
independently-verified cleanup.

## 5. Compatibility boundary

`span` and `density` are required on every encoded `LayoutDoc` section —
`readFocusPanelCardSectionMeta` returns `null` without them, which silently drops the card from
every consumer. Every persisted tenant doc already carries them. They are preserved verbatim at the
encode/schema boundary and carry **no placement authority**. Removing them is a schema migration
with a tenant-data backfill, not a placement change.
