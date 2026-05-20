# Glossary

## Purpose

Shared vocabulary for Alloy docs and AI context so terms are not overloaded.

## Current state

Terms reflect **as-built** usage in `web/` and Supabase schema names.

## How it works

Use these meanings in code review and prompts.

| Term | Meaning |
|------|---------|
| **Org / tenant** | Row scoping via `org_id` (or equivalent FK closure). Users belong to orgs through org membership roles. |
| **Entity** | A first-class business record type: customer, opportunity, job, schedule, person, payment, etc. |
| **Person** | Row in `persons` — **canonical** human identity for the forward path. |
| **Customer person** | Row in `customer_persons` — **canonical** link of a `person` to a `customer` with `role_type` (and optional primary flag). |
| **Contact** | Legacy/compatibility person-like record (`contacts`); required for some messaging/workflows/documents/vendor paths — **not** canonical CRM identity. |
| **Customer** | Account/household/business shell (`customers`) people attach to. |
| **Opportunity** | CRM pipeline record (`opportunities`), often tied to `customer_id`, `work_unit_id`, and person/contact FKs depending on age of row. |
| **Event** | Stored business fact in `workflow_events` (append-oriented), driving workflows. |
| **Workflow** | DB-defined automation triggered by `event_type` + `entity_type`, executed in `workflowRun.ts`. |
| **Action (admin)** | Declarative admin operation handled by `executeAdminAction` (may start workflow, update entity, etc.). |
| **Action link** | Tokenized link consumed via API → emits event → workflows (e.g. cancel/reschedule). |
| **RRS / resolver** | Record resolution system (e.g. `web/lib/rrs/`) producing **flat** payload for jobs and selected entities. |
| **Queue / queue definition** | Work-unit-level JSON (`queue_definition`, v1 schema) interpreted by `QueueService` for preview lists. |
| **Work unit** | Scoped workspace unit under a department; carries queue config and operational ownership. |
| **Department** | Grouping of work units for Admin V2 workspace navigation. |
| **Role key** | String on **`user_roles.role`** matching **`role_definitions.role_key`** — membership in an **org role**, one of several inputs to capability checks. |
| **Permission key** | String granted via **`role_permission_grants`** (unioned into runtime **`permissionKeys`**) — preferred gate for **capabilities**. |
| **Access profile (CRM)** | Row in **`user_access_profiles`**: per `(user_id, org_id)`, declares **`department_scope`** and **`site_scope`** (`all` or `restricted`). **Visibility**, separate from **permission** union. |
| **Department scope** | **`all`** = every department in the org; **`restricted`** + **`user_department_access`** = explicit department allow list. Unknown / unlinked department on a scoped record ⇒ **deny** for restricted users (enforced on CRM admin reads/mutations that carry `work_unit_id` / department resolution). |
| **Site scope** | **`all`** = every site in the org; **`restricted`** + **`user_site_access`** = explicit allow list of **`locations`** where **`location_type = 'site'`**. Unknown or non-site location on a scoped record ⇒ **deny** for restricted users (enforced on CRM admin routes using location linkage). |
| **Communication thread (canonical)** | Row in **`communication_threads`**: org + primary entity + channel + `recipient_key` (see `canonicalOutboundEnqueue.ts`). |
| **Communication message (canonical)** | Row in **`communication_messages`**: inbound/outbound message in a thread; outbound enqueue sets `status: queued` and may emit **`message_queued`**. |
| **Legacy message / outbox** | **`public.messages`**, **`messages_outbox`** — still produced by workflow **`send_message`** paths; distinguish from canonical **`communication_*`** tables. |
| **Config** | Org or global settings that steer labels, statuses, layouts, and queue shape — within platform validation. |
| **BOS** | **Business Orchestration System** — Alloy’s unified orchestration intelligence layer (routing, proposals, assist); not a parallel platform. See **`docs/product/bos-foundation.md`**. |
| **BOS capability** | Registered assist function with stable `capability_key` in `web/lib/bos/bosCapabilityRegistry.ts` (e.g. `task_assist`, `config_layout_assist`). |
| **Orchestrator** | BOS capability `orchestrator` — AdminV2 command bar; parses intent, routes to specialists; **does not** execute side effects. Thread state in **`GlobalAssistantContext`** with tab-session **`sessionStorage`** restore (client-only after mount — see **`agent_interaction_layer_v1.md`**). |
| **Task Assist** | BOS capability `task_assist` — one-off comms drafts, scheduled sends, operational tasks — **propose → human approve → apply**. |
| **Workflow Assist** | BOS capability `workflow_assist` — workflow read/explain and gated propose/apply — default path **deterministic**. |
| **Config / Layout Assist** | BOS capability `config_layout_assist` — `ConfigurationProposalV1` on **`config_layout_assist_proposals`**. |
| **Placement priority** | Opt-in waitlist ordering layer (`placement_priority_v1` metadata) producing queue **`_placement_priority`** previews — not global waitlist truth. |
| **AI policy** | Org setting in **`org_settings.metadata.ai_policy`** — feature allow list, provider (`stub` / `openai`), logging mode; complements RBAC permission keys. |

## Source of truth / key files

- Schema: `supabase/migrations/`, `prod_baseline.sql` (or baselines under `supabase/baselines/`)
- Queue schema: `web/lib/config/queueDefinitionSchema.ts`
- BOS registry: `web/lib/bos/bosCapabilityRegistry.ts`

## Guardrails

Do not redefine **Person** as **Contact** in new specs. Do not call queue rows **records** in the same sense as resolver output. For CRM and booking flows, **`primary_person_id` wins over `primary_contact_id`** in new application logic **when populated**. **`contacts`** remain allowed only as **compatibility** surfaces until retired from schema UI/API per roadmap.

## Known gaps / risks

- **Needs verification:** Exact deprecation timeline for **`contacts`** vs read-only compatibility window (see `docs/audits/person-vs-contact-audit.md`).

## When this doc must be updated

When new entity types or canonical names are introduced, or when `contacts` are fully retired from schema and UI.
