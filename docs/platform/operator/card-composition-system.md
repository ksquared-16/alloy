---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Alloy Card Composition System

**Status:** Platform doctrine (June 2026). The composition layer between **cards** and the **Experience Builder**.
**Follows:** [`operational-grammar.md`](./operational-grammar.md) · [`card-language.md`](./card-language.md) · [`universal-card-archetypes.md`](./universal-card-archetypes.md) · [`operational-context-boundary.md`](./operational-context-boundary.md).
**Feeds:** [`experience-builder-doctrine.md`](./experience-builder-doctrine.md) (Surface Definitions compose cards using this system).
**Code model (declarative):** `web/lib/adminV2/runtime/focusPanel/cardCompositionModel.ts`.
**Engine (wired, V1):** `web/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface.ts` — see `docs/sprints/archive/06_2026/focus-panel-composition-engine-v1` (historical: `../../sprints/archive/06_2026/focus-panel-composition-engine-v1/README.md`).

> **Composition V2 (June 2026) — published layout is the source of truth.** An
> operator-authored **published layout** (rows → cells → fractional widths
> `1/3·1/2·2/3·full` → stacked cards) now drives the runtime **exactly** (responsive
> collapse only). The weight / preferred-partner / footprint model in this document is a
> **recommendation default ONLY** — the smart starting point when no layout is published;
> it never overrides one. Canonical state: [`focus-panel-composition-v2-and-editing.md`](./focus-panel-composition-v2-and-editing.md).

> We have designed Operational Grammar, Card Language, Card Archetypes, Operational Context, Subject Change, and Perspective Change. The missing layer is **how cards compose into a Focus Panel**. This document defines that system. It introduces **no new interaction primitives and no new architecture** — it is the rulebook a future layout engine and the Experience Builder use to turn a set of cards into one operational experience.

---

## 0. The problem this solves

The Core Four cards are correct individually, but the runtime still reads as:

```
Card
Card
Card
Card
```

instead of **one operational experience**. The cause is that the runtime composes
cards as identical cells in a uniform grid. There is no concept of a card *deserving*
more emphasis, of cards that *belong together*, or of a surface *owning* its own
composition. This document supplies all three.

**Non-goal:** a perfect grid. **Goal:** a calm, balanced, intentional surface where
the eye flows through the operational questions in priority order.

---

## 1. Two orthogonal inputs (do not conflate them)

Alloy already defines **Operational Weight as priority tiers** in
[`card-language.md`](./card-language.md):

| Tier | Meaning | Examples |
|------|---------|----------|
| Tier 1 — Decision | Operator must act | Current Work, Attention, Readiness |
| Tier 2 — Context | Operator must understand | Household, Children, Status, Program |
| Tier 3 — Evidence | Operator may reference | Documents, Messages, Timeline |
| Tier 4 — Reference | Occasional supporting info | Metrics, Audit, History |

That tier answers **“how soon must the operator engage?”** — it drives **reading
order**.

This document adds a **second, orthogonal** dimension:

**Composition Weight** = **Heavy / Medium / Light** — *how much visual area and
emphasis a card needs to answer its question.*

These are genuinely different. Current Work is **Tier 1** (highest priority) but
**Light** (it answers one question and needs little room). Household is **Tier 2**
but **Heavy** (it carries multi-group evidence and needs space).

| Dimension | Question it answers | What it controls |
|-----------|---------------------|------------------|
| **Tier** (existing) | How soon must I engage? | **Order** — which cards lead, reading flow |
| **Composition Weight** (new) | How much room does this card need? | **Area & emphasis** — size, grouping |

> A card’s **footprint** (the width prototype from the prior sprint: narrow / medium /
> wide / full) is **derived** from Composition Weight plus its width constraints. Weight
> is the concept; footprint is one expression of it.

---

## 2. Composition Weight

| Weight | Meaning | Default area | Typical cards |
|--------|---------|--------------|---------------|
| **Heavy** | Anchors a region; carries rich evidence/collections | ≥ 2 columns, taller | Household, Children, Communications, Timeline |
| **Medium** | A verdict or assessment with a few supporting lines | 1–2 columns | Readiness, Billing, Health, Documents |
| **Light** | A single glanceable answer | 1 column, compact | Current Work, Tour, Attention |

