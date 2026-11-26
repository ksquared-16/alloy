# Surface Command Exposure — investigation (superseded)

**Mission:** Surface Command Exposure Product Realization  
**Status:** **REJECTED / STOPPED** (2026-07-28)  
**Branch:** `agent/cursor/1-commands-system-inventory`

---

## Product correction

**Surfaces do not independently select or configure Commands.**

Accepted Command configuration owner remains **Business Processes**:

- `command_set_v1` selection
- process-specific labels where supported
- Focus Panel / Work Unit / Workspace exposure (Process Actions)
- stage restrictions
- Work Template constraints

Surfaces **render** effective process/runtime presentation. They are **not** a second placement authority.

Implementation commit `7446188b5` was **reverted** (`ea10ed500`). Do not reopen Surface Command Exposure as a product slice.

Next mission: **BOS Command Runtime Convergence** — BOS inherits effective Commands and invokes Command Runtime.

---

## Staging reconciliation (still valid)

| Item | Result |
|------|--------|
| Merge commit | `df12fca95` |
| Incoming | Phase 7 packet/OCR + processing z-index |
| Surfaces/Commands product overlap | None material |
| Post-merge Commands+BOS regression | 28 files / 278 passed (at merge time) |

---

## Historical diagnosis (reference only)

Placement storage remains `action_placements` / `action_definitions`. Process Actions (`LifecycleActionsMatrix`) remains the operator-facing exposure editor for process-context Commands. Developer `/adminV2/settings/actions` remains low-level CRUD — not a peer org product.
