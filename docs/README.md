# Alloy documentation (active)

**Purpose:** Single compact source of truth for Cursor, GPT, and engineers. Prefer these files over chat memory or archived material under `docs/archive/`.  

For any merge that changes behavior, include `docs/execution/operating-doctrine.md` in context.

## Source pack (markdown + Supabase reference)

- **Active markdown:** **19** files (this README plus **18** topic files — includes **`product/bos-foundation.md`**, **`product/ai-system.md`** redirect stub, and **`system/adminv2-runtime-performance-doctrine.md`**). Limits and growth rules are in `docs/execution/operating-doctrine.md`.
- **Supabase reference CSVs:** **8** generated files under `docs/supabase/reference/` — **do not edit by hand**; regenerate with `npm run export:supabase-schema` and `DATABASE_URL`.
- **Total GPT/Cursor stack:** target **25 or fewer** files — **currently 19 + 8 = 27** (over cap — **`adminv2-runtime-performance-doctrine.md`** added June 2026 as locked infrastructure doc; consolidate when links migrate).

### Active topic files (18)

| Folder       | Files                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/`      | `system-overview.md`, `glossary.md`                                                                                                                                                                                |
| `system/`    | `entity-model.md`, `actions-and-workflows.md`, `record-system.md`, `workspace-system.md`, **`queue-record-doctrine.md`**, `roles-and-permissions.md`, `configuration-system.md`, `api-contracts.md`, **`adminv2-runtime-performance-doctrine.md`** |
| `product/`   | `crm-system.md`, `communications.md`, `documents-and-forms.md`, `billing-and-financials.md`, `bos-foundation.md`, `ai-system.md` (stub)                                                                            |
| `execution/` | `operating-doctrine.md`, `roadmap-and-gaps.md`                                                                                                                                                                     |

**Consolidated (May 2026):** Former `execution/admin-settings-config-parity.md`, `execution/crm-opportunity-needs-attention-count-semantics.md`, `execution/crm-go-live-gap-analysis.md`, and `strategy/*` were merged into `system/configuration-system.md`, `system/workspace-system.md`, and `product/crm-system.md` / `documents-and-forms.md` to stay within the 16-topic cap. Historical copies may exist under `docs/archive/` if exported.

## Load order for AI / onboarding

1. **`core/system-overview.md`** — Multi-tenant model, event/workflow spine, org scope, principles (including person vs contact).
2. **`core/glossary.md`** — Shared vocabulary.
3. **`system/entity-model.md`** — Tables and identity (persons, customer_persons, customers, opportunities, etc.).
4. **`system/actions-and-workflows.md`** — Events, workflows, admin actions; do not bypass.
5. **`system/record-system.md`** — Resolver-backed records (RRS), drawer/API truth vs previews.
6. **`system/workspace-system.md`** — Departments, work units, queues, Admin V2 workspace; needs-attention count semantics. **Queue row contract (locked):** **`system/queue-record-doctrine.md`**. **Runtime performance doctrine (locked):** **`system/adminv2-runtime-performance-doctrine.md`**.
7. **`system/roles-and-permissions.md`** — Capabilities (`role_permission_grants`) vs visibility (`user_access_profiles`); API enforcement.
8. **`system/configuration-system.md`** — Config vs code/workflows; **Admin Settings four-plane control plane** (Fields, Field grouping, Layouts, Actions). Closeout detail: **`docs/sprints/05_2026/completed/settings_control_plane_closeout.md`**.
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
- **BOS operational assist closeout (May 2026):** **`docs/sprints/06_2026/completed/bos_assist_routing_communication_drafting_closeout.md`** — assist routing, communication draft synthesis, channel-aware SMS/email, Review Assist + drawer stability. **Forward planning:** **`docs/sprints/future/bos_operational_assist_phase2.md`** (not implemented).
- **Lifecycle runtime & configuration alignment (May 2026):** **`docs/sprints/06_2026/lifecycle_runtime_configuration_alignment_sprint.md`** — waitlist activation, action placement gating, NA bucket seed, **Settings → Enrollment lifecycle → `/adminV2/settings/lifecycle`**, UX review. **Runtime matrix:** **`docs/sprints/06_2026/lifecycle_runtime_alignment_matrix_v1.md`**. **Walkthrough:** **`docs/sprints/06_2026/lifecycle_walkthrough_validation_v1.md`**. Follows closed Lifecycle Configuration & Requirement Engine sprint (`lifecycle_sprint_final_coverage_closeout_audit_v1.md`).
- **Settings control plane closeout (May 2026):** **`docs/sprints/05_2026/completed/settings_control_plane_closeout.md`** — completed Layouts composition UX, Action buttons (create/edit placements), and Status vs workflow ownership. Canonical supplement to **`docs/system/configuration-system.md`** § four-plane model.
- **Settings + Record UX Parity (May 2026):** **`docs/sprints/05_2026/settings_record_ux_parity_sprint.md`** §12–§13 — four-plane V1 shipped **2026-05-18**.
- **AdminV2 performance closeout (May 2026):** **`docs/sprints/05_2026/completed/adminv2_performance_closeout.md`** — reveal gates, WU bootstrap, drawer pipeline, route-owned queue selection; broad speed sprint **paused**.
- **AdminV2 runtime performance doctrine (June 2026 — locked):** **`docs/system/adminv2-runtime-performance-doctrine.md`** · closeout **`docs/sprints/06_2026/completed/adminv2_runtime_performance_consistency_closeout.md`** · next phase **`docs/sprints/06_2026/adminv2_backend_query_payload_optimization_phase.md`**. Cursor rule: **`.cursor/rules/adminv2-runtime-performance.mdc`**.
- **Waitlist priority fact truth + child scope (May 2026):** **`docs/sprints/05_2026/waitlist_priority_fact_truth_child_scope.md`** — Card 0 audit; Card 1 OCM site/cohort + `persons` employee fields + record-sourced household priority facts.
- **Waitlist ranking validation + position controls (May 2026):** **`docs/sprints/05_2026/waitlist_ranking_validation_position_controls.md`** — runtime position display, exact manual adjustment, config-aware ranking QA, pilot shadow toggle.
- **Waitlist Ranking Policy settings V2 (May 2026):** **`docs/sprints/05_2026/waitlist_ranking_policy_settings_v2.md`** — operator-facing priority factors UI; reuses `priority_rule_order` / `priority_rule_enabled_keys` / `shadow_mode`. **Work unit filter + V2 factor defaults + source mapping (May 2026):** eligible WU filter, `childcare_enrollment_waitlist_v2` defaults, factor source lines.
- **Child lifecycle + work-unit convergence closeout (May 2026):** **`docs/sprints/05_2026/completed/child_lifecycle_work_unit_convergence_closeout.md`** — case vs child grain, `enrollment_pipeline` v2 domains, candidate waitlist + child enrollment runtime, client-side WU filters, strict-mode readiness (activation deferred). Canonical supplements: **`workspace-system.md`**, **`crm-system.md`**, **`glossary.md`**.
- **Work unit runtime consolidation audit (May 2026):** **`docs/sprints/05_2026/work_unit_runtime_consolidation_audit.md`** — historical audit; implementation delivered via child-lifecycle closeout.
- **Forms intelligence + document infrastructure (May 2026):** **`docs/sprints/05_2026/forms_intelligence_document_infrastructure.md`** — **FD-1–FD-14** shipped. Intake runtime validation closeout: **`docs/sprints/05_2026/completed/forms_intake_runtime_validation_closeout.md`**.
- **May 2026 month-end closeout:** Child lifecycle + WU convergence, waitlist pilot readiness, tour Band A, forms MVP, global search, lifecycle action alignment — see **`docs/sprints/README.md`** and **`docs/execution/roadmap-and-gaps.md`** (snapshot **2026-05-31**).
- **Active June 2026:** **`docs/sprints/06_2026/`** — **Lifecycle Builder (primary board):** **`lifecycle_builder_activation_consolidation.md`** · **`lifecycle_activation_runtime_truth_polish.md`** · **`lifecycle_activation_path_validation.md`** · stabilization: **`lifecycle_builder_stabilization_pass.md`** · Lifecycle hub: `/adminV2/settings/lifecycle` · field rules QA: **`lifecycle_field_rules_qa_proof_v1.md`**. **Forms lifecycle requirement coverage (June 2026 — closed):** **`docs/sprints/06_2026/completed/forms_lifecycle_requirement_coverage.md`** — Cards 0–6: contract adapter, coverage mapper, Form Detail panel, share gating, runtime validation.
- **Forms MVP productization closeout (May 2026):** **`docs/sprints/05_2026/completed/forms_mvp_productization.md`** — Cards 0–6: operational intent templates, simplified Form Detail setup, existing-record send/attach, packet/embed/share UX, inline field tokens (FD-15), MVP QA. Inline tokens: UI/review resolution only; PDF output is future phase.
- **Layout + field behavior semantics v1 (May 2026):** **`docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`** — Phase 1 **complete/paused**; `field_placements_v1`, effective policy resolution, opportunity drawer GET/PATCH, layout integrity, Settings split (Layouts = behavior, Fields = structure).
- **Layout + field behavior semantics Phase 2 (backlog):** **`docs/sprints/05_2026/layout_field_behavior_semantics_phase_2.md`** — deferred enhancements only (header grid, built-in sections, placement table, multi-surface, forms/workflows reuse).
- **Lifecycle configuration & requirements (May 2026):** **`docs/sprints/05_2026/lifecycle_configuration_requirements_design_package_v1.md`** — unified model for requirements, actions, transitions, workflows, BOS, and Settings. **Runtime shipped:** action preflight + `ActionPreflightBlockedPanel` for lifecycle execute keys. **Lifecycle information matrix (May 2026):** **`docs/sprints/05_2026/lifecycle_information_matrix_v1.md`**. **Pass B — Person convergence:** **`docs/sprints/05_2026/pass_b_person_convergence_v1.md`**. **Sprint closeout audit:** **`docs/sprints/05_2026/lifecycle_sprint_final_coverage_closeout_audit_v1.md`** (coverage, action inventory, backlog, Settings readiness). **Task system audit:** **`docs/sprints/05_2026/task_system_audit_v1.md`**. **AdminV2 action runtime audit:** **`docs/sprints/05_2026/adminv2_action_runtime_audit_and_plan_v1.md`**. Builds on **`lifecycle_closeout.md`**, **`childcare_lifecycle_matrix_v1.md`**, canonical action catalog.
- **Supplementary audits** (not counted in the active markdown cap unless you explicitly load them): `docs/audits/` — e.g. **`supabase-schema-alignment-audit.md`**, **`workflow-rbac-alignment-audit.md`**, **`legacy-messages-retirement-plan.md`**, person vs contact, event integrity, workflow consistency, Admin V2 hardening.

## When this README must be updated

Load order changes, source-pack totals change, new topic file approved, consolidation moves, or archive path changes.
