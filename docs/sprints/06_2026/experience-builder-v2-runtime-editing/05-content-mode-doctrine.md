# Content Mode Doctrine

**Path:** `docs/sprints/06_2026/experience-builder-v2-runtime-editing/05-content-mode-doctrine.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 5 — Content Mode doctrine

---

## 1. Purpose

Content Mode is for editing **what is inside** the surface: the data each slot shows, the renderer that draws it, labels, formatting, conditions, and visibility. The mental model is *"configure what's in it."*

It answers intents like *"show the balance as currency,"* *"rename this label,"* *"only show this card during the Tour stage,"* *"add the phone field here."*

## 2. What Content Mode operates on

| Primitive | Content verbs |
|---|---|
| **Slot** | Bind/change Data Source, choose Renderer, set label, set formatting options, add/remove slot at depth |
| **Renderer** | Swap renderer (from the closed catalog), configure its semantic options |
| **Card** | Edit title, primary insight, default expanded/collapsed, primary/secondary actions, content template depth |
| **Section (in-card)** | Reorder, rename, toggle visibility |
| **Behavior/Condition** | Visibility conditions, required (where field-owned), read-only/editable |

Content Mode does **not** add/move/resize cards or zones — that is Structure Mode.

## 3. How the surface looks in Content Mode

The surface looks **published** — full, real content. Editing affordances are revealed **on hover and selection**, anchored to the element:

| Element | Affordance |
|---|---|
| **Card** | Hover → thin pine edit outline + a small edit chip (title, actions). |
| **Slot / value** | Hover → the rendered value gains an edit outline; click → an **inline editor** opens anchored to it. |
| **Label** | Click-to-edit text in place. |
| **Card title / insight** | Click-to-edit text in place. |
| **Action** | Click → choose canonical action + label (placement only; definition lives in Actions hub). |

Selection is **transient and contextual** — clicking an element reveals its editor anchored beside/below it; clicking empty space dismisses it. There is no permanent inspector column.

## 4. Inline editing — the core gesture

Configuration happens **where the content lives**. The canonical flow:

```
Hover a card        →  card outline + edit chip
Click a value/slot  →  inline editor opens anchored to that slot
   ├── Data Source   (field ref / resolver / metric / collection)
   ├── Renderer      (closed catalog, grouped by purpose)
   ├── Label         (text)
   ├── Formatting    (renderer's semantic options)
   └── Behavior      (visibility condition, read-only)
Click away          →  editor closes; change is live in working copy
```

The inline editor is a compact popover/sheet **anchored to the selected element** — not a far-away panel. It shows only the controls relevant to that element. For dense cards, an optional contextual side sheet may slide in, but it is **anchored to and follows the selection**, and dismisses on deselect.

## 5. Editing a Renderer

| Step | Behavior |
|---|---|
| 1 | Click a slot's rendered value → inline editor shows the current Renderer (e.g., `Currency`). |
| 2 | "Change renderer" opens the **closed Renderer catalog**, grouped (Text & identity · Status & state · Numbers & money · Time · Collections · Analytics · Documents · Actions · AI). |
| 3 | Selecting a renderer **re-renders the slot in place** instantly — you see the real result. |
| 4 | Renderer **semantic options** (e.g., Date: "show time?" / Currency: "show cents?") appear as simple toggles — never font size or hex color. |

Renderers are platform-owned and typed; the operator selects, never authors. Choosing an incompatible renderer for a data source is prevented (e.g., Chart on a single scalar offers Gauge/KPI instead).

## 6. Editing a Field / Data Source

| Step | Behavior |
|---|---|
| 1 | In a slot's inline editor, "Data Source" shows the bound source (e.g., `opportunity.status_key`). |
| 2 | Changing it opens the **Field Catalog** picker (org `field_definitions`, grouped by entity), plus resolver and metric refs where relevant. |
| 3 | Fields are **data**, not presentation — picking a field does not change the renderer unless the current renderer is incompatible (then a compatible default is suggested). |
| 4 | Read-only vs editable and required are governed by the Field Catalog and BP rules; Content Mode surfaces them but does not invent new field truth or PATCH routes. |

## 7. Conditions and visibility

- Any card, slot, or section may carry a **visibility condition** edited inline ("Show when…").
- The condition grammar is the shared predicate model (field/stage/mission/viewpoint operators) — edited via simple typed controls, not raw expressions.
- Conditions are **additive** to BP stage/mission rules; Content Mode shows when a card's visibility is partly BP-owned (read-only indicator) vs surface-owned (editable).

## 8. Content templates and depth

- Slots exist at **depths**: compact, expanded, drill, workspace (System 5C). Content Mode lets the operator configure each depth's slot set, selecting from the Card Type's allowed slots.
- Adding a field that isn't in the compact template does **not** auto-appear in compact — it is added at the chosen depth (honors 5C: "fields enter cards only through a content template").
- Expansion behavior (which of the five 5B models a card uses) is selectable where the Card Type permits, shown as a simple choice with a live demonstration on the working copy.

## 9. Analytics parity (the cross-cutting law)

Analytics editing is **identical** to every other surface. There is no analytics-specific builder.

| Concern | Focus Panel | Dashboard / Analytics |
|---|---|---|
| Edit Mode chrome | Same Edit Bar | Same Edit Bar |
| Structure / Content modes | Same | Same |
| Card insertion | Same `+` between cards | Same `+` between metric cards |
| Inline slot editing | Same | Same |
| **What differs** | Card Types (Readiness, Family…) and display renderers | Card Type = **Metric**; renderers = KPI Card, Trend, Sparkline, Chart, Gauge, Scorecard, Table |
| **Data source** | Field / resolver refs | **Metric refs** (defined in Operational Intelligence — not edited here; only placement + visualization) |

A Metric card's inline editor shows the metric ref (read-only, with a link to OI to edit its math) and lets the operator choose the visualization renderer and placement — exactly the same gesture as choosing Currency for a balance.

## 10. What Content Mode must not do

- Must not expose per-element font size, color, or pixel controls — **semantic roles and renderer options only** (typography tiers are platform-owned).
- Must not edit structure (add/move/resize cards or zones).
- Must not author metric math, field definitions, action definitions, or workflows — it **references** them.
- Must not require leaving the surface to configure anything that appears on the surface.

## 11. Differentiation from page builders

| Page builder | Alloy Content Mode |
|---|---|
| Edit raw text/HTML/styles per element | Bind typed Data Sources to typed Renderers |
| Arbitrary fonts/colors per element | Semantic renderer options; platform typography tiers |
| Content is freeform | Content is record truth surfaced through cards that answer business questions |
| WYSIWYG that drifts from production | The production renderer *is* the editor |

## 12. Cross-references

| Concern | Doc |
|---|---|
| Structure Mode (the other half) | [`04-structure-mode-doctrine.md`](./04-structure-mode-doctrine.md) |
| Interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| Walkthroughs (edit renderer, edit field) | [`06-interaction-walkthroughs.md`](./06-interaction-walkthroughs.md) |
| Renderers / Slots / Data Sources | `docs/platform/operator/presentation-runtime-doctrine.md` §4–5 |
| Content templates (5C) | `docs/platform/operator/card-content-template-field-inclusion-doctrine.md` |
