# Focus Panel — Composition V2 + Card Editing V1 (canonical state)

**Status:** Canonical (June 2026). The merged state of the Focus Panel QA + Composition
V2 sprint. Supersedes the V1 "engine composes the surface" framing where they differ.

**Companions:** [`card-composition-system.md`](./card-composition-system.md) ·
[`operational-depth-doctrine.md`](./operational-depth-doctrine.md) ·
[`experience-builder-doctrine.md`](./experience-builder-doctrine.md) ·
[`operational-context-boundary.md`](./operational-context-boundary.md) ·
[`canonical-interaction-model.md`](./canonical-interaction-model.md).

**Code:**
`web/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout.ts` (model) ·
`…/composition/focusPanelPublishedLayoutOps.ts` (builder ops) ·
`web/components/admin/focusPanel/FocusPanelRowLayoutBuilder.tsx` (builder) ·
`web/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx` (mount) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelMutation.ts` (edit adapter) ·
`web/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel.ts` (depth history) ·
`web/components/admin/focusPanel/cards/HouseholdCard.tsx` (targeted editing).

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
  **rows → cells → fractional widths (`1/3 · 1/2 · 2/3 · full`) → vertically stacked cards.**
  Stacking lets a column hold two cards (e.g. *Household left, Readiness + Current Work
  stacked right*).
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

- Width is set with plain fractions (**Full / 1/2 / 1/3 / 2/3**); cards stack within a
  column; cards drag between rows. The builder's **preview is the real runtime grid** fed
  the same layout — preview equals runtime.
- Mounted in the gated `/settings/surfaces` Focus Panel editor; **Save draft** and
  **Publish** persist the layout through the existing draft/publish flow
  (`saveFocusPanelSummaryDraft` / `publishFocusPanelSummary`). A layout persists only once
  authored — otherwise no metadata is written and the runtime keeps its auto default.

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
- The base canvas never moves; depth/overlays are an overlay layer.
- Inline overlays open downward only.
- `OperationalContext` is read-only; mutation flows through the injected adapter +
  existing route + record-patch refresh.
- Editing is targeted (row-level); only truth-owning cards edit.
- No new interaction primitive beyond the three above.