Weight describes **emphasis, not pixels**. Heavy cards anchor; light cards orbit them.

---

## 3. Cards declare composition preferences

Each archetype/card declares **preferences** — *recommendations to the layout
engine*, never hardcoded layouts.

| Preference | Type | Meaning |
|------------|------|---------|
| `weight` | Heavy / Medium / Light | Visual emphasis & default area |
| `preferredPartners` | card keys | Cards this reads well beside |
| `preferredRow` | lead / support / context / footer | Which band of the surface it gravitates to |
| `minWidth` | columns | Fewest columns it can function in |
| `maxWidth` | columns / full | Most it should ever occupy |
| `preferredHeight` | compact / standard / tall / auto | Vertical appetite |
| `perspectiveExpansion` | in_place / takeover_row / takeover_surface | How it grows on Perspective Change |

`preferredRow` bands map to tier intent: **lead** = decision/context anchors that
open the surface; **support** = assessments beside an anchor; **context** = evidence;
**footer** = full-bleed history.

---

## 4. Default card weight & preferred partners (recommendations)

These are **platform defaults**. A Surface Definition (a Business Process surface)
may override any of them.

| Card | Archetype | Weight | Preferred partners | Pref. row | min–max | Height | Expansion |
|------|-----------|--------|--------------------|-----------|---------|--------|-----------|
| **Household** | Identity | Heavy | Children, Communications, Billing | lead | 2–full | tall | takeover_row |
| **Children** | Collection | Heavy | Household, Readiness, Current Work | lead | 2–full | tall | takeover_row |
| **Communications** | Communication | Heavy | Household, Timeline | context | 2–full | tall | takeover_row |
| **Timeline** | Activity | Heavy | Communications | footer | full–full | tall | takeover_surface |
| **Readiness** | Intelligence | Medium | Children, Attention | support | 1–2 | standard | in_place |
| **Billing** | Financial | Medium | Household | support | 1–2 | standard | in_place |
| **Documents** | Collection | Medium | Communications | context | 1–2 | standard | in_place |
| **Health** | Intelligence | Medium | Readiness | support | 1–2 | standard | in_place |
| **Current Work** | Work | Light | Tour, Readiness, Attention | lead | 1–1 | compact | in_place |
| **Tour** | Process | Light | Current Work | support | 1–1 | compact | in_place |
| **Attention** | Intelligence | Light | Current Work, Readiness | lead | 1–1 | compact | in_place |

Reading these as the doctrine intends:

- **Heavy anchors** (Household, Children) want a wide column and lead the surface.
- **Light decision cards** (Current Work, Attention) are high-priority but small —
  they ride *beside* an anchor as a partner, not as a full row.
- **Medium assessments** (Readiness) sit beside an anchor to give it a verdict.

---

## 5. Surface Definitions own composition

> The **Surface Definition** owns composition. Not the cards. Not the runtime.

A Surface Definition (e.g., `Enrollment ▸ Summary`) declares **which cards appear**
and **may override their weights/partners/order**. It does **not** specify pixels.

`Enrollment ▸ Summary` might compose:

```
Household (Heavy) · Current Work (Light) · Tour (Light) · Children (Heavy) · Readiness (Medium)
```

…which the engine may naturally balance into:

```
┌─────────────────────────────┬───────────────┐
│ Household                   │ Current Work  │
│                             ├───────────────┤
│                             │ Tour          │
├─────────────────────────────┼───────────────┤
│ Children                    │ Readiness     │
└─────────────────────────────┴───────────────┘
```

The **same cards** under a different Surface Definition compose differently:

- **Attendance ▸ Summary** might lead with a Roster (Heavy) + Today’s Status (Light).
- **Billing ▸ Summary** might lead with Balance (Heavy) + Recent Payments (Medium).
- **Scheduling ▸ Summary** might lead with a Calendar (Heavy) + Conflicts (Light).
- **Staff ▸ Summary** might lead with Profile (Heavy) + Certifications (Medium).

Enrollment is **the first implementation, not the model**. Nothing in the engine
hardcodes Enrollment, Household, or any vertical.

---

## 6. The layout engine

```
Surface Definition  ─┐
                     ├──▶  Layout Engine  ──▶  Balanced composition (rows of cells)
Card Preferences    ─┘            ▲
                          Available width (responsive columns)
```

