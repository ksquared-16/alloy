# Structure Mode Doctrine

**Path:** `docs/sprints/archive/06_2026/experience-builder-v2-runtime-editing/04-structure-mode-doctrine.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 4 — Structure Mode doctrine

---

## 1. Purpose

Structure Mode is for editing the **skeleton** of a Design Surface: which cards exist, where they sit, how big they are, how they group into zones. The mental model is *"arrange the surface."*

It answers operator-natural intents like *"I want Readiness higher,"* *"make Billing wider,"* *"these three belong together,"* *"add a card here."*

## 2. What Structure Mode operates on

| Primitive | Structural verbs |
|---|---|
| **Zone** | Reveal boundaries, rename (label), reorder zones, set responsive behavior (platform options) |
| **Card** | Add, Delete, Move/Reorder, Resize (span 1 / 2 / full), set density, change archetype-permitted size, Duplicate |
| **Surface** | Reorder modes (Focus Panel), add/remove zones from the platform-defined topology |

Structure Mode does **not** touch slot data sources, renderers, labels, or conditions — those are Content Mode.

## 3. How the surface looks in Structure Mode

The surface stays the real runtime, but shifts to a **structural reading** so blocks and space are legible:

| Element | Treatment in Structure Mode |
|---|---|
| **Cards** | Render as blocks: icon + title + archetype tag + size. Body content is **dimmed to a calm placeholder rhythm** (not removed — the card keeps its real height so layout is honest). |
| **Card chrome** | Each card gains: a **drag handle**, **resize handles** (span control), and an overflow menu (Duplicate, Delete, Convert density). |
| **Zones** | Zone **boundaries become visible** (faint dashed regions with labels). Cards can be dragged between zones. |
| **Between cards** | **Insertion lines** appear on hover — a thin pine line with a `+` (see §5). |
| **Grid** | A faint column grid underlays the surface so span/resize reads clearly. |

The shift is calm and reversible: toggling back to Content Mode (or Viewing) restores full content rendering with zero layout change.

## 4. Card movement and reordering

| Gesture | Behavior |
|---|---|
| **Drag handle → drag** | Card lifts (subtle elevation), other cards reflow to show the drop target; insertion lines indicate valid positions. |
| **Drop** | Card settles into the new position; reflow animates (motion preserves context — no jump). |
| **Cross-zone drag** | Allowed where the target zone permits the card's archetype; disallowed targets are visibly inert. |
| **Tier rule** | Reordering respects card tiers — a card may be reordered **within** its tier; cross-tier moves are gated by platform rules (consistent with Universal Card System). The UI shows tier bands subtly so this is not surprising. |
| **Keyboard** | Selected card + arrow keys moves it; for accessibility and precision. |

## 5. Card insertion (between cards)

Insertion happens **in place**, never through an abstract side panel.

```
   ┌─────────────┐
   │  Readiness  │
   └─────────────┘
   ────── + ──────   ◀ hover reveals insertion line
   ┌─────────────┐
   │   Family    │
   └─────────────┘
```

| Step | Behavior |
|---|---|
| 1 | Hovering the gap between two cards reveals an **insertion line** with a `+`. |
| 2 | Clicking `+` opens an **inline Card Type picker** anchored at that position (not a global modal) — a compact, searchable list of platform Card Types relevant to the surface's entity/category, grouped by purpose. |
| 3 | Selecting a Card Type inserts a **real card** at that exact position, pre-filled with its default Content Template (sensible default slots/renderers). |
| 4 | The new card is immediately live in the working copy; the operator can switch to Content Mode to configure it, or keep arranging. |

Insertion at the **start**, **end**, and **into an empty zone** all use the same affordance (the empty zone shows a single centered insertion prompt — see Empty States in the mockups and `05-content-mode-doctrine.md`).

## 6. Resizing

| Gesture | Behavior |
|---|---|
| **Resize handle** | Drag a card's edge to change span (1 col → 2 col → full row), snapping to the column grid. |
| **Constraints** | Span options are **platform-owned per Card Type** (e.g., a Metric tile may allow 1 or 2; a Timeline may require full row). Disallowed spans don't snap. |
| **Density** | A density control (Micro / Compact / Standard / Expanded) is offered where the Card Type permits — changing it re-renders the real card at that density in place. |
| **Responsive** | Resizing edits the canonical (desktop) composition; mobile collapse is platform-governed and previewed via the responsive lens, not hand-resized. |

## 7. Zones in Structure Mode

- Zone **topology** (which zones exist) is platform-defined per category; Structure Mode lets the operator **populate, reorder, label, and toggle presence** of zones, not invent arbitrary ones.
- Dragging the last card out of an active zone leaves the zone in its **empty state** (full chrome, empty prompt) — it does not silently vanish (consistent with "empty ≠ disabled").
- Platform shell regions (header, mode tabs, BOS rail) are **not** zones and never appear as editable structure.

## 8. What Structure Mode must not do

- Must not expose an architecture tree as the primary surface (the spatial layout *is* the structure view).
- Must not allow arbitrary free-form positioning (no absolute drag-anywhere) — cards live in zones on the grid; this is what keeps published == editing.
- Must not edit content (data sources, renderers, labels, conditions).
- Must not let span/density/tier violate platform rules.

## 9. Differentiation from page builders

| Page builder (Webflow/Wix/Retool) | Alloy Structure Mode |
|---|---|
| Drag arbitrary divs anywhere | Cards snap into platform-defined zones on a grid |
| Pixel positioning | Semantic span/density from platform options |
| Anything can go anywhere | Card Types are constrained by archetype, zone, and tier |
| Layout drift between editor and live | One renderer — structure edits are honest |

## 10. Cross-references

| Concern | Doc |
|---|---|
| Content Mode (the other half) | [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md) |
| Interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| Walkthroughs (add/move/resize) | [`06-interaction-walkthroughs.md`](./06-interaction-walkthroughs.md) |
| Card anatomy / tiers / density / span | `docs/platform/operator/universal-card-system.md` |
