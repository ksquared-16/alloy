# Alloy documentation (active)

**Purpose:** Single compact source of truth for Cursor, GPT, and engineers. Prefer these files over chat memory or archived material under `docs/archive/`.  

For any merge that changes behavior, include `docs/execution/operating-doctrine.md` in context.

**June 2026 re-baseline:** Platform freeze documented in **`system/repository-state-2026-06.md`**. Superseded assumptions indexed in **`archive/2026-06-freeze/README.md`**.

## Source pack (markdown + Supabase reference)

- **Active markdown:** topic files below plus this README.
- **Supabase reference CSVs:** **8** generated files under `docs/supabase/reference/` — **do not edit by hand**; regenerate with `npm run export:supabase-schema` and `DATABASE_URL`.

### Core topic files

| Folder | Files |
|--------|-------|
| `core/` | `system-overview.md`, `glossary.md` |
| `system/` | `entity-model.md`, `actions-and-workflows.md`, `record-system.md`, `workspace-system.md`, `queue-record-doctrine.md`, `typography-and-presentation-doctrine.md`, `roles-and-permissions.md`, `configuration-system.md`, `api-contracts.md`, **`adminv2-runtime-performance-doctrine.md`** (locked implementation) |
| `product/` | `crm-system.md`, `communications.md`, `documents-and-forms.md`, `billing-and-financials.md`, `bos-foundation.md`, `ai-system.md` (stub) |
| `execution/` | `operating-doctrine.md`, `roadmap-and-gaps.md` |

### Canonical doctrine (June 2026 — single source of truth)

| Topic | Doc |
|-------|-----|
| **Routing** | **`system/routing-doctrine.md`** |
| **Navigation** | **`system/navigation-doctrine.md`** |
| **Drawers** | **`system/drawer-doctrine.md`** (+ detail: `drawer-operating-model-v1.md`, `drawer-view-model-runtime-contract.md`) |
| **Work unit layout** | **`system/work-unit-layout-doctrine.md`** |
| **Performance** | **`system/platform-performance-doctrine.md`** (+ locked gates: `adminv2-runtime-performance-doctrine.md`) |
| **Lifecycle model** | **`navigation-doctrine.md`**, **`workspace-system.md`**, **`product/crm-system.md`** |
| **Legacy classification** | **`system/legacy-architecture-inventory.md`** |
| **Platform snapshot** | **`system/repository-state-2026-06.md`** |

Do **not** duplicate these topics in new active docs — link instead.

## Load order for AI / onboarding

1. **`core/system-overview.md`** — Multi-tenant model, event/workflow spine, lifecycle-first workspace.
2. **`core/glossary.md`** — Shared vocabulary.
3. **`system/repository-state-2026-06.md`** — Current platform snapshot (June 2026).
4. **`system/routing-doctrine.md`** + **`system/navigation-doctrine.md`** — URLs and operator navigation.
5. **`system/entity-model.md`** — Tables and identity.
6. **`system/actions-and-workflows.md`** — Events, workflows, admin actions.
7. **`system/record-system.md`** — Resolver-backed records, drawer/API truth vs previews.
8. **`system/workspace-system.md`** — Lifecycles, work units, queues. **Work-unit page layout:** **`system/work-unit-layout-doctrine.md`**. **Queue row contract:** **`system/queue-record-doctrine.md`**. **Presentation:** **`system/typography-and-presentation-doctrine.md`**.
9. **`system/drawer-doctrine.md`** — Drawer ownership, VM, warm navigation.
10. **`system/platform-performance-doctrine.md`** — Performance passes and principles. **Locked gates:** **`system/adminv2-runtime-performance-doctrine.md`**.
11. **`system/roles-and-permissions.md`** — Capabilities vs visibility.
12. **`system/configuration-system.md`** — Config vs code/workflows; Admin Settings four-plane model.
13. **`system/legacy-architecture-inventory.md`** — Canonical vs transitional vs legacy.
14. **`system/api-contracts.md`** — Representative admin/public API boundaries.

**Product (load when touching that area):**

- `product/crm-system.md` — Opportunities, lifecycle ownership, scheduling.
- `product/communications.md` — Threads, canonical enqueue, webhooks.
- `product/documents-and-forms.md` — Forms engine, packets.
- `product/billing-and-financials.md`
- `product/bos-foundation.md` — BOS capabilities; human-in-the-loop only.
- `product/ai-system.md` — Stub redirect to `bos-foundation.md`.

**Execution / change management:**

- `execution/operating-doctrine.md` — Documentation rules, deploy guardrails.
- `execution/roadmap-and-gaps.md` — Sequencing and verification debt.

**Schema reference (when touching DB / RLS / triggers):**

- `docs/supabase/reference/*.csv` (8 files)

## Archive and sprints

- **June 2026 freeze index:** `docs/archive/2026-06-freeze/README.md` — superseded assumptions.
- **Prior reset:** `docs/archive/2026-05-02-docs-reset/`
- **Sprints:** `docs/sprints/` — execution history; **not** canonical doctrine when a system doc exists. **Shipped index:** `docs/sprints/COMPLETED_SPRINTS_SUMMARY.md`. **Export packs:** `docs/export/` — **`comms-messaging-handoff-pack`**, **`forms-handoff-pack`** (portable doc bundles + zip).

## When this README must be updated

Load order changes, new canonical doctrine files, consolidation moves, or archive path changes.
