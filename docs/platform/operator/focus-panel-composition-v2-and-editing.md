# Focus Panel — Composition V2 + Card Definition V2 (canonical state)

**Status:** Canonical (June 2026). The merged state of the Focus Panel QA + Composition
V2 + Experience Builder V2 sprints. Supersedes the V1 "engine composes the surface" and
flat-field-list framings where they differ.

**Companions:** [`card-composition-system.md`](./card-composition-system.md) ·
[`operational-depth-doctrine.md`](./operational-depth-doctrine.md) ·
[`experience-builder-doctrine.md`](./experience-builder-doctrine.md) ·
[`operational-context-boundary.md`](./operational-context-boundary.md) ·
[`canonical-interaction-model.md`](./canonical-interaction-model.md).

**Code:**
`web/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout.ts` (layout model + intent sizing) ·
`…/composition/focusPanelPublishedLayoutOps.ts` (builder ops: rows / widths / Fill) ·
`web/components/admin/focusPanel/FocusPanelRowLayoutBuilder.tsx` (visual builder) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel.ts` (card definition: question / evidence groups / ownership / `configFields`) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps.ts` (evidence-group + ownership ops) ·
`web/components/admin/focusPanel/FocusPanelCardInspector.tsx` (Inspector V2) ·
`web/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx` (mount) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelMutation.ts` (edit adapter) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel.ts` (depth history).

---

## 1. Focus Panel — canonical surface

- **Core Four** universal cards: **Household** & **Children** (truth-owning) · **Readiness**
  & **Current Work** (diagnostic/action). Cards consume the **Operational Context** only.
- **Focus Cards:** truth cards elevate to a centered Focus Card (zoom-from-origin in,
  reverse-zoom on dismiss); the base canvas **never reflows** — depth is an overlay layer.
- **Inline Overlay:** diagnostic cards (Readiness, Current Work) reveal evidence as a
  **downward-only** card-anchored overlay that covers the card below without moving the
  canvas. It never opens upward; when space is tight the panel scrolls. It never becomes
  a Focus Card and never buries under the header.
- **Three operational depths** (Evidence / Focus / Workspace) per
  [`operational-depth-doctrine.md`](./operational-depth-doctrine.md). Edit is a capability
  of Focus, not a fourth depth.

---

## 2. Composition V2 — the published layout is the source of truth

> **Default composition = smart recommendation. Published composition = source of truth.**

- A **published layout** (`FocusPanelPublishedLayout`) is operator-authored:
  **rows → cells → sized by intent (`Quarter · Third · Half · Two Thirds · Full · Fill`)
  → vertically stacked cards.** Sizes are operator intent, not grid tokens — the runtime
  computes exact spacing, and **Fill** absorbs a row's leftover space so nothing is pinned
  awkwardly and no dead whitespace remains. Stacking lets a column hold two cards (e.g.
  *Household left, Readiness + Current Work stacked right*). Legacy fraction values stay
  valid for already-published docs.
- When a surface has a **published layout**, the runtime renders **exactly** those
  rows/widths. The only sanctioned override is **responsive collapse** to a single column
  on a too-narrow surface. No hidden auto-layout overrides a published layout.
- When **no** layout is published, the **Composition Engine** (`composeFocusPanelSurface`)
  provides the default (interlocking lanes / stack from card semantics). The legacy
  **weight / preferred-partner / preferred-shape** model is now a **recommendation default
  only** — it never overrides a published layout.
- Storage: the layout is persisted on the Summary `LayoutDoc` **metadata**
  (`focusPanelLayout`); the runtime reads it via `readFocusPanelPublishedLayout`. No new
  storage type; no parallel config store.

---

## 3. Experience Builder — row-based composition

The builder authors the published layout visually (not abstract tokens like `wide`/`1x`).
Pipeline:

```
Surface
  ↓ Rows                 (operator adds rows)
    ↓ Cards              (cards placed into a row's columns)
      ↓ Evidence Groups  (per-card content: fields / related lists)
        ↓ Perspectives   (depth defaults: Evidence / Focus / Workspace)
          ↓ Conditions   (visibility / state rules)
            ↓ Actions    (card / row affordances)
              ↓ Published Runtime
```

- Cards are sized by **intent** (**Quarter / Third / Half / Two Thirds / Full / Fill**),
  not grid fractions; rows can be added, removed, and reordered; cards stack within a
  column and drag between rows. The builder's **preview is the real runtime grid** fed
  the same layout — preview equals runtime.
- Mounted in the gated `/settings/surfaces` Focus Panel editor; **Save draft** and
  **Publish** persist the layout through the existing draft/publish flow
  (`saveFocusPanelSummaryDraft` / `publishFocusPanelSummary`). A layout persists only once
  authored — otherwise no metadata is written and the runtime keeps its auto default.

---

## 3a. Card Definition V2 — Question → Evidence Groups → Ownership

A card is authored as operational meaning, not a flat field list. The Inspector edits,
in order:

```
Card
  ↓ Question        (the one thing the card answers)
    ↓ Evidence Groups (named bundles: Identity / Enrollment / Placement / Readiness / Medical / Documents …)
      ↓ Evidence    (fields live INSIDE a group; bound to business concepts)
        ↓ Presentation (size / density)
          ↓ Expansion (collapsed ↔ expanded; see §3b)
            ↓ Actions
              ↓ Conditions
                ↓ AI  (advisory only)
                  ↓ Ownership (owner card + editable / required / read-only)
```

- **Evidence Groups** own the fields. Legacy flat-`fields` configs auto-wrap into one
  "Details" group; the runtime renders the flattened fields (`configFields`) in reading
  order, so grouping never forks the render path. Code:
  `focusPanelCardConfigModel.ts` (`evidenceGroups`, `configFields`),
  `focusPanelEvidenceGroupOps.ts` (Inspector ops).
