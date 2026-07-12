# Focus Doctrine Evolution — Current Work

**Status:** Implementation-ready (July 2026)

---

## What stays the same

- Three depths: Evidence · Focus · Workspace (`operational-depth-doctrine.md`)
- Summary → Focus → Return grammar
- Focus Card overlay (zoom-from-origin, scrim, ESC dismiss)
- Truth cards own Focus for read/edit; diagnostic cards capped at Evidence
- `focusPanelCoordination.ts` perspective levels
- Published layout as source of truth

---

## What changes

### Current Work becomes a work-owning Focus surface

| Before | After |
|--------|-------|
| `supportsFocus: false` | `supportsFocus: true` |
| Expanded overlay only | **Focus** depth (primary work surface) |
| Diagnostic / routes only | **Owns** completion interaction |
| Tier 1 but Evidence-capped | Tier 1 with **Focus ceiling** |

### New card class: work-owning

Between diagnostic and truth-owning:

| Class | Focus? | Owns | Example |
|-------|--------|------|---------|
| Diagnostic | No (Evidence max) | Nothing — routes | Readiness |
| **Work-owning** | **Yes** | Completion + coordination | **Current Work** |
| Truth-owning | Yes | Entity fields | Household, Children |

Work-owning cards reach Focus because they own the **completion interaction** — not because they store entity truth.

### Completion phases live inside Focus

Household Focus has Edit sub-state. Current Work Focus has **Completion sub-states**:

```
working → select_result → confirm → processing → working (refreshed)
```

Edit transforms fields. Completion declares what happened. Both stay inside Focus shell.

---

## What this means for future Focus experiences

Any process stage that exposes operator work should project to **Current Work** — not a new card per stage.

Future domains (Scheduling, Compliance, Capacity) add operating plan content, not new interaction primitives.

**Future work-owning cards:** Only if a second concurrent work stream exists on the same record (rare). Default: one Current Work projection per subject.

---

## Capability matrix update

```typescript
// current_work — frozen for implementation
{
  supportsSummary: true,
  supportsFocus: true,       // CHANGED
  supportsInlineEdit: false,
  supportsExpanded: false,   // RETIRED — Focus replaces
  supportsWorkspace: false,  // completion stays in Focus; tour scheduling may hand off
  perspectiveExpansion: "takeover_row",
  cardClass: "work-owning",
}
```

---

## Composition default update

**Published layout enrollment default:**

```
Row 1: current_work (Fill)
Row 2: household (Half) · children (Half)
Row 3: readiness_kpi (Half) · tour_summary (Half)
Row 4: communications (Half) · documents (Half)
```

Experience Builder: Current Work pinned row 1 for process-backed Focus Panel layouts.

---

## BOS relationship

BOS remains header + rail. Current Work Focus includes contextual BOS chips — grounded in objective projection. BOS never replaces Current Work as primary surface.

---

## Promotion

Update on implementation:
- `universal-card-lifecycle.md` — work-owning class
- `operational-depth-doctrine.md` — § Focus reach
- `focus-panel-card-library.md` — Current Work entry
- `focus-panel-composition-v2-and-editing.md` — default row 1
