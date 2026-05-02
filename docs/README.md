# Alloy documentation (active)

**Purpose:** Single compact source of truth for Cursor, GPT, and engineers. Prefer these files over chat memory or archived material under `docs/archive/`.

## Load order for AI / onboarding

1. **`core/system-overview.md`** — Multi-tenant model, event/workflow spine, org scope, principles (including person vs contact).
2. **`core/glossary.md`** — Shared vocabulary.
3. **`system/entity-model.md`** — Tables and identity (persons, customer_persons, customers, opportunities, etc.).
4. **`system/actions-and-workflows.md`** — Events, workflows, admin actions; do not bypass.
5. **`system/record-system.md`** — Resolver-backed records (RRS), drawer/API truth vs previews.
6. **`system/workspace-system.md`** — Departments, work units, queues, Admin V2 workspace.
7. **`system/configuration-system.md`** — What config may steer vs what must stay in code/workflows.
8. **`system/api-contracts.md`** — Representative admin/public API boundaries.

**Product verticals (load when touching that area):**

- `product/crm-system.md`
- `product/communications.md`
- `product/documents-and-forms.md`
- `product/scheduling.md`
- `product/billing-and-financials.md`
- `product/ai-system.md`

**Execution / change management:**

- `execution/documentation-doctrine.md` — **Read before merging** behavior changes.
- `execution/known-gaps.md` — Confirmed unknowns and verification debt.
- `execution/roadmap.md` — Working roadmap buckets.
- `execution/deployment-and-tenancy.md` — Deploy, tenancy, env, performance notes.

## Archive and sprints

- **Archived docs (2026-05-02 reset):** `docs/archive/2026-05-02-docs-reset/` (prior `architecture/`, `audits/`, `implementation/`, `specs/`, root `README`, and former `archive/` shard).
- **Sprints:** `docs/sprints/` — intentionally **not** moved.

## File count

**19** total `.md` files: this README plus **18** topic files in `core/`, `system/`, `product/`, and `execution/`. Principles live in **`core/system-overview.md`**; workspace/client perf notes live in **`execution/deployment-and-tenancy.md`** (replaces a separate `principles.md` / `performance.md` to stay under twenty files).

## When this README must be updated

When the load order changes, a new top-level doc is added (should be rare per doctrine), or the archive date / structure changes.