- **Ownership doctrine:** every business concept has **exactly one owning card** (Phone →
  Household, Program → Placement, Medical → Health & Safety, Weekly Charges → Billing,
  Timeline Event → Timeline, Communications → Communications). A concept may be **shown
  read-only** on other cards, but is **editable only on its owner**. The Inspector's
  Editing tab enforces this (the "Editable here" toggle is disabled off-owner); validation
  raises an `ownership` issue otherwise.
- **Inspector V2 sections:** Question · Evidence · Presentation · Behavior · Editing ·
  Expansion · Conditions · Actions · AI (`FocusPanelCardInspector.tsx`). Technical detail
  is secondary to operational meaning.

---

## 3b. Expansion doctrine

Expansion is **not** Focus and **not** Workspace. Expansion means *the same operational
question, with more room*:

| Card | Collapsed | Expanded |
|------|-----------|----------|
| Readiness | top blockers | the full blocker list |
| Children | 2 children | all children |
| Billing | this week's charge | historical weekly charges |

- Same question, same card — just more evidence. It **overlays downward** (the inline
  overlay), **never pushes** surrounding cards, **never changes layout**, and **never
  creates a new surface**. Authored per-field via the Inspector's Expansion tab
  (collapsed vs expanded placement).

---

## 3c. Workspace doctrine

A **Workspace** begins when the operator stops **reviewing** and starts **doing work** —
bulk financial review, large document review, weekly attendance editing, mass schedule
editing. Those are Workspaces (the deepest operational depth — see
[`operational-depth-doctrine.md`](./operational-depth-doctrine.md)), **not** expanded
cards. A card expands to answer its question with more room; it becomes a Workspace only
when the work itself is the activity. Only truth-owning cards may reach Workspace depth;
diagnostic cards top out at Evidence and hand off.

---

## 4. Operational Context mutation model

- **`OperationalContext` is read-only.** Cards observe `truth` + `capabilities`; they never
  write to the context and never fetch to enrich it.
- Mutation is a **separate injected adapter** (`FocusPanelMutation`), the same pattern as
  `coordination`. It persists through the **existing server route** and refreshes via the
  **existing record-patch event**:

```
Edit a row → adapter.savePersonContact(personId, patch)
  → PATCH /api/admin/persons/[id]            (existing route: permissions + validation)
  → record-patch event → drawer VM merge
  → buildOperationalContext recomposes       (context rebuilt from refreshed truth)
  → card reflects saved truth                (no manual refresh, no context write)
```

- No new mutation path; audit/permission behavior is exactly the existing route's
  (parity — no audit added or bypassed).

---

## 5. Household live editing — targeted, per row

Editing is **targeted, not card-wide**:

```
Card → Evidence Group → Evidence Row → Edit → Save → Context Update
```

- Every editable person row owns its own quiet Edit affordance (primary contact / other
  parent-guardian / additional / emergency / pickup / billing). There is **no** card-wide
  "Edit contact" link.
- Edit names the target (`Edit {name}`), seeds from that person, **saves only that person**
  (adapter generalized to any household person by id), and **Cancel** returns to the same
  Household state. Phone displays formatted; on save the card recomposes and flashes a
  transient "✓ Saved" confirmation.
- **Children rows are belonging-only**: clicking a child **hands off** to the Children card;
  it does **not** edit child operational fields inside Household.

---

## 6. Card-depth / Back history

A lightweight **local** depth-history stack (not routing, not drawer navigation) records
where a card-to-card handoff originated so **Back** returns to the prior card state:

```
Household focused evidence → click child → Children focused child
  → Back → Household focused evidence   (the launching state, restored)
```

- A handoff pushes its source `{ card, focus }`; `back()` pops and restores it; dismissing
  to the base panel clears the stack. Back labels: **← Back to panel** (no history),
  **← Back to Household** (came from Household), **← All children** (within Children).

---

## 7. Interaction doctrine (frozen primitives)

Exactly three interaction primitives — no others:

| Primitive | Meaning |
|-----------|---------|
| **Perspective Change** | Same subject + context; presentation depth changes (Overview → Evidence → Focus → Edit). |
| **Subject Change** | A different subject; the panel recomposes around the new Operational Context. |
| **Context Update** | Same subject + context; observed truth changes; cards observing it recompose. |

**Card Editing V1** is expressed through these: a targeted row edit saves through the
adapter, which produces a **Context Update** (record-patch → VM merge → context recompose),
and the card re-renders from refreshed truth.

---

## 8. Invariants

- Published layout is the source of truth; auto-composition is default-only fallback.
  The runtime **never overrides an intentional published layout** (only responsive
  single-column collapse); auto-composition exists only when no layout is published.
- Composition is sized by **intent** (Quarter…Full + Fill); the runtime computes exact
  spacing and Fill removes dead whitespace. No grid tokens in the authoring vocabulary.
- A card is authored as **Question → Evidence Groups → Ownership**, not a field list.
  Fields live inside evidence groups; the runtime renders the flattened fields.
- **One owning card per concept**; a concept is editable only on its owner, read-only
  elsewhere.
- **Expansion ≠ Focus ≠ Workspace**: expansion is the same question with more room
  (overlays downward, never reflows, never a new surface); Workspace is doing work.
- The base canvas never moves; depth/overlays are an overlay layer.
- Inline overlays open downward only.
- `OperationalContext` is read-only; mutation flows through the injected adapter +
  existing route + record-patch refresh.
- Editing is targeted (row-level); only truth-owning cards edit.
- No new interaction primitive beyond the three above; no new runtime architecture.
