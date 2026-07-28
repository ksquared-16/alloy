---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# Round 4 — BOS sizing contract

## Existing ownership (do not duplicate)

| Concern | Owner |
|---|---|
| Preferred `closed \| floating \| pinned` | `BosPresentationControllerProvider` |
| Floating x/y/w/h | `bosFloatingGeometry` + `setFloatingGeometry` |
| Pinned width 320–560 | `setPinnedWidthPx` / docked width key |
| Create Lead density | `resolveBosCommandSessionLayoutDensity(effective)` — pinned→`compact`, else `expanded` |
| Command session persistence | Separate from presentation; discard/complete clears draft, **not** presentation today |

## Conceptual presets (names for product; one machine)

| Preset | Meaning | Implementation |
|---|---|---|
| Standard rail | Discovery / compact conversation | Existing default floating (~400) or current preferred |
| Command workspace | Form / Review / Processing review need width | Floating width floor constant (proposed **520px**, clamped by `maxBosFloatingWidthPx`) applied once when entering Form or Review **if not pinned** |
| Pinned rail | Operator pin | Existing pin; never auto-unpin or auto-expand |

## Create Lead behavior

1. Conversation may start at standard / current preferred width.
2. Entering Form or Review while **floating**: if `width < COMMAND_WORKSPACE_MIN_WIDTH`, bump via `setFloatingGeometry` and remember **prior width** for restore.
3. While **pinned**: adapt layout only (`compact`); do not silently expand or unpin. Optional explicit Expand uses existing `openFloating()` / presentation controls if already exposed — do not invent a second Expand control if rail already has one.
4. Operator manual resize/pin during the session remains authoritative (do not fight subsequent bumps).
5. Do not resize on each section open/close.
6. On **complete** or **discard**: restore prior floating width if this session bumped it; leave preferred pin state alone.

## Constants (to add in R4-06)

Propose in `bosFloatingGeometry.ts` (or thin `bosCommandWorkspaceGeometry.ts` helper):

- `BOS_COMMAND_WORKSPACE_MIN_WIDTH_PX = 520` (document if clamp forces lower)

## Explicit non-goals

- Continuous content-driven auto-resize
- Fourth presentation preferred value
- Changing pin width range semantics
- Auto-open Focus Panel
