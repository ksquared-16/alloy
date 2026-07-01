# SurfaceBuilder — platform extraction plan

**One builder for every configurable surface in Alloy.** The existing Focus Panel builder is not a Focus Panel feature; it is `SurfaceBuilder` v1. We generalize it into the platform, return Focus Panel to parity as the first consumer, then add Operational Intelligence as the second — no clone, no wrap, no subclass, no `if (surfaceType === …)`.

```
Current Focus Panel builder (staging)
        │  extract (no behaviour change)
        ▼
Platform SurfaceBuilder  ──receives──▶  SurfaceDefinition
        │                                  (no business meaning)
        ├── consumer 1 ▶ Focus Panel Surface Definition        (parity gate)
        ├── consumer 2 ▶ Operational Intelligence Surface Definition
        └── consumers 3…N ▶ Executive Performance · Enrollment Intelligence ·
                            Financial Performance · Workspace Header ·
                            Work Unit Header · Reports
```

---

## 1. The contract — what the builder receives (and nothing else)

```ts
// web/lib/platform/surfaceBuilder/surfaceDefinition.ts  (NEW, platform-owned)
export type SurfaceDefinition = {
  surfaceType: string;                       // opaque id; the builder never branches on it
  title: string;
  sections: "none" | "fixed" | "authorable"; // Focus Panel = none; OI = authorable
  availableCardTypes: CardTypeDef[];         // renderer-backed catalog (KPI, Trend, Table, …)
  availableContentSources: ContentSourceProvider; // lists pickable Content for the picker
  inspectorSchema: InspectorSchema;          // tabs + fields the Inspector renders
  runtimeRenderer: SurfaceRuntimeRenderer;   // renders the live canvas for this surface
  persistence: SurfacePersistenceAdapter;    // the ONLY surface-specific I/O
};

export type CardTypeDef = { key: string; label: string; icon: string; rendererKey: string };

export type ContentSourceProvider = {
  groups: () => ContentGroup[];              // grouped, label + question + availability
  resolveLabel: (contentId: string) => string;
};

export type InspectorSchema = {
  tabs: { key: string; label: string; fields: InspectorField[] }[];
};

export type SurfacePersistenceAdapter = {
  load: (scope) => Promise<SurfaceDoc>;      // current cards/sections for this surface
  insertCard: (at, card) => Promise<void>;
  moveCard: (id, toIndex) => Promise<void>;
  configureCard: (id, patch) => Promise<void>;
  setPlacement: (id, surfaces) => Promise<void>;  // "Promote to"
  publish: () => Promise<void>;
};

export type SurfaceRuntimeRenderer = (state: SurfaceDoc) => React.ReactNode;
```

`<SurfaceBuilder definition={def} scope={…} />` is the **only** builder component. All chrome — surface tree, component library, live canvas, inline "+ line" insertion, drag/reorder/resize, contextual Inspector, publish — lives here and is identical for every surface.

**Hard rule:** `SurfaceBuilder`, `SurfaceInspector`, and the canvas import nothing from `focusPanel/*`, `metrics/*`, or `analytics/*`. They depend only on `surfaceDefinition.ts`. Any surface-specific behaviour enters through the definition. Zero `if (surfaceType === "analytics")`.

---

## 2. Extraction mapping (current → platform)

| Current (Focus Panel) | Becomes (platform) | Notes |
|---|---|---|
| `components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx` | `components/platform/surfaceBuilder/SurfaceBuilder.tsx` | Toolbar + canvas + inline insertion + inspector mount → generic; FP-specific bits move to its definition. |
| `components/admin/focusPanel/FocusPanelCardInspector.tsx` | `components/platform/surfaceBuilder/SurfaceInspector.tsx` | Tab/field chrome generic; FP tabs/fields move to `inspectorSchema`. |
| `lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel.ts` | stays FP; feeds FP definition | Card config shape is per-surface (definition concern). |
| `lib/adminV2/runtime/focusPanel/{focusPanelSummaryLayoutService,usePublishedFocusPanelSummaryDoc}.ts` | `→ focusPanelSurfaceDefinition.persistence` | The `entity_layouts` adapter. |
| `lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface.ts` | `→ focusPanelSurfaceDefinition.runtimeRenderer` | FP canvas renderer. |
| — | `lib/platform/surfaceBuilder/surfaceDefinition.ts` (+ adapters) | NEW contract. |
| — | `lib/platform/surfaceBuilder/definitions/focusPanelSurfaceDefinition.ts` | Consumer 1. |
| — | `lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition.ts` | Consumer 2. |

After extraction, "FocusPanelBuilder" no longer exists as a concept — only `SurfaceBuilder` + `focusPanelSurfaceDefinition`.

---

## 3. Consumers, each as a Surface Definition

| Surface | sections | Content source | Persistence adapter | Canvas renderer |
|---|---|---|---|---|
| **Focus Panel** | none | entity fields/relations | `entity_layouts` | focus-panel renderer |
| **Operational Intelligence** | authorable | Operational Calculations registry | `metric_placements` | `MetricPlacementRenderer` |
| **Executive Performance** | authorable | Operational Calculations | `metric_placements` (surface_key) | `MetricPlacementRenderer` |
| **Enrollment Intelligence** | authorable | Operational Calculations | `metric_placements` | `MetricPlacementRenderer` |
| **Financial Performance** | authorable | Operational Calculations (financial) | `metric_placements` | `MetricPlacementRenderer` |
| **Workspace Header** | fixed | Operational Calculations | `metric_placements` (`workspace_header`) | header strip renderer |
| **Work Unit Header** | fixed | Operational Calculations | `metric_placements` (`work_unit_header`) | header strip renderer |
| **Reports** | authorable | Operational Calculations | `metric_placements` (`report`) | report renderer |

OI and the analytics surfaces share one persistence adapter (`metric_placements`, varying `surface`/`surface_key`) and one canvas renderer (`MetricPlacementRenderer`) — already shipped. They differ only in `surfaceType`/`surface_key`/content scope.

---

## 4. Sequence (coordinated, parity-gated)

The extraction lands **with the Focus Panel workstream** (it owns the code). Operational Intelligence never copies it.

- **R1 · Extract** `SurfaceBuilder` + `SurfaceInspector` + `surfaceDefinition.ts` from the FP builder. No behaviour change.
- **R2 · FP consumes** via `focusPanelSurfaceDefinition`. **Parity gate:** the full Focus Panel builder suite stays green (`focusPanelSummarySurfaceEditor.test.tsx`, `focusPanelEditMode.test.tsx`, `focusPanelCanvasFinalization.test`). Pixel + behaviour identical.
- **R3 · OI consumes** via `operationalIntelligenceSurfaceDefinition` (no new builder code).
- **R4 · Inspector schema** for OI: Card · Content · Renderer · Promote.
- **R5 · Remaining surfaces** = more definitions.
- **R6 · Replace `/settings/analytics`** → Platform → Operational Calculations.
- **R7 · Publish + `ANALYTICS_V2_SNAPSHOTS_UPDATED`** refresh.

R1–R2 ship only at Focus Panel parity. R3+ is additive.

---

## 5. Where this lands

R1–R3 belong on the **Focus Panel builder branch** (`focus-panel-qa-composition-v2`) — it owns the existing builder, and putting the extraction anywhere else re-creates the fork. This sprint's branch (`claude/analytics-surface-builder`) contributes the **Operational Intelligence Surface Definition** (consumer 2) on top of that extraction, plus the convergence/`/settings/analytics` retirement. To start R1, that branch must be on the remote.
</content>
