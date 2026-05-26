# Alloy documentation (active)

**Purpose:** Single compact source of truth for Cursor, GPT, and engineers. Prefer these files over chat memory or archived material under `docs/archive/`.

For any merge that changes behavior, include `docs/execution/operating-doctrine.md` in context.

## Source pack (markdown + Supabase reference)

- **Active markdown:** **18** files (this README plus **17** topic files — includes **`product/bos-foundation.md`** and **`product/ai-system.md`** redirect stub). Limits and growth rules are in `docs/execution/operating-doctrine.md`.
- **Supabase reference CSVs:** **8** generated files under `docs/supabase/reference/` — **do not edit by hand**; regenerate with `npm run export:supabase-schema` and `DATABASE_URL`.
- **Total GPT/Cursor stack:** target **25 or fewer** files — **currently 18 + 8 = 26** (one over cap due to `ai-system.md` stub; consolidate when links are migrated).

### Active topic files (17)

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
8. **`system/configuration-system.md`** — Config vs code/workflows; **Admin Settings four-plane control plane** (Fields, Field grouping, Layouts, Actions). Closeout detail: **`docs/sprints/05_2026/settings_control_plane_closeout.md`**.
9. **`system/api-contracts.md`** — Representative admin/public API boundaries.

**Product (load when touching that area):**

- `product/crm-system.md` — Opportunities, CRM, scheduling, **CRM go-live** definition and gap themes.
- `product/communications.md` — Threads, canonical enqueue, worker delivery, webhooks, provider bindings (lead loop + workflows).
- `product/documents-and-forms.md` — Document upload + **forms engine** (definitions, submissions, packets); long-term forms vision; **Enrollment Packet Phase 1 shipped**; **Phase 2 review MVP (P2-1–P2-4) partially shipped ~2026-05-21**.
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
- **Settings control plane closeout (May 2026):** **`docs/sprints/05_2026/settings_control_plane_closeout.md`** — completed Layouts composition UX, Action buttons (create/edit placements), and Status vs workflow ownership. Canonical supplement to **`docs/system/configuration-system.md`** § four-plane model.
- **Settings + Record UX Parity (May 2026):** **`docs/sprints/05_2026/settings_record_ux_parity_sprint.md`** §12–§13 — four-plane V1 shipped **2026-05-18**.
- **AdminV2 performance closeout (May 2026):** **`docs/sprints/05_2026/adminv2_performance_closeout.md`** — reveal gates, WU bootstrap, drawer pipeline, route-owned queue selection; broad speed sprint **paused**.
- **Work unit runtime consolidation audit (May 2026):** **`docs/sprints/05_2026/work_unit_runtime_consolidation_audit.md`** — audit only; design/implementation not started.
- **Forms Phase 2 review MVP:** **`docs/sprints/05_2026/forms_documents_phase_2_packet_review_mvp.md`** — P2-1–P2-5 shipped; operational UX in **`forms_documents_operational_experience_hardening.md`** (canonical BOS interaction doctrine); operational visual system in **`forms_documents_product_experience_refresh.md`** (**PX-0** audit/doctrine, **PX-1** tokens, **PX-2** surfaces shipped); workspace redesign in **`forms_operational_workspace_redesign.md`** (**OW-0** plan, **OW-1** shell, **OW-2** intake hub shipped).
- **Layout + field behavior semantics v1 (May 2026):** **`docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`** — Phase 1 **complete/paused**; `field_placements_v1`, effective policy resolution, opportunity drawer GET/PATCH, layout integrity, Settings split (Layouts = behavior, Fields = structure).
- **Layout + field behavior semantics Phase 2 (backlog):** **`docs/sprints/05_2026/layout_field_behavior_semantics_phase_2.md`** — deferred enhancements only (header grid, built-in sections, placement table, multi-surface, forms/workflows reuse).
- **Supplementary audits** (not counted in the active markdown cap unless you explicitly load them): `docs/audits/` — e.g. **`supabase-schema-alignment-audit.md`**, **`workflow-rbac-alignment-audit.md`**, **`legacy-messages-retirement-plan.md`**, person vs contact, event integrity, workflow consistency, Admin V2 hardening.

## When this README must be updated

Load order changes, source-pack totals change, new topic file approved, consolidation moves, or archive path changes.
