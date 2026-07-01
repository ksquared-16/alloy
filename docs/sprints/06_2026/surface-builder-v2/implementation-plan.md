# Surface Builder V2 — Implementation Plan (UX only)

**Scope:** UI only. No backend, no persistence, no API, no new renderers, no new calculations. Everything needed already exists — the platform `SurfaceBuilder`, the engine (`surfaceBuilderModel`), the OI Surface Definition, the real `metric_placements` adapter, and the runtime card chrome (`MetricCardShell`). This plan changes only how it *feels*.

**What the engine already gives us (no change):** `surfaceBuilderReducer` already supports selection, dirty tracking, `insertCard` / `removeCard` / `moveCard` / `updateCard`, and section ops. The inspector already dispatches `updateCard`, and `SurfaceCanvas` already re-renders via `runtimeRenderer.renderCard`. So "inspector edits → canvas reacts" is structurally present today; this work makes it *legible and instant across every field*, and dresses the surrounding chrome.

Files in play (all client/presentational):
- `web/components/platform/surfaceBuilder/SurfaceBuilder.tsx`
- `web/components/platform/surfaceBuilder/SurfaceTree.tsx` *(split out of SurfaceBuilder.tsx)*
- `web/components/platform/surfaceBuilder/SurfaceCanvas.tsx` *(split out)*
- `web/components/platform/surfaceBuilder/SurfaceInspector.tsx` *(split out)*
- `web/components/platform/surfaceBuilder/AddCardPopover.tsx` *(new, presentational)*
- `web/lib/platform/surfaceBuilder/definitions/operationalIntelligenceSurfaceDefinition.tsx` *(runtimeRenderer + inspectorSchema only)*

---

## Problem → change

### P1 · The canvas is the true preview
- `SurfaceCanvas` already calls `runtimeRenderer.renderCard(instance, ctx)`. Make the OI `runtimeRenderer` **honor every config field** so edits show instantly: `config.rendererKey` (KPI/Trend/Gauge/…), `config.title`, `config.thresholds` (tone), `config.comparison`, and the content question. Render through the real `MetricCardShell` per renderer.
- Because the inspector dispatches `updateCard` and React re-renders, this is automatically instant — no new state. **No backend.**

### P2 · The left panel owns Sections, not loose cards
- In `SurfaceTree`: render **sections** as the primary structure (collapsible, with card count), each with its **own Add card** row. Remove the global "Components" palette at the bottom (it implied cards exist outside sections).
- Section header = the editing context; clicking it sets the active section (new bit of *local* UI state in `SurfaceBuilder`, not the doc).

### P3 · Add Card is one inline flow
- New `AddCardPopover` (presentational), anchored to the section's Add card. Three inline steps driven entirely by the definition: **type** (`definition.cardTypes`), **content** (`definition.contentSource.list()`, searchable, grouped by `group`, `availability` badge), **configure** (a live mini-card + a few fields from `inspectorSchema`).
- On confirm → dispatch the existing `insertCard` with `{ cardTypeKey, contentId, config }`, then `select` the new card. **No new engine, no API.**

### P4 · Publish has confidence
- Add a small lifecycle state in `SurfaceBuilder` around the **existing** `persistence.persist`: `idle → saving → published → runtimeUpdated`. Drive the pill (Draft N / Saving… / Published ✓ / Runtime updated) and a success toast with **Open Runtime** (`definition.liveHref`).
- Uses the adapter that already exists (throws on failure → show an error state). **No backend.**

### P5 · Editing vs Preview vs Runtime is explicit
- Add a **mode segment** to the top bar (local UI state): **Editing** (full chrome), **Preview** (same canvas, chrome hidden via a `chrome={false}` prop on `SurfaceCanvas`), **Runtime** (read-only; re-`load()`s the published doc through the existing adapter and renders without tools).
- The canvas banner names the mode. **Reuses existing `load()`; no new endpoint.**

### P6 · Inspector hierarchy
- Extend the OI `inspectorSchema` to five groups: **Card** (title, description, visibility) · **Content** (metric, question) · **Renderer** (chips) · **Behavior** (thresholds, comparison, drill, refresh) · **Placement**.
- **Rename the `promote` tab/field to "Placement."** Keep its targets (Operational Intelligence, Workspace Header, Work Unit Header, Executive Performance, Reports). Implementation still writes `metric_placements`; the label never says so.
- The generic `SurfaceInspector` already renders schema field kinds (`content`, `renderer`, `thresholds`, `select`, `toggle`, `promote`); add light polish (group headers, the live `segmini`/tone-band controls). **No backend.**

### P7 · Immediate selection feedback
- On select: solid ring + "Selected" tag on the canvas card, **scroll into view**, and co-highlight in the **tree** and **inspector** (all read the same `selectedInstanceId` the engine already tracks). Hover reveals the card's drag/duplicate/delete tools.

### P8 · Empty states teach
- In `SurfaceCanvas`, replace a bare "Add card" for an empty section with rich guidance: a one-line "what this section is for" + quick-pick chips (Metric / Chart / Narrative / Recommend / Action) that open the Add Card flow pre-seeded.

---

## Sequencing (3 small UI PRs)
1. **Structure & preview** — split `SurfaceTree`/`SurfaceCanvas`/`SurfaceInspector` out of `SurfaceBuilder`; sections-own-context tree (P2); make `runtimeRenderer` honor all config so the canvas is truly live (P1); selection feedback + empty states (P7, P8).
2. **Add Card flow** — `AddCardPopover` inline three-step (P3).
3. **Confidence & clarity** — publish lifecycle + toast + Open Runtime (P4); mode segment Editing/Preview/Runtime (P5); inspector five-group hierarchy + Promote→Placement (P6).

Each PR is presentational, independently mergeable, and touches no server code. Parity gate: the OI surface still loads/saves real placements unchanged — only the experience around it improves.

## Explicitly out of scope
New renderers · new calculations · new placement targets beyond those already supported · any change to `operationalIntelligenceSurfacePersistence`, the doc route, the resolver, or the runtime modal · Focus Panel migration (next, after this lands).
