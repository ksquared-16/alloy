---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Locked Runtime Implementation Detail (`docs/system/`)

**Tier:** Authoritative locked runtime doctrine — not transitional.

`docs/system/` holds **implementation-level contracts** that govern runtime behavior: reveal gates, queue record layout, drawer VM contracts, routing, BOS identity, configuration runtime, and performance passes. These documents are **canonical for implementation** even when overlapping topics also exist under `docs/platform/`.

## Relationship to `docs/platform/`

| Layer | Owns |
|-------|------|
| **`docs/platform/`** | Operator model, domain truth, modules, experience behavior, governance |
| **`docs/system/`** | Locked runtime implementation detail — performance gates, VM contracts, layout laws |

Prefer `platform/` for **what operators experience** and **domain doctrine**. Prefer `system/` for **how the runtime must behave** when implementing or debugging AdminV2, work units, drawers, queues, and configuration surfaces.

## Active documents (July 2026)

| Topic | Doc |
|-------|-----|
| AdminV2 reveal / performance | `adminv2-runtime-performance-doctrine.md` |
| Platform performance | `platform-performance-doctrine.md` |
| Work unit layout V3 | `work-unit-layout-doctrine.md` |
| Work unit surface context | `work-unit-surface-context-contract.md` |
| Queue record row | `queue-record-doctrine.md` |
| Drawer contracts | `drawer-doctrine.md`, `drawer-operating-model-v1.md`, `drawer-view-model-runtime-contract.md` |
| Routing | `routing-doctrine.md` |
| BOS identity | `bos-identity-doctrine.md` |
| Configuration runtime | `configuration-runtime-v1.md`, `configuration-mode-doctrine.md`, `configuration-runtime-design-alignment.md`, `configuration-ownership-doctrine.md`, `configuration-workspace-v1-doctrine.md` |
| Operating plan | `operating-plan-runtime-doctrine.md` |
| Typography / atmosphere | `typography-and-presentation-doctrine.md`, `workspace-atmosphere-doctrine.md` |
| Field convergence | `field-model-convergence-doctrine.md` |
| Legacy inventory | `legacy-architecture-inventory.md` |

## Archived duplicates

Pure duplicates of `platform/` owners were moved to `docs/archive/2026-06-superseded-system/` during Documentation Rebaseline V2.

## Related

- Navigation hub: `../README.md`
- Governance: `../platform/governance/documentation-governance.md`
