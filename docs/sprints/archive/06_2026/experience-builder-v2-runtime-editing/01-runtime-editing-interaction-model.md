# Runtime Editing — Interaction Model

**Path:** `docs/sprints/archive/06_2026/experience-builder-v2-runtime-editing/01-runtime-editing-interaction-model.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 1 — Redesigned Experience Builder interaction model

---

## 1. The thesis, stated precisely

The Experience Builder is not a place you go. It is a **state the runtime enters**.

```
Any runtime surface (Viewing)
   └── click Edit  →  same surface (Editing)
                         ├── Structure Mode  (edit the skeleton)
                         └── Content Mode    (edit the content)
                              └── Publish  →  same surface (Viewing, updated)
```

There is one surface throughout. It never reloads into a different application. Editing **adds a layer of affordances**; it never substitutes a different rendering engine, different spacing, or a different visual language. This is what makes "if it looks correct while editing, it looks identical when published" literally true: there is only one renderer.

## 2. The single editing chrome

When Edit Mode is active, exactly one piece of new chrome appears — the **Edit Bar** — docked to the top of the surface being edited (not the global app). Everything else on screen is the real runtime.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◀ Done    │  ● Editing  ·  Enrollment Summary  │  Structure │ Content  │  ⤺ ⤻  │  Working Copy ·  History  │  Publish │
└──────────────────────────────────────────────────────────────────────────┘
│                                                                            │
│           THE ACTUAL RUNTIME SURFACE (unchanged rendering)                 │
│                                                                            │
```

| Edit Bar element | Role |
|---|---|
| **Done / ◀** | Exit Edit Mode → return to Viewing (working copy stays saved) |
| **● Editing · {surface name}** | Status + identity of what is being edited; the dot signals live edit state |
| **Structure ⇄ Content** | The mode toggle (see §4) |
| **Undo / Redo (⤺ ⤻)** | Per-session edit history |
| **Working Copy** | Current runtime-state indicator (Viewing / Working Copy / Published / History) — click to switch |
| **History** | Version timeline + restore |
| **Publish** | Promote working copy → published |
| **Scope chip** (right) | Which inheritance scope is being edited (Org / Location / Viewpoint) — see §6 |

The Edit Bar is the **only** persistent editing UI. There is no permanent left architecture tree, no permanent right inspector. Inspectors are **contextual and transient** — they appear anchored to what you selected and disappear when you deselect.

## 3. Three runtime states (Preview is gone)

"Preview" is removed as a concept. The runtime is always real; you simply choose **which version** and **whether affordances show**.

| State | What you see | Affordances |
|---|---|---|
| **Viewing** | The published surface, exactly as operators see it | None |
| **Working Copy** | Your unpublished edits, rendered by the real runtime | Edit affordances on (Structure or Content) |
| **Published** | The currently live version (read-only reference while editing) | None — comparison only |
| **History** | A prior published version | None — restore-only |

Switching among these is instant and in place — the surface does not navigate. "Preview as Viewpoint" or "preview against a different record" become **lenses on the Working Copy** (see §6 and `03-edit-mode-doctrine.md`), not a separate Preview screen.

## 4. Two editing modes

Editing splits into two intentional mental models. The mode toggle in the Edit Bar switches between them; the surface stays put.

| | **Structure Mode** | **Content Mode** |
|---|---|---|
| Mental model | *"Arrange the surface."* | *"Configure what's in it."* |
| Operates on | Zones, Cards (as blocks) | Slots, Renderers, Fields, Labels, Conditions |
| Cards render as | Structural blocks — title + archetype + size handles; body content dimmed to a calm placeholder rhythm | Fully rendered, real content; individual elements become editable on click |
| Primary verbs | Add, Move, Resize, Reorder, Delete, Group into Zones | Bind data source, Choose renderer, Edit label, Set condition, Toggle visibility |
| Insertion | Between cards (the "+" line) | Within a card (add slot / field at depth) |
| Visual cue | Surface gains a faint grid + drag handles + zone boundaries | Surface looks published; hovered elements gain a thin pine edit outline |

Full doctrine: [`04-structure-mode-doctrine.md`](./04-structure-mode-doctrine.md) and [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md).

> **Why two modes, not one?** Mixing "make this card wider" with "change this field's renderer" in a single mode forces every click to disambiguate intent and clutters the surface with both structural and content affordances at once. Separating them keeps each surface calm and each gesture unambiguous — and matches how operators actually think (first *where*, then *what*).

## 5. The architecture recedes (but still exists)

