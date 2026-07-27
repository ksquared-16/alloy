---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# Round 4 — Responsive specification

| Mode | Density | Columns | Sections open | Width behavior |
|---|---|---|---|---|
| Floating conversation | expanded | n/a | n/a | Standard preferred width |
| Floating Form / Review | expanded | Pair-aware 2-col | One at a time | Bump to ≥520px once if narrower; restore on discard/complete |
| Pinned | compact | Always 1-col | One at a time | Never auto-expand; explicit Expand → `unpinToFloating` |
| Minimum viewport | compact-like clamp | 1-col | One | Geometry clamped by existing floating max |

## Rules

- No horizontal scroll in command body
- Sticky footer remains visible; body scrolls above it
- Help popover portals and clamps to viewport
- Section summaries truncate with `truncate` when pinned
- `data-gather-columns="1"` when pinned Form edit is open
