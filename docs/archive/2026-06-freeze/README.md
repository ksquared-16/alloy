# Documentation freeze — June 2026

**Date:** 2026-06-09  
**Purpose:** Archive pointer for assumptions superseded by the June 2026 re-baseline sprint.

## Superseded assumptions (do not use in new docs)

| Old assumption | Canonical replacement |
|----------------|----------------------|
| Department-first operator navigation | **`docs/archive/2026-06-superseded-system/navigation-doctrine.md`** — Lifecycle → Work Unit → Record |
| `/adminV2/workspace` as product URL | **`docs/system/routing-doctrine.md`** — `/workspace`, `/admin` |
| `/adminV2/settings` in product hrefs | `/admin/settings/*` (rewrites to filesystem) |
| Performance details only in sprint closeouts | **`docs/system/platform-performance-doctrine.md`** |
| Drawer ownership scattered across sprints | **`docs/system/drawer-doctrine.md`** |

## Historical sprint docs (retained, not doctrine)

Sprint folders under `docs/sprints/archive/06_2026/` remain execution history. For platform truth, prefer:

- `docs/system/repository-state-2026-06.md`
- `docs/system/legacy-architecture-inventory.md`
- Core + system topic files linked from `docs/README.md`

## Not archived (still active detail)

- `drawer-operating-model-v1.md` — shell/layout detail; indexed by `drawer-doctrine.md`
- `adminv2-runtime-performance-doctrine.md` — locked implementation gates; summarized in `platform-performance-doctrine.md`
- `drawer-view-model-runtime-contract.md` — VM compose contract