The hierarchy Surface → Zone → Card → Section → Slot → Renderer is real and unchanged. It is simply **not the primary editing surface**.

| Old (admin-style) | New (runtime-first) |
|---|---|
| Persistent Architecture Tree panel as the main navigator | No persistent tree. Structure Mode *is* the spatial view of the architecture |
| "Select Card #3 in Zone A" | Click the card you can see |
| Tree node → inspector column | Card → contextual edit affordances anchored to it |

An optional **Structure Outline** is available on demand (a transient overlay listing zones/cards for keyboard navigation and accessibility), but it is never the default surface. Editing is visual first; the outline is a secondary aid.

## 6. Inheritance is visible while editing

Because the runtime is inheritance-resolved (Platform → Industry → Org → Location → Viewpoint → Operator), Edit Mode must answer *"what am I actually changing?"* at all times.

- The Edit Bar carries a **Scope chip**: `Editing: Organization` (default), switchable to `Location: North Campus` or `Viewpoint: Director`.
- Editing at a child scope creates an **override**, not a full copy. Overridden primitives show a small ✎ marker; inherited primitives show ⓘ.
- A primitive may be **Reset to inherited** in place.
- The Scope chip doubles as the "preview as audience/site" control — selecting `Viewpoint: Teacher` re-renders the working copy through that Viewpoint's overrides without leaving Edit Mode.

This is the entirety of how the future inheritance cascade surfaces in V1: as a scope indicator and override markers. No new builder screens.

## 7. One model, every surface category

The interaction model is **identical** across categories. Only the rendered content and the available Card Types / Renderers differ.

| Category | What "the runtime" is in Edit Mode | What changes |
|---|---|---|
| Focus Panel | The actual Focus Panel with mode tabs (Summary/Work/Activity) | Cards, slots, renderers |
| Queue Row | The actual 52px row inside the actual queue | Row zones, slots, renderers |
| Dashboard / Analytics | The actual dashboard | Metric Cards, chart Renderers |
| Document | The actual document/print layout | Blocks, field regions, renderers |
| Communication | The actual template | Body blocks, variables, renderers |
| POS | The actual checkout/processing screen | Line cards, totals, renderers |
| Mobile | The actual mobile surface (responsive) | Same cards, responsive collapse |

Analytics has **no separate builder**. A dashboard is edited with the same Edit Bar, the same Structure/Content modes, the same card insertion. See [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md) §Analytics parity.

## 8. Entry points (where "Edit" lives)

| Entry | Path | Who | Primary? |
|---|---|---|---|
| **In-context** | Admin viewing any runtime surface → "Edit this surface" affordance | Admins with `experience.configure` | ✅ Primary |
| **From assignment** | Business Process / Work View → "Edit in Design Surfaces" on an assigned surface | Admins | Secondary |
| **From browse** | `/settings/design-surfaces` → category → surface → opens the surface in Edit Mode | Admins | Secondary (for unpublished / non-contextual surfaces like new dashboards) |

In all three, the destination is the **same**: the live surface, in Edit Mode. The browse surface (prior sprint's gallery/queue) is reframed as a way to *find* surfaces that you cannot reach in context yet — it is not where editing happens.

## 9. What never changes between Viewing and Editing

This list is the contract that makes the thesis true. Across the Viewing↔Editing boundary, these are byte-for-byte identical:

- The renderer stack and component tree
- Spacing, typography tiers, color tokens, card rhythm
- Card anatomy, archetype behavior, density, span
- Zone topology and responsive collapse rules
- Reveal/performance behavior (no editing-only skeletons, no layout shift on mode toggle)

The **only** additions in Editing are: the Edit Bar, hover/selection outlines, drag handles + insertion lines (Structure), inline editors (Content), and override/inheritance markers. Removing those returns you to a pixel-identical published surface.

## 10. Cross-references

| Concern | Doc |
|---|---|
| Edit Mode lifecycle (enter/exit/publish/version) | [`03-edit-mode-doctrine.md`](./03-edit-mode-doctrine.md) |
| Structure Mode | [`04-structure-mode-doctrine.md`](./04-structure-mode-doctrine.md) |
| Content Mode | [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md) |
| IA + entry points + scale | [`02-information-architecture.md`](./02-information-architecture.md) |
| Walkthroughs | [`06-interaction-walkthroughs.md`](./06-interaction-walkthroughs.md) |
| Critique of prior mockups | [`07-design-critique.md`](./07-design-critique.md) |
| Primitive definitions | `docs/platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` |
| Visual language | `docs/platform/operator/alloy-visual-language.md` |
