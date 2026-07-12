# Presentation Runtime — Carry-Forward Handoff

**Status:** Canonical handoff (July 2026). Written at the close of the /surfaces Presentation Runtime **authoring** work (PRs #61, #63, #64, #68). This is the single document the **Runtime Adoption** sprint should start from.

**One line:** the composition model is frozen and the /surfaces builders now author real, persisted configuration for it — **Presentation Runtime's job is to CONSUME that configuration, not to redesign the model.**

---

## 1. Architectural decisions frozen (do not reopen)

1. **Canonical hierarchy** — `Surface → Canvas → Component → Evidence Group → Composition Item`, with **Conditions** and **Actions** as cross-cutting facets. A **Card is one Component type** (Queue Row, Header Tile, Dashboard Metric, Portal Section are others). One engine composes them all; only the renderer/content-source/persistence adapter (injected) varies.
2. **Composition Item kinds** (six, closed set): Field · Widget · Related List · Calculation · AI Summary · Action.
3. **Depth axis** (orthogonal, frozen from `universal-card-lifecycle.md`): Summary → Focus → Edit → **Expanded** → Workspace. **Expanded/Workspace = Open Surface** — they resolve to a nested Surface via `openSurfaceId`, not "more fields".
4. **Reserved words** — **Perspective** = the frozen *selection lens* (saved filter/sort/grouping), NOT a hierarchy layer. **Viewpoint** = audience (Director/Teacher/Parent/Corporate). Neither is renamed.
5. **Engine decision** — Engine B document model (Evidence Group → Composition Item → Conditions) is semantic truth; Engine A (`surfaceBuilder/`) injection seams (ContentSource / Renderer / Persistence) are the plumbing.
6. **Field availability is namespace-driven** — an Evidence Group declares `acceptedNamespaces`; availability = platform starter fields ∪ tenant custom fields whose namespace is accepted. `defaultFieldKeys` is a **seed**, never the availability boundary.
7. **No fake data** — builders offer only real platform fields + real tenant custom fields; groups with no compatible real field render an honest empty state.

Frozen model doctrine: [`experience-builder-v3-universal-surface-composition.md`](./experience-builder-v3-universal-surface-composition.md).

---

## 2. Platform capabilities now available (authored + persisted)

| Capability | Where authored | Persisted to |
|---|---|---|
| **Stacked condensed queue row** (Row 1/2/3 inside the 440px rail) | Queue Row Builder canvas + inspector Row selector | `QueueRecordColumnConfig.rowIndex` on the queue layout doc |
| **Grain + conditions** (family/child; waitlist as a `placement_status = waitlisted` condition) | Queue Row Builder + `queueRowGrainModel` | column/field `visibleWhen` |
| **Custom fields in queue builder** (by namespace) | Queue Row Builder (`useTenantFieldDefinitions` → adapter) | queue field config |
| **Nested surface editing** (any registered nested surface) | `/surfaces → Focus Panel` canvas **Configure expansion →** (or chip launcher) → `NestedSurfaceEditor` | `metadata.nestedSurfaces[surfaceId]` on the Focus Panel summary `entity_layouts` doc |
| **Add Field in nested surfaces** (predefined + tenant custom, badged) | `NestedSurfaceEditor` | same doc metadata |
| **Nested-ready breadcrumb** (`Surfaces / Focus Panel / Children Card / Children Surface`) | `SurfacesConfigurationPage` + `surfacesBreadcrumbModel` | — (UI state) |
| **Recursion engine** (`openSurfaceId`, cycle-safe) | `surfaceRegistry` + `universalSurfaceModel` | in-code registry |

Key modules:
- Model: `web/lib/platform/surfaceComposition/{universalSurfaceModel,surfaceRegistry}.ts`
- Queue: `web/lib/adminV2/settings/surfaces/{queueRowStackedModel,queueRowGrainModel}.ts`, `web/lib/layout/queueRecordLayoutV3.ts` (`rowIndex`)
- Fields: `web/lib/adminV2/settings/surfaces/compositionFieldAdapter.ts` (`acceptedNamespaces`, `availableFieldsForNamespaces`), `compositionEvidenceGroupRegistry.ts`
- Nested: `web/lib/adminV2/settings/surfaces/{nestedSurfaceEditorModel,nestedSurfaceConfigService}.ts`, `web/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader.ts`, `web/components/adminV2/settings/surfaces/NestedSurfaceEditor.tsx`
- Drill-in: `web/components/admin/focusPanel/FocusPanelGridCanvasBuilder.tsx`, `web/lib/platform/surfaceComposition/registerRuntimeSurfaces.ts` (`nestedLaunchersForSurface`)

---

## 3. Known runtime deferrals (what is authored but NOT yet consumed live)

These are the exact seams Runtime Adoption must wire. Each is labeled *presentation-runtime-ready* in the builder UI today.

1. **Stacked queue rows** — `column.rowIndex` persists; the live `/work-unit` `OperationalQueueRecordRow` still renders a single flat strip. Runtime must group columns by `rowIndex` into stacked sections inside the 440px rail.
2. **`visibleWhen` evaluation** — column-level and field-level conditions (incl. the waitlist condition) are authored + persisted; the queue row runtime does not yet evaluate them. Runtime must hide columns/fields when their condition fails.
3. **Nested surface render (overlay)** — Children + Billing Preview now consume `metadata.nestedSurfaces[surfaceId]` for configured fields (shared reader). Remaining work: resolve `openSurfaceId` in Expanded/Workspace overlay and render the full composed nested Surface (not just field-order projection). See [`universal-nested-surface-drill-in.md`](./universal-nested-surface-drill-in.md).
4. **Column label suppression** — the condensed row hardcodes `hideColumnLabel`; renamed labels persist but don't show in the condensed grain (by design).
5. **Queue surface-entry collapse** — the catalog still lists `pipeline-queue-row` + `waitlist-queue-row` as two entries. Model supports one grain-selectable surface; collapsing the catalog + API is deferred.

---

## 4. Presentation Runtime adoption plan

**Goal:** make the live operator runtime render exactly what the /surfaces builders publish — no parallel code paths.

**Principle:** Runtime is a **consumer**. It reads the published LayoutDoc / queue layout / nested-surface metadata and renders. It does not re-derive composition, invent fields, or fork the model.

### Sequencing (each a standalone PR)

1. **Queue `visibleWhen` evaluation** (smallest, highest value) — evaluate column + field conditions in `OperationalQueueRecordRow`. Unblocks waitlist-as-condition end-to-end. No schema change.
2. **Stacked queue rows** — read `column.rowIndex`, render stacked sections in the condensed rail. Additive; `rowIndex` absent = today's single strip.
3. **Nested surface render** — wire `CardInlineOverlay` (or the card's Expanded/Workspace path) to resolve `openSurfaceId` through `surfaceRegistry` and render the composed nested Surface from `metadata.nestedSurfaces[surfaceId]`. Start with **Children Surface** (engine already proven), then Financial Configuration.
4. **Custom-field render** — ensure the runtime can display tenant custom fields the builder now offers (safe value or clear placeholder; no fake data).
5. **Queue surface-entry collapse** — retire the second catalog/API entry into one grain-selectable `queue-row`.

### Definition of done per step
- Builder preview and live runtime render identically from the same published config.
- No fabricated data; conditions honored; nested surfaces recurse safely (cycle-guarded).

---

## 5. What Presentation Runtime SHOULD consume

- **Queue layout doc** (`doc.metadata.queue_record_layout`) — columns, `rowIndex`, `visibleWhen`, blocks, fields.
- **Focus Panel summary doc** (`entity_layouts`, `layout_key=focus_panel_summary`) — card composition **and** `metadata.nestedSurfaces[surfaceId]` for expansion surfaces.
- **Surface registry** (`surfaceRegistry` + `universalSurfaceModel`) — the `openSurfaceId` graph for recursion, cycle-safe resolution.
- **Evidence group registry** (`compositionEvidenceGroupRegistry`) — named groups + `acceptedNamespaces`.
- **Tenant field catalog** (`tenantLayoutFieldPickerCatalog`) — to resolve/display custom refKeys.

---

## 6. What Presentation Runtime should NOT redesign

- **Do not** introduce a new composition model, a new "Perspective" layer, or rename the depth axis. The hierarchy is frozen (§1).
- **Do not** build a parallel renderer or a second field catalog — consume the published config and the existing adapters.
- **Do not** fabricate data to fill a group (no fake payers/invoices/estimates/fields). Honor empty states.
- **Do not** treat Expanded as "more fields" — it is a nested Surface.
- **Do not** re-fork Pipeline vs Waitlist as two models — grain + condition is the model.
- **Do not** move business logic into the renderer — it renders truth, it does not compute obligations/charges/status.

---

## 7. Reference PRs

| PR | What |
|----|------|
| #61 | Universal Composition Model V2 (evidence groups, field adapter) |
| #63 | Surface Builder Parity Correction (canvas height/width, label rename, waitlist fields) |
| #64 | Experience Builder V3 — freeze doctrine + recursion proofs (Children + Financial Config) |
| #68 | /surfaces completion — stacked queue row, grain/conditions, custom-field wiring, **Focus Panel nested-surface editing** |

Sprint log: [`docs/sprints/archive/07_2026/surfaces-presentation-runtime-completion.md`](../../sprints/archive/07_2026/surfaces-presentation-runtime-completion.md).
