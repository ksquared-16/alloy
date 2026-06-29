# Alloy OS — Operational Depth Doctrine

**Status:** Canonical doctrine (June 2026). Defines the **three depths** an operator
descends through inside a single Operational Context, and which existing runtime
machinery realizes each. **Introduces no new interaction primitive and no new
architecture** — it names a model the runtime already half-expresses so the
Experience Builder can configure it.

**Extends:** [`card-composition-system.md`](./card-composition-system.md) (where cards SIT) ·
[`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) (System 5B — the five interaction models) ·
[`canonical-interaction-model.md`](./canonical-interaction-model.md) (the spine + the three primitives).

**Code model:** depth levels in `web/lib/adminV2/runtime/focusPanel/focusPanelCoordination.ts`
(`FocusPanelPerspectiveLevel`); expansion preference in
`web/lib/adminV2/runtime/focusPanel/cardCompositionModel.ts` (`perspectiveExpansion`).

**Feeds:** [`experience-builder-doctrine.md`](./experience-builder-doctrine.md) — Surface Definitions configure each card's reachable depth.

---

## 0. The problem this solves

Composition decides **where cards sit** on the base canvas. It does not answer the
next question: **what happens when an operator goes deeper into one card.** Today
the runtime expresses "deeper" three different ways — an inline overlay (Readiness),
a centered Focus Card (Household), an embedded workspace (Communications) — but it
has never *named* them as a single graded model. Without that vocabulary the
Experience Builder cannot configure depth, and each new card re-invents how it grows.

This doctrine names exactly **three depths**. Every card declares the deepest one it
can reach. Nothing else about "going deeper" is permitted.

> **Non-goal:** a new way to navigate. Depth is the existing **Perspective Change**
> primitive (same subject, same context, presentation changes) graded into three
> stops. It is never a Subject Change, never a route, never a Context Update.

---

## 1. The three depths

| Depth | Operator intent | Canonical example | Who can reach it |
|-------|-----------------|-------------------|------------------|
| **Evidence** | *See more.* | Readiness checklist overlay | **Every** card |
| **Focus** | *Bring operational truth forward.* | Household / Children centered | **Truth-owning** cards only |
| **Workspace** | *Do large operational work.* | Weekly financials, bulk scheduling, document review | Cards that **hand off** to a domain workspace |

These are **graded by descent**, not by importance. A Tier-1 diagnostic card
(Readiness) is high priority but tops out at **Evidence**. A Tier-2 truth card
(Household) is lower urgency but can descend to **Focus**. Depth answers *"how far
in,"* not *"how soon."* (Reading order is owned by Tier; see
[`card-composition-system.md` §1](./card-composition-system.md).)

---

## 2. Depth 1 — Evidence

**Intent:** the operator wants to *see more* of an answer without leaving the surface.

| Rule | Requirement |
|------|-------------|
| Subject | Unchanged |
| Operational Context | Unchanged |
| Base canvas | **Never moves.** Evidence reveals over or within the card. |
| Truth cards | Body expands in place; siblings keep alignment. |
| Diagnostic cards | Open a **card-anchored inline overlay** that covers the card below without reflow. |
| Return | Click-out / ESC restores the exact base surface. |

**This is the ceiling for diagnostic cards.** Readiness, Current Work, and Attention
diagnose or route — they do not own truth, so they may **never** descend past
Evidence. When their evidence implies an edit, they **hand off** to the owning truth
card (Readiness "Program missing" → Children focuses that child). The handoff is a
`requestFocus` Perspective Change on the owner, not an elevation of the diagnostic
card. See `focusPanelCoordination.ts` (`clampPerspectiveForCard`).

**Realized by:** in-code level `"evidence"`; composition `perspectiveExpansion: "in_place"`;
`CardInlineOverlay` for diagnostic cards. Maps to System 5B **Expand** and **Drill View**.

---

## 3. Depth 2 — Focus

**Intent:** bring one piece of **operational truth** forward to read or change it.

| Rule | Requirement |
|------|-------------|
| Subject | Unchanged (Focus is depth, not Subject Change) |
| Base canvas | **Never moves.** The focused card lifts into an overlay layer; the rest recedes (dim + desaturate) but holds its position. |
| Motion | Zoom-from-origin in; reverse-zoom on dismiss. |
| Reach | **Operational-truth cards only** — Household, Children, and, as they land, Documents, Communications, Billing, Schedule, Placement, Health & Safety. |
| Return | Click-out / ESC reverse-zooms to the exact base surface — no scroll jump, no reflow. |

### Editing is a capability of Focus

Editing is **not a fourth depth and not a separate perspective.** It is the deepest
state *of Focus*, available only on truth-owning cards:

```
Focused Child → Program → Edit → Save → Focused Child
```

The card stays the centered Focus Card throughout; Edit changes what it lets the
operator do, not where it sits. Readiness never edits. Current Work never edits.
Only the card that **owns** the truth may edit it. (Save routing — through server
mutation / workflow / audit — is governed separately; see
[`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md).)

**Realized by:** in-code levels `"focused"` and `"edit"` (Edit is a sub-state of Focus —
`isElevatedLevel` treats both as raised); composition `perspectiveExpansion: "takeover_row"`;
the centered Focus Card + scrim machinery in `FocusPanelCardGrid`.

---

## 4. Depth 3 — Workspace

**Intent:** the operator needs **large operational work** that no card body can hold —
a weekly financials run, bulk scheduling, multi-document review.

