# Alloy documentation (active)

**Purpose:** Single compact source of truth for Cursor, GPT, and engineers. Prefer these files over chat memory or archived material under `docs/archive/`.

For any merge that changes behavior, include `docs/execution/operating-doctrine.md` in context.

## Source pack (markdown + Supabase reference)

- **Active markdown:** **17** files (this README plus **16** topic files). Limits and growth rules are in `docs/execution/operating-doctrine.md`.
- **Supabase reference CSVs:** **8** generated files under `docs/supabase/reference/` — **do not edit by hand**; regenerate with `npm run export:supabase-schema` and `DATABASE_URL`.
- **Total GPT/Cursor stack:** target **25 or fewer** files — **currently 17 + 8 = 25**.

### Active topic files (16)

| Folder | Files |
|--------|-------|
| `core/` | `system-overview.md`, `glossary.md` |
| `system/` | `entity-model.md`, `actions-and-workflows.md`, `record-system.md`, `workspace-system.md`, `roles-and-permissions.md`, `configuration-system.md`, `api-contracts.md` |
| `product/` | `crm-system.md`, `communications.md`, `documents-and-forms.md`, `billing-and-financials.md`, `bos-foundation.md`, `ai-system.md` (stub) |
| `execution/` | `operating-doctrine.md`, `roadmap-and-gaps.md` |

**Consolidated (May 2026):** Former `execution/admin-settings-config-parity.md`, `execution/crm-opportunity-needs-attention-count-semantics.md`, `execution/crm-go-live-gap-analysis.md`, and `strategy/*` were merged into `system/configuration-system.md`, `system/workspace-system.md`, and `product/crm-system.md` / `documents-and-forms.md` to stay within the 16-topic cap. Historical copies may exist under `docs/archive/` if exported.

## Load order for AI / onboarding

1. **`core/system-overview.md`** — Multi-tenant model, event/workflow spine, org scope, principles (including person vs contact).
2. **`core/glossary.md`** — Shared vocabulary.
3. **`system/entity-model.md`** — Tables and identity (persons, customer_persons, customers, opportunities, etc.).
4. **`system/actions-and-workflows.md`** — Events, workflows, admin actions; do not bypass.
5. **`system/record-system.md`** — Resolver-backed records (RRS), drawer/API truth vs previews.
6. **`system/workspace-system.md`** — Departments, work units, queues, Admin V2 workspace; needs-attention count semantics.
7. **`system/roles-and-permissions.md`** — Capabilities (`role_permission_grants`) vs visibility (`user_access_profiles`); API enforcement.
8. **`system/configuration-system.md`** — Config vs code/workflows; **Admin Settings four-plane control plane** (Fields, Field grouping, Layouts, Actions).
9. **`system/api-contracts.md`** — Representative admin/public API boundaries.

**Product (load when touching that area):**

- `product/crm-system.md` — Opportunities, CRM, scheduling, **CRM go-live** definition and gap themes.
- `product/communications.md` — Threads, canonical enqueue, worker delivery, webhooks, provider bindings (lead loop + workflows).
- `product/documents-and-forms.md` — Document upload + **forms engine** (definitions, submissions, packets); long-term forms vision; **Enrollment Packet Phase 1 shipped**; Phase 2 **partially implemented**.
- `product/billing-and-financials.md`
- `product/bos-foundation.md` — **BOS** (orchestration intelligence layer): capabilities, lifecycle, safety doctrine, implementation inventory; **expansion paused** — human-in-the-loop only.
- `product/ai-system.md` — Stub redirect to `bos-foundation.md` (preserves legacy links).

**Execution / change management:**

- `execution/operating-doctrine.md` — Documentation + source-pack rules, deploy/tenancy, performance, production guardrails; **read before merging** behavior changes.
- `execution/roadmap-and-gaps.md` — **Operational completion** sequencing; AI pause framing; gaps and verification debt.

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
- **Sprints:** `docs/sprints/` — intentionally **not** moved; not counted in the 16-topic cap.
- **Supplementary audits** (not counted in the active markdown cap unless you explicitly load them): `docs/audits/` — e.g. **`supabase-schema-alignment-audit.md`**, **`workflow-rbac-alignment-audit.md`**, **`legacy-messages-retirement-plan.md`**, person vs contact, event integrity, workflow consistency, Admin V2 hardening.

## When this README must be updated

Load order changes, source-pack totals change, new topic file approved, consolidation moves, or archive path changes.