> **Implementation status — Composition Engine V1 (June 2026).**
> `composeFocusPanelSurface()` is the wired, deterministic engine. It supersedes
> the uniform 1–4 column grid with a finer **12-unit** base so cards claim
> genuinely different widths. It composes **interlocking lanes** (a dominant
> Heavy/anchor lane beside a balancing support lane, natural heights) when the
> surface is wide, and a composed **stack** (full-width anchors, paired support)
> when narrow. The numbered algorithm below is the conceptual spec; V1 realizes
> steps 1–8 via lane composition rather than row equalization (cards keep natural
> heights so they interlock — §6 “row rhythm” relaxes to “lane interlock”). Depth
> (Focus Cards) and inline overlays are unchanged.
>
> **Lane balance (Enrollment Freeze refinement).** A single support card may cede up
> to 8/12 to the anchor; a **stacked support lane (2+ cards)** caps the anchor at
> 7/12 so the support lane reads at ≥5/12 (~310px at the live 745px panel) instead of
> a cramped 4/12 (~234px). The anchor stays clearly dominant either way.
>
> **Experience Builder overrides (now wired).** The engine's `overrides` param is
> fed from per-card configuration: the Surfaces editor's Inspector → Composition tab
> sets `weight` / `preferredRow` / depth (`perspectiveExpansion`), persisted on the
> card's `LayoutSection` metadata and merged over platform defaults at compose time
> (`buildCompositionOverrides` → `composeFocusPanelSurface`). So a published Surface
> Definition composes per its configured weights — Enrollment is the first instance,
> not a hardcode. Diagnostic cards are still clamped to Evidence depth by the runtime.

The engine is **deterministic** and produces a composition the existing
`FocusPanelCardGrid` can render. Algorithm:

1. **Resolve preferences.** For each card, merge platform default ⊕ Surface override
   ⊕ Process override.
2. **Order by tier, then surface order.** Tier 1/lead cards float toward the top;
   the Surface Definition’s declared order breaks ties. (Order ≠ size.)
3. **Determine column capacity** from measured width (`computeFocusPanelGridColumns`:
   <560→1, <820→2, <1040→3, else 4).
4. **Form rows by anchor + partners.** Walk ordered cards; when a Heavy/anchor card
   is placed, pull its highest-priority `preferredPartners` (that still fit
   `capacity − anchor.maxWidth`) into the *same* row as light/medium companions.
   Never seat two Heavy anchors in one row unless capacity ≥ 4.
5. **Assign widths within the row.** Anchor takes `clamp(maxWidth, minWidth, capacity − Σpartners.minWidth)`; partners take their `minWidth` (stacking vertically inside their shared cell when there are two lights, e.g., Current Work over Tour).
6. **Balance & fill.** Avoid trailing empty columns: if a row underflows, promote a
   partner’s width or pull the next compatible card forward.
7. **Row rhythm.** Cards in a formed row **equalize height** (calm, not masonry).
   Rows are ordered by reading priority.
8. **Collapse gracefully.** At capacity = 1 (the live operator center column),
   rows linearize into a **weighted stack**: each anchor immediately followed by its
   partners, preserving the “anchor → orbit → next anchor” rhythm even with no
   horizontal room.

### 6.1 side-by-side vs stacked vs full-width

| Decision | When |
|----------|------|
| **Full-width** | `weight = Heavy` AND (`minWidth = full`) — Timeline/Activity; **or** no compatible partner fits the remaining capacity; **or** capacity = 1 |
| **Side-by-side** | An anchor + partner(s) whose `Σ minWidth ≤ capacity` and that list each other as `preferredPartners` |
| **Stacked (within a cell)** | Two **Light** partners assigned to the same companion column (e.g., Current Work over Tour) |
| **Stacked (linear)** | capacity = 1 → weighted stack (anchor then its partners) |

---

## 7. Perspective expansion within composition

> The three depths an operator descends through (Evidence / Focus / Workspace) are
> defined in [`operational-depth-doctrine.md`](./operational-depth-doctrine.md). The
> `perspectiveExpansion` values below are how composition realizes those depths:
> `in_place` → Evidence, `takeover_row` → Focus, `takeover_surface` → Workspace.