| Rule | Requirement |
|------|-------------|
| Subject | Preserved (the workspace is *about* the current subject) |
| Operational Context | Preserved; the Focus Panel header still identifies the subject |
| Surface | The card hands off to an **embedded domain workspace** that takes over the panel; or, when it cannot fit, an **external / full workspace** with explicit exit and return context. |
| Reuse | Embedded workspaces mount the **existing domain component** (e.g. `CommunicationsDrawerSection`), contained by the Focus Panel shell — never a workspace re-created inside a card body. |
| Return | Back restores the prior mode + card context. |

> **Disambiguation.** "Workspace **depth**" is an in-panel takeover for one subject. It
> is *not* the top-level **Workspace** of the canonical spine (`/workspace`, the
> operator's home). Same word, different layer — depth never navigates home.

**Realized by:** composition `perspectiveExpansion: "takeover_surface"`; the host
embedded-workspace state (`OpportunityFocusPanelEmbeddedWorkspace`,
`OpportunityFocusPanelActivityWorkspace`). Maps to System 5B **Embedded Workspace**
and **External / Full Workspace**.

---

## 5. The depth ladder (single picture)

```
Base canvas (composition)
   │  Perspective Change ↓ (same subject, same context)
   ├─▶ Evidence    every card · see more · canvas never moves
   │       │  (diagnostic cards stop here; hand off to owner for more)
   ├─▶ Focus       truth cards only · forward + center · Edit lives here
   │
   └─▶ Workspace   hand-off to embedded/full domain workspace · subject preserved
```

A card's **reachable depth** is a ceiling, not a path: a card configured to reach
Focus still passes through Evidence; a card capped at Evidence can never be coaxed
to Focus. Diagnostic cards are capped at Evidence by the canvas rule and the runtime
clamp — configuration cannot raise that cap.

---

## 6. Mapping to the existing model (no new concepts)

| This doctrine | In-code level (`FocusPanelPerspectiveLevel`) | Composition (`perspectiveExpansion`) | System 5B model |
|---------------|----------------------------------------------|--------------------------------------|-----------------|
| Base | `base` | — | — |
| **Evidence** | `evidence` | `in_place` | Expand · Drill View |
| **Focus** (+ Edit) | `focused`, `edit` | `takeover_row` | (truth-card Expand resolves to Focus) |
| **Workspace** | host embedded-workspace state | `takeover_surface` | Embedded Workspace · External Workspace |

Subject Change and Context Update — the other two frozen primitives — are **not**
depths. Subject Change recomposes the whole panel for a different subject; Context
Update recomposes cards observing changed truth. Depth moves within one subject and
one context; it only changes presentation.

---

## 7. The canvas invariant (non-negotiable)

Across **all three depths**: the base composition **never moves or reflows.** Deeper
states are an **overlay layer** above the base — receding (dim/desaturate), lifting
(Focus), or covering (Workspace) — never inline expansion that pushes neighbors.
This is the rule that makes depth feel like an operating system rather than an
accordion. See `focus-panel-canvas-finalization` and `card-composition-system.md §10`.

---

## 8. Experience Builder configuration contract

Depth is **declared per card** as recommendations; the platform validates them
against the canvas rule. Experience Builder configures, per card on a Surface
Definition:

| Config | Meaning | Platform validation |
|--------|---------|---------------------|
| `maxDepth` | The deepest reachable depth (`evidence` \| `focus` \| `workspace`) | Diagnostic cards clamp to `evidence`; only truth cards may set `focus`/`workspace` |
| `defaultDepth` | Depth on open (almost always `base`) | Must be ≤ `maxDepth` |
| Evidence content | Which fields/sections the Evidence depth reveals | From content templates (System 5C) |
| `allowEdit` | Whether Focus exposes Edit | Only truth-owning cards |
| Workspace target | Which embedded/external workspace the card hands off to | From the embedded-workspace registry |

The Surface Definition owns these; cards only declare platform defaults; the engine
and runtime only enforce the canvas rule. Nothing here hardcodes a vertical — the
same three depths configure Attendance, Billing, Scheduling, and Staff surfaces.

---

## 9. Invariants

- **Exactly three depths.** Evidence, Focus, Workspace. No fourth depth; Edit is a
  capability of Focus, not a depth.
- **Depth is Perspective Change.** Same subject, same Operational Context. Never a
  Subject Change, route, or Context Update.
- **The base canvas never moves.** Every depth is an overlay layer.
- **Diagnostic cards top out at Evidence** and hand off to the owner truth card; they
  never become a Focus Card or a Workspace.
- **Only truth-owning cards reach Focus** and own Edit.
- **Configuration cannot break these.** Experience Builder picks within the allowed
  range; the platform clamps the rest.

---

## 10. When this doc must be updated

- A depth is added, removed, or renamed (it should not be — three is the model).
- The truth-vs-diagnostic classification changes (`OPERATIONAL_TRUTH_CARDS`).
- Edit stops being a capability of Focus, or another depth gains an edit capability.
- The mapping in §6 drifts from `focusPanelCoordination.ts` / `cardCompositionModel.ts`.

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Where cards sit (composition) | [`card-composition-system.md`](./card-composition-system.md) |
| The five interaction models | [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) |
| The three primitives + spine | [`canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Edit save routing | [`focus-panel-edit-information-doctrine.md`](./focus-panel-edit-information-doctrine.md) |
| Experience Builder authoring | [`experience-builder-doctrine.md`](./experience-builder-doctrine.md) |
| Focus Panel vocabulary | [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md) |
