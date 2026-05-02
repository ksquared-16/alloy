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
| **Person** | Row in `persons` — canonical human identity for the forward path. |
| **Customer person** | Row in `customer_persons` — link of a `person` to a `customer` with `role_type` (and optional primary flag). |
| **Contact** | Legacy/compatibility person-like record; still present in APIs and `AdminEntityDrawer` — **not** the target canonical model. |
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
| **Config** | Org or global settings that steer labels, statuses, layouts, and queue shape — within platform validation. |

## Source of truth / key files

- Schema: `supabase/migrations/`, `prod_baseline.sql` (or baselines under `supabase/baselines/`)
- Queue schema: `web/lib/config/queueDefinitionSchema.ts`

## Guardrails

Do not redefine **Person** as **Contact** in new specs. Do not call queue rows **records** in the same sense as resolver output.

## Known gaps / risks

- **Needs verification:** Exact deprecation timeline for **`contacts`** vs read-only compatibility window.

## When this doc must be updated

When new entity types or canonical names are introduced, or when `contacts` are fully retired from schema and UI.