Perspective Change (local UI; no new context) interacts with composition via
`perspectiveExpansion`:

- **in_place** — the card grows in its cell; its row re-stretches (siblings keep
  alignment). Default for Light/Medium.
- **takeover_row** — the card claims its full row while expanded; partners drop to
  the next row until collapsed. Default for Heavy collections (Household, Children).
- **takeover_surface** — the card becomes dominant and others recede (Immersive).
  Reserved for full-bleed cards (Timeline) or explicit operator focus.

Expansion **never** triggers a Subject Change, a route, or a recomposition of other
cards’ subjects. Overview maintains row rhythm; expansion is the one sanctioned way
a row’s height grows.

---

## 8. Review — current Focus Panel vs the approved vision

Captured against the live authenticated operator surface and the approved mocks
(screenshots: `../../sprints/archive/06_2026/focus-panel-composition-review/` (historical: `../../sprints/archive/06_2026/focus-panel-composition-review/`)).

**What still feels like legacy System 5**

- Every Summary card renders as an **equal cell**. There is no anchor; Household and
  Current Work read with the same emphasis, so the eye has no entry point.
- The live Focus Panel is the **narrow center column** of the Queue ▸ Focus Panel ▸
  BOS shell (~440px), so the grid collapses to **one column** and *all* cards become
  full-width — the literal “Card / Card / Card / Card” stack.
- Composition is currently a **hardcoded grid** (`SUMMARY_GRID`), not a Surface
  Definition expressing weights and partners.

**Where composition differs from the approved vision**

- Approved mocks pair a Heavy anchor with Light/Medium companions (Household +
  Current Work/Tour; Children + Readiness). The runtime cannot express pairing
  because it has no partner concept and no width to spend.
- Weight is not yet an input; only width (footprint) exists, and width is invisible
  at the live column size.

**How card weight should influence placement**

- Heavy → anchor a row, wide column, leads reading order within its band.
- Light → companion in the anchor’s row (or stacked sidebar), never its own full row.
- Medium → the verdict beside an anchor.
- At one column, weight becomes **stack order + density**: anchors render Standard,
  companions render Compact, so even a stack has visible rhythm.

**How row rhythm should work**

- A “row” is **formed by the engine** (anchor + partners), not declared per card.
- Within a formed row, **equalize height**; across rows, order by reading priority.
- One Heavy anchor per row below 4 columns; companions stack inside one shared cell.

**How the engine decides side-by-side / stacked / full-width** — see §6.1.

---

## 9. Recommended changes before Experience Builder integration

1. **Adopt Composition Weight + preferences as card metadata.** Land the declarative
   model (`cardCompositionModel.ts`) as the source of truth; reconcile the existing
   footprint helpers to *derive* from weight.
2. **Make the Surface Definition own composition.** Replace the hardcoded
   `SUMMARY_GRID` with a Surface Definition (ordered cards + weight/partner overrides)
   resolved per Business Process. Enrollment ▸ Summary becomes the first instance.
3. **Build the balancing engine** (§6) as a pure function consuming Surface
   Definition + preferences + capacity → grid rows. Keep it deterministic and tested;
   wire it where `SUMMARY_GRID` is read today.
4. **Resolve the width constraint** (decision carried from the prior sprint): either
   accept the single-column stack as canonical (weight → stack order + density) **or**
   let the Focus Panel reclaim width when BOS is collapsed so partner rows can form.
   The engine supports both; the shell decision is a product call.
5. **Express weight at one column** via density (anchors Standard, companions Compact)
   so the stack reads intentionally even before any width work.
6. **Keep everything config-driven.** No vertical names in the engine; Attendance,
   Billing, Scheduling, and Staff surfaces compose with the same rules.

---

## 10. Invariants

- Composition is a **recommendation system**, never a hardcoded layout.
- **Surface Definitions own composition**; cards only declare preferences; the engine
  only balances.
- **No new interaction primitives, no new architecture.** Composition consumes the
  existing Operational Context, cards, tiers, densities, Perspective/Subject Change.
- The engine output is **deterministic** and renders through the existing
  `FocusPanelCardGrid`.
- Nothing hardcodes a vertical. Enrollment Summary is the first implementation of a
  general system.
