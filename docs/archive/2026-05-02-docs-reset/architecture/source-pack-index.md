# AI / project source pack index

**Purpose:** Minimal set of files to load into GPT (or similar) project context for **foundation work**. Paths are repo-relative from `docs/`.

## Tier 1 — Canonical doctrine (load always)

| File | Role |
|------|------|
| `architecture/README.md` | Hub: what is canonical vs not. |
| `architecture/glossary.md` | **Terminology lock** — shared vocabulary. |
| `architecture/record-rendering-system-spec.md` | RRS / resolver / payload / edit ownership. |
| `architecture/relationship-and-identity-doctrine.md` | Persons-first, layered relationships, contacts sunset direction. |
| `architecture/overview-layout-doctrine.md` | Overview = structured summary, templates, no page builder. |
| `architecture/workspace-work-unit-scope-doctrine.md` | Record vs work unit vs queue vs drawer; org/location/department. |
| `architecture/deferred-decisions.md` | **Explicit deferrals** — avoids re-litigating scope. |
| `architecture/implementation-gap-audit.md` | Doctrine vs current DB/code — **living** gap list. |
| `architecture/configuration-doctrine.md` | Config vs fixed behavior; safe vs system-controlled. |
| `architecture/config-model-spec.md` | Config entities, DB vs code, inventory audit. |
| `architecture/config-surfaces-spec.md` | Settings IA target; how config affects layers. |
| `architecture/config-api-contract.md` | Read/write/API patterns; future AI contract. |
| `architecture/ai-agent-foundation.md` | **AI Agent Foundation** — agent doctrine, capability map, boundaries, API interaction, safety/audit (contracts only). |
| `architecture/ai-agent-system-contract.md` | **AI agent system contract** — `AgentIdentity`, chat/intent/proposal types, Phase 1 intent taxonomy, validation layers, governance events vs business events. |

## Tier 2 — Implementation bridge (load for Track A)

| File | Role |
|------|------|
| `implementation/foundation-implementation-plan.md` | **Track A** ordering, thin slice, risks. |
| `implementation/ai-agent-implementation-slice-v0.md` | **AI agent v0 slice** — `update_queue_definition` only: envelopes, validation, audit, build order (implementation bridge). |
| `README.md` | Top-level doc map (folders, canonical vs audits). |

## Tier 3 — Schema & domain reference (load when touching DB or entities)

| File | Role |
|------|------|
| `audits/schema-reference-guide.md` | **Where schema truth lives** — pointers, not full DDL. |
| `implementation/HIERARCHY_SCHEMA_V1.md` | Departments / work_units / `jobs.work_unit_id` notes. |
| `audits/IDENTITY_MODEL_REFACTOR_AUDIT.md` | Contact/person touchpoints in code (inventory). |
| `audits/DOMAIN_MODEL.md` or `audits/ENTITY_MODEL.md` | Conceptual entity graph (legacy language may say “contact” — cross-check glossary). |

## Tier 4 — Optional context (load if task-specific)

| File | When |
|------|------|
| `implementation/workspace-v2/README.md` | Hub for **Workspace V2** implementation (visual context, lanes, Needs Attention). |
| `implementation/workspace-v2/VISUAL_CONTEXT_SYSTEM.md` | Resolver, semantic keys, Alloy palette, layers. |
| `implementation/workspace-v2/WORKSPACE_SYSTEM.md` | Routes, hierarchy, queue modes. |
| `implementation/workspace-v2/NEEDS_ATTENTION_WORK_UNIT.md` | Exception types, data flow, actions. |
| `implementation/workspace-v2/API_CONTRACTS.md` | Job list/schedules query params, `?exception=`, job row shapes. |
| `implementation/ARCHITECTURE.md` | Next.js / Supabase / major flows. |
| `implementation/SYSTEM_STRUCTURE_V1.md` | Admin IA + hierarchy narrative. |
| `implementation/UI_V2_Workspace_System_Spec.md` | Block/level UI companion — **subordinate** to architecture/*. |
| `audits/ADMIN_API_ORG_SCOPING_AUDIT_V1.md` | Admin API security / org scoping remediation history. |
| `supabase/baselines/prod_baseline.sql` | **Full DDL** — large; use grep or `schema-reference-guide` first. |

## Do not load as canonical

- `archive/*` — historical unless debugging a specific old deliverable.
- Deliverables and campaign one-offs in `archive/`.

**Practical bundle (~10 files):** Tier 1 + `foundation-implementation-plan.md` + `schema-reference-guide.md` + root `README.md`.
