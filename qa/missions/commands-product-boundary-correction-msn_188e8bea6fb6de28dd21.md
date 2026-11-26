# Commands product-boundary correction — msn_188e8bea6fb6de28dd21

**Date:** 2026-07-28  
**Slot:** 1 (`wt1-commands-system-inventory`)  
**Scope:** Reject standalone Organization Commands configuration product. Preserve Command architecture.

## 1. Product-boundary diagnosis

Live QA and repository truth: most Commands are platform-owned; Safety is platform-owned; BP selection belongs in Processes; exposure belongs in Surfaces; Automation owns invocation. The only broadly available org edit on the rejected page was a **global** `action_definitions.label` overlay — not a coherent administrator job for a peer Organization Configuration product.

## 2. Controls removed from standalone Commands

| Control | Disposition |
|---------|-------------|
| Org definition enable (`is_active`) | Removed from operator product (diagnostics read-only) |
| Org definition label | **Not preserved as org-config UI** — see label decision |
| Org placement toggles | Belong to Surfaces; removed from this page |
| Process usage editing | Never belonged here — Processes own `command_set_v1` |
| Safety editing | Never belonged here — platform-owned |
| Variants editing | Uncommon; read-only on diagnostics if present |

## 3. Where each valid control now lives

| Concern | Owner |
|---------|-------|
| Select / order Commands | Business Processes (`command_set_v1`) |
| Stage recommendation | Stages (recommend-only from selected set) |
| Work Template constraints | Processes / Work Templates |
| Where operators see Commands | Surfaces (placements) |
| Invoke existing Command | Automation |
| Capability honesty / support | Capability Registry (+ internal diagnostics) |
| Developer placement CRUD | `/adminV2/settings/actions` |

### Label decision

`action_definitions.label` is an **org-wide** overlay when an org-owned definition exists (`resolveActionsForContext` uses definition.label). There is **no** process- or surface-scoped label schema today. Per correction rules: do **not** invent schema; do **not** preserve a global org Command label editor merely because storage exists. Diagnostics show stored label read-only. Contextual labels, if needed later, belong with Processes/Surfaces — **no blocker** for this correction.

## 4. Diagnostics route

**Retained** at `/organization/commands` as internal capability diagnostics:
- Removed from ordinary Organization Configuration grid and Operations nav
- Listed only on `CONFIGURATION_MODE_INTERNAL_NAV_ITEMS`
- Banner: not organization configuration
- Read-only (no enable/label/placement edits)
- `/configuration/commands` still aliases here

## 5. Navigation changes

- Domain grid: Commands domain removed; sequence **Automation → Business Processes → Surfaces**
- Operations sidebar: same sequence; Commands removed
- Workspace Operations tiles: Commands removed; Automation emphasized
- `/settings/actions` → `/adminV2/settings/actions` (developer CRUD), **not** diagnostics

## 6. Runtime preserved

No changes to Capability Registry, Command Runtime, adapters, destructive safety, `command_set_v1`, stage recommendation, BOS gating, Automation invocation boundary, telemetry, or API convergence paths.

## 7. Evidence amendments

P7/P8/P10 and prior product-realization claims of an accepted operator Commands configuration product are **retracted** for product-boundary purposes. Architecture delivery remains. See amended mission docs and `docs/platform/foundation/release-history.md`.
