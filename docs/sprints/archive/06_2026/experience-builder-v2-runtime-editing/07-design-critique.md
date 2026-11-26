# Design Critique — Existing Experience Builder Mockups

**Path:** `docs/sprints/archive/06_2026/experience-builder-v2-runtime-editing/07-design-critique.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 8 — Design critique

This critiques the six mockups from the Presentation Runtime Architecture sprint (`../presentation-runtime-architecture/mockups/`) against the "editable runtime" thesis. For each: **keep · change · remove**, plus where Alloy must differentiate from traditional page builders.

---

## Summary verdict

The prior mockups are **architecturally correct but experientially wrong**. They prove the primitives compose, but they present authoring as a **traditional admin application** — a settings queue, an architecture tree, a side inspector, and a preview pane. That is exactly the pattern this sprint replaces. The primitives survive; the *authoring frame* does not.

| Mockup | Keep | Change | Remove |
|---|---|---|---|
| 01 Design Surfaces Landing | The category model | Reframe as **Browse & Manage** (secondary), add Domain level | "This is where editing starts" framing |
| 02 Configuration Queue + Focus Panel | The Focus Panel preview is real runtime | Make the runtime **full-bleed**; demote the queue | Persistent Architecture panel; "Preview" as separate |
| 03 Zone Editing + Card Composition | Slot → Renderer concept | Move slot/renderer editing **inline, anchored to the card** | Persistent right-rail inspector as primary |
| 04 Queue Row Editor | 52px row preview | Edit the row **inside the actual queue** | Separate zone/slot panels beside the row |
| 05 Analytics Dashboard Editor | Strong direction; near-correct | Unify chrome with Edit Bar; same modes | Any analytics-specific editing affordances |
| 06 Mobile Adaptation | Responsive rules + Viewpoint inheritance | Show mobile **in Edit Mode**, same model | — |

---

## 01 — Design Surfaces Landing

**What it showed:** A hub of category tiles (Queue Row, Focus Panel, Dashboard, …) with surface counts, framed as the entry point to authoring.

- **Keep:** The category catalog and the "everything is a Design Surface" framing. It scales conceptually.
- **Change:** Reframe it as **Browse & Manage** (secondary entry, per `02-information-architecture.md`). Add the missing **Domain** level (Enrollment, Billing, …) so it scales past a flat tile grid. Add state badges (Working Copy / Published / Default).
- **Remove:** The implication that authoring *begins* here. Most authoring begins in context, on the live surface.
- **Differentiation:** A page builder opens to a canvas list. Alloy opens to the **product**; this landing is a router for surfaces you can't reach in context, not the front door to editing.

## 02 — Configuration Queue + Focus Panel

**What it showed:** The Configuration Mode shell (Context → Queue → List → Workspace → BOS) with an **Architecture panel** (zone/card tree) above a Focus Panel **preview**, plus Preview/Publish buttons.

- **Keep:** That the workspace renders the **real Focus Panel** with real cards — this is the seed of the right idea.
- **Change:** Make the runtime **full-bleed** as the editing surface. Replace the queue+list+architecture scaffolding with **in-context Edit Mode** and the slim **Edit Bar**. The BOS rail stays (unchanged).
- **Remove:** (1) The **persistent Architecture panel** — structure becomes Structure Mode, spatial, on the surface itself. (2) The separate **Preview** concept — the runtime *is* the preview; replace Preview/Publish with the runtime-state model (Viewing · Working Copy · Published · History · Publish).
- **Differentiation:** Page builders show a tree + canvas + inspector triptych. Alloy shows **the surface**, and reveals affordances on it. The tree recedes; the product leads.

## 03 — Zone Editing + Card Composition

**What it showed:** A zone canvas with a selected card, and a **right-rail inspector** for Archetype/density/span, a slot list, a renderer picker, and expansion radios.

- **Keep:** The **Slot → Renderer** binding concept and the closed renderer catalog — these are correct and load-bearing.
- **Change:** Relocate all of it **inline**. Card composition (archetype/density/span) belongs to **Structure Mode** affordances on the card; slot/renderer/label/condition editing belongs to **Content Mode** inline editors anchored to the slot. The expansion-model choice stays but appears in the card's contextual editor with a live demonstration.
- **Remove:** The **persistent right-rail inspector as the primary editing surface**. A contextual sheet may slide in, but it must be anchored to the selection and dismiss on deselect — never a standing column.
- **Differentiation:** Inspector-panel editing is the hallmark of metadata tools. Alloy edits **where the content is**, so the operator never maps "inspector field X" to "thing on screen Y."

## 04 — Queue Row Editor

**What it showed:** A 52px row preview at top, with zone panels (header.primary, body) and a slot inspector beside it.

- **Keep:** The faithful **52px row preview** and the zone grammar (header.primary / secondary / context / body / actions).
- **Change:** Edit the row **inside the actual queue**, in Edit Mode, with the same inline gestures as a Focus Panel card. Selecting a row zone reveals its slots inline; selecting a slot opens the same renderer/data-source editor used everywhere.
- **Remove:** The dedicated editor layout with side panels — it is a different shape from Focus Panel editing, which breaks the "one model, every surface" law.
- **Differentiation:** Most tools have a bespoke "list column configurator." Alloy uses the **same Edit Mode** for a row as for a card — the only difference is the zone topology and the 52px constraint.

## 05 — Analytics Dashboard Editor

**What it showed:** A dashboard with a KPI strip, metric cards, a metric-ref data source (read-only, defined in OI), and the closed renderer catalog. Already close to correct.

- **Keep:** Almost all of it — the metric-as-Data-Source model, the shared renderer catalog, the "no separate analytics config" message.
- **Change:** Wrap it in the **same Edit Bar** and the **same Structure/Content modes**; insert metric cards via the **same `+`-between-cards** gesture. Remove any dashboard-specific chrome so it is provably identical to Focus Panel editing.
- **Remove:** Nothing structural; just any affordance that exists only for analytics.
- **Differentiation:** BI tools have a dashboard builder *and* an app builder. Alloy has **one** editing experience; a dashboard is just a surface whose Card Types are Metric and whose Renderers are charts.

## 06 — Mobile Adaptation

**What it showed:** A mobile Director Snapshot with responsive collapse rules and Viewpoint inheritance.

- **Keep:** The responsive-collapse rules (platform-owned) and the Viewpoint inheritance illustration — both correct.
- **Change:** Show the mobile surface **in Edit Mode** using the same model (the Edit Bar adapts to a compact form; Structure/Content modes still apply; the responsive lens is selected via the Scope/lens control).
- **Remove:** Nothing.
- **Differentiation:** Page builders make you rebuild for mobile. Alloy **previews the responsive lens** of the same composition; mobile is a view of one surface, not a second surface to maintain.

---

## Cross-cutting changes (apply to all)

1. **Replace the builder shell with the Edit Bar.** One slim bar on the surface; no queue/tree/inspector triptych as the editing frame.
2. **Delete "Preview."** Adopt Viewing · Working Copy · Published · History.
3. **Make the architecture recede.** Structure Mode is the spatial structure view; no standing tree.
4. **Anchor all configuration to content.** Inline editors that appear and dismiss with selection.
5. **Insert between cards.** The `+`-line, not a side panel "Add card."
6. **One model across categories.** Focus Panel, Queue Row, Dashboard, Document, POS, Mobile all use the identical Edit Bar + Structure/Content modes.
7. **Surface inheritance as a Scope chip + markers**, not new screens.

## Where Alloy differentiates from traditional page builders (the durable stance)

| Dimension | Page builders | Alloy |
|---|---|---|
| Canvas | An approximation of the result | The **actual runtime** |
| Unit of editing | Divs / components / styles | **Cards** that answer business questions, **Slots** binding typed **Renderers** to **record truth** |
| Visual control | Arbitrary fonts/colors/positions | **Semantic** renderer options; platform typography tiers; grid + zones |
| Preview | A separate mode that can drift | **No preview** — published == editing, one renderer |
| Structure vs content | Conflated | **Two intentional modes** |
| Data | Static or loosely bound | **Record truth / metrics / resolvers**, never invented in the builder |
| Result fidelity | "Should look like this" | "**Looks identical** when published" |

This is the line Alloy must hold: an **editable runtime of meaning**, not a freeform page builder of pixels.

## Cross-references

| Concern | Doc |
|---|---|
| Interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| New mockups expressing these changes | [`mockups/README.md`](./mockups/README.md) |
| Prior mockups under critique | `../presentation-runtime-architecture/mockups/` |
