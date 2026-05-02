# Alloy documentation (active)

**Purpose:** Single compact source of truth for Cursor, GPT, and engineers. Prefer these files over chat memory or archived material under `docs/archive/`.

For any merge that changes behavior, include `docs/execution/operating-doctrine.md` in context.

## Source pack (markdown + Supabase reference)

- **Active markdown:** **15** files (this README plus **14** topic files). Cap: **15** `.md` unless intentionally approved (`docs/execution/operating-doctrine.md`).
- **Supabase reference CSVs:** **8** generated files under `docs/supabase/reference/` — **do not edit by hand**; regenerate with `npm run export:supabase-schema` and `DATABASE_URL`.
- **Total GPT/Cursor stack:** target **25 or fewer** files — **currently 15 + 8 = 23**.

## Load order for AI / onboarding

1. **`core/system-overview.md`** — Multi-tenant model, event/workflow spine, org scope, principles (including person vs contact).
2. **`core/glossary.md`** — Shared vocabulary.
3. **`system/entity-model.md`** — Tables and identity (persons, customer_persons, customers, opportunities, etc.).
4. **`system/actions-and-workflows.md`** — Events, workflows, admin actions; do not bypass.
5. **`system/record-system.md`** — Resolver-backed records (RRS), drawer/API truth vs previews.
6. **`system/workspace-system.md`** — Departments, work units, queues, Admin V2 workspace.
7. **`system/configuration-system.md`** — What config may steer vs what must stay in code/workflows.
8. **`system/api-contracts.md`** — Representative admin/public API boundaries.

**Product (load when touching that area):**

- `product/crm-system.md` — Opportunities, CRM, communications in the lead loop, scheduling (CRM/tour focus).
- `product/documents-and-forms.md`
- `product/billing-and-financials.md`
- `product/ai-system.md`

**Execution / change management:**

- `execution/operating-doctrine.md` — Documentation + source-pack rules, deploy/tenancy, performance, production guardrails; **read before merging** behavior changes.
- `execution/roadmap-and-gaps.md` — Roadmap buckets, confirmed gaps, verification debt, suggested sprint cards.

**Schema reference (when touching DB / RLS / triggers):**

- `docs/supabase/reference/supabase_schema_columns.csv`
- `docs/supabase/reference/supabase_constraints.csv`
- `docs/supabase/reference/supabase_indexes.csv`
- `docs/supabase/reference/supabase_rls_policies.csv`
- `docs/supabase/reference/supabase_triggers.csv`
- `docs/supabase/reference/supabase_functions.csv`
- `docs/supabase/reference/supabase_tables.csv`
- `docs/supabase/reference/supabase_views.csv`

## Archive and sprints

- **Archived docs (2026-05-02 reset):** `docs/archive/2026-05-02-docs-reset/` (prior `architecture/`, `audits/`, `implementation/`, `specs/`, root `README`, and former `archive/` shard).
- **Sprints:** `docs/sprints/` — intentionally **not** moved.

## When this README must be updated

Load order changes, source-pack totals change, new topic file approved, or archive path changes.
